import { useState, useEffect, useCallback } from 'react'

const API = '/api/superadmin'

function saApi(method, path, body) {
  const token = localStorage.getItem('SA_TOKEN')
  return fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || d.message || 'Error'); return d })
}

const RUBROS = [{v:'ropa_infantil',l:'👶 Ropa infantil'},{v:'ropa',l:'👗 Ropa'},{v:'panaderia',l:'🍞 Panadería'},{v:'farmacia',l:'💊 Farmacia'},{v:'ferreteria',l:'🔧 Ferretería'},{v:'servicios',l:'💼 Servicios'},{v:'general',l:'🏪 General'}]
const TODOS_MODS = ['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','listabebe','transferencias','proveedores','gastos','reportes','auditoria','chat','pipeline','arca','tienda','webhooks','rrhh']
const MOD_LABELS = {pos:'🛒 POS',caja:'💰 Caja',clientes:'👥 Clientes',ventas:'📋 Ventas',productos:'👕 Productos',ctacte:'📒 Cta Cte',presupuestos:'📄 Presupuestos',pendientes:'🚚 Pendientes',listabebe:'🍼 Lista Bebé',transferencias:'🔄 Transferencias',proveedores:'📦 Proveedores',gastos:'💸 Gastos',reportes:'📈 Reportes',auditoria:'🔍 Auditoría',chat:'💬 Chat',pipeline:'📋 Pipeline',arca:'📄 ARCA',tienda:'🛒 Tienda',webhooks:'🔗 Webhooks',rrhh:'👥 RRHH'}

export default function Superadmin() {
  const [logged, setLogged] = useState(false)
  const [user, setUser] = useState(null)
  const [tab, setTab] = useState('empresas')
  // Dashboard data
  const [dash, setDash] = useState(null)
  // Empresas
  const [empresas, setEmpresas] = useState([])
  const [planes, setPlanes] = useState([])
  const [modulos, setModulos] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [audit, setAudit] = useState([])
  // UI state
  const [loading, setLoading] = useState({})
  const [impersonating, setImpersonating] = useState(null)

  const [loginForm, setLoginForm] = useState({ usuario: '', password: '' })
  const [loginErr, setLoginErr] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [passModal, setPassModal] = useState(false)
  const [passForm, setPassForm] = useState({ password_actual: '', password_nuevo: '', repetir: '' })

  // Empresa modal
  const [empModal, setEmpModal] = useState(null)
  const [empForm, setEmpForm] = useState({ codigo: '', nombre: '', rubro: 'general', plan_id: '', vencimiento: '', umax: '5', smax: '2', email: '', password: '', mods_extra: [], mods_bloqueados: [] })
  const [empSaving, setEmpSaving] = useState(false)

  // Plan modal
  const [planModal, setPlanModal] = useState(null)
  const [planForm, setPlanForm] = useState({ codigo: '', nombre: '', descripcion: '', precio: '', modulos: [], umax: '', smax: '' })
  const [planSaving, setPlanSaving] = useState(false)

  const isSa = () => !!localStorage.getItem('SA_TOKEN')

  useEffect(() => {
    if (isSa()) { setLogged(true); loadAll() }
    // Inactivity timeout 30min
    let t;
    function reset() { clearTimeout(t); t = setTimeout(() => { localStorage.removeItem('SA_TOKEN'); window.location.reload() }, 30 * 60 * 1000) }
    if (isSa()) { reset(); window.addEventListener('click', reset); window.addEventListener('keydown', reset) }
    return () => { clearTimeout(t); window.removeEventListener('click', reset); window.removeEventListener('keydown', reset) }
  }, [])

  async function saLogin() {
    setLoginLoading(true); setLoginErr('')
    try {
      const r = await saApi('POST', '/login', loginForm)
      localStorage.setItem('SA_TOKEN', r.token)
      setLogged(true); setUser(r)
      loadAll()
    } catch (e) { setLoginErr(e.message) }
    finally { setLoginLoading(false) }
  }

  function saLogout() { localStorage.removeItem('SA_TOKEN'); setLogged(false); setUser(null); setImpersonating(null) }

  function loadAll() {
    loadDash(); loadEmpresas(); loadPlanes(); loadModulos(); loadSolicitudes(); loadAudit()
    // Check if impersonating from stored preference
    try { const imp = JSON.parse(sessionStorage.getItem('SA_IMP') || 'null'); if (imp) setImpersonating(imp) } catch {}
  }

  async function loadDash() { try { const r = await saApi('GET', '/dashboard'); setDash(r) } catch {} }
  async function loadEmpresas() { try { const r = await saApi('GET', '/empresas'); setEmpresas(r) } catch {} }
  async function loadPlanes() { try { const r = await saApi('GET', '/planes'); setPlanes(r) } catch {} }
  async function loadModulos() { try { const r = await saApi('GET', '/modulos'); setModulos(r) } catch {} }
  async function loadSolicitudes() { try { setLoading(p=>({...p,sol:true})); const r = await saApi('GET', '/solicitudes'); setSolicitudes(r) } catch {} finally { setLoading(p=>({...p,sol:false})) } }
  async function loadAudit() { try { const r = await saApi('GET', '/auditoria'); setAudit(r) } catch {} }

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
    let me = e.modulos_extra || []
    let mb = e.modulos_bloqueados || []
    if (typeof me === 'string') try { me = JSON.parse(me) } catch { me = [] }
    if (typeof mb === 'string') try { mb = JSON.parse(mb) } catch { mb = [] }
    setEmpForm({
      codigo: e.codigo, nombre: e.nombre || '', rubro: e.rubro || 'general',
      plan_id: e.plan_id || '', vencimiento: e.vencimiento || '',
      umax: String(e.usuarios_max || ''), smax: String(e.sucursales_max || ''),
      email: '', password: '', mods_extra: me, mods_bloqueados: mb,
    })
    setEmpModal(e)
  }

  function toggleEmpModExtra(m) {
    setEmpForm(p => ({ ...p, mods_extra: p.mods_extra.includes(m) ? p.mods_extra.filter(x => x !== m) : [...p.mods_extra, m] }))
  }
  function toggleEmpModBlock(m) {
    setEmpForm(p => ({ ...p, mods_bloqueados: p.mods_bloqueados.includes(m) ? p.mods_bloqueados.filter(x => x !== m) : [...p.mods_bloqueados, m] }))
  }

  async function saveEmpresa() {
    if (!empForm.codigo.trim() || !empForm.nombre.trim()) { alert('Código y nombre requeridos'); return }
    setEmpSaving(true)
    try {
      const body = {
        codigo: empForm.codigo.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
        nombre: empForm.nombre, rubro: empForm.rubro, plan_id: empForm.plan_id || null,
        vencimiento: empForm.vencimiento || null,
        usuarios_max: parseInt(empForm.umax) || 5, sucursales_max: parseInt(empForm.smax) || 2,
        modulos_extra: empForm.mods_extra, modulos_bloqueados: empForm.mods_bloqueados,
      }
      if (empModal === 'new') {
        if (!empForm.email || !empForm.password) { alert('Email y contraseña requeridos'); setEmpSaving(false); return }
        await saApi('POST', '/empresas', { ...body, admin_email: empForm.email, admin_password: empForm.password })
        alert('✅ Empresa creada')
      } else {
        await saApi('PUT', '/empresas/' + empModal.codigo, body)
        alert('✅ Empresa actualizada')
      }
      setEmpModal(null); loadEmpresas()
    } catch (e) { alert(e.message) }
    finally { setEmpSaving(false) }
  }

  async function toggleEmpresaActiva(e) {
    try { await saApi('PUT', '/empresas/' + e.codigo, { activo: !e.activo }); loadEmpresas() }
    catch (e) { alert(e.message) }
  }

  async function loginAs(e) {
    try {
      const r = await saApi('POST', '/empresas/' + e.codigo + '/login-as')
      sessionStorage.setItem('SA_IMP', JSON.stringify({ empresa: e.nombre || e.codigo, token: r.token }))
      setImpersonating({ empresa: e.nombre || e.codigo, token: r.token })
    } catch (e) { alert(e.message) }
  }

  function openCRM() {
    if (!impersonating) return
    const base = window.location.origin
    window.open(base + '/app/login?token=' + impersonating.token, '_blank')
  }

  async function backupEmpresa(codigo) {
    try {
      const blob = await fetch(API + '/empresas/' + codigo + '/backup', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('SA_TOKEN') }
      }).then(r => { if (!r.ok) throw new Error('Error'); return r.blob() })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = codigo + '_backup_' + new Date().toISOString().substr(0, 10) + '.db'; a.click()
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function importBackup(codigo) {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.db'
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          await saApi('POST', '/empresas/' + codigo + '/import', { data_base64: reader.result.split(',')[1] || reader.result })
          alert('✅ Base de datos importada')
        } catch (e) { alert(e.message) }
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  async function savePlan() {
    if (!planForm.codigo.trim() || !planForm.nombre.trim()) { alert('Código y nombre requeridos'); return }
    setPlanSaving(true)
    try {
      const body = {
        codigo: planForm.codigo.trim().toLowerCase(), nombre: planForm.nombre,
        descripcion: planForm.descripcion || '', precio: parseFloat(planForm.precio) || 0,
        modulos: planForm.modulos || [], limites: { usuarios: parseInt(planForm.umax) || 0, sucursales: parseInt(planForm.smax) || 0 },
      }
      if (planModal === 'new') { await saApi('POST', '/planes', body); alert('✅ Plan creado') }
      else { await saApi('PUT', '/planes/' + planModal.id, body); alert('✅ Plan actualizado') }
      setPlanModal(null); loadPlanes()
    } catch (e) { alert(e.message) }
    finally { setPlanSaving(false) }
  }

  function openNuevoPlan() { setPlanForm({ codigo: '', nombre: '', descripcion: '', precio: '', modulos: [], umax: '', smax: '' }); setPlanModal('new') }
  function openEditPlan(p) {
    let mods = p.modulos || []
    if (typeof mods === 'string') try { mods = JSON.parse(mods) } catch { mods = [] }
    let lims = p.limites || {}
    if (typeof lims === 'string') try { lims = JSON.parse(lims) } catch { lims = {} }
    setPlanForm({ codigo: p.codigo, nombre: p.nombre || '', descripcion: p.descripcion || '', precio: String(p.precio || ''), modulos: mods, umax: String(lims.usuarios || ''), smax: String(lims.sucursales || '') })
    setPlanModal(p)
  }

  function togglePlanMod(m) {
    setPlanForm(p => ({ ...p, modulos: p.modulos.includes(m) ? p.modulos.filter(x => x !== m) : [...p.modulos, m] }))
  }

  async function aprobarSol(id) {
    try { await saApi('POST', '/solicitudes/' + id + '/aprobar'); loadSolicitudes(); loadEmpresas() }
    catch (e) { alert(e.message) }
  }
  async function rechazarSol(id) {
    try { await saApi('POST', '/solicitudes/' + id + '/rechazar'); loadSolicitudes() }
    catch (e) { alert(e.message) }
  }

  const planModulos = (pid) => {
    const p = planes.find(x => x.id === pid)
    if (!p) return []
    let mods = p.modulos || []
    if (typeof mods === 'string') try { mods = JSON.parse(mods) } catch { mods = [] }
    return mods
  }

  if (!logged) return (
    <div style={{ maxWidth: 400, margin: '80px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>🔐</div>
      <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Super Admin</h2>
      <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 24 }}>FlexCRM — Panel de control</p>
      <div className="card" style={{ textAlign: 'left' }}>
        <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Usuario</label><input value={loginForm.usuario} onChange={e => setLoginForm(p => ({ ...p, usuario: e.target.value }))} placeholder="superadmin" style={{ width: '100%' }} /></div>
        <div style={{ marginBottom: 16 }}><label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Contraseña</label><input type="password" value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} onKeyDown={e => e.key === 'Enter' && saLogin()} style={{ width: '100%' }} /></div>
        {loginErr && <div style={{ color: 'var(--bad)', fontSize: 12, marginBottom: 12 }}>{loginErr}</div>}
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 10 }} onClick={saLogin} disabled={loginLoading}>{loginLoading ? '⏳' : '→ Ingresar'}</button>
      </div>
      <a href="/" style={{ color: 'var(--mu)', fontSize: 12, marginTop: 12, display: 'inline-block' }}>← Volver al CRM</a>
    </div>
  )

  return (
    <div>
      {/* Impersonation banner */}
      {impersonating && (
        <div style={{ background: '#f59e0b', color: '#0f172a', padding: '8px 24px', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
          ⚠️ Estás viendo el sistema como empresa: <strong>{impersonating.empresa}</strong> — <a href="#" onClick={e => { e.preventDefault(); openCRM() }} style={{ color: '#0f172a', textDecoration: 'underline' }}>Abrir CRM →</a>
        </div>
      )}

      {/* Top bar */}
      <div style={{ background: '#1e293b', padding: '0 24px', height: 52, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>🏢 FlexCRM <span style={{ background: '#6366f1', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 20 }}>Super Admin</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>{user?.nombre || ''}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setPassModal(true)}>🔒 Contraseña</button>
          <button className="btn btn-secondary btn-sm" onClick={saLogout}>Salir</button>
        </div>
      </div>

      <div style={{ maxWidth: 1300, margin: '0 auto', padding: 24 }}>
        {/* KPI Cards */}
        {dash && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div className="kcard green"><K label="Empresas activas" value={dash.empresas_activas} sub={dash.nuevas_mes + ' nuevas este mes'} /></div>
              <div className="kcard blue"><K label="MRR" value={'$' + (dash.mrr || 0).toLocaleString('es-AR')} sub="ingresos mensuales" /></div>
              <div className="kcard warn"><K label="Vencen en 7 días" value={dash.vencer_7} sub={dash.vencer_30 + ' en 30 días'} /></div>
              <div className="kcard red"><K label="Vencidas" value={dash.vencidas} sub="requieren renovación" /></div>
              <div className="kcard purple"><K label="Solicitudes plan" value={dash.solicitudes_pendientes} sub="pendientes de aprobar" /></div>
              <div className="kcard"><K label="Usuarios totales" value={dash.total_usuarios} /></div>
            </div>
            {/* Growth chart */}
            {dash.growth && dash.growth.length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 12 }}>📈 Crecimiento — últimos 6 meses</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, padding: '0 8px' }}>
                  {(() => { const max = Math.max(...dash.growth.map(g => g.n), 1); return dash.growth.map((g, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ height: Math.max(4, (g.n / max) * 68), background: '#6366f1', borderRadius: '4px 4px 0 0', width: '100%', minHeight: 4, transition: 'height .3s' }} />
                      <div style={{ fontSize: 9, color: '#64748b', whiteSpace: 'nowrap' }}>{g.mes?.substr(5, 2) + '/' + g.mes?.substr(2, 2)}</div>
                    </div>
                  )) })()}
                </div>
              </div>
            )}
          </>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid #1e293b', flexWrap: 'wrap' }}>
          {[
            ['empresas', '🏢 Empresas'],
            ['solicitudes', '📋 Solicitudes' + (dash?.solicitudes_pendientes ? ' · ' + dash.solicitudes_pendientes : '')],
            ['planes', '💼 Planes'],
            ['modulos', '🧩 Módulos'],
            ['audit', '📋 Auditoría'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', color: tab === k ? '#6366f1' : '#64748b', borderBottom: tab === k ? '2px solid #6366f1' : '2px solid transparent', marginBottom: -2 }}>
              {l}
            </button>
          ))}
        </div>

        {/* TAB: Empresas */}
        {tab === 'empresas' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Empresas / Tenants</h3>
              <button className="btn btn-primary" onClick={openNuevaEmpresa}>+ Nueva empresa</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="sa-table">
                <thead><tr><th>Empresa</th><th>Código</th><th>Plan</th><th>Vencimiento</th><th>Usuarios</th><th>Suc.</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {empresas.map(e => {
                    const plan = planes.find(p => p.id === e.plan_id)
                    return <tr key={e.codigo}>
                      <td style={{ fontWeight: 600 }}>{e.nombre || e.codigo}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{e.codigo}</td>
                      <td>{plan?.nombre || '—'}</td>
                      <td style={{ color: e.vencimiento && e.vencimiento < new Date().toISOString().substr(0, 10) ? '#f87171' : '#e2e8f0' }}>{e.vencimiento || '—'}</td>
                      <td>{e.usuarios_max || '∞'}</td>
                      <td>{e.sucursales_max || '∞'}</td>
                      <td><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: e.activo ? '#16a34a33' : '#dc262633', color: e.activo ? '#4ade80' : '#f87171' }}>{e.activo ? 'Activo' : 'Suspendido'}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditEmpresa(e)}>✏️</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => loginAs(e)}>🔑</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => toggleEmpresaActiva(e)}>{e.activo ? '🚫' : '✅'}</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => backupEmpresa(e.codigo)}>💾</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => importBackup(e.codigo)}>📥</button>
                      </td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: Solicitudes */}
        {tab === 'solicitudes' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>📋 Solicitudes de cambio de plan</h3>
              <button className="btn btn-secondary btn-sm" onClick={loadSolicitudes}>↻ Actualizar</button>
            </div>
            {solicitudes.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>✅ Sin solicitudes pendientes</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="sa-table">
                  <thead><tr><th>Fecha</th><th>Empresa</th><th>Tipo</th><th>Plan</th><th>Estado</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {solicitudes.map(s => (
                      <tr key={s.id}>
                        <td>{s.fecha ? new Date(s.fecha).toLocaleDateString('es-AR') : '—'}</td>
                        <td>{s.empresa_id || '—'}</td>
                        <td><span className="badge" style={{ background: s.tipo === 'upgrade' ? '#16a34a33' : '#ca8a0433', color: s.tipo === 'upgrade' ? '#4ade80' : '#fbbf24' }}>{s.tipo === 'upgrade' ? '⬆ Upgrade' : '⬇ Downgrade'}</span></td>
                        <td>{s.plan_id || '—'}</td>
                        <td><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.estado === 'pendiente' ? '#ca8a0433' : s.estado === 'aprobada' ? '#16a34a33' : '#dc262633', color: s.estado === 'pendiente' ? '#fbbf24' : s.estado === 'aprobada' ? '#4ade80' : '#f87171' }}>{s.estado}</span></td>
                        <td>{s.estado === 'pendiente' && <><button className="btn btn-sm" style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', marginRight: 4 }} onClick={() => aprobarSol(s.id)}>✅ Aprobar</button><button className="btn btn-sm" style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }} onClick={() => rechazarSol(s.id)}>❌ Rechazar</button></>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: Planes */}
        {tab === 'planes' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Planes de suscripción</h3>
              <button className="btn btn-primary" onClick={openNuevoPlan}>+ Nuevo plan</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {planes.map(p => {
                let mods = p.modulos || []
                if (typeof mods === 'string') try { mods = JSON.parse(mods) } catch { mods = [] }
                let lims = p.limites || {}
                if (typeof lims === 'string') try { lims = JSON.parse(lims) } catch { lims = {} }
                return <div key={p.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{p.nombre || p.codigo}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#6366f1', marginBottom: 8 }}>${p.precio || 0}<span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>/mes</span></div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>👥 {lims.usuarios || '∞'} usuarios · 🏪 {lims.sucursales || '∞'} sucursales · {mods.length} módulos</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>{p.descripcion || ''}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                    {mods.map(m => <span key={m} style={{ padding: '1px 6px', borderRadius: 10, fontSize: 10, background: '#6366f133', color: '#a5b4fc' }}>{MOD_LABELS[m] || m}</span>)}
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEditPlan(p)}>✏️ Editar</button>
                </div>
              })}
            </div>
          </div>
        )}

        {/* TAB: Módulos */}
        {tab === 'modulos' && (
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 16 }}>Módulos del sistema</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              {modulos.map(m => (
                <div key={m.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span>{MOD_LABELS[m.codigo]?.split(' ')[0] || '🧩'}</span>
                  <span style={{ flex: 1 }}>{m.nombre || m.codigo}</span>
                  {m.premium ? <span style={{ fontSize: 10, color: '#f59e0b' }}>⭐ Premium</span> : null}
                  {m.beta ? <span style={{ fontSize: 10, color: '#22c55e' }}>🧪 Beta</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: Auditoría */}
        {tab === 'audit' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Log de auditoría</h3>
              <button className="btn btn-secondary btn-sm" onClick={loadAudit}>↻ Actualizar</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="sa-table">
                <thead><tr><th>Fecha</th><th>Admin</th><th>Acción</th><th>Empresa</th><th>Detalle</th></tr></thead>
                <tbody>
                  {audit.map(a => (
                    <tr key={a.id} style={{ fontSize: 12 }}>
                      <td style={{ whiteSpace: 'nowrap' }}>{a.fecha ? new Date(a.fecha).toLocaleString('es-AR') : '—'}</td>
                      <td>{a.admin_id || '—'}</td>
                      <td>{a.accion || '—'}</td>
                      <td>{a.empresa_id || '—'}</td>
                      <td style={{ color: '#94a3b8' }}>{a.detalle || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Change password */}
      {passModal && (
        <div className="modal-overlay" onClick={() => setPassModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h3>🔒 Cambiar contraseña</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <div><label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Contraseña actual</label><input type="password" value={passForm.password_actual} onChange={e => setPassForm(p => ({ ...p, password_actual: e.target.value }))} style={{ width: '100%' }} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Nueva contraseña (mín. 8 chars)</label><input type="password" value={passForm.password_nuevo} onChange={e => setPassForm(p => ({ ...p, password_nuevo: e.target.value }))} style={{ width: '100%' }} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Repetir nueva</label><input type="password" value={passForm.repetir} onChange={e => setPassForm(p => ({ ...p, repetir: e.target.value }))} style={{ width: '100%' }} /></div>
            </div>
            <div className="modal-footer" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setPassModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={cambiarPass}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Empresa */}
      {empModal && (
        <div className="modal-overlay" onClick={() => setEmpModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h3>{empModal === 'new' ? 'Nueva empresa' : 'Editar empresa: ' + empModal.codigo}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <div className="fr">
                <div><label className="field-label">Código único *</label><input value={empForm.codigo} onChange={e => setEmpForm(p => ({ ...p, codigo: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} placeholder="entremimos" style={{ fontFamily: 'monospace', width: '100%' }} disabled={empModal !== 'new'} /></div>
                <div><label className="field-label">Nombre del negocio *</label><input value={empForm.nombre} onChange={e => setEmpForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Entremimos" style={{ width: '100%' }} /></div>
              </div>
              <div className="fr3">
                <div><label className="field-label">Rubro</label><select value={empForm.rubro} onChange={e => setEmpForm(p => ({ ...p, rubro: e.target.value }))} style={{ width: '100%' }}>{RUBROS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select></div>
                <div><label className="field-label">Plan</label><select value={empForm.plan_id} onChange={e => setEmpForm(p => ({ ...p, plan_id: e.target.value }))} style={{ width: '100%' }}><option value="">Sin plan</option>{planes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                <div><label className="field-label">Vencimiento</label><input type="date" value={empForm.vencimiento} onChange={e => setEmpForm(p => ({ ...p, vencimiento: e.target.value }))} style={{ width: '100%' }} /></div>
              </div>
              <div className="fr">
                <div><label className="field-label">Límite usuarios</label><input type="number" value={empForm.umax} onChange={e => setEmpForm(p => ({ ...p, umax: e.target.value }))} min="1" style={{ width: '100%' }} /></div>
                <div><label className="field-label">Límite sucursales</label><input type="number" value={empForm.smax} onChange={e => setEmpForm(p => ({ ...p, smax: e.target.value }))} min="1" style={{ width: '100%' }} /></div>
              </div>
              {empModal === 'new' && (
                <div className="fr">
                  <div><label className="field-label">Email admin inicial</label><input value={empForm.email} onChange={e => setEmpForm(p => ({ ...p, email: e.target.value }))} type="email" placeholder="admin@empresa.com" style={{ width: '100%' }} /></div>
                  <div><label className="field-label">Contraseña admin</label><input type="password" value={empForm.password} onChange={e => setEmpForm(p => ({ ...p, password: e.target.value }))} placeholder="Mínimo 6 caracteres" style={{ width: '100%' }} /></div>
                </div>
              )}
              {/* Module preview */}
              {empForm.plan_id && (
                <div>
                  <label className="field-label">Módulos del plan</label>
                  <div style={{ fontSize: 11, color: '#6366f1', padding: 8, background: '#0f172a', borderRadius: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {planModulos(empForm.plan_id).map(m => <span key={m} style={{ padding: '1px 6px', borderRadius: 10, fontSize: 10, background: '#6366f133', color: '#a5b4fc' }}>{MOD_LABELS[m] || m}</span>)}
                    {planModulos(empForm.plan_id).length === 0 && <span style={{ color: '#64748b' }}>Sin módulos</span>}
                  </div>
                </div>
              )}
              {/* Module overrides (solo edición) */}
              {empModal !== 'new' && (
                <div style={{ borderTop: '1px solid #1e293b', paddingTop: 12, marginTop: 12 }}>
                  <label className="field-label" style={{ marginBottom: 8, display: 'block' }}>🧩 Override de módulos (anula el plan)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#4ade80', marginBottom: 6 }}>✅ EXTRA habilitados</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8, background: '#0f172a', borderRadius: 6, minHeight: 32 }}>
                        {TODOS_MODS.filter(m => !planModulos(empForm.plan_id).includes(m)).map(m => (
                          <span key={m} onClick={() => toggleEmpModExtra(m)} style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10, cursor: 'pointer', background: empForm.mods_extra.includes(m) ? '#16a34a33' : '#33404f', color: empForm.mods_extra.includes(m) ? '#4ade80' : '#94a3b8', border: empForm.mods_extra.includes(m) ? '1px solid #4ade80' : '1px solid transparent' }}>{MOD_LABELS[m] || m}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#f87171', marginBottom: 6 }}>❌ BLOQUEADOS</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8, background: '#0f172a', borderRadius: 6, minHeight: 32 }}>
                        {planModulos(empForm.plan_id).map(m => (
                          <span key={m} onClick={() => toggleEmpModBlock(m)} style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10, cursor: 'pointer', background: empForm.mods_bloqueados.includes(m) ? '#dc262633' : '#33404f', color: empForm.mods_bloqueados.includes(m) ? '#f87171' : '#94a3b8', border: empForm.mods_bloqueados.includes(m) ? '1px solid #f87171' : '1px solid transparent' }}>{MOD_LABELS[m] || m}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setEmpModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveEmpresa} disabled={empSaving}>{empSaving ? '⏳ Guardando...' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Plan */}
      {planModal && (
        <div className="modal-overlay" onClick={() => setPlanModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3>{planModal === 'new' ? 'Nuevo plan' : 'Editar plan'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <div className="fr">
                <div><label className="field-label">Código</label><input value={planForm.codigo} onChange={e => setPlanForm(p => ({ ...p, codigo: e.target.value.toLowerCase() }))} placeholder="basico" style={{ fontFamily: 'monospace', width: '100%' }} /></div>
                <div><label className="field-label">Nombre</label><input value={planForm.nombre} onChange={e => setPlanForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Plan Básico" style={{ width: '100%' }} /></div>
              </div>
              <div className="fr">
                <div><label className="field-label">Precio ($/mes)</label><input type="number" value={planForm.precio} onChange={e => setPlanForm(p => ({ ...p, precio: e.target.value }))} min="0" style={{ width: '100%' }} /></div>
                <div><label className="field-label">Descripción</label><input value={planForm.descripcion} onChange={e => setPlanForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Descripción corta" style={{ width: '100%' }} /></div>
              </div>
              <div className="fr">
                <div><label className="field-label">Límite usuarios</label><input type="number" value={planForm.umax} onChange={e => setPlanForm(p => ({ ...p, umax: e.target.value }))} min="0" placeholder="0 = ilimitado" style={{ width: '100%' }} /></div>
                <div><label className="field-label">Límite sucursales</label><input type="number" value={planForm.smax} onChange={e => setPlanForm(p => ({ ...p, smax: e.target.value }))} min="0" placeholder="0 = ilimitado" style={{ width: '100%' }} /></div>
              </div>
              <div>
                <label className="field-label">Módulos incluidos</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8, background: '#0f172a', borderRadius: 6, marginTop: 4 }}>
                  {TODOS_MODS.map(m => (
                    <span key={m} onClick={() => togglePlanMod(m)} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer', background: planForm.modulos.includes(m) ? '#6366f133' : '#33404f', color: planForm.modulos.includes(m) ? '#a5b4fc' : '#94a3b8', border: planForm.modulos.includes(m) ? '1px solid #6366f1' : '1px solid transparent' }}>{MOD_LABELS[m] || m}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setPlanModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={savePlan} disabled={planSaving}>{planSaving ? '⏳ Guardando...' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function K({ label, value, sub }) {
  return <><div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div><div style={{ fontSize: 28, fontWeight: 900, margin: '4px 0' }}>{value ?? '—'}</div>{sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>}</>
}
