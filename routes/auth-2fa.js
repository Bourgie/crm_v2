const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { totp } = require('../lib/totp');
const { db, uid } = require('../db_sqlite');
const { authMiddleware, getSecret } = require('../middleware/auth');
const { validate, twofaSetupSchema, twofaConfirmSchema, twofaVerifySchema, twofaDisableSchema } = require('../middleware/validate');

const TWOFA_TEMP_EXPIRY = '5m';

function getDB(req) {
  return (req && req.db) || db;
}

function is2faMandatory(userData, userDB) {
  let perUser = null;
  if (userData.data) {
    try { const d = typeof userData.data === 'string' ? JSON.parse(userData.data) : userData.data;
      if (d && typeof d.force2fa === 'boolean') perUser = d.force2fa;
    } catch(e) {}
  }
  if (perUser === true) return true;
  if (perUser === false) return false;
  try {
    const cfg = userDB.getConfig();
    return cfg['2fa_obligatorio'] === '1' || cfg['2fa_obligatorio'] === 1 || cfg['2fa_obligatorio'] === true;
  } catch(e) { return false; }
}

function generateBackupCodes(userId, userDB) {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    userDB.insert('user_2fa_backup_codes', {
      id: 'bc_' + uid(),
      user_id: userId,
      code_hash: hash,
      used: 0,
      created_at: new Date().toISOString(),
    });
    codes.push(code);
  }
  return codes;
}

function issueSessionTokens(res, user, empresa, userDB, req) {
  const auth = require('./auth');
  const cryptoMod = require('crypto');
  const refreshHashPlaceholder = cryptoMod.createHash('sha256').update(crypto.randomBytes(16).toString('hex')).digest('hex');
  const sid = auth.createSessionRecord(userDB, user.id, refreshHashPlaceholder, req || { headers: { 'user-agent': '' }, ip: '' });
  const { accessToken, refreshToken } = auth.generateTokens(user, empresa, sid);
  const refreshHash = cryptoMod.createHash('sha256').update(refreshToken).digest('hex');
  userDB.insert('password_reset_tokens', {
    id: 'rt_' + uid(),
    usuario_id: user.id,
    email: user.email || '',
    token: refreshHash,
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    usado: 0,
    creado: new Date().toISOString(),
  });
  userDB.raw.prepare("UPDATE user_sessions SET token_hash=? WHERE id=?").run(refreshHash, sid);
  auth.setRefreshCookie(res, refreshToken);
  auth.setAccessCookie(res, accessToken);
  return { ...auth.buildLoginResponse(user, accessToken, refreshToken, userDB, sid), session_id: sid };
}

// GET /api/auth/2fa/status — si el usuario tiene 2FA activo + si es obligatorio
router.get('/status', authMiddleware, (req, res) => {
  const userDB = getDB(req);
  const row = userDB.raw.prepare("SELECT enabled FROM user_2fa WHERE user_id=?").get(req.user.id);
  const enabled = row ? !!row.enabled : false;
  try {
    const u = userDB.findOne('usuarios', req.user.id);
    res.json({ enabled, obligatorio: is2faMandatory(u, userDB) });
  } catch(e) { res.json({ enabled, obligatorio: false }); }
});

// POST /api/auth/2fa/setup — genera secret TOTP, devuelve QR URI (autenticado)
router.post('/setup', authMiddleware, validate(twofaSetupSchema), (req, res) => {
  const userDB = getDB(req);
  const label = req.user.email || req.user.usuario || req.user.id;

  const existing = userDB.raw.prepare("SELECT * FROM user_2fa WHERE user_id=?").get(req.user.id);
  if (existing && existing.enabled) return res.status(400).json({ error: 'Ya tenés 2FA activo. Deshabilitalo primero si querés cambiarlo.' });

  const secret = totp.generateSecret();
  const issuer = req.user.empresa || 'FlexCRM';
  const otpauth = totp.toURI({ label, issuer, secret });

  if (existing) {
    userDB.raw.prepare("UPDATE user_2fa SET secret=?, enabled=0 WHERE user_id=?").run(secret, req.user.id);
  } else {
    userDB.insert('user_2fa', {
      user_id: req.user.id,
      secret,
      enabled: 0,
      created_at: new Date().toISOString(),
    });
  }

  res.json({ secret, otpauth, email: label });
});

// POST /api/auth/2fa/setup-forced — genera secret sin sesión (temp_token)
router.post('/setup-forced', (req, res) => {
  const { temp_token } = req.body;
  if (!temp_token) return res.status(400).json({ error: 'Token temporal requerido' });

  let payload;
  try { payload = jwt.verify(temp_token, getSecret()); }
  catch (e) { return res.status(401).json({ error: 'Token temporal inválido o expirado' }); }
  if (payload.purpose !== '2fa_setup') return res.status(401).json({ error: 'Token inválido' });

  const empresa = payload.empresa;
  const { getEmpresaDB } = require('../db_sqlite');
  const userDB = getEmpresaDB(empresa);
  const user = userDB.findOne('usuarios', payload.id);
  if (!user || !user.activo) return res.status(401).json({ error: 'Usuario no válido' });

  const label = user.email || user.usuario || payload.id;
  const existing = userDB.raw.prepare("SELECT * FROM user_2fa WHERE user_id=?").get(payload.id);
  if (existing && existing.enabled) return res.status(400).json({ error: '2FA ya está activo' });

  const secret = totp.generateSecret();
  const issuer = empresa || 'FlexCRM';
  const otpauth = totp.toURI({ label, issuer, secret });

  if (existing) {
    userDB.raw.prepare("UPDATE user_2fa SET secret=?, enabled=0 WHERE user_id=?").run(secret, payload.id);
  } else {
    userDB.insert('user_2fa', {
      user_id: payload.id,
      secret,
      enabled: 0,
      created_at: new Date().toISOString(),
    });
  }

  res.json({ secret, otpauth, email: label });
});

// POST /api/auth/2fa/confirm — verifica primer código y habilita 2FA (autenticado)
router.post('/confirm', authMiddleware, validate(twofaConfirmSchema), (req, res) => {
  const userDB = getDB(req);
  const { code } = req.body;

  const row = userDB.raw.prepare("SELECT * FROM user_2fa WHERE user_id=?").get(req.user.id);
  if (!row) return res.status(400).json({ error: 'No hay secret de 2FA. Ejecutá /setup primero.' });
  if (row.enabled) return res.status(400).json({ error: '2FA ya está habilitado' });

  const isValid = totp.verify({ token: code, secret: row.secret }).valid;
  if (!isValid) return res.status(400).json({ error: 'Código inválido. Probá de nuevo.' });

  userDB.raw.prepare("UPDATE user_2fa SET enabled=1 WHERE user_id=?").run(req.user.id);

  userDB.raw.prepare("DELETE FROM user_2fa_backup_codes WHERE user_id=?").run(req.user.id);
  const backupCodes = generateBackupCodes(req.user.id, userDB);

  res.json({ ok: true, backup_codes: backupCodes, mensaje: '2FA activado correctamente. Guardá tus códigos de respaldo.' });
});

// POST /api/auth/2fa/confirm-login — verifica primer código + completa login (sin sesión)
router.post('/confirm-login', validate(twofaConfirmSchema), (req, res) => {
  const { temp_token, code } = req.body;
  if (!temp_token) return res.status(400).json({ error: 'Token temporal requerido' });

  let payload;
  try { payload = jwt.verify(temp_token, getSecret()); }
  catch (e) { return res.status(401).json({ error: 'Token temporal inválido o expirado' }); }
  if (payload.purpose !== '2fa_setup') return res.status(401).json({ error: 'Token inválido' });

  const empresa = payload.empresa;
  const { getEmpresaDB } = require('../db_sqlite');
  const userDB = getEmpresaDB(empresa);
  const user = userDB.findOne('usuarios', payload.id);
  if (!user || !user.activo) return res.status(401).json({ error: 'Usuario no válido' });

  const row = userDB.raw.prepare("SELECT * FROM user_2fa WHERE user_id=?").get(payload.id);
  if (!row) return res.status(400).json({ error: 'No hay secret de 2FA. Ejecutá /setup-forced primero.' });
  if (row.enabled) return res.status(400).json({ error: '2FA ya está habilitado' });

  const isValid = totp.verify({ token: code, secret: row.secret }).valid;
  if (!isValid) return res.status(400).json({ error: 'Código inválido. Probá de nuevo.' });

  userDB.raw.prepare("UPDATE user_2fa SET enabled=1 WHERE user_id=?").run(payload.id);
  userDB.raw.prepare("DELETE FROM user_2fa_backup_codes WHERE user_id=?").run(payload.id);
  generateBackupCodes(payload.id, userDB);

  const loginResponse = issueSessionTokens(res, user, empresa, userDB);
  res.json(loginResponse);
});

// POST /api/auth/2fa/disable — deshabilita 2FA (requiere password o código 2FA)
router.post('/disable', authMiddleware, validate(twofaDisableSchema), async (req, res) => {
  const userDB = getDB(req);
  const { password, code } = req.body;

  const u = userDB.findOne('usuarios', req.user.id);
  if (is2faMandatory(u, userDB)) {
    return res.status(400).json({ error: 'El 2FA es obligatorio en esta empresa. No podés deshabilitarlo.' });
  }

  if (password) {
    const ok = await bcrypt.compare(password, req.user.password);
    if (!ok) return res.status(400).json({ error: 'Contraseña incorrecta' });
  } else if (code) {
    const row = userDB.raw.prepare("SELECT * FROM user_2fa WHERE user_id=?").get(req.user.id);
    if (!row) return res.status(400).json({ error: 'No hay 2FA configurado' });
    const isValid = totp.verify({ token: code, secret: row.secret }).valid;
    if (!isValid) {
      const hash = crypto.createHash('sha256').update(code).digest('hex');
      const bcRow = userDB.raw.prepare("SELECT id FROM user_2fa_backup_codes WHERE user_id=? AND code_hash=? AND used=0").get(req.user.id, hash);
      if (!bcRow) return res.status(400).json({ error: 'Código inválido' });
      userDB.raw.prepare("UPDATE user_2fa_backup_codes SET used=1 WHERE id=?").run(bcRow.id);
    }
  } else {
    return res.status(400).json({ error: 'Enviá password o code para deshabilitar 2FA' });
  }

  userDB.raw.prepare("DELETE FROM user_2fa WHERE user_id=?").run(req.user.id);
  userDB.raw.prepare("DELETE FROM user_2fa_backup_codes WHERE user_id=?").run(req.user.id);
  res.json({ ok: true, mensaje: '2FA deshabilitado' });
});

// POST /api/auth/2fa/backup-codes — regenera códigos de respaldo
router.post('/backup-codes', authMiddleware, (req, res) => {
  const userDB = getDB(req);
  const row = userDB.raw.prepare("SELECT enabled FROM user_2fa WHERE user_id=?").get(req.user.id);
  if (!row || !row.enabled) return res.status(400).json({ error: '2FA no está activo' });

  userDB.raw.prepare("DELETE FROM user_2fa_backup_codes WHERE user_id=?").run(req.user.id);
  const backupCodes = generateBackupCodes(req.user.id, userDB);
  res.json({ backup_codes: backupCodes });
});

// POST /api/auth/2fa/verify-login — verifica código TOTP/backup + temp_token
router.post('/verify-login', validate(twofaVerifySchema), (req, res) => {
  const { temp_token, code, empresa } = req.body;
  const { getEmpresaDB } = require('../db_sqlite');
  const userDB = getEmpresaDB(empresa);

  let payload;
  try {
    payload = jwt.verify(temp_token, getSecret());
  } catch (e) {
    return res.status(401).json({ error: 'Token temporal inválido o expirado' });
  }
  if (payload.purpose !== '2fa') return res.status(401).json({ error: 'Token inválido' });

  const row = userDB.raw.prepare("SELECT * FROM user_2fa WHERE user_id=?").get(payload.id);
  if (!row || !row.enabled) return res.status(400).json({ error: '2FA no está activo para este usuario' });

  let valid = totp.verify({ token: code, secret: row.secret }).valid;
  if (!valid) {
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    const bcRow = userDB.raw.prepare("SELECT id FROM user_2fa_backup_codes WHERE user_id=? AND code_hash=? AND used=0").get(payload.id, hash);
    if (!bcRow) return res.status(400).json({ error: 'Código inválido o ya usado' });
    userDB.raw.prepare("UPDATE user_2fa_backup_codes SET used=1 WHERE id=?").run(bcRow.id);
  }

  const user = userDB.findOne('usuarios', payload.id);
  if (!user || !user.activo) return res.status(401).json({ error: 'Usuario no válido' });

  const loginResponse = issueSessionTokens(res, user, empresa, userDB);
  res.json(loginResponse);
});

// POST /api/auth/usuarios/:id/reset-2fa — admin resetea 2FA de un usuario
router.post('/usuarios/:id/reset-2fa', authMiddleware, (req, res) => {
  const { requireRol } = require('../middleware/auth');
  if (req.user.rol !== 'admin' && (!Array.isArray(req.user.roles) || !req.user.roles.includes('admin'))) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  const userDB = getDB(req);
  const target = userDB.findOne('usuarios', req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

  userDB.raw.prepare("DELETE FROM user_2fa WHERE user_id=?").run(req.params.id);
  userDB.raw.prepare("DELETE FROM user_2fa_backup_codes WHERE user_id=?").run(req.params.id);

  userDB.audit(req.user, req.user.suc_id, 'auth', 'reset_2fa',
    '2FA reseteado para usuario ' + (target.nombre || target.usuario || req.params.id), req.params.id);

  res.json({ ok: true, mensaje: '2FA reseteado. El usuario deberá configurarlo de nuevo al ingresar.' });
});

module.exports = router;
module.exports.is2faMandatory = is2faMandatory;
