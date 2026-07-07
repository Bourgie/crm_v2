const { Router } = require('express');
const router = Router();

function notifyNewLead(nombre, telefono, email, empresa, mensaje) {
  setImmediate(async () => {
    try {
      const { sendNotificationEmail, buildNotificationHtml } = require('../lib/send-email');
      const title = `Nuevo lead: ${nombre}`;
      const body = `Alguien completó el formulario de contacto en la landing page.`;
      const details = [
        `👤 <b>Nombre:</b> ${nombre}`,
        `📞 <b>Teléfono:</b> ${telefono}`,
        email ? `✉️ <b>Email:</b> ${email}` : null,
        empresa ? `🏢 <b>Empresa:</b> ${empresa}` : null,
        mensaje ? `💬 <b>Mensaje:</b> "${mensaje.substring(0, 200)}${mensaje.length > 200 ? '...' : ''}"` : null,
      ].filter(Boolean).join('\n');
      const link = process.env.APP_URL || 'http://localhost:3000';
      await sendNotificationEmail(
        null,
        `🆕 ${title}`,
        buildNotificationHtml(title, body, details, `${link}/admin?tab=landing`)
      );
    } catch (e) {
      console.error('[Landing] Email notification error:', e.message);
    }
  });
}

// Public landing page webhook — no auth
router.post('/lead', (req, res) => {
  const { nombre, telefono, email, mensaje, empresa } = req.body;
  if (!nombre || !telefono) {
    return res.status(400).json({ error: 'Nombre y teléfono requeridos' });
  }
  try {
    const { master } = require('../db_master');
    const id = 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const fecha = new Date().toISOString();

    master.prepare(`INSERT INTO landing_leads (id,nombre,telefono,email,mensaje,empresa_interes,pagina,leido,fecha)
      VALUES (?,?,?,?,?,?,?,0,?)`).run(
      id, nombre.trim(), telefono.trim(), (email || '').trim(),
      (mensaje || '').trim(), (empresa || '').trim(),
      req.headers['referer'] || req.headers['origin'] || '', fecha
    );

    // Also create a prospecto automatically
    const pid = 'pros_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    master.prepare(`INSERT INTO prospectos (id,nombre,telefono,email,empresa_interes,origen,estado,notas,fecha_creacion)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      pid, nombre.trim(), telefono.trim(), (email || '').trim(),
      (empresa || '').trim(), 'landing', 'nuevo',
      'Lead desde landing page: ' + (mensaje || 'Sin mensaje'), fecha
    );

    // Async: send email notification to superadmin
    notifyNewLead(nombre, telefono, email, empresa, mensaje);

    res.json({ ok: true, id });
  } catch (e) {
    console.error('[Landing] Error:', e.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Health check for landing form
router.get('/health', (req, res) => res.json({ ok: true, service: 'flexcrm-landing' }));

module.exports = router;
