const express = require('express');
const {updateSucStock} = require('./stock_helpers');
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol, permiteSucursal } = require('../middleware/auth');

// ── PENDIENTES ────────────────────────────────────────────────
const pendRouter = express.Router();
pendRouter.use(authMiddleware);

function enrichPend(p, db) {
  const sucs=db.all('sucursales'),clis=db.all('clientes'),vends=db.all('vendedores');
  const c=clis.find(x=>x.id===p.cliente_id), vd=vends.find(x=>x.id===p.vend_id);
  const sucEnt=sucs.find(s=>s.id===p.suc_entrega);
  return {...p,suc_nombre:(sucs.find(s=>s.id===p.suc_id)||{}).nombre||'—',suc_entrega_nombre:(sucEnt||{}).nombre||'',cli_nombre:c?c.nombre+' '+c.apellido:'—',cli_tel:c?.tel||'',vend_nombre:vd?vd.nombre+' '+vd.apellido:'—',dias_pendiente:Math.floor((new Date()-new Date(p.fecha))/(1000*60*60*24))};
}

pendRouter.get('/',(req,res)=>{
  const db = _getDB(req);
  const {estado,suc_id,cli_id,suc_entrega}=req.query;
  let rows=db.all('pendientes');
  if(estado) rows=rows.filter(p=>p.estado===estado);
  // Show pendientes from this suc (as cobro) OR destined to this suc (as entrega)
  if(suc_id) rows=rows.filter(p=>p.suc_id===suc_id || p.suc_entrega===suc_id);
  if(cli_id) rows=rows.filter(p=>p.cliente_id===cli_id);
  res.json(rows.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).map(p => enrichPend(p, db)));
});

pendRouter.get('/:id',(req,res)=>{
  const db = _getDB(req);
  const p=db.findOne('pendientes',req.params.id);
  if(!p) return res.status(404).json({error:'No encontrado'});
  const items=db.where('pendiente_items',i=>i.pendiente_id===req.params.id);
  res.json({...enrichPend(p, db),items});
});

pendRouter.post('/',(req,res)=>{
  const db = _getDB(req);
  const {suc_id,vend_id,cliente_id,items,total,notas,concepto,venta_id,fecha_entrega_estimada,vend_nombre_fallback,estado_inicial,suc_entrega,suc_cobro,restaurar_stock,sena}=req.body;
  if(!items?.length||!suc_id) return res.status(400).json({error:'Datos incompletos'});
  const pends=db.all('pendientes');
  const numero=(pends.length?Math.max(...pends.map(p=>p.numero||0)):0)+1;
  const id='pend'+uid(); const fecha=new Date().toISOString();
  const cfg=db.getConfig();
  const vto=new Date(fecha); vto.setDate(vto.getDate()+(parseInt(cfg.pendiente_dias_max)||30));
  const seña = parseFloat(sena) || 0;
  const saldo = Math.max(0, (parseFloat(total) || 0) - seña);
  db.insert('pendientes',{id,numero,fecha,fecha_entrega_estimada:fecha_entrega_estimada||null,vend_nombre_fallback:vend_nombre_fallback||'',estado:estado_inicial||'pendiente',suc_entrega:suc_entrega||suc_id,suc_cobro:suc_cobro||suc_id,concepto:concepto||'Pedido #'+numero,fecha_vto:vto.toISOString().substr(0,10),suc_id,vend_id:vend_id||null,cliente_id:cliente_id||null,total:parseFloat(total),seña,saldo,notas:notas||'',activo_stock:true,venta_id:venta_id||null});
  items.forEach(it=>db.insert('pendiente_items',{id:uid(),pendiente_id:id,prod_id:it.prod_id,variante_id:it.variante_id||null,nombre:it.nombre,talle:it.talle||'',precio:parseFloat(it.precio),cantidad:parseInt(it.cantidad),subtotal:parseFloat(it.subtotal),entregado:0}));

  // ── Seña → ingreso en el cajón del día ──
  if (seña > 0) {
    const { movCajon } = require('../lib/treasury');
    const r = movCajon(db, {
      suc_id: suc_cobro || suc_id,
      tipo: 'ingreso',
      concepto: 'Seña Pedido #' + numero,
      monto: seña,
      pago_metodo: 'efectivo',
      usuario: req.user,
      auto: true,
      pendiente_id: id,
    });
    if (!r.ok) {
      db.audit(req.user, suc_id, 'pendientes', 'seña_sin_caja', 'Seña #' + numero + ' no registrada: ' + r.error, id);
    }
  }

  // ── Restaurar stock a la sucursal que vendió ──
  // Al crear el pendiente, el producto vuelve al inventario disponible
  // porque físicamente sigue en el local hasta que el cliente lo retire
  if (items && items.length > 0) {
    const sucStock = suc_cobro || suc_id;
    items.forEach(function(it) {
      const cant = parseInt(it.cantidad);
      const res = updateSucStock(db, it.prod_id, sucStock, +cant);
      if (res) db.insert('stock_movimientos', {
        id: uid(), prod_id: it.prod_id, nombre_prod: (res && res.prod) ? res.prod.nombre : (it.nombre||''),  
        tipo: 'entrada', cantidad: cant,
        stock_antes: res.before, stock_despues: res.after,
        motivo: 'Pedido pendiente #'+numero+' — devuelto a suc',
        usuario_id: req.user.id, usuario: req.user.nombre,
        fecha: new Date().toISOString(), suc_id: sucStock
      });
    });
  }
  // ── Saldo del pendiente pasa a cuenta corriente ──
  // Solo si hay cliente, saldo > 0, y la venta (si existe) no fue ya pagada
  if (cliente_id && saldo > 0) {
    let yaPagado = false;
    if (venta_id) {
      const v = db.findOne('ventas', venta_id);
      // Si la venta fue cobrada por ctacte, ya tiene deuda; si fue pagada por otro medio, ya está saldada
      yaPagado = v && (v.es_ctacte || v.pago === 'ctacte' || v.cobrada);
    }
    if (!yaPagado) {
      db.insert('ctacte_movimientos', {
        id: uid(), cliente_id, tipo: 'deuda',
        concepto: 'Pedido pendiente #' + numero,
        monto: saldo, fecha: new Date().toISOString(),
        pendiente_id: id, venta_id: venta_id || null,
        suc_id: suc_cobro || suc_id, cancelado: false
      });
    }
  }
  db.audit(req.user, suc_id, 'pendientes', 'crear', 'Pedido #'+numero+' — $'+total+' | '+items.slice(0,3).map(i=>i.nombre+' x'+i.cantidad).join(', '), id);
  res.json({id,numero});
});

// Entregar items (parcial o total)

// Cambiar estado
pendRouter.patch('/:id/estado',(req,res)=>{
  const db = _getDB(req);
  const {estado, comprobante_emitido, comprobante}=req.body;
  const p=db.findOne('pendientes',req.params.id);
  if(!p) return res.status(404).json({error:'No encontrado'});
  if(!permiteSucursal(req.user, p.suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});
  if(p.estado==='entregado'||p.estado==='cancelado') return res.status(400).json({error:'El pedido ya está '+p.estado});
  const upd={estado};
  if(comprobante_emitido!==undefined) upd.comprobante_emitido=comprobante_emitido;
  if(comprobante) upd.comprobante=comprobante;
  if(estado==='cancelado'){
    upd.activo_stock=false; upd.cancelado_por=req.user.nombre; upd.fecha_cancelacion=new Date().toISOString();
    // Undo the stock restore that happened when pendiente was created
    if (p.activo_stock !== false) {
      const items = db.where('pendiente_items', i => i.pendiente_id === req.params.id);
      const sucStock = p.suc_cobro || p.suc_id;
      items.forEach(it => {
        const cant = it.cantidad - (it.entregado || 0);
        if (cant > 0) {
          const res = updateSucStock(db, it.prod_id, sucStock, -cant);
          if (res) db.insert('stock_movimientos', {id:uid(), prod_id:it.prod_id,
            nombre_prod:(res.prod||it).nombre||it.nombre, tipo:'salida', cantidad:-cant,
            stock_antes:res.before, stock_despues:res.after,
            motivo:'Cancelación Pedido #'+p.numero,
            usuario_id:req.user.id, usuario:req.user.nombre,
            fecha:new Date().toISOString(), suc_id:sucStock});
        }
      });
    }
    if(p.seña>0){
      const hoy=new Date().toISOString().substr(0,10);
      const cajaHoy=db.where('cajas',c=>c.suc_id===p.suc_id&&c.fecha.substr(0,10)===hoy&&c.estado==='abierta')[0];
      if(cajaHoy) db.insert('movimientos_caja',{id:uid(),caja_id:cajaHoy.id,suc_id:p.suc_id,fecha:new Date().toISOString(),tipo:'egreso',concepto:'Devolución seña Pendiente #'+p.numero,monto:p.seña,auto:true,pendiente_id:req.params.id,usuario:req.user.nombre,anulado:false});
    }
  }
  if(estado==='entregado'){
    // Deliver all remaining items — deduct stock from suc_entrega
    const items = db.where('pendiente_items', i => i.pendiente_id === req.params.id);
    const sucStock = p.suc_entrega || p.suc_id;
    let todosEntregados = true;
    items.forEach(it => {
      const cantPendiente = it.cantidad - (it.entregado || 0);
      if (cantPendiente <= 0) return;
      const eRes = updateSucStock(db, it.prod_id, sucStock, -cantPendiente);
      if (eRes) db.insert('stock_movimientos', {id:uid(), prod_id:it.prod_id,
        nombre_prod:(eRes.prod||it).nombre||it.nombre, tipo:'salida', cantidad:-cantPendiente,
        stock_antes:eRes.before, stock_despues:eRes.after,
        motivo:'Entrega Pedido #'+p.numero+(p.suc_entrega&&p.suc_entrega!==sucStock?' (retiro en '+p.suc_entrega+')':''),
        usuario_id:req.user.id, usuario:req.user.nombre,
        fecha:new Date().toISOString(), suc_id:sucStock});
      db.update('pendiente_items', it.id, {entregado: (it.entregado||0) + cantPendiente});
    });
    upd.fecha_entrega = new Date().toISOString();
  }
  db.update('pendientes',req.params.id,upd);
  db.audit(req.user, p.suc_id||null, 'pendientes', 'estado_'+estado, 'Pedido #'+p.numero+' → '+estado, req.params.id);
  res.json({ok:true, estado});
});

// Eliminar pedido (solo si no está entregado)
pendRouter.delete('/:id', authMiddleware, (req,res)=>{
  const db = _getDB(req);
  const p = db.findOne('pendientes', req.params.id);
  if (!p) return res.status(404).json({error:'No encontrado'});
  if(!permiteSucursal(req.user, p.suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});
  if (p.estado === 'entregado') return res.status(400).json({error:'No se puede eliminar un pedido entregado'});
  // Cancelar el pedido (libera stock)
  const items = db.where('pendiente_items', i => i.pendiente_id === req.params.id);
  const sucStock = p.suc_cobro || p.suc_id;
  if (p.activo_stock !== false) {
    items.forEach(it => {
      const cant = it.cantidad - (it.entregado || 0);
      if (cant > 0) {
        const res = updateSucStock(db, it.prod_id, sucStock, -cant);
        if (res) db.insert('stock_movimientos', {id:uid(), prod_id:it.prod_id,
          nombre_prod:(res.prod||it).nombre||it.nombre, tipo:'salida', cantidad:-cant,
          stock_antes:res.before, stock_despues:res.after,
          motivo:'Eliminación Pedido #'+p.numero,
          usuario_id:req.user.id, usuario:req.user.nombre,
          fecha:new Date().toISOString(), suc_id:sucStock});
      }
    });
  }
  db.update('pendientes', req.params.id, {activo_stock:false, estado:'cancelado', cancelado_por:req.user.nombre, fecha_cancelacion:new Date().toISOString()});
  db.audit(req.user, p.suc_id||null, 'pendientes', 'eliminar', 'Pedido #'+p.numero+' eliminado', req.params.id);
  res.json({ok:true});
});

// ── CUENTA CORRIENTE ──────────────────────────────────────────
const ctacteRouter = express.Router();
ctacteRouter.use(authMiddleware);

ctacteRouter.get('/',(req,res)=>{
  const db = _getDB(req);
  const {cli_id,vencidas,todas}=req.query;
  const hoy=new Date().toISOString().substr(0,10);
  const clis=db.all('clientes');
  if(cli_id){
    let movs=db.where('ctacte_movimientos',m=>m.cliente_id===cli_id).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    const saldo=movs.filter(m=>!m.cancelado).reduce((a,m)=>a+(m.tipo==='deuda'?m.monto:m.tipo==='pago'?-m.monto:0),0);
    // Enriquecer con Debe/Haber y saldo acumulado (running) para ficha pro
    const asc=[...movs].sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));
    let running=0;
    const enrichedAsc=asc.map(m=>{
      if(!m.cancelado){
        if(m.tipo==='deuda') running+= parseFloat(m.monto)||0;
        else if(m.tipo==='pago') running-= parseFloat(m.monto)||0;
      }
      return {...m, debe: (m.tipo==='deuda'&&!m.cancelado)? parseFloat(m.monto)||0 : 0, haber: (m.tipo==='pago'&&!m.cancelado)? parseFloat(m.monto)||0 : 0, saldo: running};
    });
    // volver a ordenar desc pero con campos ya calculados
    const byId=new Map(enrichedAsc.map(m=>[m.id,m]));
    movs=movs.map(m=> byId.get(m.id));
    return res.json({movimientos:movs,saldo});
  }
  let resumen=clis.flatMap(c=>{
    if (!c.activo) return [];
    const movs=db.where('ctacte_movimientos',m=>m.cliente_id===c.id);
    const saldo=movs.filter(m=>!m.cancelado).reduce((a,m)=>a+(m.tipo==='deuda'?m.monto:m.tipo==='pago'?-m.monto:0),0);
    const venc=movs.filter(m=>m.tipo==='deuda'&&!m.cancelado&&m.fecha_vto&&m.fecha_vto<hoy).length;
    const prox=movs.filter(m=>{if(m.tipo!=='deuda'||m.cancelado||!m.fecha_vto)return false;const d=Math.floor((new Date(m.fecha_vto)-new Date())/(1000*60*60*24));return d>=0&&d<=7;}).length;
    return [{...c,saldo,vencidas_count:venc,proximas_count:prox,tiene_deuda:saldo>0}];
  });
  if(vencidas==='true') resumen=resumen.filter(c=>c.vencidas_count>0);
  const result = todas==='true' ? resumen : resumen.filter(c=>c.saldo!==0||c.vencidas_count>0);
  res.json(result.sort((a,b)=>b.saldo-a.saldo));
});

ctacteRouter.post('/pago',(req,res)=>{
  const db = _getDB(req);
  const {cliente_id,monto,concepto,suc_id,pago_metodo,nro_comprobante}=req.body;
  if(!cliente_id||!monto) return res.status(400).json({error:'Datos incompletos'});
  if(suc_id){
    const hoy=new Date().toISOString().substr(0,10);
    const cajaHoy=db.where('cajas',c=>c.suc_id===suc_id&&c.fecha.substr(0,10)===hoy&&c.estado==='abierta')[0];
    if(!cajaHoy) return res.status(400).json({error:'La caja está cerrada. Abrila para registrar cobros.'});
  }

  // ── Validar comprobante de transferencia ──
  if (pago_metodo === 'transferencia' && nro_comprobante) {
    const { buscarDuplicado, duplicadoInfo } = require('../lib/comprobantes');
    const found = buscarDuplicado(db, nro_comprobante);
    if (found && req.body.confirmar_duplicado !== true) {
      const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.rol];
      const esAdmin = userRoles.some(r => ['admin', 'supervisor'].includes(r));
      return res.json({
        advertencia: true,
        mensaje: 'Este comprobante de transferencia ya fue registrado.',
        duplicados: duplicadoInfo(db, found),
        permite_confirmar: esAdmin
      });
    }
    if (found && req.body.confirmar_duplicado === true) {
      const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.rol];
      const esAdmin = userRoles.some(r => ['admin', 'supervisor'].includes(r));
      if (!esAdmin) return res.status(403).json({ error: 'Solo admin o supervisor pueden confirmar un comprobante duplicado.' });
    }
  }

  const id=uid(); const fecha=new Date().toISOString();
  db.insert('ctacte_movimientos',{id,cliente_id,tipo:'pago',concepto:concepto||'Pago cuenta corriente',monto:parseFloat(monto),fecha,suc_id:suc_id||null,cancelado:false,usuario:req.user.nombre});
  if(suc_id){
    const hoy=fecha.substr(0,10);
    const cajaHoy=db.where('cajas',c=>c.suc_id===suc_id&&c.fecha.substr(0,10)===hoy&&c.estado==='abierta')[0];
    if(cajaHoy){const cli=db.findOne('clientes',cliente_id);db.insert('movimientos_caja',{id:uid(),caja_id:cajaHoy.id,suc_id,fecha,tipo:'ingreso',concepto:'Cobro c/cte '+cli?.nombre+' '+cli?.apellido,monto:parseFloat(monto),auto:true,pago_metodo:pago_metodo||'efectivo',usuario:req.user.nombre,anulado:false});}
  }

  // ── Registrar comprobante de transferencia ──
  if (pago_metodo === 'transferencia' && nro_comprobante) {
    try { const { registrar: registrarComp } = require('../lib/comprobantes'); registrarComp(db, { nro: nro_comprobante, ctacte_mov_id: id, cliente_id, suc_id, monto: parseFloat(monto), usuario: req.user.nombre, usuario_id: req.user.id }); } catch(e) { /* non-critical */ }
  }

  db.audit(req.user, req.body.suc_id||req.user.suc_id||null, 'ctacte', 'pago', 'Cobro $'+monto+' — '+(concepto||'Pago ctacte'), id);
  res.json({ok:true,id});
});

ctacteRouter.post('/ajuste',requireRol('admin','supervisor'),(req,res)=>{
  const db = _getDB(req);
  const {cliente_id,monto,concepto,tipo}=req.body;
  if(!cliente_id||!monto) return res.status(400).json({error:'Datos incompletos'});
  db.insert('ctacte_movimientos',{id:uid(),cliente_id,tipo,concepto,monto:parseFloat(monto),fecha:new Date().toISOString(),cancelado:false,usuario:req.user.nombre});
  res.json({ok:true});
});


pendRouter.post('/:id/entregar', authMiddleware, (req,res) => {
  const db = _getDB(req);
  const pend = db.findOne('pendientes', req.params.id);
  if (!pend || pend.estado === 'entregado') return res.status(400).json({error:'Pedido no válido o ya entregado'});
  if(!permiteSucursal(req.user, pend.suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});

  const {items_entregar} = req.body;
  // Read items from pendiente_items table (source of truth)
  const dbItems = db.where('pendiente_items', i => i.pendiente_id === req.params.id);

  let todosEntregados = true;
  const entregadosAhora = []; // for ticket

  dbItems.forEach(it => {
    const cantPendiente = it.cantidad - (it.entregado || 0);
    if (cantPendiente <= 0) return; // already fully delivered

    // Check if this item was selected for delivery
    let cantEntregar = 0;
    if (items_entregar && items_entregar.length > 0) {
      const sel = items_entregar.find(e => e.prod_id === it.prod_id && (e.talle||'') === (it.talle||''));
      cantEntregar = sel ? Math.min(parseInt(sel.cantidad)||0, cantPendiente) : 0;
    } else {
      cantEntregar = cantPendiente; // deliver all
    }

    if (cantEntregar > 0) {
      // Deduct from the delivery sucursal (each suc manages its own stock independently)
      const sucStock = pend.suc_entrega || pend.suc_id;
      const eRes = updateSucStock(db, it.prod_id, sucStock, -cantEntregar);
      if (eRes) db.insert('stock_movimientos', {id:uid(), prod_id:it.prod_id, nombre_prod:(eRes && eRes.prod) ? eRes.prod.nombre : (it.nombre||''),
        tipo:'salida', cantidad:-cantEntregar, stock_antes:eRes.before, stock_despues:eRes.after,
        motivo:'Entrega Pedido #'+pend.numero+(pend.suc_entrega&&pend.suc_entrega!==sucStock?' (retiro en '+pend.suc_entrega+')':''),
        usuario_id:req.user.id, usuario:req.user.nombre,
        fecha:new Date().toISOString(), suc_id:sucStock});
      // Update pendiente_items
      db.update('pendiente_items', it.id, {entregado: (it.entregado||0) + cantEntregar});
      entregadosAhora.push({...it, cantidad_entregada_ahora: cantEntregar});
    }

    // Check if still pending after this delivery
    if ((it.entregado||0) + cantEntregar < it.cantidad) todosEntregados = false;
  });

  const nuevoEstado = todosEntregados ? 'entregado' : 'parcialmente_entregado';
  db.update('pendientes', req.params.id, {
    estado: nuevoEstado,
    fecha_entrega: nuevoEstado === 'entregado' ? new Date().toISOString() : pend.fecha_entrega
  });

  res.json({ok:true, estado:nuevoEstado, numero:pend.numero, entregados_ahora:entregadosAhora});
});


// PUT /obs/:id — add observation to ctacte movement
// ── Seguimiento cuenta corriente ──
ctacteRouter.post('/seguimiento/:cli_id', authMiddleware, (req,res) => {
  const db = _getDB(req);
  const cli = db.findOne('clientes', req.params.cli_id);
  if(!cli) return res.status(404).json({error:'No encontrado'});
  const {nota, accion, estado_contacto, proximo_contacto, monto_prometido} = req.body;
  const {uid} = require('../db_sqlite');
  const id = 'sg'+uid();
  const extraData = {};
  if (proximo_contacto) extraData.proximo_contacto = proximo_contacto;
  if (monto_prometido) extraData.monto_prometido = parseFloat(monto_prometido);
  db.insert('seguimiento', {
    id, entidad_tipo:'ctacte', entidad_id:req.params.cli_id,
    fecha:new Date().toISOString(),
    usuario_id:req.user.id, usuario_nombre:req.user.nombre,
    suc_id:req.user.suc_id,
    accion:estado_contacto||accion||'contacto',
    nota:nota||'',
    estado_anterior:'', estado_nuevo:estado_contacto||accion||'',
    data: Object.keys(extraData).length ? JSON.stringify(extraData) : '{}'
  });
  res.json({id, ok:true});
});

// ── Movimientos por cliente ──
ctacteRouter.get('/:cli_id/movimientos', authMiddleware, (req,res) => {
  const db = _getDB(req);
  let movs = db.where('ctacte_movimientos', m => m.cliente_id === req.params.cli_id && !m.cancelado)
    .sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
  const saldo = movs.reduce((a,m) => a + (m.tipo==='deuda' ? m.monto : m.tipo==='pago' ? -m.monto : 0), 0);
  const asc=[...movs].sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));
  let running=0;
  const enrichedAsc=asc.map(m=>{ if(m.tipo==='deuda') running+=parseFloat(m.monto)||0; else if(m.tipo==='pago') running-=parseFloat(m.monto)||0; return {...m, debe:m.tipo==='deuda'?parseFloat(m.monto)||0:0, haber:m.tipo==='pago'?parseFloat(m.monto)||0:0, saldo:running};});
  const byId=new Map(enrichedAsc.map(m=>[m.id,m]));
  movs=movs.map(m=> byId.get(m.id));
  res.json({ movimientos: movs, saldo });
});

ctacteRouter.get('/seguimiento/:cli_id', authMiddleware, (req,res) => {
  const db = _getDB(req);
  const rows = db.where('seguimiento', s=>s.entidad_tipo==='ctacte'&&s.entidad_id===req.params.cli_id)
    .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  res.json(rows);
});

ctacteRouter.put('/obs/:id', authMiddleware, (req,res) => {
  const db = _getDB(req);
  const existing = db.findOne('ctacte_movimientos', req.params.id);
  if(!existing) return res.status(404).json({error:'No encontrado'});
  if (existing.suc_id && !permiteSucursal(req.user, existing.suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});
  const prev = existing.observaciones ? existing.observaciones + '\n' : '';
  db.update('ctacte_movimientos', req.params.id, {observaciones: prev + (req.body.observaciones||'')});
  res.json({ok:true});
});

// ── Comprobante PDF pago CtaCte (A4) ──
ctacteRouter.get('/pago/:id/comprobante-pdf', authMiddleware, (req,res) => {
  try {
    const PDFDocument = require('pdfkit');
    const db = _getDB(req);
    const mov = db.findOne('ctacte_movimientos', req.params.id);
    if (!mov) return res.status(404).json({ error:'Movimiento no encontrado' });
    const cli = db.findOne('clientes', mov.cliente_id);
    const suc = mov.suc_id ? db.findOne('sucursales', mov.suc_id) : null;
    const cfg = db.getConfig();
    // saldo histórico
    const allMovs = db.where('ctacte_movimientos', m=> m.cliente_id===mov.cliente_id && !m.cancelado).sort((a,b)=> new Date(a.fecha)-new Date(b.fecha));
    let running=0; let saldoAntes=0;
    for (const m of allMovs) {
      if (m.id===mov.id) { saldoAntes=running; if(m.tipo==='deuda') running+=parseFloat(m.monto)||0; else if(m.tipo==='pago') running-=parseFloat(m.monto)||0; break; }
      if(m.tipo==='deuda') running+=parseFloat(m.monto)||0; else if(m.tipo==='pago') running-=parseFloat(m.monto)||0;
    }
    const saldoDespues = running;
    const doc = new PDFDocument({ size:'A4', margin:40, bufferPages:true });
    const chunks=[]; doc.on('data',c=>chunks.push(c)); doc.on('end',()=>{ const pdf=Buffer.concat(chunks); res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="ctacte-${cli?.dni||cli?.id||'cliente'}-${new Date(mov.fecha).toISOString().slice(0,10)}.pdf"`); res.send(pdf); });
    const fmtN = n=> '$'+(Number(n)||0).toLocaleString('es-AR',{minimumFractionDigits:2, maximumFractionDigits:2});
    let y=40;
    doc.font('Helvetica-Bold').fontSize(16).text(cfg.nombre || 'FlexCRM', 40, y, {align:'center', width:515}); y+=20;
    if(cfg.dir) { doc.font('Helvetica').fontSize(8).text(`${cfg.dir} ${cfg.tel? '· Tel: '+cfg.tel:''} ${cfg.email? '· '+cfg.email:''}`, 40, y, {align:'center', width:515}); y+=12; }
    doc.moveTo(40,y).lineTo(555,y).stroke('#ddd'); y+=14;
    const titulo = mov.tipo==='pago' ? 'COMPROBANTE DE PAGO — CUENTA CORRIENTE' : 'COMPROBANTE DE DEUDA — CUENTA CORRIENTE';
    doc.font('Helvetica-Bold').fontSize(12).text(titulo, 40, y, {align:'center', width:515}); y+=18;
    doc.font('Helvetica').fontSize(9);
    doc.text(`Fecha: ${new Date(mov.fecha).toLocaleString('es-AR')}`, 40, y); doc.text(`Comprobante: ${mov.id.slice(-8).toUpperCase()}`, 350, y, {width:205, align:'right'}); y+=14;
    doc.text(`Cliente: ${(cli?cli.nombre+' '+(cli.apellido||''):'—')} ${cli?.dni? '· DNI '+cli.dni : ''}`, 40, y, {width:515}); y+=12;
    if(cli?.tel) { doc.text(`Tel: ${cli.tel}  ${cli?.email? '· '+cli.email:''}`, 40, y); y+=12; }
    if(cli?.direccion || cli?.dir) { doc.text(`Dir: ${cli.direccion||cli.dir||''}`, 40, y); y+=12; }
    if(suc) { doc.text(`Sucursal: ${suc.nombre}`, 40, y); y+=12; }
    const sucCli = cli ? db.findOne('sucursales', cli.suc_id||cli.suc_origen) : null;
    if(sucCli) { doc.text(`Sucursal del cliente: ${sucCli.nombre}`, 40, y); y+=12; }
    doc.text(`Concepto: ${mov.concepto||mov.descripcion||'—'}`, 40, y, {width:515}); y+=12;
    doc.text(`Método: ${mov.pago_metodo|| mov.medio || (mov.tipo==='pago'?'Pago':'Deuda')}`, 40, y); y+=16;
    // tabla resumen
    doc.rect(40,y,515,60).stroke('#e5e7eb');
    doc.font('Helvetica').fontSize(8).text('Saldo anterior', 50, y+8); doc.font('Helvetica-Bold').fontSize(11).text(fmtN(saldoAntes), 50, y+20);
    doc.font('Helvetica').fontSize(8).text(mov.tipo==='pago' ? 'Haber (pago)' : 'Debe', 200, y+8); doc.font('Helvetica-Bold').fontSize(11).fillColor(mov.tipo==='pago'?'#16a34a':'#dc2626').text(fmtN(mov.monto), 200, y+20); doc.fillColor('#000');
    doc.font('Helvetica').fontSize(8).text('Saldo actual', 350, y+8); doc.font('Helvetica-Bold').fontSize(11).fillColor(saldoDespues>0?'#dc2626':'#16a34a').text(fmtN(saldoDespues), 350, y+20); doc.fillColor('#000');
    if(cli?.limite_credito) { doc.font('Helvetica').fontSize(7).text(`Límite: ${fmtN(cli.limite_credito)} · Disponible: ${fmtN(Math.max(0,(cli.limite_credito||0)-saldoDespues))}`, 350, y+38); }
    y+=70;
    doc.font('Helvetica').fontSize(7).fillColor('#6b7280').text('Este comprobante es válido como constancia de pago. Conserve este documento.', 40, 800, {align:'center', width:515});
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text('¡Gracias por su pago!', 40, 815, {align:'center', width:515});
    doc.end();
  } catch(e){ res.status(500).json({ error:'Error generando PDF: '+e.message }); }
});

// ── Resumen PDF por cliente (A4) ──
ctacteRouter.get('/:cli_id/resumen-pdf', authMiddleware, (req,res) => {
  try {
    const PDFDocument = require('pdfkit');
    const db = _getDB(req);
    const cli = db.findOne('clientes', req.params.cli_id);
    if(!cli) return res.status(404).json({ error:'Cliente no encontrado' });
    const { desde, hasta } = req.query;
    let movs = db.where('ctacte_movimientos', m=> m.cliente_id===req.params.cli_id && !m.cancelado).sort((a,b)=> new Date(a.fecha)-new Date(b.fecha));
    if(desde) movs=movs.filter(m=> m.fecha.slice(0,10) >= desde);
    if(hasta) movs=movs.filter(m=> m.fecha.slice(0,10) <= hasta);
    // saldo acumulado
    let running=0;
    const rows=movs.map(m=>{ if(m.tipo==='deuda') running+=parseFloat(m.monto)||0; else if(m.tipo==='pago') running-=parseFloat(m.monto)||0; return {...m, debe:m.tipo==='deuda'?parseFloat(m.monto)||0:0, haber:m.tipo==='pago'?parseFloat(m.monto)||0:0, saldo:running};});
    const totalDebe=rows.filter(r=>r.tipo==='deuda').reduce((a,r)=>a+r.monto,0);
    const totalHaber=rows.filter(r=>r.tipo==='pago').reduce((a,r)=>a+r.monto,0);
    const saldoFinal=rows.length? rows[rows.length-1].saldo : 0;
    const cfg=db.getConfig();
    const doc=new PDFDocument({ size:'A4', margin:40, bufferPages:true });
    const chunks=[]; doc.on('data',c=>chunks.push(c)); doc.on('end',()=>{ const pdf=Buffer.concat(chunks); res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="resumen-ctacte-${cli.dni||cli.id}.pdf"`); res.send(pdf); });
    const fmtN=n=> '$'+(Number(n)||0).toLocaleString('es-AR',{minimumFractionDigits:2, maximumFractionDigits:2});
    let y=40;
    doc.font('Helvetica-Bold').fontSize(16).text(cfg.nombre||'FlexCRM',40,y,{align:'center',width:515}); y+=18;
    doc.font('Helvetica-Bold').fontSize(12).text('RESUMEN DE CUENTA CORRIENTE',40,y,{align:'center',width:515}); y+=16;
    doc.font('Helvetica').fontSize(9).text(`Cliente: ${cli.nombre} ${(cli.apellido||'')}  ·  DNI: ${cli.dni||'—'}  ·  Tel: ${cli.tel||'—'}`,40,y); y+=12;
    const sucCli=db.findOne('sucursales', cli.suc_id||cli.suc_origen); if(sucCli){ doc.text(`Sucursal del cliente: ${sucCli.nombre}`,40,y); y+=12; }
    if(desde||hasta) { doc.text(`Período: ${desde||'inicio'}  al  ${hasta||'hoy'}`,40,y); y+=12; }
    doc.text(`Saldo actual: ${fmtN(saldoFinal)}  ·  Límite: ${cli.limite_credito?fmtN(cli.limite_credito):'Sin límite'}  ·  Disponible: ${cli.limite_credito?fmtN(Math.max(0,cli.limite_credito - saldoFinal)): '—'}`,40,y); y+=14;
    // header tabla
    doc.rect(40,y,515,16).fill('#f3f4f6').stroke('#e5e7eb');
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(7);
    doc.text('Fecha',42,y+4,{width:70}); doc.text('Concepto',115,y+4,{width:195}); doc.text('Debe',315,y+4,{width:60, align:'right'}); doc.text('Haber',380,y+4,{width:60, align:'right'}); doc.text('Saldo',450,y+4,{width:60, align:'right'}); y+=18;
    doc.font('Helvetica').fontSize(7);
    for(const r of rows.slice(0, 60)){
      if(y>760){ doc.addPage(); y=40; }
      doc.text(new Date(r.fecha).toLocaleDateString('es-AR'),42,y,{width:70});
      doc.text((r.concepto||'').slice(0,50),115,y,{width:195});
      doc.text(r.debe?fmtN(r.debe):'—',315,y,{width:60, align:'right'});
      doc.text(r.haber?fmtN(r.haber):'—',380,y,{width:60, align:'right'});
      doc.fillColor(r.saldo>0?'#dc2626':'#16a34a').text(fmtN(r.saldo),450,y,{width:60, align:'right'}); doc.fillColor('#000');
      y+=10; doc.moveTo(40,y).lineTo(555,y).stroke('#f3f4f6'); y+=4;
    }
    y+=6;
    doc.font('Helvetica-Bold').fontSize(8).text(`Total Debe: ${fmtN(totalDebe)}`,315,y,{width:100, align:'right'});
    doc.text(`Total Haber: ${fmtN(totalHaber)}`,315,y+10,{width:100, align:'right'});
    doc.fillColor(saldoFinal>0?'#dc2626':'#16a34a').text(`Saldo: ${fmtN(saldoFinal)}`,450,y,{width:60, align:'right'}); doc.fillColor('#000');
    doc.end();
  } catch(e){ res.status(500).json({ error:'Error generando PDF: '+e.message }); }
});

module.exports = {pendRouter,ctacteRouter};
