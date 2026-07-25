const { master } = require('../db_master');

// Thresholds in days per estado
const STALE_THRESHOLDS = {
  nuevo: 3,        // If new and no contact in 3 days → reminder
  contactado: 5,   // If contacted but no follow-up in 5 days → reminder
  interesado: 7,   // If interested but no contact in 7 days → reminder
  calificado: 14,  // If qualified but no contact in 14 days → reminder
  default: 7,
};

// Auto-status changes for very stale prospects
const AUTO_STATUS_DAYS = {
  nuevo: 14,       // 14 days without contact → mark as "perdido"
  contactado: 21,  // 21 days → "perdido"
  interesado: 30,  // 30 days → mark as "estancado" (cold)
  calificado: 45,  // 45 days → "estancado"
};

function getStaleProspects() {
  const prospects = master.prepare(
    "SELECT * FROM prospectos WHERE estado NOT IN ('cerrado_ganado','cerrado_perdido','estancado')"
  ).all();
  const now = Date.now();
  return prospects.filter(p => {
    if (!p.fecha_ultimo_contacto) return true;
    const days = (now - new Date(p.fecha_ultimo_contacto).getTime()) / 86400000;
    const threshold = STALE_THRESHOLDS[p.estado] || STALE_THRESHOLDS.default;
    return days > threshold;
  });
}

function getVeryStaleProspects() {
  const prospects = master.prepare(
    "SELECT * FROM prospectos WHERE estado NOT IN ('cerrado_ganado','cerrado_perdido','estancado')"
  ).all();
  const now = Date.now();
  return prospects.filter(p => {
    if (!p.fecha_ultimo_contacto) {
      const days = (now - new Date(p.fecha_creacion).getTime()) / 86400000;
      const autoDays = AUTO_STATUS_DAYS.nuevo;
      return days > autoDays;
    }
    const days = (now - new Date(p.fecha_ultimo_contacto).getTime()) / 86400000;
    const autoDays = AUTO_STATUS_DAYS[p.estado] || 30;
    return days > autoDays;
  });
}

function autoChangeStatus() {
  const veryStale = getVeryStaleProspects();
  const now = new Date().toISOString();
  let changed = 0;

  for (const p of veryStale) {
    const newStatus = p.estado === 'nuevo' && !p.fecha_ultimo_contacto ? 'perdido' : 'estancado';
    master.prepare("UPDATE prospectos SET estado=?, notas=notas || ? WHERE id=?")
      .run(newStatus, ` [Auto: marcado como ${newStatus} por inactividad — ${now.split('T')[0]}]`, p.id);

    // Log as seguimiento
    master.prepare("INSERT INTO prospecto_seguimiento (id,prospecto_id,tipo,descripcion,fecha,creado_por) VALUES (?,?,?,?,?,?)")
      .run('sa_' + Date.now(), p.id, 'auto', `Prospecto marcado como "${newStatus}" automáticamente por ${p.estado === 'nuevo' && !p.fecha_ultimo_contacto ? 'falta de primer contacto' : 'inactividad prolongada'}.`, now, 'sistema');

    // Audit log
    try { require('../db_master').saAudit('system', 'auto_status', p.id, `Prospecto "${p.nombre}" → ${newStatus} (auto)`); } catch {}
    changed++;
  }
  if (changed > 0) console.log(`[Pipeline] Auto-status: ${changed} prospectos actualizados.`);
  return changed;
}

function autoArchiveDeadOpportunities() {
  const { getEmpresas, getEmpresa } = require('../db_master');
  const { getEmpresaDB } = require('../db_sqlite');
  const empresas = getEmpresas();
  let archived = 0;

  for (const emp of empresas) {
    if (!emp.activo) continue;
    try {
      const db = getEmpresaDB(emp.codigo);
      const ops = db.where('pipeline_oportunidades',
        o => o.activo !== false && o.estado === 'activo' && o.fecha_cierre_estimada
      );
      const now = Date.now();
      for (const o of ops) {
        const days = (now - new Date(o.fecha_cierre_estimada).getTime()) / 86400000;
        if (days > 30) {
          db.update('pipeline_oportunidades', o.id, {
            estado: 'archivado',
            notas: (o.notas || '') + ` [Auto-archivado: ${new Date().toISOString().split('T')[0]} — ${Math.round(days)}d fuera de plazo]`
          });
          archived++;
        }
      }
    } catch(e) { /* skip broken DBs */ }
  }
  if (archived > 0) console.log(`[Pipeline] Auto-archive: ${archived} oportunidades archivadas.`);
  return archived;
}

async function runStaleCheck() {
  console.log('[Pipeline] Running automated checks...');
  const stale = getStaleProspects();
  const autoChanged = autoChangeStatus();
  const autoArchived = autoArchiveDeadOpportunities();

  if (stale.length > 0) {
    console.log(`[Pipeline] Found ${stale.length} stale prospect(s).`);
    try {
      const { sendNotificationEmail, buildNotificationHtml } = require('./send-email');
      const title = `${stale.length} prospectos necesitan seguimiento`;
      const body = `Hay ${stale.length} prospectos que no han tenido contacto reciente.`;
      const details = stale.map(p =>
        `• ${p.nombre} (${p.telefono || 'sin tel'}) — ${p.estado} — Último: ${p.fecha_ultimo_contacto ? new Date(p.fecha_ultimo_contacto).toLocaleDateString('es-AR') : 'Nunca'}`
      ).join('\n');
      const link = process.env.APP_URL || 'https://app.flexcrm.com.ar';
      await sendNotificationEmail(null, `⏰ ${title}`, buildNotificationHtml(title, body, details, `${link}/admin?tab=prospectos`));
      console.log(`[Pipeline] Summary email sent for ${stale.length} prospects.`);
    } catch (e) { console.error('[Pipeline] Error sending summary:', e.message); }
  }

  const total = stale.length + autoChanged + autoArchived;
  if (total === 0) console.log('[Pipeline] All clean — no actions needed.');
  return { stale: stale.length, autoStatus: autoChanged, autoArchive: autoArchived };
}

let reminderInterval = null;

function startStaleReminderScheduler(intervalMs) {
  const interval = intervalMs || 24 * 60 * 60 * 1000; // Default 24h
  if (reminderInterval) clearInterval(reminderInterval);
  console.log(`[Pipeline] Scheduler started (every ${Math.round(interval / 3600000)}h).`);
  // First run after 30 seconds (let everything load)
  setTimeout(runStaleCheck, 30000);
  reminderInterval = setInterval(runStaleCheck, interval);
}

function stopStaleReminderScheduler() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log('[Pipeline] Scheduler stopped.');
  }
}

module.exports = { getStaleProspects, runStaleCheck, startStaleReminderScheduler, stopStaleReminderScheduler };
