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
