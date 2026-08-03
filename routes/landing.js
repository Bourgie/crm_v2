const { Router } = require('express');
const router = Router();

function notifyNewLead(nombre, telefono, email, empresa, mensaje) {
  setImmediate(async () => {
    try {
      const { sendEmail, getTenantSMTP, getNotificationSMTP } = require('../lib/send-email');
      const { newLeadEmail } = require('../lib/email-templates');
      const adminLink = (process.env.APP_URL || 'https://app.flexcrm.com.ar') + '/admin?tab=landing';
      const html = newLeadEmail(nombre, telefono, email, mensaje, empresa, adminLink);
      // Use global SMTP for admin notifications
      const smtp = getNotificationSMTP();
      if (smtp.host && smtp.user && smtp.to) {
        await sendEmail(smtp.host, smtp.port, smtp.user, smtp.pass, smtp.from, smtp.to, '🆕 Nuevo lead: ' + nombre, html);
      } else {
        // Fallback: try tenant SMTP
        try {
          const { sendTenantEmail } = require('../lib/send-email');
          await sendTenantEmail(null, null, '🆕 Nuevo lead: ' + nombre, html);
        } catch(fb) { /* can't send */ }
      }
    } catch (e) { console.error('[Landing] Email error:', e.message); }
  });
}

// Public landing page webhook — no auth, accepts JSON and form-urlencoded
router.post('/lead', (req, res) => {
  const { nombre, telefono, email, mensaje, empresa_interes, pagina, ref, utm_source, utm_medium, utm_campaign } = req.body;
  const redirect = req.headers['content-type']?.includes('json') ? false : true;
  if (!nombre || !(mensaje || telefono)) {
    if (redirect) return res.redirect('/gracias.html?error=1');
    return res.status(400).json({ error: 'Nombre y al menos un contacto requeridos' });
  }
  try {
    const { master } = require('../db_master');
    const id = 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const fecha = new Date().toISOString();
    const refVal = ref || req.headers['referer'] || '';
    const ua = (req.headers['user-agent'] || '').substring(0, 250);
    const ip = (req.ip || req.headers['x-forwarded-for'] || '').substring(0, 45);

    master.prepare(`INSERT INTO landing_leads (id,nombre,telefono,email,mensaje,empresa_interes,pagina,ref,utm_source,utm_medium,utm_campaign,ua,ip,tipo,seccion,leido,fecha)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`).run(
      id, nombre.trim(), (telefono || '').trim(), (email || '').trim(),
      (mensaje || '').trim(), (empresa_interes || '').trim(),
      pagina || req.headers['referer'] || req.headers['origin'] || '',
      refVal, (utm_source || '').substring(0, 100), (utm_medium || '').substring(0, 100), (utm_campaign || '').substring(0, 100),
      ua, ip, 'lead', '', fecha
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

    master.prepare(`INSERT INTO landing_leads (id,nombre,telefono,email,mensaje,empresa_interes,pagina,tipo,leido,fecha)
      VALUES (?,?,?,?,?,?,?,?,0,?)`).run(
      id, nombreFinal.trim(), telefonoFinal.trim(), emailFinal.trim(),
      mensajeFinal.trim(), empresa.trim(), pagina, 'lead', fecha
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

// ── Analytics tracking pixel + click events ──
// Query params: p=page, ref=referrer, utm_source/medium/campaign, tipo=pv|clic, seccion=hero|planes|etc
router.get('/pixel', (req, res) => {
  try {
    const { master } = require('../db_master');
    const id = 'pv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const pagina = req.query.p || req.headers['referer'] || '';
    const ref = req.query.ref || '';
    const utm_source = (req.query.utm_source || '').substring(0, 100);
    const utm_medium = (req.query.utm_medium || '').substring(0, 100);
    const utm_campaign = (req.query.utm_campaign || '').substring(0, 100);
    const ua = (req.headers['user-agent'] || '').substring(0, 250);
    const ip = (req.ip || req.headers['x-forwarded-for'] || '').substring(0, 45);
    const tipo = req.query.tipo === 'clic' ? 'clic' : 'pv';
    const seccion = (req.query.seccion || '').substring(0, 50);
    const nombreMarker = tipo === 'clic' ? 'Evento' : 'Analytics';

    master.prepare(`INSERT INTO landing_leads (id,nombre,telefono,email,mensaje,empresa_interes,pagina,ref,utm_source,utm_medium,utm_campaign,ua,ip,tipo,seccion,leido,fecha)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,2,?)`).run(
      id, nombreMarker, '', '', '', '', pagina,
      ref, utm_source, utm_medium, utm_campaign, ua, ip, tipo, seccion,
      new Date().toISOString()
    );
  } catch(e) { /* silent */ }
  // Return a 1x1 transparent pixel
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(pixel);
});

module.exports = router;
