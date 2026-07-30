// ═══════════════════════════════════════════
// Integration Center — Webhook Routes
// Receptor universal de webhooks entrantes
// ═══════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { WebhookService } = require('../../lib/integration-center/WebhookService');
const { TenantRepo } = require('../../lib/integration-center/TenantRepo');
const rateLimit = require('express-rate-limit');

const webhookService = new WebhookService();

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { error: 'Demasiadas solicitudes' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(webhookLimiter);

/**
 * Webhook entrante universal.
 * POST /api/integration-center/webhooks/:provider?empresa=codigo
 */
router.post('/:provider', async (req, res) => {
  try {
    const provider = req.params.provider;
    const empresaCodigo = req.query.empresa || req.body.empresa_codigo || 'default';

    // Content-Type enforcement
    const ct = (req.headers['content-type'] || '').split(';')[0].trim();
    if (ct !== 'application/json') {
      return res.status(415).json({ error: 'Content-Type debe ser application/json' });
    }

    const tenantRepo = new TenantRepo(empresaCodigo);
    const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'];

    // Verify replay protection (5 min window)
    const timestamp = req.headers['x-webhook-timestamp'] || req.body.timestamp;
    if (timestamp && !webhookService.verifyTimestamp(timestamp)) {
      return res.status(400).json({ error: 'Timestamp expired' });
    }

    const result = await webhookService.processIncoming(tenantRepo, provider, req.body, signature);

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[Webhook-Receiver] Error:', e.message);
    res.status(500).json({ error: 'Error procesando webhook', detail: e.message });
  }
});

module.exports = router;
