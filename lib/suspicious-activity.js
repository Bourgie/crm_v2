function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || 'unknown'
}

function getUa(req) {
  return (req.headers['user-agent'] || '').substring(0, 500)
}

const LOGIN_FAIL_THRESHOLD = 5

module.exports = {
  getIp,
  getUa,

  buildExtra(req, extra) {
    return { ip: getIp(req), ua: getUa(req), ts: new Date().toISOString(), ...extra }
  },

  auditLoginSuccess(req, db, user) {
    db.audit(user, null, 'auth', 'login', 'Inicio de sesión exitoso', user.id, this.buildExtra(req))
  },

  auditLoginFailed(req, db, empresa, username, attemptCount) {
    db.audit(null, null, 'auth', 'login_failed', 'Intento de inicio de sesión fallido', null, this.buildExtra(req, { empresa, username, attemptCount }))
  },

  auditForgotPassword(req, db, empresa, username) {
    db.audit(null, null, 'auth', 'forgot_password_request', 'Solicitud de restablecimiento de contraseña', null, this.buildExtra(req, { empresa, username }))
  },

  auditPasswordReset(req, db, user) {
    db.audit(user, null, 'auth', 'password_reset', 'Contraseña restablecida', user.id, this.buildExtra(req))
  },

  isSuspicious(req, userDB) {
    const ip = getIp(req)
    const recent = userDB.raw.prepare(`
      SELECT data FROM audit_log
      WHERE modulo='auth' AND accion='login_failed'
        AND fecha > datetime('now', '-30 minutes')
      ORDER BY fecha DESC LIMIT 20
    `).all()
    const fromThisIp = recent.filter(e => {
      try { const d = JSON.parse(e.data); return d.ip === ip } catch { return false }
    })
    return fromThisIp.length >= LOGIN_FAIL_THRESHOLD
  },
}
