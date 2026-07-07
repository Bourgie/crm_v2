const { master } = require('../db_master');

function getStaleProspects() {
  const prospects = master.prepare("SELECT * FROM prospectos WHERE estado NOT IN ('cerrado_ganado','cerrado_perdido')").all();
  const now = Date.now();
  return prospects.filter(p => {
    if (!p.fecha_ultimo_contacto) return true;
    const days = (now - new Date(p.fecha_ultimo_contacto).getTime()) / 86400000;
    return days > 7;
  });
}

async function sendStaleReminder(prospecto) {
  try {
    const { sendNotificationEmail, buildNotificationHtml } = require('./send-email');
    const diasSinContacto = prospecto.fecha_ultimo_contacto
      ? Math.round((Date.now() - new Date(prospecto.fecha_ultimo_contacto).getTime()) / 86400000)
      : 'Nunca contactado';
    const title = `Recordatorio: Prospecto "${prospecto.nombre}" necesita seguimiento`;
    const body = `Este prospecto lleva ${diasSinContacto} días sin contacto.`;
    const details = [
      `👤 <b>Nombre:</b> ${prospecto.nombre}`,
      `📞 <b>Teléfono:</b> ${prospecto.telefono || '-'}`,
      `✉️ <b>Email:</b> ${prospecto.email || '-'}`,
      `🏢 <b>Empresa:</b> ${prospecto.empresa_interes || '-'}`,
      `📊 <b>Estado actual:</b> ${prospecto.estado}`,
      `📅 <b>Último contacto:</b> ${prospecto.fecha_ultimo_contacto || 'Nunca'}`,
    ].join('\n');
    const link = process.env.APP_URL || 'http://localhost:3000';
    await sendNotificationEmail(
      null,
      `⏰ ${title}`,
      buildNotificationHtml(title, body, details, `${link}/app/superadmin?tab=prospectos`)
    );
    return true;
  } catch (e) {
    console.error('[StaleReminder] Error sending email:', e.message);
    return false;
  }
}

async function runStaleCheck() {
  console.log('[StaleReminder] Running stale prospect check...');
  const stale = getStaleProspects();
  if (stale.length === 0) {
    console.log('[StaleReminder] No stale prospects found.');
    return;
  }
  console.log(`[StaleReminder] Found ${stale.length} stale prospect(s).`);
  const { sendNotificationEmail, buildNotificationHtml } = require('./send-email');

  // Send summary email
  try {
    const title = `${stale.length} prospectos necesitan seguimiento`;
    const body = `Hay ${stale.length} prospectos que no han tenido contacto en más de 7 días.`;
    const details = stale.map(p =>
      `• ${p.nombre} (${p.telefono || 'sin tel'}) — Estado: ${p.estado} — Último contacto: ${p.fecha_ultimo_contacto ? new Date(p.fecha_ultimo_contacto).toLocaleDateString('es-AR') : 'Nunca'}`
    ).join('\n');
    const link = process.env.APP_URL || 'http://localhost:3000';
    await sendNotificationEmail(
      null,
      `⏰ ${title}`,
      buildNotificationHtml(title, body, details, `${link}/app/superadmin?tab=prospectos`)
    );
    console.log(`[StaleReminder] Summary email sent for ${stale.length} prospects.`);
  } catch (e) {
    console.error('[StaleReminder] Error sending summary:', e.message);
  }
}

let reminderInterval = null;

function startStaleReminderScheduler(intervalMs) {
  const interval = intervalMs || 24 * 60 * 60 * 1000; // Default: 24h
  if (reminderInterval) clearInterval(reminderInterval);
  console.log(`[StaleReminder] Scheduler started (every ${Math.round(interval / 3600000)}h).`);
  runStaleCheck(); // Run immediately on start
  reminderInterval = setInterval(runStaleCheck, interval);
}

function stopStaleReminderScheduler() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log('[StaleReminder] Scheduler stopped.');
  }
}

module.exports = { getStaleProspects, sendStaleReminder, runStaleCheck, startStaleReminderScheduler, stopStaleReminderScheduler };
