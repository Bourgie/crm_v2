// ═══════════════════════════════════════════════════════════════
// PENDIENTES
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useApp, useAuth, useToast } from '../store'
import { Modal } from '../components/Modal'
import { SearchBar, PageHeader, Field, ConfirmDialog, EmptyRow, Loader, Pagination } from '../components/UI'
import { exportExcel } from '../utils/excel'

const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-AR') : '—'
const PER_PAGE = 25

const EST_PEND = { pendiente: 'badge-yellow', en_preparacion: 'badge-blue', listo: 'badge-purple', entregado: 'badge-green', cancelado: 'badge-red' }
const EST_LABELS = { pendiente: 'Pendiente', en_preparacion: 'En preparación', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado' }

export function Pendientes() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion, allSucs, allClis, allProds } = useApp()

  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroEst, setFiltroEst] = useState('pendiente')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ cli_id: '', cli_nombre: '', tel: '', concepto: '', monto_total: '', sena: '', fecha_entrega: '', notas: '', suc_entrega: '' })
  const [fItems, setFItems] = useState([{ prod_id: '', nombre: '', talle: '', precio: '', cantidad: 1 }])
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [modalBuscarVta, setModalBuscarVta] = useState(false)
  const [ventasSearch, setVentasSearch] = useState('')
  const [ventasResultados, setVentasResultados] = useState([])
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null)
  const [bvtaDesde, setBvtaDesde] = useState(new Date(new Date().getTime() - 30*86400000).toISOString().substr(0,10))
  const [bvtaHasta, setBvtaHasta] = useState(new Date().toISOString().substr(0,10))
  const [bvtaFecha, setBvtaFecha] = useState('')
  const [bvtaObs, setBvtaObs] = useState('')
  const [bvtaEstado, setBvtaEstado] = useState('pendiente')
  const [bvtaSucCobro, setBvtaSucCobro] = useState('')
  const [bvtaSucEntrega, setBvtaSucEntrega] = useState('')
  const [bvtaItemsSel, setBvtaItemsSel] = useState([])  // {checked, cantidad, ...item}
  const [bvtaLoadingItems, setBvtaLoadingItems] = useState(false)
  const [buscarLoading, setBuscarLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api('GET', `/pendientes?suc_id=${sucSesion || ''}`)
      setPedidos(Array.isArray(data) ? data : [])
    } catch { toast('Error cargando pedidos', 'err') }
    finally { setLoading(false) }
  }, [sucSesion])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let list = pedidos
    if (search) { const q = search.toLowerCase(); list = list.filter((p) => (p.cli_nombre + ' ' + p.concepto + ' ' + p.tel).toLowerCase().includes(q)) }
    if (filtroEst) list = list.filter((p) => p.estado === filtroEst)
    return list.sort((a, b) => {
      if (a.fecha_entrega && b.fecha_entrega) return new Date(a.fecha_entrega) - new Date(b.fecha_entrega)
      return new Date(b.creado || 0) - new Date(a.creado || 0)
    })
  }, [pedidos, search, filtroEst])

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }))

  
  function exportarPendientes() {
    const headers = ['N°', 'Fecha creado', 'Cliente', 'Tel', 'Concepto', 'Total', 'Seña', 'Saldo', 'Estado', 'Fecha entrega', 'Suc. entrega', 'Notas']
    const rows = filtered.map(p => [
      p.numero || '', p.creado ? new Date(p.creado).toLocaleDateString('es-AR') : '',
      p.cli_nombre || '', p.tel || '', p.concepto || '',
      p.total || 0, p.seña || 0, (p.total||0) - (p.seña||0),
      p.estado || '', p.fecha_entrega || '',
      (allSucs.find(s => s.id === p.suc_entrega) || {}).nombre || '',
      p.notas || ''
    ])
    exportExcel('pendientes', headers, rows, 'Pendientes')
    toast('📊 Excel exportado', 'ok')
  }
async function buscarVentas() {
    setBuscarLoading(true)
    try {
      let url = `/ventas?suc_id=${sucSesion||''}`
      if (ventasSearch.trim()) url += `&q=${encodeURIComponent(ventasSearch)}`
      if (bvtaDesde) url += `&desde=${bvtaDesde}`
      if (bvtaHasta) url += `&hasta=${bvtaHasta}`
      const r = await api('GET', url)
      setVentasResultados(Array.isArray(r) ? r.filter(v=>!v.anulada).slice(0, 25) : [])
    } catch { setVentasResultados([]) }
    finally { setBuscarLoading(false) }
  }

  async function abrirDesdeVenta(v) {
    setVentaSeleccionada(v)
    setBvtaLoadingItems(true)
    const fe = new Date(); fe.setDate(fe.getDate() + 7)
    setBvtaFecha(fe.toISOString().substr(0, 10))
    setBvtaObs('')
    setBvtaEstado('pendiente')
    setBvtaSucCobro(sucSesion)
    setBvtaSucEntrega(sucSesion)
    let items = v.items || []
    if (!items.length) {
      try { const vFull = await api('GET', '/ventas/' + v.id); items = vFull.items || [] } catch {}
    }
    setBvtaItemsSel(items.map(it => ({ ...it, checked: true, cantidad: parseInt(it.cantidad) || 1, cantidad_max: parseInt(it.cantidad) || 1 })))
    setBvtaLoadingItems(false)
  }

  async function crearDesdeVenta() {
    if (!ventaSeleccionada) return
    setSaving(true)
    try {
      const v = ventaSeleccionada
      // Only use checked items
      const checked = bvtaItemsSel.filter(it => it.checked)
      if (!checked.length) { toast('Seleccioná al menos un artículo', 'err'); setSaving(false); return }
      const totalSel = checked.reduce((a, it) => a + (parseFloat(it.precio) || 0) * (parseInt(it.cantidad) || 1), 0)
      const r = await api('POST', '/pendientes', {
        suc_id: sucSesion, venta_id: v.id,
        cliente_id: v.cliente_id || null,
        cli_nombre: v.cli_nombre || '',
        tel: '',
        suc_cobro: bvtaSucCobro || sucSesion,
        suc_entrega: bvtaSucEntrega || sucSesion,
        concepto: checked.length
          ? checked.map(i=>`${i.nombre}${i.talle?' T:'+i.talle:''} x${i.cantidad}`).join(', ')
          : (v.cli_nombre || 'Pedido'),
        items: checked.map(i => ({
          prod_id: i.prod_id, nombre: i.nombre, talle: i.talle || '',
          precio: i.precio, cantidad: parseInt(i.cantidad) || 1,
          subtotal: (parseFloat(i.precio) || 0) * (parseInt(i.cantidad) || 1),
        })),
        total: totalSel, seña: 0, saldo: totalSel,
        fecha_entrega_estimada: bvtaFecha,
        estado: bvtaEstado,
        notas: bvtaObs,
      })
      toast(`📦 Pedido #${r.numero || ''} creado desde venta #${v.numero}`, 'ok')
      setModalBuscarVta(false); setVentaSeleccionada(null); setVentasSearch(''); setVentasResultados([])
      load()
    } catch(e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  function openNew() {
    setForm({ cli_id: '', cli_nombre: '', tel: '', concepto: '', monto_total: '', sena: '', fecha_entrega: '', notas: '' })
    setFItems([{ prod_id: '', nombre: '', talle: '', precio: '', cantidad: 1 }])
    setModal('new')
  }
  function openEdit(p) {
    setForm({ cli_id: p.cli_id || '', cli_nombre: p.cli_nombre || '', tel: p.tel || '', concepto: p.concepto || '', monto_total: p.monto_total || p.total || '', sena: p.sena || '0', fecha_entrega: (p.fecha_entrega_estimada || p.fecha_entrega || '').substr(0, 10), notas: p.notas || '', suc_entrega: p.suc_entrega || '' })
    // Load items from API
    api('GET', '/pendientes/' + p.id).then((d) => {
      const items = d.items || []
      setFItems(items.length ? items.map((i) => ({ prod_id: i.prod_id || '', nombre: i.nombre, talle: i.talle || '', precio: i.precio, cantidad: i.cantidad })) : [{ prod_id: '', nombre: '', talle: '', precio: '', cantidad: 1 }])
    }).catch(() => {})
    setModal(p)
  }

  async function save() {
    if (modal !== 'new') return // editing not allowed after creation
    if (!form.concepto.trim()) { toast('El concepto es obligatorio', 'err'); return }
    setSaving(true)
    try {
      const items = fItems.filter((i) => i.nombre?.trim()).map((i) => ({
        prod_id: i.prod_id || null,
        nombre: i.nombre,
        talle: i.talle || '',
        precio: parseFloat(i.precio) || 0,
        cantidad: parseInt(i.cantidad) || 1,
        subtotal: (parseFloat(i.precio) || 0) * (parseInt(i.cantidad) || 1),
      }))
      if (!items.length) { toast('Agregá al menos un producto', 'err'); setSaving(false); return }
      const body = { ...form, suc_id: sucSesion, items, monto_total: parseFloat(form.monto_total) || items.reduce((a,i)=>a+i.subtotal,0), sena: parseFloat(form.sena) || 0, suc_entrega: form.suc_entrega || sucSesion }
      await api('POST', '/pendientes', body); toast('Pedido creado', 'ok')
      setModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function cambiarEstado(id, estado) {
    try { await api('PATCH', '/pendientes/' + id + '/estado', { estado }); toast('Estado actualizado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }

  if (loading) return <Loader />

  const hoyStr = new Date().toISOString().substr(0, 10)
  const vencidos = pedidos.filter((p) => p.fecha_entrega && p.fecha_entrega.substr(0, 10) <= hoyStr && !['entregado', 'cancelado'].includes(p.estado))

  return (
    <div>
      {vencidos.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid var(--bad)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          🚨 <strong>{vencidos.length}</strong> pedido(s) con fecha de entrega hoy o vencida.
        </div>
      )}

      <div className="grid-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 16 }}>
        {Object.entries(EST_LABELS).map(([k, label]) => {
          const n = pedidos.filter((p) => p.estado === k).length
          return n > 0 ? (
            <div key={k} className="kpi-card" style={{ cursor: 'pointer', borderLeft: `3px solid ${k === 'pendiente' ? 'var(--warn)' : k === 'entregado' ? 'var(--ok)' : 'var(--ac)'}` }} onClick={() => setFiltroEst(k === filtroEst ? '' : k)}>
              <div className="kpi-label">{label}</div>
              <div className="kpi-value" style={{ fontSize: 22 }}>{n}</div>
            </div>
          ) : null
        })}
      </div>

      <PageHeader title="🚚 Pedidos pendientes">
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cliente, concepto..." style={{ width: 220 }} />
        <select style={selStyle} value={filtroEst} onChange={(e) => { setFiltroEst(e.target.value); setPage(1) }}>
          <option value="">Todos</option>
          {Object.entries(EST_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="btn btn-primary" onClick={async ()=>{
          setModalBuscarVta(true); setVentaSeleccionada(null); setVentasSearch('');
          setBvtaDesde(new Date(new Date().getTime()-30*86400000).toISOString().substr(0,10));
          setBvtaHasta(new Date().toISOString().substr(0,10));
          setBuscarLoading(true);
          try {
            const r = await api('GET', `/ventas?desde=${new Date(new Date().getTime()-30*86400000).toISOString().substr(0,10)}&hasta=${new Date().toISOString().substr(0,10)}&suc_id=${sucSesion||''}`);
            setVentasResultados(Array.isArray(r) ? r.filter(v=>!v.anulada).slice(0,30) : []);
          } catch { setVentasResultados([]) }
          finally { setBuscarLoading(false) }
        }}>📦 Nuevo pedido</button>
      </PageHeader>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Concepto</th><th>Entrega</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Seña</th><th>Estado</th><th style={{ width: 100 }}></th></tr></thead>
            <tbody>
              {filtered.slice((page-1)*PER_PAGE, page*PER_PAGE).length === 0
                ? <EmptyRow cols={7} icon="🚚" text="Sin pedidos" />
                : filtered.slice((page-1)*PER_PAGE, page*PER_PAGE).map((p) => {
                    const late = p.fecha_entrega && p.fecha_entrega.substr(0,10) <= hoyStr && !['entregado','cancelado'].includes(p.estado)
                    return (
                      <tr key={p.id} style={{ cursor: 'pointer', background: late ? 'rgba(239,68,68,.04)' : '' }} onClick={() => openEdit(p)}>
                        <td data-label="Cliente">
                          <div style={{ fontWeight: 600 }}>{p.cli_nombre || 'Sin nombre'}</div>
                          {p.tel && <div style={{ fontSize: 11, color: 'var(--mu)' }}>{p.tel}</div>}
                        </td>
                        <td data-label="Concepto">{p.concepto}</td>
                        <td data-label="Entrega" style={{ fontSize: 12, color: late ? 'var(--bad)' : 'var(--mu)', fontWeight: late ? 700 : 400 }}>{fmtDate(p.fecha_entrega)}{late ? ' ⚠️' : ''}{p.suc_entrega && allSucs.find(s=>s.id===p.suc_entrega) ? <span style={{display:'block',fontSize:10}}>🏪 {allSucs.find(s=>s.id===p.suc_entrega).nombre}</span> : null}</td>
                        <td data-label="Total" style={{ textAlign: 'right', fontWeight: 600 }}>{p.monto_total ? fmt(p.monto_total) : '—'}</td>
                        <td data-label="Seña" style={{ textAlign: 'right', fontSize: 12 }}>{p.sena ? fmt(p.sena) : '—'}</td>
                        <td data-label="Estado"><span className={`badge ${EST_PEND[p.estado] || 'badge-gray'}`}>{EST_LABELS[p.estado] || p.estado}</span></td>
                        <td data-label="" onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {p.estado !== 'entregado' && p.estado !== 'cancelado' && (
                              <button type="button" className="btn btn-sm" style={{ background: '#dcfce7', color: '#15803d', border: 'none' }} onClick={() => cambiarEstado(p.id, 'entregado')}>✅</button>
                            )}
                            <button type="button" className="btn btn-icon btn-sm" onClick={() => setConfirm(p.id)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 16px' }}><Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} /></div>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? '+ Nuevo pedido' : '📋 Pedido #' + (modal?.numero || '')} size="md"
        footer={<>
          {modal === 'new' ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : '💾 Crear pedido'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cerrar</button>
              {modal?.estado !== 'entregado' && modal?.estado !== 'cancelado' && (
                <>
                  <button type="button" className="btn" style={{ background: '#dbeafe', color: '#1d4ed8', border: 'none' }}
                    onClick={() => { cambiarEstado(modal.id, 'listo'); setModal(null) }}>✅ Marcar listo</button>
                  <button type="button" className="btn" style={{ background: '#dcfce7', color: '#15803d', border: 'none' }}
                    onClick={() => { cambiarEstado(modal.id, 'entregado'); setModal(null) }}>📦 Entregar todo</button>
                </>
              )}
              {modal?.estado === 'pendiente' && (
                <button type="button" className="btn" style={{ background: '#fef3c7', color: '#92400e', border: 'none' }}
                  onClick={() => { cambiarEstado(modal.id, 'en_preparacion'); setModal(null) }}>👨‍🍳 En preparación</button>
              )}
            </>
          )}
        </>}
      >
        {modal === 'new' ? (
          <>
            <div className="fr">
              <Field label="Cliente"><input value={form.cli_nombre} onChange={set('cli_nombre')} placeholder="Nombre del cliente" list="pend-clis" /><datalist id="pend-clis">{allClis.map((c) => <option key={c.id} value={c.nombre + ' ' + (c.apellido||'')} />)}</datalist></Field>
              <Field label="Teléfono"><input value={form.tel} onChange={set('tel')} placeholder="Teléfono" /></Field>
            </div>
            <Field label="Concepto *"><input value={form.concepto} onChange={set('concepto')} placeholder="Qué pidió el cliente..." /></Field>
            <div className="fr">
              <Field label="Monto total"><input type="number" value={form.monto_total} onChange={set('monto_total')} min="0" placeholder="0.00" /></Field>
              <Field label="Seña recibida"><input type="number" value={form.sena} onChange={set('sena')} min="0" placeholder="0.00" /></Field>
            </div>
            <div className="fr">
              <Field label="Fecha de entrega"><input type="date" value={form.fecha_entrega} onChange={set('fecha_entrega')} /></Field>
              <Field label="Sucursal de entrega">
                <select value={form.suc_entrega} onChange={set('suc_entrega')}>
                  <option value="">Sin definir</option>
                  {allSucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 8 }}>Productos *</div>
              {fItems.map((line, i) => (
                <div key={i} className="grid-item-form" style={{ display: 'grid', gridTemplateColumns: '2fr 60px 80px 90px auto', gap: 6, marginBottom: 6, alignItems: 'end' }}>
                  <div style={{ position: 'relative' }}>
                    {i === 0 && <label style={{ display: 'block', fontSize: 11, color: 'var(--mu)', marginBottom: 3 }}>Producto</label>}
                    <input value={line.nombre} onChange={(e) => setFItems((p) => p.map((l, idx) => idx === i ? { ...l, nombre: e.target.value } : l))} placeholder="Nombre del producto" list={`pend-prods-${i}`} />
                    <datalist id={`pend-prods-${i}`}>{allProds.filter((p) => !line.nombre || p.nombre.toLowerCase().includes(line.nombre.toLowerCase())).slice(0, 8).map((p) => (<option key={p.id} value={p.nombre + (p.talle ? ' T:' + p.talle : '')} onClick={() => setFItems((prev) => prev.map((l, idx) => idx === i ? { ...l, prod_id: p.id, nombre: p.nombre, talle: p.talle || '', precio: p.precio_l1 || '' } : l))} />))}</datalist>
                  </div>
                  <div>{i === 0 && <label style={{ display: 'block', fontSize: 11, color: 'var(--mu)', marginBottom: 3 }}>Talle</label>}<input value={line.talle} onChange={(e) => setFItems((p) => p.map((l, idx) => idx === i ? { ...l, talle: e.target.value } : l))} placeholder="M" /></div>
                  <div>{i === 0 && <label style={{ display: 'block', fontSize: 11, color: 'var(--mu)', marginBottom: 3 }}>Precio</label>}<input type="number" value={line.precio} onChange={(e) => setFItems((p) => p.map((l, idx) => idx === i ? { ...l, precio: e.target.value } : l))} placeholder="0" min="0" /></div>
                  <div>{i === 0 && <label style={{ display: 'block', fontSize: 11, color: 'var(--mu)', marginBottom: 3 }}>Cant.</label>}<input type="number" value={line.cantidad} onChange={(e) => setFItems((p) => p.map((l, idx) => idx === i ? { ...l, cantidad: e.target.value } : l))} min="1" style={{ textAlign: 'center' }} /></div>
                  <button type="button" onClick={() => setFItems((p) => p.filter((_, idx) => idx !== i || p.length === 1))} style={{ background: 'none', border: 'none', color: 'var(--mu)', cursor: 'pointer', fontSize: 18, paddingBottom: 2 }}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFItems((p) => [...p, { prod_id: '', nombre: '', talle: '', precio: '', cantidad: 1 }])}>+ Agregar producto</button>
              {fItems.filter(i => i.nombre && i.precio).length > 0 && (<div style={{ textAlign: 'right', marginTop: 8, fontSize: 13, fontWeight: 700 }}>Total productos: {fmt(fItems.reduce((a, i) => a + (parseFloat(i.precio) || 0) * (parseInt(i.cantidad) || 1), 0))}</div>)}
            </div>
            <Field label="Notas"><textarea value={form.notas} onChange={set('notas')} rows={2} placeholder="Observaciones..." style={{ resize: 'vertical' }} /></Field>
          </>
        ) : (
          <>
            <div style={{ background:'var(--sf)', borderRadius:8, padding:'10px 14px', marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{fontWeight:700, fontSize:16}}>#{modal?.numero} — {form.cli_nombre || 'Sin cliente'}</span>
                <span className={`badge ${EST_PEND[modal?.estado] || 'badge-gray'}`}>{EST_LABELS[modal?.estado] || modal?.estado}</span>
              </div>
              <div style={{ fontSize:13, color:'var(--mu)' }}>Creado: {fmtDate(modal?.fecha)}</div>
            </div>
            <div className="fr">
              <Field label="Cliente"><input value={form.cli_nombre} disabled /></Field>
              <Field label="Teléfono"><input value={form.tel} disabled /></Field>
            </div>
            <Field label="Concepto"><input value={form.concepto} disabled /></Field>
            <div className="fr">
              <Field label="Monto total"><input type="number" value={form.monto_total} disabled /></Field>
              <Field label="Saldo (cta cte)"><input type="number" value={form.monto_total - form.sena || 0} disabled style={{fontWeight:700,color:'var(--bad)'}} /></Field>
            </div>
            <div className="fr">
              <Field label="Fecha entrega"><input type="date" value={form.fecha_entrega} disabled /></Field>
              <Field label="Sucursal entrega">
                <select value={form.suc_entrega} disabled style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid var(--bd)',fontSize:13,background:'var(--bg)',color:'var(--tx)',width:'100%'}}>
                  <option value="">Sin definir</option>
                  {allSucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ marginTop:4 }}>
              <div style={{fontSize:12,fontWeight:700,color:'var(--mu)',textTransform:'uppercase',marginBottom:8}}>Productos</div>
              {fItems.map((line, i) => (
                <div key={i} className="grid-item-form" style={{display:'grid',gridTemplateColumns:'2fr 60px 80px 90px',gap:6,marginBottom:6,alignItems:'center',padding:'4px 8px',background:'var(--sf)',borderRadius:6}}>
                  <span style={{fontSize:13,fontWeight:500}}>{line.nombre}</span>
                  <span style={{fontSize:12,color:'var(--mu)',textAlign:'center'}}>{line.talle||'—'}</span>
                  <span style={{fontSize:12,textAlign:'right'}}>${(parseFloat(line.precio)||0).toLocaleString('es-AR')}</span>
                  <span style={{fontSize:12,textAlign:'center'}}>x{line.cantidad}</span>
                </div>
              ))}
              {fItems.filter(i=>i.nombre&&i.precio).length>0 && (<div style={{textAlign:'right',marginTop:8,fontSize:14,fontWeight:700}}>Total: {fmt(fItems.reduce((a,i)=>a+(parseFloat(i.precio)||0)*(parseInt(i.cantidad)||1),0))}</div>)}
            </div>
            <Field label="Notas"><textarea value={form.notas} disabled rows={2} style={{resize:'vertical',background:'var(--sf)'}} /></Field>
          </>
        )}
      </Modal>

      {/* Modal: Crear desde venta */}
      {modalBuscarVta && (
        <div className="modal-overlay" onClick={(e)=>{if(e.target===e.currentTarget){setModalBuscarVta(false);setVentaSeleccionada(null)}}}>
          <div className="modal" style={{maxWidth:640}}>
            <div className="modal-header">
              <h3>🔍 Crear pedido desde venta</h3>
              <button type="button" onClick={()=>{setModalBuscarVta(false);setVentaSeleccionada(null)}} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button>
            </div>
            <div className="modal-body">
              {!ventaSeleccionada ? (
                <>
                  <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                    <input value={ventasSearch} onChange={(e)=>setVentasSearch(e.target.value)} onInput={()=>buscarVentas()} placeholder="Cliente, N° de venta..." style={{flex:2,minWidth:160}}/>
                    <input type="date" value={bvtaDesde} onChange={(e)=>{setBvtaDesde(e.target.value);setTimeout(buscarVentas,0)}} style={{width:130}}/>
                    <input type="date" value={bvtaHasta} onChange={(e)=>{setBvtaHasta(e.target.value);setTimeout(buscarVentas,0)}} style={{width:130}}/>
                  </div>
                  <div style={{maxHeight:300,overflowY:'auto',marginBottom:12}}>
                    {buscarLoading && ventasResultados.length===0 && <div style={{textAlign:'center',padding:16}}><div className="spinner" style={{margin:'0 auto'}}/></div>}
                    {ventasResultados.length===0 && !buscarLoading && <div style={{textAlign:'center',padding:16,color:'var(--mu)'}}>Sin resultados</div>}
                    {ventasResultados.length>0 && (
                      <div className="table-wrap"><table>
                        <thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Total</th><th></th></tr></thead>
                        <tbody>
                          {ventasResultados.map((v)=>(
                            <tr key={v.id}>
                              <td data-label="#" style={{fontWeight:700}}>#{v.numero}</td>
                              <td data-label="Fecha" style={{fontSize:11}}>{new Date(v.fecha).toLocaleString('es-AR')}</td>
                              <td data-label="Cliente">{v.cli_nombre||'Consumidor'}</td>
                              <td data-label="Vendedor" style={{fontSize:11}}>{v.vend_nombre||''}</td>
                              <td data-label="Total" style={{fontWeight:700,color:'var(--ac)'}}>{fmt(v.total)}</td>
                              <td data-label=""><button type="button" className="btn btn-primary btn-sm" onClick={()=>abrirDesdeVenta(v)}>Elegir</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{background:'var(--sf)',borderRadius:8,padding:'10px 14px',marginBottom:12}}>
                    <strong>#{ventaSeleccionada.numero}</strong> · {ventaSeleccionada.cli_nombre||'Sin cliente'} · {new Date(ventaSeleccionada.fecha).toLocaleString('es-AR')} · <strong>{fmt(ventaSeleccionada.total)}</strong>
                    {!ventaSeleccionada.cliente_id && <div style={{marginTop:4,fontSize:11,color:'var(--bad)'}}>⚠️ Venta sin cliente — el pendiente se creará sin asignar</div>}
                  </div>
                  {bvtaLoadingItems ? (
                    <div style={{textAlign:'center',padding:24}}><div className="spinner" style={{margin:'0 auto'}}/></div>
                  ) : (
                    <>
                      <div style={{fontSize:12,fontWeight:700,color:'var(--mu)',textTransform:'uppercase',marginBottom:6}}>Seleccioná los artículos del pedido</div>
                      {bvtaItemsSel.length===0 ? (
                        <div style={{textAlign:'center',padding:16,color:'var(--mu)',fontSize:13}}>Sin artículos en esta venta</div>
                      ) : (
                        bvtaItemsSel.map((it,i)=>(
                          <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:'1px solid var(--bd)'}}>
                            <input type="checkbox" checked={it.checked} style={{width:15,height:15}}
                              id={`bvit-${i}`}
                              onChange={()=>setBvtaItemsSel(p=>p.map((x,idx)=>idx===i?{...x,checked:!x.checked}:x))}/>
                            <label htmlFor={`bvit-${i}`} style={{flex:1,cursor:'pointer',fontSize:12}}>
                              <strong>{it.nombre}</strong>{it.talle?` — Talle ${it.talle}`:''}
                            </label>
                            <div style={{display:'flex',alignItems:'center',gap:4}}>
                              <span style={{fontSize:11,color:'var(--mu)'}}>Cant:</span>
                              <input type="number" id={`bvit-q-${i}`} value={it.cantidad} min="1" max={it.cantidad_max || it.cantidad}
                                disabled={!it.checked}
                                onChange={(e)=>setBvtaItemsSel(p=>p.map((x,idx)=>idx===i?{...x,cantidad:e.target.value}:x))}
                                style={{width:55,padding:'3px 6px',border:'1px solid var(--bd)',borderRadius:6,fontSize:12,textAlign:'center'}}/>
                              <span style={{fontSize:10,color:'var(--mu)'}}>/ {it.cantidad}</span>
                            </div>
                            <span style={{fontSize:12,fontWeight:700,minWidth:60,textAlign:'right'}}>
                              {fmt((parseFloat(it.precio)||0)*(parseInt(it.cantidad)||1))}
                            </span>
                          </div>
                        ))
                      )}
                      <div style={{display:'flex',justifyContent:'flex-end',paddingTop:6,fontWeight:700}}>
                        Total: {fmt(bvtaItemsSel.filter(x=>x.checked).reduce((a,x)=>a+(parseFloat(x.precio)||0)*(parseInt(x.cantidad)||1),0))}
                      </div>
                    </>
                  )}
                  <div className="fr" style={{marginTop:10}}>
                    <div className="fg"><label>Fecha entrega estimada</label><input type="date" value={bvtaFecha} onChange={(e)=>setBvtaFecha(e.target.value)}/></div>
                    <div className="fg"><label>Estado inicial</label>
                      <select value={bvtaEstado} onChange={(e)=>setBvtaEstado(e.target.value)}>
                        <option value="pendiente">En preparación</option>
                        <option value="listo">Listo para entregar</option>
                      </select>
                    </div>
                  </div>
                  <div className="fr">
                    <div className="fg"><label>🏪 Sucursal de cobro</label>
                      <select value={bvtaSucCobro} onChange={(e)=>setBvtaSucCobro(e.target.value)}>
                        {allSucs.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>
                    <div className="fg"><label>📦 Sucursal de entrega</label>
                      <select value={bvtaSucEntrega} onChange={(e)=>setBvtaSucEntrega(e.target.value)}>
                        {allSucs.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="fg"><label>📝 Observaciones / Personalización</label><textarea value={bvtaObs} onChange={(e)=>setBvtaObs(e.target.value)} rows={2} placeholder="Bordado, color, medidas especiales..." style={{resize:'vertical'}}/></div>
                  <div style={{display:'flex',gap:8,marginTop:4}}>
                    <button type="button" className="btn btn-secondary" onClick={()=>setVentaSeleccionada(null)}>← Volver</button>
                    <button type="button" className="btn btn-primary" onClick={crearDesdeVenta} disabled={saving || !bvtaItemsSel.some(x=>x.checked)} style={{flex:1,justifyContent:'center'}}>
                      {saving?<><span className="spinner" style={{width:14,height:14}}/> Creando...</>:'✅ Crear pedido'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        onConfirm={async () => { try { await api('DELETE', '/pendientes/' + confirm); toast('Pedido eliminado', 'ok'); load() } catch (e) { toast(e.message, 'err') } }}
        title="Eliminar pedido" message="¿Eliminás este pedido?" confirmLabel="Sí, eliminar" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CUENTA CORRIENTE
// ═══════════════════════════════════════════════════════════════
export function CtaCte() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion } = useApp()

  const [cuentas, setCuentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroDeuda, setFiltroDeuda] = useState('')
  const [page, setPage] = useState(1)
  const [modalPago, setModalPago] = useState(null)   // {cliente}
  const [modalHist, setModalHist] = useState(null)   // {cliente}
  const [historial, setHistorial] = useState([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [formPago, setFormPago] = useState({ monto: '', obs: '', metodo: 'efectivo', nro_comprobante: '' })
  const [saving, setSaving] = useState(false)
  const [dupConfirm, setDupConfirm] = useState(null)

  const load = useCallback(async () => {
    try {
      // Endpoint real: GET /ctacte/?todas=true  (no /resumen)
      const data = await api('GET', `/ctacte/?todas=true`)
      setCuentas(Array.isArray(data) ? data : [])
    } catch { toast('Error cargando cuenta corriente', 'err') }
    finally { setLoading(false) }
  }, [sucSesion])

  useEffect(() => { load() }, [load])
  function exportarCtacte() {
    const headers = ['Cliente', 'Tel', 'Email', 'DNI', 'Lista', 'Saldo', 'Última actualización']
    const rows = filtered.map(c => [
      c.nombre || '', c.tel || '', c.email || '', c.dni || '',
      'Lista ' + (c.lista || 1), c.saldo || 0, c.ultima_act || ''
    ])
    exportExcel('cuentas_corrientes', headers, rows, 'CtaCte')
    toast('📊 Excel exportado', 'ok')
  }


  async function loadHistorial(cliId) {
    setLoadingHist(true)
    try {
      // Endpoint real: GET /ctacte/?cli_id=X  devuelve { movimientos, saldo }
      const data = await api('GET', `/ctacte/?cli_id=${cliId}`)
      setHistorial(Array.isArray(data?.movimientos) ? data.movimientos : [])
    } catch { toast('Error cargando historial', 'err') }
    finally { setLoadingHist(false) }
  }

  async function registrarPago() {
    if (!formPago.monto) { toast('Ingresá el monto', 'err'); return }
    setSaving(true)
    try {
      const body = {
        cliente_id: modalPago.id,
        suc_id: sucSesion,
        monto: parseFloat(formPago.monto),
        concepto: formPago.obs || 'Pago cuenta corriente',
        pago_metodo: formPago.metodo,
      }
      if (formPago.metodo === 'transferencia' && formPago.nro_comprobante) {
        body.nro_comprobante = formPago.nro_comprobante
      }
      const r = await api('POST', '/ctacte/pago', body)

      if (r.advertencia) {
        setDupConfirm({
          duplicados: r.duplicados || [],
          permite_confirmar: r.permite_confirmar,
          body
        })
        setSaving(false)
        return
      }

      toast('Pago registrado', 'ok')
      setModalPago(null); setFormPago({ monto: '', obs: '', metodo: 'efectivo', nro_comprobante: '' }); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  const filtered = useMemo(() => {
    let list = cuentas
    if (search) { const q = search.toLowerCase(); list = list.filter((c) => (c.nombre + ' ' + c.apellido + ' ' + c.tel).toLowerCase().includes(q)) }
    if (filtroDeuda === 'deuda') list = list.filter((c) => (c.saldo || 0) > 0)
    if (filtroDeuda === 'favor') list = list.filter((c) => (c.saldo || 0) < 0)
    return list.sort((a, b) => (b.saldo || 0) - (a.saldo || 0))
  }, [cuentas, search, filtroDeuda])

  const totales = useMemo(() => ({
    total_deuda: filtered.filter((c) => c.saldo > 0).reduce((a, c) => a + c.saldo, 0),
    clientes_con_deuda: filtered.filter((c) => c.saldo > 0).length,
  }), [filtered])

  if (loading) return <Loader />

  return (
    <div>
      <div className="grid-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
        <div className="kpi-card" style={{ borderLeft: '3px solid var(--bad)' }}>
          <div className="kpi-label">Deuda total</div>
          <div className="kpi-value" style={{ color: 'var(--bad)' }}>{fmt(totales.total_deuda)}</div>
          <div className="kpi-sub">{totales.clientes_con_deuda} clientes</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Clientes habilitados</div>
          <div className="kpi-value">{cuentas.length}</div>
        </div>
      </div>

      <PageHeader title="📒 Cuenta Corriente">
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cliente..." style={{ width: 220 }} />
        <select style={selStyle} value={filtroDeuda} onChange={(e) => { setFiltroDeuda(e.target.value); setPage(1) }}>
          <option value="">Todos</option>
          <option value="deuda">Con deuda</option>
          <option value="favor">A favor</option>
        </select>
      </PageHeader>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Teléfono</th><th style={{ textAlign: 'right' }}>Saldo</th><th style={{ textAlign: 'right' }}>Límite</th><th>Última compra</th><th style={{ width: 120 }}></th></tr></thead>
            <tbody>
              {filtered.slice((page-1)*PER_PAGE, page*PER_PAGE).length === 0
                ? <EmptyRow cols={6} icon="📒" text="Sin cuentas corrientes" />
                : filtered.slice((page-1)*PER_PAGE, page*PER_PAGE).map((c) => (
                  <tr key={c.id}>
                    <td data-label="Cliente"><div style={{ fontWeight: 600 }}>{c.nombre} {c.apellido || ''}</div></td>
                    <td data-label="Teléfono" style={{ fontSize: 12 }}>{c.tel || '—'}</td>
                    <td data-label="Saldo" style={{ textAlign: 'right', fontWeight: 800, color: c.saldo > 0 ? 'var(--bad)' : c.saldo < 0 ? 'var(--ok)' : 'var(--mu)' }}>
                      {c.saldo > 0 ? `Debe ${fmt(c.saldo)}` : c.saldo < 0 ? `A favor ${fmt(-c.saldo)}` : 'Al día'}
                    </td>
                    <td data-label="Límite" style={{ textAlign: 'right', fontSize: 12 }}>{c.limite_ctacte ? fmt(c.limite_ctacte) : 'Sin límite'}</td>
                    <td data-label="Última compra" style={{ fontSize: 12, color: 'var(--mu)' }}>{fmtDate(c.ultima_compra)}</td>
                    <td data-label="">
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-icon btn-sm" title="Historial" onClick={() => { setModalHist(c); loadHistorial(c.id) }}>📋</button>
                        {(c.saldo || 0) > 0 && (
                          <button type="button" className="btn btn-sm" style={{ background: '#dcfce7', color: '#15803d', border: 'none' }} onClick={() => { setModalPago(c); setFormPago({ monto: String(Math.max(0, c.saldo || 0)), obs: '', metodo: 'efectivo', nro_comprobante: '' }) }}>💵 Cobrar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 16px' }}><Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} /></div>
      </div>

      {/* Pago modal */}
      <Modal open={!!modalPago} onClose={() => setModalPago(null)} size="sm"
        title={`💵 Registrar pago — ${modalPago?.nombre}`}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setModalPago(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" style={{ background: 'var(--ok)' }} onClick={registrarPago} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : '✅ Registrar pago'}
          </button>
        </>}
      >
        {modalPago && (
          <>
            <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--mu)' }}>Saldo actual</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: (modalPago.saldo || 0) > 0 ? 'var(--bad)' : 'var(--ok)' }}>
                {(modalPago.saldo || 0) > 0 ? `Debe ${fmt(modalPago.saldo)}` : 'Al día'}
              </div>
            </div>
            <Field label="Monto del pago *"><input type="number" value={formPago.monto} onChange={(e) => setFormPago((p) => ({ ...p, monto: e.target.value }))} min="0" style={{ fontSize: 18, fontWeight: 700, textAlign: 'center' }} /></Field>
            <Field label="Método">
              <select value={formPago.metodo} onChange={(e) => setFormPago((p) => ({ ...p, metodo: e.target.value }))}>
                <option value="efectivo">💵 Efectivo</option>
                <option value="transferencia">🏦 Transferencia</option>
                <option value="debito">💳 Débito</option>
                <option value="cheque">📝 Cheque</option>
              </select>
            </Field>
            <Field label="Observaciones"><input value={formPago.obs} onChange={(e) => setFormPago((p) => ({ ...p, obs: e.target.value }))} placeholder="Notas opcionales..." /></Field>
            {formPago.metodo === 'transferencia' && (
              <Field label="N° Comprobante" required><input value={formPago.nro_comprobante} onChange={(e) => setFormPago((p) => ({ ...p, nro_comprobante: e.target.value }))} placeholder="N° comprobante de transferencia" style={{ border: '1.5px solid #f59e0b', fontWeight: 600 }} /></Field>
            )}
          </>
        )}
      </Modal>

      {/* Historial modal */}
      <Modal open={!!modalHist} onClose={() => setModalHist(null)} title={`📋 Historial — ${modalHist?.nombre}`} size="lg">
        {loadingHist ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" /></div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Debe</th><th style={{ textAlign: 'right' }}>Haber</th><th style={{ textAlign: 'right' }}>Saldo</th></tr></thead>
              <tbody>
                {historial.length === 0
                  ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--mu)' }}>Sin movimientos</td></tr>
                  : historial.map((h, i) => (
                    <tr key={i}>
                      <td data-label="Fecha" style={{ fontSize: 12 }}>{fmtDate(h.fecha)}</td>
                      <td data-label="Concepto" style={{ fontSize: 13 }}>{h.concepto}</td>
                      <td data-label="Debe" style={{ textAlign: 'right', color: 'var(--bad)', fontWeight: h.debe > 0 ? 600 : 400 }}>{h.debe > 0 ? fmt(h.debe) : '—'}</td>
                      <td data-label="Haber" style={{ textAlign: 'right', color: 'var(--ok)', fontWeight: h.haber > 0 ? 600 : 400 }}>{h.haber > 0 ? fmt(h.haber) : '—'}</td>
                      <td data-label="Saldo" style={{ textAlign: 'right', fontWeight: 700, color: h.saldo > 0 ? 'var(--bad)' : 'var(--ok)' }}>{fmt(h.saldo)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
      {/* Confirm duplicado comprobante */}
      {dupConfirm && (
        <ConfirmDialog
          open={!!dupConfirm}
          onClose={() => setDupConfirm(null)}
          title="Comprobante duplicado"
          danger={false}
          confirmLabel={dupConfirm.permite_confirmar ? 'Confirmar de todas formas' : undefined}
          onConfirm={dupConfirm.permite_confirmar ? async () => {
            const { body } = dupConfirm
            setDupConfirm(null)
            setSaving(true)
            try {
              const r = await api('POST', '/ctacte/pago', { ...body, confirmar_duplicado: true })
              if (r.ok) {
                toast('Pago registrado', 'ok')
                setModalPago(null); setFormPago({ monto: '', obs: '', metodo: 'efectivo', nro_comprobante: '' }); load()
              }
            } catch (e) { toast(e.message, 'err') }
            finally { setSaving(false) }
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

const selStyle = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', cursor: 'pointer', fontSize: 13, background: 'var(--bg)', color: 'var(--tx)' }


