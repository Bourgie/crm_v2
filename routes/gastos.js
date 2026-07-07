const express = require('express');
const router = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol } = require('../middleware/auth');
const { validate, gastoSchema } = require('../middleware/validate');
router.use(authMiddleware);

// ── Categorías ──
router.get('/categorias', (req, res) => {
  const db = _getDB(req);
  res.json(db.find('gastos_categorias', {activo: true}));
});
router.post('/categorias', requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const {nombre, icono} = req.body;
  if (!nombre) return res.status(400).json({error:'Nombre requerido'});
  const cat = db.insert('gastos_categorias', {id:'gc'+uid(), nombre, icono:icono||'💸', activo:true});
  res.json(cat);
});
router.put('/categorias/:id', requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  db.update('gastos_categorias', req.params.id, req.body);
  res.json({ok:true});
});

// ── Gastos recurrentes ──
router.get('/recurrentes', (req, res) => {
  const db = _getDB(req);
  const rows = db.find('gastos_recurrentes', {activo:true});
  const cats = db.find('gastos_categorias', {activo:true});
  res.json(rows.map(r => ({
    ...r,
    categoria_nombre: (cats.find(c=>c.id===r.categoria_id)||{}).nombre||'—',
    categoria_icono:  (cats.find(c=>c.id===r.categoria_id)||{}).icono||'💸',
  })));
});
router.post('/recurrentes', requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const {nombre, categoria_id, monto_estimado, dia_vencimiento, suc_id, notas} = req.body;
  if (!nombre) return res.status(400).json({error:'Nombre requerido'});
  const r = db.insert('gastos_recurrentes', {
    id:'gr'+uid(), nombre, categoria_id, monto_estimado:parseFloat(monto_estimado)||0,
    dia_vencimiento:parseInt(dia_vencimiento)||1, suc_id:suc_id||null, notas:notas||'', activo:true
  });
  res.json(r);
});
router.put('/recurrentes/:id', requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  db.update('gastos_recurrentes', req.params.id, req.body);
  res.json({ok:true});
});
router.delete('/recurrentes/:id', requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  db.update('gastos_recurrentes', req.params.id, {activo:false});
  res.json({ok:true});
});

// ── Gastos ──
router.get('/', (req, res) => {
  const db = _getDB(req);
  const {suc_id, desde, hasta, estado, categoria_id} = req.query;
  let rows = db.all('gastos');
  if (suc_id) rows = rows.filter(g => g.suc_id === suc_id || !g.suc_id);
  if (desde) rows = rows.filter(g => g.fecha >= desde);
  if (hasta) rows = rows.filter(g => g.fecha <= hasta + 'T23:59:59');
  if (estado) rows = rows.filter(g => g.estado === estado);
  if (categoria_id) rows = rows.filter(g => g.categoria_id === categoria_id);
  res.json(rows.sort((a,b) => new Date(b.fecha) - new Date(a.fecha)));
});

router.post('/', requireRol('admin','supervisor','cajero'), validate(gastoSchema), (req, res) => {
  const db = _getDB(req);
  const { nombre, categoria_id, monto, fecha, fecha_vencimiento, estado,
          metodo_pago, suc_id, recurrente_id, nro_comprobante, notas,
          pagado_por, genera_egreso_caja } = req.body;
  if (!nombre || !monto) return res.status(400).json({error:'Nombre y monto requeridos'});
  const cat = categoria_id ? db.findOne('gastos_categorias', categoria_id) : null;
  const fechaGasto = fecha || new Date().toISOString().substr(0,10);
  const id = 'g'+uid();
  const gasto = db.insert('gastos', {
    id, nombre, categoria_id: categoria_id||null,
    categoria_nombre: cat ? cat.nombre : '—',
    monto: parseFloat(monto), fecha: fechaGasto,
    fecha_vencimiento: fecha_vencimiento||null,
    estado: estado||'pagado',
    metodo_pago: metodo_pago||'transferencia',
    suc_id: suc_id||null, recurrente_id: recurrente_id||null,
    nro_comprobante: nro_comprobante||'', notas: notas||'',
    registrado_por: req.user.nombre, pagado_por: pagado_por||req.user.nombre,
    genera_egreso_caja: genera_egreso_caja ? 1 : 0,
    caja_movimiento_id: null
  });

  // Si genera egreso en caja, registrarlo
  if (genera_egreso_caja && suc_id) {
    const hoy = fechaGasto;
    const caja = db.where('cajas', c =>
      c.suc_id === suc_id && c.fecha && c.fecha.substr(0,10) === hoy && c.estado === 'abierta'
    )[0];
    if (caja) {
      const movId = 'm'+uid();
      db.insert('movimientos_caja', {
        id: movId, caja_id: caja.id, suc_id, fecha: new Date().toISOString(),
        tipo: 'egreso', concepto: nombre + (cat?' ('+cat.nombre+')':''),
        monto: parseFloat(monto), usuario: req.user.nombre,
        auto: false, anulado: false
      });
      db.update('gastos', id, {caja_movimiento_id: movId});
    }
  }
  db.audit(req.user, suc_id||null, 'gastos', 'crear', nombre+' — $'+parseFloat(monto), id);
  res.json({id, ok:true});
});

router.put('/:id', requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const existing = db.findOne('gastos', req.params.id);
  if (!existing) return res.status(404).json({error:'No encontrado'});
  const { nombre, monto, fecha, fecha_vencimiento, estado, metodo_pago, suc_id, recurrente_id, nro_comprobante, notas, registrado_por, pagado_por, genera_egreso_caja, categoria_id, categoria_nombre } = req.body;
  const updates = {};
  for (const [k, v] of Object.entries({ nombre, monto, fecha, fecha_vencimiento, estado, metodo_pago, suc_id, recurrente_id, nro_comprobante, notas, registrado_por, pagado_por, genera_egreso_caja, categoria_id, categoria_nombre })) {
    if (v !== undefined) updates[k] = v;
  }
  if (updates.categoria_id) {
    const cat = db.findOne('gastos_categorias', updates.categoria_id);
    if (cat) updates.categoria_nombre = cat.nombre;
  }
  db.update('gastos', req.params.id, updates);
  res.json({ok:true});
});

router.delete('/:id', requireRol('admin'), (req, res) => {
  const db = _getDB(req);
  db.delete('gastos', req.params.id);
  res.json({ok:true});
});

// ── Resumen mensual ──
router.get('/resumen', (req, res) => {
  const db = _getDB(req);
  const {suc_id, mes} = req.query;
  const mesKey = mes || new Date().toISOString().substr(0,7);
  let gastos = db.all('gastos').filter(g => g.fecha && g.fecha.substr(0,7) === mesKey);
  if (suc_id) gastos = gastos.filter(g => !g.suc_id || g.suc_id === suc_id);
  const total = gastos.reduce((a,g) => a+g.monto, 0);
  const porCategoria = {};
  gastos.forEach(g => {
    const k = g.categoria_nombre||'Sin categoría';
    if (!porCategoria[k]) porCategoria[k] = {nombre:k, total:0, n:0};
    porCategoria[k].total += g.monto;
    porCategoria[k].n++;
  });
  const pendientes = db.where('gastos_recurrentes', r => r.activo)
    .filter(r => !gastos.some(g => g.recurrente_id === r.id));
  res.json({total, porCategoria: Object.values(porCategoria), pendientes_recurrentes: pendientes.length});
});

module.exports = router;
