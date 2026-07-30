// ═══════════════════════════════════════════
// Integration Center — WebhookService
// Procesamiento y despacho de webhooks
// ═══════════════════════════════════════════

const crypto = require('crypto');

class WebhookService {
  /**
   * Procesa un webhook entrante.
   * @param {TenantRepo} tenantRepo
   * @param {string} providerName
   * @param {object} payload
   * @param {string} signature - firma del header
   * @returns {Promise<object>}
   */
  async processIncoming(tenantRepo, providerName, payload, signature) {
    const { getProvider } = require('../providers');
    const provider = getProvider(providerName);

    tenantRepo.log({
      provider: providerName,
      tipo: 'webhook',
      status: 'success',
      mensaje: `Webhook recibido — tipo: ${payload.topic || payload.event || 'unknown'}`,
    });

    try {
      let result;
      if (provider.processWebhook) {
        result = await provider.processWebhook(payload, signature);
      } else {
        result = { processed: true, message: 'Provider no implementa processWebhook' };
      }
      return result;
    } catch (e) {
      tenantRepo.log({
        provider: providerName,
        tipo: 'webhook',
        status: 'error',
        mensaje: `Error procesando webhook: ${e.message}`,
      });
      throw e;
    }
  }

  /**
   * Dispara webhooks salientes a todas las URLs registradas.
   * Usa la tabla webhooks existente en la DB de la empresa.
   */
  dispatchEvent(db, event, payload) {
    const { dispararWebhooks } = require('../../../routes/webhooks');
    try {
      dispararWebhooks(db, event, payload);
    } catch (e) {
      console.error('[WebhookService] Error dispatchEvent:', e.message);
    }
  }

  /**
   * Verifica firma HMAC de un webhook entrante.
   */
  verifySignature(payload, signature, secret) {
    if (!signature || !secret) return false;
    const expected = crypto.createHmac('sha256', secret)
      .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  /**
   * Verifica replay attack: timestamp no más de 5 min viejo.
   */
  verifyTimestamp(timestampMs) {
    if (!timestampMs) return true;
    const diff = Math.abs(Date.now() - parseInt(timestampMs));
    return diff < 5 * 60 * 1000;
  }
}

module.exports = { WebhookService };
