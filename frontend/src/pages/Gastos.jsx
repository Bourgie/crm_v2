import { useState, useEffect, useMemo, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useApp, useToast } from '../store'
import { Modal } from '../components/Modal'
import { SearchBar, PageHeader, Field, ConfirmDialog, EmptyRow, Loader, Pagination } from '../components/UI'
import { exportExcel } from '../utils/excel'

const PER_PAGE = 30
const EMPTY_GASTO = { nombre: '', monto: '', fecha: new Date().toISOString().substr(0, 10), categoria_id: '', estado: 'pagado', metodo_pago: 'efectivo', notas: '' }
const METODOS = ['efectivo', 'transferencia', 'debito_cuenta', 'tarjeta_corp', 'cheque', 'otro']
const METODO_LABELS = { efectivo: 'Efectivo', transferencia: 'Transferencia', debito_cuenta: 'Débito', tarjeta_corp: 'Tarjeta corp.', cheque: 'Cheque', otro: 'Otro' }

const ESTADO_BADGE_MAP = { pagado: 'badge-green', pendiente: 'badge-yellow', vencido: 'badge-red' }
const fmtGasto = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

function EstadoBadge({ estado }) {
  return <span className={`badge ${ESTADO_BADGE_MAP[estado] || 'badge-gray'}`}>{estado}</span>
}

export function Gastos() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion } = useApp()

  const [gastos, setGastos] = useState([])
  const [cats, setCats] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [mes, setMes] = useState(() => new Date().toISOString().substr(0, 7))
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_GASTO)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)

  // Generate month options (last 12 months)
  const meses = useMemo(() => {
    const opts = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      const key = d.toISOString().substr(0, 7)
      const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
      opts.push({ key, label: i === 0 ? `Este mes: ${label}` : label })
    }
    return opts
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = `?suc_id=${sucSesion || ''}&desde=${mes}-01&hasta=${mes}-31`
      const [g, c, r] = await Promise.all([
        api('GET', '/gastos' + qs),
        api('GET', '/gastos/categorias').catch(() => []),
        api('GET', `/gastos/resumen?mes=${mes}${sucSesion ? '&suc_id=' + sucSesion : ''}`).catch(() => null),
      ])
      setGastos(Array.isArray(g) ? g : [])
      setCats(Array.isArray(c) ? c : [])
      setResumen(r)
    } catch { toast('Error cargando gastos', 'err') }
    finally { setLoading(false) }
  }, [mes, sucSesion])

  useEffect(() => { load() }, [load])

  async function exportar() {
    const headers = ['Fecha', 'Concepto', 'Categoría', 'Sucursal', 'Estado', 'Método pago', 'Monto']
    const rows = filtered.map(g => [
      g.fecha ? new Date(g.fecha).toLocaleDateString('es-AR') : '',
      g.nombre || g.concepto || '', g.categoria_nombre || g.categoria || '',
      (allSucs.find(s => s.id === g.suc_id) || {}).nombre || '',
      g.estado || '', g.metodo_pago || '', g.monto || 0
    ])
    await exportExcel('gastos', headers, rows, 'Gastos')
    toast('📊 Excel exportado', 'ok')
  }


  const filtered = useMemo(() => {
    let list = [...gastos]
    if (search) { const q = search.toLowerCase(); list = list.filter((g) => (g.nombre + ' ' + g.categoria_nombre).toLowerCase().includes(q)) }
    if (filtroCat) list = list.filter((g) => g.categoria_id === filtroCat)
    if (filtroEstado) list = list.filter((g) => g.estado === filtroEstado)
    return list.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [gastos, search, filtroCat, filtroEstado])

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalFiltrado = filtered.reduce((a, g) => a + (g.monto || 0), 0)
  const fmt = fmtGasto

  function openNew() { setForm({ ...EMPTY_GASTO, fecha: new Date().toISOString().substr(0, 10) }); setModal('new') }
  function openEdit(g) {
    setForm({ nombre: g.nombre, monto: g.monto, fecha: (g.fecha || '').substr(0, 10), categoria_id: g.categoria_id || '', estado: g.estado || 'pagado', metodo_pago: g.metodo_pago || 'efectivo', notas: g.notas || '' })
    setModal(g)
  }

  async function save() {
    if (!form.nombre.trim() || !form.monto) { toast('Nombre y monto son obligatorios', 'err'); return }
    setSaving(true)
    try {
      const body = { ...form, monto: parseFloat(form.monto), suc_id: sucSesion || null, categoria_nombre: cats.find((c) => c.id === form.categoria_id)?.nombre || null }
      if (modal === 'new') { await api('POST', '/gastos', body); toast('Gasto registrado', 'ok') }
      else { await api('PUT', '/gastos/' + modal.id, body); toast('Gasto actualizado', 'ok') }
      setModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function deleteGasto(id) {
    try { await api('DELETE', '/gastos/' + id); toast('Gasto eliminado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }))
  const me = useAuth?.()?.me

  if (loading) return <Loader />

  return (
    <div>
      {/* KPI row */}
      {resumen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
          <div className="kpi-card" style={{ borderLeft: '3px solid var(--bad)' }}>
            <div className="kpi-label">Total del mes</div>
            <div className="kpi-value" style={{ color: 'var(--bad)' }}>{fmt(resumen.total)}</div>
            <div className="kpi-sub">{gastos.length} gastos</div>
          </div>
          {(resumen.porCategoria || []).sort((a, b) => b.total - a.total).slice(0, 3).map((c) => (
            <div key={c.nombre} className="kpi-card">
              <div className="kpi-label">{c.nombre}</div>
              <div className="kpi-value" style={{ fontSize: 18 }}>{fmt(c.total)}</div>
              <div className="kpi-sub">{c.n} gastos</div>
            </div>
          ))}
        </div>
      )}

      {/* Alert recurrentes */}
      {resumen?.pendientes_recurrentes > 0 && (
        <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid var(--warn)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          ⚠️ Tenés <strong>{resumen.pendientes_recurrentes}</strong> gasto(s) recurrente(s) sin registrar este mes.
        </div>
      )}

      <PageHeader title={`💸 Gastos · ${fmt(totalFiltrado)} filtrados`}>
        <select value={mes} onChange={(e) => { setMes(e.target.value); setPage(1) }} style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', cursor: 'pointer', fontSize: 13 }}>
          {meses.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <select style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', cursor: 'pointer', fontSize: 13 }} value={filtroCat} onChange={(e) => { setFiltroCat(e.target.value); setPage(1) }}>
          <option value="">Todas las categorías</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
        </select>
        <select style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', cursor: 'pointer', fontSize: 13 }} value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value); setPage(1) }}>
          <option value="">Todos los estados</option>
          <option value="pagado">Pagado</option>
          <option value="pendiente">Pendiente</option>
          <option value="vencido">Vencido</option>
        </select>
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Buscar..." style={{ width: 200 }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={exportar}>📊 Excel</button>
        <button type="button" className="btn btn-primary" onClick={openNew}>+ Nuevo gasto</button>
      </PageHeader>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Método</th><th>Estado</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ width: 80 }}></th>
            </tr></thead>
            <tbody>
              {paginated.length === 0
                ? <EmptyRow cols={7} icon="💸" text={search ? 'Sin resultados' : 'Sin gastos este mes. Registrá el primero.'} />
                : paginated.map((g) => (
                  <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(g)}>
                    <td style={{ fontSize: 12, color: 'var(--mu)' }}>{(g.fecha || '').substr(0, 10)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{g.nombre}</div>
                      {g.notas && <div style={{ fontSize: 12, color: 'var(--mu)' }}>{g.notas}</div>}
                      {g.pagado_por && <div style={{ fontSize: 12, color: 'var(--mu)' }}>Pagó: {g.pagado_por}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{g.categoria_nombre || '—'}</td>
                    <td style={{ fontSize: 12 }}>{METODO_LABELS[g.metodo_pago] || g.metodo_pago || '—'}</td>
                    <td><EstadoBadge estado={g.estado} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--bad)' }}>{fmt(g.monto)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn btn-icon btn-sm" onClick={() => setConfirm(g.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 16px' }}>
          <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
        </div>
      </div>

      {/* Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? '+ Nuevo gasto' : 'Editar gasto'}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : '💾 Guardar'}
          </button>
        </>}
      >
        <div className="fr">
          <Field label="Concepto *"><input value={form.nombre} onChange={set('nombre')} placeholder="Ej: Alquiler local" /></Field>
          <Field label="Monto *"><input type="number" value={form.monto} onChange={set('monto')} placeholder="0.00" min="0" step="0.01" /></Field>
        </div>
        <div className="fr">
          <Field label="Fecha"><input type="date" value={form.fecha} onChange={set('fecha')} /></Field>
          <Field label="Categoría">
            <select value={form.categoria_id} onChange={set('categoria_id')}>
              <option value="">Sin categoría</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
            </select>
          </Field>
        </div>
        <div className="fr">
          <Field label="Estado">
            <select value={form.estado} onChange={set('estado')}>
              <option value="pagado">Pagado</option>
              <option value="pendiente">Pendiente</option>
              <option value="vencido">Vencido</option>
            </select>
          </Field>
          <Field label="Método de pago">
            <select value={form.metodo_pago} onChange={set('metodo_pago')}>
              {METODOS.map((m) => <option key={m} value={m}>{METODO_LABELS[m]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Notas">
          <input value={form.notas} onChange={set('notas')} placeholder="Observaciones opcionales" />
        </Field>
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => deleteGasto(confirm)}
        title="Eliminar gasto" message="¿Eliminás este gasto? No se puede deshacer." confirmLabel="Sí, eliminar" />
    </div>
  )
}

// useAuth re-import for Gastos standalone
import { useAuth } from '../store'

