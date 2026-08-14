require('dotenv').config();
const jwt = require('jsonwebtoken');
const { db } = require('../db_sqlite');

function getSecret() {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret) return envSecret;
  throw new Error('JWT_SECRET no configurado en .env. Revisá las variables de entorno.');
}

// Permisos por rol: qué rutas/acciones puede hacer cada rol
const PERMISOS = {
  admin:      ['*'],
  supervisor: ['dashboard','pos','ventas','clientes','productos','caja','presupuestos','pendientes','ctacte','stock','vendedores','reportes','config_read'],
  vendedor:   ['dashboard_basic','pos','clientes_read','productos_read','presupuestos','pendientes_read'],
  cajero:     ['dashboard_basic','pos','caja','clientes_read','productos_read','pendientes'],
  readonly:   ['dashboard_basic','ventas_read','clientes_read','productos_read','reportes'],
  tesorero:   ['dashboard_basic','tesoreria','tesoreria_view_all_sucursales','caja','clientes_read','productos_read','ventas_read','reportes','config_read'],
};

function authMiddleware(req, res, next) {
  let token = null;
  const header = req.headers['authorization'];
  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  }
  // Fallback to access-token cookie (httpOnly, set on login)
  if (!token && req.cookies && req.cookies['access-token']) {
    token = req.cookies['access-token'];
  }
  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    const payload = jwt.verify(token, getSecret());
    // Use empresa-specific DB if available (set by global middleware), else fall back to default
    const { getEmpresaDB } = require('../db_sqlite');
    let userDB = req.db;
    if (!userDB) {
      const code = payload.empresa && /^[a-z0-9_]+$/.test(String(payload.empresa)) ? payload.empresa : null;
      userDB = code ? getEmpresaDB(code, { existingOnly: true }) : null;
      if (!userDB) userDB = db;
    }
    const user = userDB.findOne('usuarios', payload.id);
    if (!user || !user.activo) return res.status(401).json({ error: 'Usuario no válido' });

    // Check session active (if sid present)
    if (payload.sid) {
      try {
        const session = userDB.raw.prepare("SELECT activo FROM user_sessions WHERE id=?").get(payload.sid);
        if (!session || !session.activo) {
          return res.status(401).json({ error: 'Sesión cerrada. Volvé a iniciar sesión.', session_closed: true });
        }
      } catch(e) { /* non-blocking */ }
    }
    // Check password expiry
    if (user.password_changed_at) {
      try {
        const cfg = userDB.getConfig();
        const expireDays = parseInt(cfg.password_expira_dias) || 0;
        if (expireDays > 0) {
          const changedAt = new Date(user.password_changed_at);
          const expireAt = new Date(changedAt.getTime() + expireDays * 86400000);
          if (new Date() > expireAt) {
            return res.status(401).json({ error: 'Tu contraseña ha expirado. Debes cambiarla.', require_password_change: true });
          }
        }
      } catch(e) { /* ignore config read errors */ }
    }
    req.user = { ...user, empresa: payload.empresa || 'default' };
    // Merge permisos de todos los roles del usuario (multi-rol)
    const allRoles = Array.isArray(user.roles) && user.roles.length ? user.roles : [user.rol];
    const merged = new Set();
    for (const r of allRoles) {
      const p = PERMISOS[r] || [];
      if (p.includes('*')) { merged.clear(); merged.add('*'); break; }
      p.forEach(x => merged.add(x));
    }
    req.userPermisos = [...merged];
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    // Check principal rol
    if (req.user.rol === 'admin') return next();
    if (roles.includes(req.user.rol)) return next();
    // Also check roles array (multi-rol support)
    const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.rol];
    if (userRoles.includes('admin') || roles.some(r => userRoles.includes(r))) return next();
    return res.status(403).json({ error: 'Sin permisos para esta acción' });
  };
}

function permiteSucursal(user, suc_id) {
  if (!suc_id) return false;
  if (user.rol === 'admin' || (Array.isArray(user.roles) && user.roles.includes('admin'))) return true;
  let permitidas = user.suc_sesiones_permitidas;
  if (typeof permitidas === 'string') { try { permitidas = JSON.parse(permitidas); } catch { permitidas = []; } }
  if (Array.isArray(permitidas) && permitidas.length) return permitidas.includes(String(suc_id));
  return user.suc_id && String(user.suc_id) === String(suc_id);
}

// Verifica que el usuario tenga un permiso granular (requerido por tesorería)
function requirePermiso(permiso) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    const perms = req.userPermisos || PERMISOS[req.user.rol] || [];
    if (perms.includes('*') || perms.includes(permiso)) return next();
    return res.status(403).json({ error: 'Sin permisos para esta acción' });
  };
}

module.exports = { authMiddleware, requireRol, requirePermiso, getSecret, PERMISOS, permiteSucursal };
