const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ── Public signup (email verification flow + full audit) ──
function setupSignupRoutes(router, getSecret, REFRESH_TOKEN_EXPIRY, setRefreshCookie, checkSignupEmailLimit) {

router.post('/signup', async (req, res) => {
  const { empresa_nombre, email, password, rubro, website } = req.body;
  const clientIP = req.ip || req.connection?.remoteAddress || '';
  const clientUA = req.headers['user-agent'] || '';
  const buildMeta = (extra = {}) => ({ ip: clientIP, userAgent: clientUA, email, data: { empresa: empresa_nombre || '', rubro, ...extra } });

  // Honeypot check (hidden field - if filled, it's a bot)
  if (website && website.length > 0) {
    try { const { saAuditExtended } = require('../db_master'); saAuditExtended('system', 'signup_honeypot', null, 'Bot detectado', buildMeta()); } catch {}
    return res.json({ ok: true, mensaje: 'Revisa tu email para activar la cuenta.' });
  }

  if (!empresa_nombre || !email || !password) {
    try { const { saAuditExtended } = require('../db_master'); saAuditExtended('system', 'signup_fallido', null, 'Campos incompletos', buildMeta()); } catch {}
    return res.status(400).json({ error: 'Nombre del negocio, email y contrasena requeridos' });
  }
  const pwErr = require('../lib/password-policy').validatePassword(password);
  if (pwErr) {
    try { const { saAuditExtended } = require('../db_master'); saAuditExtended('system', 'signup_fallido', null, pwErr, buildMeta()); } catch {}
    return res.status(400).json({ error: pwErr });
  }

  // Disposable email check
  try {
    const { isDisposableEmail, saAuditExtended } = require('../db_master');
    if (isDisposableEmail(email)) {
      saAuditExtended('system', 'signup_email_bloqueado', null, 'Email descartable: ' + email.split('@')[1], buildMeta());
      return res.status(400).json({ error: 'Usa un email valido para registrarte.' });
    }
  } catch {}

  // Rate limit
  if (!checkSignupEmailLimit(email)) {
    try { const { saAuditExtended } = require('../db_master'); saAuditExtended('system', 'signup_rate_limited', null, 'Rate limit', buildMeta()); } catch {}
    return res.status(429).json({ error: 'Ya te registraste con este email recientemente.' });
  }

  try {
    const { getEmpresaDB, uid } = require('../db_sqlite');
    const { master, getEmpresa, createEmpresa, saAuditExtended } = require('../db_master');

    // Generate tenant code
    let codigo = empresa_nombre.toLowerCase()
      .replace(/[àâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ñ/g, 'n')
      .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 30) || 'empresa';
    let finalCodigo = codigo, counter = 1;
    while (getEmpresa(finalCodigo) || master.prepare("SELECT id FROM empresas WHERE codigo=?").get(finalCodigo)) {
      finalCodigo = codigo + '_' + counter; counter++;
    }

    const existing = master.prepare("SELECT codigo FROM empresas WHERE LOWER(admin_email)=LOWER(?)").get(email.trim().toLowerCase());
    if (existing) {
      saAuditExtended('system', 'signup_fallido', null, 'Email ya registrado', buildMeta());
      return res.status(400).json({ error: 'Ya existe una empresa registrada con ese email.' });
    }

    // Create everything
    const trialDays = 14;
    const vencimiento = new Date(Date.now() + trialDays * 86400000).toISOString().substr(0, 10);
    createEmpresa({ codigo: finalCodigo, nombre: empresa_nombre, rubro: rubro || 'general', plan_id: 'plan_trial', admin_email: email, vencimiento, usuarios_max: 5, sucursales_max: 1 });
    const empDB = getEmpresaDB(finalCodigo);
    empDB.setConfig({ rubro: rubro || 'general', nombre: empresa_nombre, modulos_habilitados: JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','reportes']) });
    const hash = await bcrypt.hash(password, 10);
    const adminId = 'u' + uid();
    const usuario = email.split('@')[0].replace(/[^a-z0-9_]/g, '_').substring(0, 20);
    empDB.insert('usuarios', { id: adminId, nombre: 'Admin', usuario, email: email.trim().toLowerCase(), password: hash, rol: 'admin', roles: JSON.stringify(['admin']), activo: true, email_verificado: 0, creado: new Date().toISOString(), password_changed_at: new Date().toISOString() });
    empDB.insert('empleados', { id: uid(), nombre: 'Admin', apellido: null, email: email.trim().toLowerCase(), fecha_ingreso: vencimiento, activo: 1, usuario_id: adminId, creado: new Date().toISOString() });
    empDB.insert('sucursales', { id: uid(), nombre: empresa_nombre, dir: '', activo: true, creado: new Date().toISOString() });

    // Verification token
    const verToken = crypto.randomBytes(20).toString('hex');
    const verTokenHash = crypto.createHash('sha256').update(verToken).digest('hex');
    empDB.insert('email_tokens', { id: 'vet_' + Date.now(), usuario_id: adminId, email: email.trim().toLowerCase(), token_hash: verTokenHash, expires: new Date(Date.now() + 24*3600000).toISOString(), usado: 0, creado: new Date().toISOString() });

    saAuditExtended('system', 'signup_exitoso', finalCodigo, 'Empresa: ' + empresa_nombre, buildMeta());
    console.log('[Signup] Nueva (pend. verif):', finalCodigo, email);

    // Send verification email INLINE
    try {
      const { getGlobalConfig } = require('../db_master');
      const { decryptValue } = require('../lib/crypto-utils');
      const h = getGlobalConfig('smtp_host'), p = parseInt(getGlobalConfig('smtp_port'))||465;
      const u = getGlobalConfig('smtp_user'), ep = getGlobalConfig('smtp_pass');
      const pass = ep ? decryptValue(ep) : '';
      const from = getGlobalConfig('smtp_from') || u || '';
      const fromName = getGlobalConfig('smtp_from_name') || 'FlexCRM';
      const appUrl = process.env.APP_URL || 'https://app.flexcrm.com.ar';
      if (h && u && pass && from) {
        const { sendEmail } = require('../lib/send-email');
        const { verificationEmail } = require('../lib/email-templates');
        await sendEmail(h, p, u, pass, '"' + fromName + '" <' + from + '>', email, 'Verifica tu email — FlexCRM', verificationEmail(empresa_nombre, appUrl + '/api/auth/verify-email/' + verToken));
        console.log('[Signup] Verification email to:', email);
      } else {
        console.error('[Signup] SMTP not configured for:', email);
        saAuditExtended('system', 'smtp_error', finalCodigo, 'SMTP global no configurado', buildMeta({ smtp: false }));
      }
    } catch(e) {
      console.error('[Signup] Email error:', e.message);
      try { saAuditExtended('system', 'smtp_error', finalCodigo, e.message, buildMeta({ smtp: false })); } catch {}
    }

    res.json({ ok: true, mensaje: 'Cuenta creada. Revisa tu email para verificarla y empezar.' });
  } catch(e) {
    console.error('[Signup] 500:', e.message);
    try { const { saAuditExtended } = require('../db_master'); saAuditExtended('system', 'signup_error_500', null, e.message, { ip: clientIP, userAgent: clientUA, email }); } catch {}
    res.status(500).json({ error: 'Error al crear la cuenta.' });
  }
});

// ── Verify email ──
router.get('/verify-email/:token', async (req, res) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const { getEmpresaDB } = require('../db_sqlite');
    const { getEmpresas, saAuditExtended } = require('../db_master');
    const empresas = getEmpresas();
    let found = null, foundCodigo = null;
    for (const emp of empresas) {
      if (!emp.activo) continue;
      try {
        const db = getEmpresaDB(emp.codigo);
        const row = db.raw.prepare("SELECT * FROM email_tokens WHERE token_hash=? AND usado=0").get(tokenHash);
        if (row) { found = row; foundCodigo = emp.codigo; break; }
      } catch {}
    }
    if (!found) {
      try { saAuditExtended('system', 'verificacion_fallida', null, 'Token invalido', { ip: req.ip || '' }); } catch {}
      return res.redirect('/app/login?verified=invalid');
    }
    if (new Date(found.expires) < new Date()) {
      try { saAuditExtended('system', 'verificacion_expirada', null, 'Token expirado', { email: found.email }); } catch {}
      return res.redirect('/app/login?verified=expired');
    }
    const empDB = getEmpresaDB(foundCodigo);
    empDB.raw.prepare("UPDATE usuarios SET email_verificado=1 WHERE id=?").run(found.usuario_id);
    empDB.raw.prepare("UPDATE email_tokens SET usado=1 WHERE id=?").run(found.id);
    try { saAuditExtended('system', 'email_verificado', foundCodigo, 'Email: ' + found.email, { email: found.email }); } catch {}

    const user = empDB.findOne('usuarios', found.usuario_id);
    if (user) {
      const token = jwt.sign({ id: user.id, rol: user.rol, empresa: foundCodigo, nombre: user.nombre }, getSecret(), { expiresIn: '24h' });
      res.redirect('/app/login?verified=ok&token=' + encodeURIComponent(token));
    } else {
      res.redirect('/app/login?verified=ok');
    }
  } catch(e) {
    console.error('[VerifyEmail] Error:', e.message);
    res.redirect('/app/login?verified=error');
  }
});

// ── Resend verification ──
router.post('/verify-email/resend', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  try {
    const { getEmpresaDB } = require('../db_sqlite');
    const { getEmpresas } = require('../db_master');
    const empresas = getEmpresas();
    let found = null, foundCodigo = null;
    for (const emp of empresas) {
      try {
        const db = getEmpresaDB(emp.codigo);
        const user = db.where('usuarios', u => u.email === email.trim().toLowerCase() && u.email_verificado === 0 && u.activo)[0];
        if (user) { found = user; foundCodigo = emp.codigo; break; }
      } catch {}
    }
    if (!found) return res.json({ ok: true, mensaje: 'Si la cuenta existe, recibiras un nuevo email.' });

    const verToken = crypto.randomBytes(20).toString('hex');
    const empDB = getEmpresaDB(foundCodigo);
    empDB.raw.prepare("UPDATE email_tokens SET usado=1 WHERE usuario_id=?").run(found.id);
    empDB.insert('email_tokens', { id: 'vet_'+Date.now(), usuario_id: found.id, email: email, token_hash: crypto.createHash('sha256').update(verToken).digest('hex'), expires: new Date(Date.now()+24*3600000).toISOString(), usado: 0, creado: new Date().toISOString() });

    try { const { saAuditExtended } = require('../db_master'); saAuditExtended('system', 'verificacion_reenvio', foundCodigo, email); } catch {}

    const { getGlobalConfig } = require('../db_master');
    if (getGlobalConfig('smtp_host')) {
      const { decryptValue } = require('../lib/crypto-utils');
      const h = getGlobalConfig('smtp_host'), p = parseInt(getGlobalConfig('smtp_port'))||465;
      const u = getGlobalConfig('smtp_user'), pass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : '';
      const from = getGlobalConfig('smtp_from')||u||''; const fromName = getGlobalConfig('smtp_from_name')||'FlexCRM';
      const appUrl = process.env.APP_URL || 'https://app.flexcrm.com.ar';
      const { sendEmail } = require('../lib/send-email');
      const { verificationEmail } = require('../lib/email-templates');
      await sendEmail(h, p, u, pass, '"'+fromName+'" <'+from+'>', email, 'Verifica tu email — FlexCRM', verificationEmail('FlexCRM', appUrl+'/api/auth/verify-email/'+verToken));
    }
    res.json({ ok: true, mensaje: 'Si la cuenta existe, recibiras un nuevo email.' });
  } catch(e) { res.json({ ok: true, mensaje: 'Si la cuenta existe, recibiras un nuevo email.' }); }
});

}
module.exports = { setupSignupRoutes };
