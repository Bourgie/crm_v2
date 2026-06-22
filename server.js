// ═══════════════════════════════════════════════════════════════
// FlexCRM — Server
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security middleware ──
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Input sanitization middleware
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    });
  }
  next();
});

// ── CORS ──
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, same-origin)
    if(!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // In development allow all
    if(process.env.NODE_ENV !== 'production') return callback(null, true);
    callback(new Error('CORS: origen no permitido'));
  },
  credentials: true
}));

// ── Rate limiting ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: 'Demasiados intentos. Esperá 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 min
  max: 300,
  message: { error: 'Demasiadas solicitudes. Intentá en un momento.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ── Body parsing ──
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static files ──
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
// React SPA (built by Vite)
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

// ── Health check ──
app.get('/api/health', (req, res) => res.json({
  ok: true,
  version: require('./package.json').version,
  env: process.env.NODE_ENV || 'development',
  ts: new Date().toISOString()
}));

// ── Empresa tenant middleware — runs on all /api/* routes ──
// Injects req.db based on JWT empresa claim
app.use('/api', (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if(token && token !== 'null' && token !== 'undefined') {
    try {
      const jwt = require('jsonwebtoken');
      const { getSecret } = require('./middleware/auth');
      const payload = jwt.verify(token, getSecret());
      if(!req.user) req.user = payload;
      const { getEmpresaDB } = require('./db_sqlite');
      req.db = getEmpresaDB(payload.empresa || 'default');
    } catch(e) { /* handled per-route by authMiddleware */ }
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

// ── Tenant validation (once) ──
app.use('/api', validateTenant);

// ── Public: MercadoLibre OAuth callback (sin auth, antes del tenant validation) ──
app.use('/api/meli-callback', require('./routes/sync-tienda-meli-callback'));

// ── Public config endpoint (login branding, no auth needed) ──
app.get('/api/config/public', (req, res) => {
  const { db } = require('./db_sqlite');
  try {
    const cfg = db.getConfig();
    res.json({ nombre: cfg.nombre||'', slogan: cfg.slogan||'', logo_url: cfg.logo_url||'', tema_color: cfg.tema_color||'' });
  } catch(e) { res.json({}); }
});

// Apply rate limiting
app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);

// Mount routes
app.use('/api/auth',          authRouter);
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

// ── Version check (public, no auth) ──
app.get('/api/version', (req, res) => res.json({ version: 'v74', built: '2026-05-08' }));

// ── 404 for unknown API routes ──
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ── SPA fallback ──
const reactIndex = path.join(reactDir, 'index.html');
app.get('/index.html', (req, res) => res.redirect('/app/dashboard'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('*', (req, res) => {
  if (fs.existsSync(reactIndex)) return res.sendFile(reactIndex);
  res.redirect('/app/dashboard');
});

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  if(process.env.NODE_ENV === 'development') console.error(err.stack);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message });
});

// ── Start ──
startBackupScheduler();

// Get LAN IP
function getLanIP() {
  const { networkInterfaces } = require('os');
  for(const iface of Object.values(networkInterfaces())) {
    for(const addr of iface) {
      if(addr.family==='IPv4' && !addr.internal) return addr.address;
    }
  }
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLanIP();
  console.log('');
  console.log('  ✓ FlexCRM iniciado');
  console.log(`  → Local:   http://localhost:${PORT}`);
  console.log(`  → Red LAN: http://${ip}:${PORT}`);
  console.log(`  → Admin:   http://localhost:${PORT}/superadmin.html`);
  console.log(`  → Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
});
