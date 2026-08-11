import { useState, useEffect, useCallback, useRef } from 'react'
import { useApi } from '../hooks/useApi'
import { useApp, useToast, useAuth } from '../store'
import { Modal } from '../components/Modal'
import { Field, EmptyRow, Loader, ConfirmDialog } from '../components/UI'
import { exportExcel } from '../utils/excel'
import QRCode from 'qrcode'

const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) return true
  return /MacIntel/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1
}
const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('es-AR') : '—'

const PAGOS_DEF = [
  { id: 'efectivo', nombre: 'Efectivo', icono: '💵', recargo: 0, activo: true },
  { id: 'debito', nombre: 'Débito', icono: '💳', recargo: 0, activo: true },
  { id: 'credito', nombre: 'Crédito', icono: '💳', recargo: 10, activo: true },
  { id: 'transferencia', nombre: 'Transferencia', icono: '🏦', recargo: 0, activo: true },
  { id: 'qr', nombre: 'QR / MP', icono: '📱', recargo: 0, activo: true },
  { id: 'ctacte', nombre: 'Cuenta Corriente', icono: '📒', recargo: 0, activo: true },
]

// ── Apertura ────────────────────────────────────────────────────
function ModalApertura({ open, onClose, onAbrir }) {
  const [fondo, setFondo] = useState('5000')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  async function abrir() {
    setSaving(true)
    try { await onAbrir(parseFloat(fondo) || 0); onClose() }
    catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="💰 Abrir caja" size="sm"
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={abrir} disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Abriendo...</> : '✅ Abrir caja'}
        </button></>}>
      <Field label="Fondo inicial ($)">
        <input type="number" value={fondo} onChange={(e) => setFondo(e.target.value)} min="0" style={{ textAlign: 'center', fontSize: 20, fontWeight: 700 }} />
      </Field>
    </Modal>
  )
}

// ── Movimiento manual ──────────────────────────────────────────
function ModalMovimiento({ open, onClose, tipo: tipoInit, onGuardar }) {
  const [tipo, setTipo] = useState(tipoInit || 'egreso')
  const [conc, setConc] = useState('')
  const [monto, setMonto] = useState('')
  const [imprimir, setImprimir] = useState(true)
  const [firmante, setFirmante] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  function sanitizeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function imprimirRetiro(concepto, monto, firma) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Retiro</title>
    <style>body{font-family:Arial,sans-serif;max-width:500px;margin:40px auto;padding:30px;font-size:14px}
    h1{text-align:center}.box{border:2px solid #333;border-radius:8px;padding:20px;text-align:center;margin:24px 0}
    .val{font-size:32px;font-weight:900}.firma{margin-top:50px;display:flex;gap:40px;justify-content:center}
    .fl{text-align:center;min-width:160px}.fl-line{border-top:1px solid #333;padding-top:8px;font-size:12px;color:#666;margin-top:50px}
    @media print{body{margin:10px}}</style></head><body>
    <h1>Comprobante de Retiro</h1>
    <div style="text-align:center;color:#666;font-size:12px">${new Date().toLocaleString('es-AR')}</div>
    <p><b>Concepto:</b> ${sanitizeHtml(concepto)}</p>
    <div class="box"><div style="font-size:12px;color:#666">MONTO</div><div class="val">${fmt(monto)}</div></div>
    <div class="firma"><div class="fl"><div class="fl-line">Firma cajero</div></div>
    <div class="fl"><div class="fl-line">${sanitizeHtml(firma || 'Firma autorizado')}</div></div></div></body></html>`
    const w = window.open('', '_blank', 'width=600,height=700')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400) }
  }

  async function guardar() {
    if (!conc.trim() || !monto) { toast('Completá todos los campos', 'err'); return }
    setSaving(true)
    try {
      await onGuardar({ tipo, concepto: conc, monto: parseFloat(monto) })
      if (tipo === 'egreso' && imprimir) imprimirRetiro(conc, parseFloat(monto), firmante)
      onClose()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Movimiento de caja" size="sm"
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={guardar} disabled={saving}>Registrar</button></>}>
      <Field label="Tipo">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="ingreso">Ingreso</option>
          <option value="egreso">Egreso / retiro</option>
        </select>
      </Field>
      <Field label="Concepto *"><input value={conc} onChange={(e) => setConc(e.target.value)} placeholder="Ej: Pago proveedor..." /></Field>
      <Field label="Monto *"><input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} min="0" step="0.01" /></Field>
      {tipo === 'egreso' && (<>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: 10, background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)' }}>
          <input type="checkbox" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} style={{ width: 16, height: 16 }} />
          🖨️ Generar comprobante para firma
        </label>
        {imprimir && <div style={{ marginTop: 8 }}><Field label="Autorizado / Firmante"><input value={firmante} onChange={(e) => setFirmante(e.target.value)} placeholder="Nombre del autorizado" /></Field></div>}
      </>)}
    </Modal>
  )
}

// ── Cobro multi-método ────────────────────────────────────────
function ModalCobro({ open, onClose, venta, pagosMethods, onConfirm }) {
  const initialRows = [{ metodo: 'efectivo', monto: String(venta?.total || ''), cuotas: '1', obs: '', nro_comprobante: '' }]
  const [rows, setRows] = useState(initialRows)
  const [descPct, setDescPct] = useState('')
  const [codigoInput, setCodigoInput] = useState('')
  const [codigoValido, setCodigoValido] = useState(null)
  const [validando, setValidando] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const { api } = useApi()

  if (!venta) return null
  const totalBase = venta.total || 0
  const desc = codigoValido ? codigoValido.descuento_pct : (parseFloat(descPct) || 0)
  const totalConDesc = codigoValido && codigoValido.tipo === 'monto'
    ? Math.max(0, totalBase - codigoValido.valor)
    : Math.round(totalBase * (1 - desc / 100))

  const rowsValidos = rows.filter((r) => parseFloat(r.monto) > 0)
  const sumBases = rowsValidos.reduce((a, r) => a + (parseFloat(r.monto) || 0), 0)

  // Apply recargo for credito
  const sumFinals = rowsValidos.reduce((a, r) => {
    const m = parseFloat(r.monto) || 0
    const metInfo = pagosMethods.find((p) => p.id === r.metodo) || {}
    const rec = r.metodo === 'credito' ? (parseFloat(metInfo.recargo) || 0) : 0
    return a + m + Math.round(m * rec / 100)
  }, 0)

  const diff = sumBases - totalConDesc
  const tieneCuotas = rows.some((r) => r.metodo === 'credito' && parseInt(r.cuotas || 1) > 1)

  function setRow(i, field, val) { setRows((p) => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r)) }
  function addRow() {
    const usado = new Set(rows.map((r) => r.metodo))
    const libre = pagosMethods.find((p) => !usado.has(p.id)) || pagosMethods[0]
    setRows((p) => [...p, { metodo: libre?.id || 'efectivo', monto: String(Math.max(0, totalConDesc - sumBases)), cuotas: '1', obs: '', nro_comprobante: '' }])
  }

  async function validarCodigo() {
    if (!codigoInput.trim()) { toast('Ingresá un código', 'err'); return }
    setValidando(true)
    try {
      const r = await api('POST', '/codigos/validar', { codigo: codigoInput, monto_compra: totalBase })
      setCodigoValido(r)
      if (r.descuento_pct > 0) setDescPct(String(r.descuento_pct))
      toast(`✅ Código válido: ${r.tipo === 'porcentaje' ? r.valor + '% OFF' : '$' + r.valor + ' OFF'}`, 'ok')
    } catch (e) { setCodigoValido(null); toast(e.message, 'err') }
    finally { setValidando(false) }
  }

  function quitarCodigo() { setCodigoValido(null); setCodigoInput(''); setDescPct('') }

  async function confirmar() {
    if (!rowsValidos.length) { toast('Ingresá al menos un monto', 'err'); return }
    if (sumBases < totalConDesc - 0.5) { toast(`Faltan ${fmt(totalConDesc - sumBases)} para completar el cobro`, 'err'); return }
    setSaving(true)
    try {
      const pagos = rowsValidos.map((r) => {
        const metInfo = pagosMethods.find((p) => p.id === r.metodo) || {}
        const rec = r.metodo === 'credito' ? (parseFloat(metInfo.recargo) || 0) : 0
        const base = parseFloat(r.monto) || 0
        return { id: r.metodo, monto: String(Math.round(base + base * rec / 100)), monto_base: base, recargo_pct: rec, cuotas: r.cuotas || '1', obs: r.obs, nro_comprobante: r.nro_comprobante || '' }
      })
      await onConfirm({ pagos, descuento_pct: desc, total_cobrado: sumFinals, codigo_descuento: codigoValido ? codigoValido.codigo : undefined })
      onClose()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={`💳 Cobrar venta #${venta.numero}`} size="md"
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" style={{ background: sumBases >= totalConDesc - 0.5 ? 'var(--ok)' : undefined }} onClick={confirmar} disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Procesando...</> : '✅ Confirmar cobro'}
        </button></>}>
      {/* Info */}
      <div style={{ textAlign: 'center', padding: '10px 0 14px', borderBottom: '2px solid var(--bd)', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--mu)', marginBottom: 4 }}>{venta.cli_nombre || 'Consumidor final'}</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--ok)' }}>{fmt(totalBase)}</div>
      </div>

      {/* Descuento */}
      <div style={{ marginBottom: 12 }}>
        {/* Código descuento */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 12px', background: codigoValido ? 'rgba(34,197,94,.08)' : 'var(--sf)', borderRadius: 8, border: codigoValido ? '1px solid var(--ok)' : '1px solid var(--bd)' }}>
          <span style={{ fontSize: 13, color: 'var(--mu)', flexShrink: 0 }}>🏷️ Código</span>
          <input type="text" value={codigoInput} onChange={(e) => setCodigoInput(e.target.value.toUpperCase())}
            placeholder="INGRESÁ EL CÓDIGO" disabled={!!codigoValido || tieneCuotas}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, textTransform: 'uppercase' }} />
          {!codigoValido ? (
            <button type="button" className="btn btn-sm" disabled={validando || tieneCuotas} onClick={validarCodigo}
              style={{ padding: '4px 10px', fontSize: 11, background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 6 }}>
              {validando ? '⏳' : 'Validar'}
            </button>
          ) : (
            <button type="button" className="btn btn-sm" onClick={quitarCodigo}
              style={{ padding: '4px 10px', fontSize: 11, background: 'none', border: '1px solid var(--bd)', borderRadius: 6 }}>
              ✕ Quitar
            </button>
          )}
        </div>
        {/* Descuento manual % */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--sf)', borderRadius: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--mu)', flexShrink: 0 }}>Descuento %</span>
          <input type="number" value={descPct} onChange={(e) => setDescPct(e.target.value)} placeholder="0" min="0" max="100"
            disabled={!!codigoValido || tieneCuotas} style={{ width: 80, textAlign: 'center' }} />
          {desc > 0 && <span style={{ fontSize: 12, color: 'var(--bad)' }}>−{fmt(totalBase - totalConDesc)} → Total: {fmt(totalConDesc)}</span>}
          {codigoValido && <span style={{ fontSize: 11, color: 'var(--ok)' }}>✅ {codigoValido.tipo === 'porcentaje' ? `${codigoValido.valor}% OFF` : `$${codigoValido.valor} OFF`}{codigoValido.notas ? ` · ${codigoValido.notas}` : ''}</span>}
          {tieneCuotas && <span style={{ fontSize: 11, color: 'var(--warn)' }}>No disponible con cuotas</span>}
        </div>
      </div>

      {/* Métodos de pago */}
      {rows.map((row, i) => {
        const metInfo = pagosMethods.find((p) => p.id === row.metodo) || {}
        const rec = row.metodo === 'credito' ? (parseFloat(metInfo.recargo) || 0) : 0
        const esCredito = row.metodo === 'credito'
        return (
          <div key={i} style={{ background: 'var(--bg)', border: '1.5px solid var(--bd)', borderRadius: 9, padding: '10px 12px', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={row.metodo} onChange={(e) => setRow(i, 'metodo', e.target.value)}
                style={{ flex: 2, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 13 }}>
                {pagosMethods.map((p) => <option key={p.id} value={p.id}>{p.icono} {p.nombre}{parseFloat(p.recargo) > 0 ? ` (+${p.recargo}%)` : ''}</option>)}
              </select>
              <input type="number" value={row.monto} onChange={(e) => setRow(i, 'monto', e.target.value)}
                placeholder="Monto $" min="0"
                style={{ flex: 3, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 16, fontWeight: 800, textAlign: 'right' }} />
              {rows.length > 1 && <button type="button" onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))}
                style={{ background: 'none', border: '1.5px solid var(--bd)', borderRadius: 7, padding: '4px 8px', cursor: 'pointer', color: 'var(--mu)' }}>✕</button>}
            </div>
            {esCredito && rec > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--mu)' }}>Cuotas:</label>
                <select value={row.cuotas || '1'} onChange={(e) => setRow(i, 'cuotas', e.target.value)}
                  style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: '1.5px solid var(--bd)', fontSize: 12 }}>
                  {[1, 3, 6, 12, 18, 24].map((n) => <option key={n} value={n}>{n === 1 ? '1 cuota (contado)' : `${n} cuotas`}</option>)}
                </select>
                <span style={{ fontSize: 11, color: 'var(--warn)', fontWeight: 700 }}>+{rec}% recargo</span>
              </div>
            )}
            <input type="text" value={row.obs} onChange={(e) => setRow(i, 'obs', e.target.value)}
              placeholder={esCredito ? 'Tipo tarjeta, N° ticket...' : 'Observación (opcional)'}
              style={{ width: '100%', marginTop: 6, padding: '5px 8px', borderRadius: 7, border: '1.5px solid var(--bd)', fontSize: 11 }} />
            {row.metodo === 'transferencia' && (
              <input type="text" value={row.nro_comprobante || ''} onChange={(e) => setRow(i, 'nro_comprobante', e.target.value)}
                placeholder="N° comprobante de transferencia *"
                style={{ width: '100%', marginTop: 6, padding: '5px 8px', borderRadius: 7, border: '1.5px solid #f59e0b', fontSize: 11, fontWeight: 600 }} />
            )}
          </div>
        )
      })}
      <button type="button" className="btn btn-secondary btn-sm" onClick={addRow} style={{ marginBottom: 12 }}>+ Agregar método</button>

      {/* Vuelto/Faltante */}
      {rowsValidos.length > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: Math.abs(diff) < 1 ? 'rgba(34,197,94,.1)' : diff > 0 ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13 }}>{Math.abs(diff) < 1 ? '✅ Exacto' : diff > 0 ? 'Vuelto' : 'Faltan'}</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: Math.abs(diff) < 1 ? 'var(--ok)' : diff > 0 ? 'var(--ok)' : 'var(--bad)' }}>
            {Math.abs(diff) < 1 ? '' : fmt(Math.abs(diff))}
          </span>
        </div>
      )}
    </Modal>
  )
}

// ── Selector tipo comprobante (ctacte) ─────────────────────────
function ModalComprobante({ open, onClose, venta, onConfirm, cfg }) {
  if (!venta) return null
  const condFiscal = (cfg && cfg.arca_condicion_fiscal) || 'responsable_inscripto'
  const TIPOS_ALL = [
    ['ticket', '🏷️ Ticket (sin factura)'],
    ['facB', '📄 Factura B — Consumidor final'],
    ['facA', '📄 Factura A — Responsable inscripto'],
    ['facC', '📄 Factura C — Monotributista/exento'],
  ]
  const TIPOS = condFiscal === 'responsable_inscripto'
    ? TIPOS_ALL
    : TIPOS_ALL.filter(([t]) => t === 'ticket' || t === 'facC')
  return (
    <Modal open={open} onClose={onClose} title="🧾 Tipo de comprobante" size="sm">
      <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
        <div style={{ fontWeight: 700 }}>{venta.cli_nombre || 'Cliente'}</div>
        <div style={{ color: 'var(--mu)' }}>Cuenta corriente · {fmt(venta.total)}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {TIPOS.map(([tipo, label]) => (
          <button type="button" key={tipo} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '12px 16px', fontSize: 14 }}
            onClick={() => onConfirm(tipo)}>
            {label}
          </button>
        ))}
      </div>
    </Modal>
  )
}

// ── Cierre ─────────────────────────────────────────────────────
function ModalCierre({ open, onClose, estado, onCerrar }) {
  const [saldoReal, setSaldoReal] = useState('')
  const [resumen, setResumen] = useState(null)
  const [saving, setSaving] = useState(false)
  const { api } = useApi()
  const { sucSesion } = useApp()
  const { toast } = useToast()

  useEffect(() => {
    if (!open || !sucSesion) return
    api('GET', '/caja/resumen-cierre/' + sucSesion).then(setResumen).catch(() => null)
  }, [open, sucSesion])

  async function cerrar() {
    if (!saldoReal && saldoReal !== 0) { toast('Ingresá el saldo real', 'err'); return }
    setSaving(true)
    try { await onCerrar(parseFloat(saldoReal) || 0); onClose() }
    catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  function imprimirResumen() {
    const r = resumen?.resumen || {}
    const efEsperado = r.efectivo_esperado || estado?.saldo_efectivo || 0
    const porPago = resumen?.ventas?.por_pago || {}
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cierre de caja</title>
    <style>body{font-family:monospace;font-size:12px;padding:20px;max-width:400px;margin:0 auto}
    h2{text-align:center}h3{text-align:center;font-size:11px;color:#666}
    table{width:100%;border-collapse:collapse;margin:12px 0}
    th,td{padding:4px 6px;text-align:left;border-bottom:1px solid #ccc}
    .r{text-align:right}.b{font-weight:700}.s{font-size:18px}
    .total{border-top:2px solid #000;font-weight:700;font-size:14px}
    @media print{body{padding:0}}</style></head><body>
    <h2>CIERRE DE CAJA</h2>
    <h3>${new Date().toLocaleString('es-AR')}</h3>
    <table>
      <tr><td>Fondo inicial</td><td class="r">${fmt(r.fondo_inicial||0)}</td></tr>
      <tr><td>Ventas efectivo</td><td class="r">${fmt(r.ingresos_efectivo_ventas||0)}</td></tr>
      <tr><td>Ingresos manuales</td><td class="r">${fmt(r.ingresos_manual_efectivo||0)}</td></tr>
      <tr><td>Egresos</td><td class="r">−${fmt(r.egresos_efectivo||0)}</td></tr>
      <tr class="total"><td>Efectivo esperado</td><td class="r">${fmt(efEsperado)}</td></tr>
    </table>
    <table>
      <tr><th>Método</th><th class="r">Monto</th><th class="r">Cant.</th></tr>
      ${Object.entries(porPago).map(([k,v])=>`<tr><td data-label="Método">${sanitizeHtml(k)}</td><td data-label="Monto" class="r">${fmt(v.monto)}</td><td data-label="Cant." class="r">${v.cantidad}</td></tr>`).join('')}
    </table>
    <p style="text-align:center;color:#666;font-size:10px;margin-top:20px">— Cierre de caja —</p>
    </body></html>`
    const w = window.open('', '_blank', 'width=500,height=700')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400) }
  }

  const r = resumen?.resumen || {}
  const efEsperado = r.efectivo_esperado || estado?.saldo_efectivo || 0
  const diff = (parseFloat(saldoReal) || 0) - efEsperado

  return (
    <Modal open={open} onClose={onClose} title="🔒 Cerrar caja" size="lg"
      footer={<>
        {resumen && <button type="button" className="btn btn-secondary" onClick={imprimirResumen}>🖨️ Imprimir resumen</button>}
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-danger" onClick={cerrar} disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Cerrando...</> : '🔒 Confirmar cierre'}
        </button>
      </>}>
      {resumen && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 8 }}>Ventas del día</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {Object.entries(resumen.ventas?.por_pago || {}).map(([met, d]) => (
              <div key={met} style={{ background: 'var(--sf)', borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 90 }}>
                <div style={{ fontSize: 11, color: 'var(--mu)' }}>{met}</div>
                <div style={{ fontWeight: 700 }}>{fmt(d.monto)}</div>
                <div style={{ fontSize: 11, color: 'var(--mu)' }}>{d.cantidad} vtas</div>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '12px 16px' }}>
            {[['Fondo inicial', r.fondo_inicial], ['Ventas efectivo', r.ingresos_efectivo_ventas], ['Ingresos manuales', r.ingresos_manual_efectivo], ['Egresos', -(r.egresos_efectivo || 0)]].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: 'var(--mu)' }}>{label}</span>
                <span style={{ fontWeight: 600, color: val < 0 ? 'var(--bad)' : 'inherit' }}>{val < 0 ? '−' : ''}{fmt(Math.abs(val))}</span>
              </div>
            ))}
            <div style={{ borderTop: '2px solid var(--bd)', paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
              <span>Efectivo esperado</span><span style={{ color: 'var(--ok)' }}>{fmt(efEsperado)}</span>
            </div>
          </div>
        </div>
      )}
      <Field label="Efectivo real contado ($)">
        <input type="number" value={saldoReal} onChange={(e) => setSaldoReal(e.target.value)} min="0" step="0.01"
          style={{ fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
      </Field>
      {saldoReal !== '' && !isNaN(parseFloat(saldoReal)) && (
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: Math.abs(diff) < 1 ? 'rgba(34,197,94,.1)' : diff < 0 ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
            <span>Diferencia</span>
            <span style={{ color: Math.abs(diff) < 1 ? 'var(--ok)' : diff < 0 ? 'var(--bad)' : 'var(--warn)' }}>
              {diff >= 0 ? '+' : ''}{fmt(diff)} {Math.abs(diff) < 1 ? '✅ Cuadra' : diff < 0 ? '⚠️ Falta' : '⚠️ Sobra'}
            </span>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Corte parcial ──────────────────────────────────────────────
function ModalCorteParcial({ open, onClose, estado }) {
  const imprimir = () => {
    const e = estado
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Corte parcial</title>
    <style>body{font-family:monospace;font-size:12px;padding:20px;max-width:350px;margin:0 auto}
    h2{text-align:center}h3{text-align:center;font-size:11px;color:#666}
    table{width:100%;border-collapse:collapse;margin:12px 0}
    th,td{padding:4px 6px;text-align:left;border-bottom:1px solid #ccc}
    .r{text-align:right}.b{font-weight:700}.s{font-size:18px}
    @media print{body{padding:0}}</style></head><body>
    <h2>Corte Parcial</h2>
    <h3>${new Date().toLocaleString('es-AR')}</h3>
    <div style="display:flex;justify-content:space-between">
      <span>Fondo inicial:</span><span class="b">${fmt(e?.fondo_inicial||0)}</span>
    </div>
    <div style="display:flex;justify-content:space-between">
      <span>Efectivo:</span><span class="b">${fmt(e?.saldo_efectivo||0)}</span>
    </div>
    <div style="display:flex;justify-content:space-between">
      <span>Ingresos:</span><span class="b">${fmt(e?.ingresos||0)}</span>
    </div>
    <div style="display:flex;justify-content:space-between">
      <span>Egresos:</span><span class="b">${fmt(e?.egresos||0)}</span>
    </div>
    <table><tr><th>Método</th><th class="r">Monto</th></tr>
    ${Object.entries(e?.por_pago||{}).map(([k,v])=>`<tr><td data-label="Método">${sanitizeHtml(k)}</td><td data-label="Monto" class="r">${fmt(v)}</td></tr>`).join('')}
    </table>
    <p style="text-align:center;color:#666;font-size:10px;margin-top:20px">— Corte parcial —</p>
    </body></html>`
    const w = window.open('', '_blank', 'width=400,height=600')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400) }
  }

  return (
    <Modal open={open} onClose={onClose} title="📋 Corte parcial de caja" size="md"
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        <button type="button" className="btn btn-primary" onClick={imprimir}>🖨️ Imprimir corte</button></>}>
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--mu)' }}>Fondo inicial</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{fmt(estado?.fondo_inicial||0)}</div>
        </div>
        <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--mu)' }}>Efectivo actual</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ok)' }}>{fmt(estado?.saldo_efectivo||0)}</div>
        </div>
        <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--mu)' }}>Ingresos</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ok)' }}>{fmt(estado?.ingresos||0)}</div>
        </div>
        <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--mu)' }}>Egresos</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--bad)' }}>{fmt(estado?.egresos||0)}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 8 }}>Ventas por método</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {Object.entries(estado?.por_pago||{}).length === 0
          ? <div style={{ fontSize: 13, color: 'var(--mu)', padding: 8 }}>Sin movimientos</div>
          : Object.entries(estado?.por_pago||{}).map(([met, monto]) => (
            <div key={met} style={{ background: 'var(--sf)', borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: 11, color: 'var(--mu)' }}>{met}</div>
              <div style={{ fontWeight: 800 }}>{fmt(monto)}</div>
            </div>
          ))}
      </div>
    </Modal>
  )
}

// ── Helper: imprimir ticket ──────────────────────────────────────
import { imprimirTicket, imprimirTicketTermica, imprimirControl, imprimirControlTermica, isSupported, isConnected, connectPrinter, disconnectPrinter } from '../utils/comprobante'
let _printerStatus = { connected: false, name: '' }
let _printerSegundaStatus = { connected: false, name: '' }
export function getPrinterStatus() { return _printerStatus }
export function getPrinterSegundaStatus() { return _printerSegundaStatus }
export async function conectarImpresora() {
  try {
    const r = await connectPrinter()
    _printerStatus = { connected: true, name: r.name || 'Impresora' }
    return _printerStatus
  } catch(e) {
    _printerStatus = { connected: false, name: '' }
    throw e
  }
}

export async function conectarImpresoraSegunda() {
  try {
    const r = await connectPrinter('secundaria')
    _printerSegundaStatus = { connected: true, name: r.name || 'Impresora 2da' }
    return _printerSegundaStatus
  } catch(e) {
    _printerSegundaStatus = { connected: false, name: '' }
    throw e
  }
}

export async function desconectarImpresoraSegunda() {
  await disconnectPrinter('secundaria')
  _printerSegundaStatus = { connected: false, name: '' }
}

async function imprimir(venta, pagos, cfg) {
  if (isConnected()) {
    try { await imprimirTicketTermica(venta, pagos, cfg) } catch { imprimirTicket(venta, pagos, cfg) }
  } else {
    imprimirTicket(venta, pagos, cfg)
  }
}

async function imprimirControlSegunda(venta, cfg) {
  if (isConnected('secundaria')) {
    try { await imprimirControlTermica(venta, cfg) } catch { imprimirControl(venta, cfg) }
  } else {
    imprimirControl(venta, cfg)
  }
}
// (imported from shared utility)

// ── Modal Editar Venta (antes de cobrar) ──────────────────────
function ModalEditarVenta({ open, onClose, venta, onSave }) {
  const [items, setItems] = useState([])
  const [prodSearch, setProdSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const { api } = useApi()
  const { toast } = useToast()
  const { allProds } = useApp()

  useEffect(() => {
    if (open && venta) {
      api('GET', '/ventas/' + venta.id + '/items').then(setItems).catch(() => setItems([]))
      setProdSearch('')
    }
  }, [open, venta])

  const prodsFiltered = allProds.filter(p => p.activo !== false && (p.nombre + ' ' + (p.sku || '')).toLowerCase().includes(prodSearch.toLowerCase()))

  function setItem(i, field, val) {
    setItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: val } : it))
  }
  function delItem(i) {
    setItems(p => p.filter((_, idx) => idx !== i))
  }
  function addItem(prod) {
    if (items.find(it => it.prod_id === prod.id && !it.talle)) {
      toast('Este producto ya está en la lista', 'warn')
      return
    }
    setItems(p => [...p, { prod_id: prod.id, nombre: prod.nombre, talle: '', precio: prod.precio_venta || 0, cantidad: 1 }])
    setProdSearch('')
  }

  async function guardar() {
    if (!items.length) { toast('Agregá al menos un item', 'err'); return }
    setSaving(true)
    try {
      const total = items.reduce((a, it) => a + (parseFloat(it.precio) || 0) * (parseInt(it.cantidad) || 0), 0)
      await onSave(venta.id, { items: items.map(it => ({ prod_id: it.prod_id, nombre: it.nombre, talle: it.talle, precio: it.precio, cantidad: it.cantidad })), total })
      toast('Venta actualizada', 'ok')
      onClose()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  const total = items.reduce((a, it) => a + (parseFloat(it.precio) || 0) * (parseInt(it.cantidad) || 0), 0)

  return (
    <Modal open={open} onClose={onClose} title={`✏️ Editar venta #${venta?.numero || ''}`} size="md"
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={guardar} disabled={saving}>
          {saving ? '💾 Guardando...' : '💾 Guardar cambios'}
        </button></>}>
      {/* Agregar producto */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <input type="text" value={prodSearch} onChange={e => setProdSearch(e.target.value)}
          placeholder="🔍 Buscar producto para agregar..."
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 14 }} />
        {prodSearch && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 8, zIndex: 10, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
            {prodsFiltered.length === 0
              ? <div style={{ padding: 12, color: 'var(--mu)', fontSize: 13 }}>Sin resultados</div>
              : prodsFiltered.slice(0, 8).map(p => (
                <div key={p.id} onClick={() => addItem(p)}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--bd)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{p.nombre}{p.talle ? ` T:${p.talle}` : ''}</span>
                  <span style={{ fontWeight: 700, color: 'var(--ok)' }}>${Number(p.precio_venta || 0).toLocaleString('es-AR')}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Lista de items */}
      <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: 'var(--mu)', fontSize: 13 }}>Sin items — agregá productos arriba</div>}
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--sf)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ flex: 2, fontSize: 13, fontWeight: 500 }}>{it.nombre}{it.talle ? ` (T:${it.talle})` : ''}</div>
            <input type="number" value={it.precio} onChange={e => setItem(i, 'precio', e.target.value)}
              min="0" style={{ width: 80, padding: '6px 8px', borderRadius: 6, border: '1.5px solid var(--bd)', fontSize: 13, textAlign: 'right' }} />
            <span style={{ fontSize: 13, color: 'var(--mu)' }}>x</span>
            <input type="number" value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)}
              min="1" style={{ width: 50, padding: '6px 8px', borderRadius: 6, border: '1.5px solid var(--bd)', fontSize: 13, textAlign: 'center' }} />
            <span style={{ fontWeight: 700, fontSize: 13, minWidth: 60, textAlign: 'right', color: 'var(--ok)' }}>${Number((parseFloat(it.precio) || 0) * (parseInt(it.cantidad) || 0)).toLocaleString('es-AR')}</span>
            <button type="button" onClick={() => delItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bad)', fontSize: 16 }}>✕</button>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '2px solid var(--bd)', paddingTop: 10, marginTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
        <span>Total</span><span style={{ color: 'var(--ok)' }}>${Number(total).toLocaleString('es-AR')}</span>
      </div>
    </Modal>
  )
}

// ── Modal QR MercadoPago ──────────────────────────────────────
function ModalQR({ open, onClose, venta, onConfirm }) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open && venta) {
      const content = [
        'PAGO CRM',
        'Venta #' + (venta.numero || ''),
        'Total: $' + (Number(venta.total) || 0).toLocaleString('es-AR'),
        'Cliente: ' + (venta.cli_nombre || 'Consumidor final'),
        new Date().toLocaleString('es-AR'),
      ].join('\n')
      QRCode.toDataURL(content, { width: 300, margin: 2, color: { dark: '#1a1a2e' } })
        .then(url => setQrDataUrl(url))
        .catch(() => setQrDataUrl(''))
    }
  }, [open, venta])

  return (
    <Modal open={open} onClose={onClose} title="📱 QR MercadoPago" size="sm"
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" style={{ background: 'var(--ok)' }} onClick={() => { setSaving(true); onConfirm() }}
          disabled={saving}>
          {saving ? '⏳' : '✅ Ya se pagó'}
        </button>
      </>}>
      {qrDataUrl ? (
        <div style={{ textAlign: 'center', padding: 10 }}>
          <img src={qrDataUrl} alt="QR de pago" style={{ width: 240, height: 240, background: '#fff', padding: 12, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,.1)' }} />
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ok)' }}>
              {fmt(venta?.total || 0)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--mu)', marginTop: 4 }}>
              Venta #{venta?.numero || ''}
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--mu)', marginTop: 10 }}>
            Escaneá el código QR con la app de MercadoPago para realizar el pago.
            Luego hacé clic en <strong>"Ya se pagó"</strong> para confirmar el cobro.
          </p>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div className="spinner" /> Generando QR...
        </div>
      )}
    </Modal>
  )
}

// ── MAIN CAJA ──────────────────────────────────────────────────
export function Caja() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion, allSucs, allProds } = useApp()

  const [estado, setEstado] = useState(null)
  const [ventasPendientes, setVentasPendientes] = useState([])
  const [historial, setHistorial] = useState([])
  const [pagosMethods, setPagosMethods] = useState(PAGOS_DEF)
  const [cfg, setCfg] = useState({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pendientes')
  const [modalApertura, setModalApertura] = useState(false)
  const [modalMov, setModalMov] = useState(null)
  const [modalCierre, setModalCierre] = useState(false)
  const [modalCobro, setModalCobro] = useState(null)        // venta normal
  const [dupConfirm, setDupConfirm] = useState(null)          // confirm duplicado comprobante
  const [modalComprobante, setModalComprobante] = useState(null)  // venta ctacte
  const [modalCompTipo, setModalCompTipo] = useState(null)      // tipo comprobante post-cobro
  const [imprimirControl, setImprimirControl] = useState(false)  // checkbox ticket control
  // pendientes ya no se cobran en caja — pasan a cuenta corriente
  const [modalEditarVenta, setModalEditarVenta] = useState(null)
  const [modalCorteParcial, setModalCorteParcial] = useState(false)
  const [modalQR, setModalQR] = useState(null)  // venta para cobro con QR
  const [reporteData, setReporteData] = useState(null)
  const [reporteRange, setReporteRange] = useState({ desde: new Date().toISOString().substr(0,10), hasta: new Date().toISOString().substr(0,10) })
  const [loadingReporte, setLoadingReporte] = useState(false)

  const suc = allSucs.find((s) => s.id === sucSesion)
  const esMovil = isMobileDevice()

  const load = useCallback(async () => {
    if (!sucSesion) return
    setLoading(true)
    try {
      const [est, hist, vPend, cfgData] = await Promise.all([
        api('GET', '/caja/estado/' + sucSesion),
        api('GET', '/caja/historial/' + sucSesion + '?limit=7').catch(() => []),
        api('GET', `/ventas?pendientes_cobro=true&include_ctacte=true&suc_id=${sucSesion}`).catch(() => []),
        api('GET', '/config').catch(() => ({})),
      ])
      setEstado(est)
      setHistorial(Array.isArray(hist) ? hist : [])
      setVentasPendientes(Array.isArray(vPend) ? vPend : [])
      setCfg(cfgData || {})
      // Load configured payment methods
      if (cfgData?.tipos_pago) {
        try {
          const pm = JSON.parse(cfgData.tipos_pago)
          setPagosMethods(pm.filter((p) => p.activo !== false))
        } catch { /* use defaults */ }
      }
    } catch { toast('Error cargando caja', 'err') }
    finally { setLoading(false) }
  }, [sucSesion])

  useEffect(() => { load() }, [load])

  async function abrir(fondo) { await api('POST', '/caja/abrir', { suc_id: sucSesion, fondo_inicial: fondo }); toast('Caja abierta', 'ok'); load() }
  async function cerrar(saldoReal) { await api('POST', '/caja/cerrar', { suc_id: sucSesion, saldo_real: saldoReal }); toast('Caja cerrada', 'ok'); load() }
  async function registrarMovimiento({ tipo, concepto, monto }) {
    const r = await api('POST', '/caja/movimiento', { suc_id: sucSesion, tipo, concepto, monto, pago_metodo: 'efectivo' })
    if (r.advertencia) throw new Error(r.mensaje)
    toast('Movimiento registrado', 'ok'); load()
  }
  async function cerrarForzado(id, fecha) {
    if (!window.confirm(`¿Cerrar forzado de caja del ${fmtDate(fecha)}?`)) return
    await api('POST', '/caja/cerrar-forzado/' + id, { notas: 'Cierre manual desde historial' })
    toast('Caja cerrada forzadamente', 'ok')
    load()
  }
  async function anularMovimiento(id) {
    try { await api('DELETE', '/caja/movimiento/' + id); toast('Movimiento anulado', 'ok'); load() } catch (e) { toast(e.message, 'err') }
  }
  async function guardarEditarVenta(id, data) {
    return api('PUT', `/ventas/${id}/items`, data)
  }

  async function abrirCorteParcial() {
    try {
      const r = await api('GET', '/caja/resumen-cierre/' + sucSesion)
      setEstado(r)
      setModalCorteParcial(true)
    } catch (e) { toast(e.message, 'err') }
  }

  async function cargarReporte() {
    if (!reporteRange.desde || !reporteRange.hasta) { toast('Seleccioná un rango de fechas', 'err'); return }
    setLoadingReporte(true)
    try {
      const [ventas, cajas] = await Promise.all([
        api('GET', '/ventas?desde=' + reporteRange.desde + '&hasta=' + reporteRange.hasta + '&suc_id=' + sucSesion).catch(() => []),
        api('GET', '/caja/historial/' + sucSesion + '?desde=' + reporteRange.desde + '&hasta=' + reporteRange.hasta).catch(() => []),
      ])
      const vtaList = Array.isArray(ventas) ? ventas : []
      const cajaList = Array.isArray(cajas) ? cajas : []
      const activas = vtaList.filter(v => !v.anulada)
      const totalVentas = activas.reduce((a, v) => a + (v.total || 0), 0)
      const totalAnuladas = vtaList.filter(v => v.anulada).reduce((a, v) => a + (v.total || 0), 0)
      const porPago = {}
      activas.forEach(v => {
        const p = v.pago || 'efectivo'
        if (!porPago[p]) porPago[p] = { monto: 0, cantidad: 0 }
        porPago[p].monto += v.total || 0
        porPago[p].cantidad++
      })
      const totalIngresos = cajaList.reduce((a, c) => a + (c.ingresos || 0), 0)
      const totalEgresos = cajaList.reduce((a, c) => a + (c.egresos || 0), 0)
      setReporteData({ ventas: vtaList, cajas: cajaList, totalVentas, totalAnuladas, porPago, totalIngresos, totalEgresos, activas: activas.length, anuladas: vtaList.filter(v => v.anulada).length })
    } catch (e) { toast(e.message, 'err') }
    finally { setLoadingReporte(false) }
  }

  async function confirmarCobro({ pagos, descuento_pct, codigo_descuento }) {
    const venta = modalCobro
    // If QR method selected, show QR modal first
    const tieneQR = pagos.some(p => p.id === 'qr')
    if (tieneQR) {
      setModalQR({ venta, pagos, descuento_pct, codigo_descuento })
      setModalCobro(null)
      return
    }
    await ejecutarCobro(venta, pagos, descuento_pct, codigo_descuento)
  }

  async function ejecutarCobro(venta, pagos, descuento_pct, codigo_descuento, confirmarDuplicado) {
    const sorted = [...pagos].sort((a, b) => (parseFloat(b.monto) || 0) - (parseFloat(a.monto) || 0))
    const pagoPrincipal = sorted[0]?.id || 'efectivo'
    const esMixto = pagos.length > 1
    const ctactePagos = pagos.filter((p) => p.id === 'ctacte')
    const ctacteMonto = ctactePagos.reduce((a, p) => a + (parseFloat(p.monto) || 0), 0)
    const pagosSinCtacte = pagos.filter((p) => p.id !== 'ctacte')

    const body = {
      pago: esMixto && pagosSinCtacte.length > 0 ? 'mixto' : (pagosSinCtacte[0]?.id || pagoPrincipal),
      pagos_detalle: pagosSinCtacte.length > 0 ? pagosSinCtacte : pagos,
      pago_principal: pagosSinCtacte[0]?.id || pagoPrincipal,
      ctacte_monto: ctacteMonto,
      descuento_pct,
      codigo_descuento,
      suc_id: sucSesion,
    }
    if (confirmarDuplicado) body.confirmar_duplicado = true

    const r = await api('POST', `/ventas/${venta.id}/cobrar`, body)

    if (r.advertencia) {
      setDupConfirm({
        venta, pagos, descuento_pct, codigo_descuento,
        duplicados: r.duplicados || [],
        permite_confirmar: r.permite_confirmar
      })
      return
    }

    toast(`✅ Cobro registrado — Venta #${venta.numero}`, 'ok')
    load()
    setModalCompTipo({ venta, pagos })
    setImprimirControl(cfg.ticketera2_habilitada === '1')
  }

  async function confirmarComprobante(/* tipo */) {
    const venta = modalComprobante
    setModalComprobante(null)
    try {
      await api('POST', `/ventas/${venta.id}/cobrar`, { pago: 'ctacte', pagos_detalle: [], pago_principal: 'ctacte' })
      toast('Comprobante emitido', 'ok')
      try {
        const vtaFull = await api('GET', '/ventas/' + venta.id)
        imprimir(vtaFull, [{ id: 'ctacte', monto: String(venta.total) }], cfg)
      } catch { /* non-fatal */ }
      load()
    } catch (e) { toast(e.message, 'err') }
  }

  if (loading) return <Loader />
  if (!sucSesion) return <div className="empty-state"><div className="empty-icon">🏪</div><p>Seleccioná una sucursal</p></div>

  const abierta = estado?.estado === 'abierta'
  const movs = estado?.movimientos || []
  const pPago = estado?.por_pago || {}

  const ventasNormales = ventasPendientes.filter((v) => !v.es_ctacte)
  const ventasCtacte = ventasPendientes.filter((v) => v.es_ctacte)

  return (
    <div>
      {/* Status card */}
      <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${abierta ? 'var(--ok)' : 'var(--mu)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 28 }}>{abierta ? '🟢' : '🔴'}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{abierta ? 'Caja Abierta' : 'Caja Cerrada'}</div>
                <div style={{ fontSize: 12, color: 'var(--mu)' }}>{suc?.nombre}{abierta && estado?.apertura ? ' · Apertura: ' + fmtTime(estado.apertura) : ''}</div>
              </div>
            </div>
            {abierta && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                <div><div style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase' }}>Efectivo</div><div style={{ fontWeight: 800, fontSize: 22, color: 'var(--ok)' }}>{fmt(estado.saldo_efectivo)}</div></div>
                <div><div style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase' }}>Ingresos</div><div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ok)' }}>{fmt(estado.ingresos)}</div></div>
                <div><div style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase' }}>Egresos</div><div style={{ fontWeight: 700, fontSize: 16, color: 'var(--bad)' }}>{fmt(estado.egresos)}</div></div>
                {Object.entries(pPago).filter(([k]) => k !== 'efectivo').map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase' }}>{k}</div><div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(v)}</div></div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!abierta
              ? <button type="button" className="btn btn-primary" onClick={() => setModalApertura(true)}>🟢 Abrir caja</button>
              : <>
                <button type="button" className="btn btn-secondary" onClick={() => setModalMov('ingreso')}>+ Ingreso</button>
                <button type="button" className="btn btn-secondary" onClick={() => setModalMov('egreso')}>− Retiro</button>
                <button type="button" className="btn btn-secondary" onClick={() => abrirCorteParcial()}>📋 Corte parcial</button>
                <button type="button" className="btn btn-danger" onClick={() => setModalCierre(true)}>🔒 Cerrar caja</button>
              </>}
              {isSupported() && (
                <button type="button" className={`btn btn-sm ${isConnected() ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={async () => {
                    if (isConnected()) { disconnectPrinter(); toast('Impresora desconectada'); }
                    else {
                      try { const r = await conectarImpresora(); toast('Conectado: ' + r.name, 'ok') }
                      catch(e) { toast(e.message, 'err') }
                    }
                  }}
                  style={{ fontSize: 11 }}
                  title={isConnected() ? 'Impresora conectada. Click para desconectar.' : 'Conectar impresora térmica USB'}
                >
                  🖨️ {isConnected() ? 'Conectada' : 'Impresora'}
                </button>
              )}
              {isSupported() && cfg.ticketera2_habilitada === '1' && (
                <button type="button" className={`btn btn-sm ${isConnected('secundaria') ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={async () => {
                    if (isConnected('secundaria')) { await desconectarImpresoraSegunda(); toast('Impresora 2da desconectada'); }
                    else {
                      try { const r = await conectarImpresoraSegunda(); toast('Conectado: ' + r.name, 'ok') }
                      catch(e) { toast(e.message, 'err') }
                    }
                  }}
                  style={{ fontSize: 11 }}
                  title={isConnected('secundaria') ? 'Impresora 2da conectada. Click para desconectar.' : 'Conectar 2da impresora térmica USB'}
                >
                  🖨️ {isConnected('secundaria') ? 'Conectada' : '2da Impresora'}
                </button>
              )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '2px solid var(--bd)', paddingBottom: 8, flexWrap: 'wrap' }}>
        {[
          ['pendientes', `🧾 Por cobrar${ventasPendientes.length > 0 ? ` (${ventasPendientes.length})` : ''}`],
          ['hoy', '📋 Movimientos'],
          ['historial', '📅 Historial'],
          ['reporte', '📊 Reporte'],
        ].map(([key, label]) => (
          <button type="button" key={key} className={`btn btn-sm ${tab === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {/* ── TAB: Por cobrar ── */}
      {tab === 'pendientes' && (
        <div>
          {ventasPendientes.length === 0 ? (
            <div className="card"><div className="empty-state"><div className="empty-icon">🧾</div><p>Sin ventas pendientes de cobro</p></div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Ventas normales por cobrar */}
              {ventasNormales.map((v) => (
                <div key={v.id} style={{ background: 'var(--bg)', border: '1.5px solid var(--bd)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexDirection: esMovil ? 'column' : 'row', gap: esMovil ? 6 : 0 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span className="badge badge-yellow" style={{ fontSize: 9 }}>VENTA</span>
                        <span style={{ fontWeight: 700 }}>#{v.numero}</span>
                      </div>
                      <div style={{ fontWeight: 600 }}>{v.cli_nombre || 'Consumidor final'}</div>
                      <div style={{ fontSize: 12, color: 'var(--mu)' }}>{v.vend_nombre} · {fmtDate(v.fecha)}</div>
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 20, color: 'var(--ok)' }}>{fmt(v.total)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexDirection: esMovil ? 'column' : 'row' }}>
                    {abierta && <button type="button" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setModalCobro(v)}>💰 Cobrar</button>}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-secondary btn-sm" title="Editar venta" onClick={() => setModalEditarVenta(v)} style={{ flex: esMovil ? 1 : undefined }}>✏️</button>
                      <button type="button" className="btn btn-icon btn-sm" title="Cancelar venta" onClick={async () => {
                        if (!window.confirm('¿Cancelar esta venta?')) return
                        try { await api('POST', '/ventas/' + v.id + '/anular', { motivo: 'Cancelado desde caja' }); toast('Venta cancelada', 'ok'); load() } catch (e) { toast(e.message, 'err') }
                      }}>✕</button>
                    </div>
                  </div>
                  {!abierta && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--warn)' }}>⚠️ Abrí la caja para cobrar</div>}
                </div>
              ))}
              {/* Ventas cuenta corriente */}
              {ventasCtacte.map((v) => (
                <div key={v.id} style={{ background: 'var(--bg)', border: '1.5px solid #93c5fd', borderRadius: 12, padding: '14px 16px', borderLeft: '4px solid var(--ac2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span className="badge badge-blue" style={{ fontSize: 9 }}>C/CTE</span>
                        <span style={{ fontWeight: 700 }}>#{v.numero}</span>
                      </div>
                      <div style={{ fontWeight: 600 }}>{v.cli_nombre || 'Cliente'}</div>
                      <div style={{ fontSize: 12, color: 'var(--mu)' }}>{v.vend_nombre} · {fmtDate(v.fecha)}</div>
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 20, color: 'var(--ac2)' }}>{fmt(v.total)}</div>
                  </div>
                  <button type="button" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--ac2)', color: 'var(--ac2)' }}
                    onClick={() => setModalComprobante(v)}>
                    🧾 Emitir factura / ticket
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Movimientos ── */}
      {tab === 'hoy' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Hora</th><th>Concepto</th><th>Método</th><th style={{ textAlign: 'center' }}>Tipo</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ width: 60 }}></th></tr></thead>
              <tbody>
                {movs.length === 0
                  ? <EmptyRow cols={6} icon="💰" text={abierta ? 'Sin movimientos aún' : 'Abrí la caja para registrar movimientos'} />
                  : movs.map((m) => (
                    <tr key={m.id} style={{ opacity: m.anulado ? .4 : 1 }}>
                      <td data-label="Hora" style={{ fontSize: 12, color: 'var(--mu)' }}>{fmtTime(m.fecha)}</td>
                      <td data-label="Concepto">
                        <div style={{ fontWeight: 500 }}>{m.concepto}</div>
                        {m.usuario && <div style={{ fontSize: 11, color: 'var(--mu)' }}>{m.usuario}</div>}
                        {m.anulado && <span className="badge badge-red" style={{ fontSize: 10 }}>Anulado</span>}
                      </td>
                      <td data-label="Método" style={{ fontSize: 12 }}>{m.pago_metodo || '—'}</td>
                      <td data-label="Tipo" style={{ textAlign: 'center' }}>
                        <span className={`badge ${m.tipo === 'ingreso' ? 'badge-green' : 'badge-red'}`}>{m.tipo === 'ingreso' ? '↑' : '↓'} {m.tipo}</span>
                      </td>
                      <td data-label="Monto" style={{ textAlign: 'right', fontWeight: 700, color: m.tipo === 'ingreso' ? 'var(--ok)' : 'var(--bad)' }}>
                        {m.tipo === 'egreso' ? '−' : ''}{fmt(m.monto)}
                      </td>
                      <td data-label="">{!m.anulado && !m.auto && <button type="button" className="btn btn-icon btn-sm" onClick={() => anularMovimiento(m.id)}>✕</button>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: Reporte ── */}
      {tab === 'reporte' && (
        <div className="card">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
            <Field label="Desde">
              <input type="date" value={reporteRange.desde} onChange={e => setReporteRange(p => ({ ...p, desde: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 13 }} />
            </Field>
            <Field label="Hasta">
              <input type="date" value={reporteRange.hasta} onChange={e => setReporteRange(p => ({ ...p, hasta: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 13 }} />
            </Field>
            <button type="button" className="btn btn-primary" onClick={cargarReporte} disabled={loadingReporte}>
              {loadingReporte ? '⏳ Cargando...' : '📊 Generar reporte'}
            </button>
          </div>
          {reporteData && (
            <>
              <div className="grid-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
                <div className="kpi-card" style={{ borderLeft: '3px solid var(--ok)' }}>
                  <div className="kpi-label">Ventas totales</div>
                  <div className="kpi-value" style={{ color: 'var(--ok)' }}>{fmt(reporteData.totalVentas)}</div>
                  <div className="kpi-sub">{reporteData.activas} transacciones</div>
                </div>
                <div className="kpi-card" style={{ borderLeft: '3px solid var(--bad)' }}>
                  <div className="kpi-label">Anulaciones</div>
                  <div className="kpi-value" style={{ color: 'var(--bad)', fontSize: 18 }}>{fmt(reporteData.totalAnuladas)}</div>
                  <div className="kpi-sub">{reporteData.anuladas} operaciones</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Ticket promedio</div>
                  <div className="kpi-value" style={{ fontSize: 18 }}>{reporteData.activas > 0 ? fmt(reporteData.totalVentas / reporteData.activas) : '—'}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 8 }}>Ventas por método de pago</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {Object.entries(reporteData.porPago).length === 0
                  ? <div style={{ color: 'var(--mu)', fontSize: 13, padding: 8 }}>Sin datos para este período</div>
                  : Object.entries(reporteData.porPago).map(([met, d]) => (
                    <div key={met} style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 16px', textAlign: 'center', minWidth: 100 }}>
                      <div style={{ fontSize: 11, color: 'var(--mu)' }}>{met}</div>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{fmt(d.monto)}</div>
                      <div style={{ fontSize: 11, color: 'var(--mu)' }}>{d.cantidad} vtas</div>
                    </div>
                  ))}
              </div>
              <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--mu)' }}>Ingresos en caja</div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--ok)' }}>{fmt(reporteData.totalIngresos)}</div>
                </div>
                <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--mu)' }}>Egresos en caja</div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--bad)' }}>{fmt(reporteData.totalEgresos)}</div>
                </div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 16 }} onClick={() => {
                const headers = ['Fecha', 'Cliente', 'Método', 'Total']
                const rows = reporteData.ventas.filter(v => !v.anulada).map(v => [
                  new Date(v.fecha).toLocaleDateString('es-AR'), v.cli_nombre || 'Consumidor', v.pago || '', v.total || 0
                ])
                exportExcel('reporte-caja', headers, rows, 'Reporte Caja')
                toast('📊 Excel exportado', 'ok')
              }}>📊 Exportar Excel</button>
            </>
          )}
        </div>
      )}

      {/* ── TAB: Historial ── */}
      {tab === 'historial' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Apertura</th><th>Cierre</th><th style={{ textAlign: 'right' }}>Ingresos</th><th style={{ textAlign: 'right' }}>Ef. esperado</th><th style={{ textAlign: 'right' }}>Diferencia</th><th style={{ textAlign: 'center' }}>Estado</th><th style={{ textAlign: 'center' }}>Acción</th></tr></thead>
              <tbody>
                {historial.length === 0
                  ? <EmptyRow cols={8} icon="📅" text="Sin historial" />
                  : historial.map((h) => {
                    const diff = (h.saldo_real || 0) - (h.saldo_esperado || 0)
                    return (
                      <tr key={h.id}>
                        <td data-label="Fecha" style={{ fontSize: 12 }}>{fmtDate(h.fecha)}</td>
                        <td data-label="Apertura" style={{ fontSize: 12 }}>{fmtTime(h.apertura)}</td>
                        <td data-label="Cierre" style={{ fontSize: 12 }}>{h.cierre ? fmtTime(h.cierre) : '—'}</td>
                        <td data-label="Ingresos" style={{ textAlign: 'right' }}>{fmt(h.ingresos)}</td>
                        <td data-label="Ef. esperado" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(h.saldo_esperado_efectivo ?? h.saldo_esperado)}</td>
                        <td data-label="Diferencia" style={{ textAlign: 'right', color: Math.abs(diff) < 1 ? 'var(--ok)' : diff < 0 ? 'var(--bad)' : 'var(--warn)', fontWeight: 600 }}>
                          {h.estado === 'cerrada' ? (diff >= 0 ? '+' : '') + fmt(diff) : '—'}
                        </td>
                        <td data-label="Estado" style={{ textAlign: 'center' }}><span className={`badge ${h.estado === 'abierta' ? 'badge-green' : 'badge-gray'}`}>{h.estado}</span></td>
                        <td data-label="Acción" style={{ textAlign: 'center' }}>
                          {h.estado === 'abierta' && (
                            <button type="button" className="btn btn-sm btn-danger" onClick={() => cerrarForzado(h.id, h.fecha)}>
                              🔒 Cerrar
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ModalCorteParcial open={modalCorteParcial} onClose={() => setModalCorteParcial(false)} estado={estado} />
      <ModalApertura open={modalApertura} onClose={() => setModalApertura(false)} onAbrir={abrir} />
      <ModalMovimiento key={modalMov || 'closed'} open={!!modalMov} onClose={() => setModalMov(null)} tipo={modalMov} onGuardar={registrarMovimiento} />
      <ModalCierre open={modalCierre} onClose={() => setModalCierre(false)} estado={estado} onCerrar={cerrar} />
      <ModalCobro key={modalCobro?.id || 'cobro-closed'} open={!!modalCobro} onClose={() => setModalCobro(null)} venta={modalCobro} pagosMethods={pagosMethods} onConfirm={confirmarCobro} />
      <ModalComprobante open={!!modalComprobante} onClose={() => setModalComprobante(null)} venta={modalComprobante} onConfirm={confirmarComprobante} cfg={cfg} />
      <ModalEditarVenta open={!!modalEditarVenta} onClose={() => setModalEditarVenta(null)} venta={modalEditarVenta} onSave={guardarEditarVenta} />
      <ModalQR open={!!modalQR} onClose={() => setModalQR(null)} venta={modalQR?.venta}
        onConfirm={async () => {
          const d = modalQR
          setModalQR(null)
          await ejecutarCobro(d.venta, d.pagos, d.descuento_pct, d.codigo_descuento)
        }} />

      {/* Modal: Elegir tipo de comprobante post-cobro */}
      {modalCompTipo && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalCompTipo(null) }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>🧾 Tipo de comprobante</h3>
              <button type="button" onClick={() => setModalCompTipo(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--mu)' }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>Venta #{modalCompTipo.venta?.numero}</div>
                <div style={{ color: 'var(--mu)' }}>{modalCompTipo.venta?.cli_nombre || 'Consumidor final'} · {fmt(modalCompTipo.venta?.total)}</div>
              </div>
              {cfg.ticketera2_habilitada === '1' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '8px 12px', background: 'rgba(99,102,241,.06)', borderRadius: 8, border: '1.5px solid rgba(99,102,241,.25)', marginBottom: 12 }}>
                  <input type="checkbox" checked={imprimirControl} onChange={(e) => setImprimirControl(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--ac)' }} />
                  🖨️ Imprimir control / preparación
                </label>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(() => {
                  const condFiscal = cfg.arca_condicion_fiscal || 'responsable_inscripto'
                  const TIPOS_ALL = [
                    ['ticket','🏷️ Ticket (sin factura)'],
                    ['facB','📄 Factura B — Consumidor final'],
                    ['facA','📄 Factura A — Responsable inscripto'],
                    ['facC','📄 Factura C — Monotributista/exento'],
                  ]
                  const TIPOS = condFiscal === 'responsable_inscripto'
                    ? TIPOS_ALL
                    : TIPOS_ALL.filter(([t]) => t === 'ticket' || t === 'facC')
                  return TIPOS.map(([tipo, label]) => (
                    <button type="button" key={tipo} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '12px 16px', fontSize: 14 }}
                      onClick={async () => {
                        const ventaId = modalCompTipo.venta.id
                        const shouldPrintControl = imprimirControl
                        setModalCompTipo(null)
                        let facturaInfo = null
                        if (tipo !== 'ticket') {
                          const tipoMap = { facB: 'B', facA: 'A', facC: 'C' }
                          try {
                            facturaInfo = await api('POST', '/arca/ventas/' + ventaId + '/facturar', { tipo: tipoMap[tipo] })
                            toast('✅ Factura ' + tipoMap[tipo] + ' #' + facturaInfo.numero + ' — CAE: ' + facturaInfo.cae, 'ok')
                          } catch (e) {
                            toast('⚠️ ' + (e.message || 'Error al facturar. Verificá la config de ARCA en Ajustes.'), 'err')
                          }
                        }
                        try {
                          const vtaFull = await api('GET', '/ventas/' + ventaId)
                          imprimir({ ...vtaFull, _comprobante: tipo, _cae: facturaInfo?.cae, _cae_vto: facturaInfo?.vencimiento }, modalCompTipo.pagos, cfg)
                          if (shouldPrintControl) imprimirControlSegunda(vtaFull, cfg)
                        } catch { /* non-fatal */ }
                      }}>
                      {label}
                    </button>
                  ))
                })()}
              </div>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 10, color: 'var(--mu)' }}
                onClick={async () => {
                  const shouldPrintControl = imprimirControl
                  setModalCompTipo(null)
                  if (shouldPrintControl) {
                    try {
                      const vtaFull = await api('GET', '/ventas/' + modalCompTipo.venta.id)
                      imprimirControlSegunda(vtaFull, cfg)
                    } catch { /* non-fatal */ }
                  }
                }}>
                Sin comprobante
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Confirm duplicado comprobante */}
      {dupConfirm && (
        <ConfirmDialog
          open={!!dupConfirm}
          onClose={() => setDupConfirm(null)}
          title="Comprobante duplicado"
          danger={false}
          confirmLabel={dupConfirm.permite_confirmar ? 'Confirmar de todas formas' : undefined}
          onConfirm={dupConfirm.permite_confirmar ? async () => {
            const { venta, pagos, descuento_pct, codigo_descuento } = dupConfirm
            setDupConfirm(null)
            await ejecutarCobro(venta, pagos, descuento_pct, codigo_descuento, true)
          } : undefined}
          message={(() => {
            const list = dupConfirm.duplicados.slice(0, 3).map(d =>
              `- Venta #${d.venta_numero || '—'} — ${fmt(d.monto || 0)} (${d.suc_nombre || '—'}) — ${new Date(d.fecha).toLocaleDateString('es-AR')}`
            ).join('\n')
            return `Este comprobante ya fue registrado:\n\n${list}\n\n${dupConfirm.permite_confirmar ? '' : 'Solo un admin o supervisor puede confirmar.'}`
          })()}
        />
      )}
    </div>
  )
}


