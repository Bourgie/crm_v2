const express = require('express');
const router = express.Router();
const { uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || require('../db_sqlite').db;
const { authMiddleware, requireRol } = require('../middleware/auth');

// ── Empleados ──────────────────────────────────────────────
router.get('/empleados', authMiddleware, requireRol('admin','supervisor','cajero'), (req, res) => {
  const db = _getDB(req);
  let list = db.all('empleados').sort((a, b) => (a.nombre||'').localeCompare(b.nombre||''));
  if (req.query.activo !== undefined) list = list.filter(e => e.activo === (req.query.activo === '1' || req.query.activo === 'true'));
  if (req.query.suc_id) list = list.filter(e => e.suc_id === req.query.suc_id);
  res.json(list);
});

router.get('/empleados/:id', authMiddleware, requireRol('admin','supervisor','cajero'), (req, res) => {
  const db = _getDB(req);
  const e = db.findOne('empleados', req.params.id);
  if (!e) return res.status(404).json({ error: 'Empleado no encontrado' });
  const ausencias = db.where('ausencias', a => a.empleado_id === req.params.id).sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
  res.json({ ...e, ausencias });
});

router.post('/empleados', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const { nombre, apellido, dni, cuil, tel, email, direccion, fecha_ingreso, puesto, salario, obra_social, suc_id, notas } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const r = db.insert('empleados', {
    id: uid(), nombre, apellido: apellido || null, dni: dni || null, cuil: cuil || null,
    tel: tel || null, email: email || null, direccion: direccion || null,
    fecha_ingreso: fecha_ingreso || null, puesto: puesto || null,
    salario: parseFloat(salario) || 0, obra_social: obra_social || null,
    suc_id: suc_id || null, activo: 1, notas: notas || null,
    creado: new Date().toISOString(),
  });
  res.json(r);
});

router.put('/empleados/:id', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const existing = db.findOne('empleados', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Empleado no encontrado' });
  const allowed = {};
  for (const k of ['nombre','apellido','dni','cuil','tel','email','direccion','fecha_ingreso','puesto','salario','obra_social','suc_id','activo','notas']) {
    if (req.body[k] !== undefined) allowed[k] = k === 'activo' ? (req.body[k] ? 1 : 0) : req.body[k];
  }
  const r = db.update('empleados', req.params.id, allowed);
  res.json(r);
});

router.delete('/empleados/:id', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  db.softDel('empleados', req.params.id);
  res.json({ ok: true });
});

// ── Ausencias ──────────────────────────────────────────────
router.get('/ausencias', authMiddleware, requireRol('admin','supervisor','cajero'), (req, res) => {
  const db = _getDB(req);
  let list = db.all('ausencias').sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
  if (req.query.empleado_id) list = list.filter(a => a.empleado_id === req.query.empleado_id);
  if (req.query.desde) list = list.filter(a => a.fecha_inicio >= req.query.desde);
  if (req.query.hasta) list = list.filter(a => a.fecha_inicio <= req.query.hasta);
  // Enrich with empleado name
  const emps = db.all('empleados');
  list = list.map(a => ({ ...a, emp_nombre: (emps.find(e => e.id === a.empleado_id) || {}).nombre || '—' }));
  res.json(list);
});

router.post('/ausencias', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const { empleado_id, tipo, fecha_inicio, fecha_fin, motivo, certificado } = req.body;
  if (!empleado_id || !fecha_inicio) return res.status(400).json({ error: 'Empleado y fecha inicio requeridos' });
  const r = db.insert('ausencias', {
    id: uid(), empleado_id, tipo: tipo || 'otro',
    fecha_inicio, fecha_fin: fecha_fin || null,
    motivo: motivo || null, certificado: certificado ? 1 : 0,
    aprobado_por: req.user ? req.user.nombre : null,
    creado: new Date().toISOString(),
  });
  res.json(r);
});

router.put('/ausencias/:id', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const existing = db.findOne('ausencias', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Ausencia no encontrada' });
  const allowed = {};
  for (const k of ['tipo','fecha_inicio','fecha_fin','motivo','certificado']) {
    if (req.body[k] !== undefined) allowed[k] = k === 'certificado' ? (req.body[k] ? 1 : 0) : req.body[k];
  }
  const r = db.update('ausencias', req.params.id, allowed);
  res.json(r);
});

router.delete('/ausencias/:id', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  db.delete('ausencias', req.params.id);
  res.json({ ok: true });
});

// ── Reporte del mes ─────────────────────────────────────────
router.get('/reporte', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const hoy = new Date();
  const mes = req.query.mes !== undefined ? parseInt(req.query.mes) : hoy.getMonth() + 1;
  const anio = req.query.anio !== undefined ? parseInt(req.query.anio) : hoy.getFullYear();
  const inicioMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const finMes = new Date(anio, mes, 0).toISOString().substr(0, 10);
  const empleados = db.all('empleados').filter(e => e.activo !== false);
  const ausencias = db.where('ausencias', a =>
    a.fecha_inicio >= inicioMes && a.fecha_inicio <= finMes
  );
  const porTipo = {};
  ausencias.forEach(a => { porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1; });
  res.json({
    total_empleados: empleados.length,
    total_ausencias: ausencias.length,
    ausencias_por_tipo: porTipo,
    empleados_con_ausencias: [...new Set(ausencias.map(a => a.empleado_id))].length,
  });
});

module.exports = router;
