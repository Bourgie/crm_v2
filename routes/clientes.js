const express = require('express');
const router = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol } = require('../middleware/auth');
const { validate, clienteSchema } = require('../middleware/validate');
router.use(authMiddleware);

function calcScore(cli_id, db) {
  const ventas = db.where('ventas', v => v.cliente_id === cli_id && !v.anulada);
  if (!ventas.length) return { score: 0, clase: 'Nuevo', color: '#71717A' };
  const total = ventas.reduce((a,v) => a+v.total, 0);
  const now = new Date();
  const ultima = new Date(Math.max(...ventas.map(v => new Date(v.fecha))));
  const diasSinComprar = Math.floor((now-ultima)/(1000*60*60*24));
  // Chequear deudas vencidas
  const deudas = db.where('ctacte_movimientos', m => m.cliente_id === cli_id && m.tipo==='deuda' && !m.cancelado);
  const tieneVencida = deudas.some(d => d.fecha_vto && new Date(d.fecha_vto) < now);
  let score = 0;
  if (ventas.length >= 10) score += 30;
  else if (ventas.length >= 5) score += 20;
  else if (ventas.length >= 2) score += 10;
  if (total >= 100000) score += 30;
  else if (total >= 50000) score += 20;
  else if (total >= 20000) score += 10;
  if (diasSinComprar <= 30) score += 30;
  else if (diasSinComprar <= 60) score += 20;
  else if (diasSinComprar <= 90) score += 10;
  if (tieneVencida) score = Math.max(0, score - 20);
  let clase, color;
  if (score >= 75) { clase = 'VIP'; color = '#7C3AED'; }
  else if (score >= 50) { clase = 'Frecuente'; color = '#2563EB'; }
  else if (score >= 25) { clase = 'Ocasional'; color = '#16A34A'; }
  else { clase = diasSinComprar > 90 ? 'Inactivo' : 'Nuevo'; color = diasSinComprar > 90 ? '#DC2626' : '#71717A'; }
  return { score, clase, color, diasSinComprar, totalCompras: total, cantCompras: ventas.length };
}

router.get('/', (req, res) => {
  const db = _getDB(req);
  const q = (req.query.q||'').toLowerCase();
  let rows = db.find('clientes',{activo:true});
  if (q) rows = rows.filter(c => (c.nombre+' '+c.apellido+c.dni+c.tel+c.email).toLowerCase().includes(q));
  const ventas = db.all('ventas');
  const ctacte = db.all('ctacte_movimientos');
  rows = rows.map(c => {
    const cv = ventas.filter(v=>v.cliente_id===c.id&&!v.anulada);
    const saldoCtacte = ctacte.filter(m=>m.cliente_id===c.id&&!m.cancelado).reduce((a,m)=>a+(m.tipo==='deuda'?m.monto:m.tipo==='pago'?-m.monto:0),0);
    return { ...c, compras: cv.length, total_gastado: cv.reduce((a,v)=>a+v.total,0), saldo_ctacte: saldoCtacte, ...calcScore(c.id, db) };
  });
  if (req.query.sort === 'score') rows.sort((a,b)=>b.score-a.score);
  res.json(rows);
});

router.get('/listas', (req,res) => res.json({
  listas:[
    {id:1,nombre:'Lista 1 — Público general',descripcion:'Precio de venta sin descuento',color:'#6B7280'},
    {id:2,nombre:'Lista 2 — Cliente frecuente / VIP',descripcion:'Precio con descuento especial',color:'#2563EB'},
    {id:3,nombre:'Lista 3 — Mayorista',descripcion:'Precio mayorista',color:'#7C3AED'},
  ]
}));

router.get('/:id', (req,res) => {
  const db = _getDB(req);
  const c = db.findOne('clientes',req.params.id);
  if (!c) return res.status(404).json({error:'No encontrado'});
  const sucs = db.all('sucursales'); const vends = db.all('vendedores');
  const ventas = db.where('ventas',v=>v.cliente_id===req.params.id&&!v.anulada)
    .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,20)
    .map(v=>({...v, suc_nombre:(sucs.find(s=>s.id===v.suc_id)||{}).nombre||'—', vend_nombre:(()=>{const vd=vends.find(x=>x.id===v.vend_id);return vd?vd.nombre+' '+vd.apellido:'—';})()}));
  const ctacte = db.where('ctacte_movimientos',m=>m.cliente_id===req.params.id).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const pendientes = db.where('pendientes',p=>p.cliente_id===req.params.id&&p.estado!=='entregado');
  res.json({...c, ventas, ctacte, pendientes, ...calcScore(req.params.id, db)});
});

router.post('/', validate(clienteSchema), (req,res) => {
  const db = _getDB(req);
  if(!req.body.nombre) return res.status(400).json({error:'Nombre obligatorio'});
  const { nombre, apellido, dni, tel, email, ciudad, bebe_nac, notas, lista, limite_credito, suc_origen, direccion, provincia, cp, fecha_nac, genero, categoria, vend_id, tipo_doc, web_id, puntos, condicion_fiscal } = req.body;
  if (dni) {
    const dniExiste = db.where('clientes', c => c.dni === dni && c.activo !== false && c.activo != 0)[0];
    if (dniExiste) return res.status(400).json({ error: 'El DNI/CUIT ya está registrado en otro cliente' });
  }
  if (email) {
    const emailExiste = db.where('clientes', c => c.email?.toLowerCase() === email.toLowerCase() && c.activo !== false && c.activo != 0)[0];
    if (emailExiste) return res.status(400).json({ error: 'El email ya está registrado en otro cliente' });
  }
  if (tel) {
    const telExiste = db.where('clientes', c => c.tel === tel && c.activo !== false && c.activo != 0)[0];
    if (telExiste) return res.status(400).json({ error: 'El teléfono ya está registrado en otro cliente' });
  }
  const r = db.insert('clientes',{id:'c'+uid(),lista:lista??1,limite_credito:limite_credito??20000,activo:true,creado:new Date().toISOString(),nombre,apellido,dni,tel,email,ciudad,bebe_nac,notas,suc_origen,direccion,provincia,cp,fecha_nac,genero,categoria,vend_id,tipo_doc,web_id,puntos,condicion_fiscal:condicion_fiscal||'cf'});
  try { const { dispararWebhooks } = require('./webhooks'); dispararWebhooks(db, 'cliente.creado', { cliente_id: r.id, nombre: r.nombre, tel: r.tel, email: r.email }); } catch(e) {}
  res.json(r);
});
router.put('/:id', validate(clienteSchema), (req,res) => {
  const db = _getDB(req);
  const { dni, email, tel } = req.body;
  if (dni) {
    const dniExiste = db.where('clientes', c => c.dni === dni && c.id !== req.params.id && c.activo !== false && c.activo != 0)[0];
    if (dniExiste) return res.status(400).json({ error: 'El DNI/CUIT ya está registrado en otro cliente' });
  }
  if (email) {
    const emailExiste = db.where('clientes', c => c.email?.toLowerCase() === email.toLowerCase() && c.id !== req.params.id && c.activo !== false && c.activo != 0)[0];
    if (emailExiste) return res.status(400).json({ error: 'El email ya está registrado en otro cliente' });
  }
  if (tel) {
    const telExiste = db.where('clientes', c => c.tel === tel && c.id !== req.params.id && c.activo !== false && c.activo != 0)[0];
    if (telExiste) return res.status(400).json({ error: 'El teléfono ya está registrado en otro cliente' });
  }
  const r=db.update('clientes',req.params.id,req.body);
  if(r){db.audit(req.user, null, 'clientes', 'editar', 'Edit cliente '+req.params.id, req.params.id);res.json({ok:true});}else{res.status(404).json({error:'No encontrado'});}
});
router.delete('/:id', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req); db.softDel('clientes',req.params.id); res.json({ok:true}); });

// ── Merge clientes duplicados ──
router.post('/merge', requireRol('admin'), (req,res) => {
  const db = _getDB(req);
  const { origen_id, destino_id } = req.body;
  if (!origen_id || !destino_id) return res.status(400).json({error:'origen_id y destino_id requeridos'});
  if (origen_id === destino_id) return res.status(400).json({error:'Los IDs deben ser diferentes'});
  const origen = db.findOne('clientes', origen_id);
  const destino = db.findOne('clientes', destino_id);
  if (!origen || !destino) return res.status(404).json({error:'Cliente no encontrado'});
  // Reasignar relaciones de origen a destino
  const relaciones = [
    'ventas', 'ctacte_movimientos', 'pendientes', 'puntos_movimientos',
    'postventas', 'pipeline_oportunidades'
  ];
  relaciones.forEach(tabla => {
    db.where(tabla, r => r.cliente_id === origen_id).forEach(r => {
      db.update(tabla, r.id, { cliente_id: destino_id });
    });
  });
  // Merge campos vacíos en destino con valores de origen
  const camposMerge = ['tel','email','dni','dir','notas'];
  const upd = {};
  camposMerge.forEach(c => { if (!destino[c] && origen[c]) upd[c] = origen[c]; });
  if (Object.keys(upd).length) db.update('clientes', destino_id, upd);
  // Sumar puntos
  if (origen.puntos) {
    db.update('clientes', destino_id, { puntos: (destino.puntos||0) + (origen.puntos||0) });
  }
  db.softDel('clientes', origen_id);
  db.audit(req.user, null, 'clientes', 'merge', `Merge cli ${origen_id} → ${destino_id}`, destino_id);
  res.json({ok:true, destino: db.findOne('clientes', destino_id)});
});

// ── Puntos / Fidelización ──
router.get('/:id/puntos', (req,res) => {
  const db = _getDB(req);
  const cli = db.findOne('clientes', req.params.id);
  if(!cli) return res.status(404).json({error:'No encontrado'});
  const movs = db.where('puntos_movimientos', m=>m.cliente_id===req.params.id)
    .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  res.json({puntos: cli.puntos||0, movimientos: movs});
});

router.post('/:id/puntos', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  const cli = db.findOne('clientes', req.params.id);
  if(!cli) return res.status(404).json({error:'No encontrado'});
  const {tipo, puntos, motivo} = req.body; // tipo: 'suma'|'resta'|'canje'
  if(!puntos||puntos<=0) return res.status(400).json({error:'Puntos inválidos'});
  const delta = tipo==='resta'||tipo==='canje' ? -Math.abs(puntos) : Math.abs(puntos);
  const nuevos = Math.max(0, (cli.puntos||0) + delta);
  db.update('clientes', req.params.id, {puntos: nuevos});
  db.insert('puntos_movimientos', {
    id:'pm'+uid(), cliente_id:req.params.id,
    tipo, puntos:delta, motivo:motivo||tipo,
    referencia_id:null, fecha:new Date().toISOString()
  });
  res.json({ok:true, puntos:nuevos});
});

// ── Historial de compras ──
router.get('/:id/historial', (req,res) => {
  const db = _getDB(req);
  const ventas = db.where('ventas', v=>v.cliente_id===req.params.id&&!v.anulada)
    .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,50);
  const vIds = new Set(ventas.map(v=>v.id));
  const items = db.where('venta_items', i=>vIds.has(i.venta_id));
  const sucs = db.all('sucursales');
  res.json(ventas.map(v=>({
    ...v,
    suc_nombre:(sucs.find(s=>s.id===v.suc_id)||{}).nombre||'—',
    items: items.filter(i=>i.venta_id===v.id)
  })));
});

// ── Stats para ficha ──
router.get('/:id/stats', (req,res) => {
  const db = _getDB(req);
  const ventas = db.where('ventas', v=>v.cliente_id===req.params.id&&!v.anulada);
  const total = ventas.reduce((a,v)=>a+v.total,0);
  const ultima = ventas.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha))[0];
  const vIds = new Set(ventas.map(v=>v.id));
  const items = db.where('venta_items', i=>vIds.has(i.venta_id));
  const prodMap = {};
  items.forEach(i=>{
    if(!prodMap[i.nombre]) prodMap[i.nombre]={nombre:i.nombre,qty:0};
    prodMap[i.nombre].qty+=i.cantidad;
  });
  const top = Object.values(prodMap).sort((a,b)=>b.qty-a.qty).slice(0,3);
  const cli = db.findOne('clientes', req.params.id);
  // Cumpleaños bebe
  const hoy = new Date();
  let diasCumple = null;
  if(cli&&cli.bebe_nac){
    const nac = new Date(cli.bebe_nac);
    const next = new Date(hoy.getFullYear(), nac.getMonth(), nac.getDate());
    if(next < hoy) next.setFullYear(hoy.getFullYear()+1);
    diasCumple = Math.ceil((next-hoy)/86400000);
  }
  res.json({
    total_compras:total, n_ventas:ventas.length,
    ticket_prom:ventas.length?total/ventas.length:0,
    ultima_compra:ultima?ultima.fecha:null,
    top_productos:top,
    dias_cumple:diasCumple,
    puntos:cli?cli.puntos||0:0
  });
});

module.exports = router;
