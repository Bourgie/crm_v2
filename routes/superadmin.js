require('dotenv').config();
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { master, getEmpresas, getEmpresa, createEmpresa, updateEmpresa,
        getPlanes, getPlan, getModulos, saAudit,
        getProspectos, getProspecto, getProspectoSeguimiento, getLandingLeads, getLandingStats, getDbStats,
        getGlobalConfig, setGlobalConfig, getAllGlobalConfig,
        getRubroAtributos, getAllRubrosAtributos, createRubroAtributo, updateRubroAtributo,
        getMantenimientoItems, createMantenimientoItem, updateMantenimientoItem, deleteMantenimientoItem, getVencimientosProximos,
        getAppsDisponibles, getAppDisponible, upsertAppDisponible,
        getAppsInstaladas, getAppInstalada, installApp, uninstallApp, updateAppStatus, updateAppConfig,
        logAppEvent, getAppStats,
        getOAuthProviders, getOAuthProvider,
        getEmpresaIntegraciones, getEmpresaIntegracionesHabilitadas,
        setEmpresaIntegracion, setEmpresaIntegracionesBatch,
        syncEmpresaIntegracionesDesdePlan,
        createSaasPago, getSaasPago, getSaasPagosPorEmpresa, getSaasPagos, getSaasWebhookLogs,
        getBillingConfig, setBillingConfig } = require('../db_master');
const { getEmpresaDB } = require('../db_sqlite');
const { encryptValue, decryptValue } = require('../lib/crypto-utils');
const { validate, superadminLoginSchema } = require('../middleware/validate');
const { purgeEmpresa } = require('../lib/purgeEmpresa');

const SA_SECRET = process.env.SA_SECRET || (() => { throw new Error('SA_SECRET no configurado. Revisá el archivo .env'); })();

function setAuthCookie(res, token) {
  res.cookie('sa_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  });
}

// ── Superadmin rate limiters ──
const superadminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos de login superadmin. Esperá 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const superadminForgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Demasiados intentos. Esperá 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Superadmin auth middleware ──
function superAuth(req, res, next) {
  const token = req.cookies?.sa_token || (req.headers.authorization||'').replace('Bearer ','');
  if(!token) return res.status(401).json({error:'No autenticado'});
  try {
    const p = jwt.verify(token, SA_SECRET);
    if(p.role !== 'superadmin') return res.status(403).json({error:'Sin permisos'});
    // Sesión revocable: valida que el admin siga activo y que el token no sea previo a un cambio de password
    const sa = master.prepare("SELECT activo, token_version FROM superadmin WHERE id=?").get(p.id);
    if (!sa || !sa.activo) return res.status(401).json({error:'Sesión inválida'});
    if ((p.token_version || 0) !== (sa.token_version || 0)) return res.status(401).json({error:'Sesión expirada. Volvé a iniciar sesión.'});
    req.sadmin = p;
    next();
  } catch(e) { res.status(401).json({error:'Token inválido o expirado'}); }
}

function saTokenVersion(saId) {
  const row = master.prepare("SELECT token_version FROM superadmin WHERE id=?").get(saId);
  return row ? (row.token_version || 0) : 0;
}

// ── Lockout persistente por usuario para login superadmin ──
const SA_MAX_ATTEMPTS = 5;
const SA_LOCK_MINUTES = 15;

function saCheckLocked(key) {
  try {
    const row = master.prepare("SELECT locked_until FROM sa_login_attempts WHERE key=?").get(key);
    if (!row || !row.locked_until) return false;
    if (new Date(row.locked_until) > new Date()) return true;
    master.prepare("DELETE FROM sa_login_attempts WHERE key=?").run(key);
  } catch(e) {}
  return false;
}

function saRecordFailed(key) {
  try {
    const now = new Date();
    const row = master.prepare("SELECT count FROM sa_login_attempts WHERE key=?").get(key);
    const count = row ? row.count + 1 : 1;
    const lockedUntil = count >= SA_MAX_ATTEMPTS ? new Date(now.getTime() + SA_LOCK_MINUTES * 60000).toISOString() : null;
    if (row) {
      master.prepare("UPDATE sa_login_attempts SET count=?, last_attempt=?, locked_until=? WHERE key=?")
        .run(count, now.toISOString(), lockedUntil, key);
    } else {
      master.prepare("INSERT INTO sa_login_attempts(key,count,last_attempt,locked_until) VALUES(?,?,?,?)")
        .run(key, count, now.toISOString(), lockedUntil);
    }
    return SA_MAX_ATTEMPTS - count;
  } catch(e) { return 0; }
}

function saResetAttempts(key) {
  try { master.prepare("DELETE FROM sa_login_attempts WHERE key=?").run(key); } catch(e) {}
}

// ══════════════════════════════════════
// AUTH
// ══════════════════════════════════════
router.post('/login', superadminLoginLimiter, validate(superadminLoginSchema), async (req, res) => {
  const { usuario, password } = req.body;
  const lockKey = String(usuario).toLowerCase().trim();
  if (saCheckLocked(lockKey)) {
    saAudit('lockout', 'login_bloqueado', null, 'Usuario bloqueado por intentos fallidos: ' + lockKey);
    return res.status(429).json({ error: `Demasiados intentos. Esperá ${SA_LOCK_MINUTES} minutos antes de intentar de nuevo.` });
  }
  const sa = master.prepare("SELECT * FROM superadmin WHERE usuario=? AND activo=1").get(usuario);
  if(!sa) {
    await bcrypt.compare(password, '$2a$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    saRecordFailed(lockKey);
    saAudit('lockout', 'login_fallido', null, 'Usuario inexistente: ' + lockKey);
    return res.status(401).json({error:'Credenciales incorrectas'});
  }
  if(!await bcrypt.compare(password, sa.password)) {
    saRecordFailed(lockKey);
    saAudit(sa.id, 'login_fallido', null, 'Contraseña incorrecta para: ' + lockKey);
    await new Promise(r => setTimeout(r, 500));
    return res.status(401).json({error:'Credenciales incorrectas'});
  }
  saResetAttempts(lockKey);

  let saData = {};
  try { saData = JSON.parse(sa.data || '{}'); } catch(e) {}

  // IP restriction check
  if (saData.sa_ip_restriccion && Array.isArray(saData.sa_ips) && saData.sa_ips.length > 0) {
    const clientIP = (req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection?.remoteAddress || '').replace(/^::ffff:/, '');
    const { ipInList } = require('../lib/ip-utils');
    if (!ipInList(clientIP, saData.sa_ips)) {
      saAudit(sa.id, 'login_ip_denegada', null, 'IP no autorizada: ' + clientIP);
      return res.status(403).json({ error: 'Acceso no permitido desde esta IP.' });
    }
  }

  if (sa.must_change_password) {
    const tempToken = jwt.sign(
      { id: sa.id, purpose: 'change_password', role: 'superadmin' },
      SA_SECRET,
      { expiresIn: '15m' }
    );
    return res.json({ require_password_change: true, temp_token: tempToken, nombre: sa.nombre });
  }

  // Device trust — skip 2FA if trusted device cookie is present
  const deviceCookie = req.cookies && req.cookies['sa_device'];
  const trustedDevices = saData.sa_devices || [];
  let trustedMatch = null;
  if (deviceCookie && saData.sa_2fa_saltar_dispositivo !== false) {
    const hash = crypto.createHash('sha256').update(deviceCookie).digest('hex');
    trustedMatch = trustedDevices.find(d => d.hash === hash);
    if (trustedMatch) {
      trustedMatch.ultimo_uso = new Date().toISOString();
      master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(saData), sa.id);
    }
  }

  // 2FA check
  if (saData.twofa_enabled && saData.twofa_secret) {
    if (trustedMatch) {
      // Trusted device — skip 2FA
      const token = jwt.sign({id:sa.id, usuario:sa.usuario, nombre:sa.nombre, role:'superadmin', token_version: saTokenVersion(sa.id)}, SA_SECRET, {expiresIn:'8h'});
      saAudit(sa.id, 'login_dispositivo_confiable', null, 'Login superadmin con dispositivo confiable');
      setAuthCookie(res, token);
      return res.json({nombre:sa.nombre, dispositivo_confiable: true});
    }
    const tempToken = jwt.sign(
      { id: sa.id, purpose: '2fa', role: 'superadmin' },
      SA_SECRET,
      { expiresIn: '5m' }
    );
    return res.json({ require_2fa: true, temp_token: tempToken, nombre: sa.nombre });
  }

  // 2FA mandatory — force setup
  if (saData.sa_2fa_obligatorio !== false) {
    const tempToken = jwt.sign(
      { id: sa.id, purpose: '2fa_setup', role: 'superadmin' },
      SA_SECRET,
      { expiresIn: '15m' }
    );
    return res.json({ require_2fa_setup: true, temp_token: tempToken, nombre: sa.nombre });
  }

  const token = jwt.sign({id:sa.id, usuario:sa.usuario, nombre:sa.nombre, role:'superadmin', token_version: saTokenVersion(sa.id)}, SA_SECRET, {expiresIn:'8h'});
  saAudit(sa.id, 'login', null, 'Login superadmin');
  setAuthCookie(res, token);
  res.json({nombre:sa.nombre});
});

router.put('/password', superAuth, async (req, res) => {
  const { password_actual, password_nuevo } = req.body;
  const pwErr = require('../lib/password-policy').validatePassword(password_nuevo);
  if(pwErr) return res.status(400).json({error:pwErr});
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(req.sadmin.id);
  if(!sa || !await bcrypt.compare(password_actual, sa.password))
    return res.status(401).json({error:'Contraseña actual incorrecta'});

  // Check password history from data field
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  const history = data.password_history || [];
  for (const oldHash of history) {
    if (await bcrypt.compare(password_nuevo, oldHash)) {
      return res.status(400).json({error:'No podés usar una contraseña reciente. Elegí una que no hayas usado antes.'});
    }
  }

  // Save old password to history (keep last 5)
  history.push(sa.password);
  if (history.length > 5) history.shift();
  data.password_history = history;

  master.prepare("UPDATE superadmin SET password=?, data=?, must_change_password=0, token_version = token_version + 1 WHERE id=?")
    .run(bcrypt.hashSync(password_nuevo,10), JSON.stringify(data), req.sadmin.id);
  saAudit(req.sadmin.id, 'cambio_password', null, 'Cambio de contraseña superadmin (todas las sesiones fueron invalidadas)');
  res.json({ ok:true, mensaje: 'Contraseña actualizada. Todas las demás sesiones fueron cerradas.' });
});

// ── Superadmin 2FA ──
const { totp } = require('../lib/totp');

// POST /api/superadmin/2fa/status
router.get('/2fa/status', superAuth, (req, res) => {
  const sa = master.prepare("SELECT data FROM superadmin WHERE id=?").get(req.sadmin.id);
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  res.json({ enabled: !!data.twofa_enabled });
});

// POST /api/superadmin/2fa/setup
router.post('/2fa/setup', superAuth, (req, res) => {
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(req.sadmin.id);
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  if (data.twofa_enabled) return res.status(400).json({ error: 'Ya tenés 2FA activo. Deshabilitalo primero.' });

  const label = sa.email || sa.usuario || 'superadmin';
  const secret = totp.generateSecret();
  const otpauth = totp.toURI({ label, issuer: 'FlexCRM SuperAdmin', secret });
  data.twofa_secret = secret;
  data.twofa_enabled = false;
  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), req.sadmin.id);
  res.json({ secret, otpauth, email: label });
});

// POST /api/superadmin/2fa/confirm
router.post('/2fa/confirm', superAuth, validate(require('../middleware/validate').twofaConfirmSchema), (req, res) => {
  const { code } = req.body;
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(req.sadmin.id);
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  if (!data.twofa_secret) return res.status(400).json({ error: 'Ejecutá /2fa/setup primero' });
  if (data.twofa_enabled) return res.status(400).json({ error: '2FA ya está activo' });

  const isValid = totp.verify({ token: code, secret: data.twofa_secret }).valid;
  if (!isValid) return res.status(400).json({ error: 'Código inválido' });

  // Generate backup codes
  const crypto = require('crypto');
  const backupCodes = [];
  for (let i = 0; i < 10; i++) {
    const bc = crypto.randomBytes(4).toString('hex').toUpperCase();
    backupCodes.push(bc);
  }
  data.twofa_enabled = true;
  data.twofa_backup = backupCodes.map(c => crypto.createHmac('sha256', SA_SECRET).update(c).digest('hex'));
  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), req.sadmin.id);
  saAudit(req.sadmin.id, '2fa_activado', null, '2FA activado');
  res.json({ ok: true, backup_codes: backupCodes, mensaje: '2FA activado. Guardá tus códigos de respaldo.' });
});

// POST /api/superadmin/2fa/disable
router.post('/2fa/disable', superAuth, (req, res) => {
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(req.sadmin.id);
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  if (data.sa_2fa_obligatorio !== false) {
    // Check if there are other superadmins — don't lock out the last one
    const count = master.prepare("SELECT COUNT(*) as n FROM superadmin WHERE activo=1").get().n || 0;
    if (count <= 1) return res.status(400).json({ error: 'No podés deshabilitar 2FA siendo el único superadmin activo.' });
  }
  delete data.twofa_secret;
  delete data.twofa_enabled;
  delete data.twofa_backup;
  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), req.sadmin.id);
  saAudit(req.sadmin.id, '2fa_desactivado', null, '2FA desactivado');
  res.json({ ok: true, mensaje: '2FA deshabilitado' });
});

// POST /api/superadmin/2fa/setup-forced — setup sin cookie de sesión (temp_token)
router.post('/2fa/setup-forced', (req, res) => {
  const { temp_token } = req.body;
  if (!temp_token) return res.status(400).json({ error: 'Token temporal requerido' });
  let payload;
  try { payload = jwt.verify(temp_token, SA_SECRET); }
  catch (e) { return res.status(401).json({ error: 'Token temporal inválido o expirado' }); }
  if (payload.purpose !== '2fa_setup' || payload.role !== 'superadmin') return res.status(401).json({ error: 'Token inválido' });

  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(payload.id);
  if (!sa) return res.status(401).json({ error: 'Superadmin no encontrado' });
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  if (data.twofa_enabled) return res.status(400).json({ error: '2FA ya está activo' });

  const label = sa.email || sa.usuario || 'superadmin';
  const secret = totp.generateSecret();
  const otpauth = totp.toURI({ label, issuer: 'FlexCRM SuperAdmin', secret });
  data.twofa_secret = secret;
  data.twofa_enabled = false;
  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), sa.id);
  res.json({ secret, otpauth, email: label });
});

// POST /api/superadmin/2fa/confirm-forced — confirma 2FA + completa login sin sesión
router.post('/2fa/confirm-forced', validate(require('../middleware/validate').twofaConfirmSchema), (req, res) => {
  const { temp_token, code, confiar_dispositivo } = req.body;
  if (!temp_token) return res.status(400).json({ error: 'Token temporal requerido' });
  let payload;
  try { payload = jwt.verify(temp_token, SA_SECRET); }
  catch (e) { return res.status(401).json({ error: 'Token temporal inválido o expirado' }); }
  if (payload.purpose !== '2fa_setup' || payload.role !== 'superadmin') return res.status(401).json({ error: 'Token inválido' });

  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(payload.id);
  if (!sa) return res.status(401).json({ error: 'Superadmin no encontrado' });
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  if (!data.twofa_secret) return res.status(400).json({ error: 'Ejecutá /2fa/setup-forced primero' });
  if (data.twofa_enabled) return res.status(400).json({ error: '2FA ya está activo' });

  const isValid = totp.verify({ token: code, secret: data.twofa_secret }).valid;
  if (!isValid) return res.status(400).json({ error: 'Código inválido' });

  const crypto = require('crypto');
  const backupCodes = [];
  for (let i = 0; i < 10; i++) {
    const bc = crypto.randomBytes(4).toString('hex').toUpperCase();
    backupCodes.push(bc);
  }
  data.twofa_enabled = true;
  data.twofa_backup = backupCodes.map(c => crypto.createHmac('sha256', SA_SECRET).update(c).digest('hex'));

  // Device trust
  if (confiar_dispositivo !== false) {
    const devToken = crypto.randomBytes(32).toString('hex');
    const devHash = crypto.createHash('sha256').update(devToken).digest('hex');
    const clientUA = (req.headers['user-agent'] || '').substring(0, 200);
    const clientIP = (req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '').replace(/^::ffff:/, '');
    if (!Array.isArray(data.sa_devices)) data.sa_devices = [];
    data.sa_devices.push({ hash: devHash, ip: clientIP, ua: clientUA, creado: new Date().toISOString(), ultimo_uso: new Date().toISOString() });
    if (data.sa_devices.length > 10) data.sa_devices = data.sa_devices.slice(-10);
    res.cookie('sa_device', devToken, {
      httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production',
      path: '/api/superadmin', maxAge: 90 * 24 * 60 * 60 * 1000,
    });
  }

  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), sa.id);
  saAudit(sa.id, '2fa_activado', null, '2FA activado (setup forzado)');

  const token = jwt.sign({id:sa.id, usuario:sa.usuario, nombre:sa.nombre, role:'superadmin', token_version: saTokenVersion(sa.id)}, SA_SECRET, {expiresIn:'8h'});
  setAuthCookie(res, token);
  res.json({ nombre:sa.nombre, backup_codes: backupCodes, mensaje: '2FA activado. Guardá tus códigos de respaldo.' });
});

// POST /api/superadmin/2fa/verify-login
router.post('/2fa/verify-login', validate(require('../middleware/validate').superadmin2faVerifySchema), (req, res) => {
  const { temp_token, code, confiar_dispositivo } = req.body;
  let payload;
  try {
    payload = jwt.verify(temp_token, SA_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Token temporal inválido o expirado' });
  }
  if (payload.purpose !== '2fa' || payload.role !== 'superadmin') {
    return res.status(401).json({ error: 'Token inválido' });
  }
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(payload.id);
  if (!sa) return res.status(401).json({ error: 'Superadmin no encontrado' });
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  if (!data.twofa_enabled || !data.twofa_secret) return res.status(400).json({ error: '2FA no está activo' });

  const crypto = require('crypto');
  let valid = totp.verify({ token: code, secret: data.twofa_secret }).valid;
  if (!valid) {
    // Códigos nuevos: HMAC con SA_SECRET. Compat con códigos viejos (sha256 simple)
    const hmacHash = crypto.createHmac('sha256', SA_SECRET).update(code).digest('hex');
    let bcIndex = (data.twofa_backup || []).indexOf(hmacHash);
    if (bcIndex === -1) {
      const legacyHash = crypto.createHash('sha256').update(code).digest('hex');
      bcIndex = (data.twofa_backup || []).indexOf(legacyHash);
    }
    if (bcIndex === -1) return res.status(400).json({ error: 'Código inválido o ya usado' });
    data.twofa_backup.splice(bcIndex, 1);
  }

  // Device trust — register/refresh trusted device
  if (confiar_dispositivo !== false) {
    const devToken = crypto.randomBytes(32).toString('hex');
    const devHash = crypto.createHash('sha256').update(devToken).digest('hex');
    const clientUA = (req.headers['user-agent'] || '').substring(0, 200);
    const clientIP = (req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '').replace(/^::ffff:/, '');
    if (!Array.isArray(data.sa_devices)) data.sa_devices = [];
    // Replace existing device with same hash if any
    const existingIdx = data.sa_devices.findIndex(d => d.hash === devHash);
    if (existingIdx >= 0) {
      data.sa_devices[existingIdx].ultimo_uso = new Date().toISOString();
    } else {
      data.sa_devices.push({ hash: devHash, ip: clientIP, ua: clientUA, creado: new Date().toISOString(), ultimo_uso: new Date().toISOString() });
      if (data.sa_devices.length > 10) data.sa_devices = data.sa_devices.slice(-10);
    }
    res.cookie('sa_device', devToken, {
      httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production',
      path: '/api/superadmin', maxAge: 90 * 24 * 60 * 60 * 1000,
    });
  }

  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), sa.id);

  const token = jwt.sign({id:sa.id, usuario:sa.usuario, nombre:sa.nombre, role:'superadmin', token_version: saTokenVersion(sa.id)}, SA_SECRET, {expiresIn:'8h'});
  saAudit(sa.id, 'login_2fa', null, 'Login superadmin con 2FA');
  setAuthCookie(res, token);
  res.json({nombre:sa.nombre});
});

// GET /api/superadmin/2fa/devices — list trusted devices
router.get('/2fa/devices', superAuth, (req, res) => {
  const sa = master.prepare("SELECT data FROM superadmin WHERE id=?").get(req.sadmin.id);
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  const devices = (data.sa_devices || []).map((d, i) => ({ index: i, ip: d.ip, ua: d.ua, creado: d.creado, ultimo_uso: d.ultimo_uso }));
  res.json({ devices });
});

// POST /api/superadmin/2fa/devices/revoke — revoke trusted device
router.post('/2fa/devices/revoke', superAuth, (req, res) => {
  const { index } = req.body;
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(req.sadmin.id);
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  if (!Array.isArray(data.sa_devices) || index === undefined || index < 0 || index >= data.sa_devices.length) {
    return res.status(400).json({ error: 'Dispositivo inválido' });
  }
  data.sa_devices.splice(index, 1);
  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), sa.id);
  saAudit(req.sadmin.id, 'dispositivo_revocado', null, 'Dispositivo confiable revocado');
  res.json({ ok: true });
});

// POST /api/superadmin/2fa/devices/revocar-todos — revoke all trusted devices
router.post('/2fa/devices/revocar-todos', superAuth, (req, res) => {
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(req.sadmin.id);
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  data.sa_devices = [];
  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), sa.id);
  saAudit(req.sadmin.id, 'dispositivos_revocados', null, 'Todos los dispositivos confiables revocados');
  res.clearCookie('sa_device', { path: '/api/superadmin' });
  res.json({ ok: true });
});

router.get('/me', superAuth, (req, res) => {
  const sa = master.prepare("SELECT id, usuario, nombre, email FROM superadmin WHERE id=?").get(req.sadmin.id);
  res.json(sa || { nombre: req.sadmin.nombre });
});

router.post('/logout', (req, res) => {
  res.clearCookie('sa_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.json({ ok: true });
});

// ══════════════════════════════════════
// DASHBOARD HEALTH
// ══════════════════════════════════════
router.get('/dashboard', superAuth, (req, res) => {
  const empresas = getEmpresas();
  const planes = getPlanes();
  const hoy = new Date().toISOString().substr(0,10);
  const en7  = new Date(Date.now() +  7*86400000).toISOString().substr(0,10);
  const en30 = new Date(Date.now() + 30*86400000).toISOString().substr(0,10);

  const activas   = empresas.filter(e => e.activo).length;
  const vencidas  = empresas.filter(e => e.activo && e.vencimiento && e.vencimiento < hoy).length;
  const vencer7   = empresas.filter(e => e.activo && e.vencimiento && e.vencimiento >= hoy && e.vencimiento <= en7).length;
  const vencer30  = empresas.filter(e => e.activo && e.vencimiento && e.vencimiento >= hoy && e.vencimiento <= en30).length;

  // MRR: sum of active empresa plan prices
  let mrr = 0;
  const planesById = new Map(planes.map(p => [p.id, p]));
  for (const e of empresas) {
    if (!e.activo) continue;
    const plan = planesById.get(e.plan_id);
    if (plan && plan.precio) mrr += parseFloat(plan.precio) || 0;
  }

  // Solicitudes de plan pendientes
  let solicitudes_pendientes = 0;
  try {
    solicitudes_pendientes = master.prepare("SELECT COUNT(*) as n FROM solicitudes_plan WHERE estado='pendiente'").get().n;
  } catch(e) {}

  // Empresas nuevas este mes
  const mesActual = hoy.substr(0,7);
  const nuevasMes = master.prepare("SELECT COUNT(*) as n FROM empresas WHERE creado LIKE ?").get(mesActual+'%').n || 0;

  // Growth por mes (últimos 6 meses)
  const growth = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const mes = d.toISOString().substr(0,7);
    const n = master.prepare("SELECT COUNT(*) as n FROM empresas WHERE creado LIKE ?").get(mes+'%').n || 0;
    growth.push({ mes, n });
  }

  // Usage stats
  let totalUsuarios = 0, totalVentas = 0, totalVentasMonto = 0, totalClientes = 0;
  let ventasMes = 0, ventasMontoMes = 0;
  const mesActualKey = hoy.substr(0,7);
  for (const e of empresas) {
    if (!e.activo) continue;
    try {
      const db = getEmpresaDB(e.codigo);
      totalUsuarios += db.find('usuarios').filter(u => u.activo !== false).length;
      const ventas = db.all('ventas').filter(v => !v.anulada);
      totalVentas += ventas.length;
      totalVentasMonto += ventas.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
      totalClientes += db.find('clientes').filter(c => c.activo !== false).length;
      // Ventas del mes actual
      const ventasDelMes = ventas.filter(v => v.fecha && v.fecha.substr(0,7) === mesActualKey);
      ventasMes += ventasDelMes.length;
      ventasMontoMes += ventasDelMes.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
    } catch(err) {}
  }
  const ticketPromedio = totalVentas > 0 ? Math.round(totalVentasMonto / totalVentas) : 0;
  const ticketPromedioMes = ventasMes > 0 ? Math.round(ventasMontoMes / ventasMes) : 0;

  res.json({
    empresas_total: empresas.length, empresas_activas: activas,
    vencidas, vencer_7: vencer7, vencer_30: vencer30,
    prox_vencer: vencer7,
    mrr, nuevas_mes: nuevasMes,
    solicitudes_pendientes,
    total_usuarios: totalUsuarios, total_ventas: totalVentas,
    total_ventas_monto: totalVentasMonto, total_clientes: totalClientes,
    ventas_mes: ventasMes, ventas_monto_mes: ventasMontoMes,
    ticket_promedio: ticketPromedio, ticket_promedio_mes: ticketPromedioMes,
    vencimientos_prox: getVencimientosProximos(30),
    growth, timestamp: new Date().toISOString()
  });
});

// ══════════════════════════════════════
// EMPRESAS (TENANTS)
// ══════════════════════════════════════
router.get('/empresas', superAuth, (req, res) => {
  const planes = getPlanes();
  const empresas = getEmpresas().map(e => {
    const plan = planes.find(p=>p.id===e.plan_id) || planes.find(p=>p.codigo==='basic') || {};
    let usuarios=0, ventas=0, clientes=0, sucursales=0, email_verificado=null;
    try {
      const db = getEmpresaDB(e.codigo);
      usuarios = db.find('usuarios').filter(u=>u.activo!==false).length;
      ventas = db.all('ventas').filter(v=>!v.anulada).length;
      clientes = db.find('clientes').filter(c=>c.activo!==false).length;
      sucursales = db.find('sucursales').filter(s=>s.activo!==false).length;
      const adminUser = db.find('usuarios').find(u => u.email && u.rol === 'admin');
      email_verificado = adminUser ? adminUser.email_verificado : null;
    } catch(err) {}
    const hoy = new Date().toISOString().substr(0,10);
    const diasVenc = e.vencimiento ? Math.ceil((new Date(e.vencimiento)-new Date())/86400000) : null;
    return {...e, plan_nombre:plan.nombre||e.plan_id||'—', usuarios, ventas, clientes, sucursales, dias_vencimiento:diasVenc, email_verificado};
  });
  res.json(empresas);
});

router.get('/empresas/:codigo', superAuth, (req, res) => {
  const e = getEmpresa(req.params.codigo) || master.prepare("SELECT * FROM empresas WHERE codigo=?").get(req.params.codigo);
  if(!e) return res.status(404).json({error:'No encontrado'});
  try {
    const db = getEmpresaDB(e.codigo);
    const usuarios = db.find('usuarios').filter(u=>u.activo!==false);
    const adminUser = db.find('usuarios').find(u => u.email && u.rol === 'admin');
    const sucursales = db.find('sucursales').filter(s=>s.activo!==false);
    const ventas = db.all('ventas').length;
    const clientes = db.find('clientes').filter(c=>c.activo!==false).length;
    const cfg = db.getConfig();
    const modulos = cfg.modulos_habilitados ? (typeof cfg.modulos_habilitados === 'string' ? JSON.parse(cfg.modulos_habilitados) : cfg.modulos_habilitados) : [];

    // Integration Center info
    const habilitadas = getEmpresaIntegracionesHabilitadas(e.id);
    const allProviders = getOAuthProviders();
    const plan = e.plan_id ? getPlan(e.plan_id) : null;
    const planIntegraciones = plan ? plan.integraciones || [] : [];
    const integraciones = {
      habilitadas,
      estados: {},
      todos_providers: allProviders.map(p => ({
        provider: p.provider,
        nombre: p.nombre,
        icono: p.icono,
        habilitado: habilitadas.includes(p.provider),
        en_plan: planIntegraciones.includes(p.provider),
      })),
      plan_integraciones: planIntegraciones,
    };
    for (const provider of habilitadas) {
      try {
        const row = db.raw.prepare("SELECT * FROM company_integrations WHERE provider = ?").get(provider);
        if (row) {
          integraciones.estados[provider] = {
            status: row.status || 'disconnected',
            external_account_id: row.external_account_id,
            last_sync: row.last_sync,
            last_error: row.last_error,
            health_status: row.health_status || 'unknown',
            last_health_check: row.last_health_check,
            connected: row.status === 'connected',
          };
        }
      } catch {}
    }

    res.json({...e, email_verificado: adminUser ? adminUser.email_verificado : null, admin_email: e.admin_email, config: { rubro: cfg.rubro || '', modulos_habilitados: modulos }, usuarios, sucursales, ventas, clientes, integraciones});
  } catch(err) { res.json({...e, error: err.message}); }
});

router.post('/empresas', superAuth, async (req, res) => {
  const { codigo, nombre, rubro, plan_id, admin_email, admin_pass, admin_password, vencimiento, usuarios_max, sucursales_max } = req.body;
  const adminPass = admin_password || admin_pass;
  if(!codigo||!nombre) return res.status(400).json({error:'Código y nombre requeridos'});
  if(!/^[a-z0-9_]+$/.test(codigo)) return res.status(400).json({error:'Solo minúsculas, números y _'});
  if(getEmpresa(codigo)) return res.status(400).json({error:'Ese código ya existe'});
  if (admin_email) {
    const emailExiste = master.prepare("SELECT codigo FROM empresas WHERE LOWER(admin_email)=LOWER(?)").get(admin_email.trim().toLowerCase());
    if (emailExiste) return res.status(400).json({ error: 'Ya existe una empresa con ese email.' });
  }
  
  const plan = plan_id ? getPlan(plan_id) : getPlan('basic');
  const limites = plan ? plan.limites : {};
  const id = createEmpresa({
    codigo, nombre, rubro, plan_id: plan?plan.id:null, admin_email,
    vencimiento: vencimiento||null,
    usuarios_max: usuarios_max || (limites.usuarios_max||5),
    sucursales_max: sucursales_max || (limites.sucursales_max||1)
  });

  // Save config in empresa DB
  console.log('[SA] PASO 1 - iniciando DB para empresa:', codigo);
  try {
    const empDB = getEmpresaDB(codigo);
    console.log('[SA] PASO 2 - empDB obtenida OK');
    const modulos = plan ? plan.modulos : ['pos','caja','clientes','ventas','productos','gastos','reportes'];
    try { empDB.setConfig({rubro:rubro||'general', modulos_habilitados:JSON.stringify(modulos)}); } catch(ec) { console.error('[SA] setConfig error:', ec.message); }
    console.log('[SA] PASO 3 - config guardada');

    const { uid } = require('../db_sqlite');
    // Create admin user
    if(admin_email && adminPass) {
      try {
        const hash = bcrypt.hashSync(adminPass, 10);
        const adminId = uid();
        empDB.insert('usuarios', {id:adminId, nombre:'Admin', apellido:'', usuario:admin_email.split('@')[0],
          email:admin_email, password:hash, rol:'admin', activo:true, roles:JSON.stringify(['admin']),
          email_verificado: 0, creado:new Date().toISOString(), password_changed_at: new Date().toISOString()});
        console.log('[SA] PASO 4 - usuario admin creado:', admin_email);

        // Generate activation token and send email
        const crypto = require('crypto');
        const actToken = crypto.randomBytes(20).toString('hex');
        const actTokenHash = crypto.createHash('sha256').update(actToken).digest('hex');
        empDB.insert('email_tokens', {
          id: 'vet_' + Date.now(), usuario_id: adminId, email: admin_email,
          token_hash: actTokenHash, expires: new Date(Date.now() + 72*3600000).toISOString(), usado: 0, creado: new Date().toISOString()
        });
        try {
          const { getGlobalConfig } = require('../db_master');
          const { decryptValue } = require('../lib/crypto-utils');
          const smtpHost = getGlobalConfig('smtp_host');
          const smtpPort = parseInt(getGlobalConfig('smtp_port'))||465;
          const smtpUser = getGlobalConfig('smtp_user');
          const smtpPass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : '';
          const smtpFrom = getGlobalConfig('smtp_from') || smtpUser || '';
          const { getRemitente } = require('../lib/send-email');
          const fromName = getRemitente().fromName;
          if (smtpHost && smtpUser && smtpPass && smtpFrom) {
            const appUrl = process.env.APP_URL || 'https://app.flexcrm.com.ar';
            const activateLink = `${appUrl}/app/activar-cuenta?token=${actToken}&empresa=${codigo}`;
            const { activationEmail } = require('../lib/email-templates');
            const html = activationEmail(nombre, admin_email, activateLink);
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
              host: smtpHost, port: smtpPort, secure: smtpPort === 465,
              auth: { user: smtpUser, pass: smtpPass },
            });
            await transporter.sendMail({ from: getRemitente().formatted, to: admin_email, subject: 'Activá tu cuenta — FlexCRM', html });
            console.log('[SA] Email de activación enviado a:', admin_email);
          }
        } catch(ee) { console.error('[SA] Error enviando email activación:', ee.message); }
      } catch(eu) { console.error('[SA] Error usuario:', eu.message); }
    } else {
      console.log('[SA] PASO 4 - sin credenciales admin, se omite creación de usuario');
    }

    // Always create sucursal principal
    console.log('[SA] PASO 5 - verificando sucursales existentes...');
    try {
      const allSucs = empDB.find('sucursales', {});
      console.log('[SA] PASO 5b - sucursales totales en DB:', allSucs.length);
      const activeSucs = allSucs.filter(s => s.activo !== false && s.activo !== 0);
      console.log('[SA] PASO 5c - sucursales activas:', activeSucs.length);
      if(activeSucs.length === 0) {
        const sucId = uid();
        empDB.insert('sucursales', {
          id: sucId,
          nombre: nombre,
          dir: '',
          activo: true,
          creado: new Date().toISOString()
        });
        console.log('[SA] PASO 6 - SUCURSAL CREADA id:', sucId, 'empresa:', codigo);
      } else {
        console.log('[SA] PASO 6 - ya existían sucursales, no se crea nueva');
      }
    } catch(es) { console.error('[SA] Error creando sucursal:', es.message, es.stack); }
  } catch(err) { console.error('[SA] Error crítico init empresa DB:', err.message, err.stack); }

  saAudit(req.sadmin.id, 'crear_empresa', id, `Nueva empresa: ${nombre} (${codigo})`);
  // Send welcome notification
  try {
    master.prepare(
      "INSERT INTO notificaciones (id, empresa_codigo, tipo, titulo, mensaje, creado, data) VALUES (?,?,?,?,?,?,?)"
    ).run('notif_' + Date.now() + '_' + codigo, codigo, 'cuenta_activada',
      '🎉 ¡Bienvenido a FlexCRM!',
      'Tu empresa fue creada. Revisá tu email para activar la cuenta y configurar tu negocio.',
      new Date().toISOString(), '{}');
  } catch(e) { /* non-blocking */ }
  try { syncEmpresaIntegracionesDesdePlan(id, plan?.id); } catch(_) {}
  res.json({id, ok:true});
});

router.put('/empresas/:id', superAuth, (req, res) => {
  try {
    const e = master.prepare("SELECT * FROM empresas WHERE id=? OR codigo=?").get(req.params.id, req.params.id);
    if(!e) return res.status(404).json({error:'No encontrado'});
    const { nombre, rubro, plan_id, activo, vencimiento, usuarios_max, sucursales_max, modulos_extra, modulos_bloqueados } = req.body;
    const act = activo !== null && activo !== undefined ? (activo ? 1 : 0) : e.activo;
    master.prepare("UPDATE empresas SET nombre=?,rubro=?,plan_id=?,activo=?,vencimiento=?,usuarios_max=?,sucursales_max=?,modulos_extra=?,modulos_bloqueados=? WHERE id=?")
      .run(nombre||e.nombre, rubro||e.rubro, plan_id||e.plan_id, act,
        vencimiento||e.vencimiento, usuarios_max||e.usuarios_max, sucursales_max||e.sucursales_max,
        JSON.stringify(modulos_extra||[]), JSON.stringify(modulos_bloqueados||[]), e.id);
    saAudit(req.sadmin.id, 'editar_empresa', e.id, 'Edit: '+(nombre||e.nombre));
    // Sync integraciones when plan changes
    if (plan_id && plan_id !== e.plan_id) {
      try { syncEmpresaIntegracionesDesdePlan(e.id, plan_id); } catch(_) {}
    }
    res.json({ok:true});
  } catch(err) {
    console.error('[EditEmpresa] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Renovar / extender suscripción
router.post('/empresas/:id/renovar', superAuth, (req, res) => {
  const { meses, fecha_desde } = req.body;
  const e = master.prepare("SELECT * FROM empresas WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ error: 'No encontrada' });
  const base = fecha_desde || e.vencimiento || new Date().toISOString().substr(0,10);
  const nueva = new Date(base);
  nueva.setMonth(nueva.getMonth() + (parseInt(meses) || 1));
  const nuevaFecha = nueva.toISOString().substr(0,10);
  master.prepare("UPDATE empresas SET vencimiento=? WHERE id=?").run(nuevaFecha, req.params.id);
  saAudit(req.sadmin.id, 'renovar_suscripcion', req.params.id,
    `Renovación ${meses} mes(es) — nuevo venc: ${nuevaFecha}`);
  res.json({ ok: true, nuevo_vencimiento: nuevaFecha });
});

// Notas internas por empresa
router.get('/empresas/:id/notas', superAuth, (req, res) => {
  try {
    const rows = master.prepare("SELECT * FROM empresa_notas WHERE empresa_id=? ORDER BY fecha DESC").all(req.params.id);
    res.json(rows);
  } catch(e) { res.json([]); }
});

router.post('/empresas/:id/notas', superAuth, (req, res) => {
  const { texto } = req.body;
  if (!texto) return res.status(400).json({ error: 'Texto requerido' });
  try {
    const id = 'nota_' + Date.now();
    master.prepare("INSERT INTO empresa_notas(id,empresa_id,texto,autor,fecha) VALUES(?,?,?,?,?)")
      .run(id, req.params.id, texto, req.sadmin.nombre || req.sadmin.usuario, new Date().toISOString());
    res.json({ ok: true, id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/empresas/:empId/notas/:notaId', superAuth, (req, res) => {
  master.prepare("DELETE FROM empresa_notas WHERE id=? AND empresa_id=?")
    .run(req.params.notaId, req.params.empId);
  res.json({ ok: true });
});

// Override de módulos por empresa
router.post('/empresas/:id/modulos', superAuth, (req, res) => {
  const { modulos_extra, modulos_bloqueados } = req.body;
  const e = master.prepare("SELECT * FROM empresas WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ error: 'No encontrada' });
  master.prepare("UPDATE empresas SET modulos_extra=?, modulos_bloqueados=? WHERE id=?")
    .run(JSON.stringify(modulos_extra || []), JSON.stringify(modulos_bloqueados || []), req.params.id);
  // Apply to empresa DB config
  try {
    const empDB = getEmpresaDB(e.codigo);
    const plan = getPlanes().find(p => p.id === e.plan_id);
    const baseMods = plan ? (plan.modulos || []) : [];
    const mods_extra = modulos_extra || [];
    const mods_block = modulos_bloqueados || [];
    const final = [...new Set([...baseMods, ...mods_extra])].filter(m => !mods_block.includes(m));
    empDB.setConfig({ modulos_habilitados: JSON.stringify(final) });
  } catch(err) {}
  saAudit(req.sadmin.id, 'modulos_override', req.params.id,
    `Extra: [${(modulos_extra||[]).join(',')}] Bloq: [${(modulos_bloqueados||[]).join(',')}]`);
  res.json({ ok: true });
});


router.delete('/empresas/:id', superAuth, async (req, res) => {
  try {
    const e = master.prepare("SELECT * FROM empresas WHERE id=? OR codigo=?").get(req.params.id, req.params.id);
    if(!e) return res.status(404).json({error:'No encontrado'});

    const path = require('path');
    const empresaId = e.id, empresaCodigo = e.codigo, empresaNombre = e.nombre, adminEmail = e.admin_email;
    const { hacer_backup, enviar_email } = req.query;
    let backupFilename = null;

    // Generate backup if requested — fail-safe: si falla, NO se elimina la empresa
    if (hacer_backup === 'true' || enviar_email === 'true') {
      try {
        const { makeEmpresaBackup } = require('./backup');
        const result = makeEmpresaBackup(empresaCodigo);
        backupFilename = result.name;
      } catch(be) {
        console.error('[DeleteEmpresa] Backup error:', be.message);
        return res.status(500).json({ error: 'No se pudo generar el backup. La empresa NO fue eliminada. Detalle: ' + be.message });
      }
    }

    // Borrar archivos de la empresa ANTES de borrar la fila master (verificación de borrado a cero)
    const { remaining } = await purgeEmpresa(empresaId, empresaCodigo);
    if (remaining.length > 0) {
      console.error('[DeleteEmpresa] No se pudieron eliminar archivos (' + empresaCodigo + '):', remaining.join(', '));
      return res.status(500).json({ error: 'No se pudieron eliminar todos los archivos de la empresa (' + remaining.join(', ') + '). La empresa NO fue eliminada. Reintentá en unos segundos.' });
    }

    // Hard delete from master DB
    master.prepare("DELETE FROM empresas WHERE id=?").run(empresaId);

    // Send email if requested (posterior a la eliminación, best-effort)
    if (enviar_email === 'true' && adminEmail && backupFilename) {
      setImmediate(async () => {
        try {
          const { getGlobalConfig } = require('../db_master');
          const h = getGlobalConfig('smtp_host');
          if (h) {
            const { decryptValue } = require('../lib/crypto-utils');
            const u = getGlobalConfig('smtp_user');
            const pass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : '';
            const from = getGlobalConfig('smtp_from')||u||'';
            const { sendEmail, getRemitente } = require('../lib/send-email');
            const { fromName } = getRemitente();
            const html = `<div style="font-family:sans-serif;padding:20px"><h2>Empresa eliminada: ${empresaNombre}</h2>
<p><strong>Codigo:</strong> ${empresaCodigo}</p><p>Adjunto el backup final de todos los datos.</p></div>`;
            const backupPath = path.join(__dirname, '../data/backups', backupFilename);
            const fs = require('fs');
            if (fs.existsSync(backupPath)) {
              await sendEmail(h, parseInt(getGlobalConfig('smtp_port'))||465, u, pass, '"'+fromName+'" <'+from+'>', adminEmail, 'Backup final: '+empresaNombre+' — FlexCRM', html, [{ filename: backupFilename, path: backupPath }]);
            }
          }
        } catch(se) { console.error('[DeleteEmpresa] Email error:', se.message); }
      });
    }

    saAudit(req.sadmin.id, 'eliminar_empresa', empresaId, 'Eliminada: ' + empresaNombre + (backupFilename ? ' — Backup: '+backupFilename : ''));
    res.json({ ok: true, backup: backupFilename, mensaje: 'Empresa eliminada.' });
  } catch(err) {
    console.error('[DeleteEmpresa] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════
// INTEGRACIONES (Integration Center)
// ══════════════════════════════════════

// Obtener todos los OAuth providers configurados
router.get('/integraciones/providers', superAuth, (req, res) => {
  try {
    const providers = getOAuthProviders().map(p => ({
      ...p,
      env_configured: (() => {
        const keys = p.env_keys || [];
        return keys.every(k => process.env[k]);
      })(),
    }));
    res.json(providers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Obtener integraciones de una empresa (habilitadas + estado real)
router.get('/empresas/:codigo/integraciones', superAuth, (req, res) => {
  try {
    const e = getEmpresa(req.params.codigo) || master.prepare("SELECT * FROM empresas WHERE codigo=?").get(req.params.codigo);
    if (!e) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { getEmpresaDB } = require('../db_sqlite');
    const habilitadas = getEmpresaIntegracionesHabilitadas(e.id);
    const empDB = getEmpresaDB(e.codigo);
    const estados = {};

    for (const provider of habilitadas) {
      try {
        const row = empDB.raw.prepare(
          "SELECT * FROM company_integrations WHERE provider = ?"
        ).get(provider);
        if (row) {
          estados[provider] = {
            status: row.status,
            external_account_id: row.external_account_id,
            external_user_id: row.external_user_id,
            last_sync: row.last_sync,
            last_error: row.last_error,
            health_status: row.health_status,
            last_health_check: row.last_health_check,
            expires_at: row.expires_at,
            connected: row.status === 'connected',
          };
        }
      } catch {}
    }

    res.json({ habilitadas, estados });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Habilitar/deshabilitar una integración para una empresa
router.post('/empresas/:codigo/integraciones', superAuth, (req, res) => {
  try {
    const e = getEmpresa(req.params.codigo) || master.prepare("SELECT * FROM empresas WHERE codigo=?").get(req.params.codigo);
    if (!e) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { provider, habilitado } = req.body;
    if (!provider) return res.status(400).json({ error: 'Falta provider' });

    setEmpresaIntegracion(e.id, provider, !!habilitado);
    saAudit(req.sadmin.id,
      habilitado ? 'integracion_habilitar' : 'integracion_deshabilitar',
      e.id,
      `${habilitado ? 'Habilitada' : 'Deshabilitada'} integración "${provider}" para empresa ${e.codigo}`
    );

    res.json({ ok: true, provider, habilitado: !!habilitado });
  } catch (eb) { res.status(500).json({ error: eb.message }); }
});

// Batch update de integraciones habilitadas
router.post('/empresas/:codigo/integraciones/batch', superAuth, (req, res) => {
  try {
    const e = getEmpresa(req.params.codigo) || master.prepare("SELECT * FROM empresas WHERE codigo=?").get(req.params.codigo);
    if (!e) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { providers } = req.body;
    if (!Array.isArray(providers)) return res.status(400).json({ error: 'providers debe ser un array' });

    setEmpresaIntegracionesBatch(e.id, providers);
    saAudit(req.sadmin.id, 'integracion_batch', e.id,
      `Integraciones actualizadas: ${JSON.stringify(providers.map(p => `${p.provider}=${p.habilitado ? 'ON' : 'OFF'}`))}`);

    res.json({ ok: true, count: providers.length });
  } catch (eb) { res.status(500).json({ error: eb.message }); }
});

// Logs de integración de una empresa
router.get('/empresas/:codigo/integraciones/logs', superAuth, (req, res) => {
  try {
    const e = getEmpresa(req.params.codigo) || master.prepare("SELECT * FROM empresas WHERE codigo=?").get(req.params.codigo);
    if (!e) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { getEmpresaDB } = require('../db_sqlite');
    const empDB = getEmpresaDB(e.codigo);
    const { provider, tipo, limit } = req.query;

    let sql = "SELECT * FROM integration_logs WHERE 1=1";
    const params = [];

    if (provider) { sql += " AND provider = ?"; params.push(provider); }
    if (tipo) { sql += " AND tipo = ?"; params.push(tipo); }

    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(parseInt(limit) || 200);

    const logs = empDB.raw.prepare(sql).all(...params);
    res.json(logs);
  } catch (eb) { res.status(500).json({ error: eb.message }); }
});

// Download a specific backup file
router.get('/empresas/backup-download/:file', superAuth, (req, res) => {
  const file = req.params.file;
  if (file.includes('..') || (!file.endsWith('.zip') && !file.endsWith('.db'))) return res.status(400).json({ error: 'Nombre invalido' });
  const fp = require('path').join(__dirname, '../data/backups', file);
  if (!require('fs').existsSync(fp)) return res.status(404).json({ error: 'No encontrado' });
  res.download(fp, file);
});

// ══ Crear empresa desde backup ══
router.post('/empresas/from-backup', superAuth, (req, res) => {
  const { codigo, nombre, backup_file, rubro, plan_id } = req.body;
  if (!codigo || !nombre || !backup_file) return res.status(400).json({ error: 'Codigo, nombre y archivo de backup requeridos' });
  if (!/^[a-z0-9_]+$/.test(codigo)) return res.status(400).json({ error: 'Solo minusculas, numeros y _' });
  if (getEmpresa(codigo)) return res.status(400).json({ error: 'Ese codigo ya existe' });
  const admin_email = req.sadmin?.email;
  if (admin_email) {
    const emailExiste = master.prepare("SELECT codigo FROM empresas WHERE LOWER(admin_email)=LOWER(?)").get(admin_email.trim().toLowerCase());
    if (emailExiste) return res.status(400).json({ error: 'Ya existe una empresa con ese email.' });
  }

  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  try {
    const backupPath = path.join(__dirname, '../data/backups', backup_file);
    if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Archivo de backup no encontrado' });

    // Copy the backup as the new tenant DB
    const destPath = path.join(__dirname, '../data', `empresa_${codigo}.db`);
    fs.copyFileSync(backupPath, destPath);

    // Create empresa in master DB
    createEmpresa({ codigo, nombre, rubro: rubro || 'general', plan_id: plan_id || 'plan_basic', admin_email: admin_email || '', vencimiento: null, usuarios_max: 5, sucursales_max: 1 });

    saAudit(req.sadmin.id, 'crear_desde_backup', codigo, `Empresa restaurada desde backup: ${backup_file}`);
    res.json({ ok: true, codigo, mensaje: 'Empresa creada desde backup' });
  } catch(e) {
    console.error('[BackupRestore] Error:', e.message);
    res.status(500).json({ error: 'Error al restaurar: ' + e.message });
  }
});

// ══ Login as empresa ══
router.post('/empresas/:codigo/login-as', superAuth, (req, res) => {
  const e = getEmpresa(req.params.codigo);
  if(!e) return res.status(404).json({error:'Empresa no encontrada'});
  const empDB = getEmpresaDB(e.codigo);
  const admin = empDB.find('usuarios').find(u=>u.rol==='admin'&&u.activo!==false);
  if(!admin) return res.status(404).json({error:'Sin usuario admin en esta empresa'});
  const { getSecret } = require('../middleware/auth');
  const token = jwt.sign({
    id:admin.id, rol:admin.rol, nombre:admin.nombre,
    empresa:e.codigo, roles:admin.roles, impersonated_by: req.sadmin.usuario
  }, getSecret(), {expiresIn:'2h'});
  saAudit(req.sadmin.id, 'login_as', e.id, `Acceso como: ${e.nombre} (${e.codigo})`);
  try { empDB.audit({ id: admin.id, nombre: admin.nombre + ' (vía ' + req.sadmin.usuario + ')' }, null, 'superadmin', 'login_as', 'Superadmin ' + req.sadmin.usuario + ' accedió como admin', admin.id); } catch(ex) {}
  res.json({token, empresa:e.codigo, nombre:admin.nombre, empresa_nombre:e.nombre});
});


// ══════════════════════════════════════
// PLANES
// ══════════════════════════════════════
router.get('/planes', superAuth, (req, res) => {
  const incluir = req.query.incluir_inactivos === '1' || req.query.incluir_inactivos === 'true';
  res.json(getPlanes(incluir ? { incluirInactivos: true } : undefined));
});

router.post('/planes', superAuth, (req, res) => {
  try {
    let {codigo,nombre,descripcion,precio,moneda,modulos,limites,orden} = req.body;
    if(!codigo||!nombre) return res.status(400).json({error:'Código y nombre requeridos'});
    codigo = String(codigo).trim().toLowerCase();
    if(!/^[a-z0-9_]+$/.test(codigo)) return res.status(400).json({error:'Código solo minúsculas, números y _'});
    const dup = master.prepare("SELECT id FROM planes WHERE codigo=?").get(codigo);
    if(dup) return res.status(400).json({error:'Ese código ya existe'});
    // Normalizar limites
    if(limites && typeof limites === 'object'){
      if('usuarios' in limites || 'sucursales' in limites){
        limites = { usuarios_max: limites.usuarios_max ?? limites.usuarios ?? 0, sucursales_max: limites.sucursales_max ?? limites.sucursales ?? 0 };
      }
    }
    const id = 'plan_'+Date.now();
    master.prepare("INSERT INTO planes (id,codigo,nombre,descripcion,precio,moneda,modulos,limites,activo,orden) VALUES (?,?,?,?,?,?,?,?,1,?)")
      .run(id,codigo,nombre,descripcion||'',precio||0,moneda||'USD',
        JSON.stringify(modulos||[]),JSON.stringify(limites||{}), orden!=null? parseInt(orden)||99 : 99);
    saAudit(req.sadmin.id,'crear_plan',null,`Plan: ${nombre}`);
    res.json({id,ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

router.put('/planes/:id', superAuth, (req, res) => {
  try {
    const existing = getPlan(req.params.id);
    if(!existing) return res.status(404).json({error:'Plan no encontrado'});
    let {codigo,nombre,descripcion,precio,modulos,limites,activo,orden} = req.body;
    // codigo
    if(codigo != null){
      codigo = String(codigo).trim().toLowerCase();
      if(!codigo) return res.status(400).json({error:'Código requerido'});
      if(!/^[a-z0-9_]+$/.test(codigo)) return res.status(400).json({error:'Código solo minúsculas, números y _'});
      const dup = master.prepare("SELECT id FROM planes WHERE codigo=? AND id!=?").get(codigo, req.params.id);
      if(dup) return res.status(400).json({error:'Ese código ya existe'});
    } else {
      codigo = existing.codigo;
    }
    // nombre requerido
    if(nombre != null && !String(nombre).trim()) return res.status(400).json({error:'Nombre requerido'});
    // limites normalización
    if(limites && typeof limites === 'object'){
      if('usuarios' in limites || 'sucursales' in limites){
        limites = { usuarios_max: limites.usuarios_max ?? limites.usuarios ?? 0, sucursales_max: limites.sucursales_max ?? limites.sucursales ?? 0 };
      }
    }
    const finalNombre = nombre != null ? nombre : existing.nombre;
    const finalDesc = descripcion != null ? descripcion : existing.descripcion;
    const finalPrecio = precio != null ? precio : existing.precio;
    const finalModulos = modulos != null ? modulos : existing.modulos;
    const finalLimites = limites != null ? limites : existing.limites;
    const finalActivo = activo != null ? (activo ? 1 : 0) : existing.activo;
    const finalOrden = orden != null ? (parseInt(orden)||0) : existing.orden;
    master.prepare("UPDATE planes SET codigo=?,nombre=?,descripcion=?,precio=?,modulos=?,limites=?,activo=?,orden=? WHERE id=?")
      .run(codigo, finalNombre, finalDesc||'', finalPrecio||0, JSON.stringify(finalModulos||[]), JSON.stringify(finalLimites||{}), finalActivo, finalOrden, req.params.id);
    saAudit(req.sadmin.id,'editar_plan',null,`Plan: ${finalNombre}`);
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

router.post('/planes/:id/reactivar', superAuth, (req, res) => {
  try {
    const p = getPlan(req.params.id);
    if(!p) return res.status(404).json({error:'Plan no encontrado'});
    master.prepare("UPDATE planes SET activo=1 WHERE id=?").run(req.params.id);
    saAudit(req.sadmin.id,'reactivar_plan',null,`Plan reactivado: ${p.nombre}`);
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

router.delete('/planes/:id', superAuth, (req, res) => {
  try {
    const p = getPlan(req.params.id);
    if(!p) return res.status(404).json({error:'Plan no encontrado'});
    const uso = master.prepare("SELECT COUNT(*) as n FROM empresas WHERE plan_id=?").get(req.params.id);
    if(uso && uso.n > 0) return res.status(400).json({error:`No se puede eliminar: ${uso.n} empresa(s) usan este plan. Reasignar primero.`});
    master.prepare("DELETE FROM planes WHERE id=?").run(req.params.id);
    saAudit(req.sadmin.id,'eliminar_plan',null,`Plan eliminado definitivo: ${p.nombre} (${p.codigo})`);
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ══════════════════════════════════════
// MÓDULOS
// ══════════════════════════════════════
router.get('/modulos', superAuth, (req, res) => res.json(getModulos()));

router.put('/modulos/:id', superAuth, (req, res) => {
  const {nombre,descripcion,premium,beta,activo,orden} = req.body;
  master.prepare("UPDATE modulos SET nombre=?,descripcion=?,premium=?,beta=?,activo=?,orden=? WHERE id=?")
    .run(nombre,descripcion||'',premium?1:0,beta?1:0,activo?1:0,orden||99,req.params.id);
  res.json({ok:true});
});

// ══════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════
// GET /api/sa/version — sin auth, para verificar que el código nuevo está corriendo
router.get('/version', (req, res) => {
  res.json({ version: 'v74', built: '2026-05-08', ok: true });
});

// GET /api/sa/repair-sucursales — repara empresas sin sucursales
router.get('/repair-sucursales', superAuth, (req, res) => {
  const { uid } = require('../db_sqlite');
  const empresas = getEmpresas();
  const report = [];
  for (const emp of empresas) {
    if (!emp.activo) { report.push({codigo: emp.codigo, status: 'skipped-inactive'}); continue; }
    try {
      const empDB = getEmpresaDB(emp.codigo);
      const allSucs = empDB.find('sucursales', {});
      const activas = allSucs.filter(s => s.activo !== false && s.activo !== 0);
      if (activas.length === 0) {
        const newId = uid();
        empDB.insert('sucursales', { id: newId, nombre: emp.nombre, dir: '', activo: true, creado: new Date().toISOString() });
        console.log('[REPAIR] Sucursal creada para empresa:', emp.codigo);
        report.push({codigo: emp.codigo, status: 'fixed', sucursal_id: newId});
      } else {
        report.push({codigo: emp.codigo, status: 'ok', sucursales: activas.length});
      }
    } catch(e) {
      report.push({codigo: emp.codigo, status: 'error', msg: e.message});
    }
  }
  res.json({ report, total: empresas.length });
});

router.get('/audit', superAuth, (req, res) => {
  const empresaId = req.query.empresa_id;
  let rows;
  if (empresaId) {
    rows = master.prepare("SELECT * FROM sa_audit_log WHERE empresa_id=? ORDER BY fecha DESC LIMIT 200").all(empresaId);
  } else {
    rows = master.prepare("SELECT * FROM sa_audit_log ORDER BY fecha DESC LIMIT 200").all();
  }
  res.json(rows);
});

router.get('/solicitudes-plan', superAuth, (req, res) => {
  const rows = master.prepare(`
    SELECT sp.*, e.nombre as empresa_nombre, e.codigo as empresa_codigo,
           e.vencimiento as empresa_vencimiento, e.plan_id as plan_actual_id,
           pa.nombre as plan_actual_nombre, pa.precio as plan_actual_precio,
           pl.nombre as plan_nombre, pl.precio as plan_nuevo_precio
    FROM solicitudes_plan sp
    LEFT JOIN empresas e ON e.codigo = sp.empresa_id
    LEFT JOIN planes pa ON pa.id = e.plan_id
    LEFT JOIN planes pl ON pl.id = sp.plan_id
    ORDER BY sp.fecha DESC
  `).all();
  res.json(rows);
});

router.post('/solicitudes-plan/:id/resolver', superAuth, (req, res) => {
  const { accion } = req.body;
  const sol = master.prepare('SELECT * FROM solicitudes_plan WHERE id=?').get(req.params.id);
  if (!sol) return res.status(404).json({ error: 'No encontrada' });

  master.prepare('UPDATE solicitudes_plan SET estado=? WHERE id=?')
    .run(accion === 'aprobar' ? 'aprobada' : 'rechazada', req.params.id);

  if (accion === 'aprobar') {
    // empresa_id stores the codigo (tenant code)
    const empresa = master.prepare('SELECT * FROM empresas WHERE codigo=?').get(sol.empresa_id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada: ' + sol.empresa_id });
    const plan = getPlan(sol.plan_id);
    if (plan) {
      const limites = typeof plan.limites === 'string' ? JSON.parse(plan.limites || '{}') : (plan.limites || {});
      const periodo = plan.periodo || 'mensual';
      const diasPeriodo = periodo === 'anual' ? 365 : 30;
      const nuevoVenc = new Date(Date.now() + diasPeriodo * 86400000).toISOString().substr(0, 10);
      master.prepare('UPDATE empresas SET plan_id=?,usuarios_max=?,sucursales_max=?,vencimiento=? WHERE codigo=?')
        .run(sol.plan_id, limites.usuarios_max || 5, limites.sucursales_max || 2, nuevoVenc, sol.empresa_id);
      // Apply modules to empresa DB
      try {
        const { getEmpresaDB } = require('../db_sqlite');
        const empDB = getEmpresaDB(sol.empresa_id);
        const mods = Array.isArray(plan.modulos) ? plan.modulos :
          (typeof plan.modulos === 'string' ? JSON.parse(plan.modulos || '[]') : []);
        empDB.setConfig({ modulos_habilitados: JSON.stringify(mods) });
        empDB.setConfig({ solicitud_plan: null });
      } catch(e) { console.error('[SA] error applying plan to DB:', e.message); }
    }
  } else {
    // On reject: clear pending request from empresa config
    try {
      const { getEmpresaDB } = require('../db_sqlite');
      const empDB = getEmpresaDB(sol.empresa_id);
      empDB.setConfig({ solicitud_plan: null });
    } catch(e) {}
  }

  saAudit(req.sadmin.id, `plan_${accion}`, sol.empresa_id,
    `Plan ${accion}: ${sol.plan_id} para ${sol.empresa_id}`);
  res.json({ ok: true });
});

// ── Solicitudes de eliminación de cuenta ──
router.get('/solicitudes-eliminacion', superAuth, (req, res) => {
  const rows = master.prepare(`
    SELECT se.*, e.nombre as empresa_nombre, e.admin_email, e.plan_id
    FROM solicitudes_eliminacion se
    LEFT JOIN empresas e ON e.id = se.empresa_id
    ORDER BY se.fecha DESC
  `).all();
  res.json(rows);
});

router.post('/solicitudes-eliminacion/:id/resolver', superAuth, async (req, res) => {
  const { accion, hacer_backup, enviar_email } = req.body;
  const sol = master.prepare('SELECT * FROM solicitudes_eliminacion WHERE id=?').get(req.params.id);
  if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });

  if (accion === 'aprobar') {
    const empresa = master.prepare('SELECT * FROM empresas WHERE id=?').get(sol.empresa_id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const path = require('path');
    let backupFilename = null;

    if (hacer_backup || enviar_email) {
      try {
        const { makeEmpresaBackup } = require('./backup');
        const result = makeEmpresaBackup(empresa.codigo);
        backupFilename = result.name;
      } catch(be) {
        console.error('[DeleteSolicitud] Backup error:', be.message);
        return res.status(500).json({ error: 'No se pudo generar el backup. La empresa NO fue eliminada.' });
      }
    }

    if (enviar_email && sol.email && backupFilename) {
      setImmediate(async () => {
        try {
          const h = getGlobalConfig('smtp_host');
          if (h) {
            const { decryptValue } = require('../lib/crypto-utils');
            const u = getGlobalConfig('smtp_user');
            const pass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : '';
            const from = getGlobalConfig('smtp_from')||u||'';
            const { sendEmail, getRemitente } = require('../lib/send-email');
            const { fromName } = getRemitente();
            const html = `<div style="font-family:sans-serif;padding:20px"><h2>Tu cuenta ha sido eliminada</h2>
<p>Hola, tu empresa <strong>${empresa.nombre}</strong> (${empresa.codigo}) fue eliminada de FlexCRM según lo solicitado.</p>
<p>Adjuntamos el backup final de todos tus datos.</p></div>`;
            const backupPath = path.join(__dirname, '../data/backups', backupFilename);
            const fs = require('fs');
            if (fs.existsSync(backupPath)) {
              await sendEmail(h, parseInt(getGlobalConfig('smtp_port'))||465, u, pass, '"'+fromName+'" <'+from+'>', sol.email, 'Cuenta eliminada — FlexCRM', html, [{ filename: backupFilename, path: backupPath }]);
            }
          }
        } catch(se) { console.error('[DeleteSolicitud] Email error:', se.message); }
      });
    }

    // Borrado a cero: archivos primero (con verificación), luego fila master
    const { remaining } = await purgeEmpresa(sol.empresa_id, empresa.codigo);
    if (remaining.length > 0) {
      console.error('[DeleteSolicitud] No se pudieron eliminar archivos (' + empresa.codigo + '):', remaining.join(', '));
      return res.status(500).json({ error: 'No se pudieron eliminar todos los archivos de la empresa. La empresa NO fue eliminada.' });
    }

    // Hard delete
    master.prepare("DELETE FROM empresas WHERE id=?").run(sol.empresa_id);

    saAudit(req.sadmin.id, 'eliminar_empresa_solicitada', sol.empresa_id,
      'Eliminada por solicitud: ' + empresa.nombre + ' — ' + sol.email + (backupFilename ? ' Backup: '+backupFilename : ''));
  }

  master.prepare("UPDATE solicitudes_eliminacion SET estado=? WHERE id=?")
    .run(accion === 'aprobar' ? 'aprobada' : 'rechazada', req.params.id);

  if (accion === 'rechazar' && sol.email) {
    setImmediate(async () => {
      try {
        const h = getGlobalConfig('smtp_host');
        if (h) {
          const { decryptValue } = require('../lib/crypto-utils');
          const u = getGlobalConfig('smtp_user');
          const pass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : '';
          const from = getGlobalConfig('smtp_from')||u||'';
          const { sendEmail, getRemitente } = require('../lib/send-email');
          const { fromName } = getRemitente();
          const html = `<div style="font-family:sans-serif;padding:20px"><h2>Solicitud de eliminación rechazada</h2>
<p>Hola, la solicitud de eliminación de tu cuenta en FlexCRM fue <strong>rechazada</strong>.</p>
<p>Si necesitás ayuda, contactanos respondiendo este email.</p></div>`;
          await sendEmail(h, parseInt(getGlobalConfig('smtp_port'))||465, u, pass, '"'+fromName+'" <'+from+'>', sol.email, 'Solicitud de eliminación rechazada — FlexCRM', html);
        }
      } catch(se) { console.error('[DeleteSolicitud] Email error:', se.message); }
    });
  }

  saAudit(req.sadmin.id, `eliminacion_${accion}`, sol.empresa_id,
    `Solicitud ${accion}: ${sol.email} — ${sol.empresa_codigo}`);
  res.json({ ok: true });
});

// Calcular prorrateo para cambio de plan (usado por frontend empresa)
router.get('/solicitudes-plan/prorate', superAuth, (req, res) => {
  const { empresa_codigo, nuevo_plan_id } = req.query;
  const empresa = master.prepare('SELECT * FROM empresas WHERE codigo=?').get(empresa_codigo);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  const planActual = getPlan(empresa.plan_id);
  const planNuevo  = getPlan(nuevo_plan_id);
  if (!planActual || !planNuevo) return res.json({ tiene_costo: false });

  const hoy = new Date();
  const vto = empresa.vencimiento ? new Date(empresa.vencimiento) : null;
  if (!vto || vto <= hoy) return res.json({ tiene_costo: false, mensaje: 'Suscripción vencida — se aplica precio completo del nuevo plan' });

  const diasRestantes = Math.ceil((vto - hoy) / 86400000);
  const diasMes = 30;
  const precioActual = parseFloat(planActual.precio) || 0;
  const precioNuevo  = parseFloat(planNuevo.precio)  || 0;
  const esUpgrade = precioNuevo > precioActual;

  if (!esUpgrade) {
    return res.json({
      tiene_costo: false,
      es_downgrade: true,
      dias_restantes: diasRestantes,
      mensaje: `Tu plan actual vence el ${empresa.vencimiento}. El nuevo plan se aplicará desde el próximo ciclo. No hay devolución de saldo.`
    });
  }

  const reembolso = (precioActual / diasMes) * diasRestantes;
  const costoNuevo = (precioNuevo / diasMes) * diasRestantes;
  const neto = Math.max(0, costoNuevo - reembolso);

  res.json({
    tiene_costo: true,
    es_upgrade: true,
    dias_restantes: diasRestantes,
    vencimiento_actual: empresa.vencimiento,
    precio_actual: precioActual,
    precio_nuevo: precioNuevo,
    reembolso: Math.round(reembolso * 100) / 100,
    costo_nuevo_periodo: Math.round(costoNuevo * 100) / 100,
    monto_neto: Math.round(neto * 100) / 100,
    mensaje: `Tenés ${diasRestantes} días restantes de tu plan actual ($${precioActual}/mes). Pagás solo la diferencia proporcional: $${Math.round(neto * 100) / 100}`
  });
});

// ══════════════════════════════════════
// SOLICITUDES DE SOPORTE
// ══════════════════════════════════════
router.get('/solicitudes-soporte', superAuth, (req, res) => {
  try {
    const rows = master.prepare(`
      SELECT ss.*, e.nombre as empresa_nombre
      FROM solicitudes_soporte ss
      LEFT JOIN empresas e ON e.codigo = ss.empresa_id
      ORDER BY ss.fecha DESC
    `).all();
    res.json(rows);
  } catch(e) { res.json([]); }
});

router.post('/solicitudes-soporte/:id/responder', superAuth, (req, res) => {
  const { respuesta } = req.body;
  if (!respuesta) return res.status(400).json({ error: 'Respuesta requerida' });
  master.prepare(`UPDATE solicitudes_soporte SET estado='respondida', respuesta=?, respondido_por=?, fecha_respuesta=? WHERE id=?`)
    .run(respuesta, req.sadmin.nombre || req.sadmin.usuario, new Date().toISOString(), req.params.id);
  saAudit(req.sadmin.id, 'soporte_responder', null, 'Respondida solicitud ' + req.params.id);
  res.json({ ok: true });
});

router.delete('/solicitudes-soporte/:id', superAuth, (req, res) => {
  master.prepare('DELETE FROM solicitudes_soporte WHERE id=?').run(req.params.id);
  saAudit(req.sadmin.id, 'soporte_eliminar', null, 'Eliminada solicitud ' + req.params.id);
  res.json({ ok: true });
});

// ── Reset password de empresa desde superadmin ──
router.post('/empresas/:codigo/reset-password', superAuth, (req, res) => {
  const e = getEmpresa(req.params.codigo);
  if (!e) return res.status(404).json({ error: 'Empresa no encontrada' });
  const { getEmpresaDB } = require('../db_sqlite');
  const empDB = getEmpresaDB(e.codigo);
  const admin = empDB.find('usuarios').find(u => u.rol === 'admin' && u.activo !== false);
  if (!admin) return res.status(404).json({ error: 'Sin usuario admin en esta empresa' });
  const nueva = Math.random().toString(36).slice(2, 10) + 'A1!';
  const hash = bcrypt.hashSync(nueva, 10);
  empDB.update('usuarios', admin.id, { password: hash, must_change_password: 1 });
  saAudit(req.sadmin.id, 'reset_password', e.id, 'Password reseteado para admin de ' + e.codigo);
  res.json({ ok: true, usuario: admin.usuario, mensaje: 'Contrasea reseteada. Entregala de forma segura al administrador de la empresa.' });
});

// ── Reenviar email de verificación al admin de empresa ──
router.post('/empresas/:codigo/resend-verification', superAuth, async (req, res) => {
  const e = getEmpresa(req.params.codigo);
  if (!e) return res.status(404).json({ error: 'Empresa no encontrada' });
  const { getEmpresaDB } = require('../db_sqlite');
  const crypto = require('crypto');
  const empDB = getEmpresaDB(e.codigo);
  const admin = empDB.find('usuarios').find(u => u.rol === 'admin' && u.activo !== false && u.email);
  if (!admin) return res.status(400).json({ error: 'Sin usuario admin con email en esta empresa' });
  if (admin.email_verificado === 1 || admin.email_verificado === true) return res.status(400).json({ error: 'El email ya está verificado' });

  const verToken = crypto.randomBytes(20).toString('hex');
  empDB.raw.prepare("UPDATE email_tokens SET usado=1 WHERE usuario_id=?").run(admin.id);
  empDB.insert('email_tokens', {
    id: 'vet_' + Date.now(), usuario_id: admin.id, email: admin.email,
    token_hash: crypto.createHash('sha256').update(verToken).digest('hex'),
    expires: new Date(Date.now() + 24 * 3600000).toISOString(), usado: 0, creado: new Date().toISOString(),
  });

  try {
    const { getGlobalConfig } = require('../db_master');
    const { decryptValue } = require('../lib/crypto-utils');
    const h = getGlobalConfig('smtp_host'), p = parseInt(getGlobalConfig('smtp_port')) || 465;
    const u = getGlobalConfig('smtp_user'), pass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : '';
    const from = getGlobalConfig('smtp_from') || u || '';
    const { getRemitente } = require('../lib/send-email');
    const rem = getRemitente();
    const appUrl = process.env.APP_URL || 'https://app.flexcrm.com.ar';
    const tutorialesUrl = process.env.TUTORIALES_URL || `${appUrl}/tutoriales`;
    const { sendEmail } = require('../lib/send-email');
    const { verificationEmail } = require('../lib/email-templates');
    const empCodigo = e.codigo || '';
    await sendEmail(h, p, u, pass, rem.formatted, admin.email, 'Verificá tu email y empezá — FlexCRM',
      verificationEmail(e.nombre || 'FlexCRM', empCodigo, admin.usuario || '', appUrl + '/api/auth/verify-email/' + verToken, appUrl, tutorialesUrl));
    saAudit(req.sadmin.id, 'resend_verification', e.id, 'Email verificacion reenviado a ' + admin.email);
    res.json({ ok: true, mensaje: 'Email de verificacion reenviado a ' + admin.email });
  } catch (err) {
    console.error('[SA] Error enviando verificacion:', err.message);
    res.status(500).json({ error: 'Error al enviar el email: ' + err.message });
  }
});

// ── Marcar email como verificado manualmente ──
router.post('/empresas/:codigo/mark-verified', superAuth, (req, res) => {
  const e = getEmpresa(req.params.codigo);
  if (!e) return res.status(404).json({ error: 'Empresa no encontrada' });
  const { getEmpresaDB } = require('../db_sqlite');
  const empDB = getEmpresaDB(e.codigo);
  const admin = empDB.find('usuarios').find(u => u.rol === 'admin' && u.activo !== false);
  if (!admin) return res.status(404).json({ error: 'Sin usuario admin en esta empresa' });
  empDB.update('usuarios', admin.id, { email_verificado: 1 });
  empDB.raw.prepare("UPDATE email_tokens SET usado=1 WHERE usuario_id=?").run(admin.id);
  saAudit(req.sadmin.id, 'mark_verified', e.id, 'Email marcado como verificado manualmente para admin de ' + e.codigo);
  res.json({ ok: true, mensaje: 'Email marcado como verificado' });
});

// ══════════════════════════════════════
// BACKUP / IMPORT por empresa
// ══════════════════════════════════════
router.get('/empresas/:codigo/backup', superAuth, (req, res) => {
  const e = getEmpresa(req.params.codigo);
  if (!e) return res.status(404).json({ error: 'Empresa no encontrada' });
  try {
    const { makeEmpresaBackup } = require('./backup');
    const result = makeEmpresaBackup(e.codigo);
    saAudit(req.sadmin.id, 'backup_empresa', e.id, `Backup: ${result.name} — ${(result.size/1024).toFixed(1)}KB`);
    res.download(result.path, result.name);
  } catch (err) {
    res.status(500).json({ error: 'Error al generar backup: ' + err.message });
  }
});

router.post('/empresas/:codigo/import', superAuth, express.raw({ type: 'application/octet-stream', limit: '200mb' }), (req, res) => {
  const e = getEmpresa(req.params.codigo);
  if (!e) return res.status(404).json({ error: 'Empresa no encontrada' });
  const fs = require('fs');
  const path = require('path');
  const { TENANT_DATA_DIR } = require('../db_sqlite');
  const { closeEmpresaConn } = require('../lib/purgeEmpresa');
  const dbPath = path.join(TENANT_DATA_DIR, `empresa_${e.codigo}.db`);

  // Acepta binario (application/octet-stream) o JSON base64 (compat con versiones viejas)
  let buf = null;
  if (Buffer.isBuffer(req.body) && req.body.length) {
    buf = req.body;
  } else if (req.body && (req.body.data_base64 || req.body.data)) {
    try { buf = Buffer.from(req.body.data_base64 || req.body.data, 'base64'); } catch (eb) { /* ignore */ }
  }
  if (!buf || !buf.length) return res.status(400).json({ error: 'Enviá el archivo de base de datos (.db) como binario o base64' });

  // Validar cabecera SQLite ("SQLite format 3\0") antes de tocar el disco
  if (buf.length < 16 || buf.toString('utf8', 0, 16) !== 'SQLite format 3\u0000') {
    return res.status(400).json({ error: 'El archivo no es una base de datos SQLite válida' });
  }

  // Backup de seguridad del estado actual
  const backupPath = dbPath + '.bak.' + Date.now();
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);

  // Cerrar conexión cacheada ANTES de sobrescribir (evita corrupción WAL)
  closeEmpresaConn(e.codigo);

  try {
    // Borrar WAL/SHM para no mezclar datos stale con la DB importada
    for (const suffix of ['.db-wal', '.db-shm']) {
      try { const p = dbPath + suffix; if (fs.existsSync(p)) fs.unlinkSync(p); } catch (eu) { /* ignore */ }
    }
    fs.writeFileSync(dbPath, buf);
    saAudit(req.sadmin.id, 'import_db', e.id, `Import DB: ${e.nombre} (${e.codigo})`);
    // Limpiar backup de seguridad
    try { if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); } catch (eu) { /* ignore */ }
    res.json({ ok: true, mensaje: 'Base de datos importada correctamente' });
  } catch (err) {
    // Restaurar backup de seguridad
    try { if (fs.existsSync(backupPath)) fs.copyFileSync(backupPath, dbPath); } catch (eu) { /* ignore */ }
    res.status(500).json({ error: 'Error al importar: ' + err.message });
  }
});

// ══════════════════════════════════════
// PROSPECTOS
// ══════════════════════════════════════
router.get('/prospectos', superAuth, (req, res) => {
  try { res.json(getProspectos()) } catch(e) { res.status(500).json({ error: e.message }) }
});

router.get('/prospectos/:id', superAuth, (req, res) => {
  try {
    const p = getProspecto(req.params.id);
    if (!p) return res.status(404).json({ error: 'No encontrado' });
    const seg = getProspectoSeguimiento(req.params.id);
    res.json({ ...p, seguimiento: seg });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/prospectos', superAuth, (req, res) => {
  try {
    const { nombre, telefono, email, empresa_interes, origen, notas, asignado_a } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const id = 'pros_' + Date.now();
    const fecha = new Date().toISOString();
    master.prepare(`INSERT INTO prospectos (id,nombre,telefono,email,empresa_interes,origen,estado,notas,asignado_a,fecha_creacion)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      id, nombre.trim(), (telefono || '').trim(), (email || '').trim(), (empresa_interes || '').trim(),
      origen || 'manual', 'nuevo', notas || '', asignado_a || '', fecha
    );
    saAudit(req.sadmin.id, 'crear_prospecto', null, `Prospecto: ${nombre}`);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.put('/prospectos/:id', superAuth, (req, res) => {
  try {
    const { nombre, telefono, email, empresa_interes, estado, notas, asignado_a } = req.body;
    const p = getProspecto(req.params.id);
    if (!p) return res.status(404).json({ error: 'No encontrado' });
    master.prepare(`UPDATE prospectos SET nombre=?,telefono=?,email=?,empresa_interes=?,estado=?,notas=?,asignado_a=? WHERE id=?`)
      .run(nombre||p.nombre, telefono||p.telefono, email||p.email, empresa_interes||p.empresa_interes,
        estado||p.estado, notas||p.notas, asignado_a||p.asignado_a, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/prospectos/:id/seguimiento', superAuth, (req, res) => {
  try {
    const { tipo, descripcion } = req.body;
    if (!descripcion) return res.status(400).json({ error: 'Descripción requerida' });
    const id = 'seg_' + Date.now();
    const fecha = new Date().toISOString();
    master.prepare(`INSERT INTO prospecto_seguimiento (id,prospecto_id,tipo,descripcion,fecha,creado_por) VALUES (?,?,?,?,?,?)`)
      .run(id, req.params.id, tipo || 'nota', descripcion, fecha, req.sadmin.usuario || 'superadmin');
    master.prepare("UPDATE prospectos SET fecha_ultimo_contacto=?,ultimo_seguimiento=? WHERE id=?")
      .run(fecha, descripcion, req.params.id);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/prospectos/:id/cambiar-estado', superAuth, (req, res) => {
  try {
    const { estado } = req.body;
    if (!['nuevo','contactado','interesado','calificado','cerrado_ganado','cerrado_perdido'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    master.prepare("UPDATE prospectos SET estado=? WHERE id=?").run(estado, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

// ══════════════════════════════════════
// LANDING LEADS
// ══════════════════════════════════════
router.get('/landing-leads', superAuth, (req, res) => {
  try { res.json(getLandingLeads(req.query.no_leidos === 'true')) } catch(e) { res.json([]) }
});

router.put('/landing-leads/:id/leer', superAuth, (req, res) => {
  try { master.prepare("UPDATE landing_leads SET leido=1 WHERE id=?").run(req.params.id); res.json({ ok: true }) }
  catch(e) { res.status(500).json({ error: e.message }) }
});

router.get('/landing-stats', superAuth, (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 30;
    const pagina = req.query.pagina || '';
    const stats = getLandingStats(dias, pagina);
    res.json(stats);
  } catch(e) { res.status(500).json({ error: e.message }) }
});

// ══════════════════════════════════════
// SYSTEM STATS
// ══════════════════════════════════════
router.get('/stats', superAuth, (req, res) => {
  try { res.json(getDbStats()) } catch(e) { res.status(500).json({ error: e.message }) }
});

// ══════════════════════════════════════
// STALE PROSPECT REMINDER
// ══════════════════════════════════════
router.get('/prospectos-recuperables', superAuth, (req, res) => {
  try {
    const { getStaleProspects } = require('../lib/stale-prospect-reminder');
    res.json(getStaleProspects());
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/prospectos-recuperables/notificar', superAuth, async (req, res) => {
  try {
    const { runStaleCheck } = require('../lib/stale-prospect-reminder');
    await runStaleCheck();
    saAudit(req.sadmin.id, 'notificar_stale_prospects', null, 'Envío manual de recordatorios a prospectos sin seguimiento');
    res.json({ ok: true, mensaje: 'Resumen de prospectos recuperables enviado' });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

// ══════════════════════════════════════
// GLOBAL EMAIL CONFIG (SMTP)
// ══════════════════════════════════════
router.get('/email-config', superAuth, (req, res) => {
  const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_from', 'smtp_from_name'];
  const config = {};
  for (const key of keys) {
    config[key] = getGlobalConfig(key) || '';
  }
  res.json(config);
});

router.put('/email-config', superAuth, (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_from_name } = req.body;
  if (smtp_host) setGlobalConfig('smtp_host', smtp_host);
  if (smtp_port) setGlobalConfig('smtp_port', String(smtp_port));
  if (smtp_user) setGlobalConfig('smtp_user', smtp_user);
  if (smtp_pass && smtp_pass.trim() && !smtp_pass.includes('***')) {
    const { encryptValue } = require('../lib/crypto-utils');
    setGlobalConfig('smtp_pass', encryptValue(smtp_pass));
  }
  if (smtp_from) setGlobalConfig('smtp_from', smtp_from);
  if (smtp_from_name !== undefined) setGlobalConfig('smtp_from_name', smtp_from_name || '');
  saAudit(req.sadmin.id, 'config_smtp', null, 'Configuración SMTP global actualizada');
  res.json({ ok: true });
});

router.post('/email-test', superAuth, (req, res) => {
  const { host, port, user, pass, from, to } = req.body;
  const testTo = to || master.prepare("SELECT email FROM superadmin WHERE id=?").get(req.sadmin.id)?.email || user;
  if (!host || !user || !testTo) return res.status(400).json({ error: 'Faltan datos: host, user y destinatario requeridos' });
  try {
    const { sendEmail } = require('../lib/send-email');
    let smtpPass = pass;
    if (!smtpPass || smtpPass.includes('***')) {
      const { decryptValue } = require('../lib/crypto-utils');
      const encrypted = getGlobalConfig('smtp_pass');
      if (encrypted) smtpPass = decryptValue(encrypted);
    }
    sendEmail(host, parseInt(port) || 465, user, smtpPass, from || user,
      testTo, 'Test de conexión — FlexCRM SuperAdmin',
      `<div style="font-family:sans-serif;padding:20px"><h2>✅ ¡Funciona!</h2><p>Tu configuración SMTP global es correcta.</p><p style="color:#64748b;font-size:12px">Enviado: ${new Date().toLocaleString('es-AR')}</p></div>`
    ).then(() => res.json({ ok: true, message: 'Mail de prueba enviado ✅' }))
      .catch(e => res.status(500).json({ error: 'Error SMTP: ' + e.message }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════
// BILLING / MERCADOPAGO (configurable desde SuperAdmin)
// ══════════════════════════════════════

// GET /api/superadmin/mp-config — config MP (token enmascarado)
router.get('/mp-config', superAuth, (req, res) => {
  const mp = require('../lib/mercadopago');
  const cfg = mp.getMpConfig();
  res.json({
    enabled: !!cfg.enabled,
    mode: cfg.mode,
    access_token_configurado: !!cfg.accessToken,
    access_token_masked: cfg.accessToken ? '***' : '',
    public_key: cfg.publicKey,
    webhook_secret_configurado: !!cfg.webhookSecret,
    webhook_url: mp.getWebhookUrl(),
    currency: getGlobalConfig('mp_currency') || 'ARS',
    back_url_base: cfg.backUrlBase,
  });
});

// PUT /api/superadmin/mp-config — guarda config (token encriptado)
router.put('/mp-config', superAuth, (req, res) => {
  const { enabled, mode, access_token, public_key, webhook_secret, currency, back_url_base } = req.body;
  setGlobalConfig('mp_enabled', enabled ? '1' : '0');
  if (mode) setGlobalConfig('mp_mode', mode === 'live' ? 'live' : 'test');
  if (access_token && access_token.trim() && !access_token.includes('***')) {
    setGlobalConfig('mp_access_token', encryptValue(access_token.trim()));
  }
  if (public_key !== undefined) setGlobalConfig('mp_public_key', String(public_key || '').trim());
  if (webhook_secret && webhook_secret.trim() && !webhook_secret.includes('***')) {
    setGlobalConfig('mp_webhook_secret', encryptValue(webhook_secret.trim()));
  }
  if (currency) setGlobalConfig('mp_currency', String(currency).trim());
  if (back_url_base !== undefined) setGlobalConfig('mp_back_url_base', String(back_url_base || '').trim());
  saAudit(req.sadmin.id, 'config_mercadopago', null, 'Configuración MercadoPago actualizada (enabled=' + (enabled ? '1' : '0') + ', mode=' + (mode || 'test') + ')');
  res.json({ ok: true });
});

// POST /api/superadmin/mp-test — prueba conexión con token configurado
router.post('/mp-test', superAuth, async (req, res) => {
  try {
    const mp = require('../lib/mercadopago');
    const data = await mp.testConnection();
    saAudit(req.sadmin.id, 'mercadopago_test', null, 'Test conexión MP exitoso');
    res.json({ ok: true, message: 'Conexión exitosa — cuenta: ' + (data.nickname || data.email || 'MercadoPago') });
  } catch(e) {
    saAudit(req.sadmin.id, 'mercadopago_test', null, 'Test conexión MP falló: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/superadmin/billing/config — políticas de billing (grace, avisos, templates)
router.get('/billing/config', superAuth, (req, res) => {
  res.json(getBillingConfig());
});

// PUT /api/superadmin/billing/config
router.put('/billing/config', superAuth, (req, res) => {
  setBillingConfig(req.body || {});
  saAudit(req.sadmin.id, 'config_billing', null, 'Políticas de billing actualizadas');
  res.json({ ok: true, config: getBillingConfig() });
});

// GET /api/superadmin/saas-pagos — todos los pagos (filtro estado/mes)
router.get('/saas-pagos', superAuth, (req, res) => {
  const { estado, mes } = req.query;
  const pagos = getSaasPagos({ estado: estado || null, mes: mes || null, limit: 500 });
  const planes = getPlanes();
  const empresas = getEmpresas();
  const enriched = pagos.map(p => ({
    ...p,
    empresa_nombre: (empresas.find(e => e.codigo === p.empresa_codigo) || {}).nombre || p.empresa_codigo || '—',
    plan_precio_actual: (planes.find(x => x.id === p.plan_id) || {}).precio,
  }));
  res.json(enriched);
});

// GET /api/superadmin/saas-pagos/export?mes=YYYY-MM — CSV para contabilidad
router.get('/saas-pagos/export', superAuth, (req, res) => {
  const { mes } = req.query;
  const pagos = getSaasPagos({ mes: mes || null, estado: 'approved', limit: 2000 });
  const BOM = '\uFEFF';
  const header = 'Fecha,Empresa,Codigo,Plan,Tipo,Origen,Monto,Moneda,Comprobante,Payment ID\n';
  const rows = pagos.map(p => [
    (p.creado || '').substr(0, 10),
    '"' + String(p.empresa_codigo || '—').replace(/"/g, '""') + '"',
    '"' + String(p.plan_nombre || p.plan_id || '').replace(/"/g, '""') + '"',
    p.tipo || '', p.origen || '',
    p.monto != null ? p.monto : 0, p.moneda || 'ARS',
    '"' + String(p.comprobante_num || '').replace(/"/g, '""') + '"',
    '"' + String(p.mp_payment_id || '').replace(/"/g, '""') + '"',
  ].join(','));
  res.setHeader('Content-Type', 'text/csv;charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="saas-pagos' + (mes ? '-' + mes : '') + '.csv"');
  res.send(BOM + header + rows.join('\n'));
});

// GET /api/superadmin/saas-webhooks — log de webhooks MP
router.get('/saas-webhooks', superAuth, (req, res) => {
  res.json(getSaasWebhookLogs(parseInt(req.query.limit) || 100));
});

// GET /api/superadmin/empresas/:codigo/pagos — auditoría de pagos por empresa
router.get('/empresas/:codigo/pagos', superAuth, (req, res) => {
  const codigo = req.params.codigo;
  const pagos = getSaasPagosPorEmpresa(codigo, 200);
  res.json(pagos);
});

// GET /api/superadmin/empresas/:codigo/vencimientos — timeline de vencimientos/planes
router.get('/empresas/:codigo/vencimientos', superAuth, (req, res) => {
  const codigo = req.params.codigo;
  const empresa = getEmpresa(codigo) || master.prepare("SELECT * FROM empresas WHERE codigo=?").get(codigo);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

  const eventos = [];

  // Pagos aprobados
  const pagos = getSaasPagosPorEmpresa(codigo, 200).filter(p => p.estado === 'approved');
  for (const p of pagos) {
    eventos.push({
      fecha: p.creado, tipo: 'pago', estado: p.estado,
      detalle: `Pago ${p.origen} aprobado — ${p.plan_nombre || p.plan_id} — ${p.monto} ${p.moneda || 'ARS'}`,
      comprobante: p.comprobante_num, plan_id: p.plan_id, monto: p.monto,
    });
  }

  // Auditoría de acciones de plan/vencimiento
  try {
    const accionPlan = master.prepare(
      "SELECT * FROM sa_audit_log WHERE (empresa_id=? OR empresa_id=?) AND (accion LIKE 'plan_%' OR accion IN ('renovar_suscripcion','crear_empresa','editar_empresa','pago_aprobado','pago_manual','vencimiento_notificado','suspension_automatica')) ORDER BY fecha DESC LIMIT 100"
    ).all(codigo, empresa.id);
    for (const a of accionPlan) {
      eventos.push({ fecha: a.fecha, tipo: 'auditoria', accion: a.accion, detalle: a.detalle || '' });
    }
  } catch(e) {}

  eventos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  res.json({
    empresa: { codigo: empresa.codigo, nombre: empresa.nombre, vencimiento_actual: empresa.vencimiento, plan_id: empresa.plan_id },
    eventos,
  });
});

// POST /api/superadmin/empresas/:codigo/pagos/manual — registrar pago por fuera de MP
// Usa el MISMO camino que el webhook (aplicarPago) → plan, vencimiento, comprobante, mail.
router.post('/empresas/:codigo/pagos/manual', superAuth, async (req, res) => {
  try {
    const empresa = getEmpresa(req.params.codigo) || master.prepare("SELECT * FROM empresas WHERE codigo=?").get(req.params.codigo);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    const { plan_id, monto, origen, notas } = req.body;
    const plan = getPlan(plan_id || empresa.plan_id);
    if (!plan) return res.status(400).json({ error: 'Plan no encontrado' });
    const montoFinal = parseFloat(monto) || parseFloat(plan.precio) || 0;
    if (montoFinal <= 0) return res.status(400).json({ error: 'Monto inválido' });

    const pagoId = createSaasPago({
      empresa_codigo: empresa.codigo, empresa_id: empresa.id,
      plan_id: plan.id, plan_nombre: plan.nombre, precio_snapshot: parseFloat(plan.precio) || null,
      tipo: 'manual', monto: montoFinal, moneda: getGlobalConfig('mp_currency') || 'ARS',
      estado: 'pending', origen: origen === 'manual_transferencia' ? 'manual_transferencia' : 'manual_efectivo',
      mp_external_ref: 'man_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      data: { notas: String(notas || '').substring(0, 500), superadmin: req.sadmin.nombre || req.sadmin.usuario },
    });

    const pago = getSaasPago(pagoId);
    const { aplicarPago } = require('../lib/billing/aplicar-pago');
    await aplicarPago(pago);

    const final = getSaasPago(pagoId);
    saAudit(req.sadmin.id, 'pago_manual', empresa.id,
      `Pago manual registrado — ${plan.nombre} — ${montoFinal} ${final.moneda} — comprobante ${final.comprobante_num || ''}`);
    res.json({ ok: true, pago: final, mensaje: 'Pago registrado. Plan y vencimiento actualizados, comprobante enviado.' });
  } catch(e) {
    console.error('[PagoManual] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/superadmin/saas-pagos/:id/comprobante — regenerar comprobante PDF
router.post('/saas-pagos/:id/comprobante', superAuth, async (req, res) => {
  try {
    const pago = getSaasPago(req.params.id);
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    const empresa = pago.empresa_codigo ? (getEmpresa(pago.empresa_codigo) || master.prepare("SELECT * FROM empresas WHERE codigo=?").get(pago.empresa_codigo)) : null;
    const compNum = pago.comprobante_num || 'MP-' + new Date().getFullYear() + '-' + String(Date.now()).substr(-4);
    const { generarComprobantePDF } = require('../lib/comprobante-saas');
    const pdfPath = generarComprobantePDF({
      comprobanteNum: compNum,
      empresa: empresa ? empresa.nombre : (pago.data && pago.data.empresa_nombre) || 'FlexCRM',
      empresaCodigo: pago.empresa_codigo || '',
      plan: pago.plan_nombre || pago.plan_id,
      monto: pago.monto, moneda: pago.moneda || 'ARS',
      tipo: pago.tipo, vencimiento: empresa ? empresa.vencimiento : null,
      prorrateo: pago.prorrateo, origen: pago.origen,
      fecha: pago.creado || new Date().toISOString(),
    });
    const { master: m } = require('../db_master');
    m.prepare("UPDATE saas_pagos SET comprobante_num=?, comprobante_path=? WHERE id=?").run(compNum, pdfPath, pago.id);
    saAudit(req.sadmin.id, 'comprobante_regenerado', pago.empresa_id || null, 'Comprobante ' + compNum + ' regenerado');
    res.json({ ok: true, comprobante_num: compNum });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Superadmin forgot-password ──
router.post('/forgot-password', superadminForgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  const search = (email || '').trim().toLowerCase();
  if (!search) return res.json({ ok: true, mensaje: 'Si la cuenta existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.' });
  // Search by email first, then by usuario
  let sa = master.prepare("SELECT * FROM superadmin WHERE LOWER(email)=? AND activo=1").get(search);
  if (!sa) sa = master.prepare("SELECT * FROM superadmin WHERE LOWER(usuario)=? AND activo=1").get(search);
  if (!sa) return res.json({ ok: true, mensaje: 'Si la cuenta existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.' });
  const userEmail = sa.email || search;
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  // Store reset token in superadmin data
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  data.reset_token = crypto.createHash('sha256').update(token).digest('hex');
  data.reset_token_expires = expiresAt;
  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), sa.id);
  // Try to send email using global SMTP
  const smtpHost = getGlobalConfig('smtp_host');
  const smtpPort = parseInt(getGlobalConfig('smtp_port')) || 465;
  const smtpUser = getGlobalConfig('smtp_user');
  const { decryptValue } = require('../lib/crypto-utils');
  const smtpPass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : '';
  const smtpFrom = getGlobalConfig('smtp_from') || smtpUser || '';
  const { getRemitente } = require('../lib/send-email');
  const smtpFromName = getRemitente().fromName;
  if (smtpHost && smtpUser && smtpPass && smtpFrom && userEmail) {
    const resetLink = `${process.env.APP_URL || 'https://app.flexcrm.com.ar'}/admin?token=${token}`;
    const { sendEmail, getRemitente } = require('../lib/send-email');
    const html = `<div style="font-family:sans-serif;padding:20px"><h2>Restablecer contraseña</h2><p>Recibiste este email porque solicitaste restablecer tu contraseña de superadmin en FlexCRM.</p><p><a href="${resetLink}" style="display:inline-block;padding:12px 32px;background:#F97316;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px">Restablecer contraseña</a></p><p style="color:#64748b;font-size:12px">Este enlace expira en 1 hora. Si no solicitaste este cambio, ignorá este mensaje.</p></div>`;
    try {
      await sendEmail(smtpHost, smtpPort, smtpUser, smtpPass, `"${smtpFromName}" <${smtpFrom}>`, userEmail, 'Restablecer contraseña — FlexCRM SuperAdmin', html);
      saAudit(sa.id, 'forgot_password', null, 'Token enviado a ' + userEmail);
    } catch(e) {
      console.error('[SA] Error enviando email forgot-password:', e.message);
    }
  } else {
    console.warn('[SA] SMTP global no configurado — token de reset NO enviado por email.');
  }
  res.json({ ok: true, mensaje: 'Si la cuenta existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.' });
});

// ── Superadmin reset-password ──
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token y contraseña requeridos' });
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un símbolo' });
  const crypto = require('crypto');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const admins = master.prepare("SELECT * FROM superadmin WHERE activo=1").all();
  let found = null;
  for (const sa of admins) {
    let data = {};
    try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
    if (data.reset_token === hashedToken && data.reset_token_expires && new Date(data.reset_token_expires) > new Date()) {
      found = sa;
      break;
    }
  }
  if (!found) return res.status(400).json({ error: 'Token inválido o expirado' });
  // Check password history
  let data = {};
  try { data = JSON.parse(found.data || '{}'); } catch(e) {}
  const history = data.password_history || [];
  for (const oldHash of history) {
    if (await bcrypt.compare(password, oldHash)) {
      return res.status(400).json({ error: 'No podés usar una contraseña reciente.' });
    }
  }
  history.push(found.password);
  if (history.length > 5) history.shift();
  data.password_history = history;
  delete data.reset_token;
  delete data.reset_token_expires;
  master.prepare("UPDATE superadmin SET password=?, data=?, must_change_password=0 WHERE id=?")
    .run(bcrypt.hashSync(password, 10), JSON.stringify(data), found.id);
  saAudit(found.id, 'reset_password', null, 'Contraseña restablecida vía token');
  res.json({ ok: true, mensaje: 'Contraseña restablecida correctamente' });
});

// ══════════════════════════════════════
// RUBROS ATRIBUTOS (atributos dinámicos por rubro)
// ══════════════════════════════════════
router.get('/rubros-atributos', superAuth, (req, res) => {
  const rubro = req.query.rubro;
  if (rubro) return res.json(getRubroAtributos(rubro));
  res.json(getAllRubrosAtributos());
});

router.post('/rubros-atributos', superAuth, (req, res) => {
  const { rubro, atributo_key, atributo_label, tipo, opciones, orden } = req.body;
  if (!rubro || !atributo_key || !atributo_label) return res.status(400).json({ error: 'Rubro, key y label requeridos' });
  const id = createRubroAtributo({ rubro, atributo_key, atributo_label, tipo, opciones, orden });
  saAudit(req.sadmin.id, 'crear_atributo_rubro', null, `Atributo ${atributo_key} para rubro ${rubro}`);
  res.json({ id, ok: true });
});

router.put('/rubros-atributos/:id', superAuth, (req, res) => {
  const { rubro, atributo_key, atributo_label, tipo, opciones, orden, activo } = req.body;
  updateRubroAtributo(req.params.id, { rubro, atributo_key, atributo_label, tipo, opciones, orden, activo });
  saAudit(req.sadmin.id, 'editar_atributo_rubro', null, `Atributo ${req.params.id}`);
  res.json({ ok: true });
});

// ══════════════════════════════════════
// APPS (ecosistema)
// ══════════════════════════════════════

// ── Catálogo: listar todas las apps ──
router.get('/apps', superAuth, (req, res) => {
  try {
    const categoria = req.query.categoria || null;
    const apps = getAppsDisponibles(categoria);
    res.json(apps);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Catálogo: crear/actualizar app ──
router.post('/apps', superAuth, (req, res) => {
  try {
    const { slug, nombre, version, descripcion, descripcion_larga, categoria, icono,
            screenshots, precio_base, periodicidad, precio_mensual, precio_anual, trial_dias,
            modulos_requeridos, roles_permitidos, activa, autor, tags, orden, data } = req.body;
    if (!slug || !nombre || !version) return res.status(400).json({ error: 'slug, nombre y version requeridos' });
    upsertAppDisponible({
      slug, nombre, version, descripcion: descripcion || '', descripcion_larga: descripcion_larga || '',
      categoria: categoria || 'general', icono: icono || '📦',
      screenshots: screenshots || [], precio_base: precio_base || 0,
      periodicidad: periodicidad || 'unico', precio_mensual: precio_mensual || 0,
      precio_anual: precio_anual || 0, trial_dias: trial_dias || 0,
      modulos_requeridos: modulos_requeridos || [],
      roles_permitidos: roles_permitidos || [],
      activa: activa !== false, autor: autor || 'FlexCRM',
      tags: tags || [], orden: orden || 99, data: data || {},
    });
    saAudit(req.sadmin.id, 'app_upsert', null, `App: ${nombre} (${slug})`);
    res.json({ ok: true, slug });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Catálogo: actualizar app ──
router.put('/apps/:slug', superAuth, (req, res) => {
  try {
    const existing = getAppDisponible(req.params.slug);
    if (!existing) return res.status(404).json({ error: 'App no encontrada' });
    const data = { ...existing, ...req.body };
    upsertAppDisponible(data);
    saAudit(req.sadmin.id, 'app_update', null, `App actualizada: ${req.params.slug}`);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Instalaciones: listar todas (cross-empresa) ──
router.get('/apps/instaladas', superAuth, (req, res) => {
  try {
    const empresaId = req.query.empresa_id || null;
    if (empresaId) {
      const inst = getAppsInstaladas(empresaId);
      const enriched = inst.map(i => {
        const app = getAppDisponible(i.app_slug);
        return { ...i, app_nombre: app?.nombre || i.app_slug, app_icono: app?.icono || '📦', app_categoria: app?.categoria || 'general' };
      });
      return res.json(enriched);
    }
    // Todas las instalaciones
    const all = master.prepare(`
      SELECT ai.*, e.nombre as empresa_nombre, e.codigo as empresa_codigo,
             ad.nombre as app_nombre, ad.icono as app_icono, ad.categoria as app_categoria
      FROM apps_instaladas ai
      JOIN empresas e ON e.id = ai.empresa_id
      LEFT JOIN apps_disponibles ad ON ad.slug = ai.app_slug
      ORDER BY ai.fecha_instalacion DESC
    `).all();
    res.json(all);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Instalar app en una empresa (forzado desde superadmin) ──
router.post('/apps/instalar', superAuth, (req, res) => {
  try {
    const { empresa_id, app_slug } = req.body;
    if (!empresa_id || !app_slug) return res.status(400).json({ error: 'empresa_id y app_slug requeridos' });

    const app = getAppDisponible(app_slug);
    if (!app) return res.status(404).json({ error: 'App no encontrada en el catálogo' });
    if (!app.activa) return res.status(400).json({ error: 'App no disponible (inactiva)' });

    const empresa = master.prepare("SELECT * FROM empresas WHERE id=?").get(empresa_id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    installApp(empresa_id, app_slug, app.id, app.version);
    logAppEvent(empresa_id, app_slug, 'installed', null, app.version, req.sadmin.usuario);
    saAudit(req.sadmin.id, 'app_instalar', empresa_id, `App ${app_slug} instalada en ${empresa.nombre}`);

    // Limpiar caché
    try {
      const appLoader = require('../lib/app-loader');
      appLoader.clearTenantCache(empresa.codigo, app_slug);
    } catch(e) {}

    res.json({ ok: true, mensaje: `App "${app.nombre}" instalada en ${empresa.nombre}.` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Desinstalar app de una empresa ──
router.delete('/apps/instaladas/:id', superAuth, (req, res) => {
  try {
    const inst = master.prepare("SELECT * FROM apps_instaladas WHERE id=?").get(req.params.id);
    if (!inst) return res.status(404).json({ error: 'Instalación no encontrada' });

    const empresa = master.prepare("SELECT * FROM empresas WHERE id=?").get(inst.empresa_id);
    const app = getAppDisponible(inst.app_slug);

    uninstallApp(inst.empresa_id, inst.app_slug);
    logAppEvent(inst.empresa_id, inst.app_slug, 'uninstalled', inst.version_instalada, null, req.sadmin.usuario);
    saAudit(req.sadmin.id, 'app_desinstalar', inst.empresa_id,
      `App ${inst.app_slug} desinstalada de ${empresa?.nombre || inst.empresa_id}`);

    if (empresa) {
      try {
        const appLoader = require('../lib/app-loader');
        appLoader.clearTenantCache(empresa.codigo, inst.app_slug);
      } catch(e) {}
    }

    res.json({ ok: true, mensaje: 'App desinstalada.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Activar/desactivar app en empresa ──
router.put('/apps/instaladas/:id/status', superAuth, (req, res) => {
  try {
    const { activa } = req.body;
    const inst = master.prepare("SELECT * FROM apps_instaladas WHERE id=?").get(req.params.id);
    if (!inst) return res.status(404).json({ error: 'Instalación no encontrada' });

    updateAppStatus(inst.empresa_id, inst.app_slug, activa ? 1 : 0);
    logAppEvent(inst.empresa_id, inst.app_slug, activa ? 'activated' : 'deactivated', null, null, req.sadmin.usuario);

    if (!activa) {
      const empresa = master.prepare("SELECT codigo FROM empresas WHERE id=?").get(inst.empresa_id);
      if (empresa) {
        try {
          const appLoader = require('../lib/app-loader');
          appLoader.clearTenantCache(empresa.codigo, inst.app_slug);
        } catch(e) {}
      }
    }

    res.json({ ok: true, activa: !!activa });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Stats de apps ──
router.get('/apps/stats', superAuth, (req, res) => {
  try {
    const stats = getAppStats();
    // Enriquecer con nombres
    stats.porApp = stats.porApp.map(a => {
      const app = getAppDisponible(a.app_slug);
      return { ...a, nombre: app?.nombre || a.app_slug, icono: app?.icono || '📦' };
    });
    res.json(stats);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Liste app registradas en el loader ──
router.get('/apps/registradas', superAuth, (req, res) => {
  try {
    const appLoader = require('../lib/app-loader');
    res.json(appLoader.getRegisteredApps());
  } catch(e) { res.json([]); }
});

// ══════════════════════════════════════
// BACKUP GLOBAL
// ══════════════════════════════════════
router.post('/backup/download', superAuth, (req, res) => {
  try {
    const { makeFullBackup } = require('./backup');
    const result = makeFullBackup();
    saAudit(req.sadmin.id, 'backup_global', null, `Backup: ${result.name} — ${(result.size/1024).toFixed(1)}KB`);
    res.download(result.path, result.name);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════
// MANTENIMIENTO
// ══════════════════════════════════════
router.get('/mantenimiento', superAuth, (req, res) => {
  res.json(getMantenimientoItems());
});

router.post('/mantenimiento', superAuth, (req, res) => {
  const { tipo, nombre, descripcion, fecha_vencimiento, proveedor, url, notas } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const id = createMantenimientoItem({ tipo, nombre, descripcion, fecha_vencimiento, proveedor, url, notas });
  saAudit(req.sadmin.id, 'crear_mantenimiento', null, `Item: ${nombre}`);
  res.json({ id, ok: true });
});

router.put('/mantenimiento/:id', superAuth, (req, res) => {
  const { tipo, nombre, descripcion, fecha_vencimiento, proveedor, url, notas, estado } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  updateMantenimientoItem(req.params.id, { tipo, nombre, descripcion, fecha_vencimiento, proveedor, url, notas, estado });
  saAudit(req.sadmin.id, 'editar_mantenimiento', null, `Item: ${nombre}`);
  res.json({ ok: true });
});

router.delete('/mantenimiento/:id', superAuth, (req, res) => {
  deleteMantenimientoItem(req.params.id);
  saAudit(req.sadmin.id, 'eliminar_mantenimiento', null, `Item: ${req.params.id}`);
  res.json({ ok: true });
});

// ── Legal / Cumplimiento ──

// GET /api/superadmin/legal/versiones — historial de versiones
router.get('/legal/versiones', superAuth, (req, res) => {
  const { getAllVersiones, getVersionVigente } = require('../db_master');
  const tipo = req.query.tipo || null;
  const versiones = getAllVersiones(tipo);
  const vigentes = {};
  ['terminos','privacidad','cookies'].forEach(t => {
    const v = getVersionVigente(t);
    vigentes[t] = v ? v.version : null;
  });
  res.json({ versiones, vigentes });
});

// POST /api/superadmin/legal/subir — subir nueva versión de texto legal
router.post('/legal/subir', superAuth, (req, res) => {
  const { tipo, version, contenido } = req.body;
  if (!tipo || !version || !contenido) return res.status(400).json({ error: 'tipo, version y contenido requeridos' });
  if (!['terminos','privacidad','cookies'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido. Usar: terminos, privacidad, cookies' });
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(contenido).digest('hex');
  const { setVersionVigente } = require('../db_master');
  const id = setVersionVigente(tipo, version, hash, req.sadmin.id);
  saAudit(req.sadmin.id, 'legal_nueva_version', null,
    `Nueva versión ${version} de ${tipo} — vigente desde ${new Date().toISOString()}`);
  // Notify all active companies
  try {
    const tipoLabel = tipo === 'terminos' ? 'Términos y Condiciones' : tipo === 'privacidad' ? 'Política de Privacidad' : 'Política de Cookies';
    const empresas = getEmpresas().filter(e => e.activo === 1);
    const ahora = new Date().toISOString();
    const stmt = master.prepare(
      "INSERT INTO notificaciones (id, empresa_codigo, tipo, titulo, mensaje, creado, data) VALUES (?,?,?,?,?,?,?)"
    );
    for (const e of empresas) {
      stmt.run('notif_' + Date.now() + '_' + e.codigo, e.codigo, 'nuevos_terminos',
        `📄 Nuevos ${tipoLabel} v${version}`,
        `Hay una nueva versión de los ${tipoLabel.toLowerCase()}. El administrador debe aceptarlos para seguir usando FlexCRM.`,
        ahora, JSON.stringify({ accion: '/micuenta' }));
    }
    // Send email to each company admin
    const appUrl = process.env.APP_URL || 'https://app.flexcrm.com.ar';
    const { sendEmail, getNotificationSMTP, buildNotificationHtml } = require('../lib/send-email');
    const smtp = getNotificationSMTP();
    if (smtp.host && smtp.user && smtp.pass) {
      const subject = `📄 Nuevos ${tipoLabel} v${version} — FlexCRM`;
      const html = buildNotificationHtml(
        `${tipoLabel} v${version}`,
        `Se publicó una nueva versión de los ${tipoLabel.toLowerCase()} que tu empresa debe aceptar. Ingresá como administrador a FlexCRM para revisarlos y firmarlos.`,
        `Empresa: Todas las activas\nVersión: ${version}\nFecha: ${new Date().toLocaleDateString('es-AR')}`,
        appUrl + '/app/login'
      );
      for (const e of empresas) {
        if (!e.admin_email) continue;
        sendEmail(smtp.host, smtp.port, smtp.user, smtp.pass, smtp.from, e.admin_email, subject, html)
          .then(() => console.log('[LegalEmail] Enviado a:', e.admin_email))
          .catch(err => console.error('[LegalEmail] Error enviando a', e.admin_email, err.message));
      }
    }
  } catch(e) { /* non-blocking */ }
  res.json({ id, ok: true, mensaje: `Versión ${version} de ${tipo} publicada como vigente.` });
});

// GET /api/superadmin/legal/estado — estado de consentimientos por empresa
router.get('/legal/estado', superAuth, (req, res) => {
  try {
    const { getEmpresas, getConsentimientoEstado } = require('../db_master');
    const empresas = getEmpresas().filter(e => e.activo === 1);
    const tipos = ['terminos', 'privacidad'];
    const estado = empresas.map(e => ({
      codigo: e.codigo,
      nombre: e.nombre,
      admin_email: e.admin_email,
      estado: getConsentimientoEstado(e.codigo, tipos)
    }));
    res.json({ empresas: estado });
  } catch(e) {
    console.error('[LegalEstado] Error:', e.message);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

// GET /api/superadmin/legal/auditoria — log de acciones legales
router.get('/legal/auditoria', superAuth, (req, res) => {
  try {
    const empresa = req.query.empresa || null;
    let rows;
    if (empresa) {
      rows = master.prepare(
        "SELECT * FROM sa_audit_log WHERE (accion LIKE 'legal_%' OR accion LIKE 'consentimiento_%' OR accion = 'nueva_version_legal' OR accion LIKE '%_oposicion' OR accion = 'cuenta_activada') AND empresa_id LIKE ? ORDER BY fecha DESC LIMIT 200"
      ).all('%' + empresa + '%');
    } else {
      rows = master.prepare(
        "SELECT * FROM sa_audit_log WHERE accion LIKE 'legal_%' OR accion LIKE 'consentimiento_%' OR accion = 'nueva_version_legal' OR accion LIKE '%_oposicion' OR accion = 'cuenta_activada' ORDER BY fecha DESC LIMIT 200"
      ).all();
    }
    res.json({ auditoria: rows });
  } catch(e) {
    console.error('[LegalAuditoria] Error:', e.message);
    res.status(500).json({ error: 'Error al obtener auditoría' });
  }
});

// ── Notificaciones ──

// POST /api/superadmin/notificaciones — enviar notificación manual
router.post('/notificaciones', superAuth, (req, res) => {
  try {
    const { empresa_codigo, tipo, titulo, mensaje, data } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Título requerido' });
    const id = 'notif_' + Date.now();
    const ahora = new Date().toISOString();
    const empresas = empresa_codigo === '*' || !empresa_codigo
      ? getEmpresas().filter(e => e.activo === 1).map(e => e.codigo)
      : [empresa_codigo];
    let count = 0;
    const stmt = master.prepare(
      "INSERT INTO notificaciones (id, empresa_codigo, tipo, titulo, mensaje, leida, creado, data) VALUES (?,?,?,?,?,0,?,?)"
    );
    for (const cod of empresas) {
      const nid = id + '_' + cod;
      stmt.run(nid, cod, tipo || 'manual', titulo, mensaje || '', ahora, JSON.stringify(data || {}));
      count++;
    }
    saAudit(req.sadmin.id, 'enviar_notificacion', null,
      `Notificación enviada: "${titulo}" a ${count} empresa(s)`);
    res.json({ ok: true, enviadas: count });
  } catch(e) {
    console.error('[Notif] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/superadmin/notificaciones — historial de notificaciones enviadas
router.get('/notificaciones', superAuth, (req, res) => {
  try {
    const empresa = req.query.empresa || null;
    let rows;
    if (empresa) {
      rows = master.prepare("SELECT * FROM notificaciones WHERE empresa_codigo=? ORDER BY creado DESC LIMIT 100").all(empresa);
    } else {
      rows = master.prepare("SELECT * FROM notificaciones ORDER BY creado DESC LIMIT 200").all();
    }
    res.json({ notificaciones: rows });
  } catch(e) {
    res.json({ notificaciones: [] });
  }
});

module.exports = router;
