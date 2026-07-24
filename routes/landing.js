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

// Public landing page webhook — no auth, accepts JSON and form-urlencoded
router.post('/lead', (req, res) => {
  const { nombre, telefono, email, mensaje, empresa_interes, pagina } = req.body;
  const redirect = req.headers['content-type']?.includes('json') ? false : true;
  if (!nombre || !(mensaje || telefono)) {
    if (redirect) return res.redirect('/gracias.html?error=1');
    return res.status(400).json({ error: 'Nombre y al menos un contacto requeridos' });
  }
  try {
    const { master } = require('../db_master');
    const id = 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const fecha = new Date().toISOString();

    master.prepare(`INSERT INTO landing_leads (id,nombre,telefono,email,mensaje,empresa_interes,pagina,leido,fecha)
      VALUES (?,?,?,?,?,?,?,0,?)`).run(
      id, nombre.trim(), (telefono || '').trim(), (email || '').trim(),
      (mensaje || '').trim(), (empresa_interes || '').trim(),
      pagina || req.headers['referer'] || req.headers['origin'] || '', fecha
    );

    // Also create a prospecto automatically
    const pid = 'pros_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    master.prepare(`INSERT INTO prospectos (id,nombre,telefono,email,empresa_interes,origen,estado,notas,fecha_creacion)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      pid, nombre.trim(), (telefono || '').trim(), (email || '').trim(),
      (empresa_interes || '').trim(), pagina || 'landing', 'nuevo',
      'Lead desde landing: ' + (mensaje || 'Sin mensaje'), fecha
    );

    // Async: send email notification to superadmin
    notifyNewLead(nombre, telefono || '', email || '', empresa_interes || '', mensaje || '');

    if (redirect) return res.redirect('/gracias.html?from=' + encodeURIComponent(pagina || 'flexcrm'));
    res.json({ ok: true, id });
  } catch (e) {
    console.error('[Landing] Error:', e.message);
    if (redirect) return res.redirect('/gracias.html?error=1');
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Health check for landing form
router.get('/health', (req, res) => res.json({ ok: true, service: 'flexcrm-landing' }));

// ── Zoho Forms webhook ──
// Zoho Forms sends nested JSON: {"Name":{"first_name":"..."},"Email":{"value":"..."},...}
// We also support flat JSON for custom configurations
function parseZohoField(body, keys) {
  for (const key of keys) {
    if (body[key] !== undefined) {
      if (typeof body[key] === 'object' && body[key] !== null) {
        if (body[key].value !== undefined) return String(body[key].value);
        if (body[key].first_name !== undefined) {
          const fn = body[key].first_name || '';
          const ln = body[key].last_name || '';
          return (fn + ' ' + ln).trim();
        }
        return JSON.stringify(body[key]);
      }
      return String(body[key]);
    }
  }
  return '';
}

router.post('/zoho-form', (req, res) => {
  try {
    const nombre = parseZohoField(req.body, ['Name', 'Nombre', 'name', 'nombre']);
    const email = parseZohoField(req.body, ['Email', 'email', 'Correo', 'correo']);
    const telefono = parseZohoField(req.body, ['PhoneNumber', 'Phone', 'Telefono', 'telefono', 'phone', 'Celular']);
    const mensaje = parseZohoField(req.body, ['MultiLine', 'Mensaje', 'mensaje', 'message', 'Consulta', 'Descripcion', 'Descripción']);
    const empresa = parseZohoField(req.body, ['Empresa', 'empresa', 'Negocio', 'Company', 'Dropdown']);
    const pagina = parseZohoField(req.body, ['Pagina', 'pagina', 'SingleLine2']) || 'zoho-form';

    const nombreFinal = nombre || email || 'Lead Zoho';
    const telefonoFinal = telefono || '';
    const emailFinal = email || '';
    const mensajeFinal = mensaje || '';

    const { master } = require('../db_master');
    const id = 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const fecha = new Date().toISOString();

    master.prepare(`INSERT INTO landing_leads (id,nombre,telefono,email,mensaje,empresa_interes,pagina,leido,fecha)
      VALUES (?,?,?,?,?,?,?,0,?)`).run(
      id, nombreFinal.trim(), telefonoFinal.trim(), emailFinal.trim(),
      mensajeFinal.trim(), empresa.trim(), pagina, fecha
    );

    const pid = 'pros_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    master.prepare(`INSERT INTO prospectos (id,nombre,telefono,email,empresa_interes,origen,estado,notas,fecha_creacion)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      pid, nombreFinal.trim(), telefonoFinal.trim(), emailFinal.trim(),
      empresa.trim(), pagina, 'nuevo',
      'Lead desde Zoho Forms: ' + (mensajeFinal || 'Sin mensaje'), fecha
    );

    notifyNewLead(nombreFinal, telefonoFinal, emailFinal, empresa, mensajeFinal);
    res.json({ ok: true, id });
  } catch (e) {
    console.error('[ZohoForm] Error:', e.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
