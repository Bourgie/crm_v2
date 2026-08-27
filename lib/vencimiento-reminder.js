// ═══════════════════════════════════════════
// Recordatorio automático de vencimiento de plan
// - Notifica in-app (tabla notificaciones → campana del CRM)
// - Envía email si hay SMTP configurado
// - Dedupe por (empresa, día restante, fecha)
// - Umbrales y grace configurables desde SuperAdmin (billing config)
// - Suspensión automática post-grace (opcional)
// ═══════════════════════════════════════════
const { master, getEmpresas, getBillingConfig, saAudit } = require('../db_master');
const { sendEmail, getNotificationSMTP, getRemitente } = require('./send-email');
const { renderTemplate } = require('./billing/aplicar-pago');

function parseAvisoDias(cfg) {
  try {
    return String(cfg.aviso_dias || '7,3,1,0,-1,-3')
      .split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  } catch { return [7, 3, 1, 0, -1, -3]; }
}

function mensajeVencimiento(dias, vencimiento, planNombre) {
  const vtoFmt = vencimiento ? new Date(vencimiento + 'T12:00:00').toLocaleDateString('es-AR') : '';
  if (dias > 1) return `Tu plan${planNombre ? ' ' + planNombre : ''} vence en ${dias} días (el ${vtoFmt}). Renová para no perder el acceso.`;
  if (dias === 1) return `⚠️ Tu plan${planNombre ? ' ' + planNombre : ''} vence mañana (${vtoFmt}). Renová hoy para continuar sin interrupciones.`;
  if (dias === 0) return `🚨 Tu plan${planNombre ? ' ' + planNombre : ''} vence HOY (${vtoFmt}). Renová ahora para continuar.`;
  if (dias === -1) return `❌ Tu plan venció ayer (${vtoFmt}). Renová para recuperar el acceso completo.`;
  return `❌ Tu plan venció hace ${Math.abs(dias)} días (${vtoFmt}). Renová para recuperar el acceso completo.`;
}

function tituloVencimiento(dias) {
  if (dias > 1) return `⏰ Tu plan de FlexCRM vence en ${dias} días`;
  if (dias === 1) return '⚠️ Tu plan de FlexCRM vence mañana';
  if (dias === 0) return '🚨 Tu plan de FlexCRM vence hoy';
  return '❌ Tu plan de FlexCRM está vencido';
}

function yaNotificado(empresaCodigo, dias, hoyStr) {
  const row = master.prepare(
    "SELECT id FROM notificaciones WHERE empresa_codigo=? AND tipo='vencimiento_plan' AND creado LIKE ? AND data LIKE ?"
  ).get(empresaCodigo, hoyStr + '%', '%"dias":' + dias + '%');
  return !!row;
}

async function enviarEmailVencimiento(empresa, dias, vencimiento, planNombre) {
  const cfg = getBillingConfig();
  const smtp = getNotificationSMTP();
  let h = smtp.host, p = smtp.port, u = smtp.user, pass = smtp.pass;
  if (!h || !u || !pass) {
    const { getGlobalConfig } = require('../db_master');
    const { decryptValue } = require('./crypto-utils');
    h = getGlobalConfig('smtp_host'); p = parseInt(getGlobalConfig('smtp_port')) || 465;
    u = getGlobalConfig('smtp_user'); pass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : '';
  }
  if (!h || !u || !pass || !empresa.admin_email) return false;

  const vars = {
    empresa: empresa.nombre || empresa.codigo,
    plan: planNombre || '—',
    monto: '', vencimiento: vencimiento || '', comprobante: '',
    dias: String(dias),
  };
  const subject = renderTemplate(cfg.mail_subject || tituloVencimiento(dias), vars);
  const body = renderTemplate(
    cfg.mail_body || mensajeVencimiento(dias, vencimiento, planNombre) + '\n\nIngresá a FlexCRM para renovar tu suscripción.',
    vars
  );
  const rem = getRemitente();
  const appUrl = process.env.APP_URL || 'https://app.flexcrm.com.ar';
  const html = body.replace(/\n/g, '<br/>') + '<br/><br/><a href="' + appUrl + '/app/login" style="display:inline-block;padding:10px 24px;background:#F97316;color:#fff;text-decoration:none;border-radius:8px">Ir a FlexCRM</a>';
  try {
    await sendEmail(h, p, u, pass, rem.formatted, empresa.admin_email, subject, html);
    return true;
  } catch(e) {
    console.error('[Vencimiento] Error email:', e.message);
    return false;
  }
}

function suspenderEmpresa(empresa) {
  try {
    master.prepare("UPDATE empresas SET activo=0 WHERE id=?").run(empresa.id);
    master.prepare(
      "INSERT INTO notificaciones (id, empresa_codigo, tipo, titulo, mensaje, creado, data) VALUES (?,?,?,?,?,?,?)"
    ).run('notif_' + Date.now() + '_' + empresa.codigo, empresa.codigo, 'suspension_plan',
      '⛔ Cuenta suspendida por falta de pago',
      'Tu cuenta fue suspendida porque el plan venció hace varios días. Renová para reactivarla.',
      new Date().toISOString(), JSON.stringify({ accion: '/micuenta' }));
    saAudit('system', 'suspension_automatica', empresa.id, 'Suspensión automática post-grace: ' + empresa.codigo);
    return true;
  } catch(e) { return false; }
}

async function checkVencimientos() {
  const cfg = getBillingConfig();
  const umbrales = parseAvisoDias(cfg);
  const grace = cfg.grace_days || 3;
  const hoyStr = new Date().toISOString().substr(0, 10);
  const hoy = new Date(hoyStr + 'T12:00:00');
  const empresas = getEmpresas().filter(e => e.activo === 1 && e.vencimiento);
  let notificadas = 0, suspendidas = 0;

  for (const e of empresas) {
    try {
      const vto = new Date(e.vencimiento + 'T12:00:00');
      if (isNaN(vto.getTime())) continue;
      const dias = Math.ceil((vto - hoy) / 86400000);

      // Suspensión automática post-grace (días vencidos > grace)
      if (cfg.suspend_after_grace && dias < -grace) {
        if (suspenderEmpresa(e)) suspendidas++;
        continue;
      }

      if (!umbrales.includes(dias)) continue;
      if (yaNotificado(e.codigo, dias, hoyStr)) continue;

      const plan = (() => { try { const { getPlan } = require('../db_master'); const p = getPlan(e.plan_id); return p ? p.nombre : null; } catch { return null; } })();

      master.prepare(
        "INSERT INTO notificaciones (id, empresa_codigo, tipo, titulo, mensaje, creado, data) VALUES (?,?,?,?,?,?,?)"
      ).run('notif_' + Date.now() + '_' + e.codigo, e.codigo, 'vencimiento_plan',
        tituloVencimiento(dias), mensajeVencimiento(dias, e.vencimiento, plan),
        new Date().toISOString(), JSON.stringify({ accion: '/micuenta', dias }));

      await enviarEmailVencimiento(e, dias, e.vencimiento, plan);
      saAudit('system', 'vencimiento_notificado', e.id, `Vencimiento avisado (${dias} días) — ${e.codigo}`);
      notificadas++;
    } catch(err) {
      console.error('[Vencimiento] Error procesando ' + e.codigo + ':', err.message);
    }
  }
  if (notificadas > 0 || suspendidas > 0) {
    console.log(`[Vencimientos] ${notificadas} notificadas, ${suspendidas} suspendidas.`);
  }
  return { notificadas, suspendidas };
}

let scheduler = null;

function startVencimientoScheduler(intervalMs) {
  const interval = intervalMs || 12 * 60 * 60 * 1000; // cada 12h
  if (scheduler) clearInterval(scheduler);
  console.log('[Vencimientos] Scheduler iniciado (cada ' + Math.round(interval / 3600000) + 'h).');
  setTimeout(checkVencimientos, 60000);
  scheduler = setInterval(checkVencimientos, interval);
}

function stopVencimientoScheduler() {
  if (scheduler) { clearInterval(scheduler); scheduler = null; }
}

module.exports = { checkVencimientos, startVencimientoScheduler, stopVencimientoScheduler };
