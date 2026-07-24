// ESC/POS commands for thermal printers
const ESC = '\x1B';
const LF = '\x0A';
const CUT = ESC + 'i';

function encode(text) {
  return new TextEncoder().encode(text);
}

function cmd(...bytes) {
  return new Uint8Array(bytes);
}

// ── ESC/POS Command Helpers ──
function escPosInit() {
  return cmd(0x1B, 0x40); // ESC @ — initialize
}

function escPosAlign(align) {
  const map = { left: 0, center: 1, right: 2 };
  return cmd(0x1B, 0x61, map[align] || 0); // ESC a n
}

function escPosBold(on) {
  return cmd(0x1B, 0x45, on ? 1 : 0); // ESC E n
}

function escPosDouble(on) {
  return cmd(0x1B, 0x47, on ? 1 : 0); // ESC G n
}

function escPosLineSpacing(val) {
  return cmd(0x1B, 0x33, Math.min(255, val || 24)); // ESC 3 n
}

function escPosCut(feed) {
  // Cut paper: ESC i (partial cut), feed N lines before cut
  if (feed) {
    return cmd(0x1D, 0x56, 66, feed); // GS V B n — feed + cut
  }
  return cmd(0x1D, 0x56, 0); // GS V 0 — full cut
}

function escPosOpenDrawer() {
  return cmd(0x1B, 0x70, 0, 25, 250); // pulse drawer pin 2
}

function escPosText(text) {
  return encode(text + '\n');
}

function escPosSeparator(char, length) {
  return encode((char || '-').repeat(length || 32) + '\n');
}

function escPosCenter(text, width) {
  const w = width || 32;
  const pad = Math.max(0, Math.floor((w - (text || '').length) / 2));
  return encode(' '.repeat(pad) + text + '\n');
}

function escPosLR(left, right, width) {
  const w = width || 32;
  const str = String(left || '');
  const rstr = String(right || '');
  const pad = Math.max(1, w - str.length - rstr.length);
  return encode(str + ' '.repeat(pad) + rstr + '\n');
}

// ── WebUSB Connection ──
let device = null;
let connected = false;

function isSupported() {
  return typeof navigator !== 'undefined' && !!navigator.usb;
}

function isConnected() {
  return connected && !!device;
}

async function connectPrinter() {
  if (!isSupported()) throw new Error('WebUSB no soportado en este navegador. Usá Chrome o Edge.');
  try {
    device = await navigator.usb.requestDevice({
      filters: [
        { vendorId: 0x0483 }, // STMicro (common in generic thermal printers)
        { vendorId: 0x04b8 }, // Epson TM series
        { vendorId: 0x0416 }, // Winbond
        { vendorId: 0x0fe6 }, // ICS Advent
        { vendorId: 0x067b }, // Prolific (common adapter)
      ],
    });
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    await device.claimInterface(0);
    connected = true;
    return { ok: true, name: device.productName || 'Impresora térmica' };
  } catch (e) {
    if (e.message?.includes('No device')) throw new Error('No se seleccionó ninguna impresora.');
    throw e;
  }
}

async function disconnectPrinter() {
  if (device) {
    try { await device.close(); } catch {}
    device = null;
    connected = false;
  }
}

async function sendToPrinter(data) {
  if (!device || !connected) throw new Error('Impresora no conectada. Conectala primero.');
  // Find OUT endpoint
  const config = device.configuration;
  if (!config) throw new Error('Configuración no disponible');
  const iface = config.interfaces[0];
  if (!iface) throw new Error('Interfaz no disponible');
  const alt = iface.alternate;
  const ep = alt.endpoints.find(e => e.direction === 'out');
  if (!ep) throw new Error('No se encontró endpoint de salida. Probá con otra impresora.');
  await device.transferOut(ep.endpointNumber, data);
}

// ── Build ticket as ESC/POS commands ──
function buildTickerData(ticketText, cfg = {}) {
  const commands = [];
  const w = cfg.ticket_width || 32;

  const push = (arr) => commands.push(arr);

  push(escPosInit());
  push(escPosLineSpacing(24));

  // Header
  push(escPosAlign('center'));
  push(escPosBold(true));
  push(escPosDouble(true));
  push(escPosCenter(cfg.nombre || 'FlexCRM', w));
  push(escPosDouble(false));
  push(escPosBold(false));

  if (cfg.ticket_cabecera) {
    push(escPosCenter(cfg.ticket_cabecera, w));
  }

  push(escPosSeparator('-', w));
  push(escPosAlign('left'));

  // Ticket lines
  const lines = ticketText.split('\n');
  for (const line of lines) {
    if (!line.trim()) {
      push(encode('\n'));
      continue;
    }
    // Check for centered lines (start with spaces for centering)
    const trimmed = line.trim();
    if (line.startsWith('  ') && !line.startsWith('   ')) {
      push(escPosCenter(trimmed, w));
    } else if (line.includes('  ') && !trimmed.startsWith('-') && (
      trimmed.includes('$') || trimmed.includes('x ') || trimmed.match(/\d\s{2,}\d/)
    )) {
      // LR format: detect price alignment
      const parts = trimmed.split(/\s{2,}/);
      if (parts.length >= 2) {
        push(escPosLR(parts[0].trim(), parts[parts.length - 1].trim(), w));
      } else {
        push(escPosText(line));
      }
    } else if (trimmed.includes('-'.repeat(5))) {
      push(escPosSeparator('-', w));
    } else {
      push(escPosText(line));
    }
  }

  // Footer
  if (cfg.ticket_pie) {
    push(encode('\n'));
    push(escPosAlign('center'));
    push(escPosCenter(cfg.ticket_pie, w));
  }

  push(encode('\n'));
  push(escPosAlign('center'));
  push(escPosText('Gracias por su compra!'));

  // Cut
  push(encode('\n\n\n\n'));
  push(escPosCut(3));

  // Combine all commands
  const totalLen = commands.reduce((s, c) => s + c.length, 0);
  const data = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of commands) {
    data.set(c, offset);
    offset += c.length;
  }

  return data;
}

// ── High-level: print ticket to thermal printer ──
async function imprimirTermica(ticketText, cfg = {}) {
  if (!isConnected()) {
    await connectPrinter();
  }
  const data = buildTickerData(ticketText, cfg);
  await sendToPrinter(data);
}

// ── Build ticket text from venta data (same format as buildTicketHTML) ──
function buildTicketText(venta, pagos, cfg = {}) {
  const NL = '\n';
  const sep = '-'.repeat(32);
  const center = (s) => { const p = Math.floor((32 - s.length) / 2); return ' '.repeat(Math.max(0, p)) + s; };
  const lr = (l, r) => { const g = 32 - l.length - r.length; return l + ' '.repeat(Math.max(1, g)) + r; };

  let t = '';
  t += center(cfg.nombre || 'FlexCRM') + NL;
  if (cfg.ticket_cabecera) t += center(cfg.ticket_cabecera) + NL;
  t += sep + NL;
  t += center('COMPROBANTE') + NL;
  t += sep + NL;
  t += lr('Fecha:', new Date(venta.fecha).toLocaleDateString('es-AR') + ' ' + new Date(venta.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })) + NL;
  t += lr('N°:', String(venta.numero || '')) + NL;
  if (venta.cli_nombre) t += lr('Cliente:', venta.cli_nombre) + NL;
  t += sep + NL;
  (venta.items || []).forEach((it) => {
    t += it.nombre + (it.talle ? ' T:' + it.talle : '') + NL;
    t += lr('  ' + it.cantidad + ' x ' + fmt(it.precio), fmt(it.precio * it.cantidad)) + NL;
  });
  t += sep + NL;
  t += lr('TOTAL:', fmt(venta.total)) + NL;
  if (pagos && pagos.length) {
    pagos.forEach((p) => { if (parseFloat(p.monto) > 0) t += lr(p.id || 'Efectivo', fmt(p.monto)) + NL; });
  }
  if (venta.factura_cae) {
    t += NL + center('CAE: ' + venta.factura_cae) + NL;
    if (venta.factura_fecha_vto) t += center('Vto CAE: ' + venta.factura_fecha_vto) + NL;
    const cbte = venta.factura_tipo;
    if (cbte && cbte !== 'ticket') {
      const tipoLabel = { facA: 'Factura A', facB: 'Factura B', facC: 'Factura C' };
      t += center(tipoLabel[cbte] || cbte) + NL;
    }
  }
  if (cfg.ticket_pie) t += NL + center(cfg.ticket_pie) + NL;
  t += NL + center('Gracias por su compra!') + NL;
  return t;
}

const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

export { isSupported, isConnected, connectPrinter, disconnectPrinter, imprimirTermica, buildTicketText, buildTickerData };
