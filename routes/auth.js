const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol, getSecret } = require('../middleware/auth');
const { validate, loginSchema, createUserSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } = require('../middleware/validate');

// ── Login lockout (persistente en SQLite) ──
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LOCKOUT_MINUTES = 15;
const ACCESS_TOKEN_EXPIRY = '24h';
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000;
const MAX_CONCURRENT_SESSIONS = 5;
const { getIp } = require('../lib/suspicious-activity');
const suspicious = require('../lib/suspicious-activity');

function getLockoutConfig(db) {
  try {
    const cfg = db.getConfig();
    return {
      maxAttempts: parseInt(cfg.login_max_intentos) || DEFAULT_MAX_ATTEMPTS,
      lockoutMinutes: parseInt(cfg.login_bloqueo_minutos) || DEFAULT_LOCKOUT_MINUTES,
    };
  } catch { return { maxAttempts: DEFAULT_MAX_ATTEMPTS, lockoutMinutes: DEFAULT_LOCKOUT_MINUTES }; }
}

function progressiveDelay(attemptCount) {
  if (attemptCount <= 1) return 0;
  const delayMs = Math.min(1000 * Math.pow(2, attemptCount - 1), 8000);
  return delayMs;
}

function getLoginDB(req) {
  return _getDB(req);
}

function getLoginKey(empresa, usuario) {
  return `${empresa}:${usuario.toLowerCase().trim()}`;
}

function checkLocked(db, key) {
  const row = db.raw.prepare("SELECT locked_until FROM login_attempts WHERE key=?").get(key);
  if (!row || !row.locked_until) return false;
  if (new Date(row.locked_until) > new Date()) return true;
  db.raw.prepare("DELETE FROM login_attempts WHERE key=?").run(key);
  return false;
}

function recordFailedAttempt(db, key) {
  const { maxAttempts, lockoutMinutes } = getLockoutConfig(db);
  const now = new Date();
  const row = db.raw.prepare("SELECT count, locked_until FROM login_attempts WHERE key=?").get(key);
  let count = row ? row.count + 1 : 1;
  let lockedUntil = null;
  if (count >= maxAttempts) {
    lockedUntil = new Date(now.getTime() + lockoutMinutes * 60000).toISOString();
  }
  if (row) {
    db.raw.prepare("UPDATE login_attempts SET count=?, last_attempt=?, locked_until=? WHERE key=?")
      .run(count, now.toISOString(), lockedUntil, key);
  } else {
    db.raw.prepare("INSERT INTO login_attempts(key,count,last_attempt,locked_until) VALUES(?,?,?,?)")
      .run(key, count, now.toISOString(), lockedUntil);
  }
  return maxAttempts - count;
}

function resetAttempts(db, key) {
  db.raw.prepare("DELETE FROM login_attempts WHERE key=?").run(key);
}

function sucursalesPermitidas(user) {
  if (!user) return [];
  if (user.rol === 'admin' || (Array.isArray(user.roles) && user.roles.includes('admin'))) return null; // null = todas
  let permitidas = user.suc_sesiones_permitidas;
  if (typeof permitidas === 'string') { try { permitidas = JSON.parse(permitidas); } catch { permitidas = []; } }
  if (Array.isArray(permitidas) && permitidas.length) return permitidas.map(String);
  return user.suc_id ? [String(user.suc_id)] : [];
}

function findVendedorForUser(user, userDB) {
  if (!user.roles) user.roles = [user.rol];
  const vends = userDB.all('vendedores');
  let v = vends.find(v => v.usuario_id === user.id);
  if (!v && user.email) v = vends.find(v => v.email && v.email === user.email);
  if (!v && user.usuario) v = vends.find(v => v.usuario === user.usuario);
  if (!v) {
    // Fallback por nombre: solo dentro de las sucursales permitidas (evita homónimos cruzados)
    const permitidas = sucursalesPermitidas(user);
    const candidates = vends.filter(v => (v.nombre + ' ' + v.apellido).toLowerCase() === user.nombre.toLowerCase());
    if (permitidas === null) v = candidates[0];
    else v = candidates.find(v => v.suc_id && permitidas.includes(String(v.suc_id)));
  }
  if (!v && user.suc_id) v = vends.find(v => v.suc_id === user.suc_id && v.activo !== false);
  return v || null;
}

function buildLoginResponse(user, token, refreshToken, empresaDB, sessionId) {
  const userDB = empresaDB || db;
  const { password: _, ...userData } = user;
  if (sessionId) userData.session_id = sessionId;
  if (!userData.roles) userData.roles = [userData.rol];
  if (!userData.roles) userData.roles = [userData.rol];
  if (!Array.isArray(userData.suc_sesiones_permitidas)) {
    try { userData.suc_sesiones_permitidas = JSON.parse(userData.suc_sesiones_permitidas || '[]'); }
    catch(e) { userData.suc_sesiones_permitidas = userData.suc_id ? [userData.suc_id] : []; }
  }
  const suc = user.suc_id ? userDB.findOne('sucursales', user.suc_id) : null;
  const vendedor = findVendedorForUser(user, userDB);
  userData.vendedor_id = vendedor?.id || null;
  userData.vendedor_nombre = vendedor ? (vendedor.nombre + ' ' + vendedor.apellido) : userData.nombre;
  return { user: userData, sucursal: suc, vendedor };
}

function generateTokens(user, empresa, sid) {
  const payload = { id: user.id, rol: user.rol, empresa: empresa };
  if (sid) payload.sid = sid;
  const accessToken = jwt.sign(payload, getSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = crypto.randomBytes(40).toString('hex');
  return { accessToken, refreshToken };
}

function createSessionRecord(userDB, userId, refreshHash, req) {
  const sid = 'sid_' + require('../db_sqlite').uid();
  const clientIP = getIp(req) || '';
  const clientUA = (req.headers['user-agent'] || '').substring(0, 200);
  userDB.raw.prepare("INSERT INTO user_sessions(id, usuario_id, token_hash, ip, user_agent, creado, ultimo_acceso, activo) VALUES(?,?,?,?,?,?,?,1)")
    .run(sid, userId, refreshHash, clientIP, clientUA, new Date().toISOString(), new Date().toISOString());
  return sid;
}

function updateSessionToken(userDB, sid, newRefreshHash) {
  try {
    userDB.raw.prepare("UPDATE user_sessions SET token_hash=?, ultimo_acceso=? WHERE id=?").run(newRefreshHash, new Date().toISOString(), sid);
  } catch(e) {}
}

function setRefreshCookie(res, token) {
  res.cookie('refresh-token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_EXPIRY,
  });
}

function setAccessCookie(res, token) {
  res.cookie('access-token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

function enforceSessionLimit(db, userId) {
  try {
    const active = db.raw.prepare(
      "SELECT id FROM user_sessions WHERE usuario_id=? AND activo=1 ORDER BY creado ASC"
    ).all(userId);
    if (active.length >= MAX_CONCURRENT_SESSIONS) {
      const toRevoke = active.slice(0, active.length - MAX_CONCURRENT_SESSIONS + 1);
      const stmt = db.raw.prepare("UPDATE user_sessions SET activo=0 WHERE id=?");
      toRevoke.forEach(r => stmt.run(r.id));
      // Also mark corresponding refresh tokens
      const rtStmt = db.raw.prepare("UPDATE password_reset_tokens SET usado=1 WHERE usuario_id=? AND id LIKE 'rt_%' AND usado=0");
      rtStmt.run(userId);
    }
  } catch(e) { /* non-blocking */ }
}

// ── Login IP rate limiter ──
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Demasiados intentos desde esta IP. Esperá 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => require('../lib/suspicious-activity').getIp(req),
});

// POST /api/auth/login
router.post('/login', loginIpLimiter, validate(loginSchema), async (req, res) => {
  const { usuario, password, empresa } = req.body;
  const { getEmpresaDB } = require('../db_sqlite');

  // Validate empresa exists in master before touching tenant DB
  let empresaMeta = null;
  try {
    const { getEmpresa } = require('../db_master');
    empresaMeta = getEmpresa(empresa);
  } catch(e) {}
  if (!empresaMeta || !empresaMeta.activo) {
    await bcrypt.compare(password, '$2a$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX').catch(()=>{});
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  const userDB = getEmpresaDB(empresa);
  const lockKey = getLoginKey(empresa, usuario);

  if (checkLocked(userDB, lockKey)) {
    const { lockoutMinutes } = getLockoutConfig(userDB);
    userDB.audit(null, null, 'auth', 'login_locked', 'Cuenta bloqueada por múltiples intentos fallidos', null, suspicious.buildExtra(req, { empresa, usuario, lockKey }))
    return res.status(429).json({
      error: `Demasiados intentos. Esperá ${lockoutMinutes} minutos antes de intentar de nuevo.`,
      locked: true, locked_minutes: lockoutMinutes
    });
  }

  const user = userDB.where('usuarios', u => (u.usuario === usuario || u.email === usuario) && u.activo)[0];
  if (!user) {
    // Dummy bcrypt compare to prevent user enumeration via timing
    await bcrypt.compare(password, '$2a$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX').catch(()=>{});
    const remaining = recordFailedAttempt(userDB, lockKey);
    const { maxAttempts } = getLockoutConfig(userDB);
    const attempts = maxAttempts - remaining;
    suspicious.auditLoginFailed(req, userDB, empresa, usuario, attempts);
    await new Promise(r => setTimeout(r, progressiveDelay(attempts)));
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    const remaining = recordFailedAttempt(userDB, lockKey);
    const { maxAttempts, lockoutMinutes } = getLockoutConfig(userDB);
    const attempts = maxAttempts - remaining;
    suspicious.auditLoginFailed(req, userDB, empresa, usuario, attempts);
    await new Promise(r => setTimeout(r, progressiveDelay(attempts)));
    if (remaining <= 0) {
      return res.status(429).json({
        error: `Demasiados intentos. Esperá ${lockoutMinutes} minutos antes de intentar de nuevo.`,
        locked: true, locked_minutes: lockoutMinutes
      });
    }
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  resetAttempts(userDB, lockKey);
  suspicious.auditLoginSuccess(req, userDB, user)

  // Check email verification — do not reveal account existence at first, but once authed, surface the state
  if (user.email_verificado === 0 || user.email_verificado === false) {
    // Diagnostic: log cuantos usuarios comparten este email en la DB (detecta duplicados por re-entry)
    try {
      const sameEmailCount = userDB.raw.prepare("SELECT COUNT(*) as n FROM usuarios WHERE email=? AND activo=1").get(user.email);
      console.log('[Login] usuario '+(user.usuario||'')+' ('+user.email+') mail sin verificar, count duplicados email: '+sameEmailCount.n);
    } catch(e) {}
    // Silently resend verification email
    try {
      const verToken = crypto.randomBytes(20).toString('hex');
      const verTokenHash = crypto.createHash('sha256').update(verToken).digest('hex');
      userDB.raw.prepare("UPDATE email_tokens SET usado=1 WHERE usuario_id=?").run(user.id);
      userDB.insert('email_tokens', { id: 'vet_'+Date.now(), usuario_id: user.id, email: user.email, token_hash: verTokenHash, expires: new Date(Date.now()+24*3600000).toISOString(), usado: 0, creado: new Date().toISOString() });
      const cfg = userDB.getConfig();
      const { getGlobalConfig } = require('../db_master');
      const { decryptValue } = require('../lib/crypto-utils');
      let h = cfg.smtp_host, p = parseInt(cfg.smtp_port)||465, u = cfg.smtp_user, pass = cfg.smtp_pass, from = cfg.smtp_from;
      if (!h || !u || !pass) { h = getGlobalConfig('smtp_host'); p = parseInt(getGlobalConfig('smtp_port'))||465; u = getGlobalConfig('smtp_user'); pass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : ''; from = getGlobalConfig('smtp_from')||u||''; }
      if (h && u && pass) {
        const { getRemitente } = require('../lib/send-email');
        const fromName = getRemitente().fromName;
        const appUrl = process.env.APP_URL || 'https://app.flexcrm.com.ar';
        const tutorialesUrl = process.env.TUTORIALES_URL || `${appUrl}/tutoriales`;
        const { sendEmail } = require('../lib/send-email');
        const { verificationEmail } = require('../lib/email-templates');
        await sendEmail(h, p, u, pass, `"${fromName}" <${from}>`, user.email, 'Verificá tu email y empezá — FlexCRM', verificationEmail(cfg.nombre || empresa, empresa, user.usuario || '', appUrl+'/api/auth/verify-email/'+verToken, appUrl, tutorialesUrl)).catch(()=>{});
      }
    } catch(e) {}
    await new Promise(r => setTimeout(r, progressiveDelay(1)));
    return res.status(401).json({ error: 'Revisá tu email y verificá tu cuenta antes de ingresar.', email_pendiente: true });
  }

  if (user.must_change_password) {
    const tempToken = jwt.sign(
      { id: user.id, purpose: 'change_password', empresa },
      getSecret(),
      { expiresIn: '15m' }
    );
    return res.json({ require_password_change: true, temp_token: tempToken, user: { nombre: user.nombre, email: user.email || '' } });
  }

  // IP restriction check
  try {
    const cfg = userDB.getConfig();
    if (cfg.login_ip_restriccion === '1' || cfg.login_ip_restriccion === 1 || cfg.login_ip_restriccion === true) {
      const ipList = (() => { try { return JSON.parse(cfg.login_ips_autorizadas || '[]'); } catch { return []; } })();
      if (Array.isArray(ipList) && ipList.length > 0) {
        const clientIP = (getIp(req) || '').replace(/^::ffff:/, '');
        const { ipInList } = require('../lib/ip-utils');
        if (!ipInList(clientIP, ipList)) {
          userDB.audit(user, null, 'auth', 'login_ip_denegada', 'IP no autorizada: ' + clientIP, user.id, { ip: clientIP });
          await new Promise(r => setTimeout(r, progressiveDelay(1)));
          return res.status(401).json({ error: 'No podés ingresar desde esta conexión.' });
        }
      }
    }
  } catch(e) { /* non-blocking */ }

  try {
    const allSucsRaw = userDB.find('sucursales', {});
    const sucsActivas = allSucsRaw.filter(function(s){ return s.activo !== false && s.activo !== 0; });
    if (sucsActivas.length === 0) {
      const cfgNombre = userDB.getConfig('nombre') || empresa;
      const newId = uid();
      userDB.insert('sucursales', { id: newId, nombre: cfgNombre, dir: '', activo: true, creado: new Date().toISOString() });
    }
  } catch(e) { /* non-blocking */ }

  // Check if user has 2FA enabled
  const { is2faMandatory } = require('./auth-2fa');
  const twofaRow = userDB.raw.prepare("SELECT enabled FROM user_2fa WHERE user_id=? AND enabled=1").get(user.id);
  if (twofaRow) {
    const tempToken = jwt.sign(
      { id: user.id, purpose: '2fa', empresa },
      getSecret(),
      { expiresIn: '5m' }
    );
    return res.json({ require_2fa: true, temp_token: tempToken, user: { nombre: user.nombre, email: user.email || '' } });
  }

  // 2FA mandatory but user hasn't set it up yet
  if (is2faMandatory(user, userDB)) {
    const tempToken = jwt.sign(
      { id: user.id, purpose: '2fa_setup', empresa },
      getSecret(),
      { expiresIn: '15m' }
    );
    return res.json({ require_2fa_setup: true, temp_token: tempToken, empresa, user: { nombre: user.nombre, email: user.email || '' } });
  }

  // ── Consent check (per-empresa, admin-only) ──
  try {
    const { getVersionesVigentes, checkConsentimientoEmpresa, isInGracePeriod, getGraceDaysLeft } = require('../lib/legal-versions');
    const versionesVigentes = getVersionesVigentes();
    const tiposLegales = ['terminos', 'privacidad'];
    const missingConsent = [];
    let gracePeriodActive = true;
    let minGraceDays = 999;
    for (const tipo of tiposLegales) {
      const v = versionesVigentes[tipo];
      if (!v) continue;
      const aceptado = checkConsentimientoEmpresa(userDB, empresa, tipo, v);
      if (!aceptado) {
        missingConsent.push(tipo);
        const { getVersionVigente } = require('../db_master');
        const vigente = getVersionVigente(tipo);
        if (vigente && !isInGracePeriod(vigente.vigente_desde)) {
          gracePeriodActive = false;
        }
        const gd = vigente ? getGraceDaysLeft(vigente.vigente_desde) : 0;
        if (gd < minGraceDays) minGraceDays = gd;
      }
    }
    if (missingConsent.length > 0) {
      if (user.rol !== 'admin') {
        return res.status(403).json({ consent_pending: true, error: 'Tu administrador aún no aceptó los términos legales. Contactá al administrador de la empresa.' });
      }
      if (gracePeriodActive) {
        const msg = 'Hay documentos legales pendientes de aceptación. Tenés ' + minGraceDays + ' día(s) para aceptarlos antes de que se bloquee el acceso.';
        console.log('[Consent] Grace period: empresa=' + empresa + ' admin=' + user.email + ' días=' + minGraceDays);
      }
      const tempToken = jwt.sign(
        { id: user.id, rol: user.rol, empresa, purpose: 'consent', email: user.email || '' },
        getSecret(),
        { expiresIn: '10m' }
      );
      const empresaNombre = userDB.getConfig('nombre') || empresa;
      return res.json({
        require_consent: true,
        grace_period: gracePeriodActive,
        grace_days: gracePeriodActive ? minGraceDays : 0,
        skip_allowed: gracePeriodActive,
        temp_token: tempToken,
        versiones: { terminos: versionesVigentes.terminos, privacidad: versionesVigentes.privacidad },
        empresa_nombre: empresaNombre,
        user: { nombre: user.nombre, email: user.email || '', rol: user.rol }
      });
    }
  } catch(e) {
    console.error('[Consent] Error en check — ignorando:', e.message);
  }

  const { accessToken, refreshToken } = generateTokens(user, empresa);

  enforceSessionLimit(userDB, user.id);

  // Store refresh token hash in DB
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  userDB.insert('password_reset_tokens', {
    id: 'rt_' + uid(),
    usuario_id: user.id,
    email: user.email || '',
    token: refreshHash,
    expires: new Date(Date.now() + REFRESH_TOKEN_EXPIRY).toISOString(),
    usado: 0,
    creado: new Date().toISOString(),
  });

  // Create session record
  let sid = null;
  try { sid = createSessionRecord(userDB, user.id, refreshHash, req); } catch(e) { console.error('[Session] createSessionRecord failed:', e.message); }
  // Re-issue token with sid if available
  const finalPayload = { id: user.id, rol: user.rol, empresa: empresa };
  if (sid) finalPayload.sid = sid;
  const finalAccessToken = jwt.sign(finalPayload, getSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });

  setRefreshCookie(res, refreshToken);
  setAccessCookie(res, finalAccessToken);
  res.json(buildLoginResponse(user, finalAccessToken, refreshToken, userDB, sid));
});

// ── POST /api/auth/aceptar-terminos ──
router.post('/aceptar-terminos', async (req, res) => {
  const { temp_token, aceptaciones } = req.body;
  if (!temp_token || !aceptaciones || !Array.isArray(aceptaciones) || aceptaciones.length === 0) {
    return res.status(400).json({ error: 'Token y aceptaciones requeridos' });
  }
  try {
    const payload = jwt.verify(temp_token, getSecret());
    if (payload.purpose !== 'consent') return res.status(400).json({ error: 'Token inválido' });
    if (payload.rol !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede aceptar los términos' });

    const empresa = payload.empresa;
    const { getEmpresaDB } = require('../db_sqlite');
    const userDB = getEmpresaDB(empresa);
    const user = userDB.findOne('usuarios', payload.id);
    if (!user || !user.activo) return res.status(401).json({ error: 'Usuario no válido' });

    const { registrarConsentimiento } = require('../lib/legal-versions');
    const { saAuditExtended } = require('../db_master');

    for (const a of aceptaciones) {
      if (!a.tipo || !a.version) continue;
      registrarConsentimiento(userDB, empresa, a.tipo, a.version, user.id, req);
      saAuditExtended('system', 'consentimiento_aceptado', empresa,
        'Admin ' + (user.email || user.usuario) + ' aceptó ' + a.tipo + ' v' + a.version, { ip: req.ip || '', email: user.email || '' });
      userDB.audit(user, user.suc_id, 'legal', 'aceptar_terminos',
        a.tipo + ' v' + a.version + ' aceptado por ' + (user.nombre || user.usuario), null,
        { ip: req.ip || '', version: a.version });
    }

    // Generate tokens and proceed with login
    const { accessToken, refreshToken } = generateTokens(user, empresa);
    enforceSessionLimit(userDB, user.id);

    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    userDB.insert('password_reset_tokens', {
      id: 'rt_' + uid(), usuario_id: user.id, email: user.email || '',
      token: refreshHash, expires: new Date(Date.now() + REFRESH_TOKEN_EXPIRY).toISOString(),
      usado: 0, creado: new Date().toISOString(),
    });

    setRefreshCookie(res, refreshToken);
    setAccessCookie(res, accessToken);
    res.json(buildLoginResponse(user, accessToken, refreshToken, userDB));
  } catch(e) {
    if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expirado. Volvé a iniciar sesión.' });
    if (e.name === 'JsonWebTokenError') return res.status(400).json({ error: 'Token inválido.' });
    console.error('[AceptarTerminos] Error:', e.message);
    res.status(500).json({ error: 'Error al registrar aceptación' });
  }
});

// ── POST /api/auth/posponer-terminos — admin posterga firma, sigue en grace period ──
router.post('/posponer-terminos', async (req, res) => {
  const { temp_token } = req.body;
  if (!temp_token) return res.status(400).json({ error: 'Token requerido' });
  try {
    const payload = jwt.verify(temp_token, getSecret());
    if (payload.purpose !== 'consent') return res.status(400).json({ error: 'Token inválido' });
    if (payload.rol !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede posponer' });
    const empresa = payload.empresa;
    const { getEmpresaDB } = require('../db_sqlite');
    const userDB = getEmpresaDB(empresa);
    const user = userDB.findOne('usuarios', payload.id);
    if (!user || !user.activo) return res.status(401).json({ error: 'Usuario no válido' });

    const { getVersionesVigentes, registrarConsentimiento } = require('../lib/legal-versions');
    const versiones = getVersionesVigentes();
    for (const tipo of ['terminos', 'privacidad']) {
      if (versiones[tipo]) {
        registrarConsentimiento(userDB, empresa, 'pospuesto-' + tipo, versiones[tipo], payload.id, req);
      }
    }
    const { saAuditExtended } = require('../db_master');
    saAuditExtended('system', 'consentimiento_pospuesto', empresa,
      'Admin ' + (user.email || user.usuario) + ' pospuso aceptación de términos', { ip: req.ip || '' });
    userDB.audit(user, user.suc_id, 'legal', 'posponer_terminos',
      'Admin pospuso firma de documentos legales', null);

    const { accessToken, refreshToken } = generateTokens(user, empresa);
    enforceSessionLimit(userDB, user.id);
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    userDB.insert('password_reset_tokens', {
      id: 'rt_' + uid(), usuario_id: user.id, email: user.email || '',
      token: refreshHash, expires: new Date(Date.now() + REFRESH_TOKEN_EXPIRY).toISOString(),
      usado: 0, creado: new Date().toISOString(),
    });
    setRefreshCookie(res, refreshToken);
    setAccessCookie(res, accessToken);
    res.json(buildLoginResponse(user, accessToken, refreshToken, userDB));
  } catch(e) {
    if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expirado. Volvé a iniciar sesión.' });
    if (e.name === 'JsonWebTokenError') return res.status(400).json({ error: 'Token inválido.' });
    console.error('[PosponerTerminos] Error:', e.message);
    res.status(500).json({ error: 'Error al posponer' });
  }
});

// ── GET /api/auth/activar-cuenta/verify ──
router.get('/activar-cuenta/verify', async (req, res) => {
  const { token, empresa } = req.query;
  if (!token || !empresa) return res.status(400).json({ error: 'Token y empresa requeridos' });
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { getEmpresaDB } = require('../db_sqlite');
    const empDB = /^[a-z0-9_]+$/.test(String(empresa)) ? getEmpresaDB(empresa, { existingOnly: true }) : null;
    if (!empDB) return res.status(400).json({ error: 'Link inválido o ya usado.' });
    const row = empDB.raw.prepare(
      "SELECT et.*, u.email, u.nombre, u.usuario FROM email_tokens et JOIN usuarios u ON u.id = et.usuario_id WHERE et.token_hash=? AND et.usado=0"
    ).get(tokenHash);
    if (!row) return res.status(400).json({ error: 'Link inválido o ya usado.' });
    if (new Date(row.expires) < new Date()) return res.status(400).json({ error: 'Link expirado.' });
    res.json({ ok: true, email: row.email, nombre: row.nombre, usuario: row.usuario, empresa });
  } catch(e) {
    console.error('[ActivarCuentaVerify] Error:', e.message);
    res.status(500).json({ error: 'Error al verificar token' });
  }
});

// ── POST /api/auth/activar-cuenta ──
router.post('/activar-cuenta', async (req, res) => {
  const { token, empresa, password, acepta_terminos, acepta_privacidad } = req.body;
  if (!token || !empresa || !password) return res.status(400).json({ error: 'Token, empresa y contraseña requeridos' });
  if (!acepta_terminos || !acepta_privacidad) return res.status(400).json({ error: 'Debés aceptar los términos y la política de privacidad' });
  const pwErr = require('../lib/password-policy').validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { getEmpresaDB } = require('../db_sqlite');
    const { saAuditExtended } = require('../db_master');
    const empDB = /^[a-z0-9_]+$/.test(String(empresa)) ? getEmpresaDB(empresa, { existingOnly: true }) : null;
    if (!empDB) return res.status(400).json({ error: 'Link inválido o ya usado.' });
    const row = empDB.raw.prepare("SELECT * FROM email_tokens WHERE token_hash=? AND usado=0").get(tokenHash);
    if (!row) return res.status(400).json({ error: 'Link inválido o ya usado.' });
    if (new Date(row.expires) < new Date()) return res.status(400).json({ error: 'Link expirado.' });

    const hash = await bcrypt.hash(password, 10);
    empDB.raw.prepare("UPDATE usuarios SET password=?, email_verificado=1, password_changed_at=? WHERE id=?").run(hash, new Date().toISOString(), row.usuario_id);
    empDB.raw.prepare("UPDATE email_tokens SET usado=1 WHERE id=?").run(row.id);

    // Register consent
    const { registrarConsentimiento, getVersionesVigentes } = require('../lib/legal-versions');
    const versiones = getVersionesVigentes();
    if (acepta_terminos && versiones.terminos) {
      registrarConsentimiento(empDB, empresa, 'terminos', versiones.terminos, row.usuario_id, req);
    }
    if (acepta_privacidad && versiones.privacidad) {
      registrarConsentimiento(empDB, empresa, 'privacidad', versiones.privacidad, row.usuario_id, req);
    }
    saAuditExtended('system', 'cuenta_activada', empresa,
      'Usuario activó su cuenta y aceptó términos para empresa ' + empresa, { ip: req.ip || '', email: row.email || '' });
    empDB.audit(null, null, 'legal', 'activar_cuenta',
      'Cuenta activada por ' + (row.email || row.usuario_id) + ' con aceptación de términos', null);

    // Welcome email (best-effort — nunca bloquea la respuesta)
    try {
      const { getGlobalConfig } = require('../db_master');
      const { decryptValue } = require('../lib/crypto-utils');
      let h = getGlobalConfig('smtp_host'), p = parseInt(getGlobalConfig('smtp_port'))||465;
      let u = getGlobalConfig('smtp_user'), ep = getGlobalConfig('smtp_pass');
      let pass = ep ? decryptValue(ep) : '';
      if (!h || !u || !pass) {
        const { getNotificationSMTP } = require('../lib/send-email');
        const envSmtp = getNotificationSMTP();
        if (envSmtp.host) { h = envSmtp.host; p = envSmtp.port; u = envSmtp.user; pass = envSmtp.pass; }
      }
      if (h && u && pass) {
        const { sendEmail, getRemitente } = require('../lib/send-email');
        const { welcomeEmail } = require('../lib/email-templates');
        const appUrl = process.env.APP_URL || 'https://app.flexcrm.com.ar';
        const tutorialesUrl = process.env.TUTORIALES_URL || `${appUrl}/tutoriales`;
        const rem = getRemitente();
        await sendEmail(h, p, u, pass, rem.formatted, row.email, '¡Bienvenido a FlexCRM! 🚀', welcomeEmail(empDB.getConfig('nombre') || empresa, empresa, row.usuario || '', appUrl, tutorialesUrl)).catch(()=>{});
        console.log('[ActivarCuenta] Welcome email to:', row.email);
      }
    } catch(e) { console.error('[ActivarCuenta] Welcome email error:', e.message); }

    res.json({ ok: true, mensaje: 'Cuenta activada correctamente. Ya podés iniciar sesión.' });
  } catch(e) {
    console.error('[ActivarCuenta] Error:', e.message);
    res.status(500).json({ error: 'Error al activar la cuenta' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies && req.cookies['refresh-token'];
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token faltante' });
  }

  const empresa = req.body.empresa || 'default';
  if (!/^[a-z0-9_]+$/.test(String(empresa))) {
    res.clearCookie('refresh-token', { path: '/api/auth' });
    return res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }
  const { getEmpresaDB } = require('../db_sqlite');
  const userDB = getEmpresaDB(empresa, { existingOnly: true });
  if (!userDB) {
    res.clearCookie('refresh-token', { path: '/api/auth' });
    return res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const stored = userDB.where('password_reset_tokens', t =>
    t.token === hash && t.usado === 0 && new Date(t.expires) > new Date()
  )[0];

  if (!stored) {
    res.clearCookie('refresh-token', { path: '/api/auth' });
    return res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }

  const user = userDB.findOne('usuarios', stored.usuario_id);
  if (!user || !user.activo) {
    res.clearCookie('refresh-token', { path: '/api/auth' });
    return res.status(401).json({ error: 'Usuario no válido' });
  }

  // Mark old refresh as used
  userDB.update('password_reset_tokens', stored.id, { usado: 1 });

  // Recover existing session (by old token hash)
  let existingSid = null;
  try {
    const sess = userDB.raw.prepare("SELECT id FROM user_sessions WHERE token_hash=? AND activo=1").get(hash);
    if (sess) existingSid = sess.id;
  } catch(e) {}

  // Issue new tokens
  const { accessToken, refreshToken: newRefresh } = generateTokens(user, empresa, existingSid);
  const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
  userDB.insert('password_reset_tokens', {
    id: 'rt_' + uid(),
    usuario_id: user.id,
    email: user.email || '',
    token: newHash,
    expires: new Date(Date.now() + REFRESH_TOKEN_EXPIRY).toISOString(),
    usado: 0,
    creado: new Date().toISOString(),
  });

  // Update session token_hash + ultimo_acceso
  if (existingSid) {
    userDB.raw.prepare("UPDATE user_sessions SET token_hash=?, ultimo_acceso=? WHERE id=?").run(newHash, new Date().toISOString(), existingSid);
  }

  setRefreshCookie(res, newRefresh);
  setAccessCookie(res, accessToken);
  res.json(buildLoginResponse(user, accessToken, newRefresh, userDB));
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const refreshToken = req.cookies && req.cookies['refresh-token'];
  if (refreshToken) {
    const empresa = req.body.empresa || 'default';
    const { getEmpresaDB } = require('../db_sqlite');
    const userDB = /^[a-z0-9_]+$/.test(String(empresa)) ? getEmpresaDB(empresa, { existingOnly: true }) : null;
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    try {
      if (userDB) {
        const stored = userDB.where('password_reset_tokens', t => t.token === hash)[0];
        if (stored) userDB.update('password_reset_tokens', stored.id, { usado: 1 });
        userDB.raw.prepare("UPDATE user_sessions SET activo=0 WHERE token_hash=?").run(hash);
      }
    } catch(e) { /* non-blocking */ }
  }
  res.clearCookie('refresh-token', { path: '/api/auth' });
  res.clearCookie('access-token', { path: '/' });
  res.json({ ok: true });
});

// GET /api/auth/mi-ip — returns the client's IP (for adding to allowlist)
router.get('/mi-ip', (req, res) => {
  const { getIp } = require('../lib/suspicious-activity');
  const clientIP = (getIp(req) || '').replace(/^::ffff:/, '');
  res.json({ ip: clientIP });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const userDB = _getDB(req);
  const token = jwt.sign(
    { id: req.user.id, rol: req.user.rol, empresa: req.user.empresa },
    getSecret(),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  setAccessCookie(res, token);
  res.json(buildLoginResponse(req.user, token, null, userDB));
});

// POST /api/auth/cambiar-password
router.post('/cambiar-password', authMiddleware, validate(changePasswordSchema), async (req, res) => {
  const db = _getDB(req);
  const { password_actual, password_nuevo } = req.body;
  const ok = await bcrypt.compare(password_actual, req.user.password);
  if (!ok) return res.status(400).json({ error: 'Contraseña actual incorrecta' });

  // Check password history (last 5)
  const recentPasswords = db.raw.prepare(
    "SELECT password_hash FROM password_history WHERE user_id=? ORDER BY created_at DESC LIMIT 5"
  ).all(req.user.id).map(r => r.password_hash);
  for (const oldHash of recentPasswords) {
    if (await bcrypt.compare(password_nuevo, oldHash)) {
      return res.status(400).json({ error: 'No podés usar una contraseña reciente. Elegí una que no hayas usado antes.' });
    }
  }

  // Save old password to history before updating
  db.insert('password_history', {
    id: 'ph_' + uid(),
    user_id: req.user.id,
    password_hash: req.user.password,
    created_at: new Date().toISOString(),
  });

  const hash = await bcrypt.hash(password_nuevo, 10);
  db.update('usuarios', req.user.id, { password: hash, must_change_password: 0, password_changed_at: new Date().toISOString() });

  // Invalidate all refresh tokens for this user
  db.raw.prepare("UPDATE password_reset_tokens SET usado=1 WHERE usuario_id=? AND id LIKE 'rt_%'").run(req.user.id);

  suspicious.auditPasswordReset(req, db, req.user)
  res.json({ ok: true });
});

// POST /api/auth/forced-password-change — unauthenticated password change during login
router.post('/forced-password-change', async (req, res) => {
  const { temp_token, password_nuevo } = req.body;
  if (!temp_token || !password_nuevo) return res.status(400).json({ error: 'Token y contraseña requeridos' });

  const pwErr = require('../lib/password-policy').validatePassword(password_nuevo);
  if (pwErr) return res.status(400).json({ error: pwErr });

  let payload;
  try {
    payload = jwt.verify(temp_token, getSecret());
  } catch (e) {
    return res.status(401).json({ error: 'Token temporal inválido o expirado' });
  }
  if (payload.purpose !== 'change_password') return res.status(401).json({ error: 'Token inválido' });

  const empresa = payload.empresa;
  const { getEmpresaDB, uid } = require('../db_sqlite');
  const userDB = /^[a-z0-9_]+$/.test(String(empresa)) ? getEmpresaDB(empresa, { existingOnly: true }) : null;
  if (!userDB) return res.status(401).json({ error: 'Usuario no válido' });
  const user = userDB.findOne('usuarios', payload.id);
  if (!user || !user.activo) return res.status(401).json({ error: 'Usuario no válido' });

  const recentPasswords = userDB.raw.prepare(
    "SELECT password_hash FROM password_history WHERE user_id=? ORDER BY created_at DESC LIMIT 5"
  ).all(payload.id).map(r => r.password_hash);
  for (const oldHash of recentPasswords) {
    if (await bcrypt.compare(password_nuevo, oldHash)) {
      return res.status(400).json({ error: 'No podés usar una contraseña reciente. Elegí una que no hayas usado antes.' });
    }
  }

  if (user.password) {
    userDB.insert('password_history', {
      id: 'ph_' + uid(),
      user_id: payload.id,
      password_hash: user.password,
      created_at: new Date().toISOString(),
    });
  }

  const hash = await bcrypt.hash(password_nuevo, 10);
  userDB.update('usuarios', payload.id, { password: hash, must_change_password: 0, password_changed_at: new Date().toISOString() });

  userDB.raw.prepare("UPDATE password_reset_tokens SET usado=1 WHERE usuario_id=? AND id LIKE 'rt_%'").run(payload.id);

  suspicious.auditPasswordReset(req, userDB, user)

  const { accessToken, refreshToken } = generateTokens(user, empresa);
  enforceSessionLimit(userDB, payload.id);

  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  userDB.insert('password_reset_tokens', {
    id: 'rt_' + uid(),
    usuario_id: payload.id,
    email: user.email || '',
    token: refreshHash,
    expires: new Date(Date.now() + REFRESH_TOKEN_EXPIRY).toISOString(),
    usado: 0,
    creado: new Date().toISOString(),
  });

  setRefreshCookie(res, refreshToken);
  setAccessCookie(res, accessToken);
  res.json(buildLoginResponse(user, accessToken, refreshToken, userDB));
});

// GET /api/auth/usuarios
router.get('/usuarios', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const empleados = db.all('empleados');
  const twofaUsers = new Set();
  try {
    db.raw.prepare("SELECT user_id FROM user_2fa WHERE enabled=1").all().forEach(r => twofaUsers.add(r.user_id));
  } catch(e) {}
  return res.json(db.find('usuarios', { activo: true }).map(u => {
    const {password,...r}=u;
    const emp = empleados.find(e => e.usuario_id === u.id);
    if (emp) r.empleado_id = emp.id;
    r.has_2fa = twofaUsers.has(u.id);
    try {
      const d = typeof u.data === 'string' ? JSON.parse(u.data || '{}') : (u.data || {});
      r.data = d;
      r.force2fa = d.force2fa;
    } catch(e) { r.data = {}; }
    return r;
  }));
});

// POST /api/auth/usuarios
router.post('/usuarios', authMiddleware, requireRol('admin'), validate(createUserSchema), async (req, res) => {
  const db = _getDB(req);
  const { nombre, usuario, email, password, rol, suc_id } = req.body;
  const suc_sesiones_permitidas = req.body.suc_sesiones_permitidas;
  if (!nombre || !usuario || !password) return res.status(400).json({ error: 'Nombre, usuario y contraseña requeridos' });
  const existe = db.where('usuarios', u => u.usuario === usuario)[0];
  if (existe) return res.status(400).json({ error: 'El usuario ya existe' });
  if (email) {
    const emailExiste = db.where('usuarios', u => u.email?.toLowerCase() === email.toLowerCase() && u.activo !== false && u.activo != 0)[0];
    if (emailExiste) return res.status(400).json({ error: 'El email ya está en uso por otro usuario' });
  }
  try {
    const { getEmpresa } = require('../db_master');
    const empresa = getEmpresa(req.user.empresa || 'default');
    if (empresa && empresa.usuarios_max) {
      const total = db.where('usuarios', u => u.activo !== false && u.activo != 0).length;
      if (total >= empresa.usuarios_max) {
        return res.status(403).json({
          error: `Tu plan permite hasta ${empresa.usuarios_max} usuario(s). Ya tenés ${total}. Mejorá tu plan para agregar más.`,
          limite_plan: true
        });
      }
    }
  } catch(e) { }
  const hash = await bcrypt.hash(password, 10);
  const roles = req.body.roles;
  const userId = 'u' + uid();
  const r = db.insert('usuarios', {
    id: userId, nombre, usuario, email: email || '', password: hash,
    rol: rol || 'vendedor',
    roles: Array.isArray(roles) && roles.length ? roles : [rol || 'vendedor'],
    suc_id: suc_id || null,
    suc_sesiones_permitidas: Array.isArray(suc_sesiones_permitidas) ? suc_sesiones_permitidas : (suc_id ? [suc_id] : []),
    activo: true, creado: new Date().toISOString()
  });
  // Auto-create empleado record
  const empId = uid();
  db.insert('empleados', {
    id: empId, nombre: nombre, apellido: null,
    dni: null, cuil: null,
    tel: null, email: email || null,
    direccion: null,
    fecha_ingreso: new Date().toISOString().substr(0, 10),
    puesto: null,
    salario: 0,
    obra_social: null,
    suc_id: suc_id || null, activo: 1, notas: null,
    usuario_id: userId, creado: new Date().toISOString(),
  });
  db.audit(req.user, suc_id, 'rrhh', 'crear_empleado', `Empleado creado desde usuario ${nombre}`, empId);
  const { password: _, ...safe } = r;
  res.json(safe);
});

// ── Per-email signup rate limiting ──
const signupEmailAttempts = new Map();
const SIGNUP_EMAIL_MAX = 2;
const SIGNUP_EMAIL_WINDOW = 24 * 60 * 60 * 1000; // 24h

setInterval(() => {
  const cutoff = Date.now() - SIGNUP_EMAIL_WINDOW;
  for (const [key, ts] of signupEmailAttempts) {
    if (ts < cutoff) signupEmailAttempts.delete(key);
  }
}, 60000); // cleanup every minute

function checkSignupEmailLimit(email) {
  const key = email.toLowerCase().trim();
  const last = signupEmailAttempts.get(key);
  if (last && (Date.now() - last) < SIGNUP_EMAIL_WINDOW) {
    return false;
  }
  signupEmailAttempts.set(key, Date.now());
  return true;
}

// ── Public signup (auto-provisión de empresa + trial) ──
router.post('/signup', async (req, res) => {
  const { empresa_nombre, email, password, rubro, website, nombre_dueno, apellido_dueno, telefono, ciudad, como_conociste } = req.body;

  // Honeypot (hidden field — bots fill it)
  if (website && website.length > 0) {
    try { const { saAuditExtended } = require('../db_master'); saAuditExtended('system', 'signup_honeypot', null, 'Bot: '+(req.ip||'')); } catch {}
    return res.json({ ok: true, mensaje: 'Revisa tu email para activar la cuenta.' });
  }

  if (!empresa_nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre del negocio, email y contraseña requeridos' });
  }
  const pwErr = require('../lib/password-policy').validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  // Per-email rate limit
  if (!checkSignupEmailLimit(email)) {
    return res.status(429).json({ error: 'Ya te registraste con este email recientemente. Esperá 24 horas o contactanos.' });
  }

  const { getEmpresaDB, uid } = require('../db_sqlite');
  const { master, getEmpresa, createEmpresa } = require('../db_master');

  // Auto-generate tenant code from business name
  let codigo = empresa_nombre.toLowerCase()
    .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 30) || 'empresa';
  // Check uniqueness
  let finalCodigo = codigo;
  let counter = 1;
  while (getEmpresa(finalCodigo) || master.prepare("SELECT id FROM empresas WHERE codigo=?").get(finalCodigo)) {
    finalCodigo = codigo + '_' + counter;
    counter++;
  }

  // Check email not already used by another company admin
  try {
    const existing = master.prepare("SELECT codigo FROM empresas WHERE LOWER(admin_email)=LOWER(?)").get(email.trim().toLowerCase());
    if (existing) return res.status(400).json({ error: 'Ya existe una empresa registrada con ese email.' });
  } catch(e) { /* non-critical */ }

  // Create empresa in master DB
  const trialDays = 14;
  const vencimiento = new Date(Date.now() + trialDays * 86400000).toISOString().substr(0, 10);
  const empresaId = createEmpresa({
    codigo: finalCodigo, nombre: empresa_nombre, rubro: rubro || 'general',
    plan_id: 'plan_trial', admin_email: email,
    vencimiento, usuarios_max: 5, sucursales_max: 1,
  });

  // Initialize tenant DB
  const empDB = getEmpresaDB(finalCodigo);
  empDB.setConfig({
    rubro: rubro || 'general', nombre: empresa_nombre,
    modulos_habilitados: JSON.stringify(['pos', 'caja', 'clientes', 'ventas', 'productos', 'ctacte', 'presupuestos', 'reportes']),
    nombre_dueno: nombre_dueno || '', apellido_dueno: apellido_dueno || '',
    telefono: telefono || '', ciudad: ciudad || '', como_conociste: como_conociste || '',
  });

  // Store extra fields in master.empresas.config
  if (nombre_dueno || telefono || ciudad || como_conociste) {
    try {
      const extra = { nombre_dueno: nombre_dueno || '', apellido_dueno: apellido_dueno || '', telefono: telefono || '', ciudad: ciudad || '', como_conociste: como_conociste || '' };
      master.prepare("UPDATE empresas SET config = ? WHERE id = ?").run(JSON.stringify(extra), empresaId);
    } catch(e) { /* non-critical */ }
  }

  // Disposable email
  try {
    const { isDisposableEmail } = require('../db_master');
    if (isDisposableEmail(email)) return res.status(400).json({ error: 'Usa un email valido para registrarte.' });
  } catch {}

  // Create admin user (email_verificado=0) — handle re-entry to a stale DB
  const hash = await bcrypt.hash(password, 10);
  const usuario = email.split('@')[0].replace(/[^a-z0-9_]/g, '_').substring(0, 20);
  const adminNombre = nombre_dueno || 'Admin';
  const adminApellido = apellido_dueno || null;
  const existingAdmin = empDB.where('usuarios', u => u.email === email.trim().toLowerCase() && u.activo)[0];
  let adminId, isReEntry = false;
  if (existingAdmin) {
    adminId = existingAdmin.id;
    isReEntry = true;
    console.log('[Signup] Re-entry detectado para empresa '+finalCodigo+' — actualizando admin existente ' + adminId);
    empDB.update('usuarios', adminId, {
      nombre: adminNombre, apellido: adminApellido || '', usuario,
      password: hash, rol: 'admin', roles: JSON.stringify(['admin']), activo: true,
      email_verificado: 0, password_changed_at: new Date().toISOString(),
    });
    // Mark old tokens used for this user
    empDB.raw.prepare("UPDATE email_tokens SET usado=1 WHERE usuario_id=?").run(adminId);
    // Also re-verify all other users with the same email (cleanup)
    empDB.raw.prepare("UPDATE usuarios SET email_verificado=0 WHERE email=? AND id!=?").run(email.trim().toLowerCase(), adminId);
  } else {
    adminId = 'u' + uid();
    empDB.insert('usuarios', {
      id: adminId, nombre: adminNombre, apellido: adminApellido || '', usuario: usuario,
      email: email.trim().toLowerCase(), password: hash,
      rol: 'admin', roles: JSON.stringify(['admin']), activo: true,
      email_verificado: 0, creado: new Date().toISOString(), password_changed_at: new Date().toISOString(),
    });
  }

  if (!isReEntry) {
    const empId = uid();
    empDB.insert('empleados', {
      id: empId, nombre: adminNombre, apellido: adminApellido || null, email: email.trim().toLowerCase(),
      fecha_ingreso: new Date().toISOString().substr(0, 10), activo: 1,
      usuario_id: adminId, creado: new Date().toISOString(),
    });
    empDB.insert('sucursales', { id: uid(), nombre: empresa_nombre, dir: '', activo: true, creado: new Date().toISOString() });
  } else {
    // Ensure sucursal exists on re-entry
    const sucCount = empDB.raw.prepare("SELECT COUNT(*) as n FROM sucursales WHERE activo=1").get();
    if (!sucCount || sucCount.n === 0) {
      empDB.insert('sucursales', { id: uid(), nombre: empresa_nombre, dir: '', activo: true, creado: new Date().toISOString() });
    }
  }

  // Generate verification token
  const verToken = crypto.randomBytes(20).toString('hex');
  const verTokenHash = crypto.createHash('sha256').update(verToken).digest('hex');
  empDB.insert('email_tokens', {
    id: 'vet_' + Date.now(), usuario_id: adminId, email: email.trim().toLowerCase(),
    token_hash: verTokenHash, expires: new Date(Date.now() + 24*3600000).toISOString(), usado: 0, creado: new Date().toISOString()
  });

  try { const { saAuditExtended } = require('../db_master'); saAuditExtended('system', 'signup_exitoso', finalCodigo, 'Empresa: '+empresa_nombre, { ip: req.ip||'', email }); } catch {}
  console.log('[Signup] Nueva:', finalCodigo, email);

  // Register consent for admin
  try {
    const { registrarConsentimiento, getVersionesVigentes } = require('../lib/legal-versions');
    const versiones = getVersionesVigentes();
    if (req.body.acepta_terminos && versiones.terminos) {
      registrarConsentimiento(empDB, finalCodigo, 'terminos', versiones.terminos, adminId, req);
    }
    if (req.body.acepta_privacidad && versiones.privacidad) {
      registrarConsentimiento(empDB, finalCodigo, 'privacidad', versiones.privacidad, adminId, req);
    }
  } catch(e) { console.error('[Signup] Consent error:', e.message); }

  // Send verification email inline (not setImmediate)
  try {
    const { getGlobalConfig } = require('../db_master');
    const { decryptValue } = require('../lib/crypto-utils');
    let h = getGlobalConfig('smtp_host'), p = parseInt(getGlobalConfig('smtp_port'))||465;
    let u = getGlobalConfig('smtp_user'), ep = getGlobalConfig('smtp_pass');
    let pass = ep ? decryptValue(ep) : '';
    // Fallback to env SMTP if global config is missing
    const { getNotificationSMTP } = require('../lib/send-email');
    if (!h || !u || !pass) {
      const envSmtp = getNotificationSMTP();
      if (envSmtp.host) {
        h = envSmtp.host; p = envSmtp.port; u = envSmtp.user; pass = envSmtp.pass;
      }
    }
    const appUrl = process.env.APP_URL || (req.get('host') ? (`${req.protocol}://${req.get('host')}`) : 'https://app.flexcrm.com.ar');
    const tutorialesUrl = process.env.TUTORIALES_URL || `${appUrl}/tutoriales`;
    const verifyLink = `${appUrl}/api/auth/verify-email/${verToken}`;
    if (h && u && pass) {
      const { sendEmail, getRemitente } = require('../lib/send-email');
      const { verificationEmail } = require('../lib/email-templates');
      const rem = getRemitente();
      await sendEmail(h, p, u, pass, rem.formatted, email, 'Verificá tu email y empezá — FlexCRM', verificationEmail(empresa_nombre, finalCodigo, usuario, verifyLink, appUrl, tutorialesUrl));
      console.log('[Signup] Verification email to:', email);
    } else {
      console.error('[Signup] SMTP no configurado para:', email);
      try { const { saAuditExtended } = require('../db_master'); saAuditExtended('system', 'smtp_error', finalCodigo, 'SMTP global/env no configurado para enviar verificacion', { email }); } catch {}
    }
  } catch(e) {
    console.error('[Signup] Email error:', e.message);
    try { const { saAuditExtended } = require('../db_master'); saAuditExtended('system', 'smtp_error', finalCodigo, e.message); } catch {}
  }

  res.json({ ok: true, mensaje: 'Cuenta creada. Revisa tu email para verificarla y empezar.' });
});

// ── Verify email via token ──
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
    if (!found) return res.redirect('/app/login?verified=invalid');
    if (new Date(found.expires) < new Date()) return res.redirect('/app/login?verified=expired');

    const empDB = getEmpresaDB(foundCodigo);
    empDB.raw.prepare("UPDATE usuarios SET email_verificado=1 WHERE id=?").run(found.usuario_id);
    // Also verify any duplicate users with the same email (re-entry a una DB vieja)
    if (found.email) {
      empDB.raw.prepare("UPDATE usuarios SET email_verificado=1 WHERE email=? AND id!=? AND email_verificado=0").run(found.email, found.usuario_id);
    }
    empDB.raw.prepare("UPDATE email_tokens SET usado=1 WHERE id=?").run(found.id);
    try { saAuditExtended('system', 'email_verificado', foundCodigo, 'Email: '+found.email, { email: found.email }); } catch {}

    const user = empDB.findOne('usuarios', found.usuario_id);
    if (user) {
      // Welcome email (best-effort — nunca bloquea el redirect)
      try {
        const { getGlobalConfig } = require('../db_master');
        const { decryptValue } = require('../lib/crypto-utils');
        let h = getGlobalConfig('smtp_host'), p = parseInt(getGlobalConfig('smtp_port'))||465;
        let u = getGlobalConfig('smtp_user'), ep = getGlobalConfig('smtp_pass');
        let pass = ep ? decryptValue(ep) : '';
        if (!h || !u || !pass) {
          const { getNotificationSMTP } = require('../lib/send-email');
          const envSmtp = getNotificationSMTP();
          if (envSmtp.host) { h = envSmtp.host; p = envSmtp.port; u = envSmtp.user; pass = envSmtp.pass; }
        }
        if (h && u && pass) {
          const { sendEmail, getRemitente } = require('../lib/send-email');
          const { welcomeEmail } = require('../lib/email-templates');
          const appUrl = process.env.APP_URL || 'https://app.flexcrm.com.ar';
          const tutorialesUrl = process.env.TUTORIALES_URL || `${appUrl}/tutoriales`;
          const rem = getRemitente();
          await sendEmail(h, p, u, pass, rem.formatted, user.email, '¡Bienvenido a FlexCRM! 🚀', welcomeEmail(empDB.getConfig('nombre') || foundCodigo, foundCodigo, user.usuario || '', appUrl, tutorialesUrl)).catch(()=>{});
          console.log('[Verify] Welcome email to:', user.email);
        }
      } catch(e) { console.error('[Verify] Welcome email error:', e.message); }

      const accessToken = jwt.sign({ id: user.id, rol: user.rol, empresa: foundCodigo, nombre: user.nombre }, getSecret(), { expiresIn: '24h' });
      res.redirect('/app/login?verified=ok&token=' + encodeURIComponent(accessToken));
    } else {
      res.redirect('/app/login?verified=ok');
    }
  } catch(e) { console.error('[Verify] Error:', e.message); res.redirect('/app/login?verified=error'); }
});

// ── Resend verification email ──
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

    const { getGlobalConfig } = require('../db_master');
    if (getGlobalConfig('smtp_host')) {
      const { decryptValue } = require('../lib/crypto-utils');
      const h = getGlobalConfig('smtp_host'), p = parseInt(getGlobalConfig('smtp_port'))||465;
      const u = getGlobalConfig('smtp_user'), pass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : '';
      const appUrl = process.env.APP_URL || 'https://app.flexcrm.com.ar';
      const tutorialesUrl = process.env.TUTORIALES_URL || `${appUrl}/tutoriales`;
      const { sendEmail, getRemitente } = require('../lib/send-email');
      const { verificationEmail } = require('../lib/email-templates');
      const rem = getRemitente();
      const cfg = empDB.getConfig();
      await sendEmail(h, p, u, pass, rem.formatted, email, 'Verificá tu email y empezá — FlexCRM', verificationEmail(cfg.nombre || foundCodigo, foundCodigo, found.usuario || '', appUrl+'/api/auth/verify-email/'+verToken, appUrl, tutorialesUrl));
    }
    res.json({ ok: true, mensaje: 'Si la cuenta existe, recibiras un nuevo email.' });
  } catch(e) { res.json({ ok: true, mensaje: 'Si la cuenta existe, recibiras un nuevo email.' }); }
});

// ── Check if tenant code is available ──
router.get('/signup/check-codigo/:codigo', (req, res) => {
  const { getEmpresa } = require('../db_master');
  const exists = getEmpresa(req.params.codigo) != null;
  res.json({ disponible: !exists, codigo: req.params.codigo });
});

// PUT /api/auth/usuarios/:id
router.put('/usuarios/:id', authMiddleware, requireRol('admin'), async (req, res) => {
  const db = _getDB(req);
  const { nombre, email, rol, suc_id, password, usuario } = req.body;
  const roles = req.body.roles;
  const suc_sesiones_permitidas = req.body.suc_sesiones_permitidas;
  if (usuario) {
    const userExiste = db.where('usuarios', u => u.usuario === usuario && u.id !== req.params.id)[0];
    if (userExiste) return res.status(400).json({ error: 'El nombre de usuario ya existe' });
  }
  if (email) {
    const emailExiste = db.where('usuarios', u => u.email?.toLowerCase() === email.toLowerCase() && u.id !== req.params.id && u.activo !== false && u.activo != 0)[0];
    if (emailExiste) return res.status(400).json({ error: 'El email ya está en uso por otro usuario' });
  }
  const upd = { nombre, email, rol, suc_id: suc_id || null };
  if (usuario) upd.usuario = usuario;
  if (Array.isArray(roles) && roles.length) upd.roles = roles;
  if (Array.isArray(suc_sesiones_permitidas)) upd.suc_sesiones_permitidas = suc_sesiones_permitidas;
  // Per-user 2FA override
  const { force2fa } = req.body;
  if (force2fa !== undefined) {
    const existingUser = db.findOne('usuarios', req.params.id);
    let userData = {};
    try { userData = typeof existingUser.data === 'string' ? JSON.parse(existingUser.data || '{}') : (existingUser.data || {}); } catch(e) {}
    if (force2fa === null) {
      delete userData.force2fa;
    } else {
      userData.force2fa = !!force2fa;
    }
    upd.data = JSON.stringify(userData);
  }
  if (password && password.length >= 8) {
    // Check password history (last 5)
    const recentPasswords = db.raw.prepare(
      "SELECT password_hash FROM password_history WHERE user_id=? ORDER BY created_at DESC LIMIT 5"
    ).all(req.params.id).map(r => r.password_hash);
    for (const oldHash of recentPasswords) {
      if (await bcrypt.compare(password, oldHash)) {
        return res.status(400).json({ error: 'No podés usar una contraseña reciente. Elegí una que no hayas usado antes.' });
      }
    }
    const targetUser = db.findOne('usuarios', req.params.id);
    if (targetUser && targetUser.password) {
      db.insert('password_history', {
        id: 'ph_' + uid(),
        user_id: req.params.id,
        password_hash: targetUser.password,
        created_at: new Date().toISOString(),
      });
    }
    upd.password = await bcrypt.hash(password, 10);
    upd.must_change_password = 0;
    // Invalidate all refresh tokens for this user
    db.raw.prepare("UPDATE password_reset_tokens SET usado=1 WHERE usuario_id=? AND id LIKE 'rt_%'").run(req.params.id);
  }
  const r = db.update('usuarios', req.params.id, upd);
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  const { password: _, ...safe } = r;
  res.json(safe);
});

// DELETE /api/auth/usuarios/:id
router.delete('/usuarios/:id', authMiddleware, requireRol('admin'), (req, res) => {
  const db = _getDB(req);
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });
  db.softDel('usuarios', req.params.id);
  res.json({ ok: true });
});

// POST /api/auth/usuarios/:id/reset-password — admin resets a user's password
router.post('/usuarios/:id/reset-password', authMiddleware, requireRol('admin'), async (req, res) => {
  const db = _getDB(req);
  const user = db.findOne('usuarios', req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!user.activo) return res.status(400).json({ error: 'Usuario inactivo' });

  const tempPassword = Math.random().toString(36).substr(2, 8) + 'A1!';

  // Save old password to history
  if (user.password) {
    db.insert('password_history', {
      id: 'ph_' + uid(),
      user_id: user.id,
      password_hash: user.password,
      created_at: new Date().toISOString(),
    });
  }

  const hash = await bcrypt.hash(tempPassword, 10);
  db.update('usuarios', req.params.id, { password: hash, must_change_password: 1, password_changed_at: new Date().toISOString() });

  // Invalidate all refresh tokens
  db.raw.prepare("UPDATE password_reset_tokens SET usado=1 WHERE usuario_id=? AND id LIKE 'rt_%'").run(req.params.id);

  // Try to send email with temp password
  try {
    const cfg = db.getConfig();
    const host = cfg.smtp_host;
    const port = parseInt(cfg.smtp_port) || 465;
    const smtpUser = cfg.smtp_user;
    const smtpPass = cfg.smtp_pass;
    const from = cfg.smtp_from || (require('../lib/send-email').getGlobalFrom());
    if (host && smtpUser && smtpPass && user.email) {
      const loginLink = `${req.protocol}://${req.get('host')}/app/login?e=${req.user.empresa || 'default'}`;
      const html = `<div style="font-family:sans-serif;padding:24px;max-width:480px;margin:0 auto">
        <h2 style="color:#F97316">Contraseña restablecida</h2>
        <p>El administrador restableció tu contraseña.</p>
        <p style="background:#f4f4f5;padding:12px;border-radius:8px;font-family:monospace;font-size:16px;text-align:center">
          <strong>${tempPassword}</strong>
        </p>
        <p>Usá esta contraseña para iniciar sesión. El sistema te pedirá que la cambies al ingresar.</p>
        <a href="${loginLink}" style="display:inline-block;padding:10px 24px;background:#F97316;color:#fff;text-decoration:none;border-radius:8px;margin-top:12px">Ir al inicio de sesión</a>
      </div>`;
      await sendEmail(host, port, smtpUser, smtpPass, from, user.email, 'Tu contraseña fue restablecida', html);
    }
  } catch (e) { /* non-blocking */ }

  res.json({ ok: true, temp_password: tempPassword, mensaje: 'Contraseña restablecida. El usuario debe cambiarla al ingresar.' + (user.email ? ' Se envió por email.' : '') });
});

function buildResetEmailHtml(resetLink, empresaNombre) {
  const { resetPasswordEmail } = require('../lib/email-templates');
  return resetPasswordEmail(resetLink, empresaNombre || 'FlexCRM');
}

function buildResetConfirmedHtml(loginLink) {
  const { passwordChangedEmail } = require('../lib/email-templates');
  return passwordChangedEmail(loginLink, 'FlexCRM');
}

async function sendEmail(host, port, smtpUser, smtpPass, from, to, subject, html) {
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch (e) { throw new Error('nodemailer not installed'); }
  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({ from, to, subject, html });
}

// ── Forgot Password ──
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
  const { usuario, empresa } = req.body;
  const { getEmpresaDB, uid } = require('../db_sqlite');
  const userDB = /^[a-z0-9_]+$/.test(String(empresa)) ? getEmpresaDB(empresa, { existingOnly: true }) : null;
  if (!userDB) {
    // No revelar si la empresa existe ni crear archivos para códigos arbitrarios
    return res.json({ ok: true, mensaje: 'Si el usuario existe, recibirás un email con instrucciones' });
  }
  suspicious.auditForgotPassword(req, userDB, empresa, usuario)
  const user = userDB.where('usuarios', u => (u.usuario === usuario || u.email === usuario) && u.activo)[0];
  if (!user || !user.email) {
    return res.json({ ok: true, mensaje: 'Si el usuario existe, recibirás un email con instrucciones' });
  }
  const email = user.email;
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600000).toISOString();
  userDB.insert('password_reset_tokens', {
    id: uid(), usuario_id: user.id, email,
    token, expires, usado: 0, creado: new Date().toISOString()
  });
  try {
    const cfg = userDB.getConfig();
    let host = cfg.smtp_host;
    let port = parseInt(cfg.smtp_port) || 465;
    let smtpUser = cfg.smtp_user;
    let smtpPass = cfg.smtp_pass;
    let from = cfg.smtp_from;
    let tenantConfigured = !!(host && smtpUser && smtpPass);
    // Fallback to global SMTP if tenant SMTP is not configured
    if (!tenantConfigured) {
      try {
        const { getGlobalConfig } = require('../db_master');
        const { decryptValue } = require('../lib/crypto-utils');
        host = getGlobalConfig('smtp_host');
        port = parseInt(getGlobalConfig('smtp_port')) || 465;
        smtpUser = getGlobalConfig('smtp_user');
        const encryptedPass = getGlobalConfig('smtp_pass');
        smtpPass = encryptedPass ? decryptValue(encryptedPass) : '';
        from = getGlobalConfig('smtp_from') || smtpUser;
        const { getRemitente } = require('../lib/send-email');
        const { fromName } = getRemitente();
        if (from && fromName) from = `"${fromName}" <${from}>`;
      } catch (g) { /* global SMTP not available */ }
    }
    if (!host || !smtpUser || !smtpPass) {
      console.log('[PasswordReset] SMTP no configurado (ni tenant ni global) para empresa:', empresa);
      return res.json({ ok: true, mensaje: 'Si el usuario existe, recibirás un email con instrucciones' });
    }
    const resetLink = `${req.protocol}://${req.get('host')}/app/reset-password?token=${token}&empresa=${empresa}`;
    const empresaNombre = cfg.nombre || 'FlexCRM';
    const html = buildResetEmailHtml(resetLink, empresaNombre);
    await sendEmail(host, port, smtpUser, smtpPass, from, email, `Restablecer contraseña — ${empresaNombre}`, html);
    res.json({ ok: true, mensaje: 'Si el usuario existe, recibirás un email con instrucciones' });
  } catch (e) {
    console.error('[PasswordReset] Email error:', e.message);
    res.json({ ok: true, mensaje: 'Si el usuario existe, recibirás un email con instrucciones' });
  }
});

// ── Reset Password ──
router.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
  const { token, password, empresa } = req.body;
  const { getEmpresaDB } = require('../db_sqlite');
  const userDB = /^[a-z0-9_]+$/.test(String(empresa)) ? getEmpresaDB(empresa, { existingOnly: true }) : null;
  if (!userDB) return res.status(400).json({ error: 'Token inválido o ya usado' });
  const rt = userDB.where('password_reset_tokens', t => t.token === token && t.usado === 0)[0];
  if (!rt) return res.status(400).json({ error: 'Token inválido o ya usado' });
  if (new Date(rt.expires) < new Date()) return res.status(400).json({ error: 'Token expirado. Solicitá uno nuevo.' });

  // Check password history (last 5)
  const recentPasswords = userDB.raw.prepare(
    "SELECT password_hash FROM password_history WHERE user_id=? ORDER BY created_at DESC LIMIT 5"
  ).all(rt.usuario_id).map(r => r.password_hash);
  for (const oldHash of recentPasswords) {
    if (await bcrypt.compare(password, oldHash)) {
      return res.status(400).json({ error: 'No podés usar una contraseña reciente. Elegí una que no hayas usado antes.' });
    }
  }

  // Get old password for history before updating
  const oldUser = userDB.findOne('usuarios', rt.usuario_id);
  if (oldUser && oldUser.password) {
    userDB.insert('password_history', {
      id: 'ph_' + uid(),
      user_id: rt.usuario_id,
      password_hash: oldUser.password,
      created_at: new Date().toISOString(),
    });
  }

  const hash = await bcrypt.hash(password, 10);
  userDB.update('usuarios', rt.usuario_id, { password: hash, password_changed_at: new Date().toISOString() });
  userDB.update('password_reset_tokens', rt.id, { usado: 1 });

  // Invalidate all refresh tokens for this user
  userDB.raw.prepare("UPDATE password_reset_tokens SET usado=1 WHERE usuario_id=? AND id LIKE 'rt_%'").run(rt.usuario_id);

  const resetUser = userDB.findOne('usuarios', rt.usuario_id);
  if (resetUser) suspicious.auditPasswordReset(req, userDB, resetUser)

  // Send confirmation email
  try {
    const cfg = userDB.getConfig();
    const host = cfg.smtp_host;
    const smtpUser = cfg.smtp_user;
    const smtpPass = cfg.smtp_pass;
    const from = cfg.smtp_from || (require('../lib/send-email').getGlobalFrom());
    if (host && smtpUser && smtpPass && rt.email) {
      const loginLink = `${req.protocol}://${req.get('host')}/app/login`;
      await sendEmail(host, parseInt(cfg.smtp_port) || 465, smtpUser, smtpPass, from, rt.email, 'Contraseña actualizada — FlexCRM', buildResetConfirmedHtml(loginLink));
    }
  } catch (e) { /* non-blocking */ }

  res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
});

// ── Solicitar eliminación de cuenta (usuario solicita, superadmin aprueba) ──
router.post('/solicitar-eliminacion', authMiddleware, async (req, res) => {
  try {
    const { master, saAuditExtended } = require('../db_master');
    const empresa = master.prepare("SELECT * FROM empresas WHERE codigo=?").get(req.user.empresa);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    const existing = master.prepare("SELECT id FROM solicitudes_eliminacion WHERE empresa_id=? AND estado='pendiente'").get(empresa.id);
    if (existing) return res.status(400).json({ error: 'Ya tenés una solicitud de eliminación pendiente.' });
    master.prepare("INSERT INTO solicitudes_eliminacion (id,empresa_id,empresa_codigo,email,motivo,fecha,estado) VALUES (?,?,?,?,?,?,?)")
      .run('se_'+Date.now(), empresa.id, empresa.codigo, req.user.email, req.body.motivo || '', new Date().toISOString(), 'pendiente');
    saAuditExtended('system', 'solicitud_eliminacion', empresa.codigo, 'Usuario solicitó eliminación: '+req.user.email);
    res.json({ ok: true, mensaje: 'Solicitud de eliminación enviada. El administrador la procesará a la brevedad.' });
  } catch(e) {
    console.error('[SolicitarEliminacion] Error:', e.message);
    res.status(500).json({ error: 'Error al enviar la solicitud.' });
  }
});

// ── POST /api/auth/firmar-terminos — admin firma desde sesión activa ──
router.post('/firmar-terminos', authMiddleware, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede firmar.' });
    const empresa = req.user.empresa || 'default';
    const userDB = require('../db_sqlite').getEmpresaDB(empresa);
    const { registrarConsentimiento, getVersionesVigentes } = require('../lib/legal-versions');
    const versiones = getVersionesVigentes();
    if (versiones.terminos) registrarConsentimiento(userDB, empresa, 'terminos', versiones.terminos, req.user.id, req);
    if (versiones.privacidad) registrarConsentimiento(userDB, empresa, 'privacidad', versiones.privacidad, req.user.id, req);
    const { saAuditExtended } = require('../db_master');
    saAuditExtended('system', 'consentimiento_firmado_desde_cuenta', empresa,
      'Admin ' + (req.user.email || req.user.usuario) + ' firmó términos desde Mi Cuenta',
      { ip: req.ip || '', email: req.user.email || '' });
    userDB.audit(req.user, req.user.suc_id, 'legal', 'firmar_terminos',
      'Documentos firmados desde Mi Cuenta por ' + (req.user.nombre || req.user.usuario), null);
    res.json({ ok: true, mensaje: 'Documentos firmados correctamente.' });
  } catch(e) {
    console.error('[FirmarTerminos] Error:', e.message);
    res.status(500).json({ error: 'Error al firmar documentos.' });
  }
});

// ── Session management ──
// GET /api/auth/me/sesiones
router.get('/me/sesiones', authMiddleware, (req, res) => {
  const userDB = _getDB(req);
  const sessions = userDB.raw.prepare(
    "SELECT id, ip, user_agent, creado, ultimo_acceso, activo FROM user_sessions WHERE usuario_id=? ORDER BY ultimo_acceso DESC"
  ).all(req.user.id);
  const currentSid = req.user.sid;
  res.json(sessions.map(s => ({ ...s, es_actual: s.id === currentSid })));
});

// POST /api/auth/me/sesiones/:sid/cerrar
router.post('/me/sesiones/:sid/cerrar', authMiddleware, (req, res) => {
  const userDB = _getDB(req);
  const session = userDB.raw.prepare("SELECT * FROM user_sessions WHERE id=? AND usuario_id=?").get(req.params.sid, req.user.id);
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
  if (session.id === req.user.sid) return res.status(400).json({ error: 'Usá cerrar sesión para cerrar la sesión actual.' });
  userDB.raw.prepare("UPDATE user_sessions SET activo=0 WHERE id=?").run(req.params.sid);
  userDB.raw.prepare("UPDATE password_reset_tokens SET usado=1 WHERE token=? AND usado=0").run(session.token_hash);
  userDB.audit(req.user, req.user.suc_id, 'auth', 'sesion_cerrada', 'Cerró sesión ' + req.params.sid, null, { ip: getIp(req) });
  res.json({ ok: true });
});

// POST /api/auth/me/sesiones/cerrar-todas
router.post('/me/sesiones/cerrar-todas', authMiddleware, (req, res) => {
  const userDB = _getDB(req);
  const currentSid = req.user.sid;
  userDB.raw.prepare("UPDATE user_sessions SET activo=0 WHERE usuario_id=? AND id!=?").run(req.user.id, currentSid || '');
  userDB.raw.prepare("UPDATE password_reset_tokens SET usado=1 WHERE usuario_id=? AND token NOT IN (SELECT token_hash FROM user_sessions WHERE id=?)").run(req.user.id, currentSid || '');
  userDB.audit(req.user, req.user.suc_id, 'auth', 'sesiones_cerradas', 'Cerró todas las otras sesiones', null, { ip: getIp(req) });
  res.json({ ok: true });
});

// GET /api/auth/me/ultimas-sesiones — historial de ingresos desde audit_log
router.get('/me/ultimas-sesiones', authMiddleware, (req, res) => {
  const userDB = _getDB(req);
  const rows = userDB.raw.prepare(
    "SELECT fecha, data FROM audit_log WHERE usuario_id=? AND accion='login' ORDER BY fecha DESC LIMIT 20"
  ).all(req.user.id);
  const historial = rows.map(r => {
    let d = {};
    try { d = JSON.parse(r.data || '{}'); } catch(e) {}
    return { fecha: r.fecha, ip: d.ip || '', ua: d.ua || '' };
  });
  res.json(historial);
});

module.exports = router;
module.exports.buildLoginResponse = buildLoginResponse;
module.exports.generateTokens = generateTokens;
module.exports.setRefreshCookie = setRefreshCookie;
module.exports.setAccessCookie = setAccessCookie;
module.exports.createSessionRecord = createSessionRecord;
module.exports.enforceSessionLimit = enforceSessionLimit;
