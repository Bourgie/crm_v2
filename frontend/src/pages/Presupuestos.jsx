import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useApp, useToast } from '../store'
import { Modal } from '../components/Modal'
import { SearchBar, PageHeader, Field, ConfirmDialog, EmptyRow, Loader, Pagination } from '../components/UI'
import { exportExcel } from '../utils/excel'

const PER_PAGE = 25
const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

const ESTADOS = { borrador: 'badge-gray', enviado: 'badge-blue', aceptado: 'badge-green', rechazado: 'badge-red', vencido: 'badge-yellow', convertido: 'badge-purple' }

const btnSm = { padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600 }

export function Presupuestos() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion, allClis, allProds } = useApp()
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroEst, setFiltroEst] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)    // null | 'new' | {presupuesto}
  const [confirm, setConfirm] = useState(null)
  const [formHeader, setFormHeader] = useState({ cli_id: '', cli_nombre: '', validez_dias: '15', obs: '' })
  const [formItems, setFormItems] = useState([{ prod_id: '', nombre: '', cantidad: 1, precio: '' }])
  const [saving, setSaving] = useState(false)
  const [prodSearch, setProdSearch] = useState('')

  // Email modal state
  const [emailModal, setEmailModal] = useState(null) // null | {presupuesto}
  const [emailPara, setEmailPara] = useState('')
  const [emailMsg, setEmailMsg] = useState('')
  const [emailPipeline, setEmailPipeline] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [pipelineEtapas, setPipelineEtapas] = useState([])
  const [emailEtapaId, setEmailEtapaId] = useState('')

  // Pipeline modal state
  const [pipeModal, setPipeModal] = useState(null)
  const [pipeEtapaId, setPipeEtapaId] = useState('')
  const [pipeValor, setPipeValor] = useState('')
  const [pipeProb, setPipeProb] = useState('50')
  const [pipeSending, setPipeSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api('GET', `/presupuestos?suc_id=${sucSesion || ''}`)
      setItems(Array.isArray(data) ? data : [])
    } catch { toast('Error cargando presupuestos', 'err') }
    finally { setLoading(false) }
  }, [sucSesion])

  useEffect(() => { load() }, [load])

  function exportar() {
    const headers = ['N°', 'Fecha', 'Cliente', 'Vendedor', 'Validez (días)', 'Estado', 'Total']
    const rows = filtered.map(p => [
      p.id ? p.id.substr(-8) : '', p.creado ? new Date(p.creado).toLocaleDateString('es-AR') : '',
      p.cli_nombre || 'Sin cliente', p.vend_nombre || '', p.validez_dias || 30, p.estado || '', p.total || 0
    ])
    exportExcel('presupuestos', headers, rows, 'Presupuestos')
    toast('📊 Excel exportado', 'ok')
  }


  const filtered = useMemo(() => {
    let list = items
    if (search) { const q = search.toLowerCase(); list = list.filter((p) => (p.cli_nombre + ' ' + p.id).toLowerCase().includes(q)) }
    if (filtroEst) list = list.filter((p) => p.estado === filtroEst)
    return list.sort((a, b) => new Date(b.creado) - new Date(a.creado))
  }, [items, search, filtroEst])

  function openNew() {
    setFormHeader({ cli_id: '', cli_nombre: 'Consumidor final', validez_dias: '15', obs: '' })
    setFormItems([{ prod_id: '', nombre: '', cantidad: 1, precio: '' }])
    setModal('new')
  }

  function openEdit(p) {
    setFormHeader({ cli_id: p.cli_id || '', cli_nombre: p.cli_nombre || '', validez_dias: p.validez_dias || 15, obs: p.obs || '' })
    setFormItems(p.items?.length ? p.items.map((i) => ({ prod_id: i.prod_id || '', nombre: i.nombre, cantidad: i.cantidad, precio: i.precio })) : [{ prod_id: '', nombre: '', cantidad: 1, precio: '' }])
    setModal(p)
  }

  function addLine() { setFormItems((p) => [...p, { prod_id: '', nombre: '', cantidad: 1, precio: '' }]) }
  function removeLine(i) { setFormItems((p) => p.filter((_, idx) => idx !== i)) }
  function setLine(i, field, val) { setFormItems((p) => p.map((l, idx) => idx === i ? { ...l, [field]: val } : l)) }
  function selectProd(i, prod) {
    setFormItems((p) => p.map((l, idx) => idx === i ? { ...l, prod_id: prod.id, nombre: prod.nombre + (prod.talle ? ' T:' + prod.talle : ''), precio: prod.precio_l1 || '' } : l))
    setProdSearch('')
  }

  const subtotal = formItems.reduce((a, l) => a + (parseFloat(l.precio) || 0) * (parseInt(l.cantidad) || 0), 0)

  async function save() {
    if (!formHeader.cli_nombre?.trim()) { toast('Ingresá el nombre del cliente', 'err'); return }
    const lines = formItems.filter((l) => l.nombre?.trim() && l.precio)
    if (!lines.length) { toast('Agregá al menos un ítem', 'err'); return }
    setSaving(true)
    try {
      const body = {
        ...formHeader, suc_id: sucSesion,
        validez_dias: parseInt(formHeader.validez_dias) || 15,
        items: lines.map((l) => ({ ...l, cantidad: parseInt(l.cantidad) || 1, precio: parseFloat(l.precio) || 0, subtotal: (parseInt(l.cantidad) || 1) * (parseFloat(l.precio) || 0) })),
        subtotal, total: subtotal,
      }
      if (modal === 'new') { await api('POST', '/presupuestos', body); toast('Presupuesto creado', 'ok') }
      else { await api('PUT', '/presupuestos/' + modal.id, body); toast('Presupuesto actualizado', 'ok') }
      setModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function cambiarEstado(id, estado) {
    try { await api('PATCH', '/presupuestos/' + id + '/estado', { estado }); toast('Estado actualizado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }

  function downloadPDF(id) {
    window.open('/api/presupuestos/' + id + '/pdf', '_blank')
  }

  async function convertirVenta(id) {
    try {
      const r = await api('POST', '/presupuestos/' + id + '/convertir')
      toast('✅ Venta #' + r.numero + ' creada. Redirigiendo a Caja...', 'ok')
      load()
      setTimeout(() => navigate('/app/caja'), 1000)
    } catch (e) { toast(e.message, 'err') }
  }

  async function loadEtapas(target, cb) {
    try {
      const d = await api('GET', '/pipeline/etapas');
      const list = Array.isArray(d) ? d : [];
      setPipelineEtapas(list);
      if (target === 'pipe' && !cb) setPipeEtapaId(list.find(e => e.nombre === 'En negociación')?.id || list[0]?.id || '');
      if (target === 'email' && !cb) setEmailEtapaId(list.find(e => e.nombre === 'En negociación')?.id || list[0]?.id || '');
      if (cb) cb(list);
    } catch {}
  }

  function openEmail(p) {
    setEmailPara('')
    setEmailMsg('')
    setEmailPipeline(false)
    setEmailModal(p)
    loadEtapas('email')
  }

  function openPipeline(p) {
    setPipeValor(p.total || '')
    setPipeProb('50')
    setPipeModal(p)
    loadEtapas('pipe')
  }

  async function sendEmail() {
    if (!emailPara) { toast('Ingresá el email del destinatario', 'err'); return }
    setEmailSending(true)
    try {
      await api('POST', '/presupuestos/' + emailModal.id + '/enviar-email', {
        para: emailPara, mensaje: emailMsg,
        agregarPipeline: emailPipeline,
        pipelineEtapaId: emailPipeline ? emailEtapaId : undefined,
      })
      toast('Email enviado' + (emailPipeline ? ' y agregado al pipeline' : ''), 'ok')
      setEmailModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setEmailSending(false) }
  }

  async function sendToPipeline() {
    if (!pipeEtapaId) { toast('Seleccioná una etapa del pipeline', 'err'); return }
    setPipeSending(true)
    try {
      await api('POST', '/presupuestos/' + pipeModal.id + '/enviar-pipeline', {
        etapa_id: pipeEtapaId, valor_estimado: pipeValor, probabilidad: pipeProb,
      })
      toast('Agregado al pipeline', 'ok')
      setPipeModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setPipeSending(false) }
  }

  if (loading) return <Loader />

  const prodOpts = allProds.filter((p) => p.activo !== false && (!prodSearch || (p.nombre + ' ' + p.sku).toLowerCase().includes(prodSearch.toLowerCase()))).slice(0, 8)

  return (
    <div>
      <PageHeader title={`📄 Presupuestos (${filtered.length})`}>
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cliente, ID..." style={{ width: 220 }} />
        <select style={selStyle} value={filtroEst} onChange={(e) => { setFiltroEst(e.target.value); setPage(1) }}>
          <option value="">Todos los estados</option>
          {Object.keys(ESTADOS).map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={exportar}>📊 Excel</button>
        <button className="btn btn-primary" onClick={openNew}>+ Nuevo</button>
      </PageHeader>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Ítems</th><th style={{ textAlign: 'right' }}>Total</th><th>Estado</th><th>Vence</th><th style={{ width: 120 }}></th></tr></thead>
            <tbody>
              {filtered.slice((page-1)*PER_PAGE, page*PER_PAGE).length === 0
                ? <EmptyRow cols={7} icon="📄" text="Sin presupuestos aún" />
                : filtered.slice((page-1)*PER_PAGE, page*PER_PAGE).map((p) => {
                    const vto = p.fecha_vencimiento ? new Date(p.fecha_vencimiento) : null
                    const vencido = vto && vto < new Date() && p.estado === 'enviado'
                    return (
                      <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(p)}>
                        <td style={{ fontSize: 12 }}>{(p.creado || '').substr(0, 10)}</td>
                        <td style={{ fontWeight: 600 }}>{p.cli_nombre || 'Consumidor final'}</td>
                        <td style={{ fontSize: 12, color: 'var(--mu)' }}>{p.items?.length || 0} ítem(s)</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(p.total)}</td>
                        <td><span className={`badge ${ESTADOS[p.estado] || 'badge-gray'}`}>{p.estado}</span></td>
                        <td style={{ fontSize: 12, color: vencido ? 'var(--bad)' : 'var(--mu)' }}>{vto ? vto.toLocaleDateString('es-AR') : '—'}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            <button className="btn btn-icon btn-sm" title="Editar" onClick={() => openEdit(p)}>✏️</button>
                            {p.estado === 'borrador' && <button className="btn btn-sm" style={{ background: '#dbeafe', color: '#1d4ed8', ...btnSm }} onClick={() => cambiarEstado(p.id, 'enviado')}>📤 Enviar</button>}
                            {p.estado === 'enviado' && <button className="btn btn-sm" style={{ background: '#dcfce7', color: '#15803d', ...btnSm }} onClick={() => cambiarEstado(p.id, 'aceptado')}>✅ Aprobar</button>}
                            {p.estado === 'enviado' && <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', ...btnSm }} onClick={() => cambiarEstado(p.id, 'rechazado')}>✕ Rechazar</button>}
                            {p.estado === 'aceptado' && <button className="btn btn-sm" style={{ background: '#ede9fe', color: '#7c3aed', ...btnSm }} onClick={() => convertirVenta(p.id)}>→ Venta</button>}
                            <button className="btn btn-icon btn-sm" title="Descargar PDF" onClick={() => downloadPDF(p.id)}>📄</button>
                            <button className="btn btn-icon btn-sm" title="Enviar por email" onClick={() => openEmail(p)}>📧</button>
                            <button className="btn btn-icon btn-sm" title="Agregar al pipeline" onClick={() => openPipeline(p)}>📋</button>
                            <button className="btn btn-icon btn-sm" title="Eliminar" onClick={() => setConfirm(p.id)}>🗑</button>
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

      <Modal open={!!modal} onClose={() => setModal(null)} size="xl"
        title={modal === 'new' ? '+ Nuevo presupuesto' : `Presupuesto #${modal?.id?.substr(-8)}`}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : '💾 Guardar'}
          </button>
        </>}
      >
        <div className="fr">
          <Field label="Cliente">
            <input value={formHeader.cli_nombre} onChange={(e) => setFormHeader((p) => ({ ...p, cli_nombre: e.target.value }))} placeholder="Nombre del cliente" list="cli-opts" />
            <datalist id="cli-opts">{allClis.map((c) => <option key={c.id} value={c.nombre + ' ' + (c.apellido || '')} />)}</datalist>
          </Field>
          <Field label="Validez (días)">
            <input type="number" value={formHeader.validez_dias} onChange={(e) => setFormHeader((p) => ({ ...p, validez_dias: e.target.value }))} min="1" />
          </Field>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 8 }}>Ítems</div>
          {formItems.map((line, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 120px auto', gap: 8, marginBottom: 6, alignItems: 'end' }}>
              <div style={{ position: 'relative' }}>
                {i === 0 && <label style={{ display: 'block', fontSize: 11, color: 'var(--mu)', marginBottom: 4 }}>Descripción</label>}
                <input value={line.nombre} onChange={(e) => { setLine(i, 'nombre', e.target.value); setProdSearch(e.target.value) }}
                  placeholder="Producto o servicio..." />
                {prodSearch && i === formItems.findIndex((l) => l.nombre === prodSearch) && prodOpts.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 50, maxHeight: 200, overflowY: 'auto' }}>
                    {prodOpts.map((p) => (
                      <div key={p.id} onClick={() => selectProd(i, p)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--bd)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--sf)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = ''}>
                        <strong>{p.nombre}</strong>{p.talle ? ` T:${p.talle}` : ''} <span style={{ color: 'var(--ac)' }}>{fmt(p.precio_l1)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                {i === 0 && <label style={{ display: 'block', fontSize: 11, color: 'var(--mu)', marginBottom: 4 }}>Cant.</label>}
                <input type="number" value={line.cantidad} onChange={(e) => setLine(i, 'cantidad', e.target.value)} min="1" style={{ textAlign: 'center' }} />
              </div>
              <div>
                {i === 0 && <label style={{ display: 'block', fontSize: 11, color: 'var(--mu)', marginBottom: 4 }}>Precio unit.</label>}
                <input type="number" value={line.precio} onChange={(e) => setLine(i, 'precio', e.target.value)} min="0" placeholder="0.00" />
              </div>
              <div style={{ paddingBottom: 1 }}>
                {i === 0 && <div style={{ height: 20 }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, minWidth: 70, textAlign: 'right' }}>{fmt((parseFloat(line.precio) || 0) * (parseInt(line.cantidad) || 0))}</span>
                  <button onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: 'var(--mu)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                </div>
              </div>
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={addLine}>+ Agregar línea</button>
        </div>

        <div style={{ borderTop: '2px solid var(--bd)', paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--mu)' }}>Total del presupuesto</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--ok)' }}>{fmt(subtotal)}</div>
          </div>
        </div>

        <Field label="Observaciones"><input value={formHeader.obs} onChange={(e) => setFormHeader((p) => ({ ...p, obs: e.target.value }))} placeholder="Notas o condiciones del presupuesto..." /></Field>
      </Modal>

      <Modal open={!!emailModal} onClose={() => setEmailModal(null)} title="📧 Enviar presupuesto por email"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setEmailModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={sendEmail} disabled={emailSending}>
            {emailSending ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Enviando...</> : '📤 Enviar'}
          </button>
        </>}
      >
        <Field label="Email del destinatario">
          <input type="email" value={emailPara} onChange={e => setEmailPara(e.target.value)} placeholder="cliente@ejemplo.com" style={{ width: '100%' }} />
        </Field>
        <Field label="Mensaje (opcional)">
          <textarea value={emailMsg} onChange={e => setEmailMsg(e.target.value)} rows={3} placeholder="Agregá un mensaje para el cliente..." style={{ width: '100%', resize: 'vertical' }} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={emailPipeline} onChange={e => setEmailPipeline(e.target.checked)} />
          <span style={{ fontSize: 13 }}>También agregar al pipeline comercial</span>
        </label>
        {emailPipeline && (
          <Field label="Etapa del pipeline">
            <select value={emailEtapaId} onChange={e => setEmailEtapaId(e.target.value)} style={{ width: '100%' }}>
              <option value="">Seleccionar etapa...</option>
              {pipelineEtapas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </Field>
        )}
        <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 8 }}>
          El PDF se adjunta automáticamente. Para enviar emails necesitás tener configurado SMTP en Ajustes.
        </div>
      </Modal>

      <Modal open={!!pipeModal} onClose={() => setPipeModal(null)} title="📋 Agregar al pipeline"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setPipeModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={sendToPipeline} disabled={pipeSending}>
            {pipeSending ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Agregando...</> : '📋 Agregar al pipeline'}
          </button>
        </>}
      >
        <Field label="Etapa">
          <select value={pipeEtapaId} onChange={e => setPipeEtapaId(e.target.value)} style={{ width: '100%' }}>
            <option value="">Seleccionar...</option>
            {pipelineEtapas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </Field>
        <div className="fr">
          <Field label="Valor estimado">
            <input type="number" value={pipeValor} onChange={e => setPipeValor(e.target.value)} style={{ width: '100%' }} />
          </Field>
          <Field label="Probabilidad (%)">
            <input type="number" value={pipeProb} onChange={e => setPipeProb(e.target.value)} min="0" max="100" style={{ width: '100%' }} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        onConfirm={async () => { try { await api('DELETE', '/presupuestos/' + confirm); toast('Eliminado', 'ok'); load() } catch (e) { toast(e.message, 'err') } }}
        title="Eliminar presupuesto" message="¿Eliminás este presupuesto?" confirmLabel="Sí, eliminar" />
    </div>
  )
}

const selStyle = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', cursor: 'pointer', fontSize: 13, background: 'var(--bg)', color: 'var(--tx)' }
