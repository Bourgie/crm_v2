// ═══════════════════════════════════════════
// MercadoPago Provider — Checkout Pro (redirect)
// Config vive en global_config (superadmin configurable):
//   mp_enabled, mp_mode (test|live), mp_access_token (encriptado),
//   mp_public_key, mp_webhook_secret, mp_back_url_base
// ═══════════════════════════════════════════
const crypto = require('crypto');
const { getGlobalConfig } = require('../../db_master');
const { decryptValue } = require('../crypto-utils');

const API_BASE = 'https://api.mercadopago.com';
const API_TEST_BASE = 'https://api.mercadopago.com';

function getMpConfig() {
  const accessToken = getGlobalConfig('mp_access_token');
  return {
    enabled: getGlobalConfig('mp_enabled') === '1',
    mode: getGlobalConfig('mp_mode') || 'test',
    accessToken: accessToken ? decryptValue(accessToken) : (process.env.MP_ACCESS_TOKEN || ''),
    publicKey: getGlobalConfig('mp_public_key') || process.env.MP_PUBLIC_KEY || '',
    webhookSecret: getGlobalConfig('mp_webhook_secret') || process.env.MP_WEBHOOK_SECRET || '',
    backUrlBase: getGlobalConfig('mp_back_url_base') || process.env.APP_URL || '',
  };
}

function isEnabled() {
  try { return getMpConfig().enabled && !!getMpConfig().accessToken; }
  catch(e) { return false; }
}

function getWebhookUrl() {
  const base = getMpConfig().backUrlBase || process.env.APP_URL || 'https://app.flexcrm.com.ar';
  return base.replace(/\/$/, '') + '/api/billing/mp/webhook';
}

async function mpFetch(path, { method = 'GET', body } = {}) {
  const cfg = getMpConfig();
  if (!cfg.accessToken) throw new Error('MercadoPago no configurado (falta access token)');
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      'Authorization': 'Bearer ' + cfg.accessToken,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch(e) {}
  if (!res.ok) {
    const msg = data && (data.message || data.error) ? (data.message || data.error) : ('HTTP ' + res.status);
    throw new Error('MercadoPago: ' + msg);
  }
  return data;
}

// Crea una preferencia de Checkout Pro.
// monto en la moneda de config (ARS por defecto).
async function createPreference({ monto, external_ref, planNombre, payerEmail, backUrls, notificationUrl }) {
  const cfg = getMpConfig();
  const preferenciaId = crypto.randomUUID().replace(/-/g, '');
  const body = {
    items: [
      {
        id: preferenciaId,
        title: 'FlexCRM — ' + (planNombre || 'Suscripción'),
        quantity: 1,
        unit_price: Math.round(parseFloat(monto) * 100) / 100,
        currency_id: getGlobalConfig('mp_currency') || 'ARS',
        description: 'Suscripción FlexCRM — ' + (planNombre || 'Plan'),
      },
    ],
    external_reference: external_ref,
    notification_url: notificationUrl || getWebhookUrl(),
    back_urls: {
      success: backUrls && backUrls.success ? backUrls.success : (cfg.backUrlBase + '/app/pago-exitoso'),
      failure: backUrls && backUrls.failure ? backUrls.failure : (cfg.backUrlBase + '/app/pago-error'),
      pending: backUrls && backUrls.pending ? backUrls.pending : (cfg.backUrlBase + '/app/pago-pendiente'),
    },
    auto_return: 'approved',
    statement_descriptor: 'FlexCRM',
  };
  if (payerEmail) body.payer = { email: payerEmail };
  const data = await mpFetch('/checkout/preferences', { method: 'POST', body });
  return { init_point: data.init_point || data.sandbox_init_point, preference_id: data.id };
}

// Verifica la firma del webhook: x-signature = HMAC-SHA256(ts + '.' + token) del secret,
// header x-request-id con el ts y un sufijo.
function verifySignature(req) {
  const cfg = getMpConfig();
  const secret = cfg.webhookSecret;
  if (!secret) return false;
  const ts = req.headers['x-request-id'] || '';
  const signature = req.headers['x-signature'] || '';
  if (!ts || !signature) return false;
  const tsPart = ts.split('-')[0];
  if (!/^\d+$/.test(tsPart)) return false;
  const raw = req.rawBody || '';
  const expected = crypto.createHmac('sha256', secret).update(tsPart + '.' + raw).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.padEnd(expected.length, '0').slice(0, expected.length)));
  } catch(e) {
    return false;
  }
}

async function getPayment(paymentId) {
  return mpFetch('/v1/payments/' + encodeURIComponent(paymentId));
}

async function refundPayment(paymentId) {
  return mpFetch('/v1/payments/' + encodeURIComponent(paymentId) + '/refunds', { method: 'POST' });
}

async function testConnection() {
  return mpFetch('/users/me');
}

module.exports = {
  name: 'mercadopago',
  getMpConfig,
  isEnabled,
  getWebhookUrl,
  createPreference,
  verifySignature,
  getPayment,
  refundPayment,
  testConnection,
};
