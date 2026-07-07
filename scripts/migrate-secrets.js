require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { encryptValue, isEncrypted, SENSITIVE_KEYS } = require('../lib/crypto-utils');

console.log('=== Migración de secrets: texto plano → encriptado ===\n');

if (!process.env.CONFIG_ENCRYPTION_KEY) {
  console.error('ERROR: CONFIG_ENCRYPTION_KEY no está configurada en .env');
  console.error('Generá una con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

const dataDir = path.join(__dirname, '..', 'data');
const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('-shm') && !f.includes('-wal'));

let totalMigrated = 0;
let totalDbs = 0;

for (const dbFile of dbFiles) {
  const dbPath = path.join(dataDir, dbFile);
  try {
    const sqlite = new DatabaseSync(dbPath);
    sqlite.exec("PRAGMA journal_mode=WAL");

    const rows = sqlite.prepare("SELECT key, value FROM config").all();
    let migrated = 0;

    const stmt = sqlite.prepare("INSERT OR REPLACE INTO config(key,value) VALUES(?,?)");

    for (const row of rows) {
      if (SENSITIVE_KEYS.has(row.key) && !isEncrypted(row.value)) {
        const encrypted = encryptValue(row.value);
        stmt.run(row.key, encrypted);
        migrated++;
      }
    }

    sqlite.close();

    if (migrated > 0) {
      totalMigrated += migrated;
      totalDbs++;
      console.log(`  ✓ ${dbFile}: ${migrated} secret(s) encriptados`);
    }
  } catch (e) {
    console.error(`  ✗ ${dbFile}: ERROR - ${e.message}`);
  }
}

console.log(`\n=== Completo: ${totalMigrated} secret(s) migrados en ${totalDbs} DB(s) ===`);
