// ═══════════════════════════════════════════
// Integration Center — Script de migración
// Migra datos de integraciones existentes al nuevo sistema
// Ejecutar: node scripts/migrate-integrations.js
// ═══════════════════════════════════════════

const { getEmpresas, getEmpresaIntegracionesHabilitadas, setEmpresaIntegracion, saAudit } = require('../db_master');
const { getEmpresaDB } = require('../db_sqlite');
const { encryptValue } = require('../lib/crypto-utils');

const PROVIDER_MAP = {
  arca: {
    prefix: 'arca_',
    tokenKey: 'arca_access_token',
    certKey: 'arca_cert',
    keyKey: 'arca_key',
    extraMappings: {
      cuit: 'arca_cuit',
      puntoVenta: 'arca_punto_venta',
      ivaPct: 'arca_iva_pct',
      ambiente: 'arca_ambiente',
      condicionFiscal: 'arca_condicion_fiscal',
    },
  },
  mercadolibre: {
    prefix: 'tienda_meli_',
    tokenKey: 'tienda_meli_access_token',
    refreshKey: 'tienda_meli_refresh_token',
    expiresKey: 'tienda_meli_expires_at',
    extraMappings: {
      sellerId: 'tienda_meli_seller_id',
      userId: 'tienda_meli_user_id',
    },
  },
  tiendanube: {
    prefix: 'tienda_tn_',
    tokenKey: 'tienda_tn_access_token',
    extraMappings: {
      storeId: 'tienda_tn_store_id',
    },
  },
};

let migrated = 0;
let skipped = 0;
let errors = 0;

console.log('═══ Migration Integration Center ═══');
console.log('');

const empresas = getEmpresas().filter(e => e.activo);

for (const empresa of empresas) {
  try {
    const db = getEmpresaDB(empresa.codigo);
    const cfg = db.getConfig();

    for (const [provider, mapping] of Object.entries(PROVIDER_MAP)) {
      const token = cfg[mapping.tokenKey];

      if (!token) {
        // Check if this provider has ANY config
        const hasAnyConfig = Object.values(mapping.extraMappings || {}).some(k => cfg[k]);
        if (!hasAnyConfig) continue;
      }

      // Check if already migrated
      const existing = db.raw.prepare("SELECT id FROM company_integrations WHERE provider = ?").get(provider);
      if (existing) {
        skipped++;
        continue;
      }

      console.log(`  → Migrando ${provider} para empresa ${empresa.codigo}...`);

      // Build integration record
      const record = {
        provider,
        status: token ? 'connected' : 'disconnected',
        access_token: token ? encryptValue(String(token)) : null,
        refresh_token: cfg[mapping.refreshKey] ? encryptValue(String(cfg[mapping.refreshKey])) : null,
        expires_at: cfg[mapping.expiresKey] || null,
        config_json: '{}',
      };

      // Extra fields
      const configExtra = {};
      if (mapping.extraMappings) {
        for (const [key, cfgKey] of Object.entries(mapping.extraMappings)) {
          if (cfg[cfgKey]) {
            configExtra[key] = cfg[cfgKey];
            // Also store in record for direct columns
            if (key === 'sellerId') record.seller_id = String(cfg[cfgKey]);
            if (key === 'userId') record.external_user_id = String(cfg[cfgKey]);
            if (key === 'storeId') record.seller_id = String(cfg[cfgKey]);
            if (key === 'cuit') record.external_account_id = String(cfg[cfgKey]);
          }
        }
      }
      record.config_json = JSON.stringify(configExtra);

      const id = 'ci_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
      const keys = Object.keys(record).filter(k => record[k] !== null && record[k] !== undefined);
      const vals = keys.map(k => record[k]);
      const now = new Date().toISOString();

      keys.push('id', 'created_at', 'updated_at');
      vals.push(id, now, now);

      db.raw.prepare(
        `INSERT INTO company_integrations (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
      ).run(...vals);

      // Habilitar en master DB
      const habilitadas = getEmpresaIntegracionesHabilitadas(empresa.id);
      if (!habilitadas.includes(provider)) {
        setEmpresaIntegracion(empresa.id, provider, 1);
      }

      migrated++;
    }
  } catch (e) {
    console.error(`  ✗ Error en empresa ${empresa.codigo}: ${e.message}`);
    errors++;
  }
}

console.log('');
console.log(`═══ Resultado ═══`);
console.log(`  Migradas: ${migrated}`);
console.log(`  Saltadas (ya migradas): ${skipped}`);
console.log(`  Errores: ${errors}`);
console.log('');

if (migrated > 0) {
  saAudit('system', 'migracion_integraciones',
    null, `Migración completada: ${migrated} integraciones migradas, ${skipped} saltadas, ${errors} errores`);
}
