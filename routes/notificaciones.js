const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// GET /api/notificaciones — list for logged-in user's empresa
router.get('/', authMiddleware, (req, res) => {
  try {
    const empresa = req.user.empresa || 'default';
    const { master } = require('../db_master');
    const rows = master.prepare(
      "SELECT * FROM notificaciones WHERE empresa_codigo=? ORDER BY creado DESC LIMIT 50"
    ).all(empresa);
    res.json(rows);
  } catch(e) {
    console.error('[Notif] Error:', e.message);
    res.json([]);
  }
});

// GET /api/notificaciones/unread-count — solo el numero
router.get('/unread-count', authMiddleware, (req, res) => {
  try {
    const empresa = req.user.empresa || 'default';
    const { master } = require('../db_master');
    const row = master.prepare(
      "SELECT COUNT(*) as n FROM notificaciones WHERE empresa_codigo=? AND leida=0"
    ).get(empresa);
    res.json({ n: row ? row.n : 0 });
  } catch(e) {
    res.json({ n: 0 });
  }
});

// PATCH /api/notificaciones/:id/leer
router.patch('/:id/leer', authMiddleware, (req, res) => {
  try {
    const { master } = require('../db_master');
    master.prepare("UPDATE notificaciones SET leida=1 WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/notificaciones/leer-todas
router.patch('/leer-todas', authMiddleware, (req, res) => {
  try {
    const empresa = req.user.empresa || 'default';
    const { master } = require('../db_master');
    master.prepare("UPDATE notificaciones SET leida=1 WHERE empresa_codigo=? AND leida=0").run(empresa);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
