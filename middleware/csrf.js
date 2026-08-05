const crypto = require('crypto');

const COOKIE_NAME = 'csrf-token';
const HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;

const SKIP_PATHS = [
  '/api/webhooks/receptor',
  '/api/meli-callback',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/signup',
  '/api/auth/refresh',
  '/api/auth/2fa/verify-login',
  '/api/auth/2fa/setup-forced',
  '/api/auth/2fa/confirm-login',
  '/api/auth/forced-password-change',
  '/api/auth/aceptar-terminos',
  '/api/auth/activar-cuenta',
  '/api/superadmin',
  '/api/config/public',
  '/api/health',
  '/api/version',
  '/api/landing',
];

function shouldSkip(path) {
  const fullPath = path.startsWith('/api') ? path : '/api' + path;
  return SKIP_PATHS.some(prefix => fullPath.startsWith(prefix));
}

function csrfProtection(req, res, next) {
  if (shouldSkip(req.originalUrl || req.url)) return next();

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (!req.cookies || !req.cookies[COOKIE_NAME]) {
      const token = crypto.randomBytes(TOKEN_LENGTH).toString('hex');
      res.cookie(COOKIE_NAME, token, {
        httpOnly: false,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 86400000,
      });
    }
    return next();
  }

  const cookieToken = req.cookies && req.cookies[COOKIE_NAME];
  const headerToken = req.headers[HEADER_NAME];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: 'CSRF token faltante' });
  }

  if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    return res.status(403).json({ error: 'CSRF token inválido' });
  }

  next();
}

function csrfTokenEndpoint(req, res) {
  const token = crypto.randomBytes(TOKEN_LENGTH).toString('hex');
  res.cookie(COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 86400000,
  });
  res.json({ token });
}

module.exports = { csrfProtection, csrfTokenEndpoint, COOKIE_NAME, HEADER_NAME };
