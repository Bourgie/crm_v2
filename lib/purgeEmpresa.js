const fs = require('fs');
const path = require('path');
const { master } = require('../db_master');
const { _dbCache, TENANT_DATA_DIR } = require('../db_sqlite');

const TABLAS_POR_EMPRESA_ID = [
  'empresa_notas',
  'solicitudes_plan',
  'solicitudes_soporte',
  'apps_instaladas',
  'app_event_log',
  'empresa_integraciones',
  'solicitudes_eliminacion',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Cierra la conexión cacheada de la empresa (evita locks al borrar archivos)
function closeEmpresaConn(empresaCodigo) {
  const conn = _dbCache[empresaCodigo];
  if (conn && conn.raw) {
    try { conn.raw.close(); } catch (e) { console.error('[PurgeEmpresa] close error:', e.message); }
  }
  delete _dbCache[empresaCodigo];
}

// Borra los archivos .db/.db-wal/.db-shm con reintentos y verificación.
// Devuelve la lista de sufijos que NO se pudieron eliminar.
async function purgeEmpresaFiles(empresaCodigo) {
  const remaining = [];
  for (const suffix of ['.db', '.db-wal', '.db-shm']) {
    const filePath = path.join(TENANT_DATA_DIR, `empresa_${empresaCodigo}${suffix}`);
    if (!fs.existsSync(filePath)) continue;
    let deleted = false;
    for (let attempt = 0; attempt < 3 && !deleted; attempt++) {
      try {
        fs.unlinkSync(filePath);
        deleted = true;
      } catch (e) {
        if (attempt < 2) await sleep(350);
        else console.error('[PurgeEmpresa] unlink error (' + suffix + '):', e.message, '- el archivo puede quedar huérfano con datos de la empresa');
      }
    }
    if (!deleted && fs.existsSync(filePath)) remaining.push(suffix);
  }
  return remaining;
}

// Borra filas huérfanas en master para la empresa eliminada
function purgeEmpresaMasterOrphans(empresaId, empresaCodigo) {
  for (const table of TABLAS_POR_EMPRESA_ID) {
    try { master.prepare(`DELETE FROM ${table} WHERE empresa_id=?`).run(empresaId); } catch (e) {}
  }
  try { master.prepare('DELETE FROM notificaciones WHERE empresa_codigo=?').run(empresaCodigo); } catch (e) {}
}

// Borrado completo (compat con flujos existentes): cierra conexión, borra archivos y filas master.
// Devuelve { remaining } con los sufijos que no se pudieron borrar (vacío = éxito total).
async function purgeEmpresa(empresaId, empresaCodigo) {
  closeEmpresaConn(empresaCodigo);
  const remaining = await purgeEmpresaFiles(empresaCodigo);
  if (remaining.length === 0) {
    purgeEmpresaMasterOrphans(empresaId, empresaCodigo);
  }
  return { remaining };
}

// Barrido de huérfanas al arranque: borra empresa_*.db* que no existen en master.
// Auto-repara cualquier unlink fallido de una eliminación anterior.
function purgeOrphanTenantDBs() {
  try {
    const files = fs.readdirSync(TENANT_DATA_DIR);
    for (const f of files) {
      if (!f.startsWith('empresa_') || !f.endsWith('.db')) continue;
      const codigo = f.slice('empresa_'.length, -'.db'.length);
      let exists = false;
      try { exists = !!master.prepare('SELECT id FROM empresas WHERE codigo=?').get(codigo); } catch (e) {}
      if (exists) continue;
      console.warn('[PurgeOrphans] Archivo huérfano detectado: ' + f + ' (empresa no existe en master) — eliminando');
      for (const suffix of ['.db', '.db-wal', '.db-shm']) {
        const fp = path.join(TENANT_DATA_DIR, `empresa_${codigo}${suffix}`);
        try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) {
          console.error('[PurgeOrphans] No se pudo eliminar:', fp, '-', e.message);
        }
      }
      delete _dbCache[codigo];
    }
  } catch (e) {
    console.error('[PurgeOrphans] Error en barrido:', e.message);
  }
}

module.exports = { purgeEmpresa, purgeEmpresaFiles, purgeEmpresaMasterOrphans, closeEmpresaConn, purgeOrphanTenantDBs };
