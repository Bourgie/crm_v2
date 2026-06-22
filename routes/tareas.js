const express = require('express');
const router = express.Router();
const { uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || require('../db_sqlite').db;
const { authMiddleware, requireRol } = require('../middleware/auth');
router.use(authMiddleware);

// GET /api/tareas — list user's tasks
router.get('/', (req, res) => {
  const db = _getDB(req);
  let list = db.where('tareas', t => t.activo !== false);
  if (req.user.rol !== 'admin') {
    if (req.user.rol === 'supervisor') {
      const sucs = Array.isArray(req.user.suc_sesiones_permitidas) ? req.user.suc_sesiones_permitidas : [];
      if (sucs.length > 0) list = list.filter(t => sucs.includes(t.suc_id));
    } else {
      list = list.filter(t => {
        const ids = Array.isArray(t.asignado_a) ? t.asignado_a : [];
        return ids.includes(req.user.id) || t.creado_por === req.user.id;
      });
    }
  }
  list.sort((a, b) => (a.fecha_fin || '9999') < (b.fecha_fin || '9999') ? -1 : 1);
  res.json(list);
});

// GET /api/tareas/vencidas — count of overdue tasks
router.get('/vencidas', (req, res) => {
  const db = _getDB(req);
  let list = db.where('tareas', t => t.activo !== false && t.estado !== 'finalizado' && t.fecha_fin && new Date(t.fecha_fin) < new Date());
  if (req.user.rol !== 'admin') {
    if (req.user.rol === 'supervisor') {
      const sucs = Array.isArray(req.user.suc_sesiones_permitidas) ? req.user.suc_sesiones_permitidas : [];
      if (sucs.length > 0) list = list.filter(t => sucs.includes(t.suc_id));
    } else {
      list = list.filter(t => {
        const ids = Array.isArray(t.asignado_a) ? t.asignado_a : [];
        return ids.includes(req.user.id) || t.creado_por === req.user.id;
      });
    }
  }
  res.json({ n: list.length });
});

// POST /api/tareas — create task (admin/supervisor only)
router.post('/', requireRol('admin', 'supervisor'), (req, res) => {
  const db = _getDB(req);
  const { descripcion, fecha_fin, asignado_a, suc_id } = req.body;
  if (!descripcion) return res.status(400).json({ error: 'Descripción requerida' });
  const r = db.insert('tareas', {
    id: uid(),
    creado_por: req.user.id,
    creado_nombre: req.user.nombre,
    descripcion,
    fecha_creacion: new Date().toISOString(),
    fecha_fin: fecha_fin || null,
    asignado_a: Array.isArray(asignado_a) ? asignado_a : [],
    suc_id: suc_id || req.user.suc_id || null,
    estado: 'pendiente',
    observacion: '',
    activo: 1
  });
  res.json(r);
});

// PUT /api/tareas/:id — update task state/observacion
router.put('/:id', (req, res) => {
  const db = _getDB(req);
  const old = db.findOne('tareas', req.params.id);
  if (!old) return res.status(404).json({ error: 'No encontrada' });
  const upd = { ...req.body };
  const ids = Array.isArray(old.asignado_a) ? old.asignado_a : [];
  const isAssignee = ids.includes(req.user.id) || old.creado_por === req.user.id;
  const isAdminSup = req.user.rol === 'admin' || req.user.rol === 'supervisor';
  if (!isAssignee && !isAdminSup) return res.status(403).json({ error: 'Sin permisos' });
  const r = db.update('tareas', req.params.id, upd);
  res.json(r);
});

// DELETE /api/tareas/:id — soft delete (admin/supervisor only)
router.delete('/:id', requireRol('admin', 'supervisor'), (req, res) => {
  const db = _getDB(req);
  db.softDel('tareas', req.params.id);
  res.json({ ok: true });
});

module.exports = router;
