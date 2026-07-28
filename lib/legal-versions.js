const crypto = require('crypto');

const VERSIONES_VIGENTES = {
  terminos: '1.0',
  privacidad: '1.0',
  cookies: '1.0',
};

const CONSENT_GRACE_DAYS = parseInt(process.env.CONSENT_GRACE_DAYS) || 7;

function hashContenido(texto) {
  return crypto.createHash('sha256').update(texto || '').digest('hex');
}

function getVersionesVigentes() {
  const { getVersionVigente } = require('../db_master');
  const tipos = ['terminos', 'privacidad', 'cookies'];
  const result = {};
  for (const tipo of tipos) {
    const fromDB = getVersionVigente(tipo);
    if (fromDB) {
      result[tipo] = fromDB.version;
    } else {
      result[tipo] = VERSIONES_VIGENTES[tipo];
    }
  }
  return result;
}

function checkConsentimientoEmpresa(db, empresaCodigo, tipo, version) {
  const row = db.raw.prepare(
    "SELECT id, creado FROM consentimientos_empresa WHERE empresa_codigo=? AND tipo=? AND version=? ORDER BY creado DESC LIMIT 1"
  ).get(empresaCodigo, tipo, version);
  return row || null;
}

function registrarConsentimiento(db, empresaCodigo, tipo, version, aceptadoPor, req) {
  const id = 'ce_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  db.insert('consentimientos_empresa', {
    id,
    empresa_codigo: empresaCodigo,
    tipo,
    version,
    aceptado_por: aceptadoPor,
    ip: req ? (req.ip || req.headers ? req.headers['x-forwarded-for'] || req.connection.remoteAddress : null) : null,
    user_agent: req ? (req.headers ? req.headers['user-agent'] || '' : '') : '',
    creado: new Date().toISOString(),
  });
  return id;
}

function getConsentimientosEmpresa(db, empresaCodigo) {
  return db.raw.prepare(
    "SELECT tipo, version, aceptado_por, ip, creado FROM consentimientos_empresa WHERE empresa_codigo=? ORDER BY creado DESC"
  ).all(empresaCodigo);
}

function getGraceDeadline(vigenteDesde) {
  if (!vigenteDesde) return null;
  const desde = new Date(vigenteDesde);
  desde.setDate(desde.getDate() + CONSENT_GRACE_DAYS);
  return desde.toISOString();
}

function isInGracePeriod(vigenteDesde) {
  if (!vigenteDesde) return false;
  const deadline = new Date(vigenteDesde);
  deadline.setDate(deadline.getDate() + CONSENT_GRACE_DAYS);
  return new Date() <= deadline;
}

function getGraceDaysLeft(vigenteDesde) {
  if (!vigenteDesde) return 0;
  const deadline = new Date(vigenteDesde);
  deadline.setDate(deadline.getDate() + CONSENT_GRACE_DAYS);
  const diff = deadline.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

module.exports = {
  VERSIONES_VIGENTES,
  CONSENT_GRACE_DAYS,
  hashContenido,
  getVersionesVigentes,
  checkConsentimientoEmpresa,
  registrarConsentimiento,
  getConsentimientosEmpresa,
  getGraceDeadline,
  isInGracePeriod,
  getGraceDaysLeft,
};
