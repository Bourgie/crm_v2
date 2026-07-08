import { useState, useEffect } from 'react'

const API = '/api/superadmin'

function saApi(method, path, body) {
  return fetch(API + path, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || d.message || 'Error'); return d })
}

const RUBROS = [{v:'ropa_infantil',l:'👶 Ropa infantil'},{v:'ropa',l:'👗 Ropa'},{v:'panaderia',l:'🍞 Panadería'},{v:'farmacia',l:'💊 Farmacia'},{v:'ferreteria',l:'🔧 Ferretería'},{v:'servicios',l:'💼 Servicios'},{v:'general',l:'🏪 General'}]
const TODOS_MODS = ['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','listabebe','transferencias','proveedores','gastos','reportes','auditoria','chat','pipeline','arca','tienda','webhooks','rrhh']
const MOD_LABELS = {pos:'🛒 POS',caja:'💰 Caja',clientes:'👥 Clientes',ventas:'📋 Ventas',productos:'👕 Productos',ctacte:'📒 Cta Cte',presupuestos:'📄 Presupuestos',pendientes:'🚚 Pendientes',listabebe:'🍼 Lista Bebé',transferencias:'🔄 Transferencias',proveedores:'📦 Proveedores',gastos:'💸 Gastos',reportes:'📈 Reportes',auditoria:'🔍 Auditoría',chat:'💬 Chat',pipeline:'📋 Pipeline',arca:'📄 ARCA',tienda:'🛒 Tienda',webhooks:'🔗 Webhooks',rrhh:'👥 RRHH'}
const PROS_ESTADOS = ['nuevo','contactado','interesado','calificado','cerrado_ganado','cerrado_perdido']
const PROS_EST_COLORS = { nuevo:'var(--ac)', contactado:'var(--warn)', interesado:'var(--ok)', calificado:'#06b6d4', cerrado_ganado:'#059669', cerrado_perdido:'var(--bad)' }
const PROS_EST_LABELS = { nuevo:'Nuevo', contactado:'Contactado', interesado:'Interesado', calificado:'Calificado', cerrado_ganado:'Cerrado (ganado)', cerrado_perdido:'Cerrado (perdido)' }
const SEG_TIPOS = ['llamada','email','whatsapp','reunion','nota','observacion']
const SEG_ICONS = { llamada:'📞', email:'📧', whatsapp:'💬', reunion:'🤝', nota:'📝', observacion:'👁️' }

const SIDEBAR = [
  ['dashboard', '📊 Dashboard'],
  ['empresas', '🏢 Empresas'],
  ['prospectos', '👥 Prospectos'],
  ['solicitudes', '📋 Solicitudes'],
  ['planes', '💼 Planes'],
  ['modulos', '🧩 Módulos'],
  ['landing', '🌐 Landing'],
  ['soporte', '🆘 Soporte'],
  ['audit', '📋 Auditoría'],
]

function K({ label, value, sub }) {
  return <><div className="kpi-label">{label}</div><div className="kpi-value">{value ?? '—'}</div>{sub && <div className="kpi-sub">{sub}</div>}</>
}

const S = {
  input: {},
  select: {},
  textarea: { resize: 'vertical' },
  chip: { display:'inline-flex',alignItems:'center',gap:4,padding:'2px 10px',borderRadius:99,fontSize:11,fontWeight:600 },
}

export default function Superadmin() {
  const [logged, setLogged] = useState(false)
  const [user, setUser] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const [dash, setDash] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [planes, setPlanes] = useState([])
  const [modulos, setModulos] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [audit, setAudit] = useState([])
  const [prospectos, setProspectos] = useState([])
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState({})
  const [impersonating, setImpersonating] = useState(null)

  const [loginForm, setLoginForm] = useState({ usuario: '', password: '' })
  const [loginErr, setLoginErr] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [passModal, setPassModal] = useState(false)
  const [passForm, setPassForm] = useState({ password_actual: '', password_nuevo: '', repetir: '' })

  const [empModal, setEmpModal] = useState(null)
  const [empForm, setEmpForm] = useState({ codigo: '', nombre: '', rubro: 'general', plan_id: '', vencimiento: '', umax: '5', smax: '2', email: '', password: '', mods_extra: [], mods_bloqueados: [] })
  const [empSaving, setEmpSaving] = useState(false)

  const [planModal, setPlanModal] = useState(null)
  const [planForm, setPlanForm] = useState({ codigo: '', nombre: '', descripcion: '', precio: '', modulos: [], umax: '', smax: '' })
  const [planSaving, setPlanSaving] = useState(false)

  const [prospForm, setProspForm] = useState({ nombre:'', telefono:'', email:'', empresa_interes:'', estado:'nuevo', notas:'', asignado_a:'' })
  const [prospModal, setProspModal] = useState(null)
  const [prospSaving, setProspSaving] = useState(false)
  const [prospFiltro, setProspFiltro] = useState('')
  const [prospDetalle, setProspDetalle] = useState(null)
  const [segForm, setSegForm] = useState({ tipo:'nota', descripcion:'' })
  const [segSaving, setSegSaving] = useState(false)

  const [tickets, setTickets] = useState([])
  const [ticketFiltro, setTicketFiltro] = useState('todos')
  const [ticketRespuesta, setTicketRespuesta] = useState('')
  const [ticketRespondiendo, setTicketRespondiendo] = useState(null)
  const [ticketSaving, setTicketSaving] = useState(false)

  const [landingFiltro, setLandingFiltro] = useState('todos')

  useEffect(() => {
    saApi('GET', '/me').then(r => { setLogged(true); setUser(r); loadAll() }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!logged) return
    let t
    function reset() { clearTimeout(t); t = setTimeout(() => saLogout(), 30 * 60 * 1000) }
    reset()
    window.addEventListener('click', reset)
    window.addEventListener('keydown', reset)
    return () => { clearTimeout(t); window.removeEventListener('click', reset); window.removeEventListener('keydown', reset) }
  }, [logged])

  async function saLogin() {
    setLoginLoading(true); setLoginErr('')
    try { const r = await saApi('POST', '/login', loginForm); setLogged(true); setUser(r); loadAll() }
    catch (e) { setLoginErr(e.message) }
    finally { setLoginLoading(false) }
  }

  async function saLogout() { try { await saApi('POST', '/logout') } catch {} setLogged(false); setUser(null); setImpersonating(null) }

  function loadAll() {
    loadDash(); loadEmpresas(); loadPlanes(); loadModulos(); loadSolicitudes(); loadAudit(); loadProspectos(); loadLanding(); loadTickets();
    try { const imp = JSON.parse(sessionStorage.getItem('SA_IMP') || 'null'); if (imp) setImpersonating(imp) } catch {}
  }

  async function loadDash() { try { const r = await saApi('GET', '/dashboard'); setDash(r) } catch {} }
  async function loadEmpresas() { try { const r = await saApi('GET', '/empresas'); setEmpresas(r) } catch {} }
  async function loadPlanes() { try { const r = await saApi('GET', '/planes'); setPlanes(r) } catch {} }
  async function loadModulos() { try { const r = await saApi('GET', '/modulos'); setModulos(r) } catch {} }
  async function loadSolicitudes() { try { setLoading(p=>({...p,sol:true})); const r = await saApi('GET', '/solicitudes'); setSolicitudes(r) } catch {} finally { setLoading(p=>({...p,sol:false})) } }
  async function loadAudit() { try { const r = await saApi('GET', '/auditoria'); setAudit(r) } catch {} }
  async function loadProspectos() { try { const r = await saApi('GET', '/prospectos'); setProspectos(r) } catch {} }
  async function loadLanding() { try { const r = await saApi('GET', '/landing-leads'); setLeads(r) } catch {} }
  async function loadTickets() { try { const r = await saApi('GET', '/solicitudes-soporte'); setTickets(r) } catch {} }
  async function responderTicket(id) {
    if (!ticketRespuesta.trim()) return
    setTicketSaving(true)
    try { await saApi('POST', '/solicitudes-soporte/' + id + '/responder', { respuesta: ticketRespuesta }); setTicketRespondiendo(null); setTicketRespuesta(''); loadTickets() }
    catch(e) { alert(e.message) }
    finally { setTicketSaving(false) }
  }
  async function eliminarTicket(id) { if (!confirm('¿Eliminar este ticket?')) return; try { await saApi('DELETE', '/solicitudes-soporte/' + id); loadTickets() } catch(e) { alert(e.message) } }

  async function cambiarPass() {
    if (passForm.password_nuevo.length < 8) { alert('Mínimo 8 caracteres'); return }
    if (passForm.password_nuevo !== passForm.repetir) { alert('Las contraseñas no coinciden'); return }
    try { await saApi('PUT', '/password', { password_actual: passForm.password_actual, password_nuevo: passForm.password_nuevo }); alert('✅ Contraseña actualizada'); setPassModal(false) }
    catch (e) { alert(e.message) }
  }

  function openNuevaEmpresa() {
    setEmpForm({ codigo: '', nombre: '', rubro: 'general', plan_id: '', vencimiento: '', umax: '5', smax: '2', email: '', password: '', mods_extra: [], mods_bloqueados: [] })
    setEmpModal('new')
  }

  function openEditEmpresa(e) {
    let me = e.modulos_extra || []; let mb = e.modulos_bloqueados || []
    if (typeof me === 'string') try { me = JSON.parse(me) } catch { me = [] }
    if (typeof mb === 'string') try { mb = JSON.parse(mb) } catch { mb = [] }
    setEmpForm({ codigo: e.codigo, nombre: e.nombre || '', rubro: e.rubro || 'general', plan_id: e.plan_id || '', vencimiento: e.vencimiento || '', umax: String(e.usuarios_max || ''), smax: String(e.sucursales_max || ''), email: '', password: '', mods_extra: me, mods_bloqueados: mb })
    setEmpModal(e)
  }

  function toggleEmpModExtra(m) { setEmpForm(p => ({ ...p, mods_extra: p.mods_extra.includes(m) ? p.mods_extra.filter(x => x !== m) : [...p.mods_extra, m] })) }
  function toggleEmpModBlock(m) { setEmpForm(p => ({ ...p, mods_bloqueados: p.mods_bloqueados.includes(m) ? p.mods_bloqueados.filter(x => x !== m) : [...p.mods_bloqueados, m] })) }

  async function saveEmpresa() {
    if (!empForm.codigo.trim() || !empForm.nombre.trim()) { alert('Código y nombre requeridos'); return }
    setEmpSaving(true)
    try {
      const body = { codigo: empForm.codigo.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''), nombre: empForm.nombre, rubro: empForm.rubro, plan_id: empForm.plan_id || null, vencimiento: empForm.vencimiento || null, usuarios_max: parseInt(empForm.umax) || 5, sucursales_max: parseInt(empForm.smax) || 2, modulos_extra: empForm.mods_extra, modulos_bloqueados: empForm.mods_bloqueados }
      if (empModal === 'new') {
        if (!empForm.email || !empForm.password) { alert('Email y contraseña requeridos'); setEmpSaving(false); return }
        await saApi('POST', '/empresas', { ...body, admin_email: empForm.email, admin_password: empForm.password })
        alert('✅ Empresa creada')
      } else { await saApi('PUT', '/empresas/' + empModal.codigo, body); alert('✅ Empresa actualizada') }
      setEmpModal(null); loadEmpresas()
    } catch (e) { alert(e.message) }
    finally { setEmpSaving(false) }
  }

  async function toggleEmpresaActiva(e) { try { await saApi('PUT', '/empresas/' + e.codigo, { activo: !e.activo }); loadEmpresas() } catch (e) { alert(e.message) } }

  async function loginAs(e) {
    try { const r = await saApi('POST', '/empresas/' + e.codigo + '/login-as'); sessionStorage.setItem('SA_IMP', JSON.stringify({ empresa: e.nombre || e.codigo, token: r.token })); setImpersonating({ empresa: e.nombre || e.codigo, token: r.token }) }
    catch (e) { alert(e.message) }
  }

  function openCRM() { if (!impersonating) return; window.open(window.location.origin + '/app/login?token=' + impersonating.token, '_blank') }

  async function backupEmpresa(codigo) {
    try { const r = await fetch(API + '/empresas/' + codigo + '/backup', { credentials: 'include' }); if (!r.ok) throw new Error('Error'); const blob = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = codigo + '_backup_' + new Date().toISOString().substr(0, 10) + '.db'; a.click() }
    catch (e) { alert('Error: ' + e.message) }
  }

  async function importBackup(codigo) {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.db'
    input.onchange = async () => { const file = input.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = async () => { try { await saApi('POST', '/empresas/' + codigo + '/import', { data_base64: reader.result.split(',')[1] || reader.result }); alert('✅ Base de datos importada') } catch (e) { alert(e.message) } }; reader.readAsDataURL(file) }
    input.click()
  }

  async function savePlan() {
    if (!planForm.codigo.trim() || !planForm.nombre.trim()) { alert('Código y nombre requeridos'); return }
    setPlanSaving(true)
    try {
      const body = { codigo: planForm.codigo.trim().toLowerCase(), nombre: planForm.nombre, descripcion: planForm.descripcion || '', precio: parseFloat(planForm.precio) || 0, modulos: planForm.modulos || [], limites: { usuarios: parseInt(planForm.umax) || 0, sucursales: parseInt(planForm.smax) || 0 }, activo: true }
      if (planModal === 'new') { await saApi('POST', '/planes', body); alert('✅ Plan creado') }
      else { await saApi('PUT', '/planes/' + planModal.id, body); alert('✅ Plan actualizado') }
      setPlanModal(null); loadPlanes()
    } catch (e) { alert(e.message) }
    finally { setPlanSaving(false) }
  }

  function openNuevoPlan() { setPlanForm({ codigo: '', nombre: '', descripcion: '', precio: '', modulos: [], umax: '', smax: '' }); setPlanModal('new') }
  function openEditPlan(p) {
    let mods = p.modulos || []; if (typeof mods === 'string') try { mods = JSON.parse(mods) } catch { mods = [] }
    let lims = p.limites || {}; if (typeof lims === 'string') try { lims = JSON.parse(lims) } catch { lims = {} }
    setPlanForm({ codigo: p.codigo, nombre: p.nombre || '', descripcion: p.descripcion || '', precio: String(p.precio || ''), modulos: mods, umax: String(lims.usuarios || ''), smax: String(lims.sucursales || '') })
    setPlanModal(p)
  }
  function togglePlanMod(m) { setPlanForm(p => ({ ...p, modulos: p.modulos.includes(m) ? p.modulos.filter(x => x !== m) : [...p.modulos, m] })) }

  async function aprobarSol(id) { try { await saApi('POST', '/solicitudes/' + id + '/aprobar'); loadSolicitudes(); loadEmpresas() } catch (e) { alert(e.message) } }
  async function rechazarSol(id) { try { await saApi('POST', '/solicitudes/' + id + '/rechazar'); loadSolicitudes() } catch (e) { alert(e.message) } }

  const planModulos = (pid) => { const p = planes.find(x => x.id === pid); if (!p) return []; let mods = p.modulos || []; if (typeof mods === 'string') try { mods = JSON.parse(mods) } catch { mods = [] }; return mods }

  function openNuevoProspecto() { setProspForm({ nombre:'', telefono:'', email:'', empresa_interes:'', estado:'nuevo', notas:'', asignado_a:'' }); setProspModal('new') }
  function openEditProspecto(p) { setProspForm({ nombre:p.nombre||'', telefono:p.telefono||'', email:p.email||'', empresa_interes:p.empresa_interes||'', estado:p.estado||'nuevo', notas:p.notas||'', asignado_a:p.asignado_a||'' }); setProspModal(p) }
  async function saveProspecto() {
    if (!prospForm.nombre.trim()) { alert('Nombre requerido'); return }
    setProspSaving(true)
    try {
      const body = { nombre:prospForm.nombre, telefono:prospForm.telefono, email:prospForm.email, empresa_interes:prospForm.empresa_interes, estado:prospForm.estado, notas:prospForm.notas, asignado_a:prospForm.asignado_a }
      if (prospModal === 'new') await saApi('POST', '/prospectos', body)
      else await saApi('PUT', '/prospectos/' + prospModal.id, body)
      setProspModal(null); loadProspectos()
      if (prospDetalle && prospModal !== 'new') setProspDetalle(p => ({ ...p, ...body }))
    } catch (e) { alert(e.message) }
    finally { setProspSaving(false) }
  }
  async function addSeguimiento() {
    if (!segForm.descripcion.trim()) { alert('Descripción requerida'); return }
    setSegSaving(true)
    try { await saApi('POST', '/prospectos/' + prospDetalle.id + '/seguimiento', segForm); setSegForm({ tipo:'nota', descripcion:'' }); loadProspectos(); const r = await saApi('GET', '/prospectos/' + prospDetalle.id); setProspDetalle(r) }
    catch (e) { alert(e.message) }
    finally { setSegSaving(false) }
  }
  async function cambiarEstadoProspecto(id, estado) { try { await saApi('POST', '/prospectos/' + id + '/cambiar-estado', { estado }); loadProspectos(); if (prospDetalle) setProspDetalle(p => ({ ...p, estado })) } catch (e) { alert(e.message) } }
  async function marcarLeadLeido(id) { try { await saApi('PUT', '/landing-leads/' + id + '/leer'); loadLanding() } catch {} }
  async function cargarDetalleProspecto(id) { try { setLoading(p=>({...p,det:true})); const r = await saApi('GET', '/prospectos/' + id); setProspDetalle(r) } catch {} finally { setLoading(p=>({...p,det:false})) } }

  const prospFiltrados = prospFiltro ? prospectos.filter(p => p.estado === prospFiltro) : prospectos
  const leadsFiltrados = landingFiltro === 'noleidos' ? leads.filter(l => !l.leido) : landingFiltro === 'leidos' ? leads.filter(l => l.leido) : leads

  if (!logged) return (
    <div style={{ maxWidth: 400, margin: '80px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>🔐</div>
      <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Super Admin</h2>
      <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 24 }}>FlexCRM — Panel de control</p>
      <div className="card" style={{ textAlign: 'left' }}>
        <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Usuario</label><input value={loginForm.usuario} onChange={e => setLoginForm(p => ({ ...p, usuario: e.target.value }))} placeholder="superadmin" style={{ width: '100%' }} /></div>
        <div style={{ marginBottom: 16 }}><label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Contraseña</label><input type="password" value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} onKeyDown={e => e.key === 'Enter' && saLogin()} style={{ width: '100%' }} /></div>
        {loginErr && <div style={{ color: 'var(--bad)', fontSize: 12, marginBottom: 12 }}>{loginErr}</div>}
        <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 10 }} onClick={saLogin} disabled={loginLoading}>{loginLoading ? '⏳' : '→ Ingresar'}</button>
      </div>
      <a href="/" style={{ color: 'var(--mu)', fontSize: 12, marginTop: 12, display: 'inline-block' }}>← Volver al CRM</a>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {impersonating && (
        <div style={{ background: 'var(--warn)', color: '#0f172a', padding: '8px 24px', fontSize: 12, fontWeight: 700, textAlign: 'center', flexShrink: 0 }}>
          ⚠️ Estás viendo el sistema como empresa: <strong>{impersonating.empresa}</strong> — <a href="#" onClick={e => { e.preventDefault(); openCRM() }} style={{ color: '#0f172a', textDecoration: 'underline' }}>Abrir CRM →</a>
        </div>
      )}

      {/* Top bar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)} className="hamburger" style={{ background: 'none', border: 'none', color: 'var(--mu)', cursor: 'pointer', fontSize: 18, padding: 4, display: 'inline-flex' }}>☰</button>
          <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>🏢 FlexCRM <span className="badge badge-orange" style={{ fontSize: 10 }}>Super Admin</span></div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--mu)' }}>{user?.nombre || ''}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPassModal(true)}>🔒</button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={saLogout}>Salir</button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: sidebarOpen ? 220 : 56, background: 'var(--sf)', borderRight: '1px solid var(--bd)', flexShrink: 0, transition: 'width .2s', overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingTop: 8 }}>
          {SIDEBAR.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: sidebarOpen ? '10px 16px' : '10px 0', justifyContent: sidebarOpen ? 'flex-start' : 'center',
                cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === k ? 'var(--ac)' : 'transparent',
                color: tab === k ? '#fff' : 'var(--mu)', border: 'none', borderLeft: tab === k ? '3px solid var(--ac)' : '3px solid transparent',
                width: '100%', textAlign: 'left', whiteSpace: 'nowrap', transition: 'all .15s',
                marginBottom: k === 'dashboard' ? 12 : 0,
                marginTop: k === 'soporte' ? 'auto' : 0,
              }}
              title={!sidebarOpen ? l : undefined}
            >
              <span style={{ fontSize: sidebarOpen ? 14 : 18, flexShrink: 0 }}>{l.split(' ')[0]}</span>
              {sidebarOpen && <span>{l.split(' ').slice(1).join(' ')}</span>}
              {k === 'solicitudes' && dash?.solicitudes_pendientes > 0 && (
                <span className="nav-badge pulse" style={{ background: 'var(--warn)', color: '#0f172a', marginLeft: 'auto' }}>
                  {dash.solicitudes_pendientes}
                </span>
              )}
              {k === 'landing' && leads.filter(l => !l.leido).length > 0 && (
                <span className="nav-badge pulse" style={{ marginLeft: 'auto' }}>
                  {leads.filter(l => !l.leido).length}
                </span>
              )}
              {k === 'soporte' && tickets.filter(t => t.estado === 'pendiente').length > 0 && (
                <span className="nav-badge" style={{ background: 'var(--warn)', color: '#0f172a', marginLeft: 'auto' }}>
                  {tickets.filter(t => t.estado === 'pendiente').length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {/* ═══════ DASHBOARD ═══════ */}
          {tab === 'dashboard' && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 16 }}>📊 Dashboard</h3>
              {dash && <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
                  <div className="kpi-card"><K label="Empresas activas" value={dash.empresas_activas} sub={(dash.nuevas_mes || 0) + ' nuevas este mes'} /></div>
                  <div className="kpi-card"><K label="MRR" value={'$' + (dash.mrr || 0).toLocaleString('es-AR')} sub="ingresos mensuales" /></div>
                  <div className="kpi-card"><K label="Vencen en 7 días" value={dash.vencer_7} sub={(dash.vencer_30 || 0) + ' en 30 días'} /></div>
                  <div className="kpi-card"><K label="Vencidas" value={dash.vencidas} sub="requieren renovación" /></div>
                  <div className="kpi-card"><K label="Solicitudes plan" value={dash.solicitudes_pendientes} sub="pendientes de aprobar" /></div>
                  <div className="kpi-card"><K label="Usuarios totales" value={dash.total_usuarios} /></div>
                  <div className="kpi-card" style={{ borderLeft: '3px solid var(--warn)' }}><K label="Prospectos" value={prospectos.length} sub="CRM leads" /></div>
                  <div className="kpi-card" style={{ borderLeft: '3px solid var(--ac2)' }}><K label="Landing leads" value={leads.length} sub={leads.filter(l => !l.leido).length + ' sin leer'} /></div>
                </div>
                {dash.growth && dash.growth.length > 0 && (
                  <div className="card" style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 12 }}>📈 Crecimiento — últimos 6 meses</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, padding: '0 8px' }}>
                      {(() => { const max = Math.max(...dash.growth.map(g => g.n), 1); return dash.growth.map((g, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div style={{ height: Math.max(4, (g.n / max) * 68), background: 'var(--ac)', borderRadius: '4px 4px 0 0', width: '100%', minHeight: 4, transition: 'height .3s' }} />
                          <div style={{ fontSize: 9, color: 'var(--mu)', whiteSpace: 'nowrap' }}>{g.mes?.substr(5, 2) + '/' + g.mes?.substr(2, 2)}</div>
                        </div>
                      )) })()}
                    </div>
                  </div>
                )}
              </>}
            </>
          )}

          {/* ═══════ EMPRESAS ═══════ */}
          {tab === 'empresas' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>Empresas / Tenants</h3>
                <button type="button" className="btn btn-primary" onClick={openNuevaEmpresa}>+ Nueva empresa</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Empresa</th><th>Código</th><th>Plan</th><th>Vencimiento</th><th>Usuarios</th><th>Suc.</th><th>Estado</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {empresas.map(e => {
                      const plan = planes.find(p => p.id === e.plan_id)
                      return <tr key={e.codigo}>
                        <td style={{ fontWeight: 600 }}>{e.nombre || e.codigo}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--mu)' }}>{e.codigo}</td>
                        <td>{plan?.nombre || '—'}</td>
                        <td style={{ color: e.vencimiento && e.vencimiento < new Date().toISOString().substr(0, 10) ? 'var(--bad)' : 'var(--tx)' }}>{e.vencimiento || '—'}</td>
                        <td>{e.usuarios_max || '∞'}</td>
                        <td>{e.sucursales_max || '∞'}</td>
                        <td><span className={`badge ${e.activo ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 11 }}>{e.activo ? 'Activo' : 'Suspendido'}</span></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditEmpresa(e)}>✏️</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => loginAs(e)}>🔑</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleEmpresaActiva(e)}>{e.activo ? '🚫' : '✅'}</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => backupEmpresa(e.codigo)}>💾</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => importBackup(e.codigo)}>📥</button>
                        </td>
                      </tr>
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════ PROSPECTOS ═══════ */}
          {tab === 'prospectos' && !prospDetalle && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>👥 Prospectos</h3>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <select value={prospFiltro} onChange={e => setProspFiltro(e.target.value)} style={{ ...S.select, width: 'auto', fontSize: 12, padding: '6px 10px' }}>
                    <option value="">Todos los estados</option>
                    {PROS_ESTADOS.map(e => <option key={e} value={e}>{PROS_EST_LABELS[e]}</option>)}
                  </select>
                  <button type="button" className="btn btn-primary btn-sm" onClick={openNuevoProspecto}>+ Nuevo</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={loadProspectos}>↻</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Empresa</th><th>Estado</th><th>Origen</th><th>Último contacto</th><th></th></tr></thead>
                  <tbody>
                    {prospFiltrados.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--mu)' }}>Sin prospectos</td></tr>}
                    {prospFiltrados.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                        <td style={{ fontSize: 12 }}>{p.telefono || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--ac)' }}>{p.email || '—'}</td>
                        <td style={{ fontSize: 12 }}>{p.empresa_interes || '—'}</td>
                        <td><span style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600,background:PROS_EST_COLORS[p.estado]+'22',color:PROS_EST_COLORS[p.estado]}}><span style={{ width: 6, height: 6, borderRadius: '50%', background: PROS_EST_COLORS[p.estado] || 'var(--mu)' }} />{PROS_EST_LABELS[p.estado] || p.estado}</span></td>
                        <td style={{ fontSize: 11, color: 'var(--mu)' }}>{p.origen || 'manual'}</td>
                        <td style={{ fontSize: 11, color: 'var(--mu)' }}>{p.fecha_ultimo_contacto ? new Date(p.fecha_ultimo_contacto).toLocaleDateString('es-AR') : '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => cargarDetalleProspecto(p.id)}>👁️</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditProspecto(p)}>✏️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Prospecto detalle */}
          {tab === 'prospectos' && prospDetalle && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)' }}>👤 {prospDetalle.nombre}</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={prospDetalle.estado} onChange={e => cambiarEstadoProspecto(prospDetalle.id, e.target.value)} style={{ ...S.select, width: 'auto', fontSize: 12, padding: '4px 8px' }}>
                    {PROS_ESTADOS.map(e => <option key={e} value={e}>{PROS_EST_LABELS[e]}</option>)}
                  </select>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditProspecto(prospDetalle)}>✏️</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setProspDetalle(null)}>← Volver</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, fontSize: 13 }}>
                <div><span style={{ color: 'var(--mu)' }}>Teléfono:</span> {prospDetalle.telefono || '—'}</div>
                <div><span style={{ color: 'var(--mu)' }}>Email:</span> {prospDetalle.email || '—'}</div>
                <div><span style={{ color: 'var(--mu)' }}>Empresa interés:</span> {prospDetalle.empresa_interes || '—'}</div>
                <div><span style={{ color: 'var(--mu)' }}>Origen:</span> {prospDetalle.origen || '—'}</div>
                <div><span style={{ color: 'var(--mu)' }}>Creado:</span> {prospDetalle.fecha_creacion ? new Date(prospDetalle.fecha_creacion).toLocaleDateString('es-AR') : '—'}</div>
                <div><span style={{ color: 'var(--mu)' }}>Estado:</span> <span style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600,background:PROS_EST_COLORS[prospDetalle.estado]+'22',color:PROS_EST_COLORS[prospDetalle.estado]}}><span style={{ width:6,height:6,borderRadius:'50%',background:PROS_EST_COLORS[prospDetalle.estado] }} />{PROS_EST_LABELS[prospDetalle.estado]}</span></div>
              </div>
              {prospDetalle.notas && <div style={{ background:'var(--sf)', padding:12, borderRadius:8, marginBottom:20, fontSize:12, color:'var(--mu)' }}><div style={{ fontWeight:600,marginBottom:4,color:'var(--mu)' }}>📝 Notas</div>{prospDetalle.notas}</div>}

              {/* Seguimiento */}
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--mu)', marginBottom: 10 }}>📋 Historial de seguimiento</h4>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <select value={segForm.tipo} onChange={e => setSegForm(p=>({...p,tipo:e.target.value}))} style={{ ...S.select, width: 'auto', fontSize: 12, padding: '6px 10px' }}>
                  {SEG_TIPOS.map(t => <option key={t} value={t}>{SEG_ICONS[t]} {t}</option>)}
                </select>
                <input value={segForm.descripcion} onChange={e => setSegForm(p=>({...p,descripcion:e.target.value}))} placeholder="Descripción..." style={{ ...S.input, flex: 1, minWidth: 200 }} onKeyDown={e => e.key === 'Enter' && addSeguimiento()} />
                <button type="button" className="btn btn-primary btn-sm" onClick={addSeguimiento} disabled={segSaving}>Agregar</button>
              </div>
              <div style={{ fontSize: 12 }}>
                {(prospDetalle.seguimiento || []).length === 0 && <div style={{ color:'#64748b', textAlign:'center', padding:20 }}>Sin seguimiento</div>}
                {(prospDetalle.seguimiento || []).map(s => (
                  <div key={s.id} style={{ display:'flex', gap:12, padding:'8px 0', borderTop:'1px solid var(--bd)', alignItems:'flex-start' }}>
                    <span style={{ flexShrink:0 }}>{SEG_ICONS[s.tipo] || '📝'}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                        <span style={{ fontWeight:600,textTransform:'capitalize' }}>{s.tipo}</span>
                        <span style={{ color:'var(--mu)',fontSize:11 }}>{s.fecha ? new Date(s.fecha).toLocaleString('es-AR') : '—'}</span>
                      </div>
                      <div style={{ color:'var(--mu)' }}>{s.descripcion}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════ SOLICITUDES ═══════ */}
          {tab === 'solicitudes' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>📋 Solicitudes de cambio de plan</h3>
                <button type="button" className="btn btn-secondary btn-sm" onClick={loadSolicitudes}>↻ Actualizar</button>
              </div>
              {solicitudes.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--mu)' }}>✅ Sin solicitudes pendientes</div> : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr><th>Fecha</th><th>Empresa</th><th>Tipo</th><th>Plan</th><th>Estado</th><th>Acciones</th></tr></thead>
                    <tbody>
                      {solicitudes.map(s => (
                        <tr key={s.id}>
                          <td>{s.fecha ? new Date(s.fecha).toLocaleDateString('es-AR') : '—'}</td>
                          <td>{s.empresa_id || '—'}</td>
                          <td><span className={`badge ${s.tipo === 'upgrade' ? 'badge-green' : 'badge-yellow'}`}>{s.tipo === 'upgrade' ? '⬆ Upgrade' : '⬇ Downgrade'}</span></td>
                          <td>{s.plan_id || '—'}</td>
                          <td><span className={`badge ${s.estado === 'pendiente' ? 'badge-yellow' : s.estado === 'aprobada' ? 'badge-green' : 'badge-red'}`}>{s.estado}</span></td>
                          <td>{s.estado === 'pendiente' && <><button type="button" className="btn btn-primary btn-sm" onClick={() => aprobarSol(s.id)} style={{background:'var(--ok)',marginRight:4}}>✅ Aprobar</button><button type="button" className="btn btn-danger btn-sm" onClick={() => rechazarSol(s.id)}>❌ Rechazar</button></>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══════ PLANES ═══════ */}
          {tab === 'planes' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>Planes de suscripción</h3>
                <button type="button" className="btn btn-primary" onClick={openNuevoPlan}>+ Nuevo plan</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {planes.map(p => {
                  let mods = p.modulos || []; if (typeof mods === 'string') try { mods = JSON.parse(mods) } catch { mods = [] }
                  let lims = p.limites || {}; if (typeof lims === 'string') try { lims = JSON.parse(lims) } catch { lims = {} }
                  return <div key={p.id} className="card" style={{ padding: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{p.nombre || p.codigo}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--ac)', marginBottom: 8 }}>${p.precio || 0}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--mu)' }}>/mes</span></div>
                    <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 10 }}>👥 {lims.usuarios || '∞'} usuarios · 🏪 {lims.sucursales || '∞'} sucursales · {mods.length} módulos</div>
                    <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 12 }}>{p.descripcion || ''}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                      {mods.map(m => <span key={m} className="badge badge-orange" style={{ fontSize: 10 }}>{MOD_LABELS[m] || m}</span>)}
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditPlan(p)}>✏️ Editar</button>
                  </div>
                })}
              </div>
            </div>
          )}

          {/* ═══════ MÓDULOS ═══════ */}
          {tab === 'modulos' && (
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 16 }}>Módulos del sistema</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {modulos.map(m => (
                  <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: 10 }}>
                    <span>{MOD_LABELS[m.codigo]?.split(' ')[0] || '🧩'}</span>
                    <span style={{ flex: 1 }}>{m.nombre || m.codigo}</span>
                    {m.premium ? <span className="badge badge-yellow" style={{ fontSize: 9 }}>⭐ Premium</span> : null}
                    {m.beta ? <span className="badge badge-green" style={{ fontSize: 9 }}>🧪 Beta</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════ LANDING ═══════ */}
          {tab === 'landing' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>🌐 Leads de Landing Page</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={landingFiltro} onChange={e => setLandingFiltro(e.target.value)} style={{ ...S.select, width: 'auto', fontSize: 12, padding: '6px 10px' }}>
                    <option value="todos">Todos ({leads.length})</option>
                    <option value="noleidos">No leídos ({leads.filter(l => !l.leido).length})</option>
                    <option value="leidos">Leídos ({leads.filter(l => l.leido).length})</option>
                  </select>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={loadLanding}>↻</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Fecha</th><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Empresa</th><th>Mensaje</th><th>Página</th><th></th></tr></thead>
                  <tbody>
                    {leadsFiltrados.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--mu)' }}>Sin leads</td></tr>}
                    {leadsFiltrados.map(l => (
                      <tr key={l.id} style={{ background: l.leido ? 'transparent' : 'rgba(249,115,22,.04)' }}>
                        <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{l.fecha ? new Date(l.fecha).toLocaleString('es-AR') : '—'}</td>
                        <td style={{ fontWeight: l.leido ? 400 : 700 }}>{l.nombre || '—'}</td>
                        <td style={{ fontSize: 12 }}>{l.telefono || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--ac)' }}>{l.email || '—'}</td>
                        <td style={{ fontSize: 12 }}>{l.empresa_interes || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--mu)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.mensaje || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--mu)' }}>{l.pagina || '—'}</td>
                        <td>{!l.leido && <button type="button" className="btn btn-primary btn-sm" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => marcarLeadLeido(l.id)}>✓ Leído</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════ SOPORTE ═══════ */}
          {tab === 'soporte' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>🆘 Solicitudes de soporte</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={ticketFiltro} onChange={e => setTicketFiltro(e.target.value)} style={{ ...S.select, width: 'auto', fontSize: 12, padding: '6px 10px' }}>
                    <option value="todos">Todos ({tickets.length})</option>
                    <option value="pendiente">Pendientes ({tickets.filter(t => t.estado === 'pendiente').length})</option>
                    <option value="respondida">Respondidos ({tickets.filter(t => t.estado === 'respondida').length})</option>
                  </select>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={loadTickets}>↻</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Fecha</th><th>Empresa</th><th>Asunto</th><th>Por</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {tickets.filter(t => ticketFiltro === 'todos' || t.estado === ticketFiltro).length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--mu)' }}>Sin solicitudes</td></tr>}
                    {tickets.filter(t => ticketFiltro === 'todos' || t.estado === ticketFiltro).map(t => (
                      <tr key={t.id} style={{ background: t.estado === 'pendiente' ? 'rgba(245,158,11,.04)' : 'transparent' }}>
                        <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{t.fecha ? new Date(t.fecha).toLocaleString('es-AR') : '—'}</td>
                        <td><span style={{ fontWeight: 600, fontSize: 12 }}>{t.empresa_nombre || t.empresa_id || '—'}</span></td>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>{t.asunto || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--mu)' }}>{t.creado_por || '—'}</td>
                        <td><span className={`badge ${t.estado==='pendiente'?'badge-yellow':'badge-green'}`}>{t.estado === 'pendiente' ? '⏳ Pendiente' : '✅ Respondida'}</span></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setTicketRespondiendo(t.id === ticketRespondiendo ? null : t.id); setTicketRespuesta('') }}>💬</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => eliminarTicket(t.id)}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Detalle expandido */}
              {ticketRespondiendo && (() => {
                const t = tickets.find(x => x.id === ticketRespondiendo)
                if (!t) return null
                return (
                  <div style={{ marginTop: 20, borderTop: '1px solid var(--bd)', paddingTop: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t.asunto}</h4>
                    <div style={{ background: 'var(--sf)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13, color: 'var(--mu)' }}>
                      <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 4 }}>De: {t.creado_por || '—'} · {t.empresa_nombre || t.empresa_id}</div>
                      {t.descripcion || 'Sin descripción'}
                    </div>
                    {t.estado === 'respondida' && t.respuesta && (
                      <div style={{ background: 'rgba(34,197,94,.06)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13, color: 'var(--mu)', border: '1px solid rgba(34,197,94,.2)' }}>
                        <div style={{ fontSize: 11, color: 'var(--ok)', marginBottom: 4, fontWeight: 600 }}>↩️ Respuesta de {t.respondido_por || 'admin'} · {t.fecha_respuesta ? new Date(t.fecha_respuesta).toLocaleString('es-AR') : ''}</div>
                        {t.respuesta}
                      </div>
                    )}
                    {t.estado === 'pendiente' && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <textarea value={ticketRespuesta} onChange={e => setTicketRespuesta(e.target.value)} placeholder="Escribí tu respuesta..." rows={3} style={{ ...S.textarea, flex: 1 }} />
                        <button type="button" className="btn btn-primary" onClick={() => responderTicket(t.id)} disabled={ticketSaving}>{ticketSaving ? '...' : 'Enviar'}</button>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ═══════ AUDITORÍA ═══════ */}
          {tab === 'audit' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>Log de auditoría</h3>
                <button type="button" className="btn btn-secondary btn-sm" onClick={loadAudit}>↻ Actualizar</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Fecha</th><th>Admin</th><th>Acción</th><th>Empresa</th><th>Detalle</th></tr></thead>
                  <tbody>
                    {audit.map(a => (
                      <tr key={a.id} style={{ fontSize: 12 }}>
                        <td style={{ whiteSpace: 'nowrap' }}>{a.fecha ? new Date(a.fecha).toLocaleString('es-AR') : '—'}</td>
                        <td>{a.admin_id || '—'}</td>
                        <td>{a.accion || '—'}</td>
                        <td>{a.empresa_id || '—'}</td>
                        <td style={{ color: 'var(--mu)' }}>{a.detalle || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Cambiar contraseña */}
      {passModal && (
        <div className="modal-overlay" onClick={() => setPassModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header"><h3>🔒 Cambiar contraseña</h3><button type="button" onClick={() => setPassModal(false)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label className="" style={{ display:'block',marginBottom:4 }}>Contraseña actual</label><input type="password" value={passForm.password_actual} onChange={e => setPassForm(p => ({ ...p, password_actual: e.target.value }))} style={S.input} /></div>
              <div><label className="" style={{ display:'block',marginBottom:4 }}>Nueva contraseña (mín. 8 chars)</label><input type="password" value={passForm.password_nuevo} onChange={e => setPassForm(p => ({ ...p, password_nuevo: e.target.value }))} style={S.input} /></div>
              <div><label className="" style={{ display:'block',marginBottom:4 }}>Repetir nueva</label><input type="password" value={passForm.repetir} onChange={e => setPassForm(p => ({ ...p, repetir: e.target.value }))} style={S.input} /></div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setPassModal(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={cambiarPass}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Empresa */}
      {empModal && (
        <div className="modal-overlay" onClick={() => setEmpModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header"><h3>{empModal === 'new' ? 'Nueva empresa' : 'Editar empresa: ' + empModal.codigo}</h3><button type="button" onClick={() => setEmpModal(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Código único *</label><input value={empForm.codigo} onChange={e => setEmpForm(p => ({ ...p, codigo: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} placeholder="entremimos" style={{ ...S.input, fontFamily:'monospace' }} disabled={empModal !== 'new'} /></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Nombre del negocio *</label><input value={empForm.nombre} onChange={e => setEmpForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Entremimos" style={S.input} /></div>
              </div>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Rubro</label><select value={empForm.rubro} onChange={e => setEmpForm(p => ({ ...p, rubro: e.target.value }))} style={S.select}>{RUBROS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Plan</label><select value={empForm.plan_id} onChange={e => setEmpForm(p => ({ ...p, plan_id: e.target.value }))} style={S.select}><option value="">Sin plan</option>{planes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Vencimiento</label><input type="date" value={empForm.vencimiento} onChange={e => setEmpForm(p => ({ ...p, vencimiento: e.target.value }))} style={S.input} /></div>
              </div>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Límite usuarios</label><input type="number" value={empForm.umax} onChange={e => setEmpForm(p => ({ ...p, umax: e.target.value }))} min="1" style={S.input} /></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Límite sucursales</label><input type="number" value={empForm.smax} onChange={e => setEmpForm(p => ({ ...p, smax: e.target.value }))} min="1" style={S.input} /></div>
              </div>
              {empModal === 'new' && (
                <div className="fr">
                  <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Email admin inicial</label><input value={empForm.email} onChange={e => setEmpForm(p => ({ ...p, email: e.target.value }))} type="email" placeholder="admin@empresa.com" style={S.input} /></div>
                  <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Contraseña admin</label><input type="password" value={empForm.password} onChange={e => setEmpForm(p => ({ ...p, password: e.target.value }))} placeholder="Mínimo 6 caracteres" style={S.input} /></div>
                </div>
              )}
              {empForm.plan_id && (
                <div>
                  <label className="" style={{ display:'block',marginBottom:4 }}>Módulos del plan</label>
                  <div style={{ fontSize: 11, color: 'var(--ac)', padding: 8, background: 'var(--sf)', borderRadius: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {planModulos(empForm.plan_id).map(m => <span key={m} className="badge badge-orange" style={{ fontSize: 10 }}>{MOD_LABELS[m] || m}</span>)}
                    {planModulos(empForm.plan_id).length === 0 && <span style={{ color: 'var(--mu)' }}>Sin módulos</span>}
                  </div>
                </div>
              )}
              {empModal !== 'new' && (
                <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 12, marginTop: 12 }}>
                  <label className="" style={{ marginBottom: 8, display: 'block' }}>🧩 Override de módulos (anula el plan)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ok)', marginBottom: 6 }}>✅ EXTRA habilitados</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8, background: 'var(--sf)', borderRadius: 6, minHeight: 32 }}>
                        {TODOS_MODS.filter(m => !planModulos(empForm.plan_id).includes(m)).map(m => (
                          <span key={m} onClick={() => toggleEmpModExtra(m)} style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10, cursor: 'pointer', background: empForm.mods_extra.includes(m) ? 'rgba(34,197,94,.2)' : 'var(--bg)', color: empForm.mods_extra.includes(m) ? 'var(--ok)' : 'var(--mu)', border: empForm.mods_extra.includes(m) ? '1px solid var(--ok)' : '1px solid var(--bd)' }}>{MOD_LABELS[m] || m}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--bad)', marginBottom: 6 }}>❌ BLOQUEADOS</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8, background: 'var(--sf)', borderRadius: 6, minHeight: 32 }}>
                        {planModulos(empForm.plan_id).map(m => (
                          <span key={m} onClick={() => toggleEmpModBlock(m)} style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10, cursor: 'pointer', background: empForm.mods_bloqueados.includes(m) ? 'rgba(239,68,68,.2)' : 'var(--bg)', color: empForm.mods_bloqueados.includes(m) ? 'var(--bad)' : 'var(--mu)', border: empForm.mods_bloqueados.includes(m) ? '1px solid var(--bad)' : '1px solid var(--bd)' }}>{MOD_LABELS[m] || m}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEmpModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={saveEmpresa} disabled={empSaving}>{empSaving ? '⏳ Guardando...' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Plan */}
      {planModal && (
        <div className="modal-overlay" onClick={() => setPlanModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header"><h3>{planModal === 'new' ? 'Nuevo plan' : 'Editar plan'}</h3><button type="button" onClick={() => setPlanModal(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Código</label><input value={planForm.codigo} onChange={e => setPlanForm(p => ({ ...p, codigo: e.target.value.toLowerCase() }))} placeholder="basico" style={{ ...S.input, fontFamily:'monospace' }} /></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Nombre</label><input value={planForm.nombre} onChange={e => setPlanForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Plan Básico" style={S.input} /></div>
              </div>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Precio ($/mes)</label><input type="number" value={planForm.precio} onChange={e => setPlanForm(p => ({ ...p, precio: e.target.value }))} min="0" style={S.input} /></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Descripción</label><input value={planForm.descripcion} onChange={e => setPlanForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Descripción corta" style={S.input} /></div>
              </div>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Límite usuarios</label><input type="number" value={planForm.umax} onChange={e => setPlanForm(p => ({ ...p, umax: e.target.value }))} min="0" placeholder="0 = ilimitado" style={S.input} /></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Límite sucursales</label><input type="number" value={planForm.smax} onChange={e => setPlanForm(p => ({ ...p, smax: e.target.value }))} min="0" placeholder="0 = ilimitado" style={S.input} /></div>
              </div>
              <div><label className="" style={{ display:'block',marginBottom:4 }}>Módulos incluidos</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8, background: 'var(--sf)', borderRadius: 6, marginTop: 4 }}>
                  {TODOS_MODS.map(m => (
                    <span key={m} onClick={() => togglePlanMod(m)} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer', background: planForm.modulos.includes(m) ? 'rgba(249,115,22,.15)' : 'var(--bg)', color: planForm.modulos.includes(m) ? 'var(--ac)' : 'var(--mu)', border: planForm.modulos.includes(m) ? '1px solid var(--ac)' : '1px solid var(--bd)' }}>{MOD_LABELS[m] || m}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setPlanModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={savePlan} disabled={planSaving}>{planSaving ? '⏳ Guardando...' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Prospecto */}
      {prospModal && (
        <div className="modal-overlay" onClick={() => setProspModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header"><h3>{prospModal === 'new' ? 'Nuevo prospecto' : 'Editar prospecto'}</h3><button type="button" onClick={() => setProspModal(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label className="" style={{ display:'block',marginBottom:4 }}>Nombre *</label><input value={prospForm.nombre} onChange={e => setProspForm(p=>({...p,nombre:e.target.value}))} placeholder="Nombre del prospecto" style={S.input} /></div>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Teléfono</label><input value={prospForm.telefono} onChange={e => setProspForm(p=>({...p,telefono:e.target.value}))} placeholder="+54..." style={S.input} /></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Email</label><input value={prospForm.email} onChange={e => setProspForm(p=>({...p,email:e.target.value}))} type="email" placeholder="..." style={S.input} /></div>
              </div>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Empresa interés</label><input value={prospForm.empresa_interes} onChange={e => setProspForm(p=>({...p,empresa_interes:e.target.value}))} placeholder="..." style={S.input} /></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Estado</label><select value={prospForm.estado} onChange={e => setProspForm(p=>({...p,estado:e.target.value}))} style={S.select}>{PROS_ESTADOS.map(e => <option key={e} value={e}>{PROS_EST_LABELS[e]}</option>)}</select></div>
              </div>
              <div><label className="" style={{ display:'block',marginBottom:4 }}>Notas</label><textarea value={prospForm.notas} onChange={e => setProspForm(p=>({...p,notas:e.target.value}))} rows={3} style={S.textarea} /></div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setProspModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={saveProspecto} disabled={prospSaving}>{prospSaving ? '⏳' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
