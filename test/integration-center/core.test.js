// ═══════════════════════════════════════════
// Integration Center — Tests unitarios básicos
// Usa node:test (nativo, sin dependencias)
// Ejecutar: node --test test/integration-center/core.test.js
// ═══════════════════════════════════════════

const { describe, it, before } = require('node:test');
const assert = require('node:assert');

before(() => {
  process.env.MELI_APP_ID = 'test_app_id';
  process.env.MELI_CLIENT_SECRET = 'test_secret';
  process.env.TN_CLIENT_ID = 'test_tn_id';
  process.env.TN_CLIENT_SECRET = 'test_tn_secret';
});

describe('Provider Registry', () => {
  it('debe registrar providers', () => {
    const { hasProvider } = require('../../lib/integration-center/providers');
    assert.strictEqual(hasProvider('arca'), true);
    assert.strictEqual(hasProvider('mercadolibre'), true);
    assert.strictEqual(hasProvider('tiendanube'), true);
    assert.strictEqual(hasProvider('nonexistent'), false);
  });

  it('debe dar error con provider no registrado', () => {
    const { getProvider } = require('../../lib/integration-center/providers');
    assert.throws(() => getProvider('nonexistent'), /no registrado/);
  });

  it('debe obtener metadata de todos los providers', () => {
    const { getAllProvidersMeta } = require('../../lib/integration-center/providers');
    const meta = getAllProvidersMeta();
    assert.strictEqual(meta.length, 3);
    assert.ok(meta[0].name);
    assert.ok(meta[0].displayName);
    assert.ok(meta[0].icon);
    assert.ok(meta[0].category);
  });
});

describe('SecretsManager', () => {
  it('debe validar env vars configuradas', () => {
    const { SecretsManager } = require('../../lib/integration-center/SecretsManager');
    const sm = new SecretsManager();
    const status = sm.getStatus('mercadolibre');
    assert.strictEqual(status.length, 2);
    assert.strictEqual(status[0].configured, true);
    assert.strictEqual(status[0].key, 'MELI_APP_ID');
    assert.strictEqual(status[1].configured, true);
    assert.strictEqual(status[1].key, 'MELI_CLIENT_SECRET');
  });

  it('debe reportar que ARCA no usa env vars globales', () => {
    const { SecretsManager } = require('../../lib/integration-center/SecretsManager');
    const sm = new SecretsManager();
    const status = sm.getStatus('arca');
    assert.deepStrictEqual(status, []);
  });

  it('debe obtener client_id por provider', () => {
    const { SecretsManager } = require('../../lib/integration-center/SecretsManager');
    const sm = new SecretsManager();
    assert.strictEqual(sm.getClientId('mercadolibre'), 'test_app_id');
    assert.strictEqual(sm.getClientSecret('mercadolibre'), 'test_secret');
  });
});

describe('TokenEncryptor', () => {
  it('debe cifrar y descifrar', () => {
    const { TokenEncryptor } = require('../../lib/integration-center/TokenEncryptor');
    const te = new TokenEncryptor();
    const original = 'test_token_12345';
    const encrypted = te.encrypt(original);
    assert.notStrictEqual(encrypted, original);
    const decrypted = te.decrypt(encrypted);
    assert.strictEqual(decrypted, original);
  });

  it('no debe re-cifrar valores ya cifrados', () => {
    const { TokenEncryptor } = require('../../lib/integration-center/TokenEncryptor');
    const te = new TokenEncryptor();
    const original = 'my_secret_token';
    const encrypted = te.encrypt(original);
    const doubleEncrypted = te.encrypt(encrypted);
    assert.strictEqual(doubleEncrypted, encrypted);
  });

  it('debe manejar null/undefined', () => {
    const { TokenEncryptor } = require('../../lib/integration-center/TokenEncryptor');
    const te = new TokenEncryptor();
    assert.strictEqual(te.encrypt(null), null);
    assert.strictEqual(te.decrypt(null), null);
    assert.strictEqual(te.encrypt(undefined), undefined);
  });
});

describe('Error classes', () => {
  it('debe crear errores tipados', () => {
    const {
      IntegrationError, ProviderNotFoundError,
      AuthError, ConnectionError, ValidationError,
    } = require('../../lib/integration-center/errors');

    const e1 = new ProviderNotFoundError('test');
    assert.ok(e1 instanceof IntegrationError);
    assert.strictEqual(e1.code, 'PROVIDER_NOT_FOUND');
    assert.ok(e1.message.includes('test'));

    const e2 = new AuthError('ml', 'invalid token');
    assert.strictEqual(e2.code, 'AUTH_ERROR');
    assert.ok(e2.message.includes('ml'));
  });
});

describe('Providers — ArcaProvider', () => {
  it('debe tener metadata correcta', () => {
    const { ArcaProvider } = require('../../lib/integration-center/providers/ArcaProvider');
    const p = new ArcaProvider();
    assert.strictEqual(p.name, 'arca');
    assert.strictEqual(p.displayName, 'ARCA / AFIP');
    assert.strictEqual(p.icon, '📄');
    assert.strictEqual(p.category, 'fiscal');
    assert.deepStrictEqual(p.requiredEnvKeys, []);
    assert.strictEqual(p.usesTenantCredentials, true);
  });

  it('debe mapear la config del tenant (claves arca_*)', () => {
    const { ArcaProvider } = require('../../lib/integration-center/providers/ArcaProvider');
    const mapped = ArcaProvider.mapTenantConfig({
      arca_access_token: 'tok', arca_cuit: '20-12345678-6',
      arca_punto_venta: '3', arca_ambiente: 'prod',
      arca_cert: 'CERT', arca_key: 'KEY', arca_iva_pct: '21',
    });
    assert.strictEqual(mapped.access_token, 'tok');
    assert.strictEqual(mapped.cuit, '20123456786');
    assert.strictEqual(mapped.puntoVenta, 3);
    assert.strictEqual(mapped.ambiente, 'prod');
    assert.strictEqual(mapped.cert, 'CERT');
    assert.strictEqual(mapped.key, 'KEY');
    assert.strictEqual(mapped.ivaPct, 21);
  });

  it('debe tener schema de config', () => {
    const { ArcaProvider } = require('../../lib/integration-center/providers/ArcaProvider');
    const p = new ArcaProvider();
    const schema = p.getConfigurationSchema();
    assert.ok(schema.fields);
    assert.ok(schema.fields.length > 0);
  });

  it('debe pasar production:true y el CUIT propio en producción', () => {
    const { ArcaProvider } = require('../../lib/integration-center/providers/ArcaProvider');
    const opts = new ArcaProvider()._getAfipConfig({
      arca_access_token: 'tok', arca_cuit: '20-12345678-6',
      arca_ambiente: 'prod',
      arca_cert: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
      arca_key: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
    });
    assert.strictEqual(opts.CUIT, 20123456786);
    assert.strictEqual(opts.production, true);
    assert.ok(opts.cert.includes('BEGIN CERTIFICATE'));
    assert.ok(opts.key.includes('BEGIN PRIVATE KEY'));
  });

  it('debe usar el CUIT de prueba de afipsdk en desarrollo sin certificado', () => {
    const { ArcaProvider } = require('../../lib/integration-center/providers/ArcaProvider');
    const opts = new ArcaProvider()._getAfipConfig({
      arca_access_token: 'tok', arca_cuit: '20-12345678-6', arca_ambiente: 'dev',
    });
    assert.strictEqual(opts.CUIT, 20409378472);
    assert.strictEqual(opts.production, false);
    assert.strictEqual(opts.cert, undefined);
  });

  it('connect: exige Access Token siempre', async () => {
    const { ArcaProvider } = require('../../lib/integration-center/providers/ArcaProvider');
    await assert.rejects(() => new ArcaProvider().connect({ arca_cuit: '20-12345678-6', arca_ambiente: 'dev' }));
  });

  it('connect: en producción exige CUIT y certificados', async () => {
    const { ArcaProvider } = require('../../lib/integration-center/providers/ArcaProvider');
    await assert.rejects(() => new ArcaProvider().connect({ arca_access_token: 'tok', arca_ambiente: 'prod' }));
  });

  it('connect: en desarrollo sin certificado conecta y reporta el CUIT de prueba', async () => {
    const { ArcaProvider } = require('../../lib/integration-center/providers/ArcaProvider');
    const r = await new ArcaProvider().connect({ arca_access_token: 'tok', arca_ambiente: 'dev' });
    assert.strictEqual(r.connected, true);
    assert.strictEqual(r.cuit_emisor, 20409378472);
  });
});

describe('Providers — MercadoLibreProvider', () => {
  it('debe tener metadata correcta', () => {
    const { MercadoLibreProvider } = require('../../lib/integration-center/providers/MercadoLibreProvider');
    const p = new MercadoLibreProvider();
    assert.strictEqual(p.name, 'mercadolibre');
    assert.strictEqual(p.displayName, 'MercadoLibre');
    assert.strictEqual(p.icon, '🛒');
    assert.strictEqual(p.category, 'ecommerce');
    assert.strictEqual(p.authUrl, 'https://auth.mercadolibre.com.ar/authorization');
  });
});

describe('Providers — TiendanubeProvider', () => {
  it('debe tener metadata correcta', () => {
    const { TiendanubeProvider } = require('../../lib/integration-center/providers/TiendanubeProvider');
    const p = new TiendanubeProvider();
    assert.strictEqual(p.name, 'tiendanube');
    assert.strictEqual(p.displayName, 'Tiendanube');
    assert.strictEqual(p.icon, '🛍️');
    assert.strictEqual(p.category, 'ecommerce');
  });
});
