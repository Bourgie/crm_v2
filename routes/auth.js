const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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

function findVendedorForUser(user, userDB) {
  if (!user.roles) user.roles = [user.rol];
  const vends = userDB.all('vendedores');
  let v = vends.find(v => v.usuario_id === user.id);
  if (!v && user.email) v = vends.find(v => v.email && v.email === user.email);
  if (!v && user.usuario) v = vends.find(v => v.usuario === user.usuario);
  if (!v) v = vends.find(v => (v.nombre + ' ' + v.apellido).toLowerCase() === user.nombre.toLowerCase());
  if (!v && user.suc_id) v = vends.find(v => v.suc_id === user.suc_id && v.activo !== false);
  return v || null;
}

function buildLoginResponse(user, token, refreshToken, empresaDB) {
  const userDB = empresaDB || db;
  const { password: _, ...userData } = user;
  if (!userData.roles) userData.roles = [userData.rol];
  if (!Array.isArray(userData.suc_sesiones_permitidas)) {
    try { userData.suc_sesiones_permitidas = JSON.parse(userData.suc_sesiones_permitidas || '[]'); }
    catch(e) { userData.suc_sesiones_permitidas = userData.suc_id ? [userData.suc_id] : []; }
  }
  const suc = user.suc_id ? userDB.findOne('sucursales', user.suc_id) : null;
  const vendedor = findVendedorForUser(user, userDB);
  userData.vendedor_id = vendedor?.id || null;
  userData.vendedor_nombre = vendedor ? (vendedor.nombre + ' ' + vendedor.apellido) : userData.nombre;
  return { token, refreshToken, user: userData, sucursal: suc, vendedor };
}

function generateTokens(user, empresa) {
  const accessToken = jwt.sign(
    { id: user.id, rol: user.rol, empresa: empresa },
    getSecret(),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  const refreshToken = crypto.randomBytes(40).toString('hex');
  return { accessToken, refreshToken };
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

function enforceSessionLimit(db, userId) {
  const active = db.raw.prepare(
    "SELECT id FROM password_reset_tokens WHERE usuario_id=? AND usado=0 AND id LIKE 'rt_%' AND expires > datetime('now') ORDER BY creado ASC"
  ).all(userId);
  if (active.length >= MAX_CONCURRENT_SESSIONS) {
    const toRevoke = active.slice(0, active.length - MAX_CONCURRENT_SESSIONS + 1);
    const stmt = db.raw.prepare("UPDATE password_reset_tokens SET usado=1 WHERE id=?");
    toRevoke.forEach(r => stmt.run(r.id));
  }
}

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res) => {
  const { usuario, password, empresa } = req.body;
  const { getEmpresaDB } = require('../db_sqlite');
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

  if (user.must_change_password) {
    const tempToken = jwt.sign(
      { id: user.id, purpose: 'change_password', empresa },
      getSecret(),
      { expiresIn: '15m' }
    );
    return res.json({ require_password_change: true, temp_token: tempToken, user: { nombre: user.nombre, email: user.email || '' } });
  }

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
  const twofaRow = userDB.raw.prepare("SELECT enabled FROM user_2fa WHERE user_id=? AND enabled=1").get(user.id);
  if (twofaRow) {
    const tempToken = jwt.sign(
      { id: user.id, purpose: '2fa', empresa },
      getSecret(),
      { expiresIn: '5m' }
    );
    return res.json({ require_2fa: true, temp_token: tempToken, user: { nombre: user.nombre, email: user.email || '' } });
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

  setRefreshCookie(res, refreshToken);
  res.json(buildLoginResponse(user, accessToken, refreshToken, userDB));
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies && req.cookies['refresh-token'];
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token faltante' });
  }

  const empresa = req.body.empresa || 'default';
  const { getEmpresaDB } = require('../db_sqlite');
  const userDB = getEmpresaDB(empresa);
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

  // Issue new tokens
  const { accessToken, refreshToken: newRefresh } = generateTokens(user, empresa);
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

  setRefreshCookie(res, newRefresh);
  res.json(buildLoginResponse(user, accessToken, newRefresh, userDB));
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const refreshToken = req.cookies && req.cookies['refresh-token'];
  if (refreshToken) {
    const empresa = req.body.empresa || 'default';
    const { getEmpresaDB } = require('../db_sqlite');
    const userDB = getEmpresaDB(empresa);
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    try {
      const stored = userDB.where('password_reset_tokens', t => t.token === hash)[0];
      if (stored) userDB.update('password_reset_tokens', stored.id, { usado: 1 });
    } catch(e) { /* non-blocking */ }
  }
  res.clearCookie('refresh-token', { path: '/api/auth' });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const userDB = _getDB(req);
  const token = jwt.sign(
    { id: req.user.id, rol: req.user.rol, empresa: req.user.empresa },
    getSecret(),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
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

// GET /api/auth/usuarios
router.get('/usuarios', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const empleados = db.all('empleados');
  return res.json(db.find('usuarios', { activo: true }).map(u => {
    const {password,...r}=u;
    const emp = empleados.find(e => e.usuario_id === u.id);
    if (emp) r.empleado_id = emp.id;
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
  const { empresa_nombre, email, password, rubro } = req.body;
  if (!empresa_nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre del negocio, email y contraseña requeridos' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'La contraseña debe incluir una mayúscula y un número' });

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
  });

  // Create admin user
  const hash = await bcrypt.hash(password, 10);
  const adminId = 'u' + uid();
  const usuario = email.split('@')[0].replace(/[^a-z0-9_]/g, '_').substring(0, 20);
  empDB.insert('usuarios', {
    id: adminId, nombre: 'Admin', usuario: usuario,
    email: email.trim().toLowerCase(), password: hash,
    rol: 'admin', roles: JSON.stringify(['admin']), activo: true,
    creado: new Date().toISOString(), password_changed_at: new Date().toISOString(),
  });

  // Auto-create empleado
  const empId = uid();
  empDB.insert('empleados', {
    id: empId, nombre: 'Admin', apellido: null, email: email.trim().toLowerCase(),
    fecha_ingreso: new Date().toISOString().substr(0, 10), activo: 1,
    usuario_id: adminId, creado: new Date().toISOString(),
  });

  // Create default sucursal
  empDB.insert('sucursales', {
    id: uid(), nombre: empresa_nombre, dir: '', activo: true,
    creado: new Date().toISOString(),
  });

  console.log('[Signup] Nueva empresa:', finalCodigo, '—', email);

  // Send welcome email (async, non-blocking)
  setImmediate(async () => {
    try {
      const { getGlobalConfig } = require('../db_master');
      const { decryptValue } = require('../lib/crypto-utils');
      const smtpHost = getGlobalConfig('smtp_host');
      const smtpPort = parseInt(getGlobalConfig('smtp_port')) || 465;
      const smtpUser = getGlobalConfig('smtp_user');
      const encryptedPass = getGlobalConfig('smtp_pass');
      const smtpPass = encryptedPass ? decryptValue(encryptedPass) : '';
      const smtpFrom = getGlobalConfig('smtp_from') || smtpUser;
      const smtpFromName = getGlobalConfig('smtp_from_name') || 'FlexCRM';
      if (smtpHost && smtpUser && smtpPass && email) {
        const { sendEmail } = require('../lib/send-email');
        const appUrl = process.env.APP_URL || 'https://app.flexcrm.com.ar';
        const html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
<h2 style="color:#6366f1">🚀 ¡Bienvenido a FlexCRM!</h2>
<p>Hola <strong>${empresa_nombre}</strong>,</p>
<p>Tu cuenta de prueba de <strong>14 días</strong> está activa. Ya podés empezar a usar FlexCRM sin restricciones.</p>
<div style="background:#f8fafc;border-radius:8px;padding:16px;margin:16px 0">
  <p style="margin:0 0 8px"><strong>🔗 Acceso:</strong> <a href="${appUrl}/app/login" style="color:#6366f1">${appUrl}/app/login</a></p>
  <p style="margin:0 0 8px"><strong>🏢 Empresa:</strong> ${finalCodigo}</p>
  <p style="margin:0"><strong>👤 Usuario:</strong> ${usuario}</p>
</div>
<p style="color:#64748b;font-size:14px">📋 <strong>Primeros pasos:</strong></p>
<ol style="color:#64748b;font-size:14px">
  <li>Cargá tus productos desde el menú Productos (o importá por Excel)</li>
  <li>Creá usuarios para tu equipo desde Usuarios</li>
  <li>Empezá a vender desde el Punto de Venta (POS)</li>
</ol>
<p style="color:#64748b;font-size:14px">¿Dudas? Escribime por WhatsApp al <a href="https://wa.me/5493517424391">+54 9 351 742-4391</a>.</p>
<p style="color:#94a3b8;font-size:12px;margin-top:24px">FlexCRM — Hecho en Argentina 🇦🇷</p></div>`;
        await sendEmail(smtpHost, smtpPort, smtpUser, smtpPass, `"${smtpFromName}" <${smtpFrom}>`, email, '🚀 Bienvenido a FlexCRM — Tu cuenta está lista', html);
        console.log('[Signup] Welcome email sent to:', email);
      }
    } catch(e) { console.error('[Signup] Welcome email error:', e.message); }
  });

  // Generate JWT
  const token = jwt.sign(
    { id: adminId, rol: 'admin', empresa: finalCodigo, nombre: 'Admin' },
    getSecret(), { expiresIn: '24h' }
  );

  res.json({ ok: true, token, empresa: finalCodigo, nombre: 'Admin', empresa_nombre, mensaje: `Prueba gratuita de ${trialDays} días activada` });
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
  const { nombre, email, rol, suc_id, password } = req.body;
  const roles = req.body.roles;
  const suc_sesiones_permitidas = req.body.suc_sesiones_permitidas;
  const upd = { nombre, email, rol, suc_id: suc_id || null };
  if (Array.isArray(roles) && roles.length) upd.roles = roles;
  if (Array.isArray(suc_sesiones_permitidas)) upd.suc_sesiones_permitidas = suc_sesiones_permitidas;
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
  db.update('usuarios', req.params.id, { password: hash, debe_cambiar_password: 1, password_changed_at: new Date().toISOString() });

  // Invalidate all refresh tokens
  db.raw.prepare("UPDATE password_reset_tokens SET usado=1 WHERE usuario_id=? AND id LIKE 'rt_%'").run(req.params.id);

  // Try to send email with temp password
  try {
    const cfg = db.getConfig();
    const host = cfg.smtp_host;
    const port = parseInt(cfg.smtp_port) || 465;
    const smtpUser = cfg.smtp_user;
    const smtpPass = cfg.smtp_pass;
    const from = cfg.smtp_from || 'noreply@unfulanodev.com.ar';
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

  res.json({ ok: true, mensaje: 'Contrasea restablecida. El usuario debe cambiarla al ingresar.' + (user.email ? ' Se envio por email.' : '') });
});

function buildResetEmailHtml(resetLink, empresaNombre) {
  const nombre = empresaNombre || 'FlexCRM';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08)">
<tr><td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #e4e4e7">
<div style="font-size:22px;font-weight:800;color:#18181b">${nombre}</div>
<div style="font-size:13px;color:#71717a;margin-top:4px">Restablecer contraseña</div>
</td></tr>
<tr><td style="padding:24px 32px">
<p style="font-size:14px;color:#3f3f46;line-height:1.6;margin:0 0 16px">Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
<p style="font-size:14px;color:#3f3f46;line-height:1.6;margin:0 0 20px">Hacé clic en el botón de abajo para crear una nueva contraseña. Este enlace es válido por <strong>1 hora</strong>.</p>
<table cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 24px">
<a href="${resetLink}" style="display:inline-block;padding:12px 32px;background:#F97316;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px">Restablecer contraseña</a>
</td></tr></table>
<p style="font-size:13px;color:#71717a;line-height:1.5;margin:0">Si no solicitaste este cambio, podés ignorar este mensaje. Tu contraseña actual sigue siendo segura.</p>
</td></tr>
<tr><td style="padding:16px 32px;text-align:center;border-top:1px solid #e4e4e7;font-size:11px;color:#a1a1aa">
${nombre} — Sistema de gestión
</td></tr>
</table>
</td></tr></table></body></html>`;
}

function buildResetConfirmedHtml(loginLink) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08)">
<tr><td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #e4e4e7">
<div style="font-size:22px;font-weight:800;color:#18181b">FlexCRM</div>
</td></tr>
<tr><td style="padding:24px 32px;text-align:center">
<div style="font-size:48px;margin-bottom:12px">✅</div>
<p style="font-size:15px;color:#3f3f46;font-weight:600;margin:0 0 8px">Contraseña actualizada</p>
<p style="font-size:13px;color:#71717a;line-height:1.5;margin:0 0 20px">Tu contraseña se actualizó correctamente. Ya podés iniciar sesión con tu nueva contraseña.</p>
<table cellpadding="0" cellspacing="0"><tr><td align="center">
<a href="${loginLink}" style="display:inline-block;padding:12px 32px;background:#F97316;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px">Ir al inicio de sesión</a>
</td></tr></table>
</td></tr></table>
</td></tr></table></body></html>`;
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
  const userDB = getEmpresaDB(empresa);
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
        const fromName = getGlobalConfig('smtp_from_name') || 'FlexCRM';
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
  const userDB = getEmpresaDB(empresa);
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
    const from = cfg.smtp_from || 'noreply@unfulanodev.com.ar';
    if (host && smtpUser && smtpPass && rt.email) {
      const loginLink = `${req.protocol}://${req.get('host')}/app/login`;
      await sendEmail(host, parseInt(cfg.smtp_port) || 465, smtpUser, smtpPass, from, rt.email, 'Contraseña actualizada — FlexCRM', buildResetConfirmedHtml(loginLink));
    }
  } catch (e) { /* non-blocking */ }

  res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
});

module.exports = router;
module.exports.buildLoginResponse = buildLoginResponse;
module.exports.generateTokens = generateTokens;
module.exports.setRefreshCookie = setRefreshCookie;
