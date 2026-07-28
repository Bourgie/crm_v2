const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { uid, getEmpresaDB } = require('../db_sqlite');
const _getDB = req => (req && req.db) || require('../db_sqlite').db;
const { authMiddleware, requireRol } = require('../middleware/auth');
const { promises: dnsPromises } = require('dns');

// ── Helpers ────────────────────────────────────────────────────
const EVENTOS = ['venta.cobrada','cliente.creado','producto.actualizado'];

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^fc00:/i, /^fd00:/i, /^fe80:/i,
];

function isPrivateIP(ip) {
  return PRIVATE_IP_RANGES.some(r => r.test(ip));
}

async function validateWebhookUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('URL inválida'); }
  if (url.protocol !== 'https:') throw new Error('Solo se permiten URLs HTTPS');
  try {
    const { address } = await dnsPromises.lookup(url.hostname, { family: 4 });
    if (isPrivateIP(address)) throw new Error('No se permiten direcciones IP privadas o reservadas');
  } catch (e) {
    if (e.message.includes('privadas') || e.message.includes('HTTPS') || e.message.includes('inválida')) throw e;
  }
  return url;
}

function genToken(empresaCode) {
  return `wh_${empresaCode}_${crypto.randomBytes(16).toString('hex')}`;
}

function parseEmpresaFromToken(token) {
  const parts = token.split('_');
  if (parts[0] !== 'wh' || parts.length < 3) return null;
  return parts[1];
}

// ── Disparar webhooks (exportada para usar desde otros módulos) ──
function signPayload(token, body) {
  return crypto.createHmac('sha256', token).update(body).digest('hex');
}

function dispararWebhooks(db, evento, payload) {
  try {
    const whs = db.where('webhooks', w =>
      w.activo && w.eventos && w.eventos.includes(evento)
    );
    if (!whs.length) return;
    const body = JSON.stringify({ evento, timestamp: new Date().toISOString(), data: payload });
    whs.forEach(w => {
      const signature = signPayload(w.token, body);
      fetch(w.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': evento,
        },
        body,
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    });
  } catch (e) { /* non-blocking */ }
}

// ── CRUD ────────────────────────────────────────────────────────
router.get('/', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  res.json(db.where('webhooks', () => true).sort((a, b) => (a.creado||'').localeCompare(b.creado||'')));
});

router.post('/', authMiddleware, requireRol('admin','supervisor'), async (req, res) => {
  const db = _getDB(req);
  const { url, eventos } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requerida' });
  if (!eventos || !Array.isArray(eventos) || !eventos.length)
    return res.status(400).json({ error: 'Seleccioná al menos un evento' });
  const invalido = eventos.find(e => !EVENTOS.includes(e));
  if (invalido) return res.status(400).json({ error: 'Evento inválido: ' + invalido });
  try { await validateWebhookUrl(url); } catch (e) { return res.status(400).json({ error: e.message }); }
  const empresaCode = req.user && req.user.empresa ? req.user.empresa : 'default';
  const r = db.insert('webhooks', {
    id: uid(), url, eventos, token: genToken(empresaCode),
    activo: 1, creado: new Date().toISOString(),
  });
  res.json(r);
});

router.put('/:id', authMiddleware, requireRol('admin','supervisor'), async (req, res) => {
  const db = _getDB(req);
  const existing = db.findOne('webhooks', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Webhook no encontrado' });
  const { url, eventos, activo } = req.body;
  const updates = {};
  if (url !== undefined) {
    try { await validateWebhookUrl(url); } catch (e) { return res.status(400).json({ error: e.message }); }
    updates.url = url;
  }
  if (eventos !== undefined) {
    if (!Array.isArray(eventos) || !eventos.length)
      return res.status(400).json({ error: 'Seleccioná al menos un evento' });
    updates.eventos = eventos;
  }
  if (activo !== undefined) updates.activo = activo ? 1 : 0;
  const r = db.update('webhooks', req.params.id, updates);
  res.json(r);
});

router.delete('/:id', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const r = db.delete('webhooks', req.params.id);
  if (!r) return res.status(404).json({ error: 'Webhook no encontrado' });
  res.json({ ok: true });
});

router.post('/:id/test', authMiddleware, requireRol('admin','supervisor'), async (req, res) => {
  const db = _getDB(req);
  const w = db.findOne('webhooks', req.params.id);
  if (!w) return res.status(404).json({ error: 'Webhook no encontrado' });
  try {
    const resp = await fetch(w.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evento: 'test', timestamp: new Date().toISOString(), data: { mensaje: 'Prueba desde FlexCRM' } }),
      signal: AbortSignal.timeout(10000),
    });
    res.json({ ok: true, status: resp.status, statusText: resp.statusText });
  } catch (e) {
    res.status(400).json({ error: 'Error de conexión', detalle: (e.message || '').substring(0, 200) });
  }
});

// ── Receptor público (n8n → FlexCRM) ──────────────────────────
router.post('/receptor/:token', (req, res) => {
  // Content-Type enforcement
  const ct = (req.headers['content-type'] || '').split(';')[0].trim();
  if (ct !== 'application/json') {
    return res.status(415).json({ error: 'Content-Type debe ser application/json' });
  }

  const token = req.params.token;
  const empresaCode = parseEmpresaFromToken(token);
  if (!empresaCode) return res.status(400).json({ error: 'Token con formato inválido' });
  try {
    const db = getEmpresaDB(empresaCode);
    const w = db.where('webhooks', wh => wh.token === token && wh.activo)[0];
    if (!w) return res.status(401).json({ error: 'Token inválido o desactivado' });

    // Verify HMAC signature if provided
    const signature = req.headers['x-webhook-signature'];
    if (signature) {
      const body = JSON.stringify(req.body);
      const expected = signPayload(token, body);
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return res.status(401).json({ error: 'Firma inválida' });
      }
    }

    const body = req.body || {};
    res.json({ ok: true, recibido: body, webhook_id: w.id, empresa: empresaCode });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = { router, dispararWebhooks, signPayload, EVENTOS };
