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
const TIPO_LABEL = { cash: 'Bóveda', banco: 'Banco', billetera: 'Billetera', tarjeta: 'Tarjeta', otro: 'Otra' }
const TIPOS_CREAR = { banco: 'Banco', billetera: 'Billetera', tarjeta: 'Tarjeta', otro: 'Otra' }
const MEDIO_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta_debito: 'Débito', tarjeta_credito: 'Crédito', ctacte: 'Cta. Corriente', billetera: 'Billetera', cheque: 'Cheque', otro: 'Otro' }

export function Tesoreria() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion, allSucs, hasModule } = useApp()
  const { me } = useAuth()

  const [tab, setTab] = useState('cuentas')
  const [loading, setLoading] = useState(true)
  const [resumen, setResumen] = useState(null)
  const [cuentas, setCuentas] = useState([])
  const [movs, setMovs] = useState([])
  const [transfs, setTransfs] = useState([])
  const [tiposPago, setTiposPago] = useState([])

  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [gastoOpen, setGastoOpen] = useState(false)
  const [soloGastos, setSoloGastos] = useState(false)
  const [filtroSuc, setFiltroSuc] = useState('')

  const [reporte, setReporte] = useState(null)
  const [repForm, setRepForm] = useState(() => {
    const hoy = new Date().toISOString().substr(0, 10)
    const ini = new Date(); ini.setDate(1)
    return { desde: ini.toISOString().substr(0, 10), hasta: hoy, suc_id: '', cuenta_id: '' }
  })
  const [repLoading, setRepLoading] = useState(false)

  const veGlobal = useMemo(() => {
    const roles = Array.isArray(me?.roles) && me.roles.length ? me.roles : [me?.rol]
    return roles.includes('admin') || roles.includes('tesorero') || me?.rol === 'admin'
  }, [me])

  // Guard: módulo habilitado en el plan + rol con acceso (evita requests 403 que desloguean)
  const puedeEntrar = useMemo(() => {
    if (!hasModule('tesoreria')) return false
    const roles = Array.isArray(me?.roles) && me.roles.length ? me.roles : [me?.rol]
    return roles.includes('admin') || roles.includes('tesorero')
  }, [hasModule, me])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, c, m, t, cfg] = await Promise.all([
        api('GET', '/tesoreria/resumen').catch(() => null),
        api('GET', '/tesoreria/cuentas').catch(() => []),
        api('GET', '/tesoreria/transacciones?limit=200').catch(() => []),
        api('GET', '/tesoreria/transferencias?limit=100').catch(() => []),
        api('GET', '/config').catch(() => ({})),
      ])
      setResumen(r)
      setCuentas(Array.isArray(c) ? c : [])
      setMovs(Array.isArray(m) ? m : [])
      setTransfs(Array.isArray(t) ? t : [])
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
      const qs = `?desde=${repForm.desde}&hasta=${repForm.hasta}${repForm.suc_id ? '&suc_id=' + repForm.suc_id : ''}${repForm.cuenta_id ? '&cuenta_id=' + repForm.cuenta_id : ''}`
      setReporte(await api('GET', '/tesoreria/reporte' + qs))
    } catch (e) { toast(e.message, 'err') }
    finally { setRepLoading(false) }
  }, [repForm])

  useEffect(() => { if (puedeEntrar && tab === 'reporte') loadReporte() }, [tab, puedeEntrar, loadReporte])

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }))
  const setRep = (f) => (e) => setRepForm((p) => ({ ...p, [f]: e.target.value }))

  function openNewCuenta() {
    setForm({ nombre: '', tipo: 'banco', suc_id: '', saldo_inicial: '0', notas: '' })
    setModal('cuenta')
  }
  function openEditCuenta(c) {
    setForm({ nombre: c.nombre, tipo: c.tipo, suc_id: c.suc_id || '', saldo_inicial: c.saldo_inicial, notas: c.notas || '' })
    setModal(c)
  }

  async function saveCuenta() {
    if (!form.nombre?.trim()) { toast('Nombre requerido', 'err'); return }
    setSaving(true)
    try {
      const body = { ...form, saldo_inicial: parseFloat(form.saldo_inicial) || 0, suc_id: form.suc_id || '' }
      if (modal === 'cuenta') { await api('POST', '/tesoreria/cuentas', body); toast('Cuenta creada', 'ok') }
      else { await api('PUT', '/tesoreria/cuentas/' + modal.id, body); toast('Cuenta actualizada', 'ok') }
      setModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  function openNewMov() {
    setForm({ tipo: 'income', cuenta_id: '', monto: '', concepto: '', categoria: '', metodo_pago: '', fecha: new Date().toISOString().substr(0, 10) })
    setModal('mov')
  }
  async function saveMov() {
    if (!form.cuenta_id) { toast('Elegí una cuenta', 'err'); return }
    if (!form.monto || parseFloat(form.monto) <= 0) { toast('Monto inválido', 'err'); return }
    if (!form.concepto?.trim()) { toast('Concepto requerido', 'err'); return }
    setSaving(true)
    try {
      const mp = tiposPago.find((p) => p.id === form.metodo_pago)
      const body = { ...form, monto: parseFloat(form.monto), medio: mp?.medio || '' }
      await api('POST', '/tesoreria/transacciones', body)
      toast(form.tipo === 'income' ? 'Ingreso registrado' : 'Egreso registrado', 'ok')
      setModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  function openNewTransf() {
    setForm({ cuenta_origen: '', cuenta_destino: '', monto: '', concepto: '', fecha: new Date().toISOString().substr(0, 10) })
    setModal('transf')
  }
  async function saveTransf() {
    if (!form.cuenta_origen || !form.cuenta_destino) { toast('Elegí origen y destino', 'err'); return }
    if (!form.monto || parseFloat(form.monto) <= 0) { toast('Monto inválido', 'err'); return }
    setSaving(true)
    try {
      const body = { ...form, monto: parseFloat(form.monto), suc_id: sucSesion || null }
      await api('POST', '/tesoreria/transferencias', body)
      toast('Transferencia realizada', 'ok')
      setModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function anularMov(id) {
    try { await api('POST', '/tesoreria/transacciones/' + id + '/anular'); toast('Movimiento anulado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }
  async function anularTransf(id) {
    try { await api('POST', '/tesoreria/transferencias/' + id + '/anular'); toast('Transferencia anulada', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }
  async function desactivarCuenta(id) {
    try { await api('DELETE', '/tesoreria/cuentas/' + id); toast('Cuenta desactivada', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }
  async function conciliar(m) {
    try {
      await api('POST', '/tesoreria/transacciones/' + m.id + '/conciliar', { conciliado: !m.conciliado })
      toast(m.conciliado ? 'Desconciliado' : 'Conciliado ✅', 'ok'); load()
    } catch (e) { toast(e.message, 'err') }
  }

  function comprobanteMov(m) {
    imprimirComprobante({
      titulo: m.tipo === 'income' ? 'Comprobante de Ingreso' : 'Comprobante de Egreso',
      lineas: [['Cuenta', m.cuenta_nombre || '—'], ['Sucursal', m.suc_nombre || '—'], ['Concepto', m.concepto], ['Método', MEDIO_LABEL[m.medio] || m.metodo_pago || '—'], ['Registrado por', m.usuario || '—']],
      monto: m.monto, fecha: m.fecha,
    })
  }
  function comprobanteTransf(t) {
    imprimirComprobante({
      titulo: t.tipo === 'cierre_caja' ? 'Comprobante de Depósito (Cierre de Caja)' : 'Comprobante de Transferencia',
      lineas: [['Origen', t.origen_nombre || '—'], ['Destino', t.destino_nombre || '—'], ['Sucursal', t.suc_nombre || '—'], ['Concepto', t.concepto]],
      monto: t.monto, fecha: t.fecha,
    })
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

  if (!puedeEntrar) return <Navigate to="/app/dashboard" replace />
  if (loading) return <Loader />

  const cuentasElegibles = cuentas.filter((c) => c.activo !== false)
  const cuentasConciliables = (id) => {
    const c = cuentas.find((x) => x.id === id)
    return c && c.tipo !== 'cash'
  }
  const movsFiltrados = useMemo(() => {
    let list = movs
    if (soloGastos) list = list.filter((m) => m.ref_tipo === 'gasto')
    if (filtroSuc) list = list.filter((m) => m.suc_id === filtroSuc)
    return list
  }, [movs, soloGastos, filtroSuc])
  const transfsFiltrados = filtroSuc ? transfs.filter((t) => t.suc_id === filtroSuc) : transfs

  const diffEgresos = resumen && resumen.egresos_mes_anterior > 0
    ? Math.round(((resumen.egresos_mes - resumen.egresos_mes_anterior) / resumen.egresos_mes_anterior) * 100)
    : null

  return (
    <div>
      {resumen?.en_rojo?.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid var(--bad)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          ⚠️ Cuentas en rojo: {resumen.en_rojo.map((c) => `${c.nombre} (${fmt(c.saldo)})`).join(' · ')}
        </div>
      )}

      {resumen && (
        <div className="grid-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
          <div className="kpi-card" style={{ borderLeft: '3px solid var(--ok)' }}>
            <div className="kpi-label">Saldo total</div>
            <div className="kpi-value" style={{ color: 'var(--ok)' }}>{fmt(resumen.total)}</div>
            <div className="kpi-sub">{resumen.cuentas?.length || 0} cuentas</div>
          </div>
          {(resumen.por_tipo || []).map((t) => (
            <div key={t.tipo} className="kpi-card">
              <div className="kpi-label">{t.tipo}</div>
              <div className="kpi-value" style={{ fontSize: 18 }}>{fmt(t.saldo)}</div>
            </div>
          ))}
          <div className="kpi-card">
            <div className="kpi-label">Ingresos del mes</div>
            <div className="kpi-value" style={{ color: 'var(--ok)', fontSize: 18 }}>+{fmt(resumen.ingresos_mes)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Egresos del mes</div>
            <div className="kpi-value" style={{ color: 'var(--bad)', fontSize: 18 }}>-{fmt(resumen.egresos_mes)}</div>
            {diffEgresos !== null && (
              <div className="kpi-sub" style={{ color: diffEgresos > 0 ? 'var(--bad)' : 'var(--ok)' }}>
                {diffEgresos > 0 ? '+' : ''}{diffEgresos}% vs mes anterior
              </div>
            )}
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Retiros de cajas</div>
            <div className="kpi-value" style={{ fontSize: 18 }}>{fmt(resumen.retiros_mes || 0)}</div>
            <div className="kpi-sub">del mes</div>
          </div>
        </div>
      )}

      {resumen && (resumen.por_sucursal || []).length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 10 }}>🏪 Aporte de cada sucursal al mes</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(resumen.por_sucursal || []).map((s) => (
              <div key={s.suc_id} style={{ background: 'var(--sf)', borderRadius: 8, padding: '8px 14px', minWidth: 150 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{s.suc_nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--mu)' }}>Retiros: {fmt(s.retiros)} · Cierres: {fmt(s.cierres)}</div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ok)' }}>{fmt(s.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <PageHeader title="💵 Tesorería">
        <div style={{ display: 'flex', gap: 6 }}>
          {[['cuentas', '🏦 Cuentas'], ['movs', '💸 Movimientos'], ['transfs', '🔁 Transferencias'], ['reporte', '📈 Reporte']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={tab === k ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}>{l}</button>
          ))}
        </div>
        {tab === 'cuentas' && <button type="button" className="btn btn-primary" onClick={openNewCuenta}>+ Nueva cuenta</button>}
        {tab === 'movs' && <button type="button" className="btn btn-secondary" onClick={() => setGastoOpen(true)}>💸 Gasto</button>}
        {tab === 'movs' && <button type="button" className="btn btn-primary" onClick={openNewMov}>+ Nuevo movimiento</button>}
        {tab === 'transfs' && <button type="button" className="btn btn-primary" onClick={openNewTransf}>+ Transferencia</button>}
      </PageHeader>

      {tab === 'cuentas' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Cuenta</th><th>Tipo</th><th>Sucursal</th><th>Notas</th><th style={{ textAlign: 'right' }}>Saldo</th><th style={{ width: 80 }}></th>
              </tr></thead>
              <tbody>
                {cuentas.length === 0
                  ? <EmptyRow cols={6} icon="🏦" text="Sin cuentas. Creá la primera (banco o billetera)." />
                  : cuentas.map((c) => {
                    const esBoveda = c.tipo === 'cash'
                    return (
                      <tr key={c.id} style={{ cursor: esBoveda ? 'default' : 'pointer' }} onClick={() => !esBoveda && openEditCuenta(c)}>
                        <td data-label="Cuenta">
                          <div style={{ fontWeight: 600 }}>{c.nombre} {esBoveda && <span title="Bóveda única de la empresa — no editable">🔒</span>}</div>
                          {esBoveda && <div style={{ fontSize: 11, color: 'var(--mu)' }}>Central de la empresa — recibe retiros y cierres de todas las cajas</div>}
                        </td>
                        <td data-label="Tipo"><span className="badge badge-blue" style={{ fontSize: 11 }}>{c.tipo_label}</span></td>
                        <td data-label="Sucursal" style={{ fontSize: 12 }}>{c.suc_nombre || 'Todas'}</td>
                        <td data-label="Notas" style={{ fontSize: 12, color: 'var(--mu)' }}>{c.notas || '—'}</td>
                        <td data-label="Saldo" style={{ textAlign: 'right', fontWeight: 700, color: c.saldo < 0 ? 'var(--bad)' : 'var(--ok)' }}>{fmt(c.saldo)}</td>
                        <td data-label="" onClick={(e) => e.stopPropagation()}>
                          {!esBoveda && <button type="button" className="btn btn-icon btn-sm" onClick={() => setConfirm({ tipo: 'cuenta', id: c.id, msg: `¿Desactivar "${c.nombre}"? Solo se puede si el saldo es $0.` })}>🗑</button>}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'movs' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--bd)', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className={`btn btn-sm ${soloGastos ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSoloGastos(!soloGastos)}>💸 Solo gastos</button>
            <select value={filtroSuc} onChange={(e) => setFiltroSuc(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 12 }}>
              <option value="">Todas las sucursales</option>
              {allSucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            {soloGastos && <span style={{ fontSize: 12, color: 'var(--mu)' }}>Mostrando egresos registrados como gasto</span>}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Fecha</th><th>Concepto</th><th>Sucursal</th><th>Cuenta</th><th>Método</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ width: 120 }}></th>
              </tr></thead>
              <tbody>
                {movsFiltrados.length === 0
                  ? <EmptyRow cols={7} icon="💸" text={soloGastos ? 'Sin gastos registrados desde tesorería.' : 'Sin movimientos todavía.'} />
                  : movsFiltrados.map((m) => (
                    <tr key={m.id} style={{ opacity: m.anulado ? .4 : 1 }}>
                      <td data-label="Fecha" style={{ fontSize: 12, color: 'var(--mu)' }}>{fmtDate(m.fecha)}</td>
                      <td data-label="Concepto">
                        <div style={{ fontWeight: 600 }}>{m.concepto}</div>
                        {m.ref_tipo === 'gasto' && <span className="badge badge-orange" style={{ fontSize: 10 }}>💸 Gasto</span>}
                        {m.ref_tipo === 'retiro_caja' && <span className="badge badge-green" style={{ fontSize: 10 }}>🏪 Retiro de caja</span>}
                        {m.conciliado ? <span className="badge badge-blue" style={{ fontSize: 10 }}>✅ Conciliado</span> : null}
                      </td>
                      <td data-label="Sucursal" style={{ fontSize: 12 }}>{m.suc_nombre || '—'}</td>
                      <td data-label="Cuenta" style={{ fontSize: 12 }}>{m.cuenta_nombre || '—'}</td>
                      <td data-label="Método" style={{ fontSize: 12 }}>{MEDIO_LABEL[m.medio] || m.metodo_pago || '—'}</td>
                      <td data-label="Monto" style={{ textAlign: 'right', fontWeight: 700, color: m.tipo === 'income' ? 'var(--ok)' : 'var(--bad)' }}>
                        {m.tipo === 'income' ? '+' : '-'}{fmt(m.monto)}
                      </td>
                      <td data-label="" style={{ whiteSpace: 'nowrap' }}>
                        {!m.anulado && cuentasConciliables(m.cuenta_id) && (
                          <button type="button" className="btn btn-icon btn-sm" title={m.conciliado ? 'Desconciliar' : 'Marcar conciliado'} onClick={() => conciliar(m)}>✅</button>
                        )}
                        {!m.anulado && <button type="button" className="btn btn-icon btn-sm" title="Imprimir comprobante" onClick={() => comprobanteMov(m)}>🖨️</button>}
                        {!m.anulado && <button type="button" className="btn btn-icon btn-sm" title="Anular" onClick={() => setConfirm({ tipo: 'mov', id: m.id, msg: `¿Anular el movimiento "${m.concepto}"? Se revertirá el saldo.` })}>↩️</button>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'transfs' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--bd)', alignItems: 'center' }}>
            <select value={filtroSuc} onChange={(e) => setFiltroSuc(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--bd)', fontSize: 12 }}>
              <option value="">Todas las sucursales</option>
              {allSucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Fecha</th><th>Concepto</th><th>Sucursal</th><th>Origen</th><th>Destino</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ width: 90 }}></th>
              </tr></thead>
              <tbody>
                {transfsFiltrados.length === 0
                  ? <EmptyRow cols={7} icon="🔁" text="Sin transferencias. El cierre de caja deposita automáticamente en la Bóveda Central." />
                  : transfsFiltrados.map((t) => (
                    <tr key={t.id} style={{ opacity: t.anulado ? .4 : 1 }}>
                      <td data-label="Fecha" style={{ fontSize: 12, color: 'var(--mu)' }}>{fmtDate(t.fecha)}</td>
                      <td data-label="Concepto">
                        <div style={{ fontWeight: 600 }}>{t.concepto}</div>
                        {t.tipo === 'cierre_caja' && <span className="badge badge-green" style={{ fontSize: 10 }}>Cierre de caja</span>}
                        {t.tipo === 'retiro_caja' && <span className="badge badge-orange" style={{ fontSize: 10 }}>Retiro de caja</span>}
                      </td>
                      <td data-label="Sucursal" style={{ fontSize: 12 }}>{t.suc_nombre || '—'}</td>
                      <td data-label="Origen" style={{ fontSize: 12 }}>{t.origen_nombre}</td>
                      <td data-label="Destino" style={{ fontSize: 12 }}>{t.destino_nombre}</td>
                      <td data-label="Monto" style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(t.monto)}</td>
                      <td data-label="" style={{ whiteSpace: 'nowrap' }}>
                        {!t.anulado && <button type="button" className="btn btn-icon btn-sm" title="Imprimir comprobante" onClick={() => comprobanteTransf(t)}>🖨️</button>}
                        {!t.anulado && <button type="button" className="btn btn-icon btn-sm" title="Anular" onClick={() => setConfirm({ tipo: 'transf', id: t.id, msg: `¿Anular la transferencia de ${fmt(t.monto)}?` })}>↩️</button>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
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
              <Field label="Cuenta">
                <select value={repForm.cuenta_id} onChange={setRep('cuenta_id')}>
                  <option value="">Todas</option>
                  {cuentasElegibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
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

      <Modal open={modal === 'cuenta' || (modal && typeof modal === 'object')} onClose={() => setModal(null)} title={modal === 'cuenta' ? '+ Nueva cuenta' : 'Editar cuenta'}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={saveCuenta} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : '💾 Guardar'}
          </button>
        </>}
      >
        <div className="fr">
          <Field label="Nombre *"><input value={form.nombre || ''} onChange={set('nombre')} placeholder="Ej: Banco Galicia" /></Field>
          <Field label="Tipo">
            <select value={form.tipo || 'banco'} onChange={set('tipo')} disabled={modal !== 'cuenta' && modal?.tipo === 'cash'}>
              {Object.entries(modal === 'cuenta' ? TIPOS_CREAR : TIPO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        </div>
        <div className="fr">
          <Field label="Sucursal">
            <select value={form.suc_id || ''} onChange={set('suc_id')} disabled={!veGlobal}>
              <option value="">Todas (empresa)</option>
              {allSucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Field>
          <Field label="Saldo inicial"><input type="number" value={form.saldo_inicial ?? ''} onChange={set('saldo_inicial')} step="0.01" /></Field>
        </div>
        <Field label="Notas"><input value={form.notas || ''} onChange={set('notas')} placeholder="Opcional" /></Field>
      </Modal>

      <Modal open={modal === 'mov'} onClose={() => setModal(null)} title={form.tipo === 'income' ? '+ Ingreso' : '+ Egreso'}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={saveMov} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : '💾 Guardar'}
          </button>
        </>}
      >
        <div className="fr">
          <Field label="Tipo">
            <select value={form.tipo} onChange={set('tipo')}>
              <option value="income">Ingreso (+)</option>
              <option value="expense">Egreso (-)</option>
            </select>
          </Field>
          <Field label="Cuenta *">
            <select value={form.cuenta_id || ''} onChange={set('cuenta_id')}>
              <option value="">Elegir cuenta...</option>
              {cuentasElegibles.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({fmt(c.saldo)})</option>)}
            </select>
          </Field>
        </div>
        <div className="fr">
          <Field label="Monto *"><input type="number" value={form.monto || ''} onChange={set('monto')} min="0" step="0.01" placeholder="0.00" /></Field>
          <Field label="Fecha"><input type="date" value={form.fecha || ''} onChange={set('fecha')} /></Field>
        </div>
        <Field label="Concepto *"><input value={form.concepto || ''} onChange={set('concepto')} placeholder="Ej: Pago proveedor, Venta mayorista" /></Field>
        <div className="fr">
          <Field label="Categoría"><input value={form.categoria || ''} onChange={set('categoria')} placeholder="Ej: Servicios, Sueldos" /></Field>
          <Field label="Método de pago">
            <select value={form.metodo_pago || ''} onChange={set('metodo_pago')}>
              <option value="">—</option>
              {tiposPago.map((p) => <option key={p.id} value={p.id}>{p.icono} {p.nombre}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      <Modal open={modal === 'transf'} onClose={() => setModal(null)} title="+ Transferencia entre cuentas"
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={saveTransf} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : '💾 Realizar'}
          </button>
        </>}
      >
        <div className="fr">
          <Field label="Origen *">
            <select value={form.cuenta_origen || ''} onChange={set('cuenta_origen')}>
              <option value="">Elegir cuenta...</option>
              {cuentasElegibles.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({fmt(c.saldo)})</option>)}
            </select>
          </Field>
          <Field label="Destino *">
            <select value={form.cuenta_destino || ''} onChange={set('cuenta_destino')}>
              <option value="">Elegir cuenta...</option>
              {cuentasElegibles.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({fmt(c.saldo)})</option>)}
            </select>
          </Field>
        </div>
        <div className="fr">
          <Field label="Monto *"><input type="number" value={form.monto || ''} onChange={set('monto')} min="0" step="0.01" placeholder="0.00" /></Field>
          <Field label="Fecha"><input type="date" value={form.fecha || ''} onChange={set('fecha')} /></Field>
        </div>
        <Field label="Concepto"><input value={form.concepto || ''} onChange={set('concepto')} placeholder="Ej: Depósito a banco" /></Field>
      </Modal>

      <GastoModal open={gastoOpen} onClose={() => setGastoOpen(false)} api={api} toast={toast}
        fuente="tesoreria" cuentas={cuentas} tiposPago={tiposPago} onSaved={load} />

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm
          setConfirm(null)
          if (c.tipo === 'mov') anularMov(c.id)
          else if (c.tipo === 'transf') anularTransf(c.id)
          else desactivarCuenta(c.id)
        }}
        title="Confirmar" message={confirm?.msg || '¿Confirmás?'} confirmLabel="Sí, confirmar" />
    </div>
  )
}
