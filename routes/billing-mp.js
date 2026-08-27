// ═══════════════════════════════════════════
// Billing MercadoPago — preferencias, webhook, estado, comprobantes
// Config 100% desde SuperAdmin (global_config). Fallback manual si mp_enabled=false.
// ═══════════════════════════════════════════
const express = require('express');
const router = express.Router();
const webhookRouter = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { master, getEmpresa, getPlan, getGlobalConfig, createSaasPago, getSaasPagoByRef, getSaasPagoByPaymentId, updateSaasPago, getSaasPagosPorEmpresa, logSaasWebhook } = require('../db_master');
const mp = require('../lib/mercadopago');
const { calcularProrrateo, programarDowngrade } = require('../lib/billing/aplicar-pago');
const { authMiddleware, requireRol } = require('../middleware/auth');

function esCodigoValido(c) { return typeof c === 'string' && /^[a-z0-9_]+$/.test(c); }

// ── Config pública (para frontend: saber si MP está activo) ──
router.get('/config-public', (req, res) => {
  try {
    const { getBillingConfig } = require('../db_master');
    const billing = getBillingConfig();
    res.json({
      enabled: getGlobalConfig('mp_enabled') === '1',
      configurado: mp.isEnabled(),
      aviso_dias: billing.aviso_dias,
      grace_days: billing.grace_days,
      public_key: getGlobalConfig('mp_public_key') || '',
    });
  } catch(e) { res.json({ enabled: false, configurado: false }); }
});

// ── Planes públicos (para landing / signup — solo id, nombre, precio, periodo) ──
router.get('/planes', (req, res) => {
  try {
    const { getPlanes } = require('../db_master');
    const planes = getPlanes().map(p => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion || '', precio: p.precio, periodo: p.periodo || 'mensual', moneda: p.moneda || 'ARS' }));
    res.json(planes);
  } catch(e) { res.json([]); }
});

// ── Webhook MercadoPago (público — montado antes de csrfProtection) ──
// MP notifica { type: 'payment', data: { id } }. Verificamos el pago contra la API
// (nunca confiamos en el payload) y aplicamos por external_reference.
webhookRouter.post('/', async (req, res) => {
  const payload = JSON.stringify(req.body || {});
  const paymentId = req.body && req.body.data ? req.body.data.id : null;
  let firmaValida = null;
  const cfg = mp.getMpConfig();
  try {
    if (cfg.webhookSecret) {
      firmaValida = mp.verifySignature(req);
    }
  } catch(e) {}

  if (!paymentId) {
    logSaasWebhook({ mp_payment_id: null, payload, firma_valida: firmaValida === null ? 0 : !!firmaValida, procesado: 0, error: 'Sin payment id' });
    return res.status(400).json({ error: 'payment id requerido' });
  }

  try {
    // 1. Verificar firma si hay secret configurado
    if (cfg.webhookSecret && !firmaValida) {
      logSaasWebhook({ mp_payment_id: paymentId, payload, firma_valida: 0, procesado: 0, error: 'Firma inválida' });
      return res.status(401).json({ error: 'Firma inválida' });
    }

    // 2. Idempotencia: ya procesado → 200 (MP reintenta)
    const existente = getSaasPagoByPaymentId(paymentId);
    if (existente && existente.estado === 'approved') {
      logSaasWebhook({ mp_payment_id: paymentId, payload, firma_valida: firmaValida === null ? 0 : 1, procesado: 1, error: 'Ya procesado (idempotente)' });
      return res.json({ ok: true, idempotente: true });
    }

    // 3. Consultar pago real a MP API
    const payment = await mp.getPayment(paymentId);
    const externalRef = payment.external_reference || '';
    const pago = getSaasPagoByRef(externalRef) || (existente && existente.mp_external_ref ? getSaasPagoByRef(existente.mp_external_ref) : null);

    if (!pago) {
      logSaasWebhook({ mp_payment_id: paymentId, payload, firma_valida: firmaValida === null ? 0 : 1, procesado: 0, error: 'Referencia desconocida: ' + externalRef });
      return res.json({ ok: true, ignorado: true, motivo: 'referencia_desconocida' });
    }

    if (payment.status === 'approved') {
      // 4. Aplicar pago (crea empresa si es signup, actualiza plan si es upgrade/renovación)
      const { aplicarPago } = require('../lib/billing/aplicar-pago');
      await aplicarPago({ ...pago, mp_payment_id: paymentId });
      logSaasWebhook({ mp_payment_id: paymentId, payload, firma_valida: firmaValida === null ? 0 : 1, procesado: 1 });
      res.json({ ok: true, aplicado: true });
    } else {
      // Pago rechazado / pendiente / cancelado
      const estado = payment.status === 'rejected' ? 'rejected' : (payment.status === 'cancelled' ? 'cancelled' : 'pending');
      updateSaasPago(pago.id, { mp_payment_id: paymentId, estado });
      logSaasWebhook({ mp_payment_id: paymentId, payload, firma_valida: firmaValida === null ? 0 : 1, procesado: 1, error: 'Estado: ' + payment.status });
      res.json({ ok: true, estado });
    }
  } catch(e) {
    console.error('[BillingWebhook] Error:', e.message);
    logSaasWebhook({ mp_payment_id: paymentId, payload, firma_valida: firmaValida === null ? 0 : 1, procesado: 0, error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── Crear preferencia de pago ──
// Auth (upgrade/renovación) o público (signup con payload de alta).
router.post('/create-preference', async (req, res) => {
  try {
    if (!mp.isEnabled()) return res.status(400).json({ error: 'MercadoPago no está habilitado. Contactá al administrador.' });

    const tipo = req.body.tipo || (req.body.empresa_nombre ? 'signup' : 'upgrade');

    if (tipo === 'signup') {
      // ── Compra desde la página (sin login) ──
      const { empresa_nombre, email, password, rubro, plan_id, nombre_dueno, apellido_dueno, telefono, ciudad, como_conociste } = req.body;
      if (!empresa_nombre || !email || !password || !plan_id) {
        return res.status(400).json({ error: 'Nombre del negocio, email, contraseña y plan requeridos' });
      }
      const pwErr = require('../lib/password-policy').validatePassword(password);
      if (pwErr) return res.status(400).json({ error: pwErr });
      const plan = getPlan(plan_id);
      if (!plan) return res.status(400).json({ error: 'Plan no encontrado' });
      if (!plan.precio) return res.status(400).json({ error: 'El plan seleccionado no requiere pago. Registrate directamente.' });
      const empresaExistente = master.prepare("SELECT codigo FROM empresas WHERE LOWER(admin_email)=LOWER(?)").get(String(email).trim().toLowerCase());
      if (empresaExistente) return res.status(400).json({ error: 'Ya existe una empresa registrada con ese email.' });

      const monto = parseFloat(plan.precio);
      const externalRef = 'sig_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
      const pagoId = createSaasPago({
        plan_id, plan_nombre: plan.nombre, precio_snapshot: monto,
        tipo: 'signup', monto, moneda: getGlobalConfig('mp_currency') || 'ARS', estado: 'pending',
        mp_external_ref: externalRef,
        data: { empresa_nombre, email: String(email).trim().toLowerCase(), password_hash: bcrypt.hashSync(password, 10), rubro: rubro || 'general', plan_id, nombre_dueno: nombre_dueno || '', apellido_dueno: apellido_dueno || '', telefono: telefono || '', ciudad: ciudad || '', como_conociste: como_conociste || '' },
      });
      const pref = await mp.createPreference({ monto, external_ref: externalRef, planNombre: plan.nombre, payerEmail: email });
      updateSaasPago(pagoId, { mp_preference_id: pref.preference_id });
      return res.json({ ok: true, init_point: pref.init_point, pago_id: pagoId, external_ref: externalRef });
    }

    // ── Upgrade / renovación desde el CRM (auth requerida) ──
    if (!req.user || !req.user.empresa) return res.status(401).json({ error: 'Autenticación requerida' });
    const { plan_id } = req.body;
    const empresa = getEmpresa(req.user.empresa);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    const planNuevo = getPlan(plan_id);
    if (!planNuevo) return res.status(400).json({ error: 'Plan no encontrado' });
    const planActual = getPlan(empresa.plan_id);

    const esUpgrade = planActual && planNuevo && parseFloat(planNuevo.precio) > parseFloat(planActual.precio);
    if (!esUpgrade) {
      return res.json({ no_pago_requerido: true, mensaje: 'Usá el downgrade programado para cambiar a un plan inferior.', es_downgrade: true });
    }
    // Cobro completo: nuevo vencimiento es hoy+periodo, no prorrateo por días restantes
    const monto = parseFloat(planNuevo.precio) || 0;
    if (!(monto > 0)) {
      return res.json({ no_pago_requerido: true, mensaje: 'Este plan no requiere pago.' });
    }

    const externalRef = 'upg_' + empresa.codigo + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    const pagoId = createSaasPago({
      empresa_codigo: empresa.codigo, empresa_id: empresa.id,
      plan_id: planNuevo.id, plan_nombre: planNuevo.nombre, precio_snapshot: monto,
      tipo: 'upgrade', monto, moneda: getGlobalConfig('mp_currency') || 'ARS', estado: 'pending',
      mp_external_ref: externalRef, prorrateo: null,
      data: { usuario: req.user.nombre || req.user.usuario || '', usuario_id: req.user.id },
    });
    const pref = await mp.createPreference({ monto, external_ref: externalRef, planNombre: planNuevo.nombre, payerEmail: empresa.admin_email || undefined });
    updateSaasPago(pagoId, { mp_preference_id: pref.preference_id });
    res.json({ ok: true, init_point: pref.init_point, pago_id: pagoId, external_ref: externalRef, monto });
  } catch(e) {
    console.error('[BillingCreatePreference] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Estado de un pago (polling del frontend tras volver de MP) ──
// Acepta external_ref o payment_id (MP redirige con collection_id/payment_id)
router.get('/status/:ref', (req, res) => {
  const ref = String(req.params.ref || '');
  if (!/^[a-z0-9_\-]+$/i.test(ref)) return res.status(400).json({ error: 'Referencia inválida' });
  let pago = getSaasPagoByRef(ref);
  if (!pago) pago = getSaasPagoByPaymentId(ref);
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
  let empresaInfo = null;
  if (pago.empresa_codigo) {
    const e = getEmpresa(pago.empresa_codigo) || master.prepare("SELECT * FROM empresas WHERE codigo=?").get(pago.empresa_codigo);
    if (e) empresaInfo = { codigo: e.codigo, nombre: e.nombre, vencimiento: e.vencimiento };
  }
  res.json({ estado: pago.estado, plan: pago.plan_nombre, monto: pago.monto, moneda: pago.moneda, comprobante_num: pago.comprobante_num, empresa: empresaInfo });
});

// ── Solicitar downgrade diferido (se aplica al vencimiento) ──
router.post('/downgrade', authMiddleware, requireRol('admin'), (req, res) => {
  try {
    if (!mp.isEnabled()) return res.status(400).json({ error: 'MercadoPago no está habilitado. Usá la solicitud manual.' });
    const empresa = getEmpresa(req.user.empresa);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    const planNuevo = getPlan(req.body.plan_id);
    if (!planNuevo) return res.status(400).json({ error: 'Plan no encontrado' });
    const planActual = getPlan(empresa.plan_id);
    if (planActual && parseFloat(planNuevo.precio) > parseFloat(planActual.precio)) {
      return res.status(400).json({ error: 'Usá el upgrade con pago para mejorar el plan.' });
    }
    const pagoId = programarDowngrade(empresa, planNuevo, req.user.nombre || req.user.usuario || '');
    const pago = require('../db_master').getSaasPago(pagoId);
    let aplicarDesde = empresa.vencimiento;
    try { const d = typeof pago.data === 'string' ? JSON.parse(pago.data) : pago.data; aplicarDesde = d.aplicar_desde || aplicarDesde; } catch {}
    // Notificar + auditoría
    try {
      const { master, saAudit } = require('../db_master');
      master.prepare(
        "INSERT INTO notificaciones (id, empresa_codigo, tipo, titulo, mensaje, creado, data) VALUES (?,?,?,?,?,?,?)"
      ).run('notif_' + Date.now() + '_' + empresa.codigo, empresa.codigo, 'downgrade_programado',
        `⬇ Downgrade programado a ${planNuevo.nombre}`,
        `Tu plan cambiará a ${planNuevo.nombre} el ${aplicarDesde}. Se mantiene tu plan actual hasta el vencimiento.`,
        new Date().toISOString(), JSON.stringify({ accion: '/config' }));
      saAudit(req.user.id || 'system', 'downgrade_programado', empresa.id,
        `Downgrade programado: ${planActual ? planActual.nombre : empresa.plan_id} → ${planNuevo.nombre} desde ${aplicarDesde}`);
    } catch(e) {}
    res.json({ ok: true, pago_id: pagoId, aplicar_desde: aplicarDesde, mensaje: `Downgrade a ${planNuevo.nombre} programado para el ${aplicarDesde}.` });
  } catch(e) {
    console.error('[BillingDowngrade] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Downgrade pendiente actual (para mostrar banner en PlanTab)
router.get('/downgrade-pending', authMiddleware, (req, res) => {
  const codigo = req.user.empresa;
  if (!esCodigoValido(codigo)) return res.json(null);
  const pago = master.prepare("SELECT * FROM saas_pagos WHERE empresa_codigo=? AND tipo='downgrade' AND estado='pending' ORDER BY creado DESC LIMIT 1").get(codigo);
  if (!pago) return res.json(null);
  let data = pago.data; if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  res.json({ id: pago.id, plan_id: pago.plan_id, plan_nombre: pago.plan_nombre, aplicar_desde: data.aplicar_desde || null, creado: pago.creado });
});

// Cancelar downgrade pendiente
router.delete('/downgrade-pending', authMiddleware, requireRol('admin'), (req, res) => {
  const codigo = req.user.empresa;
  const pago = master.prepare("SELECT * FROM saas_pagos WHERE empresa_codigo=? AND tipo='downgrade' AND estado='pending' ORDER BY creado DESC LIMIT 1").get(codigo);
  if (!pago) return res.status(404).json({ error: 'No hay downgrade pendiente' });
  master.prepare("DELETE FROM saas_pagos WHERE id=?").run(pago.id);
  try {
    const { getEmpresaDB } = require('../db_sqlite');
    const db = getEmpresaDB(codigo);
    db.setConfig({ pending_downgrade: null });
  } catch(e) {}
  res.json({ ok: true });
});

// ── Mis pagos (cliente en el CRM) ──
router.get('/mis-pagos', authMiddleware, (req, res) => {
  const codigo = req.user.empresa;
  if (!esCodigoValido(codigo)) return res.json([]);
  const pagos = getSaasPagosPorEmpresa(codigo, 100).map(p => ({
    id: p.id, creado: p.creado, tipo: p.tipo, plan: p.plan_nombre, monto: p.monto, moneda: p.moneda,
    estado: p.estado, origen: p.origen, comprobante_num: p.comprobante_num,
  }));
  res.json(pagos);
});

// ── Descargar comprobante PDF (solo el dueño del pago) ──
router.get('/mis-pagos/:id/comprobante', authMiddleware, (req, res) => {
  const { getSaasPago } = require('../db_master');
  const pago = getSaasPago(req.params.id);
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
  if (pago.empresa_codigo !== req.user.empresa) return res.status(403).json({ error: 'Sin permisos' });
  if (!pago.comprobante_path) return res.status(404).json({ error: 'Comprobante aún no generado' });
  const fs = require('fs');
  if (!fs.existsSync(pago.comprobante_path)) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.download(pago.comprobante_path, (pago.comprobante_num || 'comprobante') + '.pdf');
});

module.exports = router;
module.exports.webhookRouter = webhookRouter;
