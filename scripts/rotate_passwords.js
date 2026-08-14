// ═══════════════════════════════════════════════════════════
// FlexCRM — Rotación de passwords (elimina claves de prueba/default)
//
// Rota la password del superadmin y de usuarios de empresas.
// Imprime la password temporal UNA sola vez (entregarla por canal seguro).
//
// Uso:
//   node scripts/rotate_passwords.js --solo-audit          → verifica hashes contra candidatos conocidos
//   node scripts/rotate_passwords.js                       → rota superadmin + usuarios de '1234567'
//   node scripts/rotate_passwords.js --empresa <codigo>    → rota usuarios de una empresa específica
//   node scripts/rotate_passwords.js --superadmin          → rota solo superadmin
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { master } = require('../db_master');
const { getEmpresaDB } = require('../db_sqlite');

// Claves conocidas de prueba/local que NO deben seguir en uso
const CANDIDATOS = [
  'superadmin123', 'admin123', 'vend123', 'demo123',
  '123456', '12345678', 'password', 'admin', 'superadmin',
  'Test1234!', 'sa-test-pass-123', 'sa-sec-pass-123', 'tesoreria-test-pass',
  'sa_2fa_test', 'test123',
];

// Usuarios de prueba conocidos en 'entre mimos' (se desactivan, no se rotan)
const USUARIOS_DE_PRUEBA = new Set(['majo', 'marita', 'bourgie']);

const SOLO_AUDIT = process.argv.includes('--solo-audit');
const SOLO_SA = process.argv.includes('--superadmin');
const empIdx = process.argv.indexOf('--empresa');
const EMPRESA = empIdx !== -1 ? process.argv[empIdx + 1] : '1234567';

function genPassword() {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const sym = '!@#$%&*';
  const pool = lower + upper + digits + sym;
  let pw = '';
  pw += lower[crypto.randomInt(lower.length)];
  pw += upper[crypto.randomInt(upper.length)];
  pw += digits[crypto.randomInt(digits.length)];
  pw += sym[crypto.randomInt(sym.length)];
  while (pw.length < 16) pw += pool[crypto.randomInt(pool.length)];
  return pw.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

function auditarHash(usuario, hash, origen) {
  if (!hash) return null;
  for (const c of CANDIDATOS) {
    if (bcrypt.compareSync(c, hash)) return c;
  }
  return null;
}

function auditSuperadmin() {
  console.log('── Superadmin ─────────────────────────────');
  const rows = master.prepare("SELECT id, usuario, email, password, activo, must_change_password FROM superadmin").all();
  rows.forEach(r => {
    const match = auditarHash(r.usuario, r.password, 'superadmin');
    console.log(`  ${r.usuario} (${r.email || 'sin email'}): ${match ? '🔴 CLAVE DE PRUEBA: ' + match : '✅ sin match'}`);
  });
  return rows;
}

function auditEmpresa(codigo) {
  console.log(`── Empresa ${codigo} ──────────────────────────────`);
  const db = getEmpresaDB(codigo, { existingOnly: true });
  if (!db) { console.log('  (sin DB — empresa no existe localmente)'); return []; }
  const rows = db.raw.prepare("SELECT id, usuario, email, password, rol, activo FROM usuarios").all();
  rows.forEach(r => {
    const match = auditarHash(r.usuario, r.password, codigo);
    const flag = match ? '🔴 CLAVE DE PRUEBA: ' + match : '✅ sin match';
    const estado = r.activo ? 'activo' : 'inactivo';
    console.log(`  ${r.usuario} (${r.email || 'sin email'} | ${r.rol} | ${estado}): ${flag}`);
  });
  return rows;
}

function rotateSuperadmin() {
  console.log('── Rotando superadmin ─────────────────────');
  const rows = master.prepare("SELECT id, usuario, email FROM superadmin WHERE activo=1").all();
  for (const sa of rows) {
    const nueva = genPassword();
    const hash = bcrypt.hashSync(nueva, 10);
    master.prepare("UPDATE superadmin SET password=?, must_change_password=1, token_version = token_version + 1 WHERE id=?")
      .run(hash, sa.id);
    master.prepare("INSERT INTO sa_audit_log (id,fecha,admin_id,accion,empresa_id,detalle) VALUES (?,?,?,?,?,?)")
      .run('sal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), new Date().toISOString(), sa.id, 'rotacion_password', null, 'Rotación de password de prueba por script de seguridad');
    console.log(`  ${sa.usuario}: password temporal generada (sesiones invalidadas):`);
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log(`  ║  ${nueva.padEnd(46)}║`);
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
    console.log('  Deberá cambiarla en el próximo login (must_change_password=1).');
  }
}

function rotateEmpresa(codigo) {
  console.log(`── Rotando empresa ${codigo} ─────────────────`);
  const db = getEmpresaDB(codigo, { existingOnly: true });
  if (!db) { console.log('  (sin DB local — omitido)'); return; }
  const rows = db.raw.prepare("SELECT id, usuario, email, rol, activo FROM usuarios").all();
  for (const u of rows) {
    if (USUARIOS_DE_PRUEBA.has(String(u.usuario).toLowerCase())) {
      db.raw.prepare("UPDATE usuarios SET activo=0 WHERE id=?").run(u.id);
      console.log(`  ${u.usuario} (${u.email || 'sin email'}): desactivado (usuario de prueba)`);
      continue;
    }
    const nueva = genPassword();
    const hash = bcrypt.hashSync(nueva, 10);
    db.raw.prepare("UPDATE usuarios SET password=?, must_change_password=1, password_changed_at=? WHERE id=?")
      .run(hash, new Date().toISOString(), u.id);
    db.audit(null, null, 'seguridad', 'rotacion_password', 'Rotación de password de prueba (script) para ' + u.usuario, u.id);
    console.log(`  ${u.usuario} (${u.email || 'sin email'} | ${u.rol}): password temporal generada:`);
    console.log(`  ║  ${nueva}`);
  }
  console.log('');
}

function main() {
  console.log('════ FlexCRM — Rotación de passwords ════\n');

  if (SOLO_AUDIT) {
    auditSuperadmin();
    console.log('');
    auditEmpresa(EMPRESA);
    console.log('\n[--solo-audit] no se modificó nada.');
    return;
  }

  if (!SOLO_SA) rotateEmpresa(EMPRESA);
  rotateSuperadmin();

  console.log('\nRe-auditoría:');
  auditSuperadmin();
  console.log('');
  if (!SOLO_SA) auditEmpresa(EMPRESA);
}

try {
  main();
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
} finally {
  try { master.close(); } catch {}
}
