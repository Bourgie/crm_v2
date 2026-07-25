// ═══════════════════════════════════════
// FlexCRM Apps API (tenant-side)
// Endpoints para que el tenant interactúe con apps
// ═══════════════════════════════════════

const express = require('express');
const router = express.Router();
const { authMiddleware, requireRol } = require('../middleware/auth');
const { requireModule } = require('../middleware/tenant');
const appLoader = require('../lib/app-loader');

const {
  getAppsDisponibles,
  getAppDisponible,
  getAppsInstaladas,
  getAppInstalada,
  installApp,
  uninstallApp,
  updateAppStatus,
  updateAppConfig,
  logAppEvent,
  getEmpresa,
} = require('../db_master');

// ── Marketplace: listar apps disponibles ──
router.get('/marketplace', authMiddleware, (req, res) => {
  try {
    const categoria = req.query.categoria || null;
    const apps = getAppsDisponibles(categoria);
    // Filtrar solo apps no-internas (slug no empieza con _)
    const publicApps = apps.filter(a => !a.slug.startsWith('_'));
    res.json(publicApps);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Marketplace: detalle de una app ──
router.get('/marketplace/:slug', authMiddleware, (req, res) => {
  try {
    const app = getAppDisponible(req.params.slug);
    if (!app) return res.status(404).json({ error: 'App no encontrada' });
    res.json(app);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Listar apps instaladas para este tenant ──
router.get('/installed', authMiddleware, (req, res) => {
  try {
    const empresa = getEmpresa(req.user.empresa || 'default');
    if (!empresa) return res.json([]);
    const instaladas = getAppsInstaladas(empresa.id);
    // Enriquecer con manifiesto
    const enriched = instaladas.map(i => {
      const manifest = appLoader.getAppManifest(i.app_slug);
      return {
        ...i,
        nombre: manifest?.nombre || i.app_slug,
        icono: manifest?.icono || '📦',
        categoria: manifest?.categoria || 'general',
        version_disponible: manifest?.version || null,
        menu: manifest?.menu || null,
      };
    });
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Instalar app ──
router.post('/installed/:slug', authMiddleware, requireRol('admin'), (req, res) => {
  try {
    const slug = req.params.slug;
    const app = getAppDisponible(slug);
    if (!app) return res.status(404).json({ error: 'App no encontrada en el catálogo' });

    const empresa = getEmpresa(req.user.empresa || 'default');
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    // Verificar módulos requeridos
    if (app.modulos_requeridos && app.modulos_requeridos.length > 0) {
      const db = req.db;
      if (db) {
        const cfg = db.getConfig();
        let modsHabilitados = cfg.modulos_habilitados;
        if (typeof modsHabilitados === 'string') {
          try { modsHabilitados = JSON.parse(modsHabilitados); } catch (e) { modsHabilitados = null; }
        }
        if (modsHabilitados && Array.isArray(modsHabilitados)) {
          const falta = app.modulos_requeridos.find(m => !modsHabilitados.includes(m));
          if (falta) {
            return res.status(400).json({
              error: `Esta app requiere el módulo "${falta}" que no está disponible en tu plan.`,
              modulo_faltante: falta,
            });
          }
        }
      }
    }

    installApp(empresa.id, slug, app.id, app.version);
    logAppEvent(empresa.id, slug, 'installed', null, app.version, req.user.nombre || 'admin');

    // Limpiar caché por si había una versión anterior
    appLoader.clearTenantCache(req.user.empresa || 'default', slug);

    res.json({ ok: true, mensaje: `App "${app.nombre}" instalada correctamente.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Desinstalar app ──
router.delete('/installed/:slug', authMiddleware, requireRol('admin'), (req, res) => {
  try {
    const slug = req.params.slug;
    const empresa = getEmpresa(req.user.empresa || 'default');
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const instalada = getAppInstalada(empresa.id, slug);
    if (!instalada) return res.status(404).json({ error: 'App no instalada' });

    uninstallApp(empresa.id, slug);
    logAppEvent(empresa.id, slug, 'uninstalled', instalada.version_instalada, null, req.user.nombre || 'admin');

    // Limpiar caché
    appLoader.clearTenantCache(req.user.empresa || 'default', slug);

    res.json({ ok: true, mensaje: 'App desinstalada correctamente.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Activar / desactivar app ──
router.put('/installed/:slug/status', authMiddleware, requireRol('admin'), (req, res) => {
  try {
    const slug = req.params.slug;
    const { activa } = req.body;
    const empresa = getEmpresa(req.user.empresa || 'default');
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const instalada = getAppInstalada(empresa.id, slug);
    if (!instalada) return res.status(404).json({ error: 'App no instalada' });

    updateAppStatus(empresa.id, slug, activa);
    logAppEvent(empresa.id, slug, activa ? 'activated' : 'deactivated', null, null, req.user.nombre || 'admin');

    if (!activa) {
      appLoader.clearTenantCache(req.user.empresa || 'default', slug);
    }

    res.json({ ok: true, activa });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Config de app (tenant) ──
router.get('/installed/:slug/config', authMiddleware, (req, res) => {
  try {
    const slug = req.params.slug;
    const empresa = getEmpresa(req.user.empresa || 'default');
    if (!empresa) return res.json({});

    const instalada = getAppInstalada(empresa.id, slug);
    if (!instalada) return res.status(404).json({ error: 'App no instalada' });

    const key = req.query.key;
    if (key) {
      res.json({ key, value: instalada.config[key] || null });
    } else {
      res.json(instalada.config || {});
    }
  } catch (e) {
    res.json({});
  }
});

router.put('/installed/:slug/config', authMiddleware, requireRol('admin'), (req, res) => {
  try {
    const slug = req.params.slug;
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Falta key' });

    const empresa = getEmpresa(req.user.empresa || 'default');
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const instalada = getAppInstalada(empresa.id, slug);
    if (!instalada) return res.status(404).json({ error: 'App no instalada' });

    const config = { ...instalada.config, [key]: value };
    updateAppConfig(empresa.id, slug, config);

    // Limpiar caché para que se refresque el SDK
    appLoader.clearTenantCache(req.user.empresa || 'default', slug);

    res.json({ ok: true, key, value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
