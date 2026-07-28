const express = require('express');
const router = express.Router();
const { uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || require('../db_sqlite').db;
const { authMiddleware, requireRol, permiteSucursal } = require('../middleware/auth');
const { validate, ventaCreateSchema } = require('../middleware/validate');
const { dispararWebhooks } = require('./webhooks');
const { updateSucStock, getStockSuc, updateVariantStock } = require('./stock_helpers');
router.use(authMiddleware);

function enrichVenta(v, db) {
  const sucs=db.all('sucursales'),vends=db.all('vendedores'),users=db.all('usuarios'),clis=db.all('clientes');
  const vd=users.find(x=>x.id===v.vend_id)||vends.find(x=>x.id===v.vend_id), c=clis.find(x=>x.id===v.cliente_id);
  return {...v,
    suc_nombre:(sucs.find(s=>s.id===v.suc_id)||{}).nombre||'—',
    // Use vendedor name, or the fallback name stored at sale time, or '—'
    vend_nombre:vd?(vd.nombre+' '+vd.apellido):(v.vend_nombre_fallback||'—'),
    cli_nombre:c?c.nombre+' '+c.apellido:''
  };
}

router.get('/', (req,res) => {
  const db = _getDB(req);
  const {desde,hasta,suc_id,vend_id,cli_id,limit=300,pendientes_cobro,num,q} = req.query;
  let rows = db.all('ventas');
  // Por defecto excluir ventas online (originadas en tienda/sync)
  if(req.query.include_online !== 'true') {
    rows = rows.filter(v => v.origen !== 'online');
  }
  // Filtro estricto: cobrada===false (no undefined, no null)
  if(pendientes_cobro==='true') {
    const inclCtacte = req.query.include_ctacte === 'true';
    rows=rows.filter(v=>!v.anulada && v.cobrada===false && (inclCtacte || !v.es_ctacte));
    if(suc_id) rows=rows.filter(v=>v.suc_id===suc_id);
  }
  else {
    if(desde) rows=rows.filter(v=>v.fecha.substr(0,10)>=desde);
    if(hasta) rows=rows.filter(v=>v.fecha.substr(0,10)<=hasta);
    if(suc_id) rows=rows.filter(v=>v.suc_id===suc_id);
    if(num) rows=rows.filter(v=>String(v.numero).includes(num));
    if(vend_id) rows=rows.filter(v=>v.vend_id===vend_id);
    if(cli_id) rows=rows.filter(v=>v.cliente_id===cli_id);
  }
  let result = rows.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,parseInt(limit)).map(v=>enrichVenta(v,db));
  // Search by cliente name, tel, dni, email or venta number
  if (q) {
    const ql = q.toLowerCase();
    const clis = db.all('clientes');
    result = result.filter(v => {
      if (v.cli_nombre && v.cli_nombre.toLowerCase().includes(ql)) return true;
      if (String(v.numero).includes(q)) return true;
      if (v.cliente_id) {
        const cli = clis.find(c => c.id === v.cliente_id);
        if (cli) {
          const searchable = (cli.nombre+' '+(cli.apellido||'')+' '+(cli.tel||'')+' '+(cli.dni||'')+' '+(cli.email||'')).toLowerCase();
          if (searchable.includes(ql)) return true;
        }
      }
      return false;
    });
  }
  res.json(result);
});

router.get('/:id', (req,res) => {
  const db = _getDB(req);
  const v=db.findOne('ventas',req.params.id);
  if(!v) return res.status(404).json({error:'No encontrada'});
  if (v.suc_id && v.suc_id !== 'default' && !permiteSucursal(req.user, v.suc_id)) return res.status(403).json({error:'Sin acceso a esta venta'});
  res.json({...enrichVenta(v, db), items:db.where('venta_items',i=>i.venta_id===req.params.id)});
});

router.post('/', validate(ventaCreateSchema), (req,res) => {
  const db = _getDB(req);
  const {suc_id,vend_id,cliente_id,items,subtotal,descuento,total,pago,comprobante,es_ctacte,recargo_pago,envio_monto,envio_detalle} = req.body;
  if(!suc_id||!items?.length) return res.status(400).json({error:'Datos incompletos'});

  // Validar descuento por rol
  if(parseFloat(descuento)>0) {
    const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.rol];
    const puedeDescontar = userRoles.some(r=>['admin','supervisor'].includes(r));
    if(!puedeDescontar) return res.status(403).json({error:'Sin permiso para aplicar descuentos'});
  }

  // Caja abierta (requerida salvo c/cte)
  const hoy=new Date().toISOString().substr(0,10);
  const cajaHoy=db.where('cajas',c=>c.suc_id===suc_id&&c.fecha.substr(0,10)===hoy&&c.estado==='abierta')[0];
  if(!cajaHoy&&!es_ctacte) return res.status(400).json({error:'La caja de esta sucursal está cerrada. Abrila antes de registrar ventas.'});

  // Validar límite c/cte
  if(es_ctacte&&cliente_id){
    const cli=db.findOne('clientes',cliente_id);
    if(cli&&cli.limite_credito===0) return res.status(400).json({error:'Este cliente no tiene crédito habilitado (límite $0).'});
    if(cli&&cli.limite_credito>0){
      const saldoAct=db.where('ctacte_movimientos',m=>m.cliente_id===cliente_id).reduce((a,m)=>a+(m.tipo==='deuda'?m.monto:m.tipo==='pago'?-m.monto:0),0);
      if(saldoAct+parseFloat(total)>cli.limite_credito) return res.status(400).json({error:`Límite de crédito excedido. Disponible: $${Math.max(0,cli.limite_credito-saldoAct).toLocaleString('es-AR')}`});
    }
  }

  const ventas=db.all('ventas');
  const numero=(ventas.length?Math.max(...ventas.map(v=>v.numero||0)):999)+1;
  const id='v'+uid(); const fecha=new Date().toISOString();
  const envioMonto=parseFloat(envio_monto)||0;
  const totalFinal=(parseFloat(total)||0)+envioMonto;

  // Desde el POS siempre queda pendiente de cobro (cobrada:false)
  // Solo admin/supervisor que manejan caja y c/cte se marcan como cobradas
  const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.rol];
  const esAdmin = userRoles.some(r=>['admin','supervisor'].includes(r));
  const cobrada = false; // todas las ventas pasan por caja para factura (incluyendo c/cte)

  const vendNombreFallback = req.body.vend_nombre_fallback || '';
  db.insert('ventas',{id,numero,fecha,suc_id,vend_nombre_fallback:vendNombreFallback,
    vend_id: vend_id||req.user.id, // fallback al id del usuario
    cliente_id:cliente_id||null,
    subtotal:parseFloat(subtotal)||0,
    descuento:parseFloat(descuento)||0,
    total:totalFinal,
    pago: cobrada ? (pago||'efectivo') : 'pendiente_cobro',
    comprobante:comprobante||'ticket',
    anulada:false,
    cobrada,
    es_ctacte:!!es_ctacte,
    recargo_pago:parseFloat(recargo_pago)||0,
    envio_monto:envioMonto,
    envio_detalle:envio_detalle||''
  });

  items.forEach(it=>{
    db.insert('venta_items',{id:uid(),venta_id:id,prod_id:it.prod_id,variante_id:it.variante_id||null,nombre:it.nombre,talle:it.talle||'',precio:parseFloat(it.precio),cantidad:parseInt(it.cantidad),subtotal:parseFloat(it.subtotal),costo:parseFloat(it.costo)||0});
    if(it.variante_id){
      const vRes = updateVariantStock(db, it.variante_id, suc_id, -parseInt(it.cantidad));
      if(vRes) db.insert('stock_movimientos',{id:uid(),prod_id:it.prod_id,nombre_prod:it.nombre,tipo:'salida',cantidad:-parseInt(it.cantidad),stock_antes:vRes.before,stock_despues:vRes.after,motivo:'Venta #'+numero+' (variante)',usuario_id:req.user.id,usuario:req.user.nombre,fecha,suc_id});
    } else {
      const p=db.findOne('productos',it.prod_id);
      if(p){
        const sucRes = updateSucStock(db, it.prod_id, suc_id, -parseInt(it.cantidad));
        if (sucRes) db.insert('stock_movimientos',{id:uid(),prod_id:it.prod_id,nombre_prod:p.nombre,tipo:'salida',cantidad:-parseInt(it.cantidad),stock_antes:sucRes.before,stock_despues:sucRes.after,motivo:'Venta #'+numero,usuario_id:req.user.id,usuario:req.user.nombre,fecha,suc_id});
      }
    }
  });

  // Fidelización: add puntos on sale (1 punto per $100)
  if(cliente_id) {
    const cli = db.findOne('clientes', cliente_id);
    if(cli) {
      const cfg = db.getConfig();
      const puntosXPeso = parseFloat(cfg.puntos_por_peso)||0.01; // 1 pto per $100
      const puntosGanados = Math.floor(parseFloat(total) * puntosXPeso);
      if(puntosGanados > 0) {
        const newPuntos = (cli.puntos||0) + puntosGanados;
        db.update('clientes', cliente_id, {puntos: newPuntos});
        db.insert('puntos_movimientos', {
          id:'pm'+uid(), cliente_id,
          tipo:'suma', puntos:puntosGanados,
          motivo:'Venta #'+numero,
          referencia_id:id, fecha:new Date().toISOString()
        });
      }
    }
  }

  // Cuenta corriente
  if(es_ctacte&&cliente_id){
    const cfg=db.getConfig();
    const fvto=new Date(fecha); fvto.setDate(fvto.getDate()+(parseInt(cfg.ctacte_dias_vto)||30));
    db.insert('ctacte_movimientos',{id:uid(),cliente_id,tipo:'deuda',concepto:'Venta #'+numero,monto:totalFinal*(1+(parseFloat(cfg.ctacte_recargo)||0)/100),fecha,fecha_vto:fvto.toISOString().substr(0,10),venta_id:id,cancelado:false,suc_id});
  }

  db.audit(req.user, suc_id, 'ventas', 'crear', 'Venta #'+numero+' — $'+totalFinal, id);
  res.json({id,numero,fecha,cobrada});
});

// Cajero cobra venta pendiente
router.post('/:id/cobrar', requireRol('cajero','admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  const v=db.findOne('ventas',req.params.id);
  if(!v||v.cobrada===true||v.anulada) return res.status(400).json({error:'Venta no válida'});
  if(!permiteSucursal(req.user, v.suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});
  const hoy=new Date().toISOString().substr(0,10);
  // Buscar caja abierta: primero la del cajero, luego la de la venta
  const cajeroSucId = req.user.suc_id || v.suc_id;
  let cajaHoy=db.where('cajas',c=>c.suc_id===cajeroSucId&&c.fecha.substr(0,10)===hoy&&c.estado==='abierta')[0];
  if(!cajaHoy && cajeroSucId!==v.suc_id)
    cajaHoy=db.where('cajas',c=>c.suc_id===v.suc_id&&c.fecha.substr(0,10)===hoy&&c.estado==='abierta')[0];
  if(!cajaHoy) return res.status(400).json({error:'No hay caja abierta. Abrí la caja antes de cobrar.'});
  const pago = req.body.pago || 'efectivo';
  const pagosDetalle = req.body.pagos_detalle || null;
  const pagoPrincipal = req.body.pago_principal || pago;
  // ctacte_monto from frontend already has recargo applied
  const ctacteMonto = parseFloat(req.body.ctacte_monto)||0;
  const ctacteClienteId = req.body.ctacte_cliente_id || v.cliente_id;

  // Handle discount code
  const codigoDesc = req.body.codigo_descuento;
  let descuentoNum = 0;
  let descuentoPct = parseFloat(req.body.descuento_pct) || 0;
  if (codigoDesc && pagosDetalle && Array.isArray(pagosDetalle)) {
    const code = db.findOne('codigos_descuento', codigoDesc.toUpperCase());
    if (!code) return res.status(400).json({ error: 'Código descuento inválido' });
    if (!code.activo || (code.vence && new Date(code.vence) < new Date(new Date().toDateString())) || (code.usos_maximos > 0 && code.usos_actuales >= code.usos_maximos))
      return res.status(400).json({ error: 'Código descuento no válido o agotado' });
    db.update('codigos_descuento', codigoDesc.toUpperCase(), { usos_actuales: code.usos_actuales + 1 });
    const sumPagado = pagosDetalle.reduce((a, p) => a + (parseFloat(p.monto_base) || parseFloat(p.monto) || 0), 0);
    descuentoNum = Math.max(0, (v.total || 0) - sumPagado);
    if (!descuentoPct && v.total > 0) descuentoPct = Math.round(descuentoNum / v.total * 10000) / 100;
  } else if (descuentoPct > 0) {
    descuentoNum = Math.round((v.total || 0) * descuentoPct / 100);
  }

  db.update('ventas',req.params.id,{cobrada:true,pago,pago_principal:pagoPrincipal,fecha_cobro:new Date().toISOString(),cobrado_por:req.user.nombre,pagos_detalle:pagosDetalle,ctacte_monto:ctacteMonto,descuento:descuentoNum,descuento_pct:descuentoPct,codigo_descuento:codigoDesc?codigoDesc.toUpperCase():undefined});

  // Registrar monto de c/cte en cuenta corriente del cliente
  if(ctacteMonto > 0 && ctacteClienteId) {
    const cfg=db.getConfig();
    const fvto=new Date(); fvto.setDate(fvto.getDate()+(parseInt(cfg.ctacte_dias_vto)||30));
    db.insert('ctacte_movimientos',{id:uid(),cliente_id:ctacteClienteId,tipo:'deuda',concepto:'Saldo c/cte Venta #'+v.numero+' (pago mixto)',monto:ctacteMonto*(1+(parseFloat(cfg.ctacte_recargo)||0)/100),fecha:new Date().toISOString(),fecha_vto:fvto.toISOString().substr(0,10),venta_id:req.params.id,cancelado:false,suc_id:v.suc_id});
  }

  // Registrar en caja los métodos de pago físicos (excluir ctacte)
  const pagosParaCaja = (pagosDetalle && Array.isArray(pagosDetalle))
    ? pagosDetalle.filter(p => p.id !== 'ctacte')
    : (pago !== 'ctacte' ? [{id: pagoPrincipal, monto: v.total - ctacteMonto}] : []);

  if (cajaHoy && pagosParaCaja.length > 0) {
    if (pagosParaCaja.length > 1) {
      pagosParaCaja.forEach(p => {
        const monto = parseFloat(p.monto)||0;
        if(monto > 0) db.insert('movimientos_caja',{id:uid(),caja_id:cajaHoy.id,suc_id:cajaHoy.suc_id,fecha:new Date().toISOString(),tipo:'ingreso',concepto:'Cobro Venta #'+v.numero+' ('+p.id+(p.cuotas&&p.cuotas!=='1'?' '+p.cuotas+'c':'')+') '+(p.obs||''),monto,auto:true,venta_id:v.id,pago_metodo:p.id,cuotas:p.cuotas||'1',obs_pago:p.obs||'',recargo_pct:parseFloat(p.recargo_pct)||0,anulado:false});
      });
    } else {
      const montoEf = parseFloat(pagosParaCaja[0].monto)||0;
      if(montoEf > 0) { const pg0=pagosParaCaja[0]; db.insert('movimientos_caja',{id:uid(),caja_id:cajaHoy.id,suc_id:cajaHoy.suc_id,fecha:new Date().toISOString(),tipo:'ingreso',concepto:'Cobro Venta #'+v.numero+' ('+pg0.id+(pg0.cuotas&&pg0.cuotas!=='1'?' '+pg0.cuotas+'c':'')+')',monto:montoEf,auto:true,venta_id:v.id,pago_metodo:pg0.id,cuotas:pg0.cuotas||'1',obs_pago:pg0.obs||'',recargo_pct:parseFloat(pg0.recargo_pct)||0,anulado:false}); }
    }
  }

  // Auto-create postventa pipeline opportunity (non-blocking)
  try {
    if (v.cliente_id) {
      let pvEtapa = db.where('pipeline_etapas', e => e.nombre === 'Postventa' && e.activo !== false)[0];
      if (!pvEtapa) {
        const maxOrd = db.where('pipeline_etapas', () => true).reduce((m, e) => Math.max(m, e.orden || 0), 0) || 0;
        pvEtapa = db.insert('pipeline_etapas', { id: uid(), nombre: 'Postventa', color: '#22c55e', orden: maxOrd + 1, activo: 1 });
      }
      const existing = db.where('pipeline_oportunidades', o => o.venta_id === v.id && o.activo !== false)[0];
      if (!existing) {
        const fe = new Date(); fe.setDate(fe.getDate() + 7);
        db.insert('pipeline_oportunidades', {
          id: uid(), nombre: 'Postventa: ' + (v.cli_nombre || 'Cliente'),
          etapa_id: pvEtapa.id, cliente_id: v.cliente_id,
          cli_nombre: v.cli_nombre || '',
          valor_estimado: 0, probabilidad: 50,
          fecha_creacion: new Date().toISOString(),
          fecha_cierre_estimada: fe.toISOString().substr(0, 10),
          usuario_id: req.user.id, usuario_nombre: req.user.nombre,
          vend_id: v.vend_id || null, vend_nombre: v.vend_nombre_fallback || '',
          suc_id: v.suc_id || null, notas: 'Postventa automática generada al cobrar',
          venta_id: v.id, estado: 'activo', activo: 1
        });
      }
    }
  } catch (e) { /* postventa non-critical */ }

  // Disparar webhook
  try { dispararWebhooks(db, 'venta.cobrada', { venta_id: v.id, numero: v.numero, total: v.total, cliente_id: v.cliente_id, cli_nombre: v.cli_nombre }); } catch(e) {}

  res.json({ok:true});
});

// Anular venta
router.post('/:id/anular', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  const venta = db.findOne('ventas', req.params.id);
  if (!venta || venta.anulada) return res.status(400).json({error:'Venta no válida'});
  if(!permiteSucursal(req.user, venta.suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});

  const hoy = new Date().toISOString().substr(0,10);
  // Una venta NO cobrada es EXPLÍCITAMENTE cobrada:false (pendiente en caja)
  // Cualquier otro valor (true, null, undefined, ventas viejas) = asumir cobrada
  const noCobrada = venta.cobrada === false;
  const estaCobrada = !noCobrada;

  // Buscar caja abierta HOY en la sucursal del usuario logueado
  // La devolución siempre va a la caja del turno actual del cajero
  const cajaSucId = req.user.suc_id || venta.suc_id;
  const cajaAbierta = db.where('cajas',
    c => c.suc_id === cajaSucId && c.fecha.substr(0,10) === hoy && c.estado === 'abierta'
  )[0];

  // Si la venta fue cobrada, EXIGIR caja abierta para poder devolver dinero
  if (estaCobrada && !venta.es_ctacte && !cajaAbierta) {
    return res.status(400).json({
      error: 'La caja está cerrada. Abrí la caja antes de anular una venta cobrada.'
    });
  }

  const todosItems = db.where('venta_items', i => i.venta_id === req.params.id);
  const itemsDevolver = req.body.items_devolver;
  const esParcial = Array.isArray(itemsDevolver) && itemsDevolver.length > 0;

  const itemsADevolver = esParcial
    ? todosItems.filter(it => itemsDevolver.some(d => d.prod_id === it.prod_id))
    : todosItems;

  // Devolver stock
  let montoDevolucion = 0;
  itemsADevolver.forEach(it => {
    const cantDev = esParcial
      ? (itemsDevolver.find(d => d.prod_id === it.prod_id)?.cantidad || it.cantidad)
      : it.cantidad;
    montoDevolucion += it.precio * cantDev;
    const p = db.findOne('productos', it.prod_id);
    if (p) {
      const devSucId = venta.suc_id || req.user.suc_id;
      const sucRes = updateSucStock(db, it.prod_id, devSucId, cantDev);
      if (sucRes) db.insert('stock_movimientos', {
        id: uid(), prod_id: it.prod_id, nombre_prod: p.nombre,
        tipo: 'entrada', cantidad: cantDev,
        stock_antes: sucRes.before, stock_despues: sucRes.after,
        motivo: (esParcial ? 'Devolución parcial' : 'Anulación') + ' Venta #' + venta.numero,
        usuario_id: req.user.id, usuario: req.user.nombre,
        fecha: new Date().toISOString(), suc_id: venta.suc_id
      });
    }
  });

  // Registrar egreso en la caja ABIERTA HOY

  // Registrar egreso en la caja ABIERTA HOY
  if (estaCobrada && !venta.es_ctacte && cajaAbierta && montoDevolucion > 0) {
    const pagoOriginal = venta.pago_principal || venta.pago || 'efectivo';
    const met = req.body.metodo_devolucion === 'mismo' ? pagoOriginal : (req.body.metodo_devolucion || 'efectivo');
    db.insert('movimientos_caja', {
      id: uid(),
      caja_id: cajaAbierta.id,
      suc_id: cajaAbierta.suc_id,
      fecha: new Date().toISOString(),
      tipo: 'egreso',
      concepto: `Devolución ${esParcial?'parcial ':''}Venta #${venta.numero} (${met})`,
      monto: montoDevolucion,
      auto: true,
      venta_id: req.params.id,
      pago_metodo: met,
      anulado: false
    });
  }

  // Cuenta corriente: cancelar movimientos si aplica
  // Covers both: venta created as ctacte AND ventas paid partially with ctacte from caja
  if (venta.es_ctacte || (venta.ctacte_monto && parseFloat(venta.ctacte_monto) > 0))
    db.where('ctacte_movimientos', m => m.venta_id === req.params.id)
      .forEach(m => db.update('ctacte_movimientos', m.id, { cancelado: true }));

  // Actualizar venta
  if (!esParcial) {
    db.update('ventas', req.params.id, {
      anulada: true,
      motivo_anulacion: req.body.motivo || 'Sin motivo',
      anulada_por: req.user.nombre,
      anulada_fecha: new Date().toISOString()
    });
  } else {
    itemsADevolver.forEach(it => {
      const cantDev = itemsDevolver.find(d => d.prod_id === it.prod_id)?.cantidad || it.cantidad;
      db.update('venta_items', it.id, {
        cantidad_devuelta: (it.cantidad_devuelta || 0) + cantDev,
        devolucion_fecha: new Date().toISOString()
      });
    });
    const nuevoTotal = Math.max(0, venta.total - montoDevolucion);
    db.update('ventas', req.params.id, {
      tiene_devolucion_parcial: true,
      devolucion_monto: (venta.devolucion_monto || 0) + montoDevolucion,
      total_original: venta.total_original || venta.total,
      total: nuevoTotal,
      ultima_devolucion_por: req.user.nombre,
      ultima_devolucion_fecha: new Date().toISOString()
    });
  }

  const itemsAnul = todosItems.slice(0,3).map(function(i){return i.nombre+' x'+i.cantidad;}).join(', ');
  db.audit(req.user, venta.suc_id, 'ventas', esParcial?'devolucion_parcial':'anular', (esParcial?'Devolución parcial':'Anulación')+' Venta #'+venta.numero+' | '+itemsAnul, req.params.id);
  res.json({ ok: true, monto_devolucion: montoDevolucion, parcial: esParcial });
});


// GET /:id/items
router.get('/:id/items', (req,res) => {
  const db = _getDB(req);
  const items = db.where('venta_items', i => i.venta_id === req.params.id);
  res.json(items);
});

// PUT /:id/items — edit items before payment (only for pending cobro)
router.put('/:id/items', requireRol('admin','supervisor','cajero'), (req,res) => {
  const db = _getDB(req);
  const venta = db.findOne('ventas', req.params.id);
  if(!venta) return res.status(404).json({error:'No encontrada'});
  if(!permiteSucursal(req.user, venta.suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});
  if(venta.cobrada !== false) return res.status(400).json({error:'Solo se puede editar ventas pendientes de cobro'});
  const {items, total} = req.body;
  if(!items||!items.length) return res.status(400).json({error:'Sin items'});
  const sucId = venta.suc_id;
  // Build map of old quantities
  const oldItems = db.where('venta_items', i=>i.venta_id===req.params.id);
  const oldMap = {};
  oldItems.forEach(i=>{ oldMap[i.prod_id] = (oldMap[i.prod_id]||0) + i.cantidad; });
  // Build map of new quantities
  const newMap = {};
  items.forEach(i=>{ newMap[i.prod_id] = (newMap[i.prod_id]||0) + parseInt(i.cantidad); });
  // Adjust stock: return old, deduct new
  const allProds = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
  allProds.forEach(prodId=>{
    const diff = (newMap[prodId]||0) - (oldMap[prodId]||0);
    if(diff !== 0) {
      updateSucStock(db, prodId, sucId, -diff);
      db.insert('stock_movimientos',{
        id:uid(), prod_id:prodId, nombre_prod:'',
        tipo:diff>0?'salida':'entrada', cantidad:Math.abs(diff),
        stock_antes:0, stock_despues:0,
        motivo:'Edición venta #'+venta.numero+' en caja',
        usuario_id:req.user.id, usuario:req.user.nombre,
        fecha:new Date().toISOString(), suc_id:sucId
      });
    }
  });
  // Delete old items and re-insert
  oldItems.forEach(i=>db.delete('venta_items',i.id));
  items.forEach(it=>{
    db.insert('venta_items',{
      id:uid(), venta_id:req.params.id,
      prod_id:it.prod_id, nombre:it.nombre, talle:it.talle||'',
      precio:parseFloat(it.precio), cantidad:parseInt(it.cantidad),
      subtotal:parseFloat(it.precio)*parseInt(it.cantidad),
      costo:0
    });
  });
  db.update('ventas', req.params.id, {total:parseFloat(total)||0});
  res.json({ok:true});
});

// ── Cambiar método de pago de una venta ya cobrada ──
router.put('/:id/cambiar-pago', requireRol('admin','supervisor','cajero'), (req, res) => {
  const db = _getDB(req);
  const venta = db.findOne('ventas', req.params.id);
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
  if(!permiteSucursal(req.user, venta.suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});
  if (venta.anulada) return res.status(400).json({ error: 'No se puede cambiar el pago de una venta anulada' });
  if (!venta.cobrada) return res.status(400).json({ error: 'La venta aún no fue cobrada. Cobrala primero desde Caja.' });

  const { pago, pago_principal, pagos_detalle, ctacte_monto, suc_id } = req.body;
  if (!pago) return res.status(400).json({ error: 'Método de pago requerido' });

  const sucId = suc_id || req.user.suc_id || venta.suc_id;
  const hoy = new Date().toISOString().substr(0, 10);

  // Solo permitir si la caja está abierta hoy para esa sucursal
  const cajaAbierta = db.where('cajas',
    c => c.suc_id === sucId && c.fecha.substr(0, 10) === hoy && c.estado === 'abierta'
  )[0];
  if (!cajaAbierta) {
    return res.status(400).json({ error: 'La caja está cerrada. Abrí la caja para modificar métodos de pago.' });
  }

  // Anular movimientos_caja existentes de esta venta
  const movsViejos = db.where('movimientos_caja',
    m => m.venta_id === req.params.id && !m.anulado
  );
  for (const m of movsViejos) {
    db.update('movimientos_caja', m.id, { anulado: true });
    // Crear contrapartida para mantener trazabilidad
    db.insert('movimientos_caja', {
      id: 'cm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      caja_id: cajaAbierta.id, suc_id: sucId, fecha: new Date().toISOString(),
      tipo: 'egreso', concepto: 'Corrección pago — anula venta #' + (venta.numero || req.params.id.substr(-6)),
      monto: m.monto, pago_metodo: m.pago_metodo, usuario: req.user.nombre || req.user.usuario,
      auto: false, venta_id: req.params.id,
    });
  }

  // Crear nuevos movimientos_caja según el método corregido
  let detalles = [];
  try { detalles = JSON.parse(pagos_detalle || '[]'); } catch(e) {}
  if (detalles.length === 0) {
    // Pago simple
    const montoTotal = parseFloat(venta.total) - parseFloat(ctacte_monto || 0);
    db.insert('movimientos_caja', {
      id: 'cm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      caja_id: cajaAbierta.id, suc_id: sucId, fecha: new Date().toISOString(),
      tipo: 'ingreso', concepto: 'Cobro corregido venta #' + (venta.numero || req.params.id.substr(-6)),
      monto: montoTotal, pago_metodo: pago, usuario: req.user.nombre || req.user.usuario,
      auto: true, venta_id: req.params.id,
    });
  } else {
    for (const d of detalles) {
      const metodoId = d.id || pago;
      if (metodoId === 'ctacte') continue;
      const monto = parseFloat(d.monto) || 0;
      if (monto <= 0) continue;
      db.insert('movimientos_caja', {
        id: 'cm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        caja_id: cajaAbierta.id, suc_id: sucId, fecha: new Date().toISOString(),
        tipo: 'ingreso', concepto: 'Cobro corregido venta #' + (venta.numero || req.params.id.substr(-6)),
        monto: monto, pago_metodo: metodoId, usuario: req.user.nombre || req.user.usuario,
        auto: true, venta_id: req.params.id,
      });
    }
  }

  // Actualizar venta
  db.update('ventas', req.params.id, {
    pago: pago || 'mixto',
    pago_principal: pago_principal || pago,
    pagos_detalle: pagos_detalle || '[]',
    ctacte_monto: parseFloat(ctacte_monto) || 0,
  });

  db.audit(req.user, null, 'ventas', 'cambiar_pago',
    `Venta #${venta.numero || req.params.id.substr(-6)}: pago cambiado de "${venta.pago}" a "${pago}"`);

  res.json({ ok: true, mensaje: 'Método de pago actualizado' });
});

// ── Comprobante PDF ──
router.get('/:id/comprobante-pdf', (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const db = _getDB(req);
    const venta = enrichVenta(db.findOne('ventas', req.params.id), db);
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
    if(!permiteSucursal(req.user, venta.suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});

    const cfg = db.getConfig();
    const items = db.where('venta_items', i => i.venta_id === req.params.id);
    let pagosDetalle = [];
    try { pagosDetalle = JSON.parse(venta.pagos_detalle || '[]'); } catch(e) {}

    const doc = new PDFDocument({ size: [260, 400], margin: 15, bufferPages: true });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="venta-${venta.numero || venta.id.substr(-8)}.pdf"`);
      res.send(pdf);
    });

    const w = 230;
    let y = 15;
    const center = (text, size = 10, bold = false) => {
      if (bold) doc.font('Helvetica-Bold'); else doc.font('Helvetica');
      doc.fontSize(size).text(text, 15, y, { width: w, align: 'center' });
      y += size + 3;
    };
    const row = (label, value, size = 9) => {
      doc.font('Helvetica').fontSize(size).text(label, 15, y, { width: 130 });
      doc.font('Helvetica-Bold').fontSize(size).text(value, 145, y, { width: 100, align: 'right' });
      y += size + 4;
    };

    center(cfg.nombre || 'FlexCRM', 12, true);
    if (cfg.ticket_cabecera) center(cfg.ticket_cabecera, 8);
    y += 4;
    doc.moveTo(15, y).lineTo(245, y).stroke('#ddd');
    y += 8;
    center('COMPROBANTE DE VENTA', 11, true);
    y += 2;
    center('#' + (venta.numero || venta.id.substr(-8)), 10, true);
    y += 6;
    row('Fecha:', new Date(venta.fecha).toLocaleString('es-AR'), 9);
    if (venta.cli_nombre) row('Cliente:', venta.cli_nombre, 9);
    doc.moveTo(15, y).lineTo(245, y).stroke('#ddd');
    y += 8;
    center('DETALLE', 9, true);
    y += 2;
    items.forEach(it => {
      const name = it.nombre + (it.talle ? ' T:' + it.talle : '');
      row(name, it.cantidad + ' x $' + (it.precio || 0).toLocaleString('es-AR'), 8);
    });
    y += 2;
    doc.moveTo(15, y).lineTo(245, y).stroke('#ddd');
    y += 8;
    row('TOTAL:', '$' + (venta.total || 0).toLocaleString('es-AR'), 11);
    if (pagosDetalle.length > 0) {
      pagosDetalle.forEach(d => {
        if (parseFloat(d.monto) > 0) row((d.id || 'Efectivo'), '$' + parseFloat(d.monto).toLocaleString('es-AR'), 8);
      });
    }
    if (venta.factura_cae) {
      y += 4;
      center('CAE: ' + venta.factura_cae, 8);
      if (venta.factura_fecha_vto) center('Vto CAE: ' + venta.factura_fecha_vto, 8);
    }
    y += 8;
    if (cfg.ticket_pie) center(cfg.ticket_pie, 7);
    y += 4;
    center('¡Gracias por su compra!', 9, true);
    doc.end();
  } catch(e) {
    res.status(500).json({ error: 'Error generando PDF: ' + e.message });
  }
});

module.exports = router;
