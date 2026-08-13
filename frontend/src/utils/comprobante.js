import { imprimirTermica, isSupported, isConnected, connectPrinter, disconnectPrinter, buildControlText } from './escpos'

const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

export function buildTicketText(venta, pagos, cfg = {}) {
  const NL = '\n'
  const sep = '-'.repeat(32)
  const center = (s) => { const p = Math.floor((32 - s.length) / 2); return ' '.repeat(Math.max(0, p)) + s }
  const lr = (l, r) => { const g = 32 - l.length - r.length; return l + ' '.repeat(Math.max(1, g)) + r }

  let t = ''
  t += center(cfg.nombre || 'FlexCRM') + NL
  if (cfg.ticket_cabecera) t += center(cfg.ticket_cabecera) + NL
  t += sep + NL
  t += center('COMPROBANTE') + NL
  t += sep + NL
  t += lr('Fecha:', new Date(venta.fecha).toLocaleDateString('es-AR') + ' ' + new Date(venta.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })) + NL
  t += lr('N°:', String(venta.numero || '')) + NL
  if (venta.cli_nombre) t += lr('Cliente:', venta.cli_nombre) + NL
  t += sep + NL;
  (venta.items || []).forEach((it) => {
    t += it.nombre + (it.talle ? ' T:' + it.talle : '') + NL
    t += lr('  ' + it.cantidad + ' x ' + fmt(it.precio), fmt(it.precio * it.cantidad)) + NL
  })
  t += sep + NL
  t += lr('TOTAL:', fmt(venta.total)) + NL
  if (pagos && pagos.length) {
    pagos.forEach((p) => { if (parseFloat(p.monto) > 0) t += lr(p.id || 'Efectivo', fmt(p.monto)) + NL })
  }
  if (venta._cae || venta.factura_cae) {
    t += NL + center('CAE: ' + (venta._cae || venta.factura_cae)) + NL
    if (venta._cae_vto || venta.factura_fecha_vto) t += center('Vto CAE: ' + (venta._cae_vto || venta.factura_fecha_vto)) + NL
    const cbte = venta._comprobante || venta.factura_tipo
    if (cbte && cbte !== 'ticket') {
      const tipoLabel = { facA: 'Factura A', facB: 'Factura B', facC: 'Factura C' }
      t += center(tipoLabel[cbte] || cbte) + NL
    }
  }
  if (cfg.ticket_pie) t += NL + center(cfg.ticket_pie) + NL
  t += NL + center('¡Gracias por su compra!') + NL
  return t
}

export function buildTicketHTML(venta, pagos, cfg = {}) {
  const t = buildTicketText(venta, pagos, cfg)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:monospace;white-space:pre;font-size:12px;padding:20px;max-width:350px;margin:0 auto}
    @media print{body{padding:0}}
  </style></head><body>${t.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</body></html>`
}

export function imprimirTicket(venta, pagos, cfg = {}) {
  const html = buildTicketHTML(venta, pagos, cfg)
  const w = window.open('', '_blank', 'width=400,height=600')
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400) }
}

export async function imprimirTicketTermica(venta, pagos, cfg = {}) {
  const text = buildTicketText(venta, pagos, cfg)
  await imprimirTermica(text, cfg)
}

export { isSupported, isConnected, connectPrinter, disconnectPrinter }

// ── Control / preparación ticket ──
export function buildControlHTML(venta, cfg = {}) {
  const t = buildControlText(venta, cfg)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:monospace;white-space:pre;font-size:12px;padding:20px;max-width:350px;margin:0 auto}
    @media print{body{padding:0}}
  </style></head><body>${t.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</body></html>`
}

export function imprimirControl(venta, cfg = {}) {
  const html = buildControlHTML(venta, cfg)
  const w = window.open('', '_blank', 'width=400,height=600')
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400) }
}

export async function imprimirControlTermica(venta, cfg = {}) {
  const text = buildControlText(venta, cfg)
  await imprimirTermica(text, cfg, 'secundaria')
}

export function descargarPDF(ventaId, api) {
  api('GET', '/ventas/' + ventaId + '/comprobante-pdf', null, { responseType: 'blob' }).then(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'venta-' + ventaId.substr(-8) + '.pdf'
    a.click()
    URL.revokeObjectURL(url)
  }).catch(() => {})
}

// ── Comprobantes de tesorería (retiros, depósitos, transferencias, movimientos) ──
export function imprimirComprobante({ titulo, lineas = [], monto, fecha, firma = '' }) {
  const sanitize = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const fmtM = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${sanitize(titulo)}</title>
  <style>body{font-family:Arial,sans-serif;max-width:500px;margin:40px auto;padding:30px;font-size:14px}
  h1{text-align:center;font-size:20px;margin-bottom:4px}
  .sub{text-align:center;color:#666;font-size:12px;margin-bottom:20px}
  .box{border:2px solid #333;border-radius:8px;padding:16px 20px;text-align:center;margin:16px 0}
  .val{font-size:32px;font-weight:900}
  .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #ccc;font-size:13px}
  .row span:first-child{color:#555}
  .firma{margin-top:50px;display:flex;gap:40px;justify-content:center}
  .fl{text-align:center;min-width:160px}.fl-line{border-top:1px solid #333;padding-top:8px;font-size:12px;color:#666;margin-top:50px}
  @media print{body{margin:10px}}</style></head><body>
  <h1>${sanitize(titulo)}</h1>
  <div class="sub">${new Date(fecha || Date.now()).toLocaleString('es-AR')}</div>
  ${lineas.map(([k, v]) => `<div class="row"><span>${sanitize(k)}</span><span>${sanitize(v)}</span></div>`).join('')}
  <div class="box"><div style="font-size:12px;color:#666">MONTO</div><div class="val">${fmtM(monto)}</div></div>
  ${firma ? `<div class="firma"><div class="fl"><div class="fl-line">${sanitize(firma)}</div></div></div>` : ''}
  </body></html>`
  const w = window.open('', '_blank', 'width=600,height=700')
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400) }
}
