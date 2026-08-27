// ═══════════════════════════════════════════
// Comprobante interno de pago SaaS (PDF) — no fiscal.
// Complementa el mail automático; hook para factura ARCA a futuro.
// ═══════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const DIR = path.join(__dirname, '..', 'data', 'comprobantes');

function fmtARS(monto) {
  return '$' + Number(monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function generarComprobantePDF({ comprobanteNum, empresa, empresaCodigo, plan, monto, moneda, tipo, vencimiento, prorrateo, origen, fecha }) {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  const filePath = path.join(DIR, comprobanteNum + '.pdf');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const tipoLabel = { signup: 'Alta de cuenta', upgrade: 'Cambio de plan (upgrade)', downgrade: 'Cambio de plan', renovacion: 'Renovación', manual: 'Pago registrado manualmente' }[tipo] || tipo;
  const origenLabel = origen === 'manual_efectivo' ? 'Efectivo (registro manual)' :
    origen === 'manual_transferencia' ? 'Transferencia (registro manual)' : 'MercadoPago';

  doc.fontSize(24).fillColor('#F97316').text('FlexCRM', { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(13).fillColor('#374151').text('Comprobante de pago — ' + comprobanteNum);
  doc.moveDown(0.2);
  doc.fontSize(9).fillColor('#9ca3af').text('Comprobante interno no fiscal — ' + new Date(fecha).toLocaleString('es-AR'));

  doc.moveDown(1.2);
  doc.fontSize(12).fillColor('#111827').text('Detalle de la operación', { underline: false });
  doc.moveDown(0.5);

  const filas = [
    ['Empresa', empresa || '—'],
    ['Código', empresaCodigo || '—'],
    ['Concepto', tipoLabel],
    ['Plan contratado', plan || '—'],
    ['Medio de pago', origenLabel],
    ['Importe', fmtARS(monto) + (moneda && moneda !== 'ARS' ? ' (' + moneda + ')' : '')],
    ['Nuevo vencimiento', vencimiento || '—'],
    ['Fecha', new Date(fecha).toLocaleDateString('es-AR')],
  ];
  for (const [k, v] of filas) {
    doc.fontSize(10).fillColor('#6b7280').text(k, { continued: true, width: 160 });
    doc.fillColor('#111827').text(String(v), { align: 'right' });
    doc.moveDown(0.2);
  }

  if (prorrateo && (prorrateo.dias_restantes != null || prorrateo.reembolso != null)) {
    doc.moveDown(1);
    doc.fontSize(12).fillColor('#111827').text('Detalle de prorrateo');
    doc.moveDown(0.4);
    const pf = [
      ['Días restantes del plan anterior', prorrateo.dias_restantes != null ? prorrateo.dias_restantes + ' días' : '—'],
      ['Precio plan actual', prorrateo.precio_actual != null ? fmtARS(prorrateo.precio_actual) : '—'],
      ['Precio plan nuevo', prorrateo.precio_nuevo != null ? fmtARS(prorrateo.precio_nuevo) : '—'],
      ['Saldo a favor', prorrateo.reembolso != null ? fmtARS(prorrateo.reembolso) : '—'],
      ['Total abonado', prorrateo.monto != null ? fmtARS(prorrateo.monto) : '—'],
    ];
    for (const [k, v] of pf) {
      doc.fontSize(10).fillColor('#6b7280').text(k, { continued: true, width: 160 });
      doc.fillColor('#111827').text(String(v), { align: 'right' });
      doc.moveDown(0.2);
    }
  }

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#9ca3af').text('FlexCRM — sistema de gestión multi-rubro. Este comprobante no posee validez fiscal.', { align: 'center' });

  doc.end();
  return filePath;
}

module.exports = { generarComprobantePDF, fmtARS };
