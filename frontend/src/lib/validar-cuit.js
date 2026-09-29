// ═══════════════════════════════════════════
// Validación de CUIT (11 dígitos + dígito verificador)
// Espejo de lib/validar-cuit.js del backend para validar en el form
// antes de enviar. El backend vuelve a validar: esto es solo UX.
// ═══════════════════════════════════════════

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function normalizeCuit(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[-\s]/g, '');
}

export function cuitDigitoVerificador(clean) {
  if (!/^\d{10}$/.test(clean)) return -1;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(clean[i]) * PESOS[i];
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv;
}

export function isValidCuit(value) {
  const clean = normalizeCuit(value);
  if (!/^\d{11}$/.test(clean)) return false;
  return Number(clean[10]) === cuitDigitoVerificador(clean.slice(0, 10));
}

/**
 * Formatea un CUIT como XX-XXXXXXXX-X mientras se tipea.
 * Descarta todo lo que no sea dígito.
 */
export function formatCuit(value) {
  const clean = String(value ?? '').replace(/\D/g, '').slice(0, 11);
  const parts = [clean.slice(0, 2), clean.slice(2, 10), clean.slice(10, 11)];
  return parts.filter(Boolean).join('-');
}
