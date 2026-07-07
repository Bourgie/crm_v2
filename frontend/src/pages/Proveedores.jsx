import { useState, useEffect, useMemo, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useToast } from '../store'
import { Modal } from '../components/Modal'
import { SearchBar, PageHeader, Field, EmptyRow, Loader, Pagination, ConfirmDialog } from '../components/UI'

const PER = 25
const fmt = (n) => '$' + (Number(n)||0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-AR') : '—'
const METODOS = ['efectivo','transferencia','cheque','tarjeta','otro']
const EMPTY_PROV = { nombre:'', cuit:'', tel:'', email:'', dir:'', contacto:'', notas:'' }
const PROV_TABS = [['proveedores','📦 Proveedores'],['deudas','💰 Deudas']]

// ── Supplier detail panel (orders + payments + balance) ────────
function ProveedorDetail({ prov, onClose, api, toast }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('ordenes')
  const [modalCompra, setModalCompra] = useState(false)
  const [modalPago, setModalPago] = useState(false)
  const [fCompra, setFC] = useState({ concepto:'', monto:'', nro_factura:'', fecha:new Date().toISOString().substr(0,10), vto:'', notas:'', pagado_al_recibir:'', forma_pago_inicial:'pendiente' })
  const [fPago, setFP] = useState({ monto:'', metodo:'efectivo', concepto:'Pago proveedor', fecha:new Date().toISOString().substr(0,10), nro_comprobante:'' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const d = await api('GET', `/proveedores/${prov.id}/deudas`); setData(d) }
    catch { toast('Error cargando datos','err') }
    finally { setLoading(false) }
  }, [prov.id])

  useEffect(() => { load() }, [load])

  const setC = (f) => (e) => setFC((p) => ({...p,[f]:e.target.value}))
  const setP = (f) => (e) => setFP((p) => ({...p,[f]:e.target.value}))

  async function saveCompra() {
    if (!fCompra.monto) { toast('Ingresá el monto','err'); return }
    setSaving(true)
    try {
      await api('POST', `/proveedores/${prov.id}/ordenes`, { ...fCompra, monto: parseFloat(fCompra.monto), pagado_al_recibir: parseFloat(fCompra.pagado_al_recibir)||0 })
      toast('Compra registrada','ok'); setModalCompra(false); load()
    } catch(e) { toast(e.message,'err') } finally { setSaving(false) }
  }

  async function savePago() {
    if (!fPago.monto) { toast('Ingresá el monto','err'); return }
    setSaving(true)
    try {
      await api('POST', `/proveedores/${prov.id}/pagos`, { ...fPago, monto: parseFloat(fPago.monto) })
      toast('Pago registrado','ok'); setModalPago(false); load()
    } catch(e) { toast(e.message,'err') } finally { setSaving(false) }
  }

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner"/></div>

  const ordenes = data?.ordenes || []
  const pagos = data?.pagos || []
  const saldo = data?.saldo || 0

  return (
    <div>
      {/* Balance card */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
        <div className="kpi-card" style={{borderLeft:`3px solid ${saldo>0?'var(--bad)':'var(--ok)'}`}}>
          <div className="kpi-label">Saldo</div>
          <div className="kpi-value" style={{fontSize:20,color:saldo>0?'var(--bad)':'var(--ok)'}}>
            {saldo>0?`Debemos ${fmt(saldo)}`:saldo<0?`A favor ${fmt(-saldo)}`:'Al día'}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total comprado</div>
          <div className="kpi-value" style={{fontSize:18}}>{fmt(ordenes.filter(o=>!o.cancelada).reduce((a,o)=>a+o.monto,0))}</div>
          <div className="kpi-sub">{ordenes.length} órdenes</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total pagado</div>
          <div className="kpi-value" style={{fontSize:18,color:'var(--ok)'}}>{fmt(pagos.reduce((a,p)=>a+p.monto,0))}</div>
          <div className="kpi-sub">{pagos.length} pagos</div>
        </div>
      </div>

      {/* Actions */}
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <button type="button" className="btn btn-primary" onClick={()=>{setFC({concepto:'',monto:'',nro_factura:'',fecha:new Date().toISOString().substr(0,10),vto:'',notas:'',pagado_al_recibir:'',forma_pago_inicial:'pendiente'});setModalCompra(true)}}>📦 Nueva compra</button>
        <button type="button" className="btn" style={{background:'#dcfce7',color:'#15803d',border:'none'}} onClick={()=>{setFP({monto:String(Math.max(0,saldo)),metodo:'efectivo',concepto:'Pago proveedor',fecha:new Date().toISOString().substr(0,10),nro_comprobante:''});setModalPago(true)}}>💵 Registrar pago</button>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:10,borderBottom:'2px solid var(--bd)',paddingBottom:8}}>
        {[['ordenes',`📦 Compras (${ordenes.length})`],['pagos',`💵 Pagos (${pagos.length})`]].map(([k,l])=>(
          <button type="button" key={k} className={`btn btn-sm ${tab===k?'btn-primary':'btn-secondary'}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      {tab==='ordenes' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Concepto</th><th>N° Factura</th><th style={{textAlign:'right'}}>Monto</th><th style={{textAlign:'right'}}>Pagado</th><th>Estado</th></tr></thead>
            <tbody>
              {ordenes.length===0 ? <EmptyRow cols={6} icon="📦" text="Sin compras registradas"/>
                : ordenes.map((o)=>(
                  <tr key={o.id}>
                    <td style={{fontSize:12}}>{fmtDate(o.fecha)}</td>
                    <td style={{fontWeight:500}}>{o.concepto||'Compra'}</td>
                    <td style={{fontSize:12,color:'var(--mu)'}}>{o.nro_factura||'—'}</td>
                    <td style={{textAlign:'right',fontWeight:600}}>{fmt(o.monto)}</td>
                    <td style={{textAlign:'right',fontSize:12}}>{o.pagado_al_recibir>0?fmt(o.pagado_al_recibir):'—'}</td>
                    <td><span className={`badge ${o.cancelada?'badge-green':'badge-red'}`}>{o.cancelada?'Pagada':'Pendiente'}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==='pagos' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Método</th><th>N° Comp.</th><th style={{textAlign:'right'}}>Monto</th></tr></thead>
            <tbody>
              {pagos.length===0 ? <EmptyRow cols={5} icon="💵" text="Sin pagos registrados"/>
                : pagos.map((p)=>(
                  <tr key={p.id}>
                    <td style={{fontSize:12}}>{fmtDate(p.fecha)}</td>
                    <td>{p.concepto||'Pago'}</td>
                    <td style={{fontSize:12}}>{p.metodo||'—'}</td>
                    <td style={{fontSize:12,color:'var(--mu)'}}>{p.nro_comprobante||'—'}</td>
                    <td style={{textAlign:'right',fontWeight:700,color:'var(--ok)'}}>{fmt(p.monto)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Nueva compra modal */}
      <Modal open={modalCompra} onClose={()=>setModalCompra(false)} title="📦 Registrar compra" size="md"
        footer={<><button type="button" className="btn btn-secondary" onClick={()=>setModalCompra(false)}>Cancelar</button><button type="button" className="btn btn-primary" onClick={saveCompra} disabled={saving}>{saving?<><span className="spinner" style={{width:14,height:14}}/> Guardando...</>:'💾 Guardar'}</button></>}>
        <div className="fr">
          <Field label="Concepto"><input value={fCompra.concepto} onChange={setC('concepto')} placeholder="Ej: Mercadería, Insumos..."/></Field>
          <Field label="Monto total *"><input type="number" value={fCompra.monto} onChange={setC('monto')} min="0" step="0.01" placeholder="0.00"/></Field>
        </div>
        <div className="fr">
          <Field label="N° Factura"><input value={fCompra.nro_factura} onChange={setC('nro_factura')} placeholder="A-0001-00001234" style={{fontFamily:'monospace'}}/></Field>
          <Field label="Fecha"><input type="date" value={fCompra.fecha} onChange={setC('fecha')}/></Field>
        </div>
        <div className="fr">
          <Field label="Vencimiento"><input type="date" value={fCompra.vto} onChange={setC('vto')}/></Field>
          <Field label="Pagado al recibir $"><input type="number" value={fCompra.pagado_al_recibir} onChange={setC('pagado_al_recibir')} min="0" placeholder="0.00"/></Field>
        </div>
        {fCompra.pagado_al_recibir>0 && (
          <Field label="Forma de pago inicial">
            <select value={fCompra.forma_pago_inicial} onChange={setC('forma_pago_inicial')}>
              <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option>
              <option value="cheque">Cheque</option><option value="tarjeta">Tarjeta</option>
            </select>
          </Field>
        )}
        <Field label="Notas"><input value={fCompra.notas} onChange={setC('notas')} placeholder="Observaciones..."/></Field>
      </Modal>

      {/* Pago modal */}
      <Modal open={modalPago} onClose={()=>setModalPago(false)} title="💵 Registrar pago" size="sm"
        footer={<><button type="button" className="btn btn-secondary" onClick={()=>setModalPago(false)}>Cancelar</button><button type="button" className="btn btn-primary" style={{background:'var(--ok)'}} onClick={savePago} disabled={saving}>{saving?<><span className="spinner" style={{width:14,height:14}}/> Guardando...</>:'✅ Registrar'}</button></>}>
        {saldo>0 && <div style={{textAlign:'center',marginBottom:16,padding:'10px 14px',background:'rgba(239,68,68,.08)',borderRadius:8}}><div style={{fontSize:12,color:'var(--mu)'}}>Deuda actual</div><div style={{fontSize:22,fontWeight:800,color:'var(--bad)'}}>{fmt(saldo)}</div></div>}
        <Field label="Monto *"><input type="number" value={fPago.monto} onChange={setP('monto')} min="0" step="0.01" style={{fontSize:18,fontWeight:700,textAlign:'center'}}/></Field>
        <div className="fr">
          <Field label="Método"><select value={fPago.metodo} onChange={setP('metodo')}>{METODOS.map((m)=><option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}</select></Field>
          <Field label="Fecha"><input type="date" value={fPago.fecha} onChange={setP('fecha')}/></Field>
        </div>
        <div className="fr">
          <Field label="N° Comprobante"><input value={fPago.nro_comprobante} onChange={setP('nro_comprobante')} placeholder="Opcional" style={{fontFamily:'monospace'}}/></Field>
          <Field label="Concepto"><input value={fPago.concepto} onChange={setP('concepto')} placeholder="Pago proveedor"/></Field>
        </div>
      </Modal>
    </div>
  )
}

// ── Main Proveedores page ──────────────────────────────────────
function DeudasTab({ api, toast, onVerProveedor }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todas')

  useEffect(() => {
    api('GET', '/proveedores/todas-deudas').then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <Loader/>
  if (!data) return <div style={{padding:20,textAlign:'center',color:'var(--mu)'}}>Error cargando deudas</div>

  const proveedores = data.proveedores || []
  const filtrados = filtro === 'con_deuda' ? proveedores.filter(p => p.tiene_deuda) :
    filtro === 'sin_deuda' ? proveedores.filter(p => !p.tiene_deuda) : proveedores

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:16}}>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--bad)'}}>
          <div className="kpi-label">Deuda total</div>
          <div className="kpi-value" style={{color:'var(--bad)',fontSize:22}}>{fmt(data.total_deuda)}</div>
        </div>
        <div className="kpi-card" style={{borderLeft:'3px solid #f59e0b'}}>
          <div className="kpi-label">Proveedores con deuda</div>
          <div className="kpi-value" style={{color:'#f59e0b'}}>{data.con_deuda}</div>
          <div className="kpi-sub">de {data.total_proveedores} totales</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Al día</div>
          <div className="kpi-value" style={{color:'var(--ok)'}}>{data.total_proveedores - data.con_deuda}</div>
        </div>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:12}}>
        {[['todas','Todas'],['con_deuda','Con deuda'],['sin_deuda','Al día']].map(([v,l])=>(
          <button type="button" key={v} className={`btn btn-sm ${filtro===v?'btn-primary':'btn-secondary'}`} onClick={()=>setFiltro(v)}>{l}</button>
        ))}
      </div>

      <div className="card" style={{padding:0}}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Proveedor</th><th>CUIT</th><th style={{textAlign:'right'}}>Compras</th><th style={{textAlign:'right'}}>Pagado</th><th style={{textAlign:'right'}}>Saldo</th><th style={{width:60}}></th></tr></thead>
            <tbody>
              {filtrados.length===0
                ? <EmptyRow cols={6} icon="💰" text="Sin resultados"/>
                : filtrados.map((p)=>(
                    <tr key={p.id}>
                      <td><div style={{fontWeight:600}}>{p.nombre}</div><div style={{fontSize: 12,color:'var(--mu)'}}>{p.cant_ordenes} órdenes · {p.cant_pagos} pagos</div></td>
                      <td style={{fontSize:12,fontFamily:'monospace'}}>{p.cuit||'—'}</td>
                      <td style={{textAlign:'right',fontSize:13}}>{fmt(p.total_ordenes)}</td>
                      <td style={{textAlign:'right',fontSize:13,color:'var(--ok)'}}>{fmt(p.total_pagos)}</td>
                      <td style={{textAlign:'right',fontWeight:700,color:p.tiene_deuda?'var(--bad)':'var(--ok)'}}>
                        {p.tiene_deuda ? fmt(p.saldo) : 'Al día'}
                      </td>
                      <td>
                        <button type="button" className="btn btn-sm" style={{background:'#dbeafe',color:'#1d4ed8',border:'none'}}
                          onClick={() => onVerProveedor(p)}>📋</button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main Proveedores page ──────────────────────────────────────
export function Proveedores() {
  const { api } = useApi()
  const { toast } = useToast()

  const [tab, setTab] = useState('proveedores')
  const [provs, setProvs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(EMPTY_PROV)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(async () => {
    try { const d = await api('GET', '/proveedores'); setProvs(Array.isArray(d)?d:[]) }
    catch { toast('Error cargando proveedores','err') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!search) return provs
    const q = search.toLowerCase()
    return provs.filter((p) => (p.nombre+' '+(p.cuit||'')+(p.tel||'')).toLowerCase().includes(q))
  }, [provs, search])

  const set = (f) => (e) => setForm((p) => ({...p,[f]:e.target.value}))

  function openNew() { setForm(EMPTY_PROV); setModal('new') }
  function openEdit(p) { setForm({nombre:p.nombre,cuit:p.cuit||'',tel:p.tel||'',email:p.email||'',dir:p.dir||'',contacto:p.contacto||'',notas:p.notas||''}); setModal(p) }

  async function save() {
    if (!form.nombre.trim()) { toast('El nombre es obligatorio','err'); return }
    setSaving(true)
    try {
      if (modal==='new') { await api('POST','/proveedores',form); toast('Proveedor creado','ok') }
      else { await api('PUT','/proveedores/'+modal.id,form); toast('Proveedor actualizado','ok') }
      setModal(null); load()
    } catch(e) { toast(e.message,'err') }
    finally { setSaving(false) }
  }

  if (loading) return <Loader/>

  return (
    <div>
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'2px solid var(--bd)',paddingBottom:8,flexWrap:'wrap'}}>
        {PROV_TABS.map(([k,l])=>(
          <button type="button" key={k} className={`btn btn-sm ${tab===k?'btn-primary':'btn-secondary'}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      {tab==='deudas' && (
        <DeudasTab api={api} toast={toast} onVerProveedor={(p) => {
          setDetail(provs.find(pr => pr.id === p.id) || p)
          setTab('proveedores')
        }}/>
      )}

      {tab==='proveedores' && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:16}}>
            <div className="kpi-card"><div className="kpi-label">Total proveedores</div><div className="kpi-value">{provs.length}</div><div className="kpi-icon">📦</div></div>
          </div>

          <PageHeader title={`📦 Proveedores (${filtered.length})`}>
            <SearchBar value={search} onChange={(v)=>{setSearch(v);setPage(1)}} placeholder="Nombre, CUIT..." style={{width:220}}/>
            <button type="button" className="btn btn-primary" onClick={openNew}>+ Nuevo proveedor</button>
          </PageHeader>

          <div className="card" style={{padding:0}}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nombre</th><th>CUIT</th><th>Contacto</th><th>Teléfono</th><th style={{width:120}}></th></tr></thead>
                <tbody>
                  {filtered.slice((page-1)*PER,page*PER).length===0
                    ? <EmptyRow cols={5} icon="📦" text="Sin proveedores. Creá el primero."/>
                    : filtered.slice((page-1)*PER,page*PER).map((p)=>(
                      <tr key={p.id}>
                        <td><div style={{fontWeight:600}}>{p.nombre}</div>{p.notas&&<div style={{fontSize: 12,color:'var(--mu)'}}>{p.notas.substr(0,50)}</div>}</td>
                        <td style={{fontSize:12,fontFamily:'monospace'}}>{p.cuit||'—'}</td>
                        <td style={{fontSize:12}}>{p.contacto||p.email||'—'}</td>
                        <td style={{fontSize:12}}>{p.tel||'—'}</td>
                        <td>
                          <div style={{display:'flex',gap:4}}>
                            <button type="button" className="btn btn-sm" style={{background:'#dbeafe',color:'#1d4ed8',border:'none'}} onClick={()=>setDetail(p)}>📋 Ver</button>
                            <button type="button" className="btn btn-icon btn-sm" onClick={()=>openEdit(p)}>✏️</button>
                            <button type="button" className="btn btn-icon btn-sm" onClick={()=>setConfirm(p.id)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div style={{padding:'0 16px'}}><Pagination page={page} total={filtered.length} perPage={PER} onChange={setPage}/></div>
          </div>

          {/* Create/edit modal */}
          <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==='new'?'+ Nuevo proveedor':`Editar: ${modal?.nombre}`}
            footer={<><button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><span className="spinner" style={{width:14,height:14}}/> Guardando...</>:'💾 Guardar'}</button></>}>
            <div className="fr">
              <Field label="Nombre *"><input value={form.nombre} onChange={set('nombre')} placeholder="Nombre del proveedor"/></Field>
              <Field label="CUIT"><input value={form.cuit} onChange={set('cuit')} placeholder="20-12345678-9" style={{fontFamily:'monospace'}}/></Field>
            </div>
            <div className="fr">
              <Field label="Teléfono"><input value={form.tel} onChange={set('tel')} placeholder="Teléfono"/></Field>
              <Field label="Email"><input type="email" value={form.email} onChange={set('email')} placeholder="email@..."/></Field>
            </div>
            <div className="fr">
              <Field label="Contacto"><input value={form.contacto} onChange={set('contacto')} placeholder="Nombre del vendedor"/></Field>
              <Field label="Dirección"><input value={form.dir} onChange={set('dir')} placeholder="Dirección"/></Field>
            </div>
            <Field label="Notas"><textarea value={form.notas} onChange={set('notas')} rows={2} style={{resize:'vertical'}} placeholder="Observaciones..."/></Field>
          </Modal>

          {/* Detail modal */}
          <Modal open={!!detail} onClose={()=>setDetail(null)} title={`📦 ${detail?.nombre}`} size="xl">
            {detail && <ProveedorDetail prov={detail} onClose={()=>setDetail(null)} api={api} toast={toast}/>}
          </Modal>

          <ConfirmDialog open={!!confirm} onClose={()=>setConfirm(null)}
            onConfirm={async()=>{try{await api('DELETE','/proveedores/'+confirm);toast('Proveedor eliminado','ok');load()}catch(e){toast(e.message,'err')}}}
            title="Eliminar proveedor" message="¿Eliminás este proveedor y todos sus registros asociados?" confirmLabel="Sí, eliminar"/>
        </>
      )}
    </div>
  )
}


