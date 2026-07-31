import { useState, useEffect, useMemo, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useApp, useToast } from '../store'
import { Modal } from '../components/Modal'
import { SearchBar, PageHeader, EmptyRow, Loader, Pagination, ConfirmDialog } from '../components/UI'

const PER_PAGE = 25
const ESTADOS = { borrador:'badge-gray', enviada:'badge-blue', recibida:'badge-green', cancelada:'badge-red' }
const EST_LABELS = { borrador:'Borrador', enviada:'Enviada', recibida:'Recibida', cancelada:'Cancelada' }
const fmt = (n) => '$' + (Number(n)||0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

function getStock(p) {
  if (typeof p.stock_actual === 'number') return p.stock_actual
  if (typeof p.stock === 'number') return p.stock
  return p.stock_total ?? 0
}

export function Transferencias() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion, allSucs: storeSucs, allProds: storeProds } = useApp()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [allSucs, setAllSucs] = useState(storeSucs)
  const [search, setSearch] = useState('')
  const [filtroEst, setFiltroEst] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(false)
  const [detail, setDetail] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)

  // Form state
  const [fOrigen, setFOrigen] = useState(sucSesion || '')
  const [fDest, setFDest] = useState('')
  const [fNota, setFNota] = useState('')
  const [fLines, setFLines] = useState([{ prod_id: '', nombre: '', talle: '', cantidad: 1 }])
  const [origenProds, setOrigenProds] = useState([])  // productos de la suc origen
  const [loadingProds, setLoadingProds] = useState(false)

  const load = useCallback(async () => {
    try {
      // Load sucursales if store is empty
      const [rows, sucs] = await Promise.all([
        api('GET', `/transferencias?suc_id=${sucSesion || ''}`),
        allSucs.length === 0 ? api('GET', '/sucursales').catch(() => []) : Promise.resolve(null),
      ])
      setItems(Array.isArray(rows) ? rows : [])
      if (sucs) setAllSucs(Array.isArray(sucs) ? sucs : [])
    } catch { toast('Error cargando transferencias', 'err') }
    finally { setLoading(false) }
  }, [sucSesion])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (storeSucs.length > 0) setAllSucs(storeSucs) }, [storeSucs])

  // Load products for origin sucursal
  async function loadOrigenProds(sucId) {
    if (!sucId) { setOrigenProds([]); return }
    setLoadingProds(true)
    try {
      const data = await api('GET', `/productos?viewer_suc=${sucId}`)
      setOrigenProds(Array.isArray(data) ? data.filter(p => p.activo !== false) : [])
    } catch { setOrigenProds(storeProds.filter(p => p.activo !== false)) }
    finally { setLoadingProds(false) }
  }

  function openNew() {
    const origen = sucSesion || allSucs[0]?.id || ''
    setFOrigen(origen)
    setFDest('')
    setFNota('')
    setFLines([{ prod_id: '', nombre: '', talle: '', cantidad: 1 }])
    loadOrigenProds(origen)
    setModal(true)
  }

  function handleOrigenChange(sucId) {
    setFOrigen(sucId)
    setFLines([{ prod_id: '', nombre: '', talle: '', cantidad: 1 }])
    loadOrigenProds(sucId)
  }

  function setLine(i, f, v) { setFLines(p => p.map((l, idx) => idx === i ? { ...l, [f]: v } : l)) }
  function addLine() { setFLines(p => [...p, { prod_id: '', nombre: '', talle: '', cantidad: 1 }]) }
  function removeLine(i) { if (fLines.length > 1) setFLines(p => p.filter((_, idx) => idx !== i)) }

  function selectProd(i, prod) {
    const stock = getStock(prod)
    setFLines(p => p.map((l, idx) => idx === i ? {
      ...l,
      prod_id: prod.id,
      nombre: prod.nombre + (prod.talle ? ' T:' + prod.talle : ''),
      talle: prod.talle || '',
      stock_origen: stock,
      cantidad: 1,
    } : l))
  }

  async function save() {
    if (!fOrigen) { toast('Seleccioná la sucursal origen', 'err'); return }
    if (!fDest) { toast('Seleccioná la sucursal destino', 'err'); return }
    if (fOrigen === fDest) { toast('Origen y destino deben ser distintos', 'err'); return }
    const lines = fLines.filter(l => l.prod_id && l.cantidad > 0)
    if (!lines.length) { toast('Agregá al menos un producto', 'err'); return }

    // Validate stock
    for (const l of lines) {
      const p = origenProds.find(x => x.id === l.prod_id)
      if (p && getStock(p) < l.cantidad) {
        toast(`Stock insuficiente para ${l.nombre} (disponible: ${getStock(p)})`, 'err')
        return
      }
    }

    setSaving(true)
    try {
      const r = await api('POST', '/transferencias', {
        suc_origen: fOrigen,
        suc_destino: fDest,
        notas: fNota,
        items: lines.map(l => ({ prod_id: l.prod_id, nombre: l.nombre, talle: l.talle || '', cantidad: parseInt(l.cantidad) || 1 }))
      })
      toast(`Transferencia #${r.numero || ''} creada`, 'ok')
      setModal(false); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function accion(id, endpoint) {
    try { await api('POST', `/transferencias/${id}/${endpoint}`); toast('Actualizado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }

  const filtered = useMemo(() => {
    let list = items
    if (search) { const q = search.toLowerCase(); list = list.filter(t => (t.suc_origen_nombre + ' ' + t.suc_destino_nombre + ' ' + (t.notas||'')).toLowerCase().includes(q)) }
    if (filtroEst) list = list.filter(t => t.estado === filtroEst)
    return list.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [items, search, filtroEst])

  const fmtDate = (d) => d ? new Date(d).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'
  const sel = { padding:'9px 12px', borderRadius:8, border:'1.5px solid var(--bd)', cursor:'pointer', fontSize:13, background:'var(--bg)', color:'var(--tx)' }

  if (loading) return <Loader />

  return (
    <div>
      <PageHeader title={`🔄 Transferencias (${filtered.length})`}>
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Origen, destino..." style={{ width: 200 }} />
        <select style={sel} value={filtroEst} onChange={(e) => { setFiltroEst(e.target.value); setPage(1) }}>
          <option value="">Todos los estados</option>
          {Object.entries(EST_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="btn btn-primary" onClick={openNew}>+ Nueva</button>
      </PageHeader>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Origen → Destino</th><th>Ítems</th><th>Estado</th><th style={{ width: 130 }}></th></tr></thead>
            <tbody>
              {filtered.slice((page-1)*PER_PAGE, page*PER_PAGE).length === 0
                ? <EmptyRow cols={5} icon="🔄" text="Sin transferencias" />
                : filtered.slice((page-1)*PER_PAGE, page*PER_PAGE).map(t => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(t)}>
                    <td data-label="Fecha" style={{ fontSize: 12 }}>{fmtDate(t.fecha)}</td>
                    <td data-label="Origen → Destino"><span style={{ fontWeight: 600 }}>{t.suc_origen_nombre}</span><span style={{ color: 'var(--mu)' }}> → </span><span style={{ fontWeight: 600 }}>{t.suc_destino_nombre}</span></td>
                    <td data-label="Ítems" style={{ fontSize: 12, color: 'var(--mu)' }}>{t.items?.length || 0} ítem(s)</td>
                    <td data-label="Estado"><span className={`badge ${ESTADOS[t.estado] || 'badge-gray'}`}>{EST_LABELS[t.estado] || t.estado}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {t.estado === 'borrador' && <button type="button" className="btn btn-sm" style={{ background: '#dbeafe', color: '#1d4ed8', border: 'none', fontSize: 12 }} onClick={() => accion(t.id, 'enviar')}>📤 Enviar</button>}
                        {t.estado === 'enviada' && t.suc_destino === sucSesion && <button type="button" className="btn btn-sm" style={{ background: '#dcfce7', color: '#15803d', border: 'none', fontSize: 12 }} onClick={() => accion(t.id, 'recibir')}>✅ Recibir</button>}
                        {t.estado === 'borrador' && <button type="button" className="btn btn-icon btn-sm" onClick={() => setConfirm(t.id)}>🗑</button>}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 16px' }}><Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} /></div>
      </div>

      {/* New transfer modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="+ Nueva transferencia" size="lg"
        footer={<><button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : '💾 Guardar borrador'}
          </button></>}>
        <div className="fr">
          <div className="fg">
            <label>Sucursal Origen *</label>
            <select value={fOrigen} onChange={e => handleOrigenChange(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', width: '100%' }}>
              <option value="">Seleccionar...</option>
              {allSucs.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="fg">
            <label>Sucursal Destino *</label>
            <select value={fDest} onChange={e => setFDest(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', width: '100%' }}>
              <option value="">Seleccionar...</option>
              {allSucs.filter(s => s.id !== fOrigen).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 8 }}>
            Productos a transferir
            {loadingProds && <span style={{ marginLeft: 8, fontSize: 11 }}>⏳ Cargando stock...</span>}
          </div>
          {fLines.map((line, i) => {
            const prodsFiltrados = origenProds.filter(p => !line.nombre || (p.nombre + ' ' + (p.talle || '')).toLowerCase().includes(line.nombre.toLowerCase())).slice(0, 10)
            const prodSelected = origenProds.find(p => p.id === line.prod_id)
            const stockOrig = prodSelected ? getStock(prodSelected) : 0

            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 80px auto', gap: 8, marginBottom: 6, alignItems: 'end' }}>
                <div style={{ position: 'relative' }}>
                  {i === 0 && <label style={{ display: 'block', fontSize: 11, color: 'var(--mu)', marginBottom: 4 }}>Producto</label>}
                  <input
                    value={line.nombre}
                    onChange={e => {
                      setLine(i, 'nombre', e.target.value)
                      if (!e.target.value) setLine(i, 'prod_id', '')
                    }}
                    placeholder={fOrigen ? 'Buscar producto...' : 'Primero elegí sucursal origen'}
                    disabled={!fOrigen || loadingProds}
                  />
                  {line.nombre && !line.prod_id && prodsFiltrados.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
                      {prodsFiltrados.map(p => {
                        const st = getStock(p)
                        return (
                          <div key={p.id} onClick={() => selectProd(i, p)}
                            style={{ padding: '8px 12px', cursor: st > 0 ? 'pointer' : 'default', borderBottom: '1px solid var(--bd)', opacity: st <= 0 ? .5 : 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onMouseEnter={e => { if (st > 0) e.currentTarget.style.background = 'var(--sf)' }}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}{p.talle ? ` T:${p.talle}` : ''}</div>
                              <div style={{ fontSize: 11, color: 'var(--mu)' }}>{p.sku || ''}</div>
                            </div>
                            <span className={`badge ${st > 0 ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                              {st > 0 ? `Stock: ${st}` : 'Sin stock'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {line.prod_id && stockOrig > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--ok)', marginTop: 2 }}>Stock disponible en origen: {stockOrig}</div>
                  )}
                </div>
                <div>
                  {i === 0 && <label style={{ display: 'block', fontSize: 11, color: 'var(--mu)', marginBottom: 4 }}>Cant.</label>}
                  <input type="number" value={line.cantidad}
                    onChange={e => setLine(i, 'cantidad', parseInt(e.target.value) || 1)}
                    min="1" max={line.stock_origen || 999} style={{ textAlign: 'center' }} />
                </div>
                <button type="button" onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: 'var(--mu)', cursor: 'pointer', fontSize: 18, paddingBottom: 2 }}>✕</button>
              </div>
            )
          })}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} disabled={!fOrigen}>+ Agregar producto</button>
        </div>
        <div className="fg"><label>Notas</label><input value={fNota} onChange={e => setFNota(e.target.value)} placeholder="Observaciones..." /></div>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Transferencia #${detail?.id?.substr(-8)}`} size="md">
        {detail && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[['Origen', detail.suc_origen_nombre], ['Destino', detail.suc_destino_nombre], ['Fecha', fmtDate(detail.fecha)], ['Estado', <span className={`badge ${ESTADOS[detail.estado]}`}>{EST_LABELS[detail.estado]}</span>]].map(([l, v]) => (
                <div key={l} style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 4 }}>{l}</div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
                </div>
              ))}
            </div>
            {detail.notas && <p style={{ fontSize: 13, color: 'var(--mu)', marginBottom: 12 }}>{detail.notas}</p>}
            <div className="table-wrap">
              <table><thead><tr><th>Producto</th><th style={{ textAlign: 'center' }}>Cantidad</th></tr></thead>
                <tbody>{(detail.items || []).map((it, i) => <tr key={i}><td data-label="Producto">{it.nombre}{it.talle ? ` T:${it.talle}` : ''}</td><td data-label="Cantidad" style={{ textAlign: 'center', fontWeight: 700 }}>{it.cantidad}</td></tr>)}</tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--bd)' }}>
              {detail.estado === 'borrador' && <button type="button" className="btn btn-primary" onClick={() => { accion(detail.id, 'enviar'); setDetail(null) }}>📤 Enviar transferencia</button>}
              {detail.estado === 'enviada' && detail.suc_destino === sucSesion && <button type="button" className="btn btn-primary" style={{ background: 'var(--ok)' }} onClick={() => { accion(detail.id, 'recibir'); setDetail(null) }}>✅ Confirmar recepción</button>}
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        onConfirm={async () => { try { await api('POST', `/transferencias/${confirm}/cancelar`); toast('Cancelada', 'ok'); load() } catch (e) { toast(e.message, 'err') } }}
        title="Cancelar transferencia" message="¿Cancelás esta transferencia?" confirmLabel="Sí, cancelar" />
    </div>
  )
}

