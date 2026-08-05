const POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireNumber: true,
  requireSymbol: true,
  bcryptRounds: 10,
};

function validatePassword(password) {
  if (!password || password.length < POLICY.minLength) {
    return `La contraseña debe tener al menos ${POLICY.minLength} caracteres`;
  }
  if (POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    return 'La contraseña debe incluir al menos una mayúscula';
  }
  if (POLICY.requireNumber && !/[0-9]/.test(password)) {
    return 'La contraseña debe incluir al menos un número';
  }
  if (POLICY.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    return 'La contraseña debe incluir al menos un símbolo';
  }
  return null;
}

function getPasswordStrength(password) {
  let score = 0;
  if (password.length >= POLICY.minLength) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

module.exports = { POLICY, validatePassword, getPasswordStrength };
