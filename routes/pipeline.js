const express = require('express');
const router = express.Router();
const { uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || require('../db_sqlite').db;
const { authMiddleware, requireRol } = require('../middleware/auth');

// ── ETAPAS ────────────────────────────────────────────────────
router.get('/etapas', authMiddleware, (req, res) => {
  const db = _getDB(req);
  res.json(db.where('pipeline_etapas', e => e.activo !== false).sort((a, b) => a.orden - b.orden));
});

router.post('/etapas', authMiddleware, requireRol('admin'), (req, res) => {
  const db = _getDB(req);
  const { nombre, color } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const maxOrden = db.where('pipeline_etapas', () => true).reduce((m, e) => Math.max(m, e.orden || 0), 0);
  const r = db.insert('pipeline_etapas', {
    id: uid(), nombre, color: color || '#6366f1',
    orden: maxOrden + 1, activo: 1
  });
  res.json(r);
});

router.put('/etapas/:id', authMiddleware, requireRol('admin'), (req, res) => {
  const db = _getDB(req);
  const r = db.update('pipeline_etapas', req.params.id, req.body);
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  res.json(r);
});

router.delete('/etapas/:id', authMiddleware, requireRol('admin'), (req, res) => {
  const db = _getDB(req);
  const otras = db.where('pipeline_etapas', e => e.id !== req.params.id && e.activo !== false);
  if (otras.length === 0) return res.status(400).json({ error: 'Debe haber al menos una etapa' });
  const first = otras.sort((a, b) => a.orden - b.orden)[0];
  db.where('pipeline_oportunidades', o => o.etapa_id === req.params.id && o.activo !== false)
    .forEach(o => db.update('pipeline_oportunidades', o.id, { etapa_id: first.id }));
  db.softDel('pipeline_etapas', req.params.id);
  res.json({ ok: true });
});

// ── OPORTUNIDADES ─────────────────────────────────────────────
router.get('/oportunidades', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const { etapa_id, suc_id, vend_id, estado, showArchived, usuario_id } = req.query;
  let list = db.where('pipeline_oportunidades', o => o.activo !== false);
  if (etapa_id) list = list.filter(o => o.etapa_id === etapa_id);
  if (suc_id) list = list.filter(o => o.suc_id === suc_id);
  if (vend_id) list = list.filter(o => o.usuario_id === vend_id);
  if (usuario_id) list = list.filter(o => o.usuario_id === usuario_id);
  if (estado) list = list.filter(o => o.estado === estado);
  else if (!showArchived) list = list.filter(o => o.estado !== 'archivado');
  // Filter by user role
  if (req.user.rol !== 'admin') {
    if (req.user.rol === 'supervisor') {
      const sucs = Array.isArray(req.user.suc_sesiones_permitidas) ? req.user.suc_sesiones_permitidas : [];
      if (sucs.length > 0) list = list.filter(o => sucs.includes(o.suc_id));
    } else {
      list = list.filter(o => o.usuario_id === req.user.id || (o.usuario_nombre && o.usuario_nombre === req.user.nombre));
    }
  }
  res.json(list.sort((a, b) => (a.fecha_creacion || '') < (b.fecha_creacion || '') ? 1 : -1));
});

router.post('/oportunidades', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const { nombre, etapa_id, cliente_id, cli_nombre, valor_estimado, probabilidad, fecha_cierre_estimada, vend_id, vend_nombre, suc_id, notas, venta_id, observacion, proximo_contacto } = req.body;
  if (!nombre || !etapa_id) return res.status(400).json({ error: 'Nombre y etapa requeridos' });
  const r = db.insert('pipeline_oportunidades', {
    id: uid(), nombre, etapa_id, cliente_id: cliente_id || null,
    cli_nombre: cli_nombre || '', valor_estimado: parseFloat(valor_estimado) || 0,
    probabilidad: parseInt(probabilidad) || 50,
    fecha_creacion: new Date().toISOString(),
    fecha_cierre_estimada: fecha_cierre_estimada || null,
    usuario_id: req.user.id, usuario_nombre: req.user.nombre,
    vend_id: vend_id || null, vend_nombre: vend_nombre || '',
    suc_id: suc_id || req.user.suc_id || null,
    notas: notas || '', observacion: observacion || '', proximo_contacto: proximo_contacto || null, venta_id: venta_id || null, estado: 'activo', activo: 1
  });
  db.audit(req.user, null, 'pipeline', 'crear', 'Oportunidad: ' + nombre, r.id);
  res.json(r);
});

router.put('/oportunidades/:id', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const old = db.findOne('pipeline_oportunidades', req.params.id);
  if (!old) return res.status(404).json({ error: 'No encontrada' });
  const { nombre, etapa_id, cliente_id, cli_nombre, valor_estimado, probabilidad, fecha_cierre_estimada, fecha_cierre, vend_id, vend_nombre, usuario_id, usuario_nombre, estado, notas, motivo, contactado, contacto_fecha, contacto_notas, suc_id } = req.body;
  const upd = {};
  for (const [k, v] of Object.entries({ nombre, etapa_id, cliente_id, cli_nombre, valor_estimado, probabilidad, fecha_cierre_estimada, fecha_cierre, vend_id, vend_nombre, usuario_id, usuario_nombre, estado, notas, motivo, contactado, contacto_fecha, contacto_notas, suc_id })) {
    if (v !== undefined) upd[k] = v;
  }
  // Track stage changes in seguimiento
  if (upd.etapa_id && upd.etapa_id !== old.etapa_id) {
    const oldEtapa = db.findOne('pipeline_etapas', old.etapa_id);
    const newEtapa = db.findOne('pipeline_etapas', upd.etapa_id);
    db.insert('seguimiento', {
      id: uid(), entidad_tipo: 'pipeline', entidad_id: req.params.id,
      fecha: new Date().toISOString(), usuario_id: req.user.id,
      usuario_nombre: req.user.nombre, suc_id: req.user.suc_id || old.suc_id,
      accion: 'cambio_etapa', nota: `De "${oldEtapa?.nombre || '?'}" a "${newEtapa?.nombre || '?'}"`,
      estado_anterior: old.etapa_id, estado_nuevo: upd.etapa_id
    });
  }
  // Auto-set cierre date when estado changes to ganado/perdido
  if (upd.estado && upd.estado !== old.estado && (upd.estado === 'ganado' || upd.estado === 'perdido')) {
    upd.fecha_cierre = new Date().toISOString();
  }
  const r = db.update('pipeline_oportunidades', req.params.id, upd);
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  res.json(r);
});

router.delete('/oportunidades/:id', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const old = db.findOne('pipeline_oportunidades', req.params.id);
  if (!old) return res.status(404).json({ error: 'No encontrada' });
  db.softDel('pipeline_oportunidades', req.params.id);
  db.audit(req.user, null, 'pipeline', 'eliminar', 'Oportunidad: ' + old.nombre, req.params.id);
  res.json({ ok: true });
});

// ── SEGUIMIENTO (timeline) ───────────────────────────────────
router.post('/oportunidades/:id/seguimiento', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const op = db.findOne('pipeline_oportunidades', req.params.id);
  if (!op) return res.status(404).json({ error: 'No encontrada' });
  const { accion, nota } = req.body;
  const r = db.insert('seguimiento', {
    id: uid(), entidad_tipo: 'pipeline', entidad_id: req.params.id,
    fecha: new Date().toISOString(), usuario_id: req.user.id,
    usuario_nombre: req.user.nombre, suc_id: req.user.suc_id || op.suc_id,
    accion: accion || 'nota', nota: nota || ''
  });
  res.json(r);
});

router.get('/oportunidades/:id/seguimiento', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const rows = db.where('seguimiento', s => s.entidad_tipo === 'pipeline' && s.entidad_id === req.params.id)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  res.json(rows);
});

// ── POSTVENTA PENDIENTE (badge count) ────────────────────────
router.get('/vencidas', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const ahora = new Date();
  let list = db.where('pipeline_oportunidades', o => {
    if (o.activo === false || o.estado === 'ganado' || o.estado === 'perdido') return false;
    if (!o.fecha_cierre_estimada) return false;
    const vto = new Date(o.fecha_cierre_estimada);
    return vto <= ahora;
  });
  // Filter by user role
  if (req.user.rol !== 'admin') {
    if (req.user.rol === 'supervisor') {
      const sucs = Array.isArray(req.user.suc_sesiones_permitidas) ? req.user.suc_sesiones_permitidas : [];
      if (sucs.length > 0) list = list.filter(o => sucs.includes(o.suc_id));
    } else {
      list = list.filter(o => o.usuario_id === req.user.id || (o.usuario_nombre && o.usuario_nombre === req.user.nombre));
    }
  }
  res.json({ n: list.length, oportunidades: list });
});

// ── ENVIAR EMAIL ──
router.post('/oportunidades/:id/enviar-email', authMiddleware, async (req, res) => {
  const db = _getDB(req);
  const op = db.findOne('pipeline_oportunidades', req.params.id);
  if (!op) return res.status(404).json({ error: 'No encontrada' });
  const { para, mensaje } = req.body;
  if (!para) return res.status(400).json({ error: 'Email destinatario requerido' });
  const cfg = db.getConfig();
  if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass) {
    return res.status(400).json({ error: 'SMTP no configurado' });
  }
  try {
    let nodemailer;
    try { nodemailer = require('nodemailer'); } catch { return res.status(500).json({ error: 'nodemailer no instalado' }); }
    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host, port: parseInt(cfg.smtp_port) || 465,
      secure: (parseInt(cfg.smtp_port) || 465) === 465,
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    });
    const from = cfg.smtp_from || 'noreply@flexcrm.com';
    const subject = 'Oportunidad: ' + op.nombre + ' — ' + (cfg.nombre || 'FlexCRM');
    const html = `<p>Hola,</p>
      <p>Te contactamos desde <strong>${cfg.nombre || 'FlexCRM'}</strong> con respecto a: <strong>${op.nombre}</strong>.</p>
      ${mensaje ? '<p><em>' + mensaje.replace(/\n/g, '<br>') + '</em></p>' : ''}
      <p style="color:#6b7280;font-size:12px">— ${cfg.nombre || 'FlexCRM'}</p>`;
    await transporter.sendMail({ from, to: para, subject, html });
    db.insert('seguimiento', {
      id: uid(), entidad_tipo: 'pipeline', entidad_id: req.params.id,
      fecha: new Date().toISOString(), usuario_id: req.user.id,
      usuario_nombre: req.user.nombre, suc_id: op.suc_id,
      accion: 'email_enviado', nota: 'Email enviado a ' + para
    });
    res.json({ ok: true, mensaje: 'Email enviado a ' + para });
  } catch (e) {
    res.status(500).json({ error: 'Error al enviar email: ' + e.message });
  }
});

// ── ACTIVITY FEED (notifications) ──
router.get('/activity', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const desde = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  let seguimientos = db.where('seguimiento', s => s.entidad_tipo === 'pipeline' && s.fecha >= desde);
  // Filter by user's scope
  if (req.user.rol !== 'admin') {
    if (req.user.rol === 'supervisor') {
      const sucs = Array.isArray(req.user.suc_sesiones_permitidas) ? req.user.suc_sesiones_permitidas : [];
      if (sucs.length > 0) seguimientos = seguimientos.filter(s => sucs.includes(s.suc_id));
    } else {
      const opIds = db.where('pipeline_oportunidades', o => o.usuario_id === req.user.id && o.activo !== false).map(o => o.id);
      seguimientos = seguimientos.filter(s => opIds.includes(s.entidad_id));
    }
  }
  res.json({ n: seguimientos.length, ultimos: seguimientos.slice(0, 5) });
});

// ── AUTO-CREATE POSTVENTA (called from ventas route after cobrar) ──
router.post('/auto-postventa', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const { venta_id, cliente_id, cli_nombre, total, vend_id, vend_nombre, suc_id } = req.body;
  if (!venta_id) return res.status(400).json({ error: 'venta_id requerido' });
  let etapa = db.where('pipeline_etapas', e => e.nombre === 'Postventa' && e.activo !== false)[0];
  if (!etapa) {
    const maxOrden = db.where('pipeline_etapas', () => true).reduce((m, e) => Math.max(m, e.orden || 0), 0);
    etapa = db.insert('pipeline_etapas', {
      id: uid(), nombre: 'Postventa', color: '#22c55e',
      orden: maxOrden + 1, activo: 1
    });
  }
  const existing = db.where('pipeline_oportunidades', o => o.venta_id === venta_id && o.activo !== false)[0];
  if (existing) return res.json({ ok: true, id: existing.id, existing: true });
  const fe = new Date(); fe.setDate(fe.getDate() + 7);
  const r = db.insert('pipeline_oportunidades', {
    id: uid(), nombre: 'Postventa: ' + (cli_nombre || 'Cliente'), etapa_id: etapa.id,
    cliente_id: cliente_id || null, cli_nombre: cli_nombre || '',
    valor_estimado: 0, probabilidad: 50,
    fecha_creacion: new Date().toISOString(),
    fecha_cierre_estimada: fe.toISOString().substr(0, 10),
    usuario_id: req.user.id, usuario_nombre: req.user.nombre,
    vend_id: vend_id || null, vend_nombre: vend_nombre || '',
    suc_id: suc_id || null, notas: 'Postventa automática generada al cobrar',
    venta_id, estado: 'activo', activo: 1
  });
  res.json({ ok: true, id: r.id });
});

module.exports = router;
