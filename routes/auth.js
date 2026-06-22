const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol, getSecret } = require('../middleware/auth');

// ── Login lockout (in-memory) ──
const MAX_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 15;
const loginAttempts = new Map(); // key: `${empresa}:${usuario}` → { count, lastAttempt, lockedUntil }

function getLoginKey(empresa, usuario) {
  return `${empresa}:${usuario.toLowerCase().trim()}`;
}

function checkLocked(empresa, usuario) {
  const key = getLoginKey(empresa, usuario);
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (entry.lockedUntil && new Date(entry.lockedUntil) > new Date()) return true;
  if (entry.lockedUntil && new Date(entry.lockedUntil) <= new Date()) {
    loginAttempts.delete(key);
    return false;
  }
  return false;
}

function recordFailedAttempt(empresa, usuario) {
  const key = getLoginKey(empresa, usuario);
  const now = new Date();
  const entry = loginAttempts.get(key) || { count: 0, lastAttempt: now, lockedUntil: null };
  entry.count += 1;
  entry.lastAttempt = now;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60000);
  }
  loginAttempts.set(key, entry);
  return MAX_ATTEMPTS - entry.count; // remaining attempts
}

function resetAttempts(empresa, usuario) {
  const key = getLoginKey(empresa, usuario);
  loginAttempts.delete(key);
}

// Busca el vendedor asociado a un usuario — lógica centralizada aquí
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

function buildLoginResponse(user, token, empresaDB) {
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
  return { token, user: userData, sucursal: suc, vendedor };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { usuario, password, empresa = 'default' } = req.body;
  if (!usuario || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  // Check lockout
  if (checkLocked(empresa, usuario)) {
    return res.status(429).json({
      error: `Demasiados intentos. Esperá ${LOCKOUT_MINUTES} minutos antes de intentar de nuevo.`,
      locked: true, locked_minutes: LOCKOUT_MINUTES
    });
  }
  // Use empresa-specific DB at login time (no token yet)
  const { getEmpresaDB } = require('../db_sqlite');
  const db = getEmpresaDB(empresa);
  const user = db.where('usuarios', u => (u.usuario === usuario || u.email === usuario) && u.activo)[0];
  if (!user) {
    recordFailedAttempt(empresa, usuario);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    const remaining = recordFailedAttempt(empresa, usuario);
    if (remaining <= 0) {
      return res.status(429).json({
        error: `Demasiados intentos. Esperá ${LOCKOUT_MINUTES} minutos antes de intentar de nuevo.`,
        locked: true, locked_minutes: LOCKOUT_MINUTES
      });
    }
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  // Successful login — reset attempts
  resetAttempts(empresa, usuario);
  // Auto-create default sucursal if empresa has none
  try {
    const allSucsRaw = db.find('sucursales', {});
    const sucsActivas = allSucsRaw.filter(function(s){ return s.activo !== false && s.activo !== 0; });
    console.log('[Auth] empresa:', empresa, '| sucs total:', allSucsRaw.length, '| activas:', sucsActivas.length);
    if(sucsActivas.length === 0) {
      const { uid } = require('../db_sqlite');
      const cfgNombre = db.getConfig('nombre') || empresa;
      const newId = uid();
      db.insert('sucursales', { id: newId, nombre: cfgNombre, dir: '', activo: true, creado: new Date().toISOString() });
      console.log('[Auth] SUCURSAL AUTO-CREADA id:', newId, 'empresa:', empresa);
    }
  } catch(e) { console.error('[Auth] Sucursal auto-create error:', e.message, e.stack); }
  const token = jwt.sign({ id: user.id, rol: user.rol, empresa: empresa }, getSecret(), { expiresIn: '7d' });
  res.json(buildLoginResponse(user, token, db));
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const userDB = _getDB(req);
  const token = jwt.sign({ id: req.user.id, rol: req.user.rol, empresa: req.user.empresa }, getSecret(), { expiresIn: '7d' });
  res.json(buildLoginResponse(req.user, token, userDB));
});

// POST /api/auth/cambiar-password
router.post('/cambiar-password', authMiddleware, async (req, res) => {
  const db = _getDB(req);
  const { password_actual, password_nuevo } = req.body;
  if (!password_actual || !password_nuevo) return res.status(400).json({ error: 'Campos requeridos' });
  if (password_nuevo.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' });
  const ok = await bcrypt.compare(password_actual, req.user.password);
  if (!ok) return res.status(400).json({ error: 'Contraseña actual incorrecta' });
  const hash = await bcrypt.hash(password_nuevo, 10);
  db.update('usuarios', req.user.id, { password: hash });
  res.json({ ok: true });
});

// GET /api/auth/usuarios
router.get('/usuarios', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  res.json(db.find('usuarios', { activo: true }).map(u => { const {password,...r}=u; return r; }));
});

// POST /api/auth/usuarios
router.post('/usuarios', authMiddleware, requireRol('admin'), async (req, res) => {
  const db = _getDB(req);
  const { nombre, usuario, email, password, rol, suc_id } = req.body;
  const suc_sesiones_permitidas = req.body.suc_sesiones_permitidas;
  if (!nombre || !usuario || !password) return res.status(400).json({ error: 'Nombre, usuario y contraseña requeridos' });
  const existe = db.where('usuarios', u => u.usuario === usuario)[0];
  if (existe) return res.status(400).json({ error: 'El usuario ya existe' });
  // Check plan limit
  try {
    const { getEmpresa } = require('../db_master');
    const empresa = getEmpresa(req.user.empresa || 'default');
    if(empresa && empresa.usuarios_max) {
      const total = db.where('usuarios', u => u.activo !== false && u.activo != 0).length;
      if(total >= empresa.usuarios_max) {
        return res.status(403).json({
          error: `Tu plan permite hasta ${empresa.usuarios_max} usuario(s). Ya tenés ${total}. Mejorá tu plan para agregar más.`,
          limite_plan: true
        });
      }
    }
  } catch(e) { /* allow creation if master db check fails */ }
  const hash = await bcrypt.hash(password, 10);
  const roles = req.body.roles;
  const r = db.insert('usuarios', { id:'u'+uid(), nombre, usuario, email:email||'', password:hash, rol:rol||'vendedor', roles: Array.isArray(roles)&&roles.length?roles:[rol||'vendedor'], suc_id:suc_id||null, suc_sesiones_permitidas:Array.isArray(suc_sesiones_permitidas)?suc_sesiones_permitidas:(suc_id?[suc_id]:[]), activo:true, creado:new Date().toISOString() });
  const {password:_,...safe}=r;
  res.json(safe);
});

// PUT /api/auth/usuarios/:id
router.put('/usuarios/:id', authMiddleware, requireRol('admin'), async (req, res) => {
  const db = _getDB(req);
  const { nombre, email, rol, suc_id, password } = req.body;
  const roles = req.body.roles;
  const suc_sesiones_permitidas = req.body.suc_sesiones_permitidas;
  const upd = { nombre, email, rol, suc_id: suc_id||null };
  if (Array.isArray(roles) && roles.length) upd.roles = roles;
  if (Array.isArray(suc_sesiones_permitidas)) upd.suc_sesiones_permitidas = suc_sesiones_permitidas;
  if (password && password.length >= 6) upd.password = await bcrypt.hash(password, 10);
  const r = db.update('usuarios', req.params.id, upd);
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  const {password:_,...safe}=r;
  res.json(safe);
});

// DELETE /api/auth/usuarios/:id
router.delete('/usuarios/:id', authMiddleware, requireRol('admin'), (req, res) => {
  const db = _getDB(req);
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });
  db.softDel('usuarios', req.params.id);
  res.json({ ok: true });
});

// ── Forgot Password ────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { usuario, empresa = 'default' } = req.body;
  if (!usuario) return res.status(400).json({ error: 'Ingresá tu usuario o email' });
  const { getEmpresaDB, uid } = require('../db_sqlite');
  const db = getEmpresaDB(empresa);
  const user = db.where('usuarios', u => (u.usuario === usuario || u.email === usuario) && u.activo)[0];
  // Always return ok — don't reveal if user exists
  if (!user) return res.json({ ok: true, mensaje: 'Si el usuario existe, recibirás un email con instrucciones' });
  const email = user.email;
  if (!email) return res.json({ ok: true, mensaje: 'Si el usuario existe, recibirás un email con instrucciones' });
  const token = require('crypto').randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour
  db.insert('password_reset_tokens', {
    id: uid(), usuario_id: user.id, email, token,
    expires, usado: 0, creado: new Date().toISOString()
  });
  // Send email via nodemailer
  try {
    const cfg = db.getConfig();
    const host = cfg.smtp_host;
    const port = parseInt(cfg.smtp_port) || 465;
    const smtpUser = cfg.smtp_user;
    const smtpPass = cfg.smtp_pass;
    const from = cfg.smtp_from || 'noreply@flexcrm.com';
    if (!host || !smtpUser || !smtpPass) {
      console.log('[PasswordReset] SMTP no configurado — token:', token, 'para', email);
      return res.json({ ok: true, mensaje: 'Si el usuario existe, recibirás un email con instrucciones' });
    }
    let nodemailer;
    try { nodemailer = require('nodemailer'); }
    catch (e) { throw new Error('nodemailer not installed'); }
    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
    const resetLink = `${req.protocol}://${req.get('host')}/app/reset-password?token=${token}&empresa=${empresa}`;
    await transporter.sendMail({
      from, to: email,
      subject: 'Restablecer contraseña — FlexCRM',
      html: `<p>Hacé clic para restablecer tu contraseña:</p><p><a href="${resetLink}">${resetLink}</a></p><p>Válido por 1 hora.</p>`
    });
    res.json({ ok: true, mensaje: 'Si el usuario existe, recibirás un email con instrucciones' });
  } catch (e) {
    console.error('[PasswordReset] Email error:', e.message);
    res.json({ ok: true, mensaje: 'Si el usuario existe, recibirás un email con instrucciones' });
  }
});

// ── Reset Password ─────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password, empresa = 'default' } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token y contraseña requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' });
  const { getEmpresaDB } = require('../db_sqlite');
  const db = getEmpresaDB(empresa);
  const rt = db.where('password_reset_tokens', t => t.token === token && t.usado === 0)[0];
  if (!rt) return res.status(400).json({ error: 'Token inválido o ya usado' });
  if (new Date(rt.expires) < new Date()) return res.status(400).json({ error: 'Token expirado. Solicitá uno nuevo.' });
  const hash = await require('bcryptjs').hash(password, 10);
  db.update('usuarios', rt.usuario_id, { password: hash });
  db.update('password_reset_tokens', rt.id, { usado: 1 });
  // Log the user out globally by changing their password version? For simplicity, just succeed.
  res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
});

module.exports = router;
