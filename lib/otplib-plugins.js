const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PADDING = '=';

function bytesToBase32(bytes, padding = true) {
  let bits = '';
  for (const b of bytes) {
    bits += b.toString(2).padStart(8, '0');
  }
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5).padEnd(5, '0');
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  if (padding) {
    while (out.length % 8 !== 0) out += PADDING;
  }
  return out;
}

function base32ToBytes(str) {
  const cleaned = str.replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const c of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx === -1) throw new Error('Invalid base32 character');
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

function constantTimeEqual(a, b) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  let result = 0;
  for (let i = 0; i < aa.length; i++) {
    result |= aa[i] ^ bb[i];
  }
  return result === 0;
}

function hmac(algorithm, secret, data) {
  const key = typeof secret === 'string' ? Buffer.from(secret, 'ascii') : Buffer.from(secret);
  const msg = typeof data === 'string' ? Buffer.from(data, 'ascii') : Buffer.from(data);
  const algo = algorithm.replace(/-/g, '').toLowerCase();
  return crypto.createHmac(algo, key).update(msg).digest();
}

function randomBytes(length) {
  return crypto.randomBytes(length);
}

const cryptoPlugin = {
  name: 'node-crypto',
  hmac,
  randomBytes,
  constantTimeEqual,
};

const base32Plugin = {
  name: 'node-base32',
  encode: (data, options = {}) => bytesToBase32(data, options.padding !== false),
  decode: (str) => base32ToBytes(str),
};

module.exports = { cryptoPlugin, base32Plugin };
