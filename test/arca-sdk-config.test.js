// ═══════════════════════════════════════════
// ARCA/AFIP — config del SDK de afipsdk
// Usa node:test (nativo, sin dependencias)
// Ejecutar: node --test test/arca-sdk-config.test.js
// ═══════════════════════════════════════════

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  AFIP_TEST_CUIT,
  esPem,
  tieneCertificados,
  mapConfig,
  buildSdkOptions,
  emitterCuit,
  missingConfig,
  afipErrorDetail,
} = require('../lib/arca-sdk-config');

// CUIT de ejemplo válido (dv=6) y el CUIT de prueba compartido de afipsdk.
const CUIT_PROPIO = '20-12345678-6';
const CERT_PEM = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';
const KEY_PEM = '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----';

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
      arca_cert: CERT_PEM, arca_key: KEY_PEM, arca_ambiente: 'prod',
    });
    assert.strictEqual(opts.CUIT, 20123456786);
    assert.strictEqual(opts.production, true);
    assert.strictEqual(opts.cert, CERT_PEM);
    assert.strictEqual(opts.key, KEY_PEM);
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
      arca_cert: CERT_PEM, arca_key: KEY_PEM, arca_ambiente: 'dev',
    });
    assert.strictEqual(opts.CUIT, 20123456786);
    assert.strictEqual(opts.production, false);
  });

  it('debe ignorar cert/key que no son PEM y caer al CUIT de prueba', () => {
    const opts = buildSdkOptions({
      arca_cuit: CUIT_PROPIO, arca_access_token: 'tok', arca_ambiente: 'dev',
      arca_cert: '9e0d74645b2b8e937bc78703b8106107:8e36d21a6129b1f2fd87cf4f661a320d:',
      arca_key: '83b7fc40ac48fb93d9827f8b84aae672:5e77148693bc8ffbc649c2028c242c4e:',
    });
    assert.strictEqual(opts.CUIT, AFIP_TEST_CUIT);
    assert.strictEqual(opts.cert, undefined);
    assert.strictEqual(opts.key, undefined);
  });

  it('debe rechazar producción sin certificados PEM válidos', () => {
    assert.throws(() => buildSdkOptions({ arca_access_token: 'tok', arca_ambiente: 'prod' }));
    assert.throws(() => buildSdkOptions({ arca_cuit: CUIT_PROPIO, arca_access_token: 'tok', arca_ambiente: 'prod' }));
    assert.throws(() => buildSdkOptions({ arca_cuit: CUIT_PROPIO, arca_access_token: 'tok', arca_ambiente: 'prod', arca_cert: 'basura', arca_key: 'basura' }));
  });

  it('nunca debe usar el CUIT de prueba en producción', () => {
    assert.throws(() => buildSdkOptions({ arca_access_token: 'tok', arca_ambiente: 'prod' }));
    assert.throws(() => buildSdkOptions({ arca_cuit: '20-12345678-9', arca_access_token: 'tok', arca_ambiente: 'prod', arca_cert: CERT_PEM, arca_key: KEY_PEM }));
  });
});

describe('ARCA — esPem / tieneCertificados', () => {
  it('debe reconocer un bloque PEM', () => {
    assert.strictEqual(esPem(CERT_PEM), true);
    assert.strictEqual(esPem('-----BEGIN RSA PRIVATE KEY-----\nx\n-----END RSA PRIVATE KEY-----'), true);
  });

  it('debe rechazar cualquier otra cosa', () => {
    assert.strictEqual(esPem(''), false);
    assert.strictEqual(esPem(null), false);
    assert.strictEqual(esPem(true), false);
    assert.strictEqual(esPem('9e0d74645b2b8e937bc78703b8106107:8e36d21a6129b1f2fd87cf4f661a320d:'), false);
  });

  it('debe exigir cert y key, los dos en PEM', () => {
    assert.strictEqual(tieneCertificados({ cert: CERT_PEM, key: KEY_PEM }), true);
    assert.strictEqual(tieneCertificados({ cert: CERT_PEM }), false);
    assert.strictEqual(tieneCertificados({ cert: 'basura', key: KEY_PEM }), false);
    assert.strictEqual(tieneCertificados({}), false);
  });
});

describe('ARCA — emitterCuit', () => {
  it('devuelve el CUIT de prueba en desarrollo sin certificado PEM', () => {
    assert.strictEqual(emitterCuit({ arca_cuit: CUIT_PROPIO, arca_ambiente: 'dev' }), AFIP_TEST_CUIT);
    assert.strictEqual(emitterCuit({ arca_cuit: CUIT_PROPIO, arca_ambiente: 'dev', arca_cert: 'basura', arca_key: 'basura' }), AFIP_TEST_CUIT);
  });

  it('devuelve el CUIT propio en producción y en homologación con certificado', () => {
    assert.strictEqual(
      emitterCuit({ arca_cuit: CUIT_PROPIO, arca_ambiente: 'prod', arca_cert: CERT_PEM, arca_key: KEY_PEM }),
      20123456786,
    );
    assert.strictEqual(
      emitterCuit({ arca_cuit: CUIT_PROPIO, arca_ambiente: 'dev', arca_cert: CERT_PEM, arca_key: KEY_PEM }),
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

  it('en producción exige CUIT válido y certificados PEM', () => {
    assert.strictEqual(missingConfig({ arca_access_token: 'tok', arca_ambiente: 'prod' }), 'cuit');
    assert.strictEqual(missingConfig({ arca_access_token: 'tok', arca_cuit: '20-12345678-9', arca_ambiente: 'prod', arca_cert: CERT_PEM, arca_key: KEY_PEM }), 'cuit');
    assert.strictEqual(missingConfig({ arca_access_token: 'tok', arca_cuit: CUIT_PROPIO, arca_ambiente: 'prod' }), 'certificados');
    assert.strictEqual(missingConfig({ arca_access_token: 'tok', arca_cuit: CUIT_PROPIO, arca_ambiente: 'prod', arca_cert: 'basura', arca_key: 'basura' }), 'certificados');
    assert.strictEqual(
      missingConfig({ arca_access_token: 'tok', arca_cuit: CUIT_PROPIO, arca_ambiente: 'prod', arca_cert: CERT_PEM, arca_key: KEY_PEM }),
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
