const { generateSync, verifySync, generateURI, generateSecret } = require('otplib');
const { cryptoPlugin, base32Plugin } = require('./otplib-plugins');

const defaults = {
  crypto: cryptoPlugin,
  base32: base32Plugin,
  period: 30,
  digits: 6,
  algorithm: 'sha1',
};

const totp = {
  generateSecret: (length = 20) => generateSecret({ ...defaults, length }),
  generate: (secret) => generateSync({ ...defaults, secret }),
  verify: ({ token, secret }) => verifySync({ ...defaults, token, secret }),
  toURI: ({ label, issuer, secret }) => generateURI({ ...defaults, label, issuer, secret }),
};

module.exports = { totp };
