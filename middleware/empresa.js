// ═══════════════════════════════════════
// PequeñosCRM Pro — Empresa Middleware
// Injects req.db based on empresa from JWT
// ═══════════════════════════════════════
const { getEmpresaDB } = require('../db_sqlite');

function empresaMiddleware(req, res, next) {
  // req.user is already set by authMiddleware
  if(req.user && req.user.empresa) {
    req.db = getEmpresaDB(req.user.empresa);
  } else {
    // Fallback to default (single-tenant backward compat)
    req.db = getEmpresaDB('default');
  }
  next();
}

module.exports = { empresaMiddleware };
