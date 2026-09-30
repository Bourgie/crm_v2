// ═══════════════════════════════════════════
// ARCA/AFIP — configuración del SDK (@afipsdk/afip.js)
// Compartido por routes/arca.js y el ArcaProvider del Integration Center
// para que la app y el Integration Center hablen con AFIP exactamente igual.
//
// Fuente oficial: https://docs.afipsdk.com
//  - Producción:          CUIT propio + cert + key + production:true.
//  - Desarrollo con cert: CUIT propio en homologación (production:false).
//  - Desarrollo sin cert: afipsdk emite con su CUIT de prueba compartido,
//    porque no hay certificado propio. Doc: "podés empezar en modo desarrollo
//    usando el CUIT 20-40937847-2 sin necesidad de [certificado]".
//
// El CUIT de prueba nunca se usa en producción: ahí son obligatorios el CUIT
// propio y los certificados, y sin ellos no se emite nada.
// ═══════════════════════════════════════════

const { normalizeCuit, isValidCuit } = require('./validar-cuit');

// CUIT compartido de afipsdk para el entorno de desarrollo (sin certificado).
const AFIP_TEST_CUIT = 20409378472;

const MENSAJES_CONFIG_PENDIENTE = {
  access_token: 'Falta el Access Token de ARCA. Configuralo en Configuración → ARCA.',
  cuit: 'CUIT de la empresa vacío o inválido. Cargalo en Configuración → ARCA (11 dígitos, con o sin guiones).',
  certificados: 'Para facturar en Producción falta el certificado o la clave privada. Cargalos en Configuración → ARCA copiando el archivo completo, desde -----BEGIN hasta -----END-----.',
};

/** Un certificado o clave real es un bloque PEM. Cualquier otra cosa no sirve. */
function esPem(valor) {
  return typeof valor === 'string' && valor.includes('-----BEGIN');
}

/** Certificados utilizables: los dos, y en formato PEM. */
function tieneCertificados(c) {
  return esPem(c.cert) && esPem(c.key);
}

/**
 * Normaliza la config de la empresa al shape interno.
 * Acepta las claves canónicas (cuit, access_token, …) y las de la tabla config
 * del tenant (arca_cuit, arca_access_token, …).
 */
function mapConfig(src = {}) {
  const c = (src && typeof src === 'object' && src.config) ? src.config : (src || {});
  const pick = (canonica, tenant) => {
    const a = c[canonica];
    if (a !== undefined && a !== null && a !== '') return a;
    const b = c[tenant];
    return (b !== undefined && b !== null) ? b : '';
  };
  return {
    cuit: normalizeCuit(pick('cuit', 'arca_cuit')),
    access_token: pick('access_token', 'arca_access_token'),
    cert: pick('cert', 'arca_cert'),
    key: pick('key', 'arca_key'),
    ambiente: pick('ambiente', 'arca_ambiente') || 'dev',
  };
}

/** Opciones para `new Afip(...)`. Lanza si falta lo obligatorio en producción. */
function buildSdkOptions(src = {}) {
  const c = mapConfig(src);
  const prod = c.ambiente === 'prod';
  const cuit = normalizeCuit(c.cuit);
  const hasCerts = tieneCertificados(c);

  if (prod) {
    if (!isValidCuit(cuit)) throw new Error(MENSAJES_CONFIG_PENDIENTE.cuit);
    if (!hasCerts) throw new Error(MENSAJES_CONFIG_PENDIENTE.certificados);
    return { CUIT: parseInt(cuit, 10), access_token: c.access_token || '', cert: c.cert, key: c.key, production: true };
  }

  if (hasCerts && isValidCuit(cuit)) {
    return { CUIT: parseInt(cuit, 10), access_token: c.access_token || '', cert: c.cert, key: c.key, production: false };
  }

  return { CUIT: AFIP_TEST_CUIT, access_token: c.access_token || '', production: false };
}

/** CUIT que figura como emisor en el comprobante y en los CbtesAsoc de la NC. */
function emitterCuit(src = {}) {
  const c = mapConfig(src);
  return c.ambiente === 'prod' || (tieneCertificados(c) && isValidCuit(normalizeCuit(c.cuit)))
    ? buildSdkOptions(src).CUIT
    : AFIP_TEST_CUIT;
}

/**
 * Qué falta para poder facturar, o null si está todo.
 * En desarrollo el CUIT propio y los certificados no son obligatorios.
 */
function missingConfig(src = {}) {
  const c = mapConfig(src);
  if (!c.access_token) return 'access_token';
  if (c.ambiente !== 'prod') return null;
  if (!isValidCuit(c.cuit)) return 'cuit';
  if (!tieneCertificados(c)) return 'certificados';
  return null;
}

function mensajeConfigPendiente(que) {
  return MENSAJES_CONFIG_PENDIENTE[que] || 'Falta completar la configuración de ARCA.';
}

/** afipsdk deja el cuerpo de la respuesta de AFIP en error.data. */
function afipErrorDetail(err) {
  if (!err || !err.data) return null;
  if (typeof err.data === 'string') return err.data.slice(0, 800);
  try {
    const txt = JSON.stringify(err.data);
    return txt.length > 800 ? txt.slice(0, 800) + '…' : txt;
  } catch (_) { return null; }
}

module.exports = {
  AFIP_TEST_CUIT,
  esPem,
  tieneCertificados,
  mapConfig,
  buildSdkOptions,
  emitterCuit,
  missingConfig,
  mensajeConfigPendiente,
  afipErrorDetail,
};
