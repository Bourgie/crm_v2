// FlexCRM — Chat estilo WhatsApp entre sucursales
const express = require('express');
const router = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol } = require('../middleware/auth');
router.use(authMiddleware);

// ─────────────────────────────────────────────────────────────
// CONVERSACIONES (vista previa por chat)
// GET /api/chat/conversations?suc_id=X
// Devuelve: { groups: [{id:'all', nombre:'Todas', ultimo, unread}],
//             contacts: [{id:sucId, nombre, ultimo, unread, fijado}] }
// ─────────────────────────────────────────────────────────────
router.get('/conversations', (req, res) => {
  const empDB = _getDB(req);
  const mySuc = req.query.suc_id || req.user.suc_id || req.user.suc_sesion;
  if (!mySuc) return res.json({ groups: [], contacts: [] });

  const sucs = empDB.all('sucursales').filter(s => s.activo !== false && s.id !== mySuc);
  const allMsgs = empDB.all('chat_messages');
  const userId = req.user.id;

  function lastAndUnread(filter) {
    const rel = allMsgs.filter(filter).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const ultimo = rel[0] || null;
    const unread = rel.filter(m => m.autor_id !== userId
      && !(Array.isArray(m.leido_por) && m.leido_por.includes(userId))).length;
    return { ultimo, unread };
  }

  // Group "Todas" (broadcasts)
  const grupoTodos = lastAndUnread(m => m.suc_destino === 'all');

  // Per-sucursal conversation
  const contacts = sucs.map(s => {
    const conv = lastAndUnread(m =>
      (m.suc_origen === mySuc && m.suc_destino === s.id) ||
      (m.suc_origen === s.id && m.suc_destino === mySuc)
    );
    // Pinned info (from chat_settings)
    let fijado = false;
    try {
      const cs = empDB.findOne('chat_settings', `${mySuc}_${s.id}`);
      fijado = cs?.fijado || false;
    } catch {}
    return { id: s.id, nombre: s.nombre, ultimo: conv.ultimo, unread: conv.unread, fijado };
  });

  // Sort: pinned first, then by last message date desc
  contacts.sort((a, b) => {
    if (a.fijado !== b.fijado) return a.fijado ? -1 : 1;
    const da = a.ultimo ? new Date(a.ultimo.fecha) : 0;
    const dbb = b.ultimo ? new Date(b.ultimo.fecha) : 0;
    return dbb - da;
  });

  res.json({
    groups: [{ id: 'all', nombre: '📢 General (todas las sucursales)', ultimo: grupoTodos.ultimo, unread: grupoTodos.unread }],
    contacts,
  });
});

// ─────────────────────────────────────────────────────────────
// MENSAJES DE UNA CONVERSACIÓN
// GET /api/chat/messages?suc_id=mine&peer=other  (chat 1-a-1)
// GET /api/chat/messages?suc_id=mine&peer=all    (broadcast)
// ─────────────────────────────────────────────────────────────
router.get('/messages', (req, res) => {
  const empDB = _getDB(req);
  const { suc_id, peer, since, limit = 100 } = req.query;
  let msgs = empDB.all('chat_messages');

  if (peer === 'all') {
    msgs = msgs.filter(m => m.suc_destino === 'all');
  } else if (suc_id && peer) {
    // 1-to-1 conversation between suc_id and peer
    msgs = msgs.filter(m =>
      (m.suc_origen === suc_id && m.suc_destino === peer) ||
      (m.suc_origen === peer && m.suc_destino === suc_id)
    );
  } else if (suc_id) {
    // Legacy: all related to suc_id
    msgs = msgs.filter(m =>
      m.suc_destino === suc_id || m.suc_origen === suc_id || m.suc_destino === 'all'
    );
  }

  if (since) msgs = msgs.filter(m => m.fecha > since);
  msgs = msgs
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .slice(-parseInt(limit));
  res.json(msgs);
});

// ─────────────────────────────────────────────────────────────
// ENVIAR MENSAJE
// Body: { texto, suc_destino, suc_origen, reply_to?, broadcast_locked? }
// ─────────────────────────────────────────────────────────────
router.post('/messages', (req, res) => {
  const empDB = _getDB(req);
  const { texto, suc_destino, reply_to, broadcast_locked } = req.body;
  if (!texto || !texto.trim()) return res.status(400).json({ error: 'Texto requerido' });

  // Si la conversación 'all' está bloqueada para solo-admin → verificar rol
  if (suc_destino === 'all') {
    try {
      const lock = empDB.findOne('chat_settings', 'lock_all');
      if (lock?.activo && lock.hasta && new Date(lock.hasta) > new Date()) {
        const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.rol];
        if (!userRoles.includes('admin') && !userRoles.includes('supervisor')) {
          return res.status(403).json({ error: 'El chat general está restringido a admins hasta ' + new Date(lock.hasta).toLocaleString('es-AR') });
        }
      }
    } catch {}
  }

  const msg = {
    id: uid(),
    fecha: new Date().toISOString(),
    autor_id: req.user.id,
    autor_nombre: req.user.nombre || req.body.autor_nombre || '',
    autor_rol: req.user.rol || 'usuario',
    suc_origen: req.body.suc_origen || req.user.suc_id || req.user.suc_sesion || null,
    suc_destino: suc_destino || 'all',
    texto: texto.trim(),
    reply_to: reply_to || null,
    entregado: true,
    leido_por: []
  };
  empDB.insert('chat_messages', msg);
  res.json({ ok: true, msg });
});

// ─────────────────────────────────────────────────────────────
// MARCAR LEÍDOS (al abrir una conversación)
// Body: { suc_id, peer }
// ─────────────────────────────────────────────────────────────
router.post('/mark-read', (req, res) => {
  const empDB = _getDB(req);
  const mySuc = req.body.suc_id || req.user.suc_id || req.user.suc_sesion;
  const peer = req.body.peer;
  if (!mySuc) return res.json({ ok: true });

  const all = empDB.all('chat_messages');
  let filtro;
  if (peer === 'all') {
    filtro = m => m.suc_destino === 'all' && m.autor_id !== req.user.id;
  } else if (peer) {
    filtro = m => m.autor_id !== req.user.id &&
      ((m.suc_origen === mySuc && m.suc_destino === peer) ||
       (m.suc_origen === peer && m.suc_destino === mySuc));
  } else {
    filtro = m => m.autor_id !== req.user.id &&
      (m.suc_destino === 'all' || m.suc_destino === mySuc || m.suc_origen === mySuc);
  }
  for (const m of all) {
    if (!filtro(m)) continue;
    const lp = Array.isArray(m.leido_por) ? m.leido_por : [];
    const lpSet = new Set(lp);
    if (!lpSet.has(req.user.id)) {
      empDB.update('chat_messages', m.id, { leido_por: [...lp, req.user.id], leido: true });
    }
  }
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// CONTADOR DE NO LEÍDOS (badge global)
// ─────────────────────────────────────────────────────────────
router.get('/unread', (req, res) => {
  const empDB = _getDB(req);
  const suc = req.query.suc_id || req.user.suc_id || req.user.suc_sesion;
  if (!suc) return res.json({ n: 0, ultimo: null });
  try {
    const all = empDB.all('chat_messages');
    const userId = req.user.id;
    const unread = all.filter(m =>
      m.autor_id !== userId &&
      !(Array.isArray(m.leido_por) && m.leido_por.includes(userId)) &&
      (m.suc_destino === 'all' || m.suc_destino === suc || m.suc_origen === suc));
    const ultimo = unread.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0] || null;
    res.json({ n: unread.length, ultimo });
  } catch { res.json({ n: 0, ultimo: null }); }
});

// ─────────────────────────────────────────────────────────────
// FIJAR / DESFIJAR conversación con una sucursal
// Body: { suc_id (mi suc), peer (sucursal a fijar), fijado: true/false }
// ─────────────────────────────────────────────────────────────
router.post('/pin', (req, res) => {
  const empDB = _getDB(req);
  const { suc_id, peer, fijado } = req.body;
  if (!suc_id || !peer) return res.status(400).json({ error: 'suc_id y peer requeridos' });
  const id = `${suc_id}_${peer}`;
  const existing = empDB.findOne('chat_settings', id);
  if (existing) {
    empDB.update('chat_settings', id, { fijado: !!fijado });
  } else {
    empDB.insert('chat_settings', { id, suc_id, peer, fijado: !!fijado });
  }
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// BLOQUEAR / DESBLOQUEAR chat general (solo admins/supervisores pueden escribir)
// Body: { activo: bool, hasta: ISO date }
// Solo admin.
// ─────────────────────────────────────────────────────────────
router.post('/lock-all', requireRol('admin'), (req, res) => {
  const empDB = _getDB(req);
  const { activo, hasta } = req.body;
  const existing = empDB.findOne('chat_settings', 'lock_all');
  const data = { id: 'lock_all', activo: !!activo, hasta: hasta || null, by: req.user.id, fecha: new Date().toISOString() };
  if (existing) empDB.update('chat_settings', 'lock_all', data);
  else empDB.insert('chat_settings', data);
  res.json({ ok: true, lock: data });
});

router.get('/lock-all', (req, res) => {
  const empDB = _getDB(req);
  const lock = empDB.findOne('chat_settings', 'lock_all');
  res.json(lock || { activo: false });
});

// ─────────────────────────────────────────────────────────────
// ELIMINAR MENSAJE (solo el autor o admin, dentro de 1h)
// ─────────────────────────────────────────────────────────────
router.delete('/messages/:id', (req, res) => {
  const empDB = _getDB(req);
  const msg = empDB.findOne('chat_messages', req.params.id);
  if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });
  const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.rol];
  const esAdmin = userRoles.includes('admin');
  const esAutor = msg.autor_id === req.user.id;
  const reciente = (new Date() - new Date(msg.fecha)) < 60 * 60 * 1000;
  if (!esAdmin && !(esAutor && reciente)) {
    return res.status(403).json({ error: 'Solo podés eliminar tus mensajes recientes (1h)' });
  }
  // Soft delete: replace text
  empDB.update('chat_messages', req.params.id, { texto: '🚫 Mensaje eliminado', eliminado: true });
  res.json({ ok: true });
});

module.exports = router;
