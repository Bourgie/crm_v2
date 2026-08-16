const express = require('express');
const router = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol, permiteSucursal } = require('../middleware/auth');
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

const MEDIO_FALLBACK = { efectivo:'efectivo', transferencia:'transferencia', cheque:'cheque', tarjeta:'tarjeta_credito', debito_cuenta:'transferencia', tarjeta_corp:'tarjeta_credito', debito:'tarjeta_debito', credito:'tarjeta_credito', qr:'billetera', ctacte:'ctacte' };

router.post('/', requireRol('admin','supervisor','cajero','tesorero'), validate(gastoSchema), (req, res) => {
  const db = _getDB(req);
  const { nombre, categoria_id, monto, fecha, fecha_vencimiento, estado,
          metodo_pago, suc_id, recurrente_id, nro_comprobante, notas,
          pagado_por, genera_egreso_caja, fuente, cuenta_id } = req.body;
  if (!nombre || !monto) return res.status(400).json({error:'Nombre y monto requeridos'});
  const fuenteFinal = fuente === 'tesoreria' ? 'tesoreria' : 'cajon';
  if (suc_id && !permiteSucursal(req.user, suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});
  const cat = categoria_id ? db.findOne('gastos_categorias', categoria_id) : null;
  const fechaGasto = fecha || new Date().toISOString().substr(0,10);
  const id = 'g'+uid();

  // Aprobación de gastos grandes desde la bóveda (admin aprueba, tesorero solicita)
  const esAdmin = req.user.rol === 'admin' || (Array.isArray(req.user.roles) && req.user.roles.includes('admin'));
  let umbral = 0;
  try { umbral = parseFloat(db.getConfig('tesoreria_umbral_aprobacion')) || 0; } catch {}
  const requiereAprobacion = fuenteFinal === 'tesoreria' && umbral > 0 && parseFloat(monto) >= umbral && !esAdmin;

  const gasto = db.insert('gastos', {
    id, nombre, categoria_id: categoria_id||null,
    categoria_nombre: cat ? cat.nombre : '—',
    monto: parseFloat(monto), fecha: fechaGasto,
    fecha_vencimiento: null,
    estado: requiereAprobacion ? 'pendiente_aprobacion' : 'pagado',
    metodo_pago: metodo_pago||'efectivo',
    suc_id: suc_id||null, recurrente_id: recurrente_id||null,
    nro_comprobante: nro_comprobante||'', notas: notas||'',
    registrado_por: req.user.nombre, pagado_por: pagado_por||req.user.nombre,
    genera_egreso_caja: fuenteFinal === 'cajon' ? 1 : 0,
    caja_movimiento_id: null
  });
  const concepto = nombre + (cat ? ' (' + cat.nombre + ')' : '');

  if (requiereAprobacion) {
    db.audit(req.user, suc_id||null, 'gastos', 'solicitar_aprobacion', nombre+' — $'+parseFloat(monto), id);
    return res.json({ id, ok: true, estado: 'pendiente_aprobacion', mensaje: 'Gasto pendiente de aprobación por un admin' });
  }

  if (fuenteFinal === 'tesoreria') {
    const { movTes, asegurarBovedaCentral } = require('../lib/treasury');
    const central = asegurarBovedaCentral(db);
    const cuentaFinal = cuenta_id || (central && central.id);
    if (!cuentaFinal) { db.delete('gastos', id); return res.status(400).json({error:'No se pudo acceder a la Bóveda Central'}); }
    const r = movTes(db, {
      cuenta_id: cuentaFinal, tipo: 'expense', concepto, monto: parseFloat(monto),
      categoria: cat ? cat.nombre : '',
      metodo_pago: metodo_pago || '', medio: MEDIO_FALLBACK[metodo_pago] || '',
      suc_id: suc_id || null, usuario: req.user,
      ref_tipo: 'gasto', ref_id: id,
    });
    if (!r.ok) {
      db.delete('gastos', id);
      return r.dup ? res.status(409).json({error: r.error}) : res.status(400).json({error: r.error});
    }
  } else if (suc_id) {
    const { movCajon } = require('../lib/treasury');
    const r = movCajon(db, {
      suc_id, tipo: 'egreso', concepto, monto: parseFloat(monto),
      pago_metodo: metodo_pago || 'efectivo', usuario: req.user,
      auto: true, gasto_id: id,
    });
    if (!r.ok) { db.delete('gastos', id); return res.status(400).json({error: r.error}); }
    db.update('gastos', id, { caja_movimiento_id: r.id });
  }
  db.audit(req.user, suc_id||null, 'gastos', 'crear', nombre+' — $'+parseFloat(monto), id);
  res.json({id, ok:true});
});

// Aprobar un gasto pendiente (admin) — mueve el dinero desde la Bóveda Central
router.post('/:id/aprobar', requireRol('admin'), (req, res) => {
  const db = _getDB(req);
  const g = db.findOne('gastos', req.params.id);
  if (!g) return res.status(404).json({error:'No encontrado'});
  if (g.estado !== 'pendiente_aprobacion') return res.status(400).json({error:'El gasto no está pendiente de aprobación'});
  const { movTes, asegurarBovedaCentral } = require('../lib/treasury');
  const central = asegurarBovedaCentral(db);
  if (!central) return res.status(400).json({error:'Sin Bóveda Central'});
  const concepto = g.nombre + (g.categoria_nombre && g.categoria_nombre !== '—' ? ' (' + g.categoria_nombre + ')' : '');
  const r = movTes(db, {
    cuenta_id: central.id, tipo: 'expense', concepto, monto: g.monto,
    categoria: g.categoria_nombre || '',
    metodo_pago: g.metodo_pago || '', medio: MEDIO_FALLBACK[g.metodo_pago] || '',
    suc_id: g.suc_id || null, usuario: req.user,
    ref_tipo: 'gasto', ref_id: g.id,
  });
  if (!r.ok) return r.dup ? res.status(409).json({error:r.error}) : res.status(400).json({error:r.error});
  db.update('gastos', g.id, { estado: 'pagado', pagado_por: req.user.nombre });
  db.audit(req.user, g.suc_id || null, 'gastos', 'aprobar', g.nombre+' — $'+g.monto, g.id);
  res.json({ok:true});
});

// Rechazar un gasto pendiente (admin)
router.post('/:id/rechazar', requireRol('admin'), (req, res) => {
  const db = _getDB(req);
  const g = db.findOne('gastos', req.params.id);
  if (!g) return res.status(404).json({error:'No encontrado'});
  if (g.estado !== 'pendiente_aprobacion') return res.status(400).json({error:'El gasto no está pendiente de aprobación'});
  db.update('gastos', g.id, { estado: 'rechazado', notas: (g.notas || '') + ' — Rechazado por ' + req.user.nombre });
  db.audit(req.user, g.suc_id || null, 'gastos', 'rechazar', g.nombre+' — $'+g.monto, g.id);
  res.json({ok:true});
});

router.put('/:id', requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const existing = db.findOne('gastos', req.params.id);
  if (!existing) return res.status(404).json({error:'No encontrado'});
  if (existing.suc_id && !permiteSucursal(req.user, existing.suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});
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

router.delete('/:id', requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const existing = db.findOne('gastos', req.params.id);
  if (!existing) return res.status(404).json({error:'No encontrado'});
  if (existing.suc_id && !permiteSucursal(req.user, existing.suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});
  // Revertir el movimiento de caja asociado
  if (existing.caja_movimiento_id) {
    try { db.update('movimientos_caja', existing.caja_movimiento_id, { anulado: true }); } catch(e) {}
  }
  // Revertir la transacción de tesorería asociada
  try {
    const tx = db.raw.prepare("SELECT id, cuenta_id FROM treasury_transactions WHERE ref_tipo='gasto' AND ref_id=? AND anulado=0").get(String(existing.id));
    if (tx) {
      db.update('treasury_transactions', tx.id, { anulado: 1 });
      require('../lib/treasury').sincSaldo(db, tx.cuenta_id);
    }
  } catch(e) {}
  db.delete('gastos', req.params.id);
  db.audit(req.user, existing.suc_id || null, 'gastos', 'eliminar', existing.nombre + ' — $' + existing.monto, existing.id);
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
