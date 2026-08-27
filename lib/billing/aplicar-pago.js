// ═══════════════════════════════════════════
// Aplicar pago aprobado — lógica compartida entre webhook MP y pago manual superadmin.
// Un solo camino de ejecución: plan, vencimiento, módulos, comprobante, mail, auditoría.
// ═══════════════════════════════════════════
const { master, getEmpresa, getPlan, saAudit, saAuditExtended, updateSaasPago } = require('../../db_master');
const { getEmpresaDB, uid } = require('../../db_sqlite');
const { generarComprobantePDF } = require('../comprobante-saas');
const { sendEmail, getNotificationSMTP, getRemitente } = require('../send-email');
const { decryptValue } = require('../crypto-utils');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function diasPeriodo(periodo) {
  return (periodo || 'mensual') === 'anual' ? 365 : 30;
}

function extenderVencimiento(baseISO, periodo) {
  const base = baseISO ? new Date(baseISO) : new Date();
  if (isNaN(base.getTime())) return null;
  const hoy = new Date().toISOString().substr(0, 10);
  const baseStr = base.toISOString().substr(0, 10);
  const desde = baseStr > hoy ? base : new Date();
  const nueva = new Date(desde.getTime() + diasPeriodo(periodo) * 86400000);
  return nueva.toISOString().substr(0, 10);
}

// Calcula prorrateo idéntico a routes/config.js (upgrade paga diferencia proporcional)
function calcularProrrateo(empresa, planActual, planNuevo) {
  const hoy = new Date();
  const vto = empresa && empresa.vencimiento ? new Date(empresa.vencimiento) : null;
  if (!empresa || !planActual || !planNuevo) return { tiene_costo: !planActual, monto: parseFloat(planNuevo ? planNuevo.precio : 0) || 0, precio_completo: true };
  if (!vto || vto <= hoy) {
    return { tiene_costo: true, monto: parseFloat(planNuevo.precio) || 0, precio_completo: true, mensaje: 'Suscripción vencida — se aplica precio completo del nuevo plan.' };
  }
  const diasRestantes = Math.ceil((vto - hoy) / 86400000);
  const precioActual = parseFloat(planActual.precio) || 0;
  const precioNuevo = parseFloat(planNuevo.precio) || 0;
  if (precioNuevo <= precioActual) {
    return { tiene_costo: false, es_downgrade: true, dias_restantes: diasRestantes, mensaje: `Tu plan actual vence el ${empresa.vencimiento}. El downgrade se aplica al renovar.` };
  }
  const reembolso = (precioActual / 30) * diasRestantes;
  const costoNuevo = (precioNuevo / 30) * diasRestantes;
  const neto = Math.max(0, Math.round((costoNuevo - reembolso) * 100) / 100);
  return {
    tiene_costo: neto > 0, es_upgrade: true, dias_restantes: diasRestantes,
    precio_actual: precioActual, precio_nuevo: precioNuevo,
    reembolso: Math.round(reembolso * 100) / 100, costo_nuevo_periodo: Math.round(costoNuevo * 100) / 100,
    monto: neto,
    mensaje: `Tenés ${diasRestantes} días restantes en tu plan actual ($${precioActual}/mes). Pagás la diferencia proporcional: $${neto}`,
  };
}

function parseModulos(plan) {
  if (!plan) return [];
  if (Array.isArray(plan.modulos)) return plan.modulos;
  if (typeof plan.modulos === 'string') { try { return JSON.parse(plan.modulos || '[]'); } catch { return []; } }
  return [];
}

function parseLimites(plan) {
  if (!plan) return {};
  if (typeof plan.limites === 'string') { try { return JSON.parse(plan.limites || '{}'); } catch { return {}; } }
  return plan.limites || {};
}

// ── Crear empresa completa desde un pago de signup aprobado ──
async function crearEmpresaDesdeSignup(pago) {
  const d = pago.data || {};
  const codigoBase = String(d.empresa_nombre || 'empresa').toLowerCase()
    .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 30) || 'empresa';
  let codigo = codigoBase, counter = 1;
  while (getEmpresa(codigo) || master.prepare("SELECT id FROM empresas WHERE codigo=?").get(codigo)) {
    codigo = codigoBase + '_' + counter;
    counter++;
  }
  if (d.email && master.prepare("SELECT codigo FROM empresas WHERE LOWER(admin_email)=LOWER(?)").get(String(d.email).trim().toLowerCase())) {
    throw new Error('Ya existe una empresa registrada con ese email.');
  }

  const plan = getPlan(pago.plan_id);
  const limites = parseLimites(plan);
  const vencimiento = extenderVencimiento(null, plan && plan.periodo);

  const empresaId = master.prepare(`INSERT INTO empresas
    (id,codigo,nombre,rubro,plan_id,activo,creado,admin_email,vencimiento,usuarios_max,sucursales_max,modulos_extra,modulos_bloqueados)
    VALUES (?,?,?,?,?,1,?,?,?,?,?,'[]','[]')`).run(
    'emp_' + Date.now(), codigo, d.empresa_nombre || 'Empresa', d.rubro || 'general', pago.plan_id,
    new Date().toISOString(), (d.email || '').trim().toLowerCase() || null, vencimiento,
    limites.usuarios_max || 5, limites.sucursales_max || 1
  ).lastInsertRowid;

  const empDB = getEmpresaDB(codigo);
  empDB.setConfig({
    rubro: d.rubro || 'general', nombre: d.empresa_nombre || 'Empresa',
    modulos_habilitados: JSON.stringify(parseModulos(plan)),
    nombre_dueno: d.nombre_dueno || '', apellido_dueno: d.apellido_dueno || '',
    telefono: d.telefono || '', ciudad: d.ciudad || '', como_conociste: d.como_conociste || '',
  });

  // Password llega ya hasheado desde create-preference (nunca guardar plaintext)
  const hash = d.password_hash || await bcrypt.hash(String(d.password || 'Temporal1!'), 10);
  const usuario = String(d.email || 'admin').split('@')[0].replace(/[^a-z0-9_]/g, '_').substring(0, 20);
  const adminId = 'u' + uid();
  empDB.insert('usuarios', {
    id: adminId, nombre: d.nombre_dueno || 'Admin', apellido: d.apellido_dueno || '', usuario,
    email: String(d.email || '').trim().toLowerCase(), password: hash,
    rol: 'admin', roles: JSON.stringify(['admin']), activo: true,
    email_verificado: 0, creado: new Date().toISOString(), password_changed_at: new Date().toISOString(),
  });
  empDB.insert('empleados', {
    id: uid(), nombre: d.nombre_dueno || 'Admin', apellido: d.apellido_dueno || null,
    email: String(d.email || '').trim().toLowerCase(), fecha_ingreso: new Date().toISOString().substr(0, 10),
    activo: 1, usuario_id: adminId, creado: new Date().toISOString(),
  });
  empDB.insert('sucursales', { id: uid(), nombre: d.empresa_nombre || 'Sucursal', dir: '', activo: true, creado: new Date().toISOString() });

  // Email de verificación (mismo patrón que /auth/signup)
  if (d.email) {
    try {
      const verToken = crypto.randomBytes(20).toString('hex');
      const verTokenHash = crypto.createHash('sha256').update(verToken).digest('hex');
      empDB.insert('email_tokens', {
        id: 'vet_' + Date.now(), usuario_id: adminId, email: String(d.email).trim().toLowerCase(),
        token_hash: verTokenHash, expires: new Date(Date.now() + 72 * 3600000).toISOString(), usado: 0, creado: new Date().toISOString(),
      });
      const { getGlobalConfig } = require('../../db_master');
      let h = getGlobalConfig('smtp_host'), p = parseInt(getGlobalConfig('smtp_port')) || 465;
      let u = getGlobalConfig('smtp_user'), pass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : '';
      if (!h || !u || !pass) {
        const envSmtp = getNotificationSMTP();
        if (envSmtp.host) { h = envSmtp.host; p = envSmtp.port; u = envSmtp.user; pass = envSmtp.pass; }
      }
      if (h && u && pass) {
        const { verificationEmail } = require('../email-templates');
        const appUrl = process.env.APP_URL || 'https://app.flexcrm.com.ar';
        const tutorialesUrl = process.env.TUTORIALES_URL || `${appUrl}/tutoriales`;
        const rem = getRemitente();
        await sendEmail(h, p, u, pass, rem.formatted, d.email, 'Verificá tu email y empezá — FlexCRM',
          verificationEmail(d.empresa_nombre || 'FlexCRM', codigo, usuario, appUrl + '/api/auth/verify-email/' + verToken, appUrl, tutorialesUrl)).catch(() => {});
      }
    } catch(e) { console.error('[Billing] Error enviando email verificación:', e.message); }
  }

  return { codigo, empresaId, adminId };
}

// ── Actualizar empresa existente con el plan del pago ──
// Upgrade inmediato: nuevo ciclo desde HOY (no desde vencimiento viejo).
// Renovación/manual: si ya está vencida, también desde hoy; si no, mantiene extensión clásica.
function actualizarEmpresaPlan(empresa, pago) {
  const plan = getPlan(pago.plan_id);
  if (!plan) throw new Error('Plan no encontrado: ' + pago.plan_id);
  const limites = parseLimites(plan);
  const esUpgrade = pago.tipo === 'upgrade';
  const baseISO = esUpgrade ? null : empresa.vencimiento;
  const vencimiento = extenderVencimiento(baseISO, plan.periodo);
  master.prepare('UPDATE empresas SET plan_id=?, usuarios_max=?, sucursales_max=?, vencimiento=?, activo=1 WHERE id=?')
    .run(pago.plan_id, limites.usuarios_max || empresa.usuarios_max || 5, limites.sucursales_max || empresa.sucursales_max || 2, vencimiento, empresa.id);
  try {
    const empDB = getEmpresaDB(empresa.codigo);
    const cfg = { modulos_habilitados: JSON.stringify(parseModulos(plan)), solicitud_plan: null };
    // Limpiar downgrade pendiente si existía (upgrade cancela downgrade programado)
    if (esUpgrade) cfg.pending_downgrade = null;
    empDB.setConfig(cfg);
  } catch(e) { console.error('[Billing] Error aplicando módulos al tenant:', e.message); }
  // Limpiar cualquier downgrade pendiente en saas_pagos para esta empresa
  if (esUpgrade) {
    try { master.prepare("DELETE FROM saas_pagos WHERE empresa_codigo=? AND tipo='downgrade' AND estado='pending'").run(empresa.codigo); } catch(e) {}
  }
  return { vencimiento, limites };
}

// Programa un downgrade para aplicar al vencimiento. Retorna el pago pendiente.
function programarDowngrade(empresa, planNuevo, usuario) {
  const plan = getPlan(planNuevo.id || planNuevo);
  if (!plan) throw new Error('Plan no encontrado');
  const aplicarDesde = empresa.vencimiento || new Date().toISOString().substr(0, 10);
  // Ya existe un downgrade pendiente → actualizarlo
  const existente = master.prepare("SELECT * FROM saas_pagos WHERE empresa_codigo=? AND tipo='downgrade' AND estado='pending' ORDER BY creado DESC LIMIT 1").get(empresa.codigo);
  if (existente) {
    const { updateSaasPago } = require('../../db_master');
    updateSaasPago(existente.id, {
      plan_id: plan.id, plan_nombre: plan.nombre, precio_snapshot: parseFloat(plan.precio) || null,
      monto: 0, data: { pending: true, aplicar_desde: aplicarDesde, usuario: usuario || '', reprogramado: new Date().toISOString() },
    });
    try {
      const empDB = getEmpresaDB(empresa.codigo);
      empDB.setConfig({ pending_downgrade: JSON.stringify({ plan_id: plan.id, plan_nombre: plan.nombre, aplicar_desde: aplicarDesde }) });
    } catch(e) {}
    return existente.id;
  }
  const { createSaasPago } = require('../../db_master');
  const pagoId = createSaasPago({
    empresa_codigo: empresa.codigo, empresa_id: empresa.id,
    plan_id: plan.id, plan_nombre: plan.nombre, precio_snapshot: parseFloat(plan.precio) || null,
    tipo: 'downgrade', monto: 0, moneda: 'ARS', estado: 'pending',
    origen: 'sistema', mp_external_ref: 'dow_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    data: { pending: true, aplicar_desde: aplicarDesde, usuario: usuario || '' },
  });
  try {
    const empDB = getEmpresaDB(empresa.codigo);
    empDB.setConfig({ pending_downgrade: JSON.stringify({ plan_id: plan.id, plan_nombre: plan.nombre, aplicar_desde: aplicarDesde }) });
  } catch(e) {}
  return pagoId;
}

// Aplica un downgrade pendiente (invocado por scheduler al vencer).
function aplicarDowngradePendiente(empresaCodigo) {
  const empresa = getEmpresa(empresaCodigo) || master.prepare("SELECT * FROM empresas WHERE codigo=?").get(empresaCodigo);
  if (!empresa) return null;
  const pendiente = master.prepare("SELECT * FROM saas_pagos WHERE empresa_codigo=? AND tipo='downgrade' AND estado='pending' ORDER BY creado DESC LIMIT 1").get(empresaCodigo);
  if (!pendiente) return null;
  let data = pendiente.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  const aplicarDesde = data && data.aplicar_desde;
  const hoy = new Date().toISOString().substr(0, 10);
  if (aplicarDesde && aplicarDesde > hoy) return null; // aún no vence
  const plan = getPlan(pendiente.plan_id);
  if (!plan) return null;
  const limites = parseLimites(plan);
  const vencimiento = extenderVencimiento(null, plan.periodo);
  master.prepare('UPDATE empresas SET plan_id=?, usuarios_max=?, sucursales_max=?, vencimiento=?, activo=1 WHERE id=?')
    .run(plan.id, limites.usuarios_max || empresa.usuarios_max || 5, limites.sucursales_max || empresa.sucursales_max || 2, vencimiento, empresa.id);
  try {
    const empDB = getEmpresaDB(empresa.codigo);
    empDB.setConfig({ modulos_habilitados: JSON.stringify(parseModulos(plan)), pending_downgrade: null, solicitud_plan: null });
  } catch(e) {}
  const { updateSaasPago } = require('../../db_master');
  updateSaasPago(pendiente.id, { estado: 'approved', monto: 0 });
  try {
    master.prepare(
      "INSERT INTO notificaciones (id, empresa_codigo, tipo, titulo, mensaje, creado, data) VALUES (?,?,?,?,?,?,?)"
    ).run('notif_' + Date.now() + '_' + empresa.codigo, empresa.codigo, 'downgrade_aplicado',
      `⬇ Plan cambiado a ${plan.nombre}`,
      `Tu plan cambió automáticamente a ${plan.nombre}. Nuevo vencimiento: ${vencimiento}.`,
      new Date().toISOString(), JSON.stringify({ accion: '/micuenta' }));
  } catch(e) {}
  saAudit('system', 'downgrade_aplicado', empresa.id, `Downgrade programado aplicado — ${plan.nombre} — vencimiento ${vencimiento}`);
  return { empresa, plan, vencimiento };
}

function renderTemplate(tpl, vars) {
  let out = tpl || '';
  for (const [k, v] of Object.entries(vars)) {
    out = out.split('{{' + k + '}}').join(String(v ?? ''));
  }
  return out;
}

async function enviarMailComprobante(pago, ctx) {
  const { getGlobalConfig } = require('../../db_master');
  const { getBillingConfig } = require('../../db_master');
  const billing = getBillingConfig();
  const empresaNombre = ctx.empresaNombre || 'FlexCRM';
  const vto = ctx.vencimiento || '';
  const vars = {
    empresa: empresaNombre,
    plan: pago.plan_nombre || pago.plan_id,
    monto: (pago.monto != null ? pago.monto : 0) + ' ' + (pago.moneda || 'ARS'),
    vencimiento: vto,
    comprobante: pago.comprobante_num || '—',
    dias: '',
  };
  const subject = renderTemplate(billing.mail_subject || 'Pago confirmado — FlexCRM {{plan}}', vars);
  const body = renderTemplate(
    billing.mail_body ||
    'Hola {{empresa}},\n\nConfirmamos tu pago por {{plan}} — {{monto}}.\nVencimiento: {{vencimiento}}\nComprobante N°: {{comprobante}}\n\nGracias por usar FlexCRM.',
    vars
  );
  const html = body.replace(/\n/g, '<br/>');

  let h = getGlobalConfig('smtp_host'), p = parseInt(getGlobalConfig('smtp_port')) || 465;
  let u = getGlobalConfig('smtp_user'), pass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : '';
  if (!h || !u || !pass) {
    const envSmtp = getNotificationSMTP();
    if (envSmtp.host) { h = envSmtp.host; p = envSmtp.port; u = envSmtp.user; pass = envSmtp.pass; }
  }
  if (!h || !u || !pass) return false;
  const rem = getRemitente();
  const destinos = [];
  if (ctx.adminEmail) destinos.push(ctx.adminEmail);
  const superAdminEmail = master.prepare("SELECT email FROM superadmin WHERE activo=1 ORDER BY id LIMIT 1").get();
  if (superAdminEmail && superAdminEmail.email) destinos.push(superAdminEmail.email);
  const attachments = [];
  if (pago.comprobante_path) {
    try {
      const fs = require('fs');
      if (fs.existsSync(pago.comprobante_path)) {
        attachments.push({ filename: pago.comprobante_num + '.pdf', path: pago.comprobante_path });
      }
    } catch(e) {}
  }
  for (const to of [...new Set(destinos)]) {
    await sendEmail(h, p, u, pass, rem.formatted, to, subject, html, attachments).catch(e => console.error('[Billing] Error email comprobante:', e.message));
  }
  return true;
}

// ═══════════════════════════════════════════════
// Punto de entrada: aplica un pago aprobado
// pago: fila saas_pagos. opts: { mpPaymentId, payerEmail }
// ═══════════════════════════════════════════════
async function aplicarPago(pago, opts = {}) {
  if (!pago) throw new Error('Pago inexistente');
  // Idempotencia real: ya aplicado = estado approved + comprobante generado
  if (pago.estado === 'approved' && pago.comprobante_num) {
    return { ya_aplicado: true, pago };
  }

  let empresa = null;
  let ctx = {};

  if (pago.tipo === 'signup' && !pago.empresa_codigo) {
    const { codigo, empresaId } = await crearEmpresaDesdeSignup(pago);
    empresa = master.prepare("SELECT * FROM empresas WHERE id=?").get(empresaId);
    ctx = { empresaNombre: empresa.nombre, adminEmail: empresa.admin_email, empresaCodigo: codigo };
    updateSaasPago(pago.id, { empresa_codigo: codigo, empresa_id: empresaId });
    pago = { ...pago, empresa_codigo: codigo, empresa_id: empresaId };
    saAuditExtended('system', 'pago_signup_empresa_creada', codigo,
      `Empresa creada por pago aprobado — plan ${pago.plan_nombre || pago.plan_id} — comprobante ${pago.comprobante_num || 'pendiente'}`, { data: { monto: pago.monto } });
  } else if (pago.tipo === 'signup' && pago.empresa_codigo) {
    // Signup con empresa ya creada (doble disparo webhook) — solo re-aplica plan
    empresa = master.prepare("SELECT * FROM empresas WHERE codigo=?").get(pago.empresa_codigo);
    if (empresa) {
      const r = actualizarEmpresaPlan(empresa, pago);
      ctx = { empresaNombre: empresa.nombre, adminEmail: empresa.admin_email, vencimiento: r.vencimiento };
    }
  } else {
    // upgrade / renovacion / manual: empresa debe existir
    empresa = master.prepare("SELECT * FROM empresas WHERE id=? OR codigo=?").get(pago.empresa_id || '', pago.empresa_codigo || '');
    if (!empresa) throw new Error('Empresa no encontrada para aplicar pago: ' + (pago.empresa_codigo || pago.empresa_id));
    const r = actualizarEmpresaPlan(empresa, pago);
    ctx = { empresaNombre: empresa.nombre, adminEmail: empresa.admin_email, vencimiento: r.vencimiento };
  }

  // Comprobante PDF
  if (!pago.comprobante_num) {
    const ahora = new Date();
    const compNum = 'MP-' + ahora.getFullYear() + '-' + String(master.prepare(
      "SELECT COUNT(*) as n FROM saas_pagos WHERE comprobante_num IS NOT NULL AND creado LIKE ?"
    ).get(ahora.getFullYear() + '%').n + 1).padStart(4, '0');
    const pdfPath = generarComprobantePDF({
      comprobanteNum: compNum,
      empresa: ctx.empresaNombre || pago.empresa_codigo || 'FlexCRM',
      empresaCodigo: pago.empresa_codigo || '',
      plan: pago.plan_nombre || pago.plan_id,
      monto: pago.monto, moneda: pago.moneda || 'ARS',
      tipo: pago.tipo, vencimiento: ctx.vencimiento,
      prorrateo: pago.prorrateo, origen: pago.origen,
      fecha: new Date().toISOString(),
    });
    updateSaasPago(pago.id, { comprobante_num: compNum, comprobante_path: pdfPath });
    pago = { ...pago, comprobante_num: compNum, comprobante_path: pdfPath };
  }

  // Notificación in-app para la empresa
  try {
    master.prepare(
      "INSERT INTO notificaciones (id, empresa_codigo, tipo, titulo, mensaje, creado, data) VALUES (?,?,?,?,?,?,?)"
    ).run('notif_' + Date.now() + '_' + (pago.empresa_codigo || 'billing'), pago.empresa_codigo, 'pago_confirmado',
      `✅ Pago confirmado — ${pago.plan_nombre || pago.plan_id}`,
      `Tu pago de ${(pago.monto != null ? pago.monto : 0)} ${pago.moneda || 'ARS'} fue aprobado. Vencimiento: ${ctx.vencimiento || '—'}. Comprobante: ${pago.comprobante_num || '—'}`,
      new Date().toISOString(), JSON.stringify({ accion: '/micuenta' }));
  } catch(e) {}

  updateSaasPago(pago.id, {
    estado: 'approved',
    mp_payment_id: pago.mp_payment_id || opts.mpPaymentId || null,
  });

  saAudit('system', 'pago_aprobado', pago.empresa_id || pago.empresa_codigo || null,
    `Pago ${pago.origen} aprobado — ${pago.plan_nombre || pago.plan_id} — ${pago.monto} ${pago.moneda || 'ARS'} — comprobante ${pago.comprobante_num || ''}`);

  // Mail de comprobante (nunca bloquea)
  await enviarMailComprobante({ ...pago }, ctx).catch(e => console.error('[Billing] Error mail comprobante:', e.message));

  return { ok: true, pago, ctx };
}

module.exports = { aplicarPago, calcularProrrateo, extenderVencimiento, diasPeriodo, parseModulos, parseLimites, renderTemplate, programarDowngrade, aplicarDowngradePendiente };
