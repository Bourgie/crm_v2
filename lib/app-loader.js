// ═══════════════════════════════════════
// FlexCRM App Loader
// Escanea /apps/*/app.json, valida, carga y monta apps dinámicamente
// ═══════════════════════════════════════

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { createAppSDK } = require('./app-sdk');

const APPS_DIR = path.join(__dirname, '..', 'apps');
const _registry = {};       // slug -> { manifest, dirPath, backendFn }
const _loaded = {};         // empresaId:slug -> SDK instance (cached)
const _globalBus = new EventEmitter();
_globalBus.setMaxListeners(100);

let _initialized = false;

/**
 * Escanea el directorio /apps/ y carga todos los manifests válidos.
 * Debe llamarse una vez al iniciar el servidor.
 */
function startup() {
  if (_initialized) return;
  _initialized = true;

  if (!fs.existsSync(APPS_DIR)) {
    fs.mkdirSync(APPS_DIR, { recursive: true });
    console.log('[app-loader] Directorio /apps/ creado.');
    return;
  }

  const entries = fs.readdirSync(APPS_DIR, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const appDir = path.join(APPS_DIR, entry.name);
    const manifestPath = path.join(appDir, 'app.json');

    if (!fs.existsSync(manifestPath)) {
      console.warn(`[app-loader] ⚠ ${entry.name}: falta app.json, salteando.`);
      continue;
    }

    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      const errors = validateManifest(manifest, entry.name);
      if (errors.length > 0) {
        console.warn(`[app-loader] ⚠ ${entry.name}: manifiesto inválido:`, errors.join(', '));
        continue;
      }

      const slug = manifest.slug;
      _registry[slug] = {
        manifest,
        dirPath: appDir,
        backendFn: null, // lazy-load
      };

      // Intentar pre-cargar backend.js
      const backendPath = path.join(appDir, 'backend.js');
      if (fs.existsSync(backendPath)) {
        try {
          _registry[slug].backendFn = require(backendPath);
          console.log(`[app-loader] ✓ ${slug} v${manifest.version} — backend cargado`);
        } catch (e) {
          console.warn(`[app-loader] ⚠ ${slug}: error cargando backend.js:`, e.message);
        }
      } else {
        console.log(`[app-loader] ✓ ${slug} v${manifest.version} — sin backend (solo frontend)`);
      }

      count++;
    } catch (e) {
      console.warn(`[app-loader] ⚠ ${entry.name}: error parseando app.json:`, e.message);
    }
  }

  console.log(`[app-loader] ${count} apps cargadas del directorio /apps/.`);
}

/**
 * Valida campos requeridos del manifiesto.
 */
function validateManifest(m, dirName) {
  const errors = [];
  if (!m.slug || typeof m.slug !== 'string') errors.push('falta slug');
  if (!m.nombre) errors.push('falta nombre');
  if (!m.version) errors.push('falta version');
  if (m.slug && m.slug !== dirName) errors.push(`slug "${m.slug}" no coincide con directorio "${dirName}"`);
  return errors;
}

/**
 * Devuelve todas las apps registradas (manifiestos).
 */
function getRegisteredApps() {
  return Object.values(_registry).map(r => r.manifest);
}

/**
 * Devuelve el manifiesto de una app específica.
 */
function getAppManifest(slug) {
  return _registry[slug] ? _registry[slug].manifest : null;
}

/**
 * Monta una app para un tenant específico.
 * Crea el SDK, ejecuta el backend.js de la app, y devuelve el router Express.
 * Las tablas (migrations) se crean la primera vez que se monta.
 */
function mountForTenant(opts) {
  const { db, empresaId, empresaCodigo, user, appSlug } = opts;

  // Verificar que la app existe en el registry
  const reg = _registry[appSlug];
  if (!reg) {
    throw new Error(`App "${appSlug}" no encontrada en el registry.`);
  }

  // Cache key
  const cacheKey = empresaCodigo + ':' + appSlug;
  if (_loaded[cacheKey]) {
    return _loaded[cacheKey].router;
  }

  // Verificar en master.db que esté instalada y activa
  const { getAppInstalada } = require('../db_master');
  const instalada = getAppInstalada(empresaId, appSlug);
  if (!instalada || !instalada.activa) {
    throw new Error(`App "${appSlug}" no está instalada o está desactivada para esta empresa.`);
  }

  // Ejecutar migrations si existe
  const migrationsPath = path.join(reg.dirPath, 'migrations.js');
  if (fs.existsSync(migrationsPath)) {
    try {
      const migrations = require(migrationsPath);
      if (typeof migrations === 'function') {
        migrations(db._sqlite);
      } else if (Array.isArray(migrations)) {
        migrations.forEach(sql => { try { db._sqlite.exec(sql); } catch (e) { /* IF NOT EXISTS */ } });
      }
    } catch (e) {
      console.error(`[app-loader] Error ejecutando migrations de ${appSlug}:`, e.message);
    }
  }

  // También crear tablas declaradas en el manifiesto
  if (reg.manifest.tablas && Array.isArray(reg.manifest.tablas)) {
    reg.manifest.tablas.forEach(t => {
      try { db._sqlite.exec(t.sql); } catch (e) { /* IF NOT EXISTS */ }
    });
  }

  // Crear SDK
  const sdk = createAppSDK({
    db,
    empresaId,
    empresaCodigo,
    user,
    appSlug,
    appManifest: reg.manifest,
    globalBus: _globalBus,
  });

  // Ejecutar backend.js con el SDK
  if (reg.backendFn && typeof reg.backendFn === 'function') {
    try {
      reg.backendFn(sdk);
    } catch (e) {
      console.error(`[app-loader] Error ejecutando backend.js de ${appSlug}:`, e.message);
    }
  }

  _loaded[cacheKey] = sdk;
  return sdk.router;
}

/**
 * Middleware Express para rutas dinámicas de apps.
 * Uso: app.use('/api/apps/:slug', appLoaderMiddleware)
 */
function appLoaderMiddleware(req, res, next) {
  const appSlug = req.params.slug;
  if (!appSlug || !_registry[appSlug]) {
    return next();
  }

  // Necesitamos req.db y req.user (deben venir del tenant middleware)
  if (!req.db || !req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const { getEmpresa } = require('../db_master');
  const empresa = getEmpresa(req.user.empresa || 'default');

  try {
    const router = mountForTenant({
      db: req.db,
      empresaId: empresa ? empresa.id : 'emp_default',
      empresaCodigo: req.user.empresa || 'default',
      user: req.user,
      appSlug,
    });

    // Pasar el request a través del router de la app
    router(req, res, next);
  } catch (e) {
    if (e.message && e.message.includes('no está instalada')) {
      return res.status(403).json({ error: e.message });
    }
    console.error(`[app-loader] Error montando app ${appSlug}:`, e.message);
    return res.status(500).json({ error: 'Error interno del cargador de apps' });
  }
}

/**
 * Dispara un evento en el bus global.
 */
function emitEvent(evento, payload) {
  _globalBus.emit(evento, payload);
}

/**
 * Limpia el caché de una app para un tenant (útil en desinstalación/actualización).
 */
function clearTenantCache(empresaCodigo, appSlug) {
  const key = empresaCodigo + ':' + appSlug;
  delete _loaded[key];
}

module.exports = { startup, getRegisteredApps, getAppManifest, mountForTenant, appLoaderMiddleware, emitEvent, clearTenantCache, _registry, _globalBus };
