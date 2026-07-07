import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useApp, useToast } from '../store'
import { Modal } from '../components/Modal'
import { SearchBar, PageHeader, EmptyRow, Loader, Pagination } from '../components/UI'
import { exportExcel } from '../utils/excel'

const PER_PAGE = 30

const PAGO_LABELS = {
  efectivo: '💵 Efectivo', debito: '💳 Débito', credito: '💳 Crédito',
  transferencia: '🏦 Transferencia', qr: '📱 QR / MP', ctacte: '📒 Cta. Cte.', otro: 'Otro'
}

const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

function VentaDetail({ venta, api, onRefresh, onClose, showAnularByDefault }) {
  const [items, setItems] = useState([])
  const [movs, setMovs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAnular, setShowAnular] = useState(showAnularByDefault)
  const [anTipo, setAnTipo] = useState('total')
  const [anMotivo, setAnMotivo] = useState('')
  const [anMetodo, setAnMetodo] = useState('mismo')
  const [anSeleccion, setAnSeleccion] = useState({})
  const [anQty, setAnQty] = useState({})
  const [anSaving, setAnSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    async function load() {
      try {
        const [it, mv] = await Promise.all([
          api('GET', '/ventas/' + venta.id + '/items').catch(() => []),
          api('GET', '/caja/movimientos?venta_id=' + venta.id).catch(() => []),
        ])
        const arr = Array.isArray(it) ? it : []
        setItems(arr)
        // Init selection state
        const sel = {}, qty = {}
        arr.forEach((it, i) => {
          const disp = it.cantidad - (it.cantidad_devuelta || 0)
          sel[i] = disp > 0
          qty[i] = disp
        })
        setAnSeleccion(sel)
        setAnQty(qty)
        setMovs(Array.isArray(mv) ? mv : [])
      } finally { setLoading(false) }
    }
    load()
  }, [venta.id])

  const montoDev = items.reduce((acc, it, i) => {
    if (anTipo === 'parcial' && anSeleccion[i]) return acc + it.precio * (parseInt(anQty[i]) || 0)
    return acc
  }, 0)

  function toggleAnularShow() {
    const show = !showAnular
    setShowAnular(show)
    if (show) {
      setAnTipo('total')
      setAnMotivo('')
      setAnMetodo('mismo')
      const sel = {}, qty = {}
      items.forEach((it, i) => {
        const disp = it.cantidad - (it.cantidad_devuelta || 0)
        sel[i] = disp > 0
        qty[i] = disp
      })
      setAnSeleccion(sel)
      setAnQty(qty)
    }
  }

  async function confirmarAnular() {
    if (!venta.id) return
    const motivo = anMotivo || 'Sin motivo'

    let itemsDevolver = null
    if (anTipo === 'parcial') {
      itemsDevolver = []
      items.forEach((it, i) => {
        if (anSeleccion[i]) {
          const cant = parseInt(anQty[i]) || 0
          if (cant > 0) itemsDevolver.push({ prod_id: it.prod_id, cantidad: cant })
        }
      })
      if (!itemsDevolver.length) {
        toast('Seleccioná al menos un producto a devolver', 'err')
        return
      }
    }

    const confirmMsg = anTipo === 'total'
      ? `¿Confirmar anulación total de la venta?\n\nMotivo: ${motivo}\nDevolución: ${anMetodo === 'mismo' ? 'Mismo método original' : 'Efectivo'}`
      : `¿Confirmar devolución parcial?\n\nProductos: ${itemsDevolver.length} ítem(s)\nMonto: ${fmt(montoDev)}\nDevolución: ${anMetodo === 'mismo' ? 'Mismo método original' : 'Efectivo'}`

    if (!window.confirm(confirmMsg)) return

    setAnSaving(true)
    try {
      const r = await api('POST', '/ventas/' + venta.id + '/anular', {
        motivo,
        metodo_devolucion: anMetodo,
        items_devolver: itemsDevolver
      })
      const msg = r.parcial
        ? `✅ Devolución parcial registrada — ${fmt(r.monto_devolucion)} devueltos`
        : '✅ Venta anulada — stock devuelto'
      toast(msg, 'ok')
      onClose()
      if (onRefresh) onRefresh()
    } catch (e) { toast(e.message, 'err') }
    finally { setAnSaving(false) }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" /></div>

  return (
    <div>
      {/* Header info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Cliente', value: venta.cli_nombre || 'Consumidor final' },
          { label: 'Vendedor', value: venta.vendedor_nombre || '—' },
          { label: 'Fecha', value: new Date(venta.fecha).toLocaleString('es-AR') },
          { label: 'Método', value: PAGO_LABELS[venta.pago] || venta.pago },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Items */}
      <h3 style={{ marginBottom: 10, fontSize: 14 }}>Productos</h3>
      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Producto</th><th style={{ textAlign: 'center' }}>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
          <tbody>
            {items.length === 0
              ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16, color: 'var(--mu)' }}>Sin items</td></tr>
              : items.map((it, i) => (
                <tr key={it.id||it.nombre||'vi-'+i}>
                  <td>
                    <div>{it.nombre}</div>
                    {it.talle && <div style={{ fontSize: 12, color: 'var(--mu)' }}>{it.talle}</div>}
                    {(it.cantidad_devuelta || 0) > 0 && <span className="badge badge-red" style={{ fontSize: 12 }}>{it.cantidad_devuelta} dev.</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>{it.cantidad}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(it.precio)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(it.subtotal)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{ borderTop: '2px solid var(--bd)', paddingTop: 12 }}>
        {venta.descuento > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
            <span style={{ color: 'var(--mu)' }}>Subtotal</span>
            <span>{fmt(venta.subtotal)}</span>
          </div>
        )}
        {venta.descuento > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
            <span style={{ color: 'var(--mu)' }}>Descuento</span>
            <span style={{ color: 'var(--bad)' }}>−{fmt(venta.descuento)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800 }}>
          <span>Total</span>
          <span style={{ color: 'var(--ok)' }}>{fmt(venta.total)}</span>
        </div>
      </div>

      {/* Anular / Devolver */}
      {!venta.anulada && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--bd)' }}>
          <button type="button" className="btn btn-danger btn-sm" style={{ justifyContent: 'center' }} onClick={toggleAnularShow}>
            {showAnular ? '✕ Cancelar' : '🗑 Anular / Devolver'}
          </button>

          {showAnular && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: 'var(--bad)' }}>⚠️ Anulación / Nota de crédito</div>

              {/* Tipo */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[['total', 'Anulación total'], ['parcial', 'Nota de crédito parcial']].map(([v, l]) => (
                  <label key={v} style={{
                    display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer',
                    padding: '6px 10px', border: `1.5px solid ${anTipo === v ? 'var(--bad)' : 'var(--bd)'}`,
                    borderRadius: 8, flex: 1
                  }}>
                    <input type="radio" checked={anTipo === v} onChange={() => setAnTipo(v)} />
                    {l}
                  </label>
                ))}
              </div>

              {/* Items para devolución parcial */}
              {anTipo === 'parcial' && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 6 }}>Seleccioná los productos a devolver</div>
                  <div style={{ border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden' }}>
                    {items.map((it, i) => {
                      const disp = it.cantidad - (it.cantidad_devuelta || 0)
                      if (disp <= 0) return (
                        <div key={it.id||it.nombre||'dv-'+i} style={{ padding: '8px 12px', fontSize: 12, color: 'var(--mu)', borderBottom: '1px solid var(--bd)' }}>
                          {it.nombre} — ya devuelto
                        </div>
                      )
                      return (
                        <div key={it.id||it.nombre||'ra-'+i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--bd)' }}>
                          <input type="checkbox" checked={!!anSeleccion[i]} onChange={() => setAnSeleccion(p => ({ ...p, [i]: !p[i] }))}
                            style={{ width: 15, height: 15, cursor: 'pointer' }} />
                          <div style={{ flex: 1, cursor: 'pointer', fontSize: 12 }} onClick={() => setAnSeleccion(p => ({ ...p, [i]: !p[i] }))}>
                            <div style={{ fontWeight: 700 }}>{it.nombre}{it.talle ? ` — Talle ${it.talle}` : ''}</div>
                            <div style={{ fontSize: 12, color: 'var(--mu)' }}>{fmt(it.precio)} c/u · Disponible: {disp} uds</div>
                          </div>
                          <input type="number" value={anQty[i] || disp} min={1} max={disp}
                            onChange={e => {
                              const v = Math.min(disp, Math.max(1, parseInt(e.target.value) || 1))
                              setAnQty(p => ({ ...p, [i]: v }))
                              setAnSeleccion(p => ({ ...p, [i]: true }))
                            }}
                            style={{ width: 60, textAlign: 'center', padding: '5px 8px', border: '1.5px solid var(--bd)', borderRadius: 8, fontSize: 12 }} />
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 5 }}>
                    Monto a devolver: <strong>{fmt(montoDev)}</strong>
                  </div>
                </div>
              )}

              {/* Motivo */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 3 }}>Motivo</label>
                <input value={anMotivo} onChange={e => setAnMotivo(e.target.value)} placeholder="Ej: Defecto de fábrica, cambio de talle..."
                  style={{ width: '100%', padding: '5px 8px', border: '1.5px solid var(--bd)', borderRadius: 8, fontSize: 12, background: 'var(--bg)', color: 'var(--tx)' }} />
              </div>

              {/* Método de devolución */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 3 }}>Devolución en</label>
                <select value={anMetodo} onChange={e => setAnMetodo(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', border: '1.5px solid var(--bd)', borderRadius: 8, fontSize: 12, background: 'var(--bg)', color: 'var(--tx)' }}>
                  <option value="mismo">Mismo método de pago original</option>
                  <option value="efectivo">Efectivo</option>
                </select>
              </div>

              {(venta.cobrada !== false) && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '9px 13px', fontSize: 12, color: '#92400E', marginBottom: 10 }}>
                  ⚠️ Esta devolución generará un egreso en la caja del turno actual.
                </div>
              )}

              <button type="button" className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }} onClick={confirmarAnular} disabled={anSaving}>
                {anSaving ? '⏳ Procesando...' : '⚠️ Confirmar'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Ventas() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion, allSucs } = useApp()
  const [searchParams] = useSearchParams()

  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroPago, setFiltroPago] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('hoy')
  const [desdeHasta, setDesdeHasta] = useState({ desde: '', hasta: '' })
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState(null)

  const cliId = searchParams.get('cli_id')

  const getDateRange = useCallback(() => {
    const hoy = new Date().toISOString().substr(0, 10)
    const inicioMes = new Date(); inicioMes.setDate(1)
    const inicioSemana = new Date(); inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay())
    if (filtroFecha === 'hoy') return { desde: hoy, hasta: hoy }
    if (filtroFecha === 'semana') return { desde: inicioSemana.toISOString().substr(0, 10), hasta: hoy }
    if (filtroFecha === 'mes') return { desde: inicioMes.toISOString().substr(0, 10), hasta: hoy }
    if (filtroFecha === 'custom') return desdeHasta
    return {}
  }, [filtroFecha, desdeHasta])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { desde, hasta } = getDateRange()
      let qs = `?suc_id=${sucSesion || ''}`
      if (desde) qs += `&desde=${desde}`
      if (hasta) qs += `&hasta=${hasta}`
      if (cliId) qs += `&cli_id=${cliId}`
      const data = await api('GET', '/ventas' + qs)
      setVentas(Array.isArray(data) ? data : [])
    } catch { toast('Error cargando ventas', 'err') }
    finally { setLoading(false) }
  }, [sucSesion, getDateRange, cliId])

  useEffect(() => { load() }, [load])

  async function exportar() {
    const headers = ['N°', 'Fecha', 'Cliente', 'Vendedor', 'Sucursal', 'Pago', 'Estado', 'Total']
    const rows = filtered.map(v => [
      v.numero, new Date(v.fecha).toLocaleString('es-AR'), v.cli_nombre || 'Consumidor', v.vend_nombre || '', v.suc_nombre || '',
      v.pago || '', v.anulada ? 'Anulada' : (v.cobrada === false ? 'Pend. cobro' : (v.es_ctacte ? 'C/cte' : 'Cobrada')),
      v.total || 0
    ])
    await exportExcel('ventas', headers, rows, 'Ventas')
    toast('📊 Excel exportado', 'ok')
  }


  const filtered = useMemo(() => {
    let list = ventas
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((v) => (v.cli_nombre + ' ' + v.vendedor_nombre + ' ' + v.id).toLowerCase().includes(q))
    }
    if (filtroPago) list = list.filter((v) => v.pago === filtroPago)
    return list
  }, [ventas, search, filtroPago])

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const totales = useMemo(() => ({
    total: filtered.filter(v => !v.anulada).reduce((a, v) => a + (v.total || 0), 0),
    n: filtered.filter(v => !v.anulada).length,
    anuladas: filtered.filter(v => v.anulada).length,
  }), [filtered])

  if (loading) return <Loader />

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
        <div className="kpi-card" style={{ borderLeft: '3px solid var(--ok)' }}>
          <div className="kpi-label">Total ventas</div>
          <div className="kpi-value" style={{ color: 'var(--ok)' }}>{fmt(totales.total)}</div>
          <div className="kpi-sub">{totales.n} transacciones</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Ticket promedio</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{totales.n > 0 ? fmt(totales.total / totales.n) : '—'}</div>
        </div>
        {totales.anuladas > 0 && (
          <div className="kpi-card" style={{ borderLeft: '3px solid var(--bad)' }}>
            <div className="kpi-label">Anuladas</div>
            <div className="kpi-value" style={{ color: 'var(--bad)', fontSize: 22 }}>{totales.anuladas}</div>
          </div>
        )}
      </div>

      <PageHeader title={cliId ? '📋 Ventas del cliente' : '📋 Ventas'}>
        {/* Date filter */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--sf)', borderRadius: 8, padding: 4, border: '1px solid var(--bd)' }}>
          {[['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['custom', '📅']].map(([v, l]) => (
            <button type="button" key={v} className={`btn btn-sm ${filtroFecha === v ? 'btn-primary' : ''}`} style={filtroFecha !== v ? { background: 'transparent', border: 'none' } : {}} onClick={() => { setFiltroFecha(v); setPage(1) }}>{l}</button>
          ))}
        </div>
        {filtroFecha === 'custom' && (
          <>
            <input type="date" value={desdeHasta.desde} onChange={(e) => setDesdeHasta((p) => ({ ...p, desde: e.target.value }))} style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 13 }} />
            <input type="date" value={desdeHasta.hasta} onChange={(e) => setDesdeHasta((p) => ({ ...p, hasta: e.target.value }))} style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 13 }} />
          </>
        )}
        <select style={selStyle} value={filtroPago} onChange={(e) => { setFiltroPago(e.target.value); setPage(1) }}>
          <option value="">Todos los métodos</option>
          {Object.entries(PAGO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cliente, vendedor..." style={{ width: 200 }} />
      <button type="button" className="btn btn-secondary btn-sm" onClick={exportar}>📊 Excel</button>
      </PageHeader>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Método</th>
              <th style={{ textAlign: 'right' }}>Total</th><th style={{ width: 80 }}></th>
            </tr></thead>
            <tbody>
              {paginated.length === 0
                ? <EmptyRow cols={6} icon="📋" text="Sin ventas para este período" />
                : paginated.map((v) => (
                  <tr key={v.id} style={{ cursor: 'pointer', opacity: v.anulada ? .5 : 1 }} onClick={() => setDetail(v)}>
                    <td style={{ fontSize: 12 }}>{new Date(v.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      {v.anulada && <span className="badge badge-red" style={{ marginRight: 6 }}>ANULADA</span>}
                      {v.cli_nombre || 'Consumidor final'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mu)' }}>{v.vendedor_nombre || '—'}</td>
                    <td style={{ fontSize: 12 }}>{PAGO_LABELS[v.pago] || v.pago}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: v.anulada ? 'var(--mu)' : 'var(--ok)' }}>{fmt(v.total)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {!v.anulada && <button type="button" className="btn btn-icon btn-sm" onClick={() => setDetail({ ...v, _showAnular: true })} title="Anular">🚫</button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 16px' }}><Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} /></div>
      </div>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Venta #${detail?.id?.substr(-8)}`} size="lg">
        {detail && <VentaDetail venta={detail} api={api} onRefresh={load} onClose={() => setDetail(null)} showAnularByDefault={detail._showAnular} />}
      </Modal>
    </div>
  )
}

const selStyle = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', cursor: 'pointer', fontSize: 13, background: 'var(--bg)', color: 'var(--tx)' }

