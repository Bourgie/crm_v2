// ═══════════════════════════════════════════
// Billing Provider — interfaz de pasarela de pago
// Implementaciones: mercadopago.provider.js (hoy), futuras: Stripe, Transfer, etc.
// ═══════════════════════════════════════════

/**
 * Interfaz esperada de todo provider:
 *  isEnabled() -> boolean
 *  createPreference({ monto, moneda, external_ref, planNombre, payerEmail, backUrls, notificationUrl }) -> Promise<{ init_point, preference_id }>
 *  verifySignature(req) -> boolean
 *  getPayment(paymentId) -> Promise<{ id, status, external_reference, transaction_amount, date_approved }>
 *  getWebhookUrl() -> string
 */
module.exports = { name: 'BillingProvider' };
