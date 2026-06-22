const express = require('express');
const router = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol } = require('../middleware/auth');
const { updateSucStock } = require('./stock_helpers');
router.use(authMiddleware);

router.get('/', (req,res) => {
  const db = _getDB(req);
  const {q, cat, favoritos, viewer_suc, suc_id} = req.query;
  // viewer_suc or suc_id must be provided — without it stock would be global (wrong)
  const sucId = viewer_suc || suc_id || req.user?.suc_id || null;
  let rows = db.find('productos', {activo:true});
  if (q) rows = rows.filter(p => (p.nombre+p.sku+p.color).toLowerCase().includes(q.toLowerCase()));
  if (cat) rows = rows.filter(p => p.categoria === cat);
  if (favoritos==='true') rows = rows.filter(p => p.favorito);
  // Always enrich with per-suc stock — stock field = stock_actual for this suc
  rows = rows.map(r => {
    const enriched = db.enrichProduct(r, sucId);
    const varCount = db.find('producto_variantes',{producto_id:r.id,activo:true}).length;
    return {...enriched, num_variantes: varCount};
  });
  res.json(rows);
});

router.get('/categorias', (req,res) => {
  const db = _getDB(req);
  const cats = db.find('categorias',{activo:true}).map(c=>c.nombre).sort();
  if (cats.length) return res.json(cats);
  // fallback: extract from products
  res.json([...new Set(db.find('productos',{activo:true}).map(p=>p.categoria).filter(Boolean))].sort());
});

router.get('/categorias/list', (req,res) => {
  const db = _getDB(req);
  res.json(db.find('categorias',{activo:true}) || []);
});

router.post('/categorias', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  if (!req.body.nombre) return res.status(400).json({error:'Nombre obligatorio'});
  const c = db.insert('categorias',{id:'cat'+uid(),nombre:req.body.nombre.trim(),icono:req.body.icono||'📦',activo:true});
  res.json(c);
});

router.put('/categorias/:id', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  const existing = db.findOne('categorias', req.params.id);
  if (!existing) return res.status(404).json({error:'No encontrada'});
  db.update('categorias', req.params.id, {nombre:req.body.nombre?.trim(),icono:req.body.icono});
  res.json({ok:true});
});

router.delete('/categorias/:id', requireRol('admin'), (req,res) => {
  const db = _getDB(req);
  db.softDel('categorias', req.params.id);
  res.json({ok:true});
});

router.get('/sin-rotacion', (req,res) => {
  const db = _getDB(req);
  const dias = parseInt(req.query.dias)||60;
  const desde = new Date(); desde.setDate(desde.getDate()-dias);
  const vendidos = new Set(db.where('venta_items',i=>{
    const v=db.findOne('ventas',i.venta_id);
    return v&&!v.anulada&&new Date(v.fecha)>=desde;
  }).map(i=>i.prod_id));
  const sucId = req.query.suc_id || req.user?.suc_id || null;
  res.json(db.find('productos',{activo:true}).filter(p=>!vendidos.has(p.id)).map(r=>db.enrichProduct(r,sucId)));
});

router.get('/ranking-rotacion', (req,res) => {
  const db = _getDB(req);
  const dias = parseInt(req.query.dias)||30;
  const desde = new Date(); desde.setDate(desde.getDate()-dias);
  const map = {};
  db.where('venta_items',i=>{
    const v=db.findOne('ventas',i.venta_id);
    return v&&!v.anulada&&new Date(v.fecha)>=desde;
  }).forEach(i=>{
    if(!map[i.prod_id])map[i.prod_id]={prod_id:i.prod_id,nombre:i.nombre,qty:0,total:0};
    map[i.prod_id].qty+=i.cantidad;map[i.prod_id].total+=i.subtotal;
  });
  res.json(Object.values(map).sort((a,b)=>b.qty-a.qty));
});

router.get('/:id', (req,res) => {
  const db = _getDB(req);
  const prod = db.findOne('productos', req.params.id);
  if (!prod) return res.status(404).json({error:'No encontrado'});
  const sucId = req.query.suc_id || req.user?.suc_id || null;
  const enriched = db.enrichProduct(prod, sucId);
  // Include variants
  const variants = db.find('producto_variantes',{producto_id:req.params.id,activo:true})
    .sort((a,b) => (a.orden||0) - (b.orden||0))
    .map(v => {
      const stocks = db.find('variante_stock_suc',{variante_id:v.id});
      const stock_suc = {};
      stocks.forEach(s => { stock_suc[s.suc_id] = s.cantidad; });
      const stock_total = stocks.reduce((a,s) => a+s.cantidad, 0);
      const stock_actual = sucId ? (stock_suc[sucId] ?? 0) : 0;
      try { v.atributos = typeof v.atributos === 'string' ? JSON.parse(v.atributos) : v.atributos; } catch {}
      return {...v, stock_suc, stock_total, stock_actual};
    });
  // Filter movements by suc_id — each suc only sees its own stock history
  const movs = db.where('stock_movimientos', m => {
    if (m.prod_id !== req.params.id) return false;
    if (sucId && m.suc_id && m.suc_id !== sucId) return false;
    return true;
  }).sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 30);
  res.json({...enriched, variantes: variants, movimientos: movs});
});

router.post('/', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  if(!req.body.nombre||!req.body.precio_l1) return res.status(400).json({error:'Nombre y precio L1 obligatorios'});
  const body = req.body;
  // Products are global — no suc_id, no stock column
  // Stock per-suc is managed via ajuste (POST /:id/ajuste)
  const cleanBody = {...body};
  delete cleanBody.stock; delete cleanBody.stock_suc; delete cleanBody.suc_id;
  const p = db.insert('productos',{id:'p'+uid(),activo:true,stock_min:3,stock_max:20,favorito:false,precio_l2:body.precio_l1,precio_l3:body.precio_l1,...cleanBody});
  res.json(p);
});

router.put('/:id', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  const existing = db.findOne('productos', req.params.id);
  if (!existing) return res.status(404).json({error:'No encontrado'});
  // Never overwrite stock via PUT — use /ajuste for that
  const updates = {...req.body};
  delete updates.stock; delete updates.stock_suc; delete updates.suc_id;
  const r = db.update('productos', req.params.id, updates);
  r ? res.json({ok:true}) : res.status(404).json({error:'No encontrado'});
});

// ── Variantes ──────────────────────────────────────────────────
router.get('/:id/variantes', (req,res) => {
  const db = _getDB(req);
  const vars = db.find('producto_variantes',{producto_id:req.params.id,activo:true})
    .sort((a,b) => (a.orden||0) - (b.orden||0));
  // Enrich each variant with stock per branch
  const sucId = req.query.suc_id || req.user?.suc_id || null;
  const allSucs = db.all('sucursales');
  const enriched = vars.map(v => {
    const stocks = db.find('variante_stock_suc',{variante_id:v.id});
    const stock_suc = {};
    stocks.forEach(s => { stock_suc[s.suc_id] = s.cantidad; });
    const stock_total = stocks.reduce((a,s) => a+s.cantidad, 0);
    const stock_actual = sucId ? (stock_suc[sucId] ?? 0) : 0;
    try { v.atributos = typeof v.atributos === 'string' ? JSON.parse(v.atributos) : v.atributos; } catch {}
    return {...v, stock_suc, stock_total, stock_actual};
  });
  res.json(enriched);
});

router.post('/:id/variantes', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  const p = db.findOne('productos', req.params.id);
  if (!p) return res.status(404).json({error:'Producto no encontrado'});
  const body = req.body;
  const v = db.insert('producto_variantes',{
    id:'var'+uid(), producto_id:req.params.id,
    nombre: body.nombre || p.nombre,
    sku: body.sku || '',
    codigo_barras: body.codigo_barras || '',
    atributos: typeof body.atributos === 'object' ? JSON.stringify(body.atributos) : (body.atributos || '{}'),
    costo: parseFloat(body.costo) || 0,
    precio_l1: parseFloat(body.precio_l1) || 0,
    precio_l2: parseFloat(body.precio_l2) || 0,
    precio_l3: parseFloat(body.precio_l3) || 0,
    orden: body.orden || 0, activo: true,
  });
  res.json(v);
});

router.put('/:id/variantes/:varId', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  const existing = db.findOne('producto_variantes', req.params.varId);
  if (!existing) return res.status(404).json({error:'Variante no encontrada'});
  const upd = {...req.body};
  if (typeof upd.atributos === 'object') upd.atributos = JSON.stringify(upd.atributos);
  db.update('producto_variantes', req.params.varId, upd);
  res.json({ok:true});
});

router.delete('/:id/variantes/:varId', requireRol('admin'), (req,res) => {
  const db = _getDB(req);
  db.softDel('producto_variantes', req.params.varId);
  res.json({ok:true});
});

// Ajuste de stock para variante
router.post('/:id/variantes/:varId/ajuste', requireRol('admin','supervisor','cajero'), (req,res) => {
  const db = _getDB(req);
  const {cantidad, motivo, tipo} = req.body;
  const v = db.findOne('producto_variantes', req.params.varId);
  if(!v) return res.status(404).json({error:'Variante no encontrada'});
  const delta = tipo==='salida' ? -Math.abs(cantidad) : Math.abs(cantidad);
  const suc_id = req.body.suc_id || (req.user && req.user.suc_id);
  if (!suc_id) return res.status(400).json({error:'Sucursal requerida'});
  const before = db.getStockSucVariant ? db.getStockSucVariant(req.params.varId, suc_id) : 0;
  const after = Math.max(0, before + delta);
  db.insert('variante_stock_suc',{variante_id:req.params.varId, suc_id, cantidad:after});
  // Also log in stock_movimientos
  db.insert('stock_movimientos',{
    id:uid(), prod_id:req.params.id, nombre_prod:v.nombre||'variante',
    tipo, cantidad:delta, stock_antes:before, stock_despues:after,
    motivo:motivo||tipo, usuario_id:req.user.id, usuario:req.user.nombre,
    fecha:new Date().toISOString(), suc_id
  });
  res.json({ok:true, stock_actual:after, suc_id});
});

// Ajuste manual de stock
router.post('/:id/ajuste', requireRol('admin','supervisor','cajero'), (req,res) => {
  const db = _getDB(req);
  const {cantidad, motivo, tipo} = req.body; // tipo: entrada|salida|ajuste
  const p = db.findOne('productos',req.params.id);
  if(!p) return res.status(404).json({error:'No encontrado'});
  const delta = tipo==='salida' ? -Math.abs(cantidad) : Math.abs(cantidad);
  const suc_id = req.body.suc_id || (req.user && req.user.suc_id);
  if (!suc_id) return res.status(400).json({error:'Sucursal requerida para ajuste de stock'});
  const res2 = updateSucStock(db, req.params.id, suc_id, delta);
  if (res2) db.insert('stock_movimientos',{id:uid(),prod_id:req.params.id,nombre_prod:p.nombre,tipo,cantidad:delta,stock_antes:res2.before,stock_despues:res2.after,motivo:motivo||tipo,usuario_id:req.user.id,usuario:req.user.nombre,fecha:new Date().toISOString(),suc_id});
  try { const { dispararWebhooks } = require('./webhooks'); dispararWebhooks(db, 'producto.actualizado', { prod_id: p.id, nombre: p.nombre, sku: p.sku, stock_actual: res2 ? res2.after : 0, suc_id, tipo_ajuste: tipo, cantidad: delta }); } catch(e) {}
  res.json({ok:true, stock_actual:res2?res2.after:0, suc_id});
});

router.delete('/:id', requireRol('admin'), (req,res) => {
  const db = _getDB(req); db.softDel('productos',req.params.id); res.json({ok:true}); });


// Historial de stock de un producto
router.get('/:id/historial', authMiddleware, (req,res) => {
  const db = _getDB(req);
  // suc_id from query = session suc (frontend always sends it)
  // If present, filter by it — even admin sees only their session suc
  const sucId = req.query.suc_id || null;
  const sucs = db.all('sucursales');
  const movs = db.where('stock_movimientos', m => {
    if (m.prod_id !== req.params.id) return false;
    // Filter by session suc if provided
    if (sucId && m.suc_id && m.suc_id !== sucId) return false;
    return true;
  })
  .sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 50)
  .map(m => ({
    ...m,
    suc_nombre: (sucs.find(s => s.id === m.suc_id) || {}).nombre || m.suc_id || '—'
  }));
  res.json(movs);
});

module.exports = router;
