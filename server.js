require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';
const log = (...args) => { if (!isProd) console.log(...args); };

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const compression = require('compression');
const { csrfProtection, csrfTokenEndpoint } = require('./middleware/csrf');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Trust proxy (Railway / reverse proxy) ──
app.set('trust proxy', 1);

// ── HTTPS redirect in production ──
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, 'https://' + req.headers.host + req.originalUrl);
    }
    next();
  });
}

// ── Security headers (Helmet) ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── Compression (Gzip/Brotli) ──
app.use(compression());

// ── HPP (HTTP Parameter Pollution) protection ──
app.use(hpp());

// ── Cookie parser (needed for CSRF) ──
app.use(cookieParser());

// ── Input sanitization middleware (recursivo) ──
function sanitizeValue(val) {
  if (typeof val === 'string') {
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript\s*:/gi, '');
  }
  if (val && typeof val === 'object') {
    for (const k of Object.keys(val)) {
      val[k] = sanitizeValue(val[k]);
    }
  }
  return val;
}
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    for (const k of Object.keys(req.body)) {
      req.body[k] = sanitizeValue(req.body[k]);
    }
  }
  next();
});

// ── CORS ──
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Allow all LAN IPs in development
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i.test(origin)) return callback(null, true);
    callback(new Error('CORS: origen no permitido'));
  },
  credentials: true,
}));

// ── Rate limiting ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos. Esperá 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Demasiados intentos. Esperá 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos. Esperá 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const webhookReceptorLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { error: 'Demasiadas solicitudes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const meliCallbackLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas solicitudes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  message: { error: 'Demasiadas solicitudes. Intentá en un momento.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Body parsing ──
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static files ──
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
const reactDir = path.join(__dirname, 'public', 'app');
const fs = require('fs');
if (fs.existsSync(reactDir)) {
  app.use('/app/', express.static(reactDir));
  app.get('/app', (req, res) => res.redirect('/app/dashboard'));
  app.get('/app/*', (req, res) => {
    res.sendFile(path.join(reactDir, 'index.html'));
  });
}

// ── Initialize master DB (once) ──
require('./db_master');

// ── Health check (defined here, mounted after rate limiter below) ──
function healthHandler(req, res) {
  res.json({ ok: true, version: require('./package.json').version, env: process.env.NODE_ENV || 'development', ts: new Date().toISOString() });
}

// ── CSRF token endpoint ──
app.get('/api/csrf-token', csrfTokenEndpoint);

// ── Empresa tenant middleware — runs on all /api/* routes ──
app.use('/api', (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token && token !== 'null' && token !== 'undefined') {
    try {
      const jwt = require('jsonwebtoken');
      const { getSecret } = require('./middleware/auth');
      const payload = jwt.verify(token, getSecret());
      if (!req.user) req.user = payload;
      const { getEmpresaDB } = require('./db_sqlite');
      req.db = getEmpresaDB(payload.empresa || 'default');
    } catch(e) {
      if (process.env.NODE_ENV !== 'production') console.error('[tenant] JWT verify error:', e.message);
    }
  }
  next();
});

// ── Routes ──
const authRouter      = require('./routes/auth');
const configRouter    = require('./routes/config');
const dashRouter      = require('./routes/dashboard');
const ventasRouter    = require('./routes/ventas');
const clientesRouter  = require('./routes/clientes');
const prodRouter      = require('./routes/productos');
const cajaRouter      = require('./routes/caja');
const presRouter      = require('./routes/presupuestos');
const { sucRouter, vendRouter, provRouter, ocRouter, factProvRouter } = require('./routes/entidades');
const { pendRouter, ctacteRouter } = require('./routes/pendientes_ctacte');
const gastosRouter    = require('./routes/gastos');
const transfRouter    = require('./routes/transferencias');
const auditoriaRouter = require('./routes/auditoria');
const listaBebeRouter = require('./routes/listabebe');
const superadminRouter = require('./routes/superadmin');
const pipelineRouter   = require('./routes/pipeline');
const arcaRouter       = require('./routes/arca');
const { router: backupRouter, startBackupScheduler } = require('./routes/backup');
const { validateTenant } = require('./middleware/tenant');

// ── Tenant validation ──
app.use('/api', validateTenant);

// ── Public: MercadoLibre OAuth callback (sin auth) ──
app.use('/api/meli-callback', meliCallbackLimiter, require('./routes/sync-tienda-meli-callback'));

// ── Public config endpoint (login branding, no auth needed) ──
app.get('/api/config/public', (req, res) => {
  const empresa = req.query.empresa || 'default';
  try {
    const { getEmpresaDB } = require('./db_sqlite');
    const db = getEmpresaDB(empresa);
    const cfg = db.getConfig();
    res.json({ nombre: cfg.nombre||'', slogan: cfg.slogan||'', logo_url: cfg.logo_url||'', tema_color: cfg.tema_color||'' });
  } catch(e) { res.json({}); }
});

// Apply rate limiting
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/auth/reset-password', resetPasswordLimiter);
app.use('/api/webhooks/receptor/:token', webhookReceptorLimiter);
app.use('/api', apiLimiter);

// ── Health check (after rate limiter) ──
app.get('/api/health', healthHandler);

// ── CSRF protection for state-changing API requests ──
app.use('/api', csrfProtection);

// Mount routes
app.use('/api/auth',          authRouter);
app.use('/api/auth/2fa',      require('./routes/auth-2fa'));
app.use('/api/config',        configRouter);
app.use('/api/config',        backupRouter);
app.use('/api/dashboard',     dashRouter);
app.use('/api/ventas',        ventasRouter);
app.use('/api/clientes',      clientesRouter);
app.use('/api/productos',     prodRouter);
app.use('/api/caja',          cajaRouter);
app.use('/api/presupuestos',  presRouter);
app.use('/api/sucursales',    sucRouter);
app.use('/api/vendedores',    vendRouter);
app.use('/api/proveedores',         provRouter);
app.use('/api/proveedores/facturas',factProvRouter);
app.use('/api/ordenes-compra',      ocRouter);
app.use('/api/chat',                require('./routes/chat'));
app.use('/api/sync',                require('./routes/sync'));
app.use('/api/sync-tienda',         require('./routes/sync-tienda'));
app.use('/api/pendientes',    pendRouter);
app.use('/api/ctacte',        ctacteRouter);
app.use('/api/gastos',        gastosRouter);
app.use('/api/transferencias', transfRouter);
app.use('/api/auditoria',     auditoriaRouter);
app.use('/api/lista-bebe',    listaBebeRouter);
app.use('/api/pipeline',      pipelineRouter);
app.use('/api/codigos',       require('./routes/codigos'));
app.use('/api/webhooks',      require('./routes/webhooks').router);
app.use('/api/rrhh',          require('./routes/rrhh'));
app.use('/api/tareas',        require('./routes/tareas'));
app.use('/api/arca',          arcaRouter);
app.use('/api/superadmin',    superadminRouter);
app.use('/api/landing',       require('./routes/landing'));

// ── Version check (public, no auth) ──
app.get('/api/version', (req, res) => res.json({ version: 'v74', built: '2026-05-08' }));

// ── 404 for unknown API routes ──
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ── React SPA index path ──
const reactIndex = path.join(reactDir, 'index.html');

// ── Superadmin SPA — MUST be before /:codigo catch ──
if (fs.existsSync(reactIndex)) {
  app.get('/admin', (req, res) => res.sendFile(reactIndex));
  app.get('/admin/*', (req, res) => res.sendFile(reactIndex));
}

// ── Per-empresa login redirect ──
app.get('/:codigo', (req, res, next) => {
  if (!/^[a-z0-9_]+$/.test(req.params.codigo)) return next();
  try {
    const { getEmpresa } = require('./db_master');
    const e = getEmpresa(req.params.codigo);
    if (e) return res.redirect('/app/login?e=' + encodeURIComponent(req.params.codigo));
  } catch {}
  next();
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('*', (req, res) => {
  if (fs.existsSync(reactIndex)) return res.sendFile(reactIndex);
  res.redirect('/app/dashboard');
});

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: err.message });
  }
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message });
});

// ── Start (only when run directly) ──
module.exports = app;

if (require.main === module) {
  startBackupScheduler();

  if (process.env.LEAD_NOTIFICATION_EMAIL || process.env.NOTIFY_EMAIL_TO) {
    const { startStaleReminderScheduler } = require('./lib/stale-prospect-reminder');
    startStaleReminderScheduler();
  }

  function getLanIP() {
    const { networkInterfaces } = require('os');
    for (const iface of Object.values(networkInterfaces())) {
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) return addr.address;
      }
    }
    return 'localhost';
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    const ip = getLanIP();
    console.log('');
    console.log('  ✓ FlexCRM iniciado');
    console.log(`  → Local:   http://localhost:${PORT}`);
    console.log(`  → Red LAN: http://${ip}:${PORT}`);
    console.log(`  → Admin:   http://localhost:${PORT}/admin`);
    console.log(`  → Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
  });

  function gracefulShutdown(signal) {
    console.log(`\n[${signal}] Cerrando servidor gracefulmente...`);
    server.close(() => {
      console.log('  Servidor HTTP cerrado.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('  Forzando cierre por timeout...');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
