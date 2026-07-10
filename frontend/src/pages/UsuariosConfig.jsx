// ═══════════════════════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useApp, useAuth, useToast } from '../store'
import { Modal } from '../components/Modal'
import { PageHeader, Field, EmptyRow, Loader, ConfirmDialog } from '../components/UI'

const ROLES_ALL = [
  {id:'vendedor', label:'Vendedor', color:'badge-gray'},
  {id:'cajero',   label:'Cajero',   color:'badge-yellow'},
  {id:'supervisor',label:'Supervisor',color:'badge-blue'},
  {id:'admin',    label:'Admin',    color:'badge-red'},
  {id:'readonly', label:'Solo lectura', color:'badge-gray'},
]
const ROLE_COLORS = { admin:'badge-red', supervisor:'badge-blue', cajero:'badge-yellow', vendedor:'badge-gray', readonly:'badge-gray' }
const EMPTY_USR = { nombre:'', usuario:'', email:'', password:'', roles:['vendedor'], suc_sesiones_permitidas:[] }
const EMP_FIELDS = { emp_apellido:'Apellido', emp_dni:'DNI', emp_cuil:'CUIL', emp_tel:'Teléfono', emp_fecha_ingreso:'Fecha ingreso', emp_puesto:'Puesto', emp_salario:'Salario ($)', emp_obra_social:'Obra social' }

export function Usuarios() {
  const { api } = useApi()
  const { toast } = useToast()
  const { allSucs, setSucs: setSucsGlobal } = useApp()
  const { me } = useAuth()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_USR)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [resetModal, setResetModal] = useState(null) // { user, tempPassword }

  const [localSucs, setLocalSucs] = useState(allSucs)
  // setSucs helper - updates both local state and global store
  function setSucs(sucs) { setLocalSucs(sucs); setSucsGlobal(sucs) }
  const sucsList = localSucs.length > 0 ? localSucs : allSucs

  const load = useCallback(async () => {
    try {
      const [usrs, sucs] = await Promise.all([
        api('GET', '/auth/usuarios'),
        api('GET', '/sucursales').catch(() => []),
      ])
      setUsers(Array.isArray(usrs) ? usrs : [])
      if (Array.isArray(sucs) && sucs.length > 0) setSucs(sucs)
    } catch { toast('Error cargando usuarios','err') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const set = (f) => (e) => setForm((p) => ({...p,[f]:e.target.value}))

  function openNew() { setForm({...EMPTY_USR, roles:['vendedor'], suc_sesiones_permitidas:[]}); setModal('new') }
  function openEdit(u) {
    // roles may be stored as JSON array or single string
    let rolesArr = []
    try {
      const raw = u.roles || u.rol || 'vendedor'
      rolesArr = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.startsWith('[') ? JSON.parse(raw) : [raw]
    } catch { rolesArr = [u.rol || 'vendedor'] }
    setForm({ nombre:u.nombre, usuario:u.usuario, email:u.email||'', password:'', roles:rolesArr, suc_sesiones_permitidas:Array.isArray(u.suc_sesiones_permitidas)?u.suc_sesiones_permitidas:[] })
    setModal(u)
  }

  function toggleSuc(sucId) {
    setForm((p) => {
      const s = p.suc_sesiones_permitidas
      return {...p, suc_sesiones_permitidas: s.includes(sucId) ? s.filter((x)=>x!==sucId) : [...s, sucId]}
    })
  }
  function toggleRole(rolId) {
    setForm((p) => {
      const r = p.roles || []
      return {...p, roles: r.includes(rolId) ? r.filter((x)=>x!==rolId) : [...r, rolId]}
    })
  }

  async function save() {
    if (!form.nombre.trim()||!form.usuario.trim()) { toast('Nombre y usuario son obligatorios','err'); return }
    if (modal==='new' && !form.password) { toast('La contraseña es obligatoria','err'); return }
    setSaving(true)
    try {
      const ORDER = ['admin','supervisor','cajero','vendedor','readonly']
      const rolPrincipal = ORDER.find(r => form.roles.includes(r)) || form.roles[0] || 'vendedor'
      const body = {...form, rol: rolPrincipal, roles: form.roles}
      if (!body.crear_empleado) {
        Object.keys(EMP_FIELDS).forEach(k => delete body[k])
        delete body.crear_empleado
      }
      if (!body.password) delete body.password
      if (modal==='new') { await api('POST','/auth/usuarios',body); toast('Usuario creado','ok') }
      else { await api('PUT','/auth/usuarios/'+modal.id,body); toast('Usuario actualizado','ok') }
      setModal(null); load()
    } catch(e) { toast(e.message,'err') }
    finally { setSaving(false) }
  }

  async function toggleActivo(u) {
    try { await api('PUT','/auth/usuarios/'+u.id,{activo:!u.activo}); toast(u.activo?'Usuario desactivado':'Usuario activado','ok'); load() }
    catch(e) { toast(e.message,'err') }
  }

  async function resetPassword(u) {
    try {
      const r = await api('POST','/auth/usuarios/'+u.id+'/reset-password', {})
      setResetModal({ user: u, tempPassword: r.temp_password })
      toast('Contraseña restablecida','ok')
    } catch(e) { toast(e.message,'err') }
  }

  if (loading) return <Loader/>

  return (
    <div>
      <PageHeader title={`👤 Usuarios (${users.filter(u=>u.activo!==false).length} activos)`}>
        <button type="button" className="btn btn-primary" onClick={openNew}>+ Nuevo usuario</button>
      </PageHeader>

      <div className="card" style={{padding:0}}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Usuario</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Sucursales</th><th>Estado</th><th style={{width:80}}></th></tr></thead>
            <tbody>
              {users.length===0 ? <EmptyRow cols={7} icon="👤" text="Sin usuarios"/>
                : users.map((u) => (
                  <tr key={u.id} style={{opacity:u.activo===false?.5:1}}>
                    <td style={{fontFamily:'monospace',fontWeight:600}}>{u.usuario}</td>
                    <td>{u.nombre}</td>
                    <td style={{fontSize:12,color:'var(--mu)'}}>{u.email||'—'}</td>
                    <td style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                      {(Array.isArray(u.roles) ? u.roles : [u.rol||'vendedor']).map((r)=>(
                        <span key={r} className={`badge ${ROLE_COLORS[r]||'badge-gray'}`}>{r}</span>
                      ))}
                    </td>
                    <td style={{fontSize:12,color:'var(--mu)'}}>
                      {Array.isArray(u.suc_sesiones_permitidas)&&u.suc_sesiones_permitidas.length
                        ? u.suc_sesiones_permitidas.map((id)=>allSucs.find((s)=>s.id===id)?.nombre||id).join(', ')
                        : 'Todas'}
                    </td>
                    <td><span className={`badge ${u.activo!==false?'badge-green':'badge-gray'}`}>{u.activo!==false?'Activo':'Inactivo'}</span></td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        <button type="button" className="btn btn-icon btn-sm" onClick={()=>openEdit(u)}>✏️</button>
                        {u.id!==me?.id && <>
                          <button type="button" className="btn btn-icon btn-sm" onClick={()=>resetPassword(u)} title="Resetear contraseña">🔒</button>
                          <button type="button" className="btn btn-icon btn-sm" onClick={()=>toggleActivo(u)}>{u.activo!==false?'🚫':'✅'}</button>
                        </>}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==='new'?'+ Nuevo usuario':`Editar: ${modal?.nombre}`}
        footer={<><button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><span className="spinner" style={{width:14,height:14}}/> Guardando...</>:'💾 Guardar'}</button></>}>
        <div className="fr"><Field label="Nombre *"><input value={form.nombre} onChange={set('nombre')} placeholder="Nombre completo"/></Field><Field label="Usuario *"><input value={form.usuario} onChange={set('usuario')} placeholder="Nombre de usuario" style={{fontFamily:'monospace'}}/></Field></div>
        <div className="fr"><Field label="Email"><input type="email" value={form.email} onChange={set('email')} placeholder="correo@..."/></Field><Field label={modal==='new'?'Contraseña *':'Nueva contraseña (vacío = sin cambio)'}><input type="password" value={form.password} onChange={set('password')} placeholder={modal==='new'?'Contraseña':'Dejar vacío para no cambiar'}/></Field></div>
        <div>
          <label style={{display:'block',fontSize:12,fontWeight:700,color:'var(--mu)',textTransform:'uppercase',letterSpacing:'.3px',marginBottom:8}}>Roles</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:8,padding:10,background:'var(--sf)',borderRadius:8,border:'1px solid var(--bd)'}}>
            {ROLES_ALL.map((r)=>(
              <label key={r.id} style={{display:'flex',alignItems:'center',gap:6,fontSize:13,cursor:'pointer',padding:'4px 10px',borderRadius:6,background:(form.roles||[]).includes(r.id)?'rgba(249,115,22,.1)':'transparent',border:`1.5px solid ${(form.roles||[]).includes(r.id)?'var(--ac)':'var(--bd)'}`}}>
                <input type="checkbox" checked={(form.roles||[]).includes(r.id)} onChange={()=>toggleRole(r.id)} style={{width:14,height:14}}/>
                {r.label}
              </label>
            ))}
          </div>
          <div style={{fontSize:11,color:'var(--mu)',marginTop:4}}>El rol principal es el de mayor jerarquía seleccionado</div>
        </div>
        <div>
          <label style={{display:'block',fontSize:12,fontWeight:700,color:'var(--mu)',textTransform:'uppercase',letterSpacing:'.3px',marginBottom:8}}>Sucursales de trabajo</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:8,padding:'10px',background:'var(--sf)',borderRadius:8,border:'1px solid var(--bd)'}}>
            {sucsList.length===0 ? <span style={{fontSize:12,color:'var(--mu)'}}>Sin sucursales disponibles</span>
              : sucsList.map((s)=>(
                <label key={s.id} style={{display:'flex',alignItems:'center',gap:6,fontSize:13,cursor:'pointer',padding:'4px 8px',borderRadius:6,background:form.suc_sesiones_permitidas.includes(s.id)?'rgba(99,102,241,.1)':'transparent',border:`1.5px solid ${form.suc_sesiones_permitidas.includes(s.id)?'var(--ac)':'var(--bd)'}`}}>
                  <input type="checkbox" checked={form.suc_sesiones_permitidas.includes(s.id)} onChange={()=>toggleSuc(s.id)} style={{width:14,height:14}}/>
                  {s.nombre}
                </label>
              ))}
          </div>
          <div style={{fontSize:11,color:'var(--mu)',marginTop:4}}>Sin seleccionar = acceso a todas las sucursales</div>
        </div>
        {modal==='new' && <>
          <div style={{borderTop:'1px solid var(--bd)',paddingTop:12,marginTop:8}}>
            <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,cursor:'pointer',padding:'6px 10px',borderRadius:6,background:form.crear_empleado?'rgba(249,115,22,.08)':'transparent'}}>
              <input type="checkbox" checked={!!form.crear_empleado} onChange={e=>setForm(p=>({...p,crear_empleado:e.target.checked}))} style={{width:16,height:16}}/>
              🔄 También crear ficha de empleado
            </label>
          </div>
          {form.crear_empleado && (
            <div style={{marginTop:8,padding:10,background:'var(--sf)',borderRadius:8,border:'1px solid var(--bd)'}}>
              <div className="fr">
                {Object.entries(EMP_FIELDS).slice(0,2).map(([k,l])=>(
                  <Field key={k} label={l}><input value={form[k]||''} onChange={set(k)} placeholder={l}/></Field>
                ))}
              </div>
              <div className="fr">
                {Object.entries(EMP_FIELDS).slice(2,4).map(([k,l])=>(
                  <Field key={k} label={l}><input value={form[k]||''} onChange={set(k)} placeholder={l}/></Field>
                ))}
              </div>
              <div className="fr">
                {Object.entries(EMP_FIELDS).slice(4,6).map(([k,l])=>(
                  <Field key={k} label={l}><input value={form[k]||''} onChange={set(k)} placeholder={l}/></Field>
                ))}
              </div>
              <div className="fr">
                {Object.entries(EMP_FIELDS).slice(6,8).map(([k,l])=>(
                  <Field key={k} label={l}><input value={form[k]||''} onChange={set(k)} placeholder={l}/></Field>
                ))}
              </div>
            </div>
          )}
        </>}
      </Modal>

      {/* Reset password modal */}
      {resetModal && (
        <div className="modal-overlay" onClick={()=>setResetModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
            <div className="modal-header"><h3>🔒 Resetear contraseña</h3><button type="button" onClick={()=>setResetModal(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button></div>
            <div className="modal-body">
              <p style={{fontSize:13,marginBottom:12,color:'var(--mu)'}}>Se reseteó la contraseña de <strong>{resetModal.user.nombre}</strong>. La contraseña temporal es:</p>
              <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:8,padding:'14px 16px',textAlign:'center',marginBottom:12}}>
                <div style={{fontSize:22,fontWeight:700,fontFamily:'monospace',letterSpacing:2}}>{resetModal.tempPassword}</div>
              </div>
              <p style={{fontSize:12,color:'var(--mu)'}}>El usuario deberá cambiarla al próximo inicio de sesión.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={()=>{navigator.clipboard.writeText(resetModal.tempPassword); toast('Copiado','ok')}}>📋 Copiar</button>
              <button type="button" className="btn btn-secondary" onClick={()=>setResetModal(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════
export function Config() {
  const { api } = useApi()
  const { toast } = useToast()
  const { cfg, setCfg, setTheme, theme, allSucs } = useApp()
  const { me } = useAuth()

  const [form, setForm] = useState({
    nombre:'', cuit:'', dir:'', tel:'', email:'', slogan:'',
    rubro:'general', logo_url:'', tema_color:'#F97316',
    ticket_cabecera:'', ticket_pie:'', iva:'21',
    ctacte_recargo:'0', ctacte_dias_vto:'30', ctacte_mora:'0',
    pendiente_dias_max:'30', pendiente_seña_min:'0',
    mp_alias:'', mp_link:'',
    puntos_peso:'0', puntos_minimo_canje:'0', puntos_valor_canje:'0',
    objetivo_mes:'', objetivo_suc:'',
    comision:'5',
    arca_access_token:'', arca_cuit:'', arca_punto_venta:'1', arca_ambiente:'dev', arca_iva_pct:'21', arca_cert:'', arca_key:'',
    tienda_suc_online_id:'', tienda_woo_url:'', tienda_woo_key:'', tienda_woo_secret:'',
    tienda_tn_store_id:'', tienda_tn_access_token:'',
    tienda_meli_app_id:'', tienda_meli_client_secret:'', tienda_meli_access_token:'', tienda_meli_refresh_token:'', tienda_meli_seller_id:'', tienda_meli_user_id:'', tienda_meli_expires_at:'',
    tienda_ultima_sync:'',
    smtp_host:'', smtp_port:'465', smtp_user:'', smtp_pass:'', smtp_from:'',
    inactividad_minutos:'15', login_max_intentos:'3', login_bloqueo_minutos:'15',
    password_expira_dias:'0', password_historial_count:'5',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('general')
  const [soporteForm, setSoporteForm] = useState({ asunto: '', descripcion: '' })
  const [soporteSending, setSoporteSending] = useState(false)
  const [soporteSent, setSoporteSent] = useState(false)

  const [emailTesting, setEmailTesting] = useState(false)
  const [emailTestRes, setEmailTestRes] = useState(null)

  useEffect(() => {
    api('GET', '/config').then((d) => {
      setForm((p) => ({ ...p, ...Object.fromEntries(Object.entries(d).filter(([,v])=>v!=null&&v!==undefined)) }))
      setCfg(d)
    }).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  const set = (f) => (e) => setForm((p) => ({...p,[f]:e.target.value}))

  async function save() {
    setSaving(true)
    try {
      await api('PUT', '/config', form)
      setCfg({ ...cfg, ...form })
      toast('Configuración guardada','ok')
    } catch(e) { toast(e.message,'err') }
    finally { setSaving(false) }
  }

  async function sendSoporte() {
    if (!soporteForm.asunto.trim() || !soporteForm.descripcion.trim()) { toast('Completá asunto y mensaje','err'); return }
    setSoporteSending(true)
    try {
      await api('POST', '/config/solicitud', { asunto: soporteForm.asunto, descripcion: soporteForm.descripcion })
      setSoporteSent(true)
      setSoporteForm({ asunto: '', descripcion: '' })
      toast('Solicitud enviada. Te responderemos pronto.','ok')
    } catch(e) { toast(e.message,'err') }
    finally { setSoporteSending(false) }
  }

  async function testEmail() {
    if (!form.smtp_host || !form.smtp_user) { toast('Completá Host y Usuario SMTP','err'); return }
    setEmailTesting(true); setEmailTestRes(null)
    try {
      const r = await api('POST', '/config/email-test', {
        host: form.smtp_host, port: parseInt(form.smtp_port) || 465,
        user: form.smtp_user, pass: form.smtp_pass, from: form.smtp_from
      })
      setEmailTestRes({ ok: true, msg: r.message || 'Mail enviado' })
      toast('Mail de prueba enviado','ok')
    } catch(e) { setEmailTestRes({ ok: false, msg: e.message }); toast(e.message,'err') }
    finally { setEmailTesting(false) }
  }

  if (loading) return <Loader/>

  const TABS = [['general','🏢 General'],['apariencia','🎨 Apariencia'],['email','📧 Email'],['metodospago','💳 Métodos de pago'],['ctacte','📒 Cta. Cte.'],['pendientes','🚚 Pendientes'],['objetivo','🎯 Objetivo'],['fidelizacion','⭐ Fidelización'],['comision','💰 Comisión'],['descuentos','🏷️ Descuentos'],['seguridad','🔒 Seguridad'],['webhooks','🔗 Webhooks'],['arca','📄 ARCA'],['tienda','🛒 Tienda'],['plan','📦 Plan'],['micuenta','👤 Mi Cuenta'],['backups','💾 Backups'],['ayuda','🆘 Ayuda']]

  return (
    <div>
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'2px solid var(--bd)',paddingBottom:8,flexWrap:'wrap'}}>
        {TABS.map(([key,label])=>(
          <button type="button" key={key} className={`btn btn-sm ${tab===key?'btn-primary':'btn-secondary'}`} onClick={()=>setTab(key)}>{label}</button>
        ))}
      </div>

      <div className="card" style={{maxWidth:640}}>
        {tab==='general' && (
          <>
            <Field label="Nombre del negocio"><input value={form.nombre} onChange={set('nombre')} placeholder="FlexCRM Store"/></Field>
            <Field label="Eslogan / descripción"><input value={form.slogan||''} onChange={set('slogan')} placeholder="Tu sistema de gestión"/></Field>
            <div className="fr"><Field label="CUIT"><input value={form.cuit} onChange={set('cuit')} placeholder="20-12345678-9"/></Field><Field label="IVA %"><input type="number" value={form.iva} onChange={set('iva')} min="0" max="100"/></Field></div>
            <Field label="Dirección"><input value={form.dir} onChange={set('dir')} placeholder="Calle 123, Ciudad"/></Field>
            <div className="fr"><Field label="Teléfono"><input value={form.tel} onChange={set('tel')} placeholder="11-1234-5678"/></Field><Field label="Email"><input type="email" value={form.email} onChange={set('email')} placeholder="contacto@..."/></Field></div>
            <Field label="Rubro">
              <select value={form.rubro} onChange={set('rubro')}>
                {['general','indumentaria','calzado','electronica','ferreteria','farmacia','supermercado','libreria','kiosco','restaurant','otro'].map((r)=><option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </>
        )}

        {tab==='apariencia' && (
          <>
            <Field label="Color principal">
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <input type="color" value={form.tema_color} onChange={(e)=>{
                  set('tema_color')(e)
                  document.documentElement.style.setProperty('--ac', e.target.value)
                }} style={{width:50,height:40,borderRadius:8,border:'1.5px solid var(--bd)',padding:2,cursor:'pointer'}}/>
                <input value={form.tema_color} onChange={(e)=>{
                  set('tema_color')(e)
                  document.documentElement.style.setProperty('--ac', e.target.value)
                }} style={{fontFamily:'monospace'}} placeholder="#F97316"/>
              </div>
            </Field>
            <Field label="URL del logo (link directo a imagen)"><input value={form.logo_url} onChange={set('logo_url')} placeholder="https://..."/></Field>
            {form.logo_url && <div style={{marginBottom:14}}><img src={form.logo_url} alt="Logo" style={{maxHeight:60,borderRadius:8,border:'1px solid var(--bd)'}} onError={(e)=>e.target.style.display='none'}/></div>}
            <Field label="Cabecera del ticket"><textarea value={form.ticket_cabecera} onChange={set('ticket_cabecera')} rows={2} style={{resize:'vertical'}} placeholder="Texto que aparece en la parte superior del ticket..."/></Field>
            <Field label="Pie del ticket"><textarea value={form.ticket_pie} onChange={set('ticket_pie')} rows={2} style={{resize:'vertical'}} placeholder="Texto que aparece al pie del ticket..."/></Field>
            <div style={{display:'flex',gap:8,marginTop:8}}>
              <button type="button" className={`btn btn-sm ${theme==='light'?'btn-primary':'btn-secondary'}`} onClick={()=>setTheme('light')}>☀️ Claro</button>
              <button type="button" className={`btn btn-sm ${theme==='dark'?'btn-primary':'btn-secondary'}`} onClick={()=>setTheme('dark')}>🌙 Oscuro</button>
            </div>
          </>
        )}

        {tab==='email' && (
          <>
            <div style={{background:'rgba(99,102,241,.06)',border:'1px solid rgba(99,102,241,.2)',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:14}}>
              📧 Configura tu servidor SMTP para envío de emails (olvidé mi clave, presupuestos, notificaciones).
              Si no lo configurás, se usará el SMTP global del sistema como respaldo.
            </div>
            <div className="fr">
              <Field label="Servidor SMTP"><input value={form.smtp_host} onChange={set('smtp_host')} placeholder="smtp.gmail.com"/></Field>
              <Field label="Puerto"><input value={form.smtp_port} onChange={set('smtp_port')} placeholder="465"/></Field>
            </div>
            <div className="fr">
              <Field label="Usuario SMTP"><input value={form.smtp_user} onChange={set('smtp_user')} placeholder="tu@email.com"/></Field>
              <Field label="Contraseña / App Password"><input type="password" value={form.smtp_pass} onChange={set('smtp_pass')} placeholder="••••••••"/></Field>
            </div>
            <Field label="Email remitente (FROM)"><input value={form.smtp_from} onChange={set('smtp_from')} placeholder="noreply@midominio.com"/></Field>
            {emailTestRes && (
              <div style={{padding:'10px 14px',borderRadius:8,fontSize:12,background:emailTestRes.ok?'rgba(34,197,94,.08)':'rgba(239,68,68,.08)',border:'1px solid '+(emailTestRes.ok?'rgba(34,197,94,.3)':'rgba(239,68,68,.3)'),color:emailTestRes.ok?'var(--ok)':'var(--bad)',marginBottom:8}}>
                {emailTestRes.ok ? '✅ ' : '❌ '}{emailTestRes.msg}
              </div>
            )}
            <button type="button" className="btn btn-secondary" onClick={testEmail} disabled={emailTesting} style={{marginBottom:8}}>{emailTesting ? '⏳ Probando...' : '📨 Probar conexión'}</button>
          </>
        )}

        {tab==='seguridad' && (
          <>
            <div style={{background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.2)',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:14}}>
              🔒 Configuración de seguridad para todos los usuarios de la empresa.
            </div>
            <Field label="Cierre de sesión por inactividad (minutos)">
              <select value={form.inactividad_minutos} onChange={set('inactividad_minutos')}>
                <option value="5">5 minutos</option>
                <option value="10">10 minutos</option>
                <option value="15">15 minutos (recomendado)</option>
                <option value="30">30 minutos</option>
                <option value="60">1 hora</option>
                <option value="0">Nunca</option>
              </select>
            </Field>
            <div className="fr">
              <Field label="Intentos máximos de login">
                <select value={form.login_max_intentos} onChange={set('login_max_intentos')}>
                  <option value="3">3 intentos</option>
                  <option value="4">4 intentos</option>
                  <option value="5">5 intentos</option>
                </select>
              </Field>
              <Field label="Tiempo de bloqueo (minutos)">
                <select value={form.login_bloqueo_minutos} onChange={set('login_bloqueo_minutos')}>
                  <option value="5">5 minutos</option>
                  <option value="15">15 minutos</option>
                  <option value="30">30 minutos</option>
                  <option value="60">1 hora</option>
                </select>
              </Field>
            </div>
            <div style={{fontSize:11,color:'var(--mu)',padding:'8px 12px',background:'var(--sf)',borderRadius:6}}>
              💡 Después de <strong>{form.login_max_intentos}</strong> intentos fallidos, la cuenta se bloquea por <strong>{form.login_bloqueo_minutos}</strong> minutos.
            </div>
            <div style={{ borderTop: '1px solid var(--bd)', marginTop: 16, paddingTop: 16 }}>
              <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
                🔐 Política de contraseñas
              </div>
              <Field label="Expiración de contraseña (días)">
                <select value={form.password_expira_dias} onChange={set('password_expira_dias')}>
                  <option value="0">Nunca</option>
                  <option value="30">30 días</option>
                  <option value="60">60 días</option>
                  <option value="90">90 días</option>
                  <option value="180">180 días</option>
                </select>
              </Field>
              <div style={{ fontSize: 11, color: 'var(--mu)', padding: '8px 12px', background: 'var(--sf)', borderRadius: 6 }}>
                💡 Los usuarios deberán cambiar su contraseña cada <strong>{form.password_expira_dias === '0' ? 'que nunca expira' : form.password_expira_dias + ' días'}</strong>. Se mantienen las últimas 5 contraseñas para evitar reutilización.
              </div>
            </div>
          </>
        )}

        {tab==='metodospago' && (
          <PagosTab cfg={form} set={set} api={api} toast={toast} onReload={()=>api('GET','/config').then((d)=>{setForm(p=>({...p,...d}));setCfg({...cfg,...d})})} />
        )}

        {tab==='ctacte' && (
          <>
            <div className="fr"><Field label="Recargo por defecto %"><input type="number" value={form.ctacte_recargo} onChange={set('ctacte_recargo')} min="0" step="0.1"/></Field><Field label="Días de vencimiento"><input type="number" value={form.ctacte_dias_vto} onChange={set('ctacte_dias_vto')} min="1"/></Field></div>
            <Field label="Mora mensual %"><input type="number" value={form.ctacte_mora} onChange={set('ctacte_mora')} min="0" step="0.1"/></Field>
          </>
        )}

        {tab==='pendientes' && (
          <>
            <Field label="Días máximo de pedido"><input type="number" value={form.pendiente_dias_max} onChange={set('pendiente_dias_max')} min="1"/></Field>
            <Field label="Seña mínima %"><input type="number" value={form.pendiente_seña_min} onChange={set('pendiente_seña_min')} min="0" max="100"/></Field>
          </>
        )}

        {tab==='objetivo' && (
          <>
            <div style={{fontSize:12,color:'var(--mu)',marginBottom:12}}>Define la meta de ventas mensual para tu equipo. Se muestra en el Dashboard como barra de progreso.</div>
            <Field label="Objetivo de ventas del mes ($)">
              <input type="number" value={form.objetivo_mes||''} onChange={set('objetivo_mes')} placeholder="Ej: 500000" min="0"/>
            </Field>
            <Field label="Sucursal a la que aplica">
              <select value={form.objetivo_suc||''} onChange={set('objetivo_suc')}>
                <option value="">📍 Todas las sucursales (total empresa)</option>
                {allSucs.map((s) => <option key={s.id} value={s.id}>🏪 {s.nombre}</option>)}
              </select>
            </Field>
            <div style={{fontSize:11,color:'var(--mu)',padding:'8px 12px',background:'var(--sf)',borderRadius:6}}>
              💡 Si elegís una sucursal específica, el objetivo solo aparecerá en el Dashboard cuando esa sea la sucursal activa. Para metas por sucursal individual creá un objetivo distinto para cada una.
            </div>
          </>
        )}

        {tab==='fidelizacion' && (
          <>
            <div style={{background:'rgba(99,102,241,.06)',border:'1px solid rgba(99,102,241,.2)',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:14}}>
              ⭐ Los puntos se acumulan automáticamente en cada venta cuando hay un cliente asignado.
            </div>
            <div className="fr">
              <Field label="Puntos por cada $100 vendido">
                <input type="number" value={form.puntos_peso||'0'} onChange={set('puntos_peso')} min="0" step="0.01" placeholder="Ej: 1"/>
              </Field>
              <Field label="Puntos mínimos para canjear">
                <input type="number" value={form.puntos_minimo_canje||'0'} onChange={set('puntos_minimo_canje')} min="0" placeholder="Ej: 100"/>
              </Field>
            </div>
            <Field label="Valor de cada punto al canjear ($)">
              <input type="number" value={form.puntos_valor_canje||'0'} onChange={set('puntos_valor_canje')} min="0" step="0.01" placeholder="Ej: 0.5 = 100 pts = $50"/>
            </Field>
            {form.puntos_peso > 0 && (
              <div style={{background:'var(--sf)',borderRadius:8,padding:'10px 14px',fontSize:12,color:'var(--mu)'}}>
                Con esta configuración: una venta de $10.000 genera <strong>{(10000/100*(parseFloat(form.puntos_peso)||0)).toFixed(0)} puntos</strong>
                {form.puntos_valor_canje > 0 && <>, que valen <strong>${(10000/100*(parseFloat(form.puntos_peso)||0)*(parseFloat(form.puntos_valor_canje)||0)).toFixed(0)}</strong> en descuento</>}
              </div>
            )}
          </>
        )}

        {tab==='comision' && (
          <>
            <div style={{background:'rgba(34,197,94,.06)',border:'1px solid rgba(34,197,94,.2)',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:14}}>
              💰 La comisión se calcula automáticamente sobre las ventas de cada vendedor. Podés ver el detalle en Reportes.
            </div>
            <Field label="Comisión por defecto (%)">
              <input type="number" value={form.comision||'5'} onChange={set('comision')} min="0" max="100" step="0.1" placeholder="5"/>
            </Field>
            <div style={{fontSize:11,color:'var(--mu)',padding:'8px 12px',background:'var(--sf)',borderRadius:6}}>
              💡 Este valor se usa como comisión general. También podés configurar una comisión individual por vendedor desde la sección Vendedores.
            </div>
          </>
        )}

        {tab==='descuentos' && <DescuentosTab api={api} toast={toast} />}

        {tab==='webhooks' && <WebhooksTab api={api} toast={toast} />}

        {tab==='arca' && (
          <>
            <div style={{background:'rgba(37,99,235,.06)',border:'1px solid rgba(37,99,235,.2)',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:14}}>
              📄 ARCA (ex AFIP) — Facturación electrónica. Necesitás un <strong>Access Token</strong> de <a href="https://app.afipsdk.com" target="_blank" rel="noopener" style={{color:'var(--ac)'}}>Afip SDK</a> para conectarte.
              Modo desarrollo usa el CUIT 20-40937847-2 sin certificados. Para producción necesitás certificado digital.
            </div>
            <div className="fr">
              <Field label="Access Token">
                <input value={form.arca_access_token} onChange={set('arca_access_token')} placeholder="tu-access-token" style={{fontFamily:'monospace',fontSize:12}}/>
              </Field>
              <Field label="CUIT">
                <input value={form.arca_cuit} onChange={set('arca_cuit')} placeholder="20111111112" style={{fontFamily:'monospace'}}/>
              </Field>
            </div>
            <div className="fr">
              <Field label="Punto de venta">
                <input type="number" value={form.arca_punto_venta} onChange={set('arca_punto_venta')} min="1" placeholder="1"/>
              </Field>
              <Field label="Ambiente">
                <select value={form.arca_ambiente} onChange={set('arca_ambiente')}>
                  <option value="dev">🧪 Desarrollo (testing)</option>
                  <option value="prod">🚀 Producción</option>
                </select>
              </Field>
              <Field label="IVA %">
                <input type="number" value={form.arca_iva_pct} onChange={set('arca_iva_pct')} min="0" max="100" placeholder="21"/>
              </Field>
            </div>
            <Field label="Certificado (solo producción)">
              <textarea value={form.arca_cert} onChange={set('arca_cert')} rows={4} placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----" style={{fontSize:11,fontFamily:'monospace'}}/>
            </Field>
            <Field label="Clave privada (solo producción)">
              <textarea value={form.arca_key} onChange={set('arca_key')} rows={4} placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----" style={{fontSize:11,fontFamily:'monospace'}}/>
            </Field>
          </>
        )}

        {tab==='plan' && (
          <PlanTab api={api} toast={toast}/>
        )}

        {tab==='micuenta' && (
          <MiCuentaTab api={api} toast={toast}/>
        )}

        {tab==='backups' && (
          <BackupsTab api={api} toast={toast}/>
        )}

        {tab==='tienda' && (
          <TiendaTab api={api} toast={toast} form={form} set={set} allSucs={allSucs} cfg={cfg} setForm={setForm} />
        )}

        {tab==='ayuda' && (
          <div style={{fontSize:14}}>
            <div style={{background:'linear-gradient(135deg, var(--ac), #a855f7)', borderRadius:12, padding:'20px 24px', color:'#fff', marginBottom:20}}>
              <div style={{fontSize:22, fontWeight:800, marginBottom:4}}>🆘 Centro de Ayuda</div>
              <div style={{fontSize:13, opacity:.9}}>Todo lo que necesitás saber para usar FlexCRM al máximo</div>
            </div>

            <details style={{marginBottom:12,border:'1px solid var(--bd)',borderRadius:8,padding:'12px 16px',background:'var(--sf)'}}>
              <summary style={{fontWeight:600,cursor:'pointer',fontSize:14}}>🚀 Primeros pasos</summary>
              <div style={{marginTop:10,fontSize:13,color:'var(--mu)',lineHeight:1.7}}>
                <p>1. <strong>Configurá tu negocio</strong> en esta sección: nombre, logo, colores y datos fiscales.</p>
                <p>2. <strong>Creá sucursales</strong> si tenés más de un local desde Sucursales en el menú.</p>
                <p>3. <strong>Cargá productos</strong> desde la sección Productos o importalos por Excel.</p>
                <p>4. <strong>Empezá a vender</strong> desde el POS o la sección Ventas.</p>
              </div>
            </details>

            <details style={{marginBottom:12,border:'1px solid var(--bd)',borderRadius:8,padding:'12px 16px',background:'var(--sf)'}}>
              <summary style={{fontWeight:600,cursor:'pointer',fontSize:14}}>⌨️ Atajos de teclado</summary>
              <div style={{marginTop:10,fontSize:13,color:'var(--mu)',lineHeight:1.7}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <tbody>
                    <tr><td style={{padding:'4px 8px',fontWeight:600}}><kbd style={{background:'var(--bd)',padding:'2px 6px',borderRadius:4}}>Ctrl+B</kbd></td><td style={{padding:'4px 8px'}}>Buscar cliente / producto</td></tr>
                    <tr><td style={{padding:'4px 8px',fontWeight:600}}><kbd style={{background:'var(--bd)',padding:'2px 6px',borderRadius:4}}>Ctrl+N</kbd></td><td style={{padding:'4px 8px'}}>Nueva venta rápida</td></tr>
                    <tr><td style={{padding:'4px 8px',fontWeight:600}}><kbd style={{background:'var(--bd)',padding:'2px 6px',borderRadius:4}}>Ctrl+P</kbd></td><td style={{padding:'4px 8px'}}>Abrir POS</td></tr>
                    <tr><td style={{padding:'4px 8px',fontWeight:600}}><kbd style={{background:'var(--bd)',padding:'2px 6px',borderRadius:4}}>Ctrl+D</kbd></td><td style={{padding:'4px 8px'}}>Ir al Dashboard</td></tr>
                    <tr><td style={{padding:'4px 8px',fontWeight:600}}><kbd style={{background:'var(--bd)',padding:'2px 6px',borderRadius:4}}>Ctrl+K</kbd></td><td style={{padding:'4px 8px'}}>Comando rápido</td></tr>
                    <tr><td style={{padding:'4px 8px',fontWeight:600}}><kbd style={{background:'var(--bd)',padding:'2px 6px',borderRadius:4}}>Esc</kbd></td><td style={{padding:'4px 8px'}}>Cerrar modal / Cancelar</td></tr>
                  </tbody>
                </table>
              </div>
            </details>

            <details style={{marginBottom:12,border:'1px solid var(--bd)',borderRadius:8,padding:'12px 16px',background:'var(--sf)'}}>
              <summary style={{fontWeight:600,cursor:'pointer',fontSize:14}}>💰 Caja y métodos de pago</summary>
              <div style={{marginTop:10,fontSize:13,color:'var(--mu)',lineHeight:1.7}}>
                <p>Configurá tus métodos de pago en la pestaña <strong>Métodos de pago</strong>. Podés habilitar: efectivo, débito, crédito, transferencia, QR y cuenta corriente.</p>
                <p>La sección <strong>Caja</strong> del menú te permite ver movimientos diarios, abrir/cerrar caja y conciliar.</p>
              </div>
            </details>

            <details style={{marginBottom:12,border:'1px solid var(--bd)',borderRadius:8,padding:'12px 16px',background:'var(--sf)'}}>
              <summary style={{fontWeight:600,cursor:'pointer',fontSize:14}}>👥 Usuarios y permisos</summary>
              <div style={{marginTop:10,fontSize:13,color:'var(--mu)',lineHeight:1.7}}>
                <p>Creá usuarios desde la sección <strong>Usuarios</strong> del menú. Cada usuario puede tener un rol:</p>
                <ul style={{paddingLeft:20}}>
                  <li><strong>Admin:</strong> acceso completo a todo</li>
                  <li><strong>Vendedor:</strong> acceso a ventas, POS y clientes</li>
                  <li><strong>Reportes:</strong> solo lectura de reportes y dashboard</li>
                </ul>
              </div>
            </details>

            <details style={{marginBottom:12,border:'1px solid var(--bd)',borderRadius:8,padding:'12px 16px',background:'var(--sf)'}}>
              <summary style={{fontWeight:600,cursor:'pointer',fontSize:14}}>🔗 Integraciones</summary>
              <div style={{marginTop:10,fontSize:13,color:'var(--mu)',lineHeight:1.7}}>
                <p><strong>Tienda online:</strong> Conectá con WooCommerce, Tiendanube o Mercado Libre desde la pestaña Tienda.</p>
                <p><strong>ARCA (AFIP):</strong> Facturación electrónica desde la pestaña ARCA.</p>
                <p><strong>Webhooks:</strong> Notificá sistemas externos en cada venta desde la pestaña Webhooks.</p>
              </div>
            </details>

            <details style={{marginBottom:12,border:'1px solid var(--bd)',borderRadius:8,padding:'12px 16px',background:'var(--sf)'}}>
              <summary style={{fontWeight:600,cursor:'pointer',fontSize:14}}>📧 Enviar consulta a soporte</summary>
              <div style={{marginTop:10,fontSize:13,lineHeight:1.7}}>
                {me?.rol === 'admin' ? (
                  soporteSent ? (
                    <div style={{background:'#16a34a15',border:'1px solid #16a34a33',borderRadius:8,padding:'14px 18px',textAlign:'center'}}>
                      <div style={{fontSize:20,marginBottom:4}}>✅</div>
                      <div style={{fontWeight:600,color:'#16a34a'}}>¡Consulta enviada!</div>
                      <div style={{color:'var(--mu)',fontSize:12}}>Te responderemos a la brevedad.</div>
                      <button type="button" className="btn btn-secondary btn-sm" style={{marginTop:8}} onClick={()=>setSoporteSent(false)}>Enviar otra consulta</button>
                    </div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      <div><label style={{display:'block',fontSize:11,fontWeight:600,textTransform:'uppercase',color:'var(--mu)',marginBottom:4}}>Asunto</label><input value={soporteForm.asunto} onChange={e=>setSoporteForm(p=>({...p,asunto:e.target.value}))} placeholder="Ej: No puedo cargar productos" style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid var(--bd)',background:'var(--bg)',color:'var(--tx)',fontSize:13,outline:'none'}} /></div>
                      <div><label style={{display:'block',fontSize:11,fontWeight:600,textTransform:'uppercase',color:'var(--mu)',marginBottom:4}}>Mensaje</label><textarea value={soporteForm.descripcion} onChange={e=>setSoporteForm(p=>({...p,descripcion:e.target.value}))} rows={4} placeholder="Describí tu problema o consulta..." style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid var(--bd)',background:'var(--bg)',color:'var(--tx)',fontSize:13,outline:'none',resize:'vertical'}} /></div>
                      <button type="button" className="btn btn-primary" onClick={sendSoporte} disabled={soporteSending} style={{alignSelf:'flex-start'}}>{soporteSending?'Enviando...':'📤 Enviar consulta'}</button>
                    </div>
                  )
                ) : (
                  <div style={{background:'var(--info)',border:'1px solid var(--bd)',borderRadius:8,padding:'14px 18px',textAlign:'center'}}>
                    <div style={{fontSize:24,marginBottom:8}}>👤</div>
                    <p style={{fontWeight:600,marginBottom:6}}>¿Olvidaste tu contraseña?</p>
                    <p style={{color:'var(--mu)',fontSize:12,marginBottom:10}}>Usá la opción <strong>"Olvidé mi contraseña"</strong> en la pantalla de inicio de sesión. Si no podés acceder a tu correo, contactá a tu administrador para que restablezca tu contraseña desde la sección Usuarios.</p>
                  </div>
                )}
              </div>
            </details>
          </div>
        )}

        {tab!=='micuenta' && tab!=='backups' && tab!=='ayuda' && (
          <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid var(--bd)'}}>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving?<><span className="spinner" style={{width:14,height:14}}/> Guardando...</>:'💾 Guardar configuración'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


const PAGOS_DEF = [
  {id:'efectivo', nombre:'Efectivo', icono:'💵', recargo:0, activo:true},
  {id:'debito', nombre:'Débito', icono:'💳', recargo:0, activo:true},
  {id:'credito', nombre:'Crédito', icono:'💳', recargo:10, activo:true},
  {id:'transferencia', nombre:'Transferencia', icono:'🏦', recargo:0, activo:true},
  {id:'qr', nombre:'QR / MP', icono:'📱', recargo:0, activo:true},
  {id:'ctacte', nombre:'Cuenta Corriente', icono:'📒', recargo:0, activo:true},
]

function PagosTab({ cfg, api, toast, onReload }) {
  const [pagos, setPagos] = useState([])
  const [modal, setModal] = useState(null)
  const [fPago, setFPago] = useState({id:'', nombre:'', icono:'💵', recargo:'0', activo:true})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let p = PAGOS_DEF
    if (cfg.tipos_pago) {
      try { p = JSON.parse(cfg.tipos_pago) } catch {}
    }
    setPagos(p)
  }, [cfg.tipos_pago])

  async function savePago() {
    if (!fPago.nombre.trim()) { toast('Nombre obligatorio', 'err'); return }
    setSaving(true)
    try {
      const nuevo = { ...fPago, recargo: parseFloat(fPago.recargo) || 0, activo: !!fPago.activo }
      let list
      if (modal === 'new') {
        if (!nuevo.id) nuevo.id = nuevo.nombre.toLowerCase().replace(/\s+/g, '_')
        list = [...pagos, nuevo]
      } else {
        list = pagos.map((p) => p.id === modal ? nuevo : p)
      }
      setPagos(list)
      await api('PUT', '/config', { tipos_pago: JSON.stringify(list) })
      toast('Guardado', 'ok'); setModal(null)
      onReload()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function toggleActivo(id) {
    const list = pagos.map((p) => p.id === id ? { ...p, activo: !p.activo } : p)
    setPagos(list)
    await api('PUT', '/config', { tipos_pago: JSON.stringify(list) })
    toast('Actualizado', 'ok')
  }

  const sp = (field) => (e) => setFPago((p) => ({ ...p, [field]: e.target.value }))

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:12,color:'var(--mu)'}}>Métodos disponibles en Caja y POS</div>
        <button type="button" className="btn btn-primary btn-sm" onClick={()=>{setFPago({id:'',nombre:'',icono:'💵',recargo:'0',activo:true});setModal('new')}}>+ Nuevo método</button>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {pagos.map((p) => (
          <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'var(--sf)',borderRadius:10,border:'1px solid var(--bd)',opacity:p.activo===false?.5:1}}>
            <span style={{fontSize:20}}>{p.icono}</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13}}>{p.nombre}</div>
              <div style={{fontSize:11,color:'var(--mu)'}}>Recargo: {p.recargo||0}% · <span className={`badge ${p.activo!==false?'badge-green':'badge-gray'}`}>{p.activo!==false?'Activo':'Inactivo'}</span></div>
            </div>
            <button type="button" className="btn btn-icon btn-sm" onClick={()=>{setFPago({...p,recargo:String(p.recargo||0)});setModal(p.id)}}>✏️</button>
            <button type="button" className="btn btn-icon btn-sm" onClick={()=>toggleActivo(p.id)}>{p.activo!==false?'🚫':'✅'}</button>
          </div>
        ))}
      </div>
      {/* Modal pago */}
      {modal && (
        <div className="modal-overlay" onClick={(e)=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-header"><h3>{modal==='new'?'+ Nuevo método':'Editar método'}</h3><button type="button" onClick={()=>setModal(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button></div>
            <div className="modal-body">
              <div className="fr">
                <div className="fg"><label>Icono</label><input value={fPago.icono} onChange={sp('icono')} style={{fontSize:20,textAlign:'center'}} maxLength={2}/></div>
                <div className="fg"><label>Nombre *</label><input value={fPago.nombre} onChange={sp('nombre')} placeholder="Ej: Efectivo"/></div>
              </div>
              <div className="fg"><label>Recargo %</label><input type="number" value={fPago.recargo} onChange={sp('recargo')} min="0" step="0.1" placeholder="0"/></div>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,cursor:'pointer',padding:'8px 12px',background:'var(--sf)',borderRadius:8,border:'1px solid var(--bd)'}}>
                <input type="checkbox" checked={!!fPago.activo} onChange={(e)=>setFPago(p=>({...p,activo:e.target.checked}))} style={{width:16,height:16}}/>
                Activo
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={savePago} disabled={saving}>💾 Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DescuentosTab({ api, toast }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ codigo: '', tipo: 'porcentaje', valor: '', usos_maximos: '', usos_actuales: 0, monto_minimo: '', vence: '', notas: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setList(await api('GET', '/codigos')) } catch { setList([]) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  function openNew() { setForm({ codigo: '', tipo: 'porcentaje', valor: '', usos_maximos: '', usos_actuales: 0, monto_minimo: '', vence: '', notas: '' }); setModal('new') }
  function openEdit(c) { setForm({ codigo: c.codigo, tipo: c.tipo, valor: String(c.valor), usos_maximos: String(c.usos_maximos||''), usos_actuales: c.usos_actuales||0, monto_minimo: String(c.monto_minimo||''), vence: c.vence||'', notas: c.notas||'' }); setModal('edit') }

  async function save() {
    if (!form.codigo.trim() || !form.valor) { toast('Código y valor requeridos', 'err'); return }
    setSaving(true)
    try {
      if (modal === 'new') { await api('POST', '/codigos', form); toast('Código creado', 'ok') }
      else { await api('PUT', '/codigos/' + encodeURIComponent(form.codigo), form); toast('Código actualizado', 'ok') }
      setModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function eliminar(codigo) {
    if (!window.confirm('Eliminar código ' + codigo + '?')) return
    try { await api('DELETE', '/codigos/' + encodeURIComponent(codigo)); toast('Código eliminado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }

  if (loading) return <div style={{padding:20,textAlign:'center'}}><div className="spinner" style={{margin:'0 auto'}}/></div>

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:13,color:'var(--mu)'}}>{list.length} código{list.length!==1?'s':''} de descuento</div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo código</button>
      </div>
      {list.length === 0 ? <div style={{fontSize:13,color:'var(--mu)',padding:20,textAlign:'center'}}>Sin códigos de descuento todavía</div> : (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {list.map((c) => (
            <div key={c.codigo} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',borderRadius:8,border:'1px solid var(--bd)',background:'var(--bg)'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:13,fontFamily:'monospace'}}>{c.codigo}</div>
                <div style={{fontSize:11,color:'var(--mu)',marginTop:2}}>
                  {c.tipo === 'porcentaje' ? `${c.valor}% OFF` : `$${c.valor} OFF`}
                  {c.usos_maximos > 0 && ` · usos: ${c.usos_actuales}/${c.usos_maximos}`}
                  {c.monto_minimo > 0 && ` · compra min: $${c.monto_minimo}`}
                  {c.vence && ` · vence: ${new Date(c.vence).toLocaleDateString('es-AR')}`}
                </div>
              </div>
              <span className={`badge ${c.activo?'badge-green':'badge-gray'}`} style={{fontSize:10}}>{c.activo?'Activo':'Inactivo'}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(c)} style={{padding:'3px 8px',fontSize:11}}>✏️</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => eliminar(c.codigo)} style={{padding:'3px 8px',fontSize:11}}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={()=>setModal(null)}>
          <div className="modal" onClick={(e)=>e.stopPropagation()} style={{maxWidth:420}}>
            <div className="modal-header">
              <h3>{modal==='new'?'Nuevo código de descuento':'Editar código'}</h3>
              <button type="button" className="modal-close" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:10}}>
              <Field label="Código">
                <input value={form.codigo} onChange={(e)=>setForm(p=>({...p,codigo:e.target.value.toUpperCase()}))} placeholder="EJ: VERANO30" style={{fontFamily:'monospace',fontSize:13,textTransform:'uppercase'}} disabled={modal==='edit'}/>
              </Field>
              <Field label="Tipo">
                <select value={form.tipo} onChange={(e)=>setForm(p=>({...p,tipo:e.target.value}))}>
                  <option value="porcentaje">% Porcentaje</option>
                  <option value="monto">$ Monto fijo</option>
                </select>
              </Field>
              <Field label={form.tipo==='porcentaje'?'Valor %':'Valor $'}>
                <input type="number" value={form.valor} onChange={(e)=>setForm(p=>({...p,valor:e.target.value}))} min="0" placeholder={form.tipo==='porcentaje'?'Ej: 30':'Ej: 500'}/>
              </Field>
              {modal==='edit' && form.usos_maximos > 0 && (
                <div style={{padding:'8px 12px',background:'var(--sf)',borderRadius:8,fontSize:12,display:'flex',justifyContent:'space-between'}}>
                  <span>Usados: <strong>{form.usos_actuales}</strong></span>
                  <span>Quedan: <strong>{Math.max(0, form.usos_maximos - form.usos_actuales)}</strong></span>
                </div>
              )}
              <Field label="Usos máximos (0 = ilimitado)">
                <input type="number" value={form.usos_maximos} onChange={(e)=>setForm(p=>({...p,usos_maximos:e.target.value}))} min="0" placeholder="0"/>
              </Field>
              <Field label="Compra mínima $ (0 = sin mínimo)">
                <input type="number" value={form.monto_minimo} onChange={(e)=>setForm(p=>({...p,monto_minimo:e.target.value}))} min="0" placeholder="0"/>
              </Field>
              <Field label="Vencimiento (opcional)">
                <input type="date" value={form.vence} onChange={(e)=>setForm(p=>({...p,vence:e.target.value}))}/>
              </Field>
              <Field label="Notas (opcional)">
                <textarea value={form.notas} onChange={(e)=>setForm(p=>({...p,notas:e.target.value}))} rows={2} style={{fontSize:12}} placeholder="Notas internas..."/>
              </Field>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving?'⏳ Guardando...':'💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WebhooksTab({ api, toast }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ url: '', eventos: [] })
  const [saving, setSaving] = useState(false)
  const [testeando, setTesteando] = useState(null)
  const [showToken, setShowToken] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setList(await api('GET', '/webhooks')) } catch { setList([]) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const EVENTOS = [{ id: 'venta.cobrada', label: '💰 Venta cobrada' }, { id: 'cliente.creado', label: '👤 Cliente creado' }, { id: 'producto.actualizado', label: '👕 Producto actualizado' }]

  function openNew() { setForm({ url: '', eventos: [] }); setModal('new') }
  function openEdit(w) { setForm({ url: w.url, eventos: w.eventos || [] }); setModal(w) }

  function toggleEvento(eid) { setForm(p => ({ ...p, eventos: p.eventos.includes(eid) ? p.eventos.filter(x => x !== eid) : [...p.eventos, eid] })) }

  async function save() {
    if (!form.url.trim()) { toast('URL requerida', 'err'); return }
    if (!form.eventos.length) { toast('Seleccioná al menos un evento', 'err'); return }
    setSaving(true)
    try {
      if (modal === 'new') { await api('POST', '/webhooks', form); toast('Webhook creado', 'ok') }
      else { await api('PUT', '/webhooks/' + modal.id, form); toast('Webhook actualizado', 'ok') }
      setModal(null); load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function eliminar(w) {
    if (!window.confirm('Eliminar webhook?')) return
    try { await api('DELETE', '/webhooks/' + w.id); toast('Webhook eliminado', 'ok'); load() }
    catch (e) { toast(e.message, 'err') }
  }

  async function testear(w) {
    setTesteando(w.id)
    try {
      const r = await api('POST', '/webhooks/' + w.id + '/test')
      toast('✅ Respuesta: HTTP ' + r.status + ' ' + (r.statusText || 'OK'), 'ok')
    } catch (e) { toast('❌ ' + e.message, 'err') }
    finally { setTesteando(null) }
  }

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 12, padding: '8px 12px', background: 'var(--sf)', borderRadius: 8 }}>
        🔗 Los webhooks envían eventos en tiempo real a URLs HTTP (ej: n8n, Zapier). Configurá la URL de tu webhook y seleccioná los eventos a escuchar.
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--mu)' }}>{list.length} webhook{list.length !== 1 ? 's' : ''}</div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo webhook</button>
      </div>

      {list.length === 0 ? <div style={{ fontSize: 13, color: 'var(--mu)', padding: 20, textAlign: 'center' }}>Sin webhooks configurados</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map(w => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url}</div>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(w.eventos || []).map(e => <span key={e} className="badge badge-blue" style={{ fontSize: 10 }}>{(EVENTOS.find(x => x.id === e) || {}).label || e}</span>)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--mu)', marginTop: 2, fontFamily: 'monospace' }}>
                  Token: {showToken === w.id ? w.token : w.token ? w.token.slice(0, 12) + '···' : '—'}
                  {w.token && <button type="button" onClick={() => setShowToken(showToken === w.id ? null : w.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--ac)', marginLeft: 4 }}>{showToken === w.id ? '👁️ Ocultar' : '👁️ Mostrar'}</button>}
                </div>
              </div>
              <span className={`badge ${w.activo ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 10 }}>{w.activo ? 'Activo' : 'Inactivo'}</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={testeando === w.id} onClick={() => testear(w)} style={{ padding: '3px 8px', fontSize: 11 }}>{testeando === w.id ? '⏳' : '▶️ Probar'}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(w)} style={{ padding: '3px 8px', fontSize: 11 }}>✏️</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => eliminar(w)} style={{ padding: '3px 8px', fontSize: 11 }}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>{modal === 'new' ? 'Nuevo webhook' : 'Editar webhook'}</h3>
              <button type="button" className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label="URL del webhook (ej: n8n)">
                <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="https://..." style={{ fontFamily: 'monospace', fontSize: 12 }} />
              </Field>
              <Field label="Eventos">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {EVENTOS.map(ev => (
                    <label key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.eventos.includes(ev.id)} onChange={() => toggleEvento(ev.id)} style={{ width: 16, height: 16 }} />
                      {ev.label}
                    </label>
                  ))}
                </div>
              </Field>
              {modal !== 'new' && modal.token && (
                <Field label="Token para receptor público">
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--mu)', wordBreak: 'break-all' }}>{modal.token}</div>
                </Field>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '⏳ Guardando...' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PlanTab({ api, toast }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [solicitando, setSolicitando] = useState(false)

  const load = () => {
    setLoading(true)
    api('GET', '/config/plan').then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  if (loading) return <div style={{padding:20,textAlign:'center'}}><div className="spinner" style={{margin:'0 auto'}}/></div>
  if (!data) return <div style={{color:'var(--mu)',fontSize:13,padding:12}}>No se pudo cargar la información del plan.</div>

  const emp = data.empresa || {}
  const actual = data.plan_actual
  const planes = data.planes || []
  const vto = emp.vencimiento ? new Date(emp.vencimiento) : null
  const diasVto = vto ? Math.ceil((vto - new Date()) / 86400000) : null
  const actualIdx = planes.findIndex((p) => actual && p.id === actual.id)
  const actualMods = actual ? (Array.isArray(actual.modulos) ? actual.modulos : (() => { try { return JSON.parse(actual.modulos||'[]') } catch { return [] } })()) : []
  const MODNAMES = {pos:'POS',caja:'Caja',clientes:'Clientes',ventas:'Ventas',productos:'Productos',ctacte:'Cta. corriente',presupuestos:'Presupuestos',pendientes:'Pendientes',listabebe:'Lista Regalos',transferencias:'Transferencias',proveedores:'Proveedores',gastos:'Gastos',reportes:'Reportes',chat:'Chat sucursales',auditoria:'Auditoría',pipeline:'Pipeline Comercial',arca:'ARCA Facturación',tienda:'Sincronizar Tienda',webhooks:'Webhooks',rrhh:'RRHH'}

  // Check pending solicitud
  let solPendiente = null
  try { solPendiente = emp.solicitud_plan ? JSON.parse(emp.solicitud_plan) : null } catch {}

  async function solicitarPlan(planId, planNombre, esUpgrade) {
    setSolicitando(planId)
    try {
      let prate = null
      try { prate = await api('GET', `/config/plan/prorate?nuevo_plan_id=${planId}`) } catch {}
      let msg = esUpgrade
        ? (prate?.tiene_costo && prate.monto_neto > 0
          ? `💳 Upgrade a ${planNombre}

Días restantes: ${prate.dias_restantes}
Monto a pagar ahora: $${prate.monto_neto}

¿Confirmar solicitud de upgrade?`
          : `¿Solicitar upgrade a ${planNombre}? El administrador lo procesará.`)
        : (prate?.mensaje || `Al hacer downgrade el plan actual continúa hasta su vencimiento.

¿Confirmar cambio a ${planNombre}?`)
      if (!window.confirm(msg)) { setSolicitando(false); return }
      await api('POST', '/config/plan/solicitar', { plan_id: planId, tipo: esUpgrade ? 'upgrade' : 'downgrade' })
      toast('Solicitud enviada — el administrador fue notificado', 'ok')
      load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSolicitando(false) }
  }

  return (
    <div>
      {/* Plan actual */}
      {actual ? (
        <div style={{background:'var(--ac)',borderRadius:10,padding:'14px 18px',marginBottom:14,color:'#fff',display:'flex',gap:12,alignItems:'center'}}>
          <div style={{fontSize:28}}>📦</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:16}}>{actual.nombre}</div>
            <div style={{fontSize:12,opacity:.85}}>
              {vto ? <span style={{color:diasVto!=null&&diasVto<=7?'#fde68a':'rgba(255,255,255,.85)'}}>{diasVto!=null&&diasVto<=0?'⚠️ VENCIDO':'Vence: '+vto.toLocaleDateString('es-AR')}{diasVto!=null&&diasVto>0&&diasVto<=30?' ('+diasVto+' días)':''}</span> : 'Sin vencimiento'}
            </div>
            <div style={{fontSize:11,marginTop:2,opacity:.85}}>👥 {emp.usuarios_max||actual.usuarios_max||'?'} usuarios · 🏪 {emp.sucursales_max||actual.sucursales_max||'?'} sucursales</div>
          </div>
        </div>
      ) : <div style={{padding:'10px 14px',background:'var(--sf)',borderRadius:8,border:'1px solid var(--bd)',marginBottom:14,color:'var(--mu)'}}>Sin plan asignado. Contactá al administrador.</div>}

      {/* Solicitud pendiente */}
      {solPendiente && (
        <div style={{padding:'8px 12px',background:'rgba(245,158,11,.1)',border:'1px solid var(--warn)',borderRadius:8,marginBottom:12,fontSize:12}}>
          ⏳ Solicitud pendiente de aprobación: {solPendiente.tipo} → {solPendiente.plan_nombre||solPendiente.plan_id}. El administrador la procesará pronto.
        </div>
      )}

      {/* Planes disponibles */}
      {planes.length > 0 && (
        <div>
          <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>Planes disponibles</div>
          {planes.map((p, i) => {
            const esCurrent = actual && p.id === actual.id
            const esUpgrade = actualIdx >= 0 ? i > actualIdx : false
            const pMods = Array.isArray(p.modulos) ? p.modulos : (() => { try { return JSON.parse(p.modulos||'[]') } catch { return [] } })()
            const ganados = pMods.filter((m) => !actualMods.includes(m))
            const perdidos = actualMods.filter((m) => !pMods.includes(m))
            return (
              <div key={p.id} style={{padding:'12px 14px',borderRadius:8,marginBottom:8,border:esCurrent?'2px solid var(--ac)':'1px solid var(--bd)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <div style={{fontWeight:700}}>📦 {p.nombre} — {p.precio ? `$${p.precio}/mes` : 'Gratis'}</div>
                  {esCurrent
                    ? <span className="badge badge-green">Plan actual</span>
                    : <span className={`badge ${esUpgrade?'badge-blue':'badge-gray'}`}>{esUpgrade?'⬆ Upgrade':'⬇ Downgrade'}</span>}
                </div>
                <div style={{fontSize:11,color:'var(--mu)',marginBottom:6}}>
                  👥 {p.usuarios_max||'∞'} usuarios · 🏪 {p.sucursales_max||'∞'} sucursales · {pMods.length} módulos
                </div>
                {!esCurrent && actual && (ganados.length>0||perdidos.length>0) && (
                  <div style={{fontSize:11,marginBottom:8}}>
                    {ganados.length>0 && <div style={{color:'var(--ok)'}}>✅ Se habilitarán: {ganados.map(m=>MODNAMES[m]||m).join(', ')}</div>}
                    {perdidos.length>0 && <div style={{color:'var(--bad)'}}>❌ Se deshabilitarán: {perdidos.map(m=>MODNAMES[m]||m).join(', ')}</div>}
                  </div>
                )}
                {!esCurrent && !solPendiente && (
                  <button type="button" className={`btn btn-sm ${esUpgrade?'btn-primary':''}`}
                    style={esUpgrade?{}:{border:'1px solid var(--bd)'}}
                    onClick={() => solicitarPlan(p.id, p.nombre, esUpgrade)}
                    disabled={solicitando===p.id}>
                    {solicitando===p.id ? '⏳ Enviando...' : esUpgrade ? `⬆ Mejorar a ${p.nombre}` : `⬇ Cambiar a ${p.nombre}`}
                  </button>
                )}
              </div>
            )
          })}
          <div style={{fontSize:11,color:'var(--mu)',marginTop:8}}>Los cambios son procesados por el administrador de FlexCRM. Te contactaremos a la brevedad.</div>
        </div>
      )}
    </div>
  )
}

function MiCuentaTab({ api, toast }) {
  const { me } = useAuth()
  const [form, setForm] = useState({ password_actual: '', password_nuevo: '', password_repetir: '' })
  const [saving, setSaving] = useState(false)

  async function cambiarPass() {
    if (!form.password_actual || !form.password_nuevo) return toast('Completá todos los campos', 'err')
    if (form.password_nuevo.length < 6) return toast('Mínimo 6 caracteres', 'err')
    if (form.password_nuevo !== form.password_repetir) return toast('Las contraseñas nuevas no coinciden', 'err')
    setSaving(true)
    try {
      await api('POST', '/auth/cambiar-password', { password_actual: form.password_actual, password_nuevo: form.password_nuevo })
      toast('✅ Contraseña cambiada correctamente', 'ok')
      setForm({ password_actual: '', password_nuevo: '', password_repetir: '' })
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  const ROLE_LABELS = { admin: 'Admin', supervisor: 'Supervisor', cajero: 'Cajero', vendedor: 'Vendedor', readonly: 'Solo lectura' }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{padding:'14px 16px',background:'var(--sf)',borderRadius:10,border:'1px solid var(--bd)'}}>
        <div style={{fontWeight:600,fontSize:14,marginBottom:10}}>👤 Mis datos</div>
        <div className="fr">
          <Field label="Nombre"><input value={me?.nombre||''} disabled style={{opacity:.7}}/></Field>
          <Field label="Usuario"><input value={me?.usuario||''} disabled style={{opacity:.7}}/></Field>
        </div>
        <div className="fr">
          <Field label="Email"><input value={me?.email||''} disabled style={{opacity:.7}}/></Field>
          <Field label="Rol"><input value={ROLE_LABELS[me?.rol]||me?.rol||''} disabled style={{opacity:.7}}/></Field>
        </div>
      </div>

      <div style={{padding:'14px 16px',background:'var(--sf)',borderRadius:10,border:'1px solid var(--bd)'}}>
        <div style={{fontWeight:600,fontSize:14,marginBottom:10}}>🔑 Cambiar contraseña</div>
        <Field label="Contraseña actual">
          <input type="password" value={form.password_actual} onChange={e => setForm(p=>({...p,password_actual:e.target.value}))} placeholder="••••••••"/>
        </Field>
        <Field label="Nueva contraseña">
          <input type="password" value={form.password_nuevo} onChange={e => setForm(p=>({...p,password_nuevo:e.target.value}))} placeholder="Mín. 6 caracteres" minLength={6}/>
        </Field>
        <Field label="Repetir nueva contraseña">
          <input type="password" value={form.password_repetir} onChange={e => setForm(p=>({...p,password_repetir:e.target.value}))} placeholder="Confirmar"/>
        </Field>
        <button type="button" className="btn btn-primary" onClick={cambiarPass} disabled={saving} style={{marginTop:8}}>
          {saving ? '⏳ Cambiando...' : '🔑 Cambiar contraseña'}
        </button>
      </div>
    </div>
  )
}

function BackupsTab({ api, toast }) {
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(null)

  const load = useCallback(async () => {
    try { const d = await api('GET', '/backup/backups'); setBackups(Array.isArray(d)?d:[]) }
    catch { setBackups([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function hacerBackup() {
    setSaving(true)
    try {
      const r = await api('POST', '/backup/now')
      toast(`✅ Backup creado: ${r.filename}`, 'ok')
      load()
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function restaurar(nombre) {
    if (!window.confirm(`¿Restaurar backup ${nombre}?\n\nSe creará un backup de seguridad del estado actual.\nEl sistema se reiniciará automáticamente.`)) return
    setRestoring(nombre)
    try {
      await api('POST', '/backup/restore', { nombre })
      toast('✅ Backup restaurado. El sistema se reiniciará...', 'ok')
      setTimeout(() => window.location.reload(), 3000)
    } catch (e) { toast(e.message, 'err') }
    finally { setRestoring(null) }
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleString('es-AR') : '—'

  if (loading) return <Loader/>

  return (
    <div>
      <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
        <button type="button" className="btn btn-primary" onClick={hacerBackup} disabled={saving}>
          {saving ? '⏳ Creando...' : '💾 Hacer backup ahora'}
        </button>
        <span style={{fontSize:12,color:'var(--mu)'}}>{backups.length} backup(s) guardados</span>
      </div>
      <div className="card" style={{padding:0}}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Archivo</th><th>Fecha</th><th>Tamaño</th><th style={{width:80}}></th></tr></thead>
            <tbody>
              {backups.length===0
                ? <EmptyRow cols={4} icon="💾" text="Sin backups. Creá el primero."/>
                : backups.map((b,i)=>(
                    <tr key={i}>
                      <td style={{fontFamily:'monospace',fontSize:12}}>{b.nombre}</td>
                      <td style={{fontSize:12}}>{fmtDate(b.fecha)}</td>
                      <td style={{fontSize:12}}>{b.tamaño}</td>
                      <td>
                        <button type="button" className="btn btn-icon btn-sm" style={{color:'var(--bad)'}}
                          onClick={()=>restaurar(b.nombre)} disabled={restoring===b.nombre}
                          title="Restaurar este backup">
                          {restoring===b.nombre ? '⏳' : '🔄'}
                        </button>
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

function TiendaSection({ id, icon, label, fields, configurado, openSection, setOpenSection, syncing, doPush, doPull }) {
  const isOpen = openSection === id
  return (
    <div style={{border:'1px solid var(--bd)',borderRadius:10,marginBottom:10,overflow:'hidden'}}>
      <div onClick={() => setOpenSection(isOpen ? null : id)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',cursor:'pointer',background:'var(--sf)',userSelect:'none',borderBottom: isOpen ? '1px solid var(--bd)' : 'none'}}>
        <span style={{fontSize:12,opacity:.6}}>{isOpen ? '▼' : '▶'}</span>
        <span style={{fontSize:18}}>{icon}</span>
        <span style={{fontWeight:600,fontSize:13,flex:1}}>{label}</span>
        <span style={{fontSize:11,color: configurado ? 'var(--ok)' : 'var(--mu)'}}>{configurado ? '✅ Configurado' : '❌ Sin configurar'}</span>
      </div>
      {isOpen && (
        <div style={{padding:'10px 14px'}}>
          {fields}
          <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
            <button type="button" className="btn btn-primary btn-sm" disabled={syncing} onClick={() => doPush(id)}>📤 Push stock</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={syncing} onClick={() => doPull(id)}>📥 Pull pedidos</button>
          </div>
        </div>
      )}
    </div>
  )
}

function TiendaTab({ api, toast, form, set, allSucs, setForm }) {
  const [openSection, setOpenSection] = useState('woocommerce')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    api('POST', '/sync-tienda/ensure-sucursal').catch(() => {})
  }, [])

  async function doPush(p) {
    setSyncing(true)
    try {
      const r = p ? await api('POST', `/sync-tienda/push-stock/${p}`) : await api('POST', '/sync-tienda/push-stock')
      const res = p ? { [p]: r } : r.results
      const msgs = Object.entries(res).map(([k, v]) => `${k}: ${v.ok||0} OK, ${v.fail||0} fail`)
      toast(`✅ Stock sincronizado\n${msgs.join('\n')}`, 'ok')
      if (r.errors?.length) console.warn('Errores sync:', r.errors.slice(0, 5))
      const cfg = await api('GET', '/config')
      setForm(prev => ({ ...prev, tienda_ultima_sync: cfg.tienda_ultima_sync }))
    } catch (e) { toast('⚠️ ' + e.message, 'err') }
    setSyncing(false)
  }

  async function doPull(p) {
    setSyncing(true)
    try {
      const r = p ? await api('POST', `/sync-tienda/pull-orders/${p}`) : await api('POST', '/sync-tienda/pull-orders')
      const res = p ? { [p]: r } : r.results
      const msgs = Object.entries(res).map(([k, v]) => `${k}: ${v.importadas||0} pedidos`)
      toast(`📥 ${msgs.join(' | ')}`, 'ok')
    } catch (e) { toast('⚠️ ' + e.message, 'err') }
    setSyncing(false)
  }

  return (
    <>
      <div style={{background:'rgba(37,99,235,.06)',border:'1px solid rgba(37,99,235,.2)',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:14}}>
        🛒 Sincronización multiplataforma. Configurá una o más tiendas. El stock se toma de la sucursal <strong>Tienda Online</strong> (creada automáticamente) — transferí stock desde la sucursal física usando <strong>Transferencias</strong>.
      </div>

      <TiendaSection
        id="woocommerce"
        icon="🟣"
        label="WooCommerce"
        configurado={!!(form.tienda_woo_url && form.tienda_woo_key && form.tienda_woo_secret)}
        openSection={openSection} setOpenSection={setOpenSection} syncing={syncing} doPush={doPush} doPull={doPull}
        fields={<>
          <Field label="URL de la tienda">
            <input value={form.tienda_woo_url} onChange={set('tienda_woo_url')} placeholder="https://tutienda.com" style={{fontFamily:'monospace',fontSize:12}}/>
          </Field>
          <div className="fr">
            <Field label="Consumer Key">
              <input value={form.tienda_woo_key} onChange={set('tienda_woo_key')} placeholder="ck_..." style={{fontFamily:'monospace',fontSize:11}}/>
            </Field>
            <Field label="Consumer Secret">
              <input value={form.tienda_woo_secret} onChange={set('tienda_woo_secret')} placeholder="cs_..." style={{fontFamily:'monospace',fontSize:11}}/>
            </Field>
          </div>
        </>}
      />

      <TiendaSection
        id="tiendanube"
        icon="🔵"
        label="Tienda Nube"
        configurado={!!(form.tienda_tn_store_id && form.tienda_tn_access_token)}
        openSection={openSection} setOpenSection={setOpenSection} syncing={syncing} doPush={doPush} doPull={doPull}
        fields={<>
          <div className="fr">
            <Field label="Store ID">
              <input value={form.tienda_tn_store_id} onChange={set('tienda_tn_store_id')} placeholder="123456" style={{fontFamily:'monospace',fontSize:12}}/>
            </Field>
            <Field label="Access Token">
              <input value={form.tienda_tn_access_token} onChange={set('tienda_tn_access_token')} placeholder="bearer token" style={{fontFamily:'monospace',fontSize:11}}/>
            </Field>
          </div>
        </>}
      />

      <TiendaSection
        id="mercadolibre"
        icon="🟡"
        label="MercadoLibre"
        configurado={!!(form.tienda_meli_access_token && form.tienda_meli_seller_id)}
        openSection={openSection} setOpenSection={setOpenSection} syncing={syncing} doPush={doPush} doPull={doPull}
        fields={<>
          <div style={{fontSize:11,color:'var(--mu)',marginBottom:10}}>Necesitás crear una aplicación en <a href="https://developers.mercadolibre.com" target="_blank" rel="noopener" style={{color:'var(--ac)'}}>developers.mercadolibre.com</a> para obtener APP ID y Client Secret.</div>
          <div className="fr">
            <Field label="APP ID">
              <input value={form.tienda_meli_app_id} onChange={set('tienda_meli_app_id')} placeholder="..." style={{fontFamily:'monospace',fontSize:12}}/>
            </Field>
            <Field label="Client Secret">
              <input value={form.tienda_meli_client_secret} onChange={set('tienda_meli_client_secret')} placeholder="..." style={{fontFamily:'monospace',fontSize:11}}/>
            </Field>
          </div>
          <div className="fr">
            <Field label="Seller ID">
              <input value={form.tienda_meli_seller_id} onChange={set('tienda_meli_seller_id')} placeholder="..." style={{fontFamily:'monospace',fontSize:12}}/>
            </Field>
            <Field label="User ID">
              <input value={form.tienda_meli_user_id} onChange={set('tienda_meli_user_id')} placeholder="opcional" style={{fontFamily:'monospace',fontSize:12}}/>
            </Field>
          </div>
          <Field label="Access Token">
            <input value={form.tienda_meli_access_token} onChange={set('tienda_meli_access_token')} placeholder="token..." style={{fontFamily:'monospace',fontSize:11}}/>
          </Field>
          <Field label="Refresh Token">
            <input value={form.tienda_meli_refresh_token} onChange={set('tienda_meli_refresh_token')} placeholder="refresh..." style={{fontFamily:'monospace',fontSize:11}}/>
          </Field>
          {form.tienda_meli_expires_at && (
            <div style={{fontSize:11,color:'var(--mu)',marginTop:4}}>Expira: {new Date(form.tienda_meli_expires_at).toLocaleString('es-AR')}</div>
          )}
          <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={async () => {
              const empresa = (await api('GET', '/config')).empresa || 'default'
              try {
                const r = await api('GET', `/sync-tienda/meli/auth-url?empresa=${encodeURIComponent(empresa)}`)
                window.open(r.url, '_blank', 'width=600,height=700')
              } catch (e) { toast('⚠️ ' + e.message, 'err') }
            }}>🔗 Obtener token ML</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={async () => {
              try {
                await api('POST', '/sync-tienda/meli/refresh')
                toast('✅ Token refrescado', 'ok')
                const cfg = await api('GET', '/config')
                setForm(prev => ({ ...prev, tienda_meli_access_token: cfg.tienda_meli_access_token, tienda_meli_refresh_token: cfg.tienda_meli_refresh_token, tienda_meli_expires_at: cfg.tienda_meli_expires_at }))
              } catch (e) { toast('⚠️ ' + e.message, 'err') }
            }}>🔄 Refrescar token</button>
          </div>
        </>}
      />

      {form.tienda_ultima_sync && (
        <div style={{fontSize:12,color:'var(--mu)',marginTop:8,marginBottom:12}}>
          Última sincronización: {new Date(form.tienda_ultima_sync).toLocaleString('es-AR')}
        </div>
      )}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button type="button" className="btn btn-primary" disabled={syncing} onClick={() => doPush(null)}>🔄 Sincronizar TODO</button>
        <button type="button" className="btn btn-secondary" disabled={syncing} onClick={() => doPull(null)}>📥 Importar TODO</button>
      </div>
    </>
  )
}

