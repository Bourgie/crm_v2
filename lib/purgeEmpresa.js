const fs = require('fs');
const path = require('path');
const { master } = require('../db_master');
const { _dbCache } = require('../db_sqlite');

const TABLAS_POR_EMPRESA_ID = [
  'empresa_notas',
  'solicitudes_plan',
  'solicitudes_soporte',
  'apps_instaladas',
  'app_event_log',
  'empresa_integraciones',
  'solicitudes_eliminacion',
];

function purgeEmpresa(empresaId, empresaCodigo) {
  try {
    const conn = _dbCache[empresaCodigo];
    if (conn && conn.raw) {
      try { conn.raw.close(); } catch (e) {}
      delete _dbCache[empresaCodigo];
    }
  } catch (e) { console.error('[PurgeEmpresa] close error:', e.message); }

  for (const suffix of ['.db', '.db-wal', '.db-shm']) {
    try {
      const filePath = path.join(__dirname, '..', 'data', `empresa_${empresaCodigo}${suffix}`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) { console.error('[PurgeEmpresa] file error:', e.message); }
  }

  for (const table of TABLAS_POR_EMPRESA_ID) {
    try { master.prepare(`DELETE FROM ${table} WHERE empresa_id=?`).run(empresaId); } catch (e) {}
  }
  try { master.prepare('DELETE FROM notificaciones WHERE empresa_codigo=?').run(empresaCodigo); } catch (e) {}
}

module.exports = { purgeEmpresa };
