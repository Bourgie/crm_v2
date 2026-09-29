// ═══════════════════════════════════════════
// ARCA/AFIP — config del SDK de afipsdk
// Usa node:test (nativo, sin dependencias)
// Ejecutar: node --test test/arca-sdk-config.test.js
// ═══════════════════════════════════════════

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  AFIP_TEST_CUIT,
  mapConfig,
  buildSdkOptions,
  emitterCuit,
  missingConfig,
  afipErrorDetail,
} = require('../lib/arca-sdk-config');

// CUIT de ejemplo válido (dv=6) y el CUIT de prueba compartido de afipsdk.
const CUIT_PROPIO = '20-12345678-6';

describe('ARCA — mapConfig', () => {
  it('debe leer las claves de la tabla config del tenant (arca_*)', () => {
    const c = mapConfig({
      arca_cuit: '20-12345678-6', arca_access_token: 'tok',
      arca_cert: 'CERT', arca_key: 'KEY', arca_ambiente: 'prod',
    });
    assert.strictEqual(c.cuit, '20123456786');
    assert.strictEqual(c.access_token, 'tok');
    assert.strictEqual(c.cert, 'CERT');
    assert.strictEqual(c.key, 'KEY');
    assert.strictEqual(c.ambiente, 'prod');
  });

  it('debe normalizar el CUIT sin guiones y usar dev por defecto', () => {
    const c = mapConfig({ arca_cuit: ' 20 12345678 6 ' });
    assert.strictEqual(c.cuit, '20123456786');
    assert.strictEqual(c.ambiente, 'dev');
  });
});

describe('ARCA — buildSdkOptions', () => {
  it('en producción debe pasar el CUIT propio, cert, key y production:true', () => {
    const opts = buildSdkOptions({
      arca_cuit: CUIT_PROPIO, arca_access_token: 'tok',
      arca_cert: 'CERT', arca_key: 'KEY', arca_ambiente: 'prod',
    });
    assert.strictEqual(opts.CUIT, 20123456786);
    assert.strictEqual(opts.production, true);
    assert.strictEqual(opts.cert, 'CERT');
    assert.strictEqual(opts.key, 'KEY');
    assert.strictEqual(opts.access_token, 'tok');
  });

  it('en desarrollo SIN certificado debe usar el CUIT de prueba de afipsdk', () => {
    const opts = buildSdkOptions({ arca_cuit: CUIT_PROPIO, arca_access_token: 'tok', arca_ambiente: 'dev' });
    assert.strictEqual(opts.CUIT, AFIP_TEST_CUIT);
    assert.strictEqual(opts.production, false);
    assert.strictEqual(opts.cert, undefined);
    assert.strictEqual(opts.key, undefined);
  });

  it('en desarrollo sin certificado debe funcionar también sin CUIT propio', () => {
    const opts = buildSdkOptions({ arca_access_token: 'tok', arca_ambiente: 'dev' });
    assert.strictEqual(opts.CUIT, AFIP_TEST_CUIT);
    assert.strictEqual(opts.production, false);
  });

  it('en desarrollo CON certificado debe emitir con el CUIT propio (homologación)', () => {
    const opts = buildSdkOptions({
      arca_cuit: CUIT_PROPIO, arca_access_token: 'tok',
      arca_cert: 'CERT', arca_key: 'KEY', arca_ambiente: 'dev',
    });
    assert.strictEqual(opts.CUIT, 20123456786);
    assert.strictEqual(opts.production, false);
  });

  it('nunca debe usar el CUIT de prueba en producción', () => {
    assert.throws(() => buildSdkOptions({ arca_access_token: 'tok', arca_ambiente: 'prod' }));
    assert.throws(() => buildSdkOptions({ arca_cuit: '20-12345678-9', arca_access_token: 'tok', arca_ambiente: 'prod', arca_cert: 'C', arca_key: 'K' }));
  });
});

describe('ARCA — emitterCuit', () => {
  it('devuelve el CUIT de prueba en desarrollo sin certificado', () => {
    assert.strictEqual(emitterCuit({ arca_cuit: CUIT_PROPIO, arca_ambiente: 'dev' }), AFIP_TEST_CUIT);
  });

  it('devuelve el CUIT propio en producción y en homologación con certificado', () => {
    assert.strictEqual(
      emitterCuit({ arca_cuit: CUIT_PROPIO, arca_ambiente: 'prod', arca_cert: 'C', arca_key: 'K' }),
      20123456786,
    );
    assert.strictEqual(
      emitterCuit({ arca_cuit: CUIT_PROPIO, arca_ambiente: 'dev', arca_cert: 'C', arca_key: 'K' }),
      20123456786,
    );
  });
});

describe('ARCA — missingConfig', () => {
  it('exige Access Token siempre', () => {
    assert.strictEqual(missingConfig({ arca_ambiente: 'dev' }), 'access_token');
    assert.strictEqual(missingConfig({ arca_ambiente: 'prod' }), 'access_token');
  });

  it('en desarrollo no exige CUIT ni certificados', () => {
    assert.strictEqual(missingConfig({ arca_access_token: 'tok', arca_ambiente: 'dev' }), null);
  });

  it('en producción exige CUIT válido y certificados', () => {
    assert.strictEqual(missingConfig({ arca_access_token: 'tok', arca_ambiente: 'prod' }), 'cuit');
    assert.strictEqual(missingConfig({ arca_access_token: 'tok', arca_cuit: '20-12345678-9', arca_ambiente: 'prod', arca_cert: 'C', arca_key: 'K' }), 'cuit');
    assert.strictEqual(missingConfig({ arca_access_token: 'tok', arca_cuit: CUIT_PROPIO, arca_ambiente: 'prod' }), 'certificados');
    assert.strictEqual(
      missingConfig({ arca_access_token: 'tok', arca_cuit: CUIT_PROPIO, arca_ambiente: 'prod', arca_cert: 'C', arca_key: 'K' }),
      null,
    );
  });
});

describe('ARCA — afipErrorDetail', () => {
  it('debe exponer el cuerpo de la respuesta de AFIP (error.data)', () => {
    const err = new Error('Request failed with status code 400');
    err.data = { errors: [{ code: 600, message: 'CUIT no autorizado' }] };
    const detalle = afipErrorDetail(err);
    assert.ok(detalle.includes('600'));
    assert.ok(detalle.includes('CUIT no autorizado'));
  });

  it('debe tolerar errores sin detalle', () => {
    assert.strictEqual(afipErrorDetail(new Error('boom')), null);
    assert.strictEqual(afipErrorDetail(null), null);
  });

  it('debe recortar detalles muy largos', () => {
    const err = new Error('boom');
    err.data = 'x'.repeat(5000);
    assert.ok(afipErrorDetail(err).length <= 801);
  });
});
