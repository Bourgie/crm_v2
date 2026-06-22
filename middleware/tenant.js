// ═══════════════════════════════════════════════════════
// PequeñosCRM Pro — Tenant Middleware
// Valida empresa activa, plan vigente, módulos habilitados
// ═══════════════════════════════════════════════════════
const { getEmpresa } = require('../db_master');

function validateTenant(req, res, next) {
  // Skip for superadmin routes and auth
  if(!req.user || !req.user.empresa || req.user.empresa === 'default') return next();

  try {
    const empresa = getEmpresa(req.user.empresa);

    // 1. Empresa must exist and be active
    if(!empresa) {
      console.error('[validateTenant] 403 empresa NO encontrada en master.db:', req.user.empresa, 'ruta:', req.path);
      return res.status(403).json({ error: 'Empresa no encontrada en el sistema. Código: ' + req.user.empresa });
    }
    if(!empresa.activo) {
      console.error('[validateTenant] 403 empresa SUSPENDIDA:', req.user.empresa);
      return res.status(403).json({ error: 'Empresa suspendida. Contactá al administrador.' });
    }

    // 2. Check vencimiento
    if(empresa.vencimiento) {
      const hoy = new Date().toISOString().substr(0, 10);
      if(empresa.vencimiento < hoy) {
        return res.status(402).json({ error: 'Suscripción vencida. Renová para continuar.' });
      }
    }

    // Attach empresa to request for downstream use
    req.empresa = empresa;
    next();
  } catch(e) {
    console.error('[validateTenant]', e.message);
    next(); // Don't block on validation error
  }
}

// Middleware that checks if a specific module is enabled for the empresa
function requireModule(moduloCodigo) {
  return function(req, res, next) {
    if(!req.user || !req.user.empresa || req.user.empresa === 'default') return next();
    try {
      const db = req.db;
      if(!db) return next();
      const cfg = db.getConfig();
      let mods = cfg.modulos_habilitados;
      if(typeof mods === 'string') { try { mods = JSON.parse(mods); } catch(e) { mods = null; } }
      if(!mods || !Array.isArray(mods)) return next(); // No restriction
      if(!mods.includes(moduloCodigo)) {
        return res.status(403).json({ error: `Módulo '${moduloCodigo}' no habilitado en tu plan` });
      }
      next();
    } catch(e) { next(); }
  };
}

module.exports = { validateTenant, requireModule };
