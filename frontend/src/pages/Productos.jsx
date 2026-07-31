import { useState, useEffect, useMemo, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useApp, useToast } from '../store'
import { Modal } from '../components/Modal'
import { SearchBar, PageHeader, Field, ConfirmDialog, EmptyRow, Loader, Pagination } from '../components/UI'
import { exportExcel, importExcel, pickFile } from '../utils/excel'
import { fetchWithCache } from '../hooks/useOfflineCache'

const PER_PAGE = 30
const EMPTY = {
  nombre: '', sku: '', categoria: '', talle: '', color: '', temporada: '',
  costo: '', precio_l1: '', precio_l2: '', precio_l3: '',
  stock_min: '0', stock_max: '0', favorito: false, activo: true,
}
const TALLES = ['XS','S','M','L','XL','XXL','XXXL','0','1','2','3','4','6','8','10','12','14','16','18','20','22','24','NB','0-3m','3-6m','6-12m','12-18m','18-24m','Único']
const CATEGORIAS = ['Remera','Camiseta','Pantalón','Vestido','Falda','Calza','Campera','Enterito','Conjunto','Accesorio','Calzado','Otro']

// Stock para mostrar: usa stock_actual (por suc) o stock_total. Nunca el objeto stock_suc.
function getStock(p, sucId) {
  if (sucId && p.stock_suc && typeof p.stock_suc[sucId] === 'number') return p.stock_suc[sucId]
  if (typeof p.stock_actual === 'number') return p.stock_actual
  if (typeof p.stock === 'number') return p.stock
  if (typeof p.stock_total === 'number') return p.stock_total
  return 0
}

// ── Stock movements sub-component ─────────────────────────────
function MovimientosStock({ prodId, api, allSucs, sucSesion }) {
  const [movs, setMovs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!prodId) return
    const params = sucSesion ? `?suc_id=${sucSesion}` : ''
    api('GET', `/productos/${prodId}/historial${params}`).then((d) => setMovs(Array.isArray(d) ? d : [])).catch(() => setMovs([])).finally(() => setLoading(false))
  }, [prodId, sucSesion])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" /></div>
  if (!movs.length) return <div style={{ textAlign: 'center', padding: 24, color: 'var(--mu)' }}>Sin movimientos registrados</div>

  return (
    <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
      <table>
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Sucursal</th><th style={{ textAlign: 'center' }}>Cant.</th><th>Usuario</th></tr></thead>
        <tbody>
          {movs.slice(0, 50).map((m, i) => (
            <tr key={i}>
              <td data-label="Fecha" style={{ fontSize: 11 }}>{m.fecha ? new Date(m.fecha).toLocaleDateString('es-AR') : '—'}</td>
              <td data-label="Tipo"><span className={`badge ${m.tipo === 'entrada' ? 'badge-green' : m.tipo === 'salida' ? 'badge-red' : 'badge-blue'}`}>{m.tipo}</span></td>
              <td data-label="Motivo" style={{ fontSize: 12 }}>{m.motivo || m.concepto || '—'}</td>
              <td data-label="Sucursal" style={{ fontSize: 12 }}>{(allSucs.find(s => s.id === m.suc_id) || {}).nombre || m.suc_id || '—'}</td>
              <td data-label="Cant." style={{ textAlign: 'center', fontWeight: 700, color: m.tipo === 'entrada' ? 'var(--ok)' : 'var(--bad)' }}>
                {m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '-' : ''}{m.cantidad}
              </td>
              <td data-label="Usuario" style={{ fontSize: 11, color: 'var(--mu)' }}>{m.usuario_nombre || m.usuario || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Productos() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion, allSucs, setProds: setAppProds } = useApp()

  const [prods, setProds] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroStock, setFiltroStock] = useState('')  // 'bajo' | 'sin'
  const [sortBy, setSortBy] = useState('nombre')  // nombre, precio_asc, precio_desc, stock_asc, stock_desc, recientes
  const [bulkPriceModal, setBulkPriceModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)
  const [stockModal, setStockModal] = useState(null)  // {prod, suc_id, actual}
  const [stockDelta, setStockDelta] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [tab, setTab] = useState('datos')  // 'datos' | 'precios' | 'stock'
  const [catModal, setCatModal] = useState(false)
  const [catForm, setCatForm] = useState({nombre:'', icono:'📦'})
  const [catSaving, setCatSaving] = useState(false)
  const [catEdit, setCatEdit] = useState(null)
  const [variants, setVariants] = useState([])
  const [variantModal, setVariantModal] = useState(null)
  const [varForm, setVarForm] = useState({nombre:'', sku:'', atributos:'{}', costo:'', precio_l1:'', precio_l2:'', precio_l3:''})
  const [varSaving, setVarSaving] = useState(false)
  const [varAttrKeys, setVarAttrKeys] = useState(['talle','color'])

  const [rubroAtributos, setRubroAtributos] = useState([])
  const [rubroNombre, setRubroNombre] = useState('general')

  const loadRubroAttrs = useCallback(async () => {
    try {
      const data = await api('GET', '/productos/rubro-atributos')
      const attrs = data?.atributos || []
      setRubroAtributos(attrs)
      setRubroNombre(data?.rubro || 'general')
      if (attrs.length > 0) {
        setVarAttrKeys(attrs.map(a => a.atributo_key))
      }
    } catch { /* default to talle/color */ }
  }, [api])

  useEffect(() => { loadRubroAttrs() }, [loadRubroAttrs])

  const load = useCallback(async () => {
    try {
      const data = await fetchWithCache('productos', () => api('GET', `/productos?viewer_suc=${sucSesion || ''}`))
      const list = Array.isArray(data) ? data : []
      setProds(list)
      setAppProds(list)
    } catch { toast('Error cargando productos', 'err') }
    finally { setLoading(false) }
  }, [sucSesion])

  useEffect(() => { load() }, [load])

  function exportar() {
    const headers = ['SKU', 'Nombre', 'Categoría', 'Talle', 'Color', 'Precio L1', 'Precio L2', 'Precio L3', 'Costo', 'Stock total', 'Stock mín', 'Activo']
    const rows = filtered.map(p => [
      p.sku || '', p.nombre, p.categoria || '', p.talle || '', p.color || '',
      p.precio_l1 || 0, p.precio_l2 || 0, p.precio_l3 || 0, p.costo || 0,
      p.stock_total ?? 0, p.stock_min || 0, p.activo === false ? 'No' : 'Sí'
    ])
    exportExcel('productos', headers, rows, 'Productos')
    toast('📊 Excel exportado', 'ok')
  }

  async function importar() {
    try {
      const file = await pickFile()
      setImporting(true)
      const rows = await importExcel(file)
      if (!rows.length) { toast('Archivo vacío', 'err'); return }
      let creados = 0, actualizados = 0, errores = 0
      for (const r of rows) {
        try {
          const nombre = r['Nombre'] || r['nombre']
          if (!nombre) { errores++; continue }
          const sku = r['SKU'] || r['sku'] || ''
          const existing = sku ? prods.find(p => p.sku === sku) : null
          const data = {
            nombre: String(nombre).trim(),
            sku: sku ? String(sku).trim() : '',
            categoria: r['Categoría'] || r['categoria'] || '',
            talle: r['Talle'] || r['talle'] || '',
            color: r['Color'] || r['color'] || '',
            precio_l1: parseFloat(r['Precio L1'] || r['precio_l1'] || 0) || 0,
            precio_l2: parseFloat(r['Precio L2'] || r['precio_l2'] || 0) || 0,
            precio_l3: parseFloat(r['Precio L3'] || r['precio_l3'] || 0) || 0,
            costo: parseFloat(r['Costo'] || r['costo'] || 0) || 0,
            stock_min: parseInt(r['Stock mín'] || r['stock_min'] || 0) || 0,
          }
          if (existing) { await api('PUT', '/productos/' + existing.id, data); actualizados++ }
          else { await api('POST', '/productos', data); creados++ }
        } catch { errores++ }
      }
      toast(`📥 Importación: ${creados} creados, ${actualizados} actualizados${errores ? ', ' + errores + ' errores' : ''}`, 'ok')
      load()
    } catch (e) {
      if (e.message !== 'Sin archivo') toast('Error: ' + e.message, 'err')
    } finally { setImporting(false) }
  }


  const categorias = useMemo(() => [...new Set(prods.map((p) => p.categoria).filter(Boolean))].sort(), [prods])

  const filtered = useMemo(() => {
    let list = prods.filter((p) => p.activo !== false)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((p) => (p.nombre + ' ' + p.sku + ' ' + p.categoria + ' ' + p.talle).toLowerCase().includes(q))
    }
    if (filtroCat) list = list.filter((p) => p.categoria === filtroCat)
    if (filtroStock === 'bajo') list = list.filter((p) => getStock(p, sucSesion) <= (p.stock_min || 0) && getStock(p, sucSesion) > 0)
    if (filtroStock === 'sin') list = list.filter((p) => getStock(p, sucSesion) === 0)
    // Sorting
    const sorted = [...list]
    switch (sortBy) {
      case 'precio_asc': sorted.sort((a, b) => (a.precio_l1 || 0) - (b.precio_l1 || 0)); break
      case 'precio_desc': sorted.sort((a, b) => (b.precio_l1 || 0) - (a.precio_l1 || 0)); break
      case 'stock_asc': sorted.sort((a, b) => getStock(a, sucSesion) - getStock(b, sucSesion)); break
      case 'stock_desc': sorted.sort((a, b) => getStock(b, sucSesion) - getStock(a, sucSesion)); break
      case 'recientes': sorted.sort((a, b) => (b.creado || '').localeCompare(a.creado || '')); break
      default: sorted.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    }
    return sorted
  }, [prods, search, filtroCat, filtroStock, sucSesion, sortBy])

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const fmt = (n) => n != null && n !== '' ? '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '—'
  const stockColor = (p) => {
    const s = getStock(p, sucSesion)
    if (s === 0) return 'var(--bad)'
    if (s <= (p.stock_min || 0)) return 'var(--warn)'
    return 'var(--ok)'
  }

  function openNew() { setForm(EMPTY); setTab('datos'); setModal('new') }
  function openEdit(p) {
    const base = {
      nombre: p.nombre || '', sku: p.sku || '', categoria: p.categoria || '',
      costo: p.costo ?? '', precio_l1: p.precio_l1 ?? '', precio_l2: p.precio_l2 ?? '',
      precio_l3: p.precio_l3 ?? '', stock_min: p.stock_min ?? 0, stock_max: p.stock_max ?? 0,
      favorito: !!p.favorito, activo: p.activo !== false,
    }
    // Load dynamic rubro attributes from product data
    for (const attr of rubroAtributos) {
      const key = attr.atributo_key
      base[key] = p.data ? (() => { try { return JSON.parse(p.data)[key] } catch { return '' } })() : (p[key] || '')
    }
    // Fallback for legacy talle/color/temporada
    if (rubroAtributos.length === 0) {
      base.talle = p.talle || ''
      base.color = p.color || ''
      base.temporada = p.temporada || ''
    }
    setForm(base)
    setTab('datos')
    setModal(p)
  }

  async function save() {
    if (!form.nombre.trim()) { toast('El nombre es obligatorio', 'err'); return }
    setSaving(true)
    try {
      const body = {
        ...form,
        costo: form.costo !== '' ? parseFloat(form.costo) : null,
        precio_l1: parseFloat(form.precio_l1) || 0,
        precio_l2: form.precio_l2 !== '' ? parseFloat(form.precio_l2) : null,
        precio_l3: form.precio_l3 !== '' ? parseFloat(form.precio_l3) : null,
        stock_min: parseInt(form.stock_min) || 0,
        stock_max: parseInt(form.stock_max) || 0,
      }
      if (modal === 'new') { await api('POST', '/productos', body); toast('Producto creado', 'ok') }
      else { await api('PUT', '/productos/' + modal.id, body); toast('Producto actualizado', 'ok') }
      setModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function toggleActivo(p) {
    try {
      await api('PUT', '/productos/' + p.id, { activo: !p.activo })
      toast(p.activo ? 'Producto desactivado' : 'Producto activado', 'ok')
      load()
    } catch (e) { toast(e.message, 'err') }
  }

  async function ajustarStock() {
    const delta = parseInt(stockDelta)
    if (isNaN(delta) || delta === 0) { toast('Ingresá una cantidad válida', 'err'); return }
    try {
      await api('POST', `/productos/${stockModal.prod.id}/ajuste`, {
        suc_id: stockModal.suc_id,
        cantidad: Math.abs(delta),
        tipo: delta > 0 ? 'entrada' : 'salida',
        motivo: 'Ajuste manual',
      })
      toast(`Stock ajustado: ${delta > 0 ? '+' : ''}${delta}`, 'ok')
      setStockModal(null); setStockDelta(''); load()
    } catch (e) { toast(e.message, 'err') }
  }

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.type === 'checkbox' ? e.target.checked : e.target.value }))

  // ── Variantes ──
  async function loadVariants(prodId) {
    if (!prodId) return
    try {
      const v = await api('GET', `/productos/${prodId}/variantes`)
      setVariants(Array.isArray(v) ? v : [])
    } catch { setVariants([]) }
  }
  useEffect(() => {
    if (modal && modal !== 'new') loadVariants(modal.id)
    else setVariants([])
  }, [modal])

  function openVariantNew() {
    setVarForm({nombre:'', sku:'', atributos:'{}', costo:'', precio_l1:'', precio_l2:'', precio_l3:''})
    setVarAttrKeys(['talle','color'])
    setVariantModal('new')
  }
  function openVariantEdit(v) {
    let attrs = {}
    try { attrs = typeof v.atributos === 'object' ? v.atributos : JSON.parse(v.atributos || '{}') } catch {}
    setVarForm({nombre:v.nombre||'', sku:v.sku||'', atributos:JSON.stringify(attrs), costo:v.costo??'', precio_l1:v.precio_l1??'', precio_l2:v.precio_l2??'', precio_l3:v.precio_l3??''})
    setVarAttrKeys(Object.keys(attrs).length ? Object.keys(attrs) : ['talle','color'])
    setVariantModal(v)
  }
  async function saveVariant() {
    if (!varForm.nombre.trim()) { toast('Nombre obligatorio', 'err'); return }
    setVarSaving(true)
    try {
      // Parse atributos from form
      let attrs = {}
      try { attrs = JSON.parse(varForm.atributos) } catch {}
      const body = {
        nombre: varForm.nombre.trim(),
        sku: varForm.sku.trim(),
        atributos: attrs,
        costo: varForm.costo !== '' ? parseFloat(varForm.costo) : 0,
        precio_l1: parseFloat(varForm.precio_l1) || 0,
        precio_l2: varForm.precio_l2 !== '' ? parseFloat(varForm.precio_l2) : 0,
        precio_l3: varForm.precio_l3 !== '' ? parseFloat(varForm.precio_l3) : 0,
      }
      const pid = modal.id
      if (variantModal === 'new') {
        await api('POST', `/productos/${pid}/variantes`, body)
        toast('Variante creada', 'ok')
      } else {
        await api('PUT', `/productos/${pid}/variantes/${variantModal.id}`, body)
        toast('Variante actualizada', 'ok')
      }
      setVariantModal(null); loadVariants(pid); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setVarSaving(false) }
  }
  async function deleteVariant(vId) {
    if (!window.confirm('¿Eliminar esta variante?')) return
    try {
      await api('DELETE', `/productos/${modal.id}/variantes/${vId}`)
      toast('Variante eliminada', 'ok')
      loadVariants(modal.id); load()
    } catch (e) { toast(e.message, 'err') }
  }
  function rebuildAttrJSON(keys) {
    let obj = {}
    keys.forEach(k => {
      const v = document.getElementById('attr_'+k)?.value || ''
      if (v) obj[k] = v
    })
    if (!keys.length) { setVarForm(p => ({...p, atributos: '{}'})); return }
    // Get current values from form fields
    const elPrefix = 'attr_'
    keys.forEach(k => {
      const el = document.getElementById(elPrefix + k)
      if (el && el.value) obj[k] = el.value
    })
    setVarForm(p => ({...p, atributos: JSON.stringify(obj)}))
  }

  async function saveCat() {
    if (!catForm.nombre.trim()) { toast('Nombre obligatorio', 'err'); return }
    setCatSaving(true)
    try {
      if (catEdit) {
        await api('PUT', `/productos/categorias/${catEdit.id}`, catForm)
        toast('Categoría actualizada', 'ok')
      } else {
        await api('POST', '/productos/categorias', catForm)
        toast('Categoría creada', 'ok')
      }
      setCatModal(false); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setCatSaving(false) }
  }

  async function deleteCat(id) {
    if (!window.confirm('¿Eliminar esta categoría?')) return
    try {
      await api('DELETE', `/productos/categorias/${id}`)
      toast('Categoría eliminada', 'ok'); load()
    } catch (e) { toast(e.message, 'err') }
  }

  if (loading) return <Loader />

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total productos', value: prods.filter(p=>p.activo!==false).length, icon: '👕' },
          { label: 'Sin stock', value: prods.filter(p=>p.activo!==false&&getStock(p,sucSesion)===0).length, color: 'var(--bad)', icon: '❌' },
          { label: 'Stock bajo', value: prods.filter(p=>p.activo!==false&&getStock(p,sucSesion)>0&&getStock(p,sucSesion)<=(p.stock_min||0)).length, color: 'var(--warn)', icon: '⚠️' },
          { label: 'Favoritos', value: prods.filter(p=>p.favorito).length, color: 'var(--ac)', icon: '⭐' },
        ].map((k) => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ fontSize: 22, color: k.color }}>{k.value}</div>
            <div className="kpi-icon">{k.icon}</div>
          </div>
        ))}
      </div>

      <PageHeader title={`👕 Productos (${filtered.length})`}>
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Nombre, SKU, talle..." style={{ width: 200 }} />
        <select style={selStyle} value={sortBy} onChange={(e) => setSortBy(e.target.value)} title="Ordenar">
          <option value="nombre">A → Z</option>
          <option value="precio_asc">Precio ↑</option>
          <option value="precio_desc">Precio ↓</option>
          <option value="stock_asc">Stock ↑</option>
          <option value="stock_desc">Stock ↓</option>
          <option value="recientes">Más recientes</option>
        </select>
        <select style={selStyle} value={filtroCat} onChange={(e) => { setFiltroCat(e.target.value); setPage(1) }}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="button" className="btn btn-icon btn-sm" onClick={() => { setCatForm({nombre:'', icono:'📦'}); setCatEdit(null); setCatModal(true) }} title="Gestionar categorías">⚙️</button>
        <select style={selStyle} value={filtroStock} onChange={(e) => { setFiltroStock(e.target.value); setPage(1) }}>
          <option value="">Todo el stock</option>
          <option value="bajo">Stock bajo</option>
          <option value="sin">Sin stock</option>
        </select>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBulkPriceModal(true)} title="Actualizar precios masivos">📈 Precios</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={exportar}>📊 Excel</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={importar} disabled={importing}>📥 Importar</button>
        <button type="button" className="btn btn-primary" onClick={openNew}>+ Nuevo</button>
      </PageHeader>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Producto</th><th>SKU</th><th>Talle</th><th>Categoría</th>
              <th style={{ textAlign: 'right' }}>Precio L1</th>
              <th style={{ textAlign: 'center' }}>Stock</th>
              <th style={{ width: 100 }}></th>
            </tr></thead>
            <tbody>
              {paginated.length === 0
                ? <EmptyRow cols={7} icon="👕" text="Sin productos. Creá el primero con '+ Nuevo'" />
                : paginated.map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer', opacity: p.activo === false ? .5 : 1 }} onClick={() => openEdit(p)}>
                    <td data-label="Producto">
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.favorito && <span title="Favorito">⭐</span>}
                        {p.nombre}
                        {p.num_variantes > 0 && (
                          <span className="badge badge-purple" style={{ fontSize: 10, padding: '0 6px' }}>
                            {p.num_variantes} vars
                          </span>
                        )}
                      </div>
                      {p.color && <div style={{ fontSize: 11, color: 'var(--mu)' }}>{p.color}</div>}
                    </td>
                    <td data-label="SKU" style={{ fontSize: 12, fontFamily: 'monospace' }}>{p.sku || '—'}</td>
                    <td data-label="Talle" style={{ fontSize: 12 }}>{p.talle || '—'}</td>
                    <td data-label="Categoría" style={{ fontSize: 12 }}>{p.categoria || '—'}</td>
                    <td data-label="Precio L1" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(p.precio_l1)}</td>
                    <td data-label="Stock" style={{ textAlign: 'center' }}>
                      <button
                        type="button" className="btn btn-sm"
                        style={{ fontWeight: 700, color: stockColor(p), background: 'transparent', border: `1.5px solid ${stockColor(p)}`, minWidth: 50 }}
                        onClick={(e) => { e.stopPropagation(); setStockModal({ prod: p, suc_id: sucSesion, actual: getStock(p) }); setStockDelta('') }}
                        title="Ajustar stock"
                      >
                        {getStock(p)}
                      </button>
                      {p.stock_suc && allSucs.length > 1 && (
                        <div style={{ fontSize: 10, color: 'var(--mu)', marginTop: 2, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                          {allSucs.filter(s => p.stock_suc[s.id] !== undefined).map(s => (
                            <span key={s.id} style={{
                              padding: '0 4px', borderRadius: 3,
                              color: (p.stock_suc[s.id] || 0) <= 0 ? 'var(--bad)' : (p.stock_suc[s.id] || 0) <= (p.stock_min || 0) ? 'var(--warn)' : undefined
                            }}>
                              {s.nombre.split(' ')[0]}: {p.stock_suc[s.id] ?? 0}
                            </span>
                          ))}
                          {typeof p.stock_total === 'number' && (
                            <span style={{ fontWeight: 600 }}>Total: {p.stock_total}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-icon btn-sm" title={p.activo === false ? 'Activar' : 'Desactivar'} onClick={() => toggleActivo(p)}>{p.activo === false ? '✅' : '🚫'}</button>
                        <button type="button" className="btn btn-icon btn-sm" title="Eliminar" onClick={() => setConfirm(p.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 16px' }}><Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} /></div>
      </div>

      {/* Product modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="lg"
        title={modal === 'new' ? '+ Nuevo producto' : `Editar: ${modal?.nombre}`}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : '💾 Guardar'}
          </button>
        </>}
      >
        {/* Tabs inside modal */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--bd)', paddingBottom: 8 }}>
          {[['datos', '📋 Datos'], ['precios', '💰 Precios'], ['variantes', '🔀 Variantes'], ['stock', '📦 Stock'], ['movs', '📊 Movimientos']].map(([key, label]) => (
            <button type="button" key={key} className={`btn btn-sm ${tab === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>

        {tab === 'datos' && (
          <>
            <div className="fr">
              <Field label="Nombre *"><input value={form.nombre} onChange={set('nombre')} placeholder="Nombre del producto" /></Field>
              <Field label="SKU / Código"><input value={form.sku} onChange={set('sku')} placeholder="Código de barras o SKU" style={{ fontFamily: 'monospace' }} /></Field>
            </div>
            <div className="fr">
              <Field label="Categoría">
                <input value={form.categoria} onChange={set('categoria')} list="cat-opts" placeholder="Ej: Remera" />
                <datalist id="cat-opts">{[...CATEGORIAS, ...categorias].map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              {rubroAtributos.length > 0 ? (
                rubroAtributos.slice(0, 1).map(attr => (
                  attr.tipo === 'select' ? (
                    <Field key={attr.atributo_key} label={attr.atributo_label}>
                      <input value={form[attr.atributo_key] || ''} onChange={set(attr.atributo_key)} list={`${attr.atributo_key}-opts`} placeholder={`Ej: ${attr.opciones?.[0] || attr.atributo_label}`} />
                      <datalist id={`${attr.atributo_key}-opts`}>{(attr.opciones || []).map((o) => <option key={o} value={o} />)}</datalist>
                    </Field>
                  ) : (
                    <Field key={attr.atributo_key} label={attr.atributo_label}>
                      <input type={attr.tipo} value={form[attr.atributo_key] || ''} onChange={set(attr.atributo_key)} placeholder={`Ej: ${attr.atributo_label}`} />
                    </Field>
                  )
                ))
              ) : (
                <Field label="Talle">
                  <input value={form.talle} onChange={set('talle')} list="talle-opts" placeholder="Ej: M" />
                  <datalist id="talle-opts">{TALLES.map((t) => <option key={t} value={t} />)}</datalist>
                </Field>
              )}
            </div>
            {rubroAtributos.length > 1 ? (
              <div className="fr">
                {rubroAtributos.slice(1, 3).map(attr => (
                  attr.tipo === 'select' ? (
                    <Field key={attr.atributo_key} label={attr.atributo_label}>
                      <input value={form[attr.atributo_key] || ''} onChange={set(attr.atributo_key)} list={`${attr.atributo_key}-opts`} placeholder={`Ej: ${attr.opciones?.[0] || attr.atributo_label}`} />
                      <datalist id={`${attr.atributo_key}-opts`}>{(attr.opciones || []).map((o) => <option key={o} value={o} />)}</datalist>
                    </Field>
                  ) : (
                    <Field key={attr.atributo_key} label={attr.atributo_label}>
                      <input type={attr.tipo} value={form[attr.atributo_key] || ''} onChange={set(attr.atributo_key)} placeholder={`Ej: ${attr.atributo_label}`} />
                    </Field>
                  )
                ))}
                {rubroAtributos.length === 2 && <div style={{ flex: 1 }} />}
              </div>
            ) : rubroAtributos.length === 0 && (
              <div className="fr">
                <Field label="Color"><input value={form.color} onChange={set('color')} placeholder="Ej: Azul marino" /></Field>
                <Field label="Temporada"><input value={form.temporada} onChange={set('temporada')} placeholder="Ej: Verano 2025" /></Field>
              </div>
            )}
            {rubroAtributos.length > 2 && (
              <div className="fr">
                {rubroAtributos.slice(3).map(attr => (
                  attr.tipo === 'select' ? (
                    <Field key={attr.atributo_key} label={attr.atributo_label}>
                      <input value={form[attr.atributo_key] || ''} onChange={set(attr.atributo_key)} list={`${attr.atributo_key}-opts`} placeholder={`Ej: ${attr.opciones?.[0] || attr.atributo_label}`} />
                      <datalist id={`${attr.atributo_key}-opts`}>{(attr.opciones || []).map((o) => <option key={o} value={o} />)}</datalist>
                    </Field>
                  ) : (
                    <Field key={attr.atributo_key} label={attr.atributo_label}>
                      <input type={attr.tipo} value={form[attr.atributo_key] || ''} onChange={set(attr.atributo_key)} placeholder={`Ej: ${attr.atributo_label}`} />
                    </Field>
                  )
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form.favorito} onChange={set('favorito')} style={{ width: 16, height: 16 }} />
                ⭐ Favorito (aparece en inicio del POS)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form.activo} onChange={set('activo')} style={{ width: 16, height: 16 }} />
                ✅ Activo
              </label>
            </div>
          </>
        )}

        {tab === 'precios' && (
          <>
            <div className="fr">
              <Field label="Costo"><input type="number" value={form.costo} onChange={set('costo')} placeholder="0.00" min="0" /></Field>
              <Field label="Precio Lista 1 *"><input type="number" value={form.precio_l1} onChange={set('precio_l1')} placeholder="0.00" min="0" /></Field>
            </div>
            <div className="fr">
              <Field label="Precio Lista 2"><input type="number" value={form.precio_l2} onChange={set('precio_l2')} placeholder="0.00 (opcional)" min="0" /></Field>
              <Field label="Precio Lista 3"><input type="number" value={form.precio_l3} onChange={set('precio_l3')} placeholder="0.00 (opcional)" min="0" /></Field>
            </div>
            {form.costo && form.precio_l1 && (
              <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--mu)' }}>
                Margen: <strong style={{ color: 'var(--ok)' }}>{(((form.precio_l1 - form.costo) / form.costo) * 100).toFixed(1)}%</strong>
              </div>
            )}
          </>
        )}

        {tab === 'variantes' && modal !== 'new' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--mu)' }}>
                {variants.length} variante(s) — cada una puede tener talle, color y precio propio
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={openVariantNew}>+ Variante</button>
            </div>
            {variants.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--mu)' }}>
                Sin variantes. Usá variantes cuando un mismo producto tenga distintos talles, colores, pesos, etc.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {variants.map(v => {
                  let attrs = {}
                  try { attrs = typeof v.atributos === 'object' ? v.atributos : JSON.parse(v.atributos || '{}') } catch {}
                  const attrStr = Object.entries(attrs).map(([k,val]) => `${k}: ${val}`).join(' · ')
                  return (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{v.nombre || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--mu)' }}>
                          {attrStr && <span>{attrStr} · </span>}
                          {v.sku && <span style={{ fontFamily: 'monospace' }}>SKU: {v.sku} · </span>}
                          {v.precio_l1 > 0 && <>$ {Number(v.precio_l1).toLocaleString('es-AR')}</>}
                        </div>
                        {v.stock_suc && allSucs.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            {allSucs.map(s => {
                              const st = (v.stock_suc && v.stock_suc[s.id]) ?? 0
                              return (
                                <span key={s.id} style={{ fontSize: 10, padding: '0 6px', borderRadius: 4, background: st <= 0 ? '#fee2e2' : '#dcfce7', color: st <= 0 ? '#dc2626' : '#16a34a' }}>
                                  {s.nombre.split(' ')[0]}: {st}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <button type="button" className="btn btn-icon btn-sm" title="Editar" onClick={() => openVariantEdit(v)}>✏️</button>
                      <button type="button" className="btn btn-icon btn-sm" title="Eliminar" onClick={() => deleteVariant(v.id)}>🗑</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        {tab === 'stock' && (
          <>
            <div className="fr">
              <Field label="Stock mínimo (alerta)"><input type="number" value={form.stock_min} onChange={set('stock_min')} min="0" /></Field>
              <Field label="Stock máximo"><input type="number" value={form.stock_max} onChange={set('stock_max')} min="0" /></Field>
            </div>
            {/* Stock por sucursal */}
            {modal !== 'new' && modal?.stock_suc && typeof modal.stock_suc === 'object' && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 8 }}>Stock por sucursal</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {allSucs.map((s) => {
                    const st = (modal.stock_suc && modal.stock_suc[s.id]) ?? 0
                    return (
                      <div key={s.id} style={{ background: 'var(--sf)', borderRadius: 8, padding: '8px 14px', minWidth: 100, textAlign: 'center', border: `1.5px solid ${st <= 0 ? 'var(--bad)' : st <= (modal.stock_min || 0) ? 'var(--warn)' : 'var(--bd)'}` }}>
                        <div style={{ fontSize: 11, color: 'var(--mu)' }}>{s.nombre}</div>
                        <div style={{ fontWeight: 800, fontSize: 20, color: st <= 0 ? 'var(--bad)' : st <= (modal.stock_min || 0) ? 'var(--warn)' : 'var(--ok)' }}>{st}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div style={{ background: 'rgba(249,115,22,.06)', border: '1px solid rgba(249,115,22,.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--mu)', marginTop: 8 }}>
              💡 Para ajustar el stock real hacé click en el número de stock en la tabla principal.
            </div>
          </>
        )}
        {tab === 'movs' && modal !== 'new' && (
          <MovimientosStock prodId={modal?.id} api={api} allSucs={allSucs} sucSesion={sucSesion} />
        )}
      </Modal>

      {/* Stock adjust modal */}
      <Modal open={!!stockModal} onClose={() => setStockModal(null)} size="sm"
        title={`Ajustar stock — ${stockModal?.prod?.nombre}`}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setStockModal(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={ajustarStock}>✅ Aplicar</button>
        </>}
      >
        {stockModal && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--mu)' }}>Stock actual</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{stockModal.actual}</div>
            </div>
            <Field label="Ajuste (+ para agregar, - para restar)">
              <input type="number" value={stockDelta} onChange={(e) => setStockDelta(e.target.value)} placeholder="Ej: +10 o -3" style={{ textAlign: 'center', fontSize: 18, fontWeight: 700 }} />
            </Field>
            {stockDelta && !isNaN(parseInt(stockDelta)) && (
              <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--mu)', marginTop: 8 }}>
                Nuevo stock: <strong style={{ color: 'var(--tx)', fontSize: 18 }}>{stockModal.actual + parseInt(stockDelta)}</strong>
              </div>
            )}
            <Field label="Sucursal">
              <select value={stockModal.suc_id || ''} onChange={(e) => setStockModal((s) => ({ ...s, suc_id: e.target.value }))}>
                {allSucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Field>
          </>
        )}
      </Modal>

      {/* Modal: Variante */}
      <Modal open={!!variantModal} onClose={() => setVariantModal(null)} size="md"
        title={variantModal === 'new' ? '➕ Nueva variante' : `Editar: ${variantModal?.nombre}`}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setVariantModal(null)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={saveVariant} disabled={varSaving}>
            {varSaving ? 'Guardando...' : '💾 Guardar'}
          </button>
        </>}
      >
        <Field label="Nombre de la variante"><input value={varForm.nombre} onChange={e => setVarForm(p=>({...p, nombre: e.target.value}))} placeholder="Ej: Body 0-3m Blanco" /></Field>
        <Field label="SKU / Código"><input value={varForm.sku} onChange={e => setVarForm(p=>({...p, sku: e.target.value}))} placeholder="Código único" style={{fontFamily:'monospace'}} /></Field>

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', marginTop: 12, marginBottom: 8, textTransform: 'uppercase' }}>
          Atributos (talle, color, peso, etc.)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {varAttrKeys.map((k, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={k}
                onChange={e => {
                  const keys = [...varAttrKeys]
                  keys[i] = e.target.value
                  setVarAttrKeys(keys)
                }}
                placeholder="Ej: talle"
                style={{ width: 100, fontFamily: 'monospace', fontSize: 12 }}
              />
              <input
                id={'attr_'+k}
                defaultValue={(() => { try { return JSON.parse(varForm.atributos||'{}')[k] || '' } catch { return '' } })()}
                onBlur={e => {
                  let attrs = {}
                  try { attrs = JSON.parse(varForm.atributos || '{}') } catch {}
                  attrs[k] = e.target.value
                  setVarForm(p => ({...p, atributos: JSON.stringify(attrs)}))
                }}
                placeholder="Valor (ej: M)"
                style={{ flex: 1, fontSize: 12 }}
              />
              {varAttrKeys.length > 1 && (
                <button type="button" className="btn btn-icon btn-sm" onClick={() => {
                  const keys = varAttrKeys.filter((_, idx) => idx !== i)
                  setVarAttrKeys(keys)
                  let attrs = {}
                  try { attrs = JSON.parse(varForm.atributos || '{}') } catch {}
                  delete attrs[k]
                  setVarForm(p => ({...p, atributos: JSON.stringify(attrs)}))
                }}>✕</button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setVarAttrKeys([...varAttrKeys, ''])}>
            + Atributo
          </button>
        </div>

        <div style={{ marginTop: 16, borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', marginBottom: 8, textTransform: 'uppercase' }}>Precios y costo</div>
          <div className="fr">
            <Field label="Costo"><input type="number" value={varForm.costo} onChange={e => setVarForm(p=>({...p, costo: e.target.value}))} min="0" /></Field>
            <Field label="Precio L1"><input type="number" value={varForm.precio_l1} onChange={e => setVarForm(p=>({...p, precio_l1: e.target.value}))} min="0" /></Field>
          </div>
          <div className="fr">
            <Field label="Precio L2"><input type="number" value={varForm.precio_l2} onChange={e => setVarForm(p=>({...p, precio_l2: e.target.value}))} min="0" /></Field>
            <Field label="Precio L3"><input type="number" value={varForm.precio_l3} onChange={e => setVarForm(p=>({...p, precio_l3: e.target.value}))} min="0" /></Field>
          </div>
        </div>
      </Modal>

      {/* Modal: Actualizar precios masivos */}
      {bulkPriceModal && (
        <BulkPriceModal
          categorias={categorias}
          prods={prods}
          allSucs={allSucs}
          sucSesion={sucSesion}
          api={api}
          toast={toast}
          onClose={() => setBulkPriceModal(false)}
          onDone={() => { setBulkPriceModal(false); load() }}
        />
      )}

      {/* Modal: Gestionar categorías */}
      <Modal open={catModal} onClose={() => setCatModal(false)} size="sm"
        title={catEdit ? 'Editar categoría' : '➕ Nueva categoría'}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setCatModal(false)}>Cerrar</button>
          <button type="button" className="btn btn-primary" onClick={saveCat} disabled={catSaving}>
            {catSaving ? 'Guardando...' : catEdit ? '💾 Guardar' : '➕ Crear'}
          </button>
        </>}
      >
        <Field label="Nombre"><input value={catForm.nombre} onChange={e => setCatForm(p=>({...p, nombre: e.target.value}))} placeholder="Ej: Remera" /></Field>
        <Field label="Icono"><input value={catForm.icono} onChange={e => setCatForm(p=>({...p, icono: e.target.value}))} placeholder="📦" style={{fontSize:20,textAlign:'center'}} maxLength={2} /></Field>
        {!catEdit && categorias.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', marginBottom: 8, textTransform: 'uppercase' }}>Categorías existentes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {categorias.map(c => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--sf)', borderRadius: 6, fontSize: 13 }}>
                  <span style={{ flex: 1 }}>{c}</span>
                  <button type="button" className="btn btn-icon btn-sm" title="Editar" onClick={async () => {
                    const cats = await api('GET', '/productos/categorias/list').catch(() => [])
                    const found = Array.isArray(cats) ? cats.find(x => x.nombre === c) : null
                    if (found) { setCatEdit(found); setCatForm({ nombre: found.nombre, icono: found.icono || '📦' }) }
                  }}>✏️</button>
                  <button type="button" className="btn btn-icon btn-sm" title="Eliminar" onClick={() => deleteCat(c)}>🗑</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        onConfirm={async () => { try { await api('DELETE', '/productos/' + confirm); toast('Producto eliminado', 'ok'); load() } catch (e) { toast(e.message, 'err') } }}
        title="Eliminar producto" message="¿Eliminás este producto? Se eliminará de todos los listados." confirmLabel="Sí, eliminar" />
    </div>
  )
}

// ── Modal de actualización masiva de precios ────────────────────
function BulkPriceModal({ categorias, prods, allSucs, sucSesion, api, toast, onClose, onDone }) {
  const [filtCat, setFiltCat] = useState('')
  const [filtSuc, setFiltSuc] = useState('')
  const [lista, setLista] = useState('all')      // 'all' | '1' | '2' | '3'
  const [tipoAjuste, setTipoAjuste] = useState('aumento')  // aumento | descuento | fijo
  const [valor, setValor] = useState('10')
  const [redondear, setRedondear] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const afectados = prods.filter(p => p.activo !== false && (!filtCat || p.categoria === filtCat))
  const val = parseFloat(valor) || 0

  function nuevoPrecio(actual) {
    let nuevo
    if (tipoAjuste === 'aumento') nuevo = actual * (1 + val / 100)
    else if (tipoAjuste === 'descuento') nuevo = actual * (1 - val / 100)
    else nuevo = val   // fijo
    if (redondear) nuevo = Math.round(nuevo / 50) * 50
    return Math.max(0, Math.round(nuevo))
  }

  const listas = lista === 'all' ? ['precio_l1', 'precio_l2', 'precio_l3'] : ['precio_l' + lista]

  async function aplicar() {
    if (!afectados.length) { toast('Sin productos en esta categoría', 'err'); return }
    if (!window.confirm(`Aplicar ${tipoAjuste === 'fijo' ? 'precio fijo $' + val : (tipoAjuste === 'aumento' ? '+' : '-') + val + '%'} a ${afectados.length} producto(s)?`)) return

    setSaving(true)
    let ok = 0, fail = 0
    for (const p of afectados) {
      try {
        const updates = {}
        listas.forEach(L => {
          const actual = parseFloat(p[L]) || 0
          if (actual > 0 || tipoAjuste === 'fijo') updates[L] = nuevoPrecio(actual)
        })
        await api('PUT', '/productos/' + p.id, updates)
        ok++
      } catch { fail++ }
    }
    toast(`✅ ${ok} actualizados${fail ? ` (${fail} errores)` : ''}`, 'ok')
    setSaving(false)
    onDone()
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h3>📈 Actualizar precios masivamente</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--mu)' }}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 14 }}>
            Aplicá un porcentaje de aumento/descuento o un precio fijo a todos los productos. Filtrá por categoría si querés.
          </div>

          <div className="fr">
            <div className="fg">
              <label>Categoría (vacío = todas)</label>
              <select value={filtCat} onChange={e => setFiltCat(e.target.value)}>
                <option value="">Todas las categorías</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Sucursal</label>
              <select value={filtSuc} onChange={e => setFiltSuc(e.target.value)}>
                <option value="">Todas las sucursales</option>
                {allSucs.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="fr">
            <div className="fg">
              <label>Lista de precios</label>
              <select value={lista} onChange={e => setLista(e.target.value)}>
                <option value="all">Todas las listas</option>
                <option value="1">Lista 1 — Público</option>
                <option value="2">Lista 2 — Frecuente</option>
                <option value="3">Lista 3 — Mayorista</option>
              </select>
            </div>
            <div className="fg">
              <label>Tipo de ajuste</label>
              <select value={tipoAjuste} onChange={e => setTipoAjuste(e.target.value)}>
                <option value="aumento">📈 Aumento %</option>
                <option value="descuento">📉 Descuento %</option>
                <option value="fijo">💲 Precio fijo (Lista 1)</option>
              </select>
            </div>
          </div>

          <div className="fg">
            <label>{tipoAjuste === 'fijo' ? 'Precio fijo ($)' : 'Porcentaje (%)'}</label>
            <input type="number" value={valor} onChange={e => setValor(e.target.value)} min="0" step="0.1" />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '8px 12px', background: 'var(--sf)', borderRadius: 8 }}>
            <input type="checkbox" checked={redondear} onChange={e => setRedondear(e.target.checked)} style={{ width: 16, height: 16 }} />
            Redondear a múltiplo de $50
          </label>

          {showPreview && afectados.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--sf)', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mu)', marginBottom: 6 }}>Vista previa ({afectados.length} productos)</div>
              {afectados.slice(0, 10).map(p => {
                const actual = p.precio_l1 || 0
                const nuevo = nuevoPrecio(actual)
                return (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--bd)' }}>
                    <span>{p.nombre}{p.talle ? ` T:${p.talle}` : ''}</span>
                    <span><span style={{ color: 'var(--mu)' }}>${actual.toLocaleString('es-AR')}</span> → <strong style={{ color: nuevo > actual ? 'var(--ok)' : 'var(--bad)' }}>${nuevo.toLocaleString('es-AR')}</strong></span>
                  </div>
                )
              })}
              {afectados.length > 10 && <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 4 }}>... y {afectados.length - 10} más</div>}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-secondary" onClick={() => setShowPreview(true)}>👁 Vista previa</button>
          <button type="button" className="btn btn-primary" onClick={aplicar} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Aplicando...</> : `✅ Aplicar (${afectados.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

const selStyle = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', cursor: 'pointer', fontSize: 13, background: 'var(--bg)', color: 'var(--tx)' }



