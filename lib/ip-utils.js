const net = require('net');

function ipToBigInt(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
    return BigInt((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]);
  }
  if (net.isIPv6 && net.isIPv6(ip)) {
    const full = expandIPv6(ip);
    const parts = full.split(':');
    if (parts.length !== 8) return null;
    let bi = BigInt(0);
    for (const p of parts) {
      bi = (bi << 16n) + BigInt(parseInt(p, 16));
    }
    return bi;
  }
  return null;
}

function expandIPv6(ip) {
  if (!ip.includes('::')) return ip;
  const sides = ip.split('::');
  const left = sides[0] ? sides[0].split(':') : [];
  const right = sides[1] ? sides[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  const middle = new Array(missing).fill('0000');
  return [...left, ...middle, ...right].join(':');
}

function cidrMatch(ip, cidr) {
  const parts = cidr.split('/');
  if (parts.length !== 2) return false;
  const network = parts[0].trim();
  const prefix = parseInt(parts[1], 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 128) return false;

  const ipBi = ipToBigInt(ip);
  const netBi = ipToBigInt(network);
  if (ipBi === null || netBi === null) return false;

  const ipFamily = net.isIP(ip);
  const netFamily = net.isIP(network);
  if (ipFamily !== netFamily) return false;

  const maxPrefix = ipFamily === 4 ? 32 : 128;
  const mask = (BigInt(1) << BigInt(maxPrefix - prefix)) - BigInt(1);
  return (ipBi & ~mask) === (netBi & ~mask);
}

function ipInList(ip, list) {
  if (!ip || !Array.isArray(list)) return false;
  const normalizedIP = ip.replace(/^::ffff:/, '');
  for (const entry of list) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (trimmed.includes('/')) {
      if (cidrMatch(normalizedIP, trimmed)) return true;
    } else {
      if (normalizedIP === trimmed) return true;
    }
  }
  return false;
}

module.exports = { ipInList, cidrMatch, ipToBigInt, expandIPv6 };
