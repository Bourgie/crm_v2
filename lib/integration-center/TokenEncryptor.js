// ═══════════════════════════════════════════
// Integration Center — TokenEncryptor
// Wrapper sobre crypto-utils.js existente
// ═══════════════════════════════════════════

const { encryptValue, decryptValue, isEncrypted } = require('../crypto-utils');

class TokenEncryptor {
  /**
   * Cifra un token con AES-256-GCM.
   */
  encrypt(token) {
    if (!token) return token;
    if (typeof token !== 'string') token = String(token);
    if (isEncrypted(token)) return token;
    return encryptValue(token);
  }

  /**
   * Descifra un token.
   */
  decrypt(token) {
    if (!token) return token;
    if (!isEncrypted(token)) return token;
    try {
      return decryptValue(token);
    } catch {
      return token;
    }
  }
}

module.exports = { TokenEncryptor };
