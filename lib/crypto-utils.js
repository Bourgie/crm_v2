require('dotenv').config();
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey() {
  const key = process.env.CONFIG_ENCRYPTION_KEY;
  if (!key) throw new Error('CONFIG_ENCRYPTION_KEY no configurada en .env');
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) throw new Error('CONFIG_ENCRYPTION_KEY debe ser 64 caracteres hex (32 bytes)');
  return buf;
}

const SENSITIVE_KEYS = new Set([
  'tienda_woo_key', 'tienda_woo_secret',
  'tienda_tn_access_token',
  'tienda_meli_app_id', 'tienda_meli_client_secret',
  'tienda_meli_access_token', 'tienda_meli_refresh_token',
  'smtp_user', 'smtp_pass',
  'arca_access_token', 'arca_cert', 'arca_key',
]);

function isSensitiveKey(key) {
  return SENSITIVE_KEYS.has(key);
}

function encryptValue(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;
  if (typeof plaintext !== 'string') plaintext = String(plaintext);
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + tag + ':' + encrypted;
}

function decryptValue(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') return ciphertext;
  if (!ciphertext.includes(':')) return ciphertext;
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return ciphertext;
  const [ivHex, tagHex, encrypted] = parts;
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return ciphertext;
  }
}

function isEncrypted(value) {
  return typeof value === 'string' && /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/.test(value);
}

module.exports = { encryptValue, decryptValue, isSensitiveKey, isEncrypted, SENSITIVE_KEYS };
