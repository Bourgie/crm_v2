#!/usr/bin/env node
/**
 * check-exposed-ports.js — Verifica que el origen Fly no exponga RDP/SSH
 *
 * Contexto: Cloudflare alertó "Exposed RDP Servers" el 25-Jul-2026 para
 * admin.flexcrm.com.ar. Investigación mostró falso positivo: Fly shared Anycast
 * 66.241.125.246 responde SYN-ACK en cualquier puerto, pero el contenedor es
 * Alpine Linux sin daemon RDP. Este script hace probe de aplicación (no solo SYN)
 * y falla si hay banner RDP/SSH real.
 *
 * Uso: node scripts/check-exposed-ports.js [--host admin.flexcrm.com.ar]
 * CI: npm run check:ports
 */
const net = require('net');

const HOST = process.argv[2]?.replace('--host=', '') || process.env.CHECK_HOST || 'admin.flexcrm.com.ar';
const PORTS = [
  { port: 3389, proto: 'RDP', payload: Buffer.from('030000130ed000001200000000000000020000000000', 'hex'), expectEmpty: true },
  { port: 22, proto: 'SSH', payload: null, expectBanner: false },
];

function probe({ port, proto, payload }) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let data = Buffer.alloc(0);
    let connected = false;
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ port, proto, status: connected ? 'OPEN_NO_BANNER (OK - falso positivo SYN-ACK)' : 'CLOSED/FILTERED (OK)', ok: true, dataLen: data.length });
    }, 3000);

    socket.setTimeout(3000);
    socket.on('timeout', () => { clearTimeout(timer); socket.destroy(); resolve({ port, proto, status: 'TIMEOUT (OK)', ok: true }); });
    socket.on('error', (e) => { clearTimeout(timer); resolve({ port, proto, status: `ERROR ${e.code} (OK)`, ok: true }); });
    socket.on('data', (chunk) => { data = Buffer.concat([data, chunk]); });
    socket.on('close', () => {
      clearTimeout(timer);
      if (!connected) return;
      // Si recibimos banner RDP/SSH real → FALLA (exposición real)
      if (data.length > 0) {
        const hasRDP = data[0] === 0x03 && data[1] === 0x00; // X.224
        const hasSSH = data.toString().startsWith('SSH-');
        if (hasRDP || hasSSH) {
          resolve({ port, proto, status: `EXPOSED! Banner real detectado (${data.slice(0, 40).toString('hex')})`, ok: false, dataLen: data.length });
        } else {
          resolve({ port, proto, status: `OPEN pero sin banner RDP/SSH (OK - SYN-ACK fantasma)`, ok: true, dataLen: data.length });
        }
      } else {
        resolve({ port, proto, status: 'OPEN sin banner (OK - Fly Anycast falso positivo)', ok: true, dataLen: 0 });
      }
    });
    socket.connect(port, HOST, () => {
      connected = true;
      if (payload) socket.write(payload);
      // Esperar 1.5s por banner
      setTimeout(() => socket.end(), 1500);
    });
  });
}

(async () => {
  console.log(`\n[check-exposed-ports] Probing ${HOST} ...`);
  console.log(`Nota: Fly shared IP responde SYN-ACK en cualquier puerto. Solo falla si hay banner de aplicación.\n`);
  const results = [];
  for (const p of PORTS) {
    const r = await probe(p);
    results.push(r);
    const icon = r.ok ? '✓' : '✗';
    console.log(` ${icon} ${r.proto} ${r.port}: ${r.status}`);
  }
  const failed = results.filter(r => !r.ok);
  if (failed.length) {
    console.error(`\n✗ EXPOSICIÓN REAL DETECTADA en ${failed.map(f => f.port).join(', ')}`);
    process.exit(1);
  } else {
    console.log(`\n✓ OK — No hay servicio RDP/SSH real expuesto (falso positivo SYN-ACK esperado)`);
    // Check adicional: el origen no debe servir HTTP por IP directa (server.js lo bloquea)
    console.log(`  Tip: Verifica en Cloudflare que admin/app estén en nube naranja (proxied)`);
    console.log(`  y que ENFORCE_CLOUDFLARE_ORIGIN=1 si quieres bloqueo estricto.\n`);
  }
})();
