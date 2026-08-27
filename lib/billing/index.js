// ═══════════════════════════════════════════
// Billing index — resuelve el provider activo
// ═══════════════════════════════════════════
const mp = require('./mercadopago.provider');

function getProvider() {
  return mp;
}

module.exports = { getProvider, providers: { mercadopago: mp } };
