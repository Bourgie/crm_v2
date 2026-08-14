// ═══════════════════════════════════════════════════════════
// FlexCRM — Limpieza de empresas (borrado a cero)
// Elimina TODAS las empresas de master.db excepto las indicadas,
// incluyendo sus archivos de DB y filas huérfanas.
//
// Uso:
//   node scripts/cleanup_empresas.js                → conserva solo 'entre mimos' (1234567)
//   node scripts/cleanup_empresas.js --keep a,b,c   → conserva los códigos a,b,c
//   node scripts/cleanup_empresas.js --dry-run      → muestra qué se eliminaría
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const { master } = require('../db_master');
const { purgeEmpresa, purgeOrphanTenantDBs } = require('../lib/purgeEmpresa');

const args = process.argv.slice(2);
const keepIdx = args.indexOf('--keep');
const KEEP = new Set((keepIdx !== -1 ? args[keepIdx + 1] : '1234567').split(',').map(s => s.trim()).filter(Boolean));
const DRY = args.includes('--dry-run');

async function main() {
  const empresas = master.prepare("SELECT id, codigo, nombre, activo, creado FROM empresas ORDER BY nombre").all();
  const toDelete = empresas.filter(e => !KEEP.has(e.codigo));
  console.log(`Empresas en master: ${empresas.length}`);
  console.log(`Conservar: [${[...KEEP].join(', ')}]`);
  console.log(`A eliminar: ${toDelete.length}`);
  if (DRY) {
    toDelete.forEach(e => console.log(`  [dry-run] ${e.nombre} (${e.codigo})`));
    return;
  }

  let ok = 0, fallaron = 0;
  for (const e of toDelete) {
    try {
      const { remaining } = await purgeEmpresa(e.id, e.codigo);
      if (remaining.length === 0) {
        master.prepare("DELETE FROM empresas WHERE id=?").run(e.id);
        master.prepare("INSERT INTO sa_audit_log (id,fecha,admin_id,accion,empresa_id,detalle) VALUES (?,?,?,?,?,?)")
          .run('sal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), new Date().toISOString(), 'cleanup_script', 'eliminar_empresa', e.id, 'Limpieza masiva: ' + e.nombre + ' (' + e.codigo + ')');
        console.log(`  ✓ ${e.nombre} (${e.codigo})`);
        ok++;
      } else {
        console.error(`  ✗ ${e.codigo}: archivos restantes (${remaining.join(', ')}) — NO eliminada de master`);
        fallaron++;
      }
    } catch (err) {
      console.error(`  ✗ ${e.codigo}: ${err.message}`);
      fallaron++;
    }
  }

  // Huérfanas residuales en disco
  purgeOrphanTenantDBs();

  const restantes = master.prepare("SELECT id, codigo, nombre, activo, creado FROM empresas ORDER BY nombre").all();
  console.log(`\nResultado: ${ok} eliminadas, ${fallaron} con error`);
  console.log('Empresas restantes:', JSON.stringify(restantes, null, 2));
}

main().then(() => { try { master.close(); } catch {} }).catch(e => { console.error(e); process.exit(1); });
