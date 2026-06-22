// ═══════════════════════════════════════════════════════════════
// LISTA DE REGALOS
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useApi } from '../hooks/useApi'
import { useApp, useToast } from '../store'
import { Modal } from '../components/Modal'
import { SearchBar, PageHeader, Field, EmptyRow, Loader, Pagination, ConfirmDialog } from '../components/UI'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts'

const PER_PAGE = 20
const fmtM = (n) => '$' + (Number(n)||0).toLocaleString('es-AR',{maximumFractionDigits:0})

export function ListaRegalos() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion, allProds } = useApp()

  const [listas, setListas] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [form, setForm] = useState({ mama: '', papa: '', evento: '', fecha_evento: '', tel: '', email: '', notas: '' })

  const load = useCallback(async () => {
    try { const d = await api('GET', `/lista-bebe?suc_id=${sucSesion||''}`); setListas(Array.isArray(d)?d:[]) }
    catch { toast('Error cargando listas','err') }
    finally { setLoading(false) }
  }, [sucSesion])

  useEffect(() => { load() }, [load])

  async function loadDetail(id) {
    setLoadingDetail(true)
    try { const d = await api('GET', `/lista-bebe/${id}`); setDetail(d) }
    catch { toast('Error','err') }
    finally { setLoadingDetail(false) }
  }

  const filtered = useMemo(() => {
    if (!search) return listas
    const q = search.toLowerCase()
    return listas.filter((l) => (l.mama+' '+(l.papa||'')+(l.tel||'')).toLowerCase().includes(q))
  }, [listas, search])

  const set = (f) => (e) => setForm((p) => ({...p,[f]:e.target.value}))

  async function save() {
    if (!form.mama.trim()) { toast('El nombre es obligatorio','err'); return }
    setSaving(true)
    try {
      const body = {...form, suc_id: sucSesion}
      if (modal==='new') { await api('POST','/lista-bebe',body); toast('Lista creada','ok') }
      else { await api('PUT','/lista-bebe/'+modal.id,body); toast('Lista actualizada','ok') }
      setModal(null); load()
    } catch(e) { toast(e.message,'err') }
    finally { setSaving(false) }
  }

  if (loading) return <Loader/>

  return (
    <div>
      <PageHeader title={`🎁 Listas de Regalos (${filtered.length})`}>
        <SearchBar value={search} onChange={(v)=>{setSearch(v);setPage(1)}} placeholder="Buscar..." style={{width:200}}/>
        <button className="btn btn-primary" onClick={()=>{setForm({mama:'',papa:'',evento:'',fecha_evento:'',tel:'',email:'',notas:''});setModal('new')}}>+ Nueva lista</button>
      </PageHeader>

      <div className="card" style={{padding:0}}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Titular</th><th>Evento</th><th>Fecha</th><th>Teléfono</th><th>Ítems</th><th style={{width:80}}></th></tr></thead>
            <tbody>
              {filtered.slice((page-1)*PER_PAGE,page*PER_PAGE).length===0
                ? <EmptyRow cols={6} icon="🎁" text="Sin listas aún"/>
                : filtered.slice((page-1)*PER_PAGE,page*PER_PAGE).map((l) => (
                  <tr key={l.id} style={{cursor:'pointer'}} onClick={()=>{setDetailId(l.id);loadDetail(l.id)}}>
                    <td><div style={{fontWeight:600}}>{l.mama}</div>{l.papa&&<div style={{fontSize:11,color:'var(--mu)'}}>{l.papa}</div>}</td>
                    <td style={{fontSize:12}}>{l.evento||'—'}</td>
                    <td style={{fontSize:12}}>{l.fecha_evento?new Date(l.fecha_evento).toLocaleDateString('es-AR'):'—'}</td>
                    <td style={{fontSize:12}}>{l.tel||'—'}</td>
                    <td style={{fontSize:12,color:'var(--mu)'}}>{l.n_items||0} ítem(s)</td>
                    <td onClick={(e)=>e.stopPropagation()}>
                      <div style={{display:'flex',gap:4}}>
                        <button className="btn btn-icon btn-sm" onClick={()=>{setForm({mama:l.mama,papa:l.papa||'',evento:l.evento||'',fecha_evento:(l.fecha_evento||'').substr(0,10),tel:l.tel||'',email:l.email||'',notas:l.notas||''});setModal(l)}}>✏️</button>
                        <button className="btn btn-icon btn-sm" onClick={()=>setConfirm(l.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div style={{padding:'0 16px'}}><Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage}/></div>
      </div>

      <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==='new'?'+ Nueva lista':'Editar lista'}
        footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><span className="spinner" style={{width:14,height:14}}/> Guardando...</>:'💾 Guardar'}</button></>}>
        <div className="fr"><Field label="Titular / Mamá *"><input value={form.mama} onChange={set('mama')} placeholder="Nombre"/></Field><Field label="Papá / Pareja"><input value={form.papa} onChange={set('papa')} placeholder="Nombre (opcional)"/></Field></div>
        <div className="fr"><Field label="Tipo de evento"><input value={form.evento} onChange={set('evento')} placeholder="Ej: Baby shower, Casamiento..."/></Field><Field label="Fecha del evento"><input type="date" value={form.fecha_evento} onChange={set('fecha_evento')}/></Field></div>
        <div className="fr"><Field label="Teléfono"><input value={form.tel} onChange={set('tel')} placeholder="Contacto"/></Field><Field label="Email"><input type="email" value={form.email} onChange={set('email')} placeholder="email@..."/></Field></div>
        <Field label="Notas"><textarea value={form.notas} onChange={set('notas')} rows={2} style={{resize:'vertical'}} placeholder="Observaciones..."/></Field>
      </Modal>

      <Modal open={!!detailId} onClose={()=>{setDetailId(null);setDetail(null)}} title={detail?`🎁 Lista de ${detail.mama}`:'Cargando...'} size="lg">
        {loadingDetail ? <div style={{display:'flex',justifyContent:'center',padding:32}}><div className="spinner"/></div>
          : detail && (
            <div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
                {detail.papa&&<div style={{background:'var(--sf)',borderRadius:8,padding:'8px 14px'}}><div style={{fontSize:11,color:'var(--mu)'}}>Pareja</div><div style={{fontWeight:600}}>{detail.papa}</div></div>}
                {detail.fecha_evento&&<div style={{background:'var(--sf)',borderRadius:8,padding:'8px 14px'}}><div style={{fontSize:11,color:'var(--mu)'}}>Fecha evento</div><div style={{fontWeight:600}}>{new Date(detail.fecha_evento).toLocaleDateString('es-AR')}</div></div>}
              </div>
              <div className="table-wrap">
                <table><thead><tr><th>Producto</th><th style={{textAlign:'center'}}>Cant.</th><th>Comprado por</th><th>Estado</th></tr></thead>
                <tbody>
                  {(detail.items||[]).length===0?<tr><td colSpan={4} style={{textAlign:'center',padding:24,color:'var(--mu)'}}>Sin ítems</td></tr>
                    :(detail.items||[]).map((it,i)=>(
                      <tr key={i}><td>{it.nombre||it.prod_nombre||'—'}</td><td style={{textAlign:'center'}}>{it.cantidad}</td><td style={{fontSize:12}}>{it.comprador||'—'}</td>
                      <td><span className={`badge ${it.comprado?'badge-green':'badge-gray'}`}>{it.comprado?'Comprado':'Pendiente'}</span></td></tr>
                    ))}
                </tbody></table>
              </div>
            </div>
          )}
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={()=>setConfirm(null)}
        onConfirm={async()=>{try{await api('DELETE','/lista-bebe/'+confirm);toast('Lista eliminada','ok');load()}catch(e){toast(e.message,'err')}}}
        title="Eliminar lista" message="¿Eliminás esta lista de regalos?" confirmLabel="Sí, eliminar"/>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// AUDITORÍA
// ═══════════════════════════════════════════════════════════════
export function Auditoria() {
  const { api } = useApi()
  const { toast } = useToast()
  const { allSucs } = useApp()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ modulo:'', suc_id:'', desde:'', hasta:'' })
  const [page, setPage] = useState(1)
  const PER = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = Object.entries(filtros).filter(([,v])=>v).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&')
      const d = await api('GET', '/auditoria?' + qs + '&limit=200')
      setRows(Array.isArray(d)?d:[])
    } catch { toast('Error cargando auditoría','err') }
    finally { setLoading(false) }
  }, [filtros])

  useEffect(() => { load() }, [load])

  const setF = (f) => (e) => { setFiltros((p)=>({...p,[f]:e.target.value})); setPage(1) }
  const fmtDate = (d) => d?new Date(d).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'
  const MODS = ['ventas','caja','clientes','productos','presupuestos','pendientes','ctacte','gastos','transferencias','config','usuarios','sync']

  if (loading) return <Loader/>

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <select style={sel} value={filtros.modulo} onChange={setF('modulo')}><option value="">Todos los módulos</option>{MODS.map((m)=><option key={m} value={m}>{m}</option>)}</select>
        <select style={sel} value={filtros.suc_id} onChange={setF('suc_id')}><option value="">Todas las sucursales</option>{allSucs.map((s)=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
        <input type="date" value={filtros.desde} onChange={setF('desde')} style={{...sel,cursor:'default'}} placeholder="Desde"/>
        <input type="date" value={filtros.hasta} onChange={setF('hasta')} style={{...sel,cursor:'default'}} placeholder="Hasta"/>
        <button className="btn btn-secondary btn-sm" onClick={()=>{setFiltros({modulo:'',suc_id:'',desde:'',hasta:''});setPage(1)}}>Limpiar</button>
        <span style={{marginLeft:'auto',fontSize:12,color:'var(--mu)'}}>{rows.length} registros</span>
      </div>

      <div className="card" style={{padding:0}}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Descripción</th></tr></thead>
            <tbody>
              {rows.slice((page-1)*PER,page*PER).length===0
                ? <EmptyRow cols={5} icon="🔍" text="Sin registros para los filtros seleccionados"/>
                : rows.slice((page-1)*PER,page*PER).map((r) => (
                  <tr key={r.id}>
                    <td style={{fontSize:11,whiteSpace:'nowrap'}}>{fmtDate(r.fecha)}</td>
                    <td style={{fontSize:12,fontWeight:600}}>{r.usuario_nombre||'—'}</td>
                    <td><span className="badge badge-blue" style={{fontSize:10}}>{r.modulo}</span></td>
                    <td><span className="badge badge-gray" style={{fontSize:10}}>{r.accion}</span></td>
                    <td style={{fontSize:12,maxWidth:300,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.descripcion||'—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div style={{padding:'0 16px'}}><Pagination page={page} total={rows.length} perPage={PER} onChange={setPage}/></div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// REPORTES
// ═══════════════════════════════════════════════════════════════
const COLORS = ['#6366f1','#f97316','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899']

export function Reportes() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion, allSucs } = useApp()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [desde, setDesde] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().substr(0,10) })
  const [hasta, setHasta] = useState(new Date().toISOString().substr(0,10))
  const [suc, setSuc] = useState(sucSesion||'')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // No existe /api/reportes — todo viene del dashboard con rango de fechas
      const dash = await api('GET', `/dashboard?suc_id=${suc}&desde=${desde}&hasta=${hasta}`)
      setData({ dash, rep: null })
    } catch { toast('Error cargando reportes','err') }
    finally { setLoading(false) }
  }, [suc, desde, hasta])

  useEffect(() => { load() }, [load])

  if (loading) return <Loader text="Generando reporte..."/>
  const kpis = data?.dash?.kpis || {}
  const ventasMes = data?.dash?.ventas_mes || []
  const topProds = data?.dash?.top_productos || []
  const topClis = data?.dash?.top_clientes || []
  const porPago = data?.rep?.por_metodo_pago || []

  const fmtV = (v) => '$'+((v||0)/1000).toFixed(0)+'k'

  return (
    <div>
      {/* Filters */}
      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap',alignItems:'center',padding:'14px 16px',background:'var(--sf)',borderRadius:12,border:'1px solid var(--bd)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600}}>📅 Período:</div>
        <input type="date" value={desde} onChange={(e)=>setDesde(e.target.value)} style={{...sel,cursor:'default'}}/>
        <span style={{fontSize:13,color:'var(--mu)'}}>hasta</span>
        <input type="date" value={hasta} onChange={(e)=>setHasta(e.target.value)} style={{...sel,cursor:'default'}}/>
        <select style={sel} value={suc} onChange={(e)=>setSuc(e.target.value)}>
          <option value="">Todas las sucursales</option>
          {allSucs.map((s)=><option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={load}>Actualizar</button>
      </div>

      {/* KPI row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:20}}>
        {[
          {label:'Ventas totales',value:fmtM(kpis.ventas_mes?.t??0),color:'var(--ok)',icon:'💰'},
          {label:'Transacciones',value:kpis.ventas_mes?.n??0,icon:'🧾'},
          {label:'Ticket promedio',value:(kpis.ventas_mes?.n??0)>0?fmtM((kpis.ventas_mes?.t??0)/(kpis.ventas_mes?.n??1)):'—',icon:'📊'},
          {label:'Clientes nuevos',value:kpis.clientes_nuevos_mes||0,icon:'👥'},
          {label:'Productos vendidos',value:kpis.productos_vendidos||0,icon:'👕'},
        ].map((k)=>(
          <div key={k.label} className="kpi-card" style={{borderLeft:`3px solid ${k.color||'var(--ac)'}`}}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{fontSize:20,color:k.color}}>{k.value}</div>
            <div className="kpi-icon">{k.icon}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:16}}>
        {/* Ventas chart */}
        <div className="card">
          <div className="card-header"><h3>📈 Evolución de ventas</h3></div>
          {ventasMes.length>0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ventasMes} margin={{top:4,right:0,left:0,bottom:0}}>
                <XAxis dataKey="fecha" tick={{fontSize:10}} tickFormatter={(v)=>v.substr(5)}/>
                <YAxis tick={{fontSize:10}} tickFormatter={fmtV} width={40}/>
                <Tooltip formatter={(v)=>fmtM(v)} labelFormatter={(l)=>l}/>
                <Bar dataKey="total" fill="var(--ac)" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty-state" style={{padding:32}}><p>Sin datos para este período</p></div>}
        </div>

        {/* Por método de pago */}
        <div className="card">
          <div className="card-header"><h3>💳 Por método</h3></div>
          {porPago.length>0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={porPago} dataKey="total" nameKey="metodo" cx="50%" cy="50%" outerRadius={70} label={({metodo,percent})=>`${metodo} ${(percent*100).toFixed(0)}%`} labelLine={false} style={{fontSize:10}}>
                  {porPago.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={(v)=>fmtM(v)}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="empty-state" style={{padding:32}}><p>Sin datos</p></div>}
        </div>
      </div>

      {/* Comisiones por vendedor */}
      {data?.dash?.by_vendedor?.length > 0 && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card-header"><h3>💰 Comisiones por vendedor</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vendedor</th><th style={{textAlign:'right'}}>Ventas</th><th style={{textAlign:'right'}}>Total vendido</th><th style={{textAlign:'right'}}>Comisión</th></tr></thead>
              <tbody>
                {data.dash.by_vendedor.map((v,i)=>(
                  <tr key={i}>
                    <td style={{fontWeight:600}}>{v.nombre}</td>
                    <td style={{textAlign:'right'}}>{v.n}</td>
                    <td style={{textAlign:'right',fontWeight:700,color:'var(--ok)'}}>{fmtM(v.tot)}</td>
                    <td style={{textAlign:'right',fontWeight:700,color:'var(--ac)'}}>{fmtM(v.comision)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        {/* Top productos */}
        <div className="card">
          <div className="card-header"><h3>🏆 Top productos</h3></div>
          {topProds.length===0 ? <div className="empty-state"><p>Sin datos</p></div>
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {topProds.slice(0,8).map((p,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:22,height:22,borderRadius:'50%',background:'var(--sf)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'var(--mu)',flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.nombre}</div>
                      <div style={{height:4,background:'var(--bd)',borderRadius:2,marginTop:4}}><div style={{height:4,background:'var(--ac)',borderRadius:2,width:`${Math.min(100,(p.cantidad/topProds[0].cantidad)*100)}%`}}/></div>
                    </div>
                    <div style={{fontSize:12,color:'var(--mu)',flexShrink:0}}>{p.cantidad} u.</div>
                    <div style={{fontWeight:700,color:'var(--ok)',fontSize:13,flexShrink:0}}>{fmtM(p.total)}</div>
                  </div>
                ))}
              </div>}
        </div>

        {/* Top clientes */}
        <div className="card">
          <div className="card-header"><h3>👥 Top clientes</h3></div>
          {topClis.length===0 ? <div className="empty-state"><p>Sin datos</p></div>
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {topClis.slice(0,8).map((c,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:22,height:22,borderRadius:'50%',background:'var(--sf)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'var(--mu)',flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre}</div>
                      <div style={{fontSize:11,color:'var(--mu)'}}>{c.n_compras} compras</div>
                    </div>
                    <div style={{fontWeight:700,color:'var(--ok)',fontSize:13,flexShrink:0}}>{fmtM(c.total)}</div>
                  </div>
                ))}
              </div>}
        </div>
      </div>
    </div>
  )
}

const sel = {padding:'9px 12px',borderRadius:8,border:'1.5px solid var(--bd)',cursor:'pointer',fontSize:13,background:'var(--bg)',color:'var(--tx)'}
