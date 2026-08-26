require('dotenv').config();

// Legal / compliance defaults
const PRIVACY_EMAIL = process.env.PRIVACY_EMAIL || 'privacidad@flexcrm.com.ar';
const LEGAL_JURISDICTION = process.env.LEGAL_JURISDICTION || 'San Fernando del Valle de Catamarca, Provincia de Catamarca';
const CONSENT_GRACE_DAYS = parseInt(process.env.CONSENT_GRACE_DAYS) || 7;

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

// ── Purga de archivos huérfanos de empresas eliminadas (auto-reparación del borrado a cero) ──
try { require('./lib/purgeEmpresa').purgeOrphanTenantDBs(); } catch(e) { console.error('[Startup] purgeOrphanTenantDBs:', e.message); }

// ── Trust proxy (Fly.io / Cloudflare) ──
app.set('trust proxy', 1);

// ── Origin protection: bloquear acceso directo por IP / fly.dev ──
// Cuando admin/app están detrás de Cloudflare (naranja), el origen no debe ser
// accesible directo por IP o por crm-v2.fly.dev. Esto mitiga el falso positivo
// "Exposed RDP" de Cloudflare (Fly Anycast responde SYN-ACK en cualquier puerto
// pero no hay servicio RDP real — contenedor Alpine). Si ENFORCE_CLOUDFLARE_ORIGIN=1
// además se exige header CF-Ray/CF-Connecting-IP en producción.
const ENFORCE_CF_ORIGIN = process.env.ENFORCE_CLOUDFLARE_ORIGIN === '1';
app.use((req, res, next) => {
  const host = (req.hostname || '').toLowerCase();
  const rawHost = (req.headers.host || '').toLowerCase().split(':')[0];

  // 1) Host es IP literal o fly.dev → no servir app/admin, solo redirigir a canónico
  // Permitir localhost/127.0.0.1/::1 en dev/test (NODE_ENV !== production) para tests y desarrollo
  const isLocalIP = rawHost === '127.0.0.1' || rawHost === 'localhost' || rawHost === '::1' || rawHost === '::ffff:127.0.0.1';
  const isRawIP = !isLocalIP && (/^\d{1,3}(\.\d{1,3}){3}$/.test(rawHost) || rawHost.includes(':'));
  const isFlyDev = rawHost.endsWith('.fly.dev');
  const shouldBlockRawIP = isProd && (isRawIP || isFlyDev);
  const isPrivateStatic = req.path === '/robots.txt' || req.path === '/sitemap.xml';
  if (shouldBlockRawIP || isFlyDev) {
    // Health check, robots, sitemap deben seguir su lógica original (no redirect genérico)
    if (req.path === '/api/health' || req.path === '/robots.txt' || req.path === '/sitemap.xml' || req.path === '/landing.html') return next();
    if (isRawIP || isFlyDev) {
      if (req.path.startsWith('/api/')) {
        return res.status(421).json({ error: 'Acceso directo por IP no permitido. Use https://app.flexcrm.com.ar' });
      }
      return res.redirect(301, 'https://flexcrm.com.ar' + req.originalUrl);
    }
  }
  if (isPrivateStatic) return next();
  // En dev/test, si es IP local, dejar pasar sin bloqueo
  if (!isProd && isLocalIP) return next();

  // 2) Si está detrás de Cloudflare (naranja), opcionalmente exigir headers CF
  if (ENFORCE_CF_ORIGIN && process.env.NODE_ENV === 'production') {
    const hasCFRay = !!req.headers['cf-ray'];
    const hasCFIP = !!req.headers['cf-connecting-ip'];
    // Permitir health check directo de Fly (sin CF) y previews
    const isHealthOrPreview = req.path === '/api/health' || req.path === '/api/version';
    const isFlyHealthCheck = req.headers['user-agent'] && req.headers['user-agent'].includes('Fly-HealthCheck');
    if (!isHealthOrPreview && !isFlyHealthCheck && !hasCFRay && !hasCFIP) {
      // Solo aplicar si el Host es uno de los que debería estar detrás de CF
      if (host === 'app.flexcrm.com.ar' || host === 'admin.flexcrm.com.ar') {
        console.warn('[OriginProtection] Bloqueado acceso sin CF headers:', host, req.ip, req.path);
        return res.status(403).json({ error: 'Origen no autorizado' });
      }
    }
  }
  next();
});

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
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://api.mercadolibre.com", "https://auth.mercadolibre.com.ar"],
      fontSrc: ["'self'", "data:", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── Compression (Gzip/Brotli) — skip auth/csrf paths to mitigate BREACH ──
app.use(compression({
  filter: (req, res) => {
    // Skip compression on paths that set auth cookies or CSRF tokens
    const path = req.originalUrl || req.url || '';
    if (/^\/api\/auth\//.test(path)) return false;
    if (/^\/api\/csrf-token/.test(path)) return false;
    return compression.filter(req, res);
  },
}));

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
  if (req.query && typeof req.query === 'object') {
    for (const k of Object.keys(req.query)) {
      req.query[k] = sanitizeValue(req.query[k]);
    }
  }
  if (req.params && typeof req.params === 'object') {
    for (const k of Object.keys(req.params)) {
      req.params[k] = sanitizeValue(req.params[k]);
    }
  }
  next();
});

// ── CORS ──
const ALLOWED_ORIGINS = [
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'https://unfulanodev.com.ar', 'https://www.unfulanodev.com.ar',
  'https://flexcrm.com.ar', 'https://www.flexcrm.com.ar',
  'https://app.flexcrm.com.ar', 'https://admin.flexcrm.com.ar',
];

if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).forEach(o => ALLOWED_ORIGINS.push(o));
}

function isOriginAllowed(origin) {
  // Allow missing Origin (non-browser clients like curl, tests, n8n, webhooks)
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Cloudflare Pages preview domains (pinned prefix)
  if (/^https:\/\/[a-z0-9-]+\.pages\.dev$/.test(origin)) return true;
  // Allow all LAN IPs in development
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i.test(origin)) return true;
  return false;
}

// Landing routes: allow any origin (public forms)
app.use('/api/landing', cors({ origin: true, credentials: false }));

app.use(cors({
  origin: function(origin, callback) {
    if (isOriginAllowed(origin)) return callback(null, true);
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

const landingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
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

const signupLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados registros. Esperá 30 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Body parsing ──
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── X-Robots-Tag: hosts no públicos (app/admin/fly.dev) nunca indexables ──
app.use((req, res, next) => {
  const host = (req.hostname || '').toLowerCase();
  const rawHost = (req.headers.host || '').toLowerCase();
  const isRawIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(rawHost.split(':')[0]);
  if (host.startsWith('app.') || host.startsWith('admin.') || host.endsWith('.fly.dev') || isRawIP) {
    res.set('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
});

// ── robots.txt específico por tipo de host ──
const MARKETING_ROBOTS = `# FlexCRM — robots.txt
# Todos los crawlers pueden indexar el sitio público de marketing.

User-Agent: *
Allow: /

User-Agent: GPTBot
User-Agent: OAI-SearchBot
User-Agent: ChatGPT-User
User-Agent: ClaudeBot
User-Agent: Claude-SearchBot
User-Agent: Claude-User
User-Agent: PerplexityBot
User-Agent: Perplexity-User
User-Agent: Google-Extended
User-Agent: Applebot-Extended
User-Agent: Bytespider
User-Agent: Amazonbot
User-Agent: cohere-ai
User-Agent: MistralBot
User-Agent: meta-externalagent
Allow: /

Sitemap: https://flexcrm.com.ar/sitemap.xml
`;

const PRIVATE_ROBOTS = `# FlexCRM — robots.txt (host privado)
# La app y el admin no deben indexarse. Se deja el shell rastreable
# para que los buscadores puedan ver la directiva noindex.

User-Agent: *
Allow: /app/
Disallow: /api/
Disallow: /admin
Disallow: /superadmin.html
`;

app.get('/robots.txt', (req, res) => {
  const host = (req.hostname || '').toLowerCase();
  const esPrivado = host.startsWith('app.') || host.startsWith('admin.') || host.endsWith('.fly.dev');
  res.type('text/plain').send(esPrivado ? PRIVATE_ROBOTS : MARKETING_ROBOTS);
});

// ── SEO: sitemap dinámico (debe ir ANTES de express.static) ──
// Solo se sirve para hosts de marketing/desarrollo; nunca para app/admin/fly.dev.
const SEO_SITE = process.env.SEO_SITE_URL || 'https://flexcrm.com.ar';
app.get('/sitemap.xml', (req, res, next) => {
  const host = (req.hostname || '').toLowerCase();
  if (host.startsWith('app.') || host.startsWith('admin.') || host.endsWith('.fly.dev')) return next();
  const hoy = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SEO_SITE}/`, prio: '1.0' },
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${hoy}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${u.prio}</priority>
  </url>`).join('\n')}
</urlset>`;
  res.type('application/xml').send(xml);
});

// El hostname operativo de Fly nunca debe exponer la landing de marketing
// (debe ir antes de express.static para ganarle al archivo estático)
app.get('/landing.html', (req, res) => {
  const host = (req.hostname || '').toLowerCase();
  if (host.endsWith('.fly.dev')) return res.redirect(301, 'https://flexcrm.com.ar/');
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// ── Static files ──
app.use(express.static(path.join(__dirname, 'public')));

// Route root based on hostname
app.get('/', (req, res) => {
  const host = (req.hostname || '').toLowerCase();
  if (host.startsWith('app.')) return res.redirect('/app/login');
  if (host.startsWith('admin.')) return res.redirect('/admin');
  if (host.endsWith('.fly.dev')) return res.redirect(301, 'https://flexcrm.com.ar/');
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});
const reactDir = path.join(__dirname, 'public', 'app');
const fs = require('fs');
if (fs.existsSync(reactDir)) {
  app.use('/app/', express.static(reactDir));
  app.get('/app', (req, res) => res.redirect('/app/dashboard'));
  app.get('/app/verify-email/:token', (req, res) => {
    res.redirect('/api/auth/verify-email/' + req.params.token);
  });
  app.get('/app/*', (req, res) => {
    res.sendFile(path.join(reactDir, 'index.html'));
  });
}

// ── Initialize master DB (once) ──
require('./db_master');

// ── Initialize App Loader (ecosistema de apps) ──
const appLoader = require('./lib/app-loader');
appLoader.startup();

// ── Health check (defined here, mounted after rate limiter below) ──
function healthHandler(req, res) {
  const result = {
    ok: true,
    version: require('./package.json').version,
    ts: new Date().toISOString(),
  };
  res.json(result);
}

// ── CSRF token endpoint ──
app.get('/api/csrf-token', csrfTokenEndpoint);

// ── CSP violation report endpoint (public, no auth) ──
app.post('/api/csp-report', express.json({ type: 'application/csp-report', limit: '64kb' }), (req, res) => {
  const report = req.body && req.body['csp-report'];
  if (report) {
    console.warn('[CSP-VIOLATION]', JSON.stringify({
      blockedUri: report['blocked-uri'],
      violatedDirective: report['violated-directive'],
      documentUri: report['document-uri'],
      referrer: report.referrer,
    }));
  }
  res.status(204).end();
});

// ── Empresa tenant middleware — runs on all /api/* routes ──
app.use('/api', (req, res, next) => {
  let token = (req.headers.authorization || '').replace('Bearer ', '');
  const isSuperadminPath = req.path.startsWith('/superadmin');
  // Fallback to access-token cookie (httpOnly, set on login) — never for superadmin routes,
  // which authenticate via sa_token cookie in superAuth (evita mezclar tenant del CRM)
  if (!isSuperadminPath && (!token || token === 'null' || token === 'undefined') && req.cookies && req.cookies['access-token']) {
    token = req.cookies['access-token'];
  }
  if (token && token !== 'null' && token !== 'undefined') {
    try {
      const jwt = require('jsonwebtoken');
      const { getSecret } = require('./middleware/auth');
      const payload = jwt.verify(token, getSecret());
      if (!req.user) req.user = payload;
      const { getEmpresaDB, db } = require('./db_sqlite');
      // existingOnly: no recrear el archivo de una empresa eliminada con tokens viejos
      const empresaCode = payload.empresa || 'default';
      req.db = (typeof empresaCode === 'string' && /^[a-z0-9_]+$/.test(empresaCode) ? getEmpresaDB(empresaCode, { existingOnly: true }) : null) || db;
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
    if (!/^[a-z0-9_]+$/.test(String(empresa))) return res.json({});
    const { getEmpresaDB } = require('./db_sqlite');
    const db = getEmpresaDB(empresa, { existingOnly: true });
    if (!db) return res.json({});
    const cfg = db.getConfig();
    res.json({ nombre: cfg.nombre||'', slogan: cfg.slogan||'', logo_url: cfg.logo_url||'', tema_color: cfg.tema_color||'' });
  } catch(e) { res.json({}); }
});

// Apply rate limiting
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/auth/reset-password', resetPasswordLimiter);
app.use('/api/auth/signup', signupLimiter);
app.use('/api/webhooks/receptor/:token', webhookReceptorLimiter);
app.use('/api', apiLimiter);

// ── Health check (after rate limiter) ──
app.get('/api/health', healthHandler);

// ── Error report endpoint (frontend captures errors → logs here) ──
app.post('/api/log-error', (req, res) => {
  const { message, stack, url, userAgent, timestamp } = req.body;
  console.error(`[CLIENT-ERROR] ${timestamp || new Date().toISOString()} — ${url || 'unknown'} — ${message}`);
  if (stack) console.error(stack);
  res.json({ ok: true });
});

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
app.use('/api/tesoreria',     require('./routes/treasury'));
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
app.use('/api/landing',       landingLimiter, require('./routes/landing'));
app.use('/api/user-data',     require('./routes/user-data'));
app.use('/api/notificaciones', require('./routes/notificaciones'));

// ── Integrations Center ──
app.use('/api/integration-center', require('./routes/integration-center/oauth.routes'));
app.use('/api/integration-center', require('./routes/integration-center/company.routes'));
app.use('/api/integration-center/webhooks', require('./routes/integration-center/webhooks.routes'));

// ── App ecosystem (dinámico primero, estático después) ──
// El middleware dinámico solo enruta si el slug es una app registrada;
// si no, pasa al siguiente (routes/apps.js)
app.use('/api/apps/:slug',    appLoader.appLoaderMiddleware);
app.use('/api/apps',          require('./routes/apps'));

// ── Version check (public, no auth) ──
app.get('/api/version', (req, res) => res.json({ version: 'v74', built: '2026-05-08' }));

// ── 404 for unknown API routes ──
app.use('/api/*', (req, res) => {
  if (req.headers.accept?.includes('text/html')) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  res.status(404).json({ error: 'Ruta no encontrada' });
});

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

// ── Rutas legales públicas (React SPA) ──
const PUBLIC_SPA_ROUTES = ['/terminos-y-condiciones', '/politica-de-privacidad', '/politica-de-cookies'];
if (fs.existsSync(reactIndex)) {
  for (const ruta of PUBLIC_SPA_ROUTES) {
    app.get(ruta, (req, res) => res.sendFile(reactIndex));
  }
}

// ── Soft-404: rutas desconocidas devuelven 404 real, no el shell de la app ──
app.get('*', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: err.message });
  }
  if (req.headers.accept?.includes('text/html')) return res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message });
});

// ── Start (only when run directly) ──
module.exports = app;

if (require.main === module) {
  startBackupScheduler();

  // Start pipeline automation (prospect reminders, auto-status, auto-archive)
  const { startStaleReminderScheduler } = require('./lib/stale-prospect-reminder');
  startStaleReminderScheduler();

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

    // Notificar a buscadores (IndexNow) para re-indexado automático
    try {
      require('./scripts/indexnow').ping();
    } catch (e) {
      console.log('[IndexNow] no disponible:', e.message);
    }
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
