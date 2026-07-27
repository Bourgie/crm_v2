// ── SUCURSALES ────────────────────────────────────────────────
const express = require('express');
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol } = require('../middleware/auth');

const sucRouter = express.Router();
sucRouter.use(authMiddleware);
sucRouter.get('/', (req,res) => { const db = _getDB(req); res.json(db.find('sucursales',{activo:true})); });
sucRouter.get('/:id', (req,res) => {
  const db = _getDB(req); const r=db.findOne('sucursales',req.params.id); r?res.json(r):res.status(404).json({error:'No encontrado'}); });
sucRouter.post('/', requireRol('admin'), (req,res) => {
  const db = _getDB(req);
  if(!req.body.nombre) return res.status(400).json({error:'Nombre obligatorio'});
  // Check plan limit
  try {
    const { getEmpresa } = require('../db_master');
    const empresa = getEmpresa(req.user.empresa || 'default');
    if(empresa && empresa.sucursales_max) {
      const total = db.find('sucursales', {activo:true}).length;
      if(total >= empresa.sucursales_max) {
        return res.status(403).json({
          error: `Tu plan permite hasta ${empresa.sucursales_max} sucursal(es). Ya tenés ${total}. Mejorá tu plan para agregar más.`,
          limite_plan: true
        });
      }
    }
  } catch(e) { /* master db check failed, allow creation */ }
  const { nombre, dir, ciudad, tel, email, responsable } = req.body;
  res.json(db.insert('sucursales',{id:'s'+uid(),activo:true,nombre,dir,ciudad,tel,email,responsable}));
});
sucRouter.put('/:id', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  const r=db.update('sucursales',req.params.id,req.body);
  r?res.json({ok:true}):res.status(404).json({error:'No encontrado'});
});
sucRouter.delete('/:id', requireRol('admin'), (req,res) => {
  const db = _getDB(req); db.softDel('sucursales',req.params.id); res.json({ok:true}); });

// ── VENDEDORES ────────────────────────────────────────────────
const vendRouter = express.Router();
vendRouter.use(authMiddleware);
vendRouter.get('/', (req,res) => {
  const db = _getDB(req);
  const sucs=db.all('sucursales');
  res.json(db.find('vendedores',{activo:true}).map(v=>({...v,suc_nombre:(sucs.find(s=>s.id===v.suc_id)||{}).nombre||'—'})));
});
vendRouter.get('/:id', (req,res) => {
  const db = _getDB(req); const r=db.findOne('vendedores',req.params.id); r?res.json(r):res.status(404).json({error:'No encontrado'}); });
vendRouter.post('/', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  if(!req.body.nombre) return res.status(400).json({error:'Nombre obligatorio'});
  const { nombre, apellido, dni, tel, email, rol, suc_id, suc_nombre, comision } = req.body;
  res.json(db.insert('vendedores',{id:'v'+uid(),activo:true,comision:comision??0,nombre,apellido,dni,tel,email,rol,suc_id,suc_nombre}));
});
vendRouter.put('/:id', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  const r=db.update('vendedores',req.params.id,req.body);
  r?res.json({ok:true}):res.status(404).json({error:'No encontrado'});
});
vendRouter.delete('/:id', requireRol('admin'), (req,res) => {
  const db = _getDB(req); db.softDel('vendedores',req.params.id); res.json({ok:true}); });

// ── PROVEEDORES ───────────────────────────────────────────────
const provRouter = express.Router();
provRouter.use(authMiddleware);
provRouter.get('/', (req,res) => { const db = _getDB(req); res.json(db.find('proveedores',{activo:true})); });

// GET ordenes for a specific provider — includes both prov_oc and prov_ordenes
// Used by factura OC selector
provRouter.get('/:id/ordenes', authMiddleware, (req,res) => {
  const db = _getDB(req);
  const pid = req.params.id;
  // Formal OCs (prov_oc table)
  const formalOCs = db.all('prov_oc')
    .flatMap(o => o.prov_id === pid && o.estado !== 'cancelada' ? [{
      id: o.id,
      label: 'OC #' + (o.numero||o.id.substr(-4)) + (o.notas?' — '+o.notas.substr(0,30):''),
      monto: o.total||0,
      fecha: o.fecha,
      tipo: 'oc'
    }] : []);
  // Simple purchase orders (prov_ordenes table)
  const simpleOCs = db.all('prov_ordenes')
    .flatMap(o => o.prov_id === pid && !o.eliminada && !o.cancelada ? [{
      id: o.id,
      label: (o.concepto||'Compra') + (o.nro_factura?' Nro '+o.nro_factura:'') + ' — ' + fmt(o.monto),
      monto: o.monto||0,
      fecha: o.fecha,
      tipo: 'orden'
    }] : []);
  const all = [...formalOCs, ...simpleOCs].sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
  res.json(all);

  function fmt(n){ return '$' + (parseFloat(n)||0).toLocaleString('es-AR'); }
});
provRouter.post('/', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  if(!req.body.nombre) return res.status(400).json({error:'Nombre obligatorio'});
  const { nombre, apellido, tel, email, direccion, ciudad, notas, cuit, razon_social, condicion_iva } = req.body;
  res.json(db.insert('proveedores',{id:'pr'+uid(),activo:true,nombre,apellido,tel,email,direccion,ciudad,notas,cuit,razon_social,condicion_iva}));
});
provRouter.put('/:id', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req); db.update('proveedores',req.params.id,req.body); res.json({ok:true}); });
provRouter.delete('/:id', requireRol('admin'), (req,res) => {
  const db = _getDB(req); db.softDel('proveedores',req.params.id); res.json({ok:true}); });


// ── Proveedor: órdenes de compra y deudas ──
provRouter.get('/:id/deudas', authMiddleware, (req,res) => {
  const db = _getDB(req);
  const ordenes = db.where('prov_ordenes', o => o.prov_id===req.params.id && !o.eliminada)
    .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const pagos = db.where('prov_pagos', p => p.prov_id===req.params.id)
    .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const totalOrdenes = ordenes.filter(o=>!o.cancelada).reduce((a,o)=>a+o.monto,0);
  const totalPagos = pagos.reduce((a,p)=>a+p.monto,0);
  res.json({ ordenes, pagos, saldo: totalOrdenes-totalPagos });
});

provRouter.post('/:id/ordenes', authMiddleware, requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  const {concepto, monto, vto, notas, nro_factura, fecha, recibio, pagado_al_recibir, forma_pago_inicial} = req.body;
  if(!monto) return res.status(400).json({error:'Monto requerido'});
  const id = require('../db_sqlite').uid();
  const pagado = parseFloat(pagado_al_recibir)||0;
  db.insert('prov_ordenes',{
    id, prov_id:req.params.id,
    concepto: concepto||'Compra',
    nro_factura: nro_factura||'',
    recibio: recibio||req.user.nombre,
    monto: parseFloat(monto),
    pagado_al_recibir: pagado,
    saldo: parseFloat(monto)-pagado,
    forma_pago_inicial: forma_pago_inicial||'pendiente',
    vto: vto||null, notas: notas||'',
    fecha: fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
    cancelada: pagado>=parseFloat(monto), eliminada:false
  });
  res.json({id,ok:true});
});

provRouter.post('/:id/pagos', authMiddleware, requireRol('admin','supervisor','cajero'), (req,res) => {
  const db = _getDB(req);
  const {monto, concepto, metodo, fecha, nro_comprobante} = req.body;
  if(!monto) return res.status(400).json({error:'Monto requerido'});
  const id = require('../db_sqlite').uid();
  db.insert('prov_pagos',{id,prov_id:req.params.id,monto:parseFloat(monto),concepto:concepto||'Pago proveedor',metodo:metodo||'efectivo',fecha:fecha||new Date().toISOString(),nro_comprobante:nro_comprobante||'',registrado_por:req.user.nombre});
  // Mark oldest unpaid ordenes as cancelled if fully covered
  const ordenes = db.where('prov_ordenes',o=>o.prov_id===req.params.id&&!o.cancelada&&!o.eliminada);
  const pagos = db.where('prov_pagos',p=>p.prov_id===req.params.id);
  const totalPagado = pagos.reduce((a,p)=>a+p.monto,0);
  let acum = 0;
  ordenes.sort((a,b)=>new Date(a.fecha)-new Date(b.fecha)).forEach(o=>{
    acum+=o.monto;
    if(acum<=totalPagado) db.update('prov_ordenes',o.id,{cancelada:true});
  });
  res.json({id,ok:true});
});

module.exports = { sucRouter, vendRouter, provRouter };

// Consolidated deudas for all suppliers
provRouter.get('/todas-deudas', authMiddleware, (req,res) => {
  const db = _getDB(req);
  const proveedores = db.find('proveedores',{activo:true});
  const result = proveedores.map(p => {
    const ordenes = db.where('prov_ordenes', o => o.prov_id===p.id && !o.eliminada);
    const pagos = db.where('prov_pagos', p2 => p2.prov_id===p.id);
    const totalOrdenes = ordenes.filter(o=>!o.cancelada).reduce((a,o)=>a+o.monto,0);
    const totalPagos = pagos.reduce((a,p)=>a+p.monto,0);
    return {
      id: p.id, nombre: p.nombre, cuit: p.cuit,
      saldo: totalOrdenes - totalPagos,
      total_ordenes: totalOrdenes,
      total_pagos: totalPagos,
      cant_ordenes: ordenes.filter(o=>!o.cancelada).length,
      cant_pagos: pagos.length,
      tiene_deuda: (totalOrdenes - totalPagos) > 0
    };
  });
  const totalDeuda = result.reduce((a,p)=>a+Math.max(0,p.saldo),0);
  const conDeuda = result.filter(p => p.tiene_deuda).length;
  res.json({ proveedores: result, total_deuda: totalDeuda, con_deuda: conDeuda, total_proveedores: proveedores.length });
});

// ── Pagos por proveedor ──
provRouter.get('/:id/pagos', authMiddleware, (req,res) => {
  const db = _getDB(req);
  const pagos = db.where('prov_pagos_fact', p => p.prov_id === req.params.id)
    .sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
  res.json(pagos);
});

// ── Pago libre a proveedor (sin factura específica) ──
provRouter.post('/:id/pago-libre', authMiddleware, (req,res) => {
  const db = _getDB(req);
  const prov = db.findOne('proveedores', req.params.id);
  if(!prov) return res.status(404).json({error:'Proveedor no encontrado'});
  const {monto,fecha,metodo,nro_comprobante,concepto,registrado_por} = req.body;
  const m = parseFloat(monto)||0;
  if(m<=0) return res.status(400).json({error:'Monto inválido'});
  db.insert('prov_pagos_fact',{id:uid(),fact_id:null,prov_id:req.params.id,monto:m,
    fecha:fecha||new Date().toISOString().substr(0,10),
    metodo,nro_comprobante,concepto,registrado_por});
  res.json({ok:true});
});

// ── Órdenes de Compra ──
const ocRouter = require('express').Router();
ocRouter.use(require('../middleware/auth').authMiddleware);

ocRouter.get('/', (req,res) => {
  const db = _getDB(req);
  const {prov_id, estado} = req.query;
  let rows = db.all('prov_oc');
  if(prov_id) rows = rows.filter(o=>o.prov_id===prov_id);
  if(estado) rows = rows.filter(o=>o.estado===estado);
  const provs = db.all('proveedores');
  rows = rows.map(o=>({...o, prov_nombre:(provs.find(p=>p.id===o.prov_id)||{}).nombre||''}));
  res.json(rows.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)));
});

ocRouter.post('/', (req,res) => {
  const db = _getDB(req);
  const {prov_id,items,total,notas,fecha_entrega_est,estado} = req.body;
  if(!prov_id) return res.status(400).json({error:'Proveedor requerido'});
  const id=uid(), fecha=new Date().toISOString();
  const ocs=db.all('prov_oc');
  const numero=(ocs.length?Math.max(...ocs.map(o=>o.numero||0)):0)+1;
  db.insert('prov_oc',{id,numero,prov_id,items:items||[],total:parseFloat(total)||0,notas:notas||'',fecha,fecha_entrega_est:fecha_entrega_est||null,estado:estado||'borrador',creado_por:req.user.nombre});
  res.json({id,numero,ok:true});
});

ocRouter.get('/:id', (req,res) => {
  const db = _getDB(req);
  const oc = db.findOne('prov_oc',req.params.id);
  if(!oc) return res.status(404).json({error:'No encontrado'});
  const prov = db.findOne('proveedores',oc.prov_id)||{};
  res.json({...oc, prov_nombre:prov.nombre||''});
});

ocRouter.patch('/:id/estado', (req,res) => {
  const db = _getDB(req);
  const {estado} = req.body;
  db.update('prov_oc',req.params.id,{estado});
  res.json({ok:true});
});

ocRouter.post('/:id/recibir', (req,res) => {
  const db = _getDB(req);
  const oc = db.findOne('prov_oc',req.params.id);
  if(!oc) return res.status(404).json({error:'No encontrado'});
  db.update('prov_oc',req.params.id,{estado:'recibida_total',fecha_recepcion:new Date().toISOString()});
  res.json({ok:true});
});

// ── Facturas de Proveedores ──
const factProvRouter = require('express').Router();
factProvRouter.use(require('../middleware/auth').authMiddleware);

factProvRouter.get('/', (req,res) => {
  const db = _getDB(req);
  const {prov_id, estado} = req.query;
  let rows = db.all('prov_facturas');
  if(prov_id) rows = rows.filter(f=>f.prov_id===prov_id);
  const hoy = new Date().toISOString().substr(0,10);
  if(estado==='vencida') rows = rows.filter(f=>f.vencimiento&&f.vencimiento<hoy&&f.saldo>0);
  else if(estado==='pendiente') rows = rows.filter(f=>f.saldo>0&&(!f.vencimiento||f.vencimiento>=hoy));
  else if(estado==='pagada_parcial') rows = rows.filter(f=>f.pagado>0&&f.saldo>0);
  else if(estado==='pagada_total') rows = rows.filter(f=>f.saldo<=0);
  const provs = db.all('proveedores');
  // Include pagos list per factura
  rows = rows.map(f=>{
    const pagos = db.where('prov_pagos_fact', p => p.fact_id === f.id);
    return {...f,
      prov_nombre:(provs.find(p=>p.id===f.prov_id)||{}).nombre||'',
      pagos
    };
  });
  res.json(rows.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)));
});

factProvRouter.post('/', (req,res) => {
  const db = _getDB(req);
  const {prov_id,nro_factura,fecha,recibio,monto,pagado,forma_pago_inicial,condicion_pago,vencimiento,oc_id,notas,saldo} = req.body;
  if(!prov_id||!nro_factura||!monto) return res.status(400).json({error:'Datos incompletos'});
  const id=uid();
  db.insert('prov_facturas',{id,prov_id,nro_factura,fecha:fecha||new Date().toISOString().substr(0,10),recibio,monto:parseFloat(monto),pagado:parseFloat(pagado)||0,saldo:parseFloat(saldo||monto-(pagado||0)),condicion_pago,vencimiento,oc_id:oc_id||null,notas:notas||'',forma_pago_inicial});
  res.json({id,ok:true});
});

factProvRouter.post('/:id/pagos', (req,res) => {
  const db = _getDB(req);
  const fact = db.findOne('prov_facturas',req.params.id);
  if(!fact) return res.status(404).json({error:'No encontrado'});
  const {monto,fecha,metodo,nro_comprobante,concepto,registrado_por} = req.body;
  const m = parseFloat(monto)||0;
  db.insert('prov_pagos_fact',{id:uid(),fact_id:req.params.id,prov_id:fact.prov_id,monto:m,fecha:fecha||new Date().toISOString().substr(0,10),metodo,nro_comprobante,concepto,registrado_por});
  const nuevoSaldo = Math.max(0, (fact.saldo||0) - m);
  db.update('prov_facturas',req.params.id,{pagado:(fact.pagado||0)+m,saldo:nuevoSaldo});
  res.json({ok:true,saldo_nuevo:nuevoSaldo});
});

module.exports = { sucRouter, vendRouter, provRouter, ocRouter, factProvRouter };
