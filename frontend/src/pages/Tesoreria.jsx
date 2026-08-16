import { useState, useEffect, useMemo, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useApp, useToast, useAuth } from '../store'
import { Modal } from '../components/Modal'
import { PageHeader, Field, EmptyRow, Loader, ConfirmDialog } from '../components/UI'
import { GastoModal } from '../components/GastoModal'
import { exportExcel } from '../utils/excel'
import { imprimirComprobante } from '../utils/comprobante'

const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0, minimumFractionDigits: 0 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-AR') : '—'
const MEDIO_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta_debito: 'Débito', tarjeta_credito: 'Crédito', ctacte: 'Cta. Corriente', billetera: 'Billetera', cheque: 'Cheque', otro: 'Otro' }

function Pct({ actual, anterior }) {
  if (!anterior) return <span style={{ fontSize: 11, color: 'var(--mu)' }}>—</span>
  const p = Math.round(((actual - anterior) / Math.abs(anterior)) * 100)
  const color = p === 0 ? 'var(--mu)' : p > 0 ? 'var(--ok)' : 'var(--bad)'
  return <span style={{ fontSize: 11, fontWeight: 700, color }}>{p > 0 ? '+' : ''}{p}% vs anterior</span>
}

export function Tesoreria() {
  const { api } = useApi()
  const { toast } = useToast()
  const { allSucs, hasModule } = useApp()
  const { me } = useAuth()

  const [tab, setTab] = useState('boveda')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [tiposPago, setTiposPago] = useState([])
  const [cats, setCats] = useState([])

  const [gastoOpen, setGastoOpen] = useState(false)
  const [gastoPrefill, setGastoPrefill] = useState(null)
  const [filtroMetodo, setFiltroMetodo] = useState('')
  const [filtroSuc, setFiltroSuc] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  const [compModal, setCompModal] = useState(null)
  const [compForm, setCompForm] = useState({})
  const [presModal, setPresModal] = useState(null)
  const [presForm, setPresForm] = useState({})
  const [confirm, setConfirm] = useState(null)
  const [saving, setSaving] = useState(false)

  const [reporte, setReporte] = useState(null)
  const [repForm, setRepForm] = useState(() => {
    const hoy = new Date().toISOString().substr(0, 10)
    const ini = new Date(); ini.setDate(1)
    return { desde: ini.toISOString().substr(0, 10), hasta: hoy, suc_id: '' }
  })
  const [repLoading, setRepLoading] = useState(false)

  const esAdmin = useMemo(() => me?.rol === 'admin' || (Array.isArray(me?.roles) && me.roles.includes('admin')), [me])

  const puedeEntrar = useMemo(() => {
    if (!hasModule('tesoreria')) return false
    const roles = Array.isArray(me?.roles) && me.roles.length ? me.roles : [me?.rol]
    return roles.includes('admin') || roles.includes('tesorero')
  }, [hasModule, me])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [b, cfg, catsData] = await Promise.all([
        api('GET', '/tesoreria/boveda').catch(() => null),
        api('GET', '/config').catch(() => ({})),
        api('GET', '/gastos/categorias').catch(() => []),
      ])
      setData(b)
      setCats(Array.isArray(catsData) ? catsData : [])
      if (cfg?.tipos_pago) {
        try {
          const tp = typeof cfg.tipos_pago === 'string' ? JSON.parse(cfg.tipos_pago) : cfg.tipos_pago
          setTiposPago(Array.isArray(tp) ? tp.filter((p) => p.activo !== false) : [])
        } catch { setTiposPago([]) }
      }
    } catch (e) { toast(e.message || 'Error cargando tesorería', 'err') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (puedeEntrar) load() }, [load, puedeEntrar])

  const loadReporte = useCallback(async () => {
    setRepLoading(true)
    try {
      const qs = `?desde=${repForm.desde}&hasta=${repForm.hasta}${repForm.suc_id ? '&suc_id=' + repForm.suc_id : ''}`
      setReporte(await api('GET', '/tesoreria/reporte' + qs))
    } catch (e) { toast(e.message, 'err') }
    finally { setRepLoading(false) }
  }, [repForm])

  useEffect(() => { if (puedeEntrar && tab === 'reporte') loadReporte() }, [tab, puedeEntrar, loadReporte])

  const movsFiltrados = useMemo(() => {
    let list = (data && data.movimientos) || []
    if (filtroMetodo) list = list.filter((m) => m.metodo_pago === filtroMetodo)
    if (filtroSuc) list = list.filter((m) => m.suc_id === filtroSuc)
    if (filtroTipo) list = list.filter((m) => m.tipo === filtroTipo)
    return list
  }, [data, filtroMetodo, filtroSuc, filtroTipo])

  if (!puedeEntrar) return <Navigate to="/app/dashboard" replace />
  if (loading) return <Loader />

  async function aprobar(g) {
    try { await api('POST', '/gastos/' + g.id + '/aprobar'); toast('Gasto aprobado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }
  async function rechazar(g) {
    try { await api('POST', '/gastos/' + g.id + '/rechazar'); toast('Gasto rechazado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }
  async function anularMov(id) {
    try { await api('POST', '/tesoreria/transacciones/' + id + '/anular'); toast('Movimiento anulado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }
  function comprobanteMov(m) {
    imprimirComprobante({
      titulo: m.tipo === 'income' ? 'Comprobante de Ingreso' : 'Comprobante de Egreso',
      lineas: [['Cuenta', 'Bóveda Central'], ['Sucursal', m.suc_nombre || '—'], ['Concepto', m.concepto], ['Método', m.metodo_nombre || '—'], ['Registrado por', m.usuario || '—']],
      monto: m.monto, fecha: m.fecha,
    })
  }
  function comprobanteDeposito(t) {
    imprimirComprobante({
      titulo: 'Comprobante de Depósito (Cierre de Caja)',
      lineas: [['Destino', 'Bóveda Central'], ['Sucursal', t.suc_nombre || '—'], ['Concepto', t.concepto]],
      monto: t.monto, fecha: t.fecha,
    })
  }

  // ── Compromisos ──
  function openNewComp() { setCompForm({ nombre: '', categoria_id: '', monto_estimado: '', dia_vencimiento: '5', notas: '' }); setCompModal('new') }
  function openEditComp(c) { setCompForm({ nombre: c.nombre, categoria_id: c.categoria_id || '', monto_estimado: c.monto_estimado, dia_vencimiento: c.dia_vencimiento, notas: c.notas || '' }); setCompModal(c) }
  const setC = (f) => (e) => setCompForm((p) => ({ ...p, [f]: e.target.value }))
  async function saveComp() {
    if (!compForm.nombre?.trim()) { toast('Nombre requerido', 'err'); return }
    setSaving(true)
    try {
      if (compModal === 'new') await api('POST', '/tesoreria/compromisos', compForm)
      else await api('PUT', '/tesoreria/compromisos/' + compModal.id, compForm)
      toast('Compromiso guardado', 'ok'); setCompModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }
  async function borrarComp(id) {
    try { await api('DELETE', '/tesoreria/compromisos/' + id); toast('Compromiso eliminado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }
  function pagarCompromiso(c) {
    setGastoPrefill({ nombre: c.nombre, categoria_id: c.categoria_id || '', monto: String(c.monto_estimado || ''), compromiso_id: c.id })
    setGastoOpen(true)
  }

  // ── Presupuestos ──
  function openNewPres() { setPresForm({ categoria_id: '', monto: '', mes: data.mes }); setPresModal('new') }
  function openEditPres(p) { setPresForm({ categoria_id: p.categoria_id || '', monto: p.monto, mes: p.mes }); setPresModal(p) }
  const setP = (f) => (e) => setPresForm((p) => ({ ...p, [f]: e.target.value }))
  async function savePres() {
    if (!presForm.monto || parseFloat(presForm.monto) <= 0) { toast('Monto requerido', 'err'); return }
    setSaving(true)
    try {
      if (presModal === 'new') await api('POST', '/tesoreria/presupuestos', { ...presForm, monto: parseFloat(presForm.monto) })
      else await api('PUT', '/tesoreria/presupuestos/' + presModal.id, { monto: parseFloat(presForm.monto), categoria_id: presForm.categoria_id })
      toast('Presupuesto guardado', 'ok'); setPresModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }
  async function borrarPres(id) {
    try { await api('DELETE', '/tesoreria/presupuestos/' + id); toast('Presupuesto eliminado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }

  async function cerrarMes() {
    if (!window.confirm(`¿Cerrar el mes ${data.mes}? Se guardará una foto del saldo y del detalle por método/sucursal.`)) return
    try { await api('POST', '/tesoreria/cierre-mes', { mes: data.mes }); toast('Mes cerrado 🔒', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }

  async function guardarUmbral(v) {
    try { await api('PUT', '/config', { tesoreria_umbral_aprobacion: String(v) }); toast('Umbral actualizado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }

  function exportarReporte() {
    if (!reporte) return
    const headers = ['Fecha', 'Tipo', 'Concepto', 'Cuenta', 'Sucursal', 'Monto']
    const rows = (reporte.filas || []).map((f) => [
      new Date(f.fecha).toLocaleDateString('es-AR'),
      f.tipo, f.concepto, f.cuenta, f.suc_nombre, f.monto,
    ])
    exportExcel('tesoreria-reporte', headers, rows, 'Reporte Tesorería')
    toast('📊 Excel exportado', 'ok')
  }

  const setRep = (f) => (e) => setRepForm((p) => ({ ...p, [f]: e.target.value }))
  const boveda = data?.boveda
  const diffEgresos = data && data.egresos_mes_anterior > 0
    ? Math.round(((data.egresos_mes - data.egresos_mes_anterior) / data.egresos_mes_anterior) * 100)
    : null

  return (
    <div>
      {data?.alertas?.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid var(--warn)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Alertas</div>
          {data.alertas.map((a, i) => <div key={i} style={{ marginBottom: 2 }}>{a.tipo === 'presupuesto_cerca' ? '🟡' : a.tipo === 'caja_abierta' ? '🕒' : '🔴'} {a.texto}</div>)}
        </div>
      )}

      {/* Bóveda Central — card principal */}
      <div className="card" style={{ padding: 20, marginBottom: 16, background: 'linear-gradient(135deg, rgba(79,70,229,.08), rgba(16,185,129,.08))', border: '1.5px solid var(--bd)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 34 }}>🏦</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Bóveda Central <span title="Cuenta única de la empresa">🔒</span></div>
              <div style={{ fontSize: 12, color: 'var(--mu)' }}>Recibe retiros, cierres y cobros de todas las sucursales — única cuenta de tesorería</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--mu)', textTransform: 'uppercase' }}>Saldo disponible</div>
            <div style={{ fontWeight: 900, fontSize: 30, color: 'var(--ok)' }}>{fmt(boveda?.saldo || 0)}</div>
          </div>
        </div>
        {data?.otras_cuentas?.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--mu)', background: 'var(--sf)', borderRadius: 8, padding: '8px 12px' }}>
            Otras cuentas (solo lectura): {data.otras_cuentas.map((c) => `${c.nombre} ${fmt(c.saldo)}`).join(' · ')}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div className="kpi-card">
          <div className="kpi-label">Ingresos del mes</div>
          <div className="kpi-value" style={{ color: 'var(--ok)', fontSize: 20 }}>+{fmt(data?.ingresos_mes)}</div>
          <div className="kpi-sub">retiros + cierres + cobros electrónicos</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Egresos del mes</div>
          <div className="kpi-value" style={{ color: 'var(--bad)', fontSize: 20 }}>-{fmt(data?.egresos_mes)}</div>
          {diffEgresos !== null && <div className="kpi-sub" style={{ color: diffEgresos > 0 ? 'var(--bad)' : 'var(--ok)' }}>{diffEgresos > 0 ? '+' : ''}{diffEgresos}% vs anterior</div>}
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Retiros de cajas</div>
          <div className="kpi-value" style={{ fontSize: 20 }}>{fmt(data?.retiros_mes)}</div>
          <div className="kpi-sub">efectivo del mes</div>
        </div>
      </div>

      <PageHeader title="💵 Tesorería">
        <div style={{ display: 'flex', gap: 6 }}>
          {[['boveda', '🏦 Bóveda'], ['reporte', '📈 Reporte']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={tab === k ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}>{l}</button>
          ))}
        </div>
        {tab === 'boveda' && <button type="button" className="btn btn-primary" onClick={() => { setGastoPrefill(null); setGastoOpen(true) }}>💸 Registrar gasto</button>}
      </PageHeader>

      {tab === 'boveda' && (
        <div>
          {/* Por método de pago */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 10 }}>💳 Por método de pago — {data?.mes}</div>
            <div className="grid-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {(data?.por_metodo || []).map((p) => (
                <div key={p.id} style={{ background: 'var(--sf)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>{p.icono}</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ok)' }}>+{fmt(p.ingresos_mes)}</div>
                  <div style={{ fontSize: 12, color: 'var(--bad)', marginBottom: 4 }}>-{fmt(p.egresos_mes)}</div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: p.neto < 0 ? 'var(--bad)' : 'inherit' }}>{fmt(p.neto)}</div>
                  <Pct actual={p.neto} anterior={p.neto_anterior} />
                </div>
              ))}
            </div>
          </div>

          {/* Por sucursal */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', borderBottom: '1px solid var(--bd)' }}>🏪 Aporte de cada sucursal — {data?.mes}</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Sucursal</th><th style={{ textAlign: 'right' }}>Retiros</th><th style={{ textAlign: 'right' }}>Cierres ef.</th><th style={{ textAlign: 'right' }}>Cobros electr.</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr></thead>
                <tbody>
                  {(data?.por_sucursal || []).length === 0
                    ? <EmptyRow cols={6} icon="🏪" text="Sin aportes de cajas este mes todavía." />
                    : (data?.por_sucursal || []).map((s) => (
                      <tr key={s.suc_id || 'otra'}>
                        <td data-label="Sucursal" style={{ fontWeight: 600 }}>{s.suc_nombre}</td>
                        <td data-label="Retiros" style={{ textAlign: 'right' }}>{fmt(s.retiros)}</td>
                        <td data-label="Cierres ef." style={{ textAlign: 'right' }}>{fmt(s.cierres_efectivo)}</td>
                        <td data-label="Cobros electr." style={{ textAlign: 'right' }}>{fmt(s.cobros_electronicos)}</td>
                        <td data-label="Total" style={{ textAlign: 'right', fontWeight: 800, color: 'var(--ok)' }}>{fmt(s.total)}</td>
                        <td data-label=""><Pct actual={s.total} anterior={s.total_anterior} /></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pendientes de aprobación */}
          {(data?.pendientes || []).length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', borderBottom: '1px solid var(--bd)' }}>⏳ Gastos pendientes de aprobación</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Concepto</th><th>Categoría</th><th style={{ textAlign: 'right' }}>Monto</th><th>Registrado por</th><th style={{ width: 140 }}></th></tr></thead>
                  <tbody>
                    {data.pendientes.map((g) => (
                      <tr key={g.id}>
                        <td data-label="Concepto" style={{ fontWeight: 600 }}>{g.nombre}</td>
                        <td data-label="Categoría" style={{ fontSize: 12 }}>{g.categoria_nombre || '—'}</td>
                        <td data-label="Monto" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--bad)' }}>{fmt(g.monto)}</td>
                        <td data-label="Registrado por" style={{ fontSize: 12 }}>{g.registrado_por}</td>
                        <td data-label="">
                          {esAdmin
                            ? <div style={{ display: 'flex', gap: 4 }}>
                                <button type="button" className="btn btn-sm btn-primary" onClick={() => aprobar(g)}>✅ Aprobar</button>
                                <button type="button" className="btn btn-sm btn-danger" onClick={() => rechazar(g)}>❌</button>
                              </div>
                            : <span style={{ fontSize: 12, color: 'var(--mu)' }}>Esperando admin</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Compromisos */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>📅 Compromisos mensuales</div>
              {esAdmin && <button type="button" className="btn btn-secondary btn-sm" onClick={openNewComp}>+ Nuevo</button>}
            </div>
            {(data?.compromisos || []).length === 0
              ? <div style={{ fontSize: 13, color: 'var(--mu)' }}>Sin compromisos fijos (alquiler, servicios, sueldos...). {esAdmin ? 'Agregá uno con "+ Nuevo".' : ''}</div>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(data?.compromisos || []).map((c) => {
                  const vencido = c.dia_vencimiento < parseInt(new Date().toISOString().substr(8, 2)) && !c.pagado_este_mes
                  return (
                    <div key={c.id} style={{ background: 'var(--sf)', borderRadius: 10, padding: '10px 14px', minWidth: 190, border: vencido ? '1px solid var(--warn)' : '1px solid transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{c.nombre}</span>
                        {c.pagado_este_mes && <span className="badge badge-green" style={{ fontSize: 10 }}>Pagado</span>}
                        {vencido && <span className="badge badge-red" style={{ fontSize: 10 }}>Vencido</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--mu)' }}>{c.categoria_nombre || 'Sin categoría'} · vence el {c.dia_vencimiento}</div>
                      <div style={{ fontWeight: 800, fontSize: 15, margin: '4px 0 8px' }}>{fmt(c.monto_estimado)}</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {!c.pagado_este_mes && <button type="button" className="btn btn-sm btn-primary" onClick={() => pagarCompromiso(c)}>💸 Pagar ahora</button>}
                        {esAdmin && <>
                          <button type="button" className="btn btn-icon btn-sm" onClick={() => openEditComp(c)}>✏️</button>
                          <button type="button" className="btn btn-icon btn-sm" onClick={() => borrarComp(c.id)}>🗑</button>
                        </>}
                      </div>
                    </div>
                  )
                })}
              </div>}
          </div>

          {/* Presupuestos */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>🎯 Presupuesto del mes por categoría</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {esAdmin && <button type="button" className="btn btn-secondary btn-sm" onClick={openNewPres}>+ Presupuesto</button>}
                {esAdmin && (
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--mu)' }}>
                    Umbral aprobación $
                    <input type="number" defaultValue={data?.umbral || 0} key={'umbral_' + (data?.umbral || 0)}
                      onBlur={(e) => guardarUmbral(e.target.value)} style={{ width: 90, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--bd)', fontSize: 12 }} />
                  </label>
                )}
              </div>
            </div>
            {(data?.presupuestos || []).length === 0
              ? <div style={{ fontSize: 13, color: 'var(--mu)' }}>Sin presupuestos para {data?.mes}. {esAdmin ? 'Definí límites por categoría de gasto.' : ''}</div>
              : (data?.presupuestos || []).map((p) => (
                <div key={p.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{p.categoria_icono} {p.categoria_nombre}</span>
                    <span>
                      <strong style={{ color: p.pct >= 100 ? 'var(--bad)' : p.pct >= 80 ? 'var(--warn)' : 'inherit' }}>{fmt(p.gastado)}</strong> / {fmt(p.monto)}
                      <span style={{ fontSize: 11, color: 'var(--mu)', marginLeft: 6 }}>({p.pct}%)</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 8, background: 'var(--bd)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: Math.min(100, p.pct) + '%', height: '100%', borderRadius: 99, background: p.pct >= 100 ? 'var(--bad)' : p.pct >= 80 ? 'var(--warn)' : 'var(--ok)' }} />
                    </div>
                    {esAdmin && <>
                      <button type="button" className="btn btn-icon btn-sm" onClick={() => openEditPres(p)}>✏️</button>
                      <button type="button" className="btn btn-icon btn-sm" onClick={() => borrarPres(p.id)}>🗑</button>
                    </>}
                  </div>
                </div>
              ))}
          </div>

          {/* Movimientos */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--bd)', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', flex: 1 }}>📒 Movimientos de la bóveda</div>
              <select value={filtroMetodo} onChange={(e) => setFiltroMetodo(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 12 }}>
                <option value="">Todos los métodos</option>
                {tiposPago.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <select value={filtroSuc} onChange={(e) => setFiltroSuc(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 12 }}>
                <option value="">Todas las sucursales</option>
                {allSucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 12 }}>
                <option value="">Ingresos y egresos</option>
                <option value="income">Ingresos</option>
                <option value="expense">Egresos</option>
              </select>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Fecha</th><th>Concepto</th><th>Sucursal</th><th>Método</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ width: 90 }}></th></tr></thead>
                <tbody>
                  {movsFiltrados.length === 0
                    ? <EmptyRow cols={6} icon="📒" text="Sin movimientos. Los retiros y cierres de caja llegan solos acá." />
                    : movsFiltrados.map((m) => (
                      <tr key={m.id}>
                        <td data-label="Fecha" style={{ fontSize: 12, color: 'var(--mu)' }}>{fmtDate(m.fecha)}</td>
                        <td data-label="Concepto">
                          <div style={{ fontWeight: 600 }}>{m.concepto}</div>
                          {m.ref_tipo === 'gasto' && <span className="badge badge-orange" style={{ fontSize: 10 }}>💸 Gasto</span>}
                          {m.ref_tipo === 'retiro_caja' && <span className="badge badge-green" style={{ fontSize: 10 }}>🏪 Retiro</span>}
                          {m.ref_tipo === 'cierre_caja_metodo' && <span className="badge badge-blue" style={{ fontSize: 10 }}>🏦 Cierre</span>}
                          {m.ref_tipo === 'sueldo_pago' && <span className="badge badge-gray" style={{ fontSize: 10 }}>👥 Sueldo</span>}
                          {m.ref_tipo === 'prov_pago' && <span className="badge badge-gray" style={{ fontSize: 10 }}>📦 Proveedor</span>}
                        </td>
                        <td data-label="Sucursal" style={{ fontSize: 12 }}>{m.suc_nombre || '—'}</td>
                        <td data-label="Método" style={{ fontSize: 12 }}>{m.metodo_icono} {m.metodo_nombre || MEDIO_LABEL[m.medio] || '—'}</td>
                        <td data-label="Monto" style={{ textAlign: 'right', fontWeight: 700, color: m.tipo === 'income' ? 'var(--ok)' : 'var(--bad)' }}>
                          {m.tipo === 'income' ? '+' : '-'}{fmt(m.monto)}
                        </td>
                        <td data-label="" style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="btn btn-icon btn-sm" title="Imprimir comprobante" onClick={() => comprobanteMov(m)}>🖨️</button>
                          <button type="button" className="btn btn-icon btn-sm" title="Anular" onClick={() => setConfirm({ tipo: 'mov', id: m.id, msg: `¿Anular "${m.concepto}"? Se revertirá el saldo.` })}>↩️</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Depósitos de cierres */}
          {(data?.depositos || []).length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', borderBottom: '1px solid var(--bd)' }}>🏦 Depósitos de cierres de caja — {data?.mes}</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Fecha</th><th>Sucursal</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ width: 50 }}></th></tr></thead>
                  <tbody>
                    {data.depositos.map((t) => (
                      <tr key={t.id}>
                        <td data-label="Fecha" style={{ fontSize: 12, color: 'var(--mu)' }}>{fmtDate(t.fecha)}</td>
                        <td data-label="Sucursal" style={{ fontSize: 12 }}>{t.suc_nombre || '—'}</td>
                        <td data-label="Concepto" style={{ fontSize: 12 }}>{t.concepto}</td>
                        <td data-label="Monto" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ok)' }}>+{fmt(t.monto)}</td>
                        <td data-label=""><button type="button" className="btn btn-icon btn-sm" onClick={() => comprobanteDeposito(t)}>🖨️</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cierre de mes */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 4 }}>🔒 Cierre de mes</div>
                <div style={{ fontSize: 12, color: 'var(--mu)' }}>Guardá una foto del saldo y del detalle por método/sucursal del mes {data?.mes}.</div>
              </div>
              {esAdmin && <button type="button" className="btn btn-secondary" onClick={cerrarMes}>🔒 Cerrar {data?.mes}</button>}
            </div>
            {(data?.historial || []).length > 0 && (
              <div style={{ marginTop: 12 }}>
                {(data?.historial || []).slice(0, 6).map((h) => (
                  <div key={h.mes} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px dashed var(--bd)', fontSize: 13 }}>
                    <span style={{ fontWeight: 700, minWidth: 70 }}>{h.mes}</span>
                    <span style={{ color: 'var(--ok)', fontWeight: 700 }}>{fmt(h.saldo_total)}</span>
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--mu)' }}>
                      {Object.entries(h.por_metodo || {}).map(([k, v]) => `${k}: ${fmt(v)}`).join(' · ')}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--mu)' }}>{h.cerrado_por}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'reporte' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="Desde"><input type="date" value={repForm.desde} onChange={setRep('desde')} /></Field>
              <Field label="Hasta"><input type="date" value={repForm.hasta} onChange={setRep('hasta')} /></Field>
              <Field label="Sucursal">
                <select value={repForm.suc_id} onChange={setRep('suc_id')}>
                  <option value="">Todas</option>
                  {allSucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </Field>
              <button type="button" className="btn btn-primary" onClick={loadReporte} disabled={repLoading}>
                {repLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '🔍 Consultar'}
              </button>
              {reporte && <button type="button" className="btn btn-secondary" onClick={exportarReporte}>📊 Exportar Excel</button>}
            </div>
          </div>

          {reporte && (
            <>
              <div className="grid-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                <div className="kpi-card"><div className="kpi-label">Ingresos</div><div className="kpi-value" style={{ color: 'var(--ok)', fontSize: 18 }}>+{fmt(reporte.totales.ingresos)}</div></div>
                <div className="kpi-card"><div className="kpi-label">Egresos</div><div className="kpi-value" style={{ color: 'var(--bad)', fontSize: 18 }}>-{fmt(reporte.totales.egresos)}</div></div>
                <div className="kpi-card"><div className="kpi-label">Cierres de caja</div><div className="kpi-value" style={{ fontSize: 18 }}>{fmt(reporte.totales.cierres)}</div></div>
                <div className="kpi-card"><div className="kpi-label">Retiros de caja</div><div className="kpi-value" style={{ fontSize: 18 }}>{fmt(reporte.totales.retiros)}</div></div>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Cuenta</th><th>Sucursal</th><th style={{ textAlign: 'right' }}>Monto</th></tr></thead>
                    <tbody>
                      {(reporte.filas || []).length === 0
                        ? <EmptyRow cols={6} icon="📈" text="Sin movimientos en el período." />
                        : reporte.filas.map((f, i) => (
                          <tr key={i}>
                            <td data-label="Fecha" style={{ fontSize: 12, color: 'var(--mu)' }}>{fmtDate(f.fecha)}</td>
                            <td data-label="Tipo">
                              <span className={`badge ${['ingreso', 'cierre_caja', 'retiro_caja'].includes(f.tipo) ? 'badge-green' : f.tipo === 'transferencia' ? 'badge-blue' : 'badge-red'}`} style={{ fontSize: 10 }}>{f.tipo}</span>
                              {f.conciliado && <span style={{ fontSize: 10, marginLeft: 4 }}>✅</span>}
                            </td>
                            <td data-label="Concepto" style={{ fontSize: 12 }}>{f.concepto}</td>
                            <td data-label="Cuenta" style={{ fontSize: 12 }}>{f.cuenta}</td>
                            <td data-label="Sucursal" style={{ fontSize: 12 }}>{f.suc_nombre || '—'}</td>
                            <td data-label="Monto" style={{ textAlign: 'right', fontWeight: 700, color: ['ingreso', 'cierre_caja', 'retiro_caja'].includes(f.tipo) ? 'var(--ok)' : 'var(--bad)' }}>
                              {['ingreso', 'cierre_caja', 'retiro_caja'].includes(f.tipo) ? '+' : '-'}{fmt(f.monto)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <GastoModal open={gastoOpen} onClose={() => setGastoOpen(false)} api={api} toast={toast}
        fuente="tesoreria" tiposPago={tiposPago} onSaved={load} prefill={gastoPrefill} umbral={data?.umbral || 0} esAdmin={esAdmin} />

      {/* Modal compromiso */}
      <Modal open={!!compModal} onClose={() => setCompModal(null)} title={compModal === 'new' ? '+ Nuevo compromiso' : 'Editar compromiso'}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setCompModal(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={saveComp} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '💾 Guardar'}
          </button>
        </>}
      >
        <Field label="Nombre *"><input value={compForm.nombre || ''} onChange={setC('nombre')} placeholder="Ej: Alquiler local" /></Field>
        <div className="fr">
          <Field label="Monto estimado"><input type="number" value={compForm.monto_estimado ?? ''} onChange={setC('monto_estimado')} min="0" step="0.01" /></Field>
          <Field label="Vence el día"><input type="number" value={compForm.dia_vencimiento ?? 1} onChange={setC('dia_vencimiento')} min="1" max="31" /></Field>
        </div>
        <Field label="Categoría">
          <select value={compForm.categoria_id || ''} onChange={setC('categoria_id')}>
            <option value="">Sin categoría</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
          </select>
        </Field>
        <Field label="Notas"><input value={compForm.notas || ''} onChange={setC('notas')} /></Field>
      </Modal>

      {/* Modal presupuesto */}
      <Modal open={!!presModal} onClose={() => setPresModal(null)} title={presModal === 'new' ? '+ Nuevo presupuesto' : 'Editar presupuesto'}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setPresModal(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={savePres} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '💾 Guardar'}
          </button>
        </>}
      >
        <Field label="Categoría">
          <select value={presForm.categoria_id || ''} onChange={setP('categoria_id')}>
            <option value="">Sin categoría</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
          </select>
        </Field>
        <Field label="Presupuesto del mes *"><input type="number" value={presForm.monto ?? ''} onChange={setP('monto')} min="0" step="0.01" /></Field>
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm
          setConfirm(null)
          if (c.tipo === 'mov') anularMov(c.id)
        }}
        title="Confirmar" message={confirm?.msg || '¿Confirmás?'} confirmLabel="Sí, confirmar" />
    </div>
  )
}
