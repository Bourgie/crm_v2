// Compat wrapper — delega al provider MercadoPago
const mp = require('./billing/mercadopago.provider');

module.exports = {
  getMpConfig: mp.getMpConfig,
  isEnabled: mp.isEnabled,
  getWebhookUrl: mp.getWebhookUrl,
  createPreference: mp.createPreference,
  verifySignature: mp.verifySignature,
  getPayment: mp.getPayment,
  refundPayment: mp.refundPayment,
  testConnection: mp.testConnection,
};
