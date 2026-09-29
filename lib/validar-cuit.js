// ═══════════════════════════════════════════
// Validación de CUIT (11 dígitos + dígito verificador)
// Es la identidad fiscal de la empresa: un CUIT mal cargado
// significa emitir comprobantes a nombre del contribuyente equivocado.
// ═══════════════════════════════════════════

// Pesos que aplica AFIP a los primeros 10 dígitos.
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Quita guiones y espacios de un CUIT.
 * @param {*} value
 * @returns {string}
 */
function normalizeCuit(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[-\s]/g, '');
}

/**
 * Calcula el dígito verificador de los primeros 10 dígitos de un CUIT.
 * @param {string} clean - CUIT de 10 dígitos, sin guiones
 * @returns {number} 0-9, o -1 si no se puede calcular
 */
function cuitDigitoVerificador(clean) {
  if (!/^\d{10}$/.test(clean)) return -1;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(clean[i]) * PESOS[i];
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv;
}

/**
 * Valida un CUIT completo.
 * @param {*} value
 * @returns {boolean}
 */
function isValidCuit(value) {
  const clean = normalizeCuit(value);
  if (!/^\d{11}$/.test(clean)) return false;
  return Number(clean[10]) === cuitDigitoVerificador(clean.slice(0, 10));
}

module.exports = { normalizeCuit, cuitDigitoVerificador, isValidCuit };
