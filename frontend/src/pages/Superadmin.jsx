import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useDataState, useDelSolState, useLoginState, useForgotState, useResetState, usePassState, useSaSecState, useEmpState, usePlanState, useProspState, useTicketState, useLandingState, useEmailState, useAtributoState, useMtState, useDeleteState, useAppsState, useLegalState, useNotifState, useDetailState, useMpState } from './superadminState'

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
const TODOS_MODS = ['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','listabebe','transferencias','proveedores','reportes','auditoria','chat','pipeline','arca','tienda','webhooks','rrhh','tesoreria']
const MOD_LABELS = {pos:'🛒 POS',caja:'💰 Caja',clientes:'👥 Clientes',ventas:'📋 Ventas',productos:'👕 Productos',ctacte:'📒 Cta Cte',presupuestos:'📄 Presupuestos',pendientes:'🚚 Pendientes',listabebe:'🍼 Lista Bebé',transferencias:'🔄 Transferencias',proveedores:'📦 Proveedores',reportes:'📈 Reportes',auditoria:'🔍 Auditoría',chat:'💬 Chat',pipeline:'📋 Pipeline',arca:'📄 ARCA',tienda:'🛒 Tienda',webhooks:'🔗 Webhooks',rrhh:'👥 RRHH',tesoreria:'💵 Tesorería'}
const ROLE_LABELS = { admin: 'Admin', supervisor: 'Supervisor', vendedor: 'Vendedor', cajero: 'Cajero', tesorero: 'Tesorero', readonly: 'Solo lectura' }
const ROLE_COLORS = { admin:'#f59e0b', supervisor:'#3b82f6', vendedor:'#10b981', cajero:'#8b5cf6', tesorero:'#0ea5e9', readonly:'#6b7280' }
const MOD_ROLES = {
  pos: ['admin','supervisor','vendedor','cajero'],
  caja: ['admin','supervisor','cajero'],
  clientes: ['admin','supervisor','vendedor','cajero','readonly'],
  ventas: ['admin','supervisor','vendedor','cajero','readonly'],
  productos: ['admin','supervisor','vendedor','cajero','readonly'],
  ctacte: ['admin','supervisor'],
  presupuestos: ['admin','supervisor','vendedor'],
  pendientes: ['admin','supervisor','vendedor','cajero'],
  listabebe: ['admin','supervisor'],
  transferencias: ['admin','supervisor'],
  proveedores: ['admin','supervisor'],
  gastos: ['admin','supervisor'],
  reportes: ['admin','supervisor','readonly'],
  auditoria: ['admin','supervisor'],
  chat: ['admin','supervisor','vendedor','cajero'],
  pipeline: ['admin','supervisor'],
  arca: ['admin','supervisor'],
  tienda: ['admin','supervisor'],
  webhooks: ['admin','supervisor'],
  rrhh: ['admin','supervisor'],
  tesoreria: ['admin','tesorero'],
}
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
  ['eliminaciones', '🗑️ Eliminaciones'],
  ['planes', '💼 Planes'],
  ['modulos', '🧩 Módulos'],
  ['tesoreria', '💵 Tesorería'],
  ['email', '📧 Email'],
  ['pagos', '💳 Pagos'],
  ['atributos', '🏷️ Atributos'],
  ['mantenimiento', '🔧 Mantenimiento'],
  ['landing', '🌐 Landing'],
  ['soporte', '🆘 Soporte'],
  ['apps', '🧩 Apps'],
  ['legal', '⚖️ Legal'],
  ['notificaciones', '🔔 Notificaciones'],
  ['roles', '👤 Roles'],
  ['seguridad', '🔐 Seguridad'],
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

function SaQR({ otpauth }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && otpauth) {
      QRCode.toCanvas(ref.current, otpauth, { width: 220, margin: 2 }, (err) => {
        if (err) console.error('QR error:', err)
      })
    }
  }, [otpauth])
  return <canvas ref={ref} style={{ background: '#fff', borderRadius: 8 }} />
}

export default function Superadmin() {
  const [logged, setLogged] = useState(false)
  const [user, setUser] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 1023)
  const [loading, setLoading] = useState({})
  const [impersonating, setImpersonating] = useState(null)

  const { dash, setDash, empresas, setEmpresas, planes, setPlanes, modulos, setModulos, solicitudes, setSolicitudes, solicitudesElim, setSolicitudesElim, audit, setAudit, prospectos, setProspectos, leads, setLeads } = useDataState()
  const { delSolModal, setDelSolModal, delSolSaving, setDelSolSaving, delSolBackup, setDelSolBackup, delSolEmail, setDelSolEmail } = useDelSolState()

  const { loginForm, setLoginForm, loginErr, setLoginErr, loginLoading, setLoginLoading, sa2faStep, setSa2faStep, sa2faCode, setSa2faCode, sa2faSetup, setSa2faSetup, sa2faQr, setSa2faQr, sa2faSecret, setSa2faSecret, saConfiar, setSaConfiar } = useLoginState()

  const { saForgot, setSaForgot, forgotEmail, setForgotEmail, forgotLoading, setForgotLoading, forgotSent, setForgotSent, forgotErr, setForgotErr } = useForgotState()
  const { saReset, setSaReset, resetToken, setResetToken, resetForm, setResetForm, resetLoading, setResetLoading, resetDone, setResetDone, resetErr, setResetErr } = useResetState()
  const { passModal, setPassModal, passForm, setPassForm } = usePassState()

  // Panel Seguridad (2FA propio del superadmin)
  const { saSecEnabled, setSaSecEnabled, saSecSetup, setSaSecSetup, saSecCode, setSaSecCode, saSecBackup, setSaSecBackup, saSecDevices, setSaSecDevices, saSecLoading, setSaSecLoading, saSecErr, setSaSecErr } = useSaSecState()

  const { empModal, setEmpModal, empForm, setEmpForm, empSaving, setEmpSaving } = useEmpState()
  const { planModal, setPlanModal, planForm, setPlanForm, planSaving, setPlanSaving, planIncluirInactivos, setPlanIncluirInactivos, planHighlight, setPlanHighlight } = usePlanState()
  const { prospForm, setProspForm, prospModal, setProspModal, prospSaving, setProspSaving, prospFiltro, setProspFiltro, prospDetalle, setProspDetalle, segForm, setSegForm, segSaving, setSegSaving } = useProspState()
  const { tickets, setTickets, ticketFiltro, setTicketFiltro, ticketRespuesta, setTicketRespuesta, ticketRespondiendo, setTicketRespondiendo, ticketSaving, setTicketSaving } = useTicketState()
  const { landingFiltro, setLandingFiltro, landingStats, setLandingStats, statsDias, setStatsDias, statsPagina, setStatsPagina } = useLandingState()
  const { emailConfig, setEmailConfig, emailSaving, setEmailSaving, emailTesting, setEmailTesting, emailTestResult, setEmailTestResult } = useEmailState()
  const { atributos, setAtributos, atributoModal, setAtributoModal, atributoForm, setAtributoForm, atributoSaving, setAtributoSaving, atributoFiltroRubro, setAtributoFiltroRubro } = useAtributoState()
  const { mtItems, setMtItems, mtModal, setMtModal, mtForm, setMtForm, mtSaving, setMtSaving } = useMtState()
  const { deleteModal, setDeleteModal, deleteBackup, setDeleteBackup, deleteEmail, setDeleteEmail, deleteSaving, setDeleteSaving } = useDeleteState()
  const { appsData, setAppsData, appsInstaladas, setAppsInstaladas, appsStats, setAppsStats, appsFiltroCat, setAppsFiltroCat, appsFiltroEmp, setAppsFiltroEmp, appModal, setAppModal, appForm, setAppForm, appSaving, setAppSaving } = useAppsState()
  const { legalEmpresas, setLegalEmpresas, legalAuditData, setLegalAuditData, legalMsg, setLegalMsg, legalMsgErr, setLegalMsgErr } = useLegalState()
  const { notifForm, setNotifForm, tesSaving, setTesSaving, notifEnviando, setNotifEnviando, notifMsg, setNotifMsg, notifHistorial, setNotifHistorial } = useNotifState()
  const { empresaDetail, setEmpresaDetail, empresaDetailTab, setEmpresaDetailTab, detailAudit, setDetailAudit, detailApps, setDetailApps, detailNotas, setDetailNotas, detailPagos, setDetailPagos, detailVencimientos, setDetailVencimientos, detailLoading, setDetailLoading, detailAuditSearch, setDetailAuditSearch, notaForm, setNotaForm, notaSaving, setNotaSaving, manualPagoModal, setManualPagoModal, manualPagoForm, setManualPagoForm, manualPagoSaving, setManualPagoSaving } = useDetailState()
  const { mpConfig, setMpConfig, mpSaving, setMpSaving, mpTesting, setMpTesting, mpTestResult, setMpTestResult, billingConfig, setBillingConfig, billingSaving, setBillingSaving, pagosList, setPagosList, pagosFiltro, setPagosFiltro, pagosMes, setPagosMes, webhookLogs, setWebhookLogs } = useMpState()

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
    try {
      const r = await saApi('POST', '/login', loginForm)
      if (r.require_2fa) { setSa2faStep({ temp_token: r.temp_token, nombre: r.nombre }); return }
      if (r.require_2fa_setup) { setSa2faSetup({ temp_token: r.temp_token, nombre: r.nombre }); saStartSetup(r.temp_token); return }
      if (r.require_password_change) { setLoginErr('Debés cambiar tu contraseña. Contactá al administrador.'); return }
      if (r.dispositivo_confiable) { /* trusted device login — no 2FA needed */ }
      setLogged(true); setUser(r); loadAll()
    }
    catch (e) { setLoginErr(e.message) }
    finally { setLoginLoading(false) }
  }

  async function saVerify2fa() {
    setLoginLoading(true); setLoginErr('')
    try {
      const r = await saApi('POST', '/2fa/verify-login', { temp_token: sa2faStep.temp_token, code: sa2faCode, confiar_dispositivo: saConfiar })
      setLogged(true); setUser(r); loadAll()
      setSa2faStep(null); setSa2faCode('')
    } catch(e) { setLoginErr(e.message) }
    finally { setLoginLoading(false) }
  }

  async function saStartSetup(tempToken) {
    try {
      const r = await saApi('POST', '/2fa/setup-forced', { temp_token: tempToken || sa2faSetup.temp_token })
      setSa2faQr(r.otpauth); setSa2faSecret(r.secret)
    } catch(e) { setLoginErr(e.message) }
  }

  async function saConfirmSetup() {
    if (sa2faCode.length < 6) { setLoginErr('Ingresá el código de 6 dígitos'); return }
    setLoginLoading(true); setLoginErr('')
    try {
      const r = await saApi('POST', '/2fa/confirm-forced', { temp_token: sa2faSetup.temp_token, code: sa2faCode, confiar_dispositivo: saConfiar })
      setLogged(true); setUser(r); loadAll()
      setSa2faSetup(null); setSa2faQr(null); setSa2faSecret(null); setSa2faCode('')
      if (r.backup_codes) {
        const codesText = r.backup_codes.join('\n')
        window.alert('¡2FA activado!\n\nGuardá estos códigos de respaldo:\n\n' + codesText + '\n\nSe copiaron al portapapeles.')
        navigator.clipboard?.writeText(codesText)
      }
    } catch(e) { setLoginErr(e.message) }
    finally { setLoginLoading(false) }
  }

  async function saSecLoad() {
    try {
      const [status, devs] = await Promise.all([
        saApi('GET', '/2fa/status').catch(() => ({ enabled: false })),
        saApi('GET', '/2fa/devices').catch(() => ({ devices: [] })),
      ])
      setSaSecEnabled(!!status.enabled)
      setSaSecDevices(devs.devices || [])
    } catch(e) { setSaSecErr(e.message) }
  }

  async function saSecStartSetup() {
    setSaSecLoading(true); setSaSecErr('')
    try {
      const r = await saApi('POST', '/2fa/setup')
      setSaSecSetup({ otpauth: r.otpauth, secret: r.secret })
    } catch(e) { setSaSecErr(e.message) }
    finally { setSaSecLoading(false) }
  }

  async function saSecConfirm() {
    if (saSecCode.length < 6) { setSaSecErr('Ingresá el código de 6 dígitos'); return }
    setSaSecLoading(true); setSaSecErr('')
    try {
      const r = await saApi('POST', '/2fa/confirm', { code: saSecCode })
      setSaSecEnabled(true); setSaSecSetup(null); setSaSecCode(''); setSaSecBackup(r.backup_codes || [])
    } catch(e) { setSaSecErr(e.message) }
    finally { setSaSecLoading(false) }
  }

  async function saSecDisable() {
    if (!window.confirm('¿Deshabilitar la autenticación en dos pasos del superadmin?')) return
    setSaSecLoading(true); setSaSecErr('')
    try {
      await saApi('POST', '/2fa/disable')
      setSaSecEnabled(false); setSaSecBackup(null)
    } catch(e) { setSaSecErr(e.message) }
    finally { setSaSecLoading(false) }
  }

  async function saSecRevokeDevice(index) {
    try { await saApi('POST', '/2fa/devices/revoke', { index }); const d = await saApi('GET', '/2fa/devices'); setSaSecDevices(d.devices || []) }
    catch(e) { setSaSecErr(e.message) }
  }

  async function saSecRevokeAll() {
    if (!window.confirm('¿Revocar todos los dispositivos confiables? Se pedirá 2FA en cada uno nuevamente.')) return
    try { await saApi('POST', '/2fa/devices/revocar-todos'); setSaSecDevices([]) }
    catch(e) { setSaSecErr(e.message) }
  }

  async function saLogout() { try { await saApi('POST', '/logout') } catch {} setLogged(false); setUser(null); setImpersonating(null) }

  async function saForgotPassword() {
    if (!forgotEmail.trim()) { setForgotErr('Ingresá tu email'); return }
    setForgotLoading(true); setForgotErr('')
    try {
      await saApi('POST', '/forgot-password', { email: forgotEmail.trim() })
      setForgotSent(true)
    } catch(e) { setForgotErr(e.message) }
    finally { setForgotLoading(false) }
  }

  async function saResetPassword() {
    if (resetForm.password.length < 8) { setResetErr('Mínimo 8 caracteres'); return }
    if (!/[A-Z]/.test(resetForm.password) || !/[0-9]/.test(resetForm.password) || !/[^A-Za-z0-9]/.test(resetForm.password)) { setResetErr('Debe contener mayúscula, número y símbolo'); return }
    if (resetForm.password !== resetForm.repetir) { setResetErr('Las contraseñas no coinciden'); return }
    setResetLoading(true); setResetErr('')
    try {
      await saApi('POST', '/reset-password', { token: resetToken, password: resetForm.password })
      setResetDone(true)
    } catch(e) { setResetErr(e.message) }
    finally { setResetLoading(false) }
  }

  // Check for reset token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) { setSaReset(true); setResetToken(token) }
  }, [])

  function loadAll() {
    loadDash(); loadEmpresas(); loadPlanes(); loadModulos(); loadSolicitudes(); loadSolicitudesEliminacion(); loadAudit(); loadProspectos(); loadLanding(); loadLandingStats(); loadTickets(); loadEmailConfig(); loadAtributos(); loadMantenimiento(); loadMpConfig(); loadBillingConfig();
    try { const imp = JSON.parse(sessionStorage.getItem('SA_IMP') || 'null'); if (imp) setImpersonating(imp) } catch {}
  }

  useEffect(() => {
    if (logged && tab === 'pagos') { loadPagos(); loadWebhookLogs() }
  }, [logged, tab])

  async function loadDash() { try { const r = await saApi('GET', '/dashboard'); setDash(r) } catch {} }
  async function loadEmpresas() { try { const r = await saApi('GET', '/empresas'); setEmpresas(r) } catch {} }
  async function loadPlanes(incluir) {
    const flag = incluir !== undefined ? incluir : planIncluirInactivos;
    try { const r = await saApi('GET', '/planes' + (flag ? '?incluir_inactivos=1' : '')); setPlanes(r) } catch {}
  }
  async function loadModulos() { try { const r = await saApi('GET', '/modulos'); setModulos(r) } catch {} }
  async function loadSolicitudes() { try { setLoading(p=>({...p,sol:true})); const r = await saApi('GET', '/solicitudes-plan'); setSolicitudes(r) } catch {} finally { setLoading(p=>({...p,sol:false})) } }
  async function loadSolicitudesEliminacion() { try { const r = await saApi('GET', '/solicitudes-eliminacion'); setSolicitudesElim(r) } catch {} }
  async function loadAudit() { try { const r = await saApi('GET', '/audit'); setAudit(r) } catch {} }
  async function loadProspectos() { try { const r = await saApi('GET', '/prospectos'); setProspectos(r) } catch {} }
  async function loadLanding() { try { const r = await saApi('GET', '/landing-leads'); setLeads(r) } catch {} }
  async function loadLandingStats() { try { const r = await saApi('GET', '/landing-stats?dias=' + statsDias + (statsPagina ? '&pagina=' + encodeURIComponent(statsPagina) : '')); setLandingStats(r) } catch {} }
  async function loadTickets() { try { const r = await saApi('GET', '/solicitudes-soporte'); setTickets(r) } catch {} }
  async function loadEmailConfig() { try { const r = await saApi('GET', '/email-config'); setEmailConfig(r) } catch {} }
  async function loadMpConfig() { try { const r = await saApi('GET', '/mp-config'); setMpConfig(r) } catch {} }
  async function loadBillingConfig() { try { const r = await saApi('GET', '/billing/config'); setBillingConfig(r) } catch {} }
  async function loadPagos() { try { const r = await saApi('GET', '/saas-pagos' + (pagosFiltro ? '?estado=' + pagosFiltro : '') + (pagosMes ? (pagosFiltro ? '&' : '?') + 'mes=' + pagosMes : '')); setPagosList(r) } catch {} }
  async function loadWebhookLogs() { try { const r = await saApi('GET', '/saas-webhooks?limit=100'); setWebhookLogs(r) } catch {} }

  useEffect(() => { if (logged) loadPlanes(planIncluirInactivos) }, [planIncluirInactivos])
  useEffect(() => {
    if (planHighlight) {
      const el = document.getElementById('plan-' + planHighlight)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const t = setTimeout(() => setPlanHighlight(null), 3000)
      return () => clearTimeout(t)
    }
  }, [planes, planHighlight])

  async function saveMpConfig() {
    setMpSaving(true); setMpTestResult(null)
    try {
      const body = {
        enabled: mpConfig.enabled,
        mode: mpConfig.mode,
        access_token: mpConfig.access_token_masked || '',
        public_key: mpConfig.public_key || '',
        webhook_secret: mpConfig.webhook_secret_masked || '',
        currency: mpConfig.currency,
        back_url_base: mpConfig.back_url_base || '',
      }
      await saApi('PUT', '/mp-config', body)
      alert('✅ Configuración de MercadoPago guardada')
      loadMpConfig()
    }
    catch(e) { alert(e.message) }
    finally { setMpSaving(false) }
  }

  async function testMp() {
    setMpTesting(true); setMpTestResult(null)
    try { const r = await saApi('POST', '/mp-test'); setMpTestResult({ ok: true, msg: r.message }) }
    catch(e) { setMpTestResult({ ok: false, msg: e.message }) }
    finally { setMpTesting(false) }
  }

  async function saveBillingConfig() {
    setBillingSaving(true)
    try { await saApi('PUT', '/billing/config', billingConfig); alert('✅ Políticas de billing guardadas') }
    catch(e) { alert(e.message) }
    finally { setBillingSaving(false) }
  }

  async function registrarPagoManual() {
    if (!manualPagoForm.monto || parseFloat(manualPagoForm.monto) <= 0) { alert('Monto requerido'); return }
    setManualPagoSaving(true)
    try {
      const r = await saApi('POST', '/empresas/' + empresaDetail.codigo + '/pagos/manual', manualPagoForm)
      alert('✅ ' + (r.mensaje || 'Pago registrado'))
      setManualPagoModal(false)
      const [pagos, venc] = await Promise.all([
        saApi('GET', '/empresas/' + empresaDetail.codigo + '/pagos'),
        saApi('GET', '/empresas/' + empresaDetail.codigo + '/vencimientos'),
      ])
      setDetailPagos(pagos); setDetailVencimientos(venc)
      loadEmpresas(); loadDash()
    } catch(e) { alert(e.message) }
    finally { setManualPagoSaving(false) }
  }

  async function reenviarComprobante(pagoId) {
    try { await saApi('POST', '/saas-pagos/' + pagoId + '/comprobante'); alert('✅ Comprobante regenerado') }
    catch(e) { alert(e.message) }
  }

  async function exportPagosCSV() {
    const qs = pagosMes ? '?mes=' + pagosMes : ''
    try {
      const res = await fetch(API + '/saas-pagos/export' + qs, { credentials: 'include' })
      if (!res.ok) throw new Error('Error al exportar')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'saas-pagos' + (pagosMes ? '-' + pagosMes : '') + '.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch(e) { alert(e.message) }
  }
  async function loadAtributos() { try { const r = await saApi('GET', '/rubros-atributos'); setAtributos(r) } catch {} }
  async function loadMantenimiento() { try { const r = await saApi('GET', '/mantenimiento'); setMtItems(r) } catch {} }

  async function toggleTesEmpresa(e) {
    let extra = []; try { extra = JSON.parse(e.modulos_extra || '[]') || [] } catch {}
    let bloq = []; try { bloq = JSON.parse(e.modulos_bloqueados || '[]') || [] } catch {}
    const plan = planes.find((p) => p.id === e.plan_id) || {}
    let planMods = plan.modulos || []; if (typeof planMods === 'string') try { planMods = JSON.parse(planMods) || [] } catch { planMods = [] }
    const enPlan = planMods.includes('tesoreria')
    const habilitada = !bloq.includes('tesoreria') && (enPlan || extra.includes('tesoreria'))
    if (habilitada) {
      extra = extra.filter((m) => m !== 'tesoreria')
      if (!bloq.includes('tesoreria')) bloq.push('tesoreria')
    } else {
      bloq = bloq.filter((m) => m !== 'tesoreria')
      if (!enPlan && !extra.includes('tesoreria')) extra.push('tesoreria')
    }
    setTesSaving(e.id)
    try {
      await saApi('POST', '/empresas/' + e.id + '/modulos', { modulos_extra: extra, modulos_bloqueados: bloq })
      loadEmpresas()
    } catch (err) { alert(err.message) }
    finally { setTesSaving('') }
  }

  async function saveMt() {
    if (!mtForm.nombre.trim()) { alert('Nombre requerido'); return }
    setMtSaving(true)
    try {
      const body = { ...mtForm, estado: 'activo' }
      if (mtModal === 'new') { await saApi('POST', '/mantenimiento', body); alert('✅ Item creado') }
      else { await saApi('PUT', '/mantenimiento/' + mtModal.id, body); alert('✅ Item actualizado') }
      setMtModal(null); loadMantenimiento()
    } catch(e) { alert(e.message) }
    finally { setMtSaving(false) }
  }

  function openNewMt() { setMtForm({ tipo:'dominio', nombre:'', descripcion:'', fecha_vencimiento:'', proveedor:'', url:'', notas:'' }); setMtModal('new') }
  function openEditMt(m) { setMtForm({ tipo:m.tipo, nombre:m.nombre, descripcion:m.descripcion||'', fecha_vencimiento:m.fecha_vencimiento||'', proveedor:m.proveedor||'', url:m.url||'', notas:m.notas||'' }); setMtModal(m) }
  async function deleteMt(id) { if (!confirm('Eliminar item de mantenimiento?')) return; try { await saApi('DELETE', '/mantenimiento/' + id); loadMantenimiento() } catch(e) { alert(e.message) } }

  async function deleteEmpresa() {
    if (!deleteModal) return
    setDeleteSaving(true)
    try {
      const params = new URLSearchParams()
      if (deleteBackup) params.set('hacer_backup', 'true')
      if (deleteEmail) params.set('enviar_email', 'true')
      const qs = params.toString() ? '?' + params.toString() : ''
      const r = await saApi('DELETE', '/empresas/' + deleteModal.id + qs)

      // Download backup if requested
      if (r.backup) {
        const res = await fetch(API + '/empresas/backup-download/' + r.backup, { credentials: 'include' })
        if (res.ok) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = r.backup; a.click()
          URL.revokeObjectURL(url)
        }
      }
      alert('Empresa eliminada: ' + (deleteModal.nombre || deleteModal.codigo))
      setDeleteModal(null); loadEmpresas()
    } catch(e) { alert(e.message) }
    finally { setDeleteSaving(false) }
  }

  async function loadApps() { try { const r = await saApi('GET', '/apps'); setAppsData(r) } catch {} }
  async function loadAppsInstaladas() { try { const r = await saApi('GET', '/apps/instaladas'); setAppsInstaladas(r) } catch {} }
  async function loadAppsStats() { try { const r = await saApi('GET', '/apps/stats'); setAppsStats(r) } catch {} }

  async function saveEmailConfig() {
    setEmailSaving(true)
    try { await saApi('PUT', '/email-config', emailConfig); alert('✅ Configuración guardada') }
    catch(e) { alert(e.message) }
    finally { setEmailSaving(false) }
  }

  async function testEmail() {
    if (!emailConfig.smtp_host || !emailConfig.smtp_user) { alert('Completá Host y Usuario para probar'); return }
    setEmailTesting(true); setEmailTestResult(null)
    try {
      const r = await saApi('POST', '/email-test', {
        host: emailConfig.smtp_host,
        port: emailConfig.smtp_port,
        user: emailConfig.smtp_user,
        pass: emailConfig.smtp_pass,
        from: emailConfig.smtp_from,
      })
      setEmailTestResult({ ok: true, msg: r.message || 'Mail enviado' })
    } catch(e) { setEmailTestResult({ ok: false, msg: e.message }) }
    finally { setEmailTesting(false) }
  }

  async function saveAtributo() {
    if (!atributoForm.rubro || !atributoForm.atributo_key || !atributoForm.atributo_label) { alert('Rubro, Key y Label requeridos'); return }
    setAtributoSaving(true)
    try {
      const body = { ...atributoForm, opciones: atributoForm.opciones ? atributoForm.opciones.split(',').map(s => s.trim()).filter(Boolean) : [], orden: parseInt(atributoForm.orden) || 0 }
      if (atributoModal === 'new') { await saApi('POST', '/rubros-atributos', body); alert('✅ Atributo creado') }
      else { await saApi('PUT', '/rubros-atributos/' + atributoModal.id, body); alert('✅ Atributo actualizado') }
      setAtributoModal(null); loadAtributos()
    } catch(e) { alert(e.message) }
    finally { setAtributoSaving(false) }
  }

  function openNewAtributo() {
    setAtributoForm({ rubro: atributoFiltroRubro || 'general', atributo_key:'', atributo_label:'', tipo:'text', opciones:'', orden:'0' })
    setAtributoModal('new')
  }

  function openEditAtributo(a) {
    setAtributoForm({ rubro: a.rubro, atributo_key: a.atributo_key, atributo_label: a.atributo_label, tipo: a.tipo || 'text', opciones: Array.isArray(a.opciones) ? a.opciones.join(', ') : '', orden: String(a.orden || 0) })
    setAtributoModal(a)
  }
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
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return
      try {
        const r = await fetch(API + '/empresas/' + codigo + '/import', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
        })
        const d = await r.json().catch(() => null)
        if (!r.ok) throw new Error((d && d.error) || 'Error')
        alert('✅ Base de datos importada')
      } catch (e) { alert(e.message) }
    }
    input.click()
  }

  // ── App CRUD ──
  function openNewApp() {
    setAppForm({ slug:'', nombre:'', version:'1.0.0', descripcion:'', descripcion_larga:'', categoria:'general', icono:'📦', precio_mensual:'0', precio_anual:'0', trial_dias:'0', modulos_requeridos:'', roles_permitidos:'', tags:'', activa:true })
    setAppModal('new')
  }

  function openEditApp(a) {
    setAppForm({
      slug: a.slug, nombre: a.nombre || '', version: a.version || '1.0.0',
      descripcion: a.descripcion || '', descripcion_larga: a.descripcion_larga || '',
      categoria: a.categoria || 'general', icono: a.icono || '📦',
      precio_mensual: String(a.precio_mensual || 0), precio_anual: String(a.precio_anual || 0),
      trial_dias: String(a.trial_dias || 0),
      modulos_requeridos: Array.isArray(a.modulos_requeridos) ? a.modulos_requeridos.join(', ') : '',
      roles_permitidos: Array.isArray(a.roles_permitidos) ? a.roles_permitidos.join(', ') : '',
      tags: Array.isArray(a.tags) ? a.tags.join(', ') : '',
      activa: a.activa !== false,
    })
    setAppModal(a)
  }

  async function saveApp() {
    if (!appForm.slug.trim() || !appForm.nombre.trim()) { alert('Slug y Nombre requeridos'); return }
    setAppSaving(true)
    try {
      const body = {
        slug: appForm.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''),
        nombre: appForm.nombre.trim(),
        version: appForm.version.trim(),
        descripcion: appForm.descripcion,
        descripcion_larga: appForm.descripcion_larga,
        categoria: appForm.categoria,
        icono: appForm.icono,
        precio_mensual: parseFloat(appForm.precio_mensual) || 0,
        precio_anual: parseFloat(appForm.precio_anual) || 0,
        trial_dias: parseInt(appForm.trial_dias) || 0,
        periodicidad: parseFloat(appForm.precio_mensual) > 0 ? 'mensual' : 'unico',
        modulos_requeridos: appForm.modulos_requeridos.split(',').map(s => s.trim()).filter(Boolean),
        roles_permitidos: appForm.roles_permitidos.split(',').map(s => s.trim()).filter(Boolean),
        tags: appForm.tags.split(',').map(s => s.trim()).filter(Boolean),
        activa: appForm.activa,
      }
      await saApi('POST', '/apps', body)
      alert('✅ App guardada')
      setAppModal(null); loadApps()
    } catch(e) { alert(e.message) }
    finally { setAppSaving(false) }
  }

  async function openEmpresaDetail(e) {
    setEmpresaDetail(e)
    setEmpresaDetailTab('info')
    setDetailAuditSearch('')
    setDetailPagos([])
    setDetailVencimientos(null)
    setNotaForm({ texto: '' })
    setDetailLoading(true)
    try {
      const [info, audit, apps, notas, pagos, vencimientos] = await Promise.all([
        saApi('GET', '/empresas/' + e.codigo),
        saApi('GET', '/audit?empresa_id=' + e.id),
        saApi('GET', '/apps/instaladas?empresa_id=' + e.id),
        saApi('GET', '/empresas/' + e.id + '/notas'),
        saApi('GET', '/empresas/' + e.codigo + '/pagos').catch(() => []),
        saApi('GET', '/empresas/' + e.codigo + '/vencimientos').catch(() => null),
      ])
      setEmpresaDetail({ ...e, ...info })
      setDetailAudit(audit)
      setDetailApps(apps)
      setDetailNotas(notas)
      setDetailPagos(Array.isArray(pagos) ? pagos : [])
      setDetailVencimientos(vencimientos)
    } catch (err) { alert('Error al cargar detalle: ' + err.message) }
    finally { setDetailLoading(false) }
  }

  async function agregarNota() {
    if (!notaForm.texto.trim()) return
    setNotaSaving(true)
    try {
      await saApi('POST', '/empresas/' + empresaDetail.id + '/notas', { texto: notaForm.texto.trim() })
      setNotaForm({ texto: '' })
      const notas = await saApi('GET', '/empresas/' + empresaDetail.id + '/notas')
      setDetailNotas(notas)
    } catch (e) { alert(e.message) }
    finally { setNotaSaving(false) }
  }

  async function toggleDetailApp(app) {
    try {
      await saApi('PUT', '/apps/instaladas/' + app.id + '/status', { activa: app.activa ? 0 : 1 })
      const apps = await saApi('GET', '/apps/instaladas?empresa_id=' + empresaDetail.id)
      setDetailApps(apps)
    } catch (e) { alert(e.message) }
  }

  async function instalarAppEnEmpresa(appSlug, empresaId) {
    try {
      await saApi('POST', '/apps/instalar', { app_slug: appSlug, empresa_id: empresaId })
      alert('✅ App instalada')
      loadAppsInstaladas(); loadAppsStats()
    } catch(e) { alert(e.message) }
  }

  async function desinstalarApp(instId) {
    if (!confirm('¿Desinstalar esta app de la empresa?')) return
    try { await saApi('DELETE', '/apps/instaladas/' + instId); loadAppsInstaladas(); loadAppsStats() }
    catch(e) { alert(e.message) }
  }

  async function toggleAppInstStatus(instId, activa) {
    try { await saApi('PUT', '/apps/instaladas/' + instId + '/status', { activa: !activa }); loadAppsInstaladas() }
    catch(e) { alert(e.message) }
  }

  // Filter apps and installations
  const appsFiltradas = appsData.filter(a => !appsFiltroCat || a.categoria === appsFiltroCat)
  const appsInstFiltradas = appsFiltroEmp
    ? appsInstaladas.filter(i => i.empresa_id === appsFiltroEmp || i.empresa_codigo === appsFiltroEmp)
    : appsInstaladas

  const APP_CATS = ['general','finanzas','ventas','reportes','logistica','rrhh','integracion','automatizacion','industria']
  const CAT_LABELS = { general:'General', finanzas:'💰 Finanzas', ventas:'🚀 Ventas', reportes:'📊 Reportes', logistica:'📦 Logística', rrhh:'👥 RRHH', integracion:'🔌 Integraciones', automatizacion:'🤖 Automatización', industria:'🏭 Industria' }

  async function loadLegalEstado() {
    try { const r = await saApi('GET', '/legal/estado'); setLegalEmpresas(r.empresas || []); } catch(e) {}
  }
  async function cargarLegalAuditoria() {
    try { const r = await saApi('GET', '/legal/auditoria'); setLegalAuditData(r); } catch(e) {}
  }
  async function subirVersionLegal() {
    const tipoEl = document.getElementById('legal-tipo'); const versionEl = document.getElementById('legal-version');
    const tipo = tipoEl ? tipoEl.value : 'terminos'; const version = versionEl ? versionEl.value.trim() : '';
    if (!version) { setLegalMsg('Ingresá una versión'); setLegalMsgErr(true); return }
    setLegalMsgErr(false); setLegalMsg('');
    try {
      await saApi('POST', '/legal/subir', { tipo, version, contenido: 'v' + version + ' — ' + new Date().toLocaleDateString('es-AR') });
      setLegalMsg('Versión ' + version + ' de ' + tipo + ' publicada como vigente.');
      if (versionEl) versionEl.value = ''; loadLegalEstado();
    } catch(e) { setLegalMsg(e.message); setLegalMsgErr(true); }
  }
  useEffect(() => { if (tab === 'legal' && !legalEmpresas) loadLegalEstado(); }, [tab, legalEmpresas]);

  async function enviarNotificacion() {
    if (!notifForm.titulo.trim()) { setNotifMsg('Título requerido'); return }
    setNotifEnviando(true); setNotifMsg('');
    try {
      const body = {
        empresa_codigo: notifForm.empresa || '*',
        tipo: notifForm.tipo,
        titulo: notifForm.titulo.trim(),
        mensaje: notifForm.mensaje.trim(),
      };
      const r = await saApi('POST', '/notificaciones', body);
      setNotifMsg(`Enviado a ${r.enviadas} empresa(s).`);
      setNotifForm({ empresa: '', tipo: 'manual', titulo: '', mensaje: '' });
    } catch(e) { setNotifMsg(e.message); }
    finally { setNotifEnviando(false); }
  }
  async function loadNotifHistorial() {
    try { const r = await saApi('GET', '/notificaciones'); setNotifHistorial(r.notificaciones || []); } catch(e) {}
  }
  useEffect(() => { if (tab === 'notificaciones' && !notifHistorial) loadNotifHistorial(); }, [tab, notifHistorial]);

  useEffect(() => { if (logged && tab === 'seguridad') saSecLoad(); }, [tab, logged]);

  async function savePlan() {
    if (!planForm.codigo.trim() || !planForm.nombre.trim()) { alert('Código y nombre requeridos'); return }
    setPlanSaving(true)
    try {
      const body = { codigo: planForm.codigo.trim().toLowerCase(), nombre: planForm.nombre, descripcion: planForm.descripcion || '', precio: parseFloat(planForm.precio) || 0, modulos: planForm.modulos || [], limites: { usuarios_max: parseInt(planForm.umax) || 0, sucursales_max: parseInt(planForm.smax) || 0 }, orden: parseInt(planForm.orden) || 99, activo: true }
      let savedId = null
      if (planModal === 'new') { const r = await saApi('POST', '/planes', body); savedId = r.id; alert('✅ Plan creado') }
      else { await saApi('PUT', '/planes/' + planModal.id, body); savedId = planModal.id; alert('✅ Plan actualizado') }
      setPlanModal(null);
      await loadPlanes();
      if (savedId) { setPlanHighlight(savedId); setTimeout(() => { const el=document.getElementById('plan-'+savedId); if(el) el.scrollIntoView({behavior:'smooth', block:'center'}) }, 300) }
    } catch (e) { alert(e.message) }
    finally { setPlanSaving(false) }
  }

  function openNuevoPlan() { setPlanForm({ codigo: '', nombre: '', descripcion: '', precio: '', modulos: [], umax: '', smax: '', orden: '99' }); setPlanModal('new') }
  function openEditPlan(p) {
    let mods = p.modulos || []; if (typeof mods === 'string') try { mods = JSON.parse(mods) } catch { mods = [] }
    let lims = p.limites || {}; if (typeof lims === 'string') try { lims = JSON.parse(lims) } catch { lims = {} }
    const umax = lims.usuarios_max ?? lims.usuarios ?? '';
    const smax = lims.sucursales_max ?? lims.sucursales ?? '';
    setPlanForm({ codigo: p.codigo, nombre: p.nombre || '', descripcion: p.descripcion || '', precio: String(p.precio || ''), modulos: mods, umax: String(umax), smax: String(smax), orden: String(p.orden ?? 99) })
    setPlanModal(p)
  }
  function togglePlanMod(m) { setPlanForm(p => ({ ...p, modulos: p.modulos.includes(m) ? p.modulos.filter(x => x !== m) : [...p.modulos, m] })) }

  async function reactivarPlan(p) {
    if (!confirm(`¿Reactivar plan "${p.nombre}"?`)) return
    try { await saApi('POST', '/planes/' + p.id + '/reactivar'); alert('✅ Plan reactivado'); await loadPlanes(); setPlanHighlight(p.id) } catch(e){ alert(e.message) }
  }
  async function eliminarPlanDefinitivo(p) {
    if (!confirm(`¿Eliminar DEFINITIVAMENTE el plan "${p.nombre}" (${p.codigo})? Esta acción no se puede deshacer.`)) return
    if (!confirm('Confirmá nuevamente: el plan se borrará para siempre.')) return
    try { await saApi('DELETE', '/planes/' + p.id); alert('✅ Plan eliminado'); await loadPlanes() } catch(e){ alert(e.message) }
  }

  async function aprobarSol(id) { try { await saApi('POST', '/solicitudes-plan/' + id + '/resolver', { accion: 'aprobar' }); loadSolicitudes(); loadEmpresas() } catch (e) { alert(e.message) } }
  async function rechazarSol(id) { try { await saApi('POST', '/solicitudes-plan/' + id + '/resolver', { accion: 'rechazar' }); loadSolicitudes() } catch (e) { alert(e.message) } }

  async function resolverEliminacion(id, accion) {
    if (accion === 'aprobar') {
      if (!window.confirm('¿Estás seguro? Esta acción eliminará permanentemente la empresa y todos sus datos.')) return
      setDelSolSaving(true)
      try {
        await saApi('POST', '/solicitudes-eliminacion/' + id + '/resolver', { accion, hacer_backup: delSolBackup, enviar_email: delSolEmail })
        setDelSolModal(null)
        loadSolicitudesEliminacion(); loadEmpresas()
        alert('✅ Solicitud de eliminación procesada')
      } catch (e) { alert(e.message) }
      finally { setDelSolSaving(false) }
    } else {
      if (!window.confirm('¿Rechazar esta solicitud de eliminación? Se notificará al usuario.')) return
      try {
        await saApi('POST', '/solicitudes-eliminacion/' + id + '/resolver', { accion: 'rechazar' })
        loadSolicitudesEliminacion()
        alert('✅ Solicitud rechazada. El usuario será notificado.')
      } catch (e) { alert(e.message) }
    }
  }

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

  function exportLeadsCSV() {
    const headers = ['Fecha','Nombre','Teléfono','Email','Empresa','Mensaje','Página','Fuente'];
    const rows = leads.map(l => {
      const fuente = l.utm_source || l.ref || l.pagina || '';
      return [l.fecha||'', l.nombre||'', l.telefono||'', l.email||'', l.empresa_interes||'', (l.mensaje||'').replace(/"/g,'""'), l.pagina||'', fuente].map(v => `"${v}"`).join(',');
    });
    const BOM = '\uFEFF';
    const csv = BOM + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'leads-landing.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  if (!logged) return (
    <div style={{ maxWidth: 'min(400px, 92vw)', margin: '80px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>🔐</div>
      <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Super Admin</h2>
      <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 24 }}>FlexCRM — Panel de control</p>

      {sa2faStep && (
        <div className="card" style={{ textAlign: 'left' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Verificación en dos pasos</h3>
          <p style={{ color: 'var(--mu)', fontSize: 12, marginBottom: 16 }}>Ingresá el código de tu app de autenticación.</p>
          <div style={{ marginBottom: 12 }}>
            <input value={sa2faCode} onChange={e => setSa2faCode(e.target.value)} placeholder="000000" maxLength={6} inputMode="numeric"
              style={{ width: '100%', textAlign: 'center', fontSize: 24, letterSpacing: 8, fontFamily: 'monospace' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={saConfiar} onChange={e => setSaConfiar(e.target.checked)} />
            Confiar en este dispositivo (no pedir 2FA por 90 días)
          </label>
          {loginErr && <div style={{ color: 'var(--bad)', fontSize: 12, marginBottom: 12 }}>{loginErr}</div>}
          <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 10 }}
            onClick={saVerify2fa} disabled={loginLoading || sa2faCode.length < 6}>
            {loginLoading ? '⏳' : '→ Verificar'}
          </button>
          <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }}
            onClick={() => { setSa2faStep(null); setSa2faCode(''); setLoginErr('') }}>← Cancelar</button>
        </div>
      )}

      {sa2faSetup && (
        <div className="card" style={{ textAlign: 'left' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Configurar autenticación en dos pasos</h3>
          <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>
            El superadmin debe tener 2FA activado. Usá Google Authenticator, Authy o Microsoft Authenticator.
          </div>
          {sa2faQr && (
            <div style={{ marginBottom: 12, textAlign: 'center', background: '#fff', borderRadius: 8, padding: 12 }}>
              <p style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 8 }}>Escaneá este código QR:</p>
              <div style={{ display: 'inline-block', background: '#fff', padding: 12, borderRadius: 12 }}>
                <SaQR otpauth={sa2faQr} />
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', marginTop: 8, color: 'var(--mu)' }}>
                Clave: {sa2faSecret}
              </div>
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <input value={sa2faCode} onChange={e => setSa2faCode(e.target.value)} placeholder="Código de 6 dígitos" maxLength={6} inputMode="numeric"
              style={{ width: '100%', textAlign: 'center', fontSize: 22, letterSpacing: 6, fontFamily: 'monospace' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={saConfiar} onChange={e => setSaConfiar(e.target.checked)} />
            Confiar en este dispositivo
          </label>
          {loginErr && <div style={{ color: 'var(--bad)', fontSize: 12, marginBottom: 12 }}>{loginErr}</div>}
          <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 10 }}
            onClick={saConfirmSetup} disabled={loginLoading || !sa2faQr || sa2faCode.length < 6}>
            {loginLoading ? '⏳' : '→ Activar 2FA y entrar'}
          </button>
          <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }}
            onClick={() => { setSa2faSetup(null); setSa2faQr(null); setLoginErr('') }}>← Volver</button>
        </div>
      )}

      {!sa2faStep && !sa2faSetup && (<>
        {saReset ? (
        <div className="card" style={{ textAlign: 'left' }}>
          {resetDone ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <p style={{ fontWeight: 700, color: 'var(--ok)', marginBottom: 8 }}>Contraseña restablecida</p>
              <p style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>Ya podés iniciar sesión con tu nueva contraseña.</p>
              <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => { setSaReset(false); setResetDone(false); setResetToken('') }}>Ir al inicio de sesión</button>
            </div>
          ) : (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Nueva contraseña</h3>
              {resetErr && <div style={{ color: 'var(--bad)', fontSize: 12, marginBottom: 12 }}>{resetErr}</div>}
              <div style={{ marginBottom: 10 }}><label style={{ fontSize: 11, fontWeight: 600, color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Nueva contraseña</label><input type="password" value={resetForm.password} onChange={e => setResetForm(p => ({ ...p, password: e.target.value }))} placeholder="Mín. 8 caracteres, mayúscula, número, símbolo" style={{ width: '100%' }} /></div>
              <div style={{ marginBottom: 16 }}><label style={{ fontSize: 11, fontWeight: 600, color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Repetir contraseña</label><input type="password" value={resetForm.repetir} onChange={e => setResetForm(p => ({ ...p, repetir: e.target.value }))} onKeyDown={e => e.key === 'Enter' && saResetPassword()} style={{ width: '100%' }} /></div>
              <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 10 }} onClick={saResetPassword} disabled={resetLoading}>{resetLoading ? '⏳' : '💾 Guardar nueva contraseña'}</button>
              <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => { setSaReset(false); setResetErr('') }}>← Volver</button>
            </>
          )}
        </div>
      ) : saForgot ? (
        <div className="card" style={{ textAlign: 'left' }}>
          {forgotSent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
              <p style={{ fontWeight: 700, color: 'var(--ok)', marginBottom: 8 }}>Email enviado</p>
              <p style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>Si tu email está registrado, recibirás un enlace para restablecer tu contraseña. Revisá tu bandeja de entrada.</p>
              <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => { setSaForgot(false); setForgotSent(false); setForgotEmail('') }}>← Volver al login</button>
            </div>
          ) : (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Olvidé mi contraseña</h3>
              <p style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>Ingresá tu email o nombre de usuario. Te enviaremos un enlace para restablecer tu contraseña.</p>
              {forgotErr && <div style={{ color: 'var(--bad)', fontSize: 12, marginBottom: 12 }}>{forgotErr}</div>}
              <div style={{ marginBottom: 16 }}><label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Email o usuario</label><input value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} type="text" placeholder="superadmin" onKeyDown={e => e.key === 'Enter' && saForgotPassword()} style={{ width: '100%' }} /></div>
              <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 10 }} onClick={saForgotPassword} disabled={forgotLoading}>{forgotLoading ? '⏳' : '📧 Enviar enlace'}</button>
              <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => { setSaForgot(false); setForgotErr('') }}>← Volver al login</button>
            </>
          )}
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'left' }}>
          <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Usuario</label><input value={loginForm.usuario} onChange={e => setLoginForm(p => ({ ...p, usuario: e.target.value }))} placeholder="superadmin" style={{ width: '100%' }} /></div>
          <div style={{ marginBottom: 8 }}><label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Contraseña</label><input type="password" value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} onKeyDown={e => e.key === 'Enter' && saLogin()} style={{ width: '100%' }} /></div>
          <div style={{ textAlign: 'right', marginBottom: 16 }}><a href="#" onClick={e => { e.preventDefault(); setSaForgot(true); setForgotEmail('') }} style={{ fontSize: 11, color: 'var(--ac)', textDecoration: 'none' }}>¿Olvidaste tu contraseña?</a></div>
          {loginErr && <div style={{ color: 'var(--bad)', fontSize: 12, marginBottom: 12 }}>{loginErr}</div>}
          <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 10 }} onClick={saLogin} disabled={loginLoading}>{loginLoading ? '⏳' : '→ Ingresar'}</button>
        </div>
      )}</>)}
      <a href="/" style={{ color: 'var(--mu)', fontSize: 12, marginTop: 12, display: 'inline-block' }}>← Volver al CRM</a>
    </div>
  )

  return (
    <div className="sa-layout" style={{ flexDirection: 'column' }}>
      {impersonating && (
        <div style={{ background: 'var(--warn)', color: '#0f172a', padding: '8px 24px', fontSize: 12, fontWeight: 700, textAlign: 'center', flexShrink: 0 }}>
          ⚠️ Estás viendo el sistema como empresa: <strong>{impersonating.empresa}</strong> — <a href="#" onClick={e => { e.preventDefault(); openCRM() }} style={{ color: '#0f172a', textDecoration: 'underline' }}>Abrir CRM →</a>
        </div>
      )}

      {/* Top bar */}
      <div className="topbar sa-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)} className="sa-hamburger" aria-label="Abrir menú">☰</button>
          <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>🏢 FlexCRM <span className="badge badge-orange" style={{ fontSize: 10 }}>Super Admin</span></div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn btn-sm btn-secondary" onClick={async () => {
            try {
              const response = await fetch(API + '/backup/download', { method: 'POST', credentials: 'include' });
              if (!response.ok) throw new Error('Error');
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'flexcrm-full-' + new Date().toISOString().substr(0,10) + '.zip'; a.click();
              URL.revokeObjectURL(url);
            } catch(e) { alert('Error al descargar backup'); }
          }} title="Descargar backup completo (todas las DBs)">💾 Backup</button>
          <span style={{ fontSize: 12, color: 'var(--mu)' }}>{user?.nombre || ''}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPassModal(true)}>🔒</button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={saLogout}>Salir</button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        {sidebarOpen && window.innerWidth <= 1023 && <div className="sa-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        <div className={`sa-sidebar${sidebarOpen ? ' open' : ''}`}>
          {SIDEBAR.map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setTab(k); if (window.innerWidth <= 1023) setSidebarOpen(false) }}
              className={`sa-nav-item${tab === k ? ' active' : ''}`}
              style={{ marginBottom: k === 'dashboard' ? 12 : 0, marginTop: k === 'soporte' ? 'auto' : 0 }}
              title={!sidebarOpen ? l : undefined}
            >
              <span className="sa-nav-icon">{l.split(' ')[0]}</span>
              <span className="sa-nav-label">{l.split(' ').slice(1).join(' ')}</span>
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
        <div className="sa-main" style={{ overflow: 'auto' }}>
          <div className="sa-content">
          {/* ═══════ DASHBOARD ═══════ */}
          {tab === 'dashboard' && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 16 }}>📊 Dashboard</h3>
              {dash && <>
                <div className="sa-kpi-grid" style={{ marginBottom: 20 }}>
                  <div className="kpi-card"><K label="Empresas activas" value={dash.empresas_activas} sub={(dash.nuevas_mes || 0) + ' nuevas este mes'} /></div>
                  <div className="kpi-card"><K label="MRR" value={'$' + (dash.mrr || 0).toLocaleString('es-AR')} sub="ingresos mensuales" /></div>
                  <div className="kpi-card"><K label="Vencen en 7 días" value={dash.vencer_7} sub={(dash.vencer_30 || 0) + ' en 30 días'} /></div>
                  <div className="kpi-card"><K label="Vencidas" value={dash.vencidas} sub="requieren renovación" /></div>
                  <div className="kpi-card"><K label="Solicitudes plan" value={dash.solicitudes_pendientes} sub="pendientes de aprobar" /></div>
                  <div className="kpi-card"><K label="Usuarios totales" value={dash.total_usuarios} /></div>
                  <div className="kpi-card" style={{ borderLeft: '3px solid var(--ok)' }}><K label="Ventas totales" value={'$' + Math.round(dash.total_ventas_monto || 0).toLocaleString('es-AR')} sub={(dash.total_ventas || 0) + ' transacciones'} /></div>
                  <div className="kpi-card" style={{ borderLeft: '3px solid var(--ac2)' }}><K label="Ticket promedio" value={'$' + (dash.ticket_promedio || 0).toLocaleString('es-AR')} sub={dash.total_clientes + ' clientes'} /></div>
                  <div className="kpi-card" style={{ borderLeft: '3px solid var(--ac)' }}><K label="Ventas este mes" value={'$' + Math.round(dash.ventas_monto_mes || 0).toLocaleString('es-AR')} sub={(dash.ventas_mes || 0) + ' ventas — ticket $' + (dash.ticket_promedio_mes || 0).toLocaleString('es-AR')} /></div>
                  <div className="kpi-card" style={{ borderLeft: '3px solid var(--warn)' }}><K label="Prospectos" value={prospectos.length} sub="CRM leads" /></div>
                  <div className="kpi-card" style={{ borderLeft: '3px solid var(--ac2)' }}><K label="Landing leads" value={leads.length} sub={leads.filter(l => !l.leido).length + ' sin leer'} /></div>
                  {dash?.vencimientos_prox > 0 && (
                    <div className="kpi-card" style={{ borderLeft: '3px solid var(--bad)' }}><K label="Vencimientos" value={dash.vencimientos_prox} sub="en 30 días — ver Mantenimiento" /></div>
                  )}
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
                  <thead><tr><th>Empresa</th><th>Código</th><th>Plan</th><th>Vencimiento</th><th>Usuarios</th><th>Suc.</th><th>Mail</th><th>Estado</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {empresas.map(e => {
                      const plan = planes.find(p => p.id === e.plan_id)
                      return <tr key={e.codigo}>
                        <td style={{ fontWeight: 600 }} data-label="Empresa">{e.nombre || e.codigo}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--mu)' }} data-label="Código">{e.codigo}</td>
                        <td data-label="Plan">{plan?.nombre || '—'}</td>
                        <td style={{ color: e.vencimiento && e.vencimiento < new Date().toISOString().substr(0, 10) ? 'var(--bad)' : 'var(--tx)' }} data-label="Vencimiento">{e.vencimiento || '—'}</td>
                        <td data-label="Usuarios">{e.usuarios_max || '∞'}</td>
                        <td data-label="Suc.">{e.sucursales_max || '∞'}</td>
                        <td data-label="Mail">{e.email_verificado === 1 || e.email_verificado === true
                          ? <span className="badge badge-green" style={{ fontSize: 11 }}>✅ Verificado</span>
                          : e.email_verificado === 0 || e.email_verificado === false
                            ? <span className="badge badge-red" style={{ fontSize: 11 }}>❌ Pendiente</span>
                            : <span style={{ fontSize: 11, color: 'var(--mu)' }}>—</span>}</td>
                        <td data-label="Estado"><span className={`badge ${e.activo ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 11 }}>{e.activo ? 'Activo' : 'Suspendido'}</span></td>
                        <td style={{ whiteSpace: 'nowrap' }} data-label="Acciones">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEmpresaDetail(e)} title="Ver detalle completo">👁️</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditEmpresa(e)} title="Editar empresa">✏️</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => loginAs(e)} title="Ingresar como admin">🔑</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleEmpresaActiva(e)} title={e.activo ? 'Suspender empresa' : 'Activar empresa'}>{e.activo ? '🚫' : '✅'}</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => backupEmpresa(e.codigo)} title="Descargar backup">💾</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => importBackup(e.codigo)} title="Importar backup">📥</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setDeleteModal(e); setDeleteBackup(true); setDeleteEmail(false) }} title="Eliminar empresa" style={{ color: 'var(--bad)' }}>🗑️</button>
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
                        <td style={{ fontWeight: 600 }} data-label="Nombre">{p.nombre}</td>
                        <td style={{ fontSize: 12 }} data-label="Teléfono">{p.telefono || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--ac)' }} data-label="Email">{p.email || '—'}</td>
                        <td style={{ fontSize: 12 }} data-label="Empresa">{p.empresa_interes || '—'}</td>
                        <td data-label="Estado"><span style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600,background:PROS_EST_COLORS[p.estado]+'22',color:PROS_EST_COLORS[p.estado]}}><span style={{ width: 6, height: 6, borderRadius: '50%', background: PROS_EST_COLORS[p.estado] || 'var(--mu)' }} />{PROS_EST_LABELS[p.estado] || p.estado}</span></td>
                        <td style={{ fontSize: 11, color: 'var(--mu)' }} data-label="Origen">{p.origen || 'manual'}</td>
                        <td style={{ fontSize: 11, color: 'var(--mu)' }} data-label="Último contacto">{p.fecha_ultimo_contacto ? new Date(p.fecha_ultimo_contacto).toLocaleDateString('es-AR') : '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }} data-label="Acciones">
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
              <div className="grid-2" style={{ gap: 12, marginBottom: 20, fontSize: 13 }}>
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
                          <td data-label="Fecha">{s.fecha ? new Date(s.fecha).toLocaleDateString('es-AR') : '—'}</td>
                          <td data-label="Empresa">{s.empresa_id || '—'}</td>
                          <td data-label="Tipo"><span className={`badge ${s.tipo === 'upgrade' ? 'badge-green' : 'badge-yellow'}`}>{s.tipo === 'upgrade' ? '⬆ Upgrade' : '⬇ Downgrade'}</span></td>
                          <td data-label="Plan">{s.plan_id || '—'}</td>
                          <td data-label="Estado"><span className={`badge ${s.estado === 'pendiente' ? 'badge-yellow' : s.estado === 'aprobada' ? 'badge-green' : 'badge-red'}`}>{s.estado}</span></td>
                          <td data-label="Acciones">{s.estado === 'pendiente' && <><button type="button" className="btn btn-primary btn-sm" onClick={() => aprobarSol(s.id)} style={{background:'var(--ok)',marginRight:4}}>✅ Aprobar</button><button type="button" className="btn btn-danger btn-sm" onClick={() => rechazarSol(s.id)}>❌ Rechazar</button></>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══════ ELIMINACIONES ═══════ */}
          {tab === 'eliminaciones' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>🗑️ Solicitudes de eliminación</h3>
                <button type="button" className="btn btn-secondary btn-sm" onClick={loadSolicitudesEliminacion}>↻ Actualizar</button>
              </div>
              {solicitudesElim.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--mu)' }}>✅ Sin solicitudes de eliminación</div> : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr><th>Fecha</th><th>Empresa</th><th>Email</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr></thead>
                    <tbody>
                      {solicitudesElim.map(s => (
                        <tr key={s.id}>
                          <td data-label="Fecha">{s.fecha ? new Date(s.fecha).toLocaleDateString('es-AR') : '—'}</td>
                          <td data-label="Empresa"><strong>{s.empresa_nombre || s.empresa_codigo}</strong><br /><span style={{fontSize:11,color:'var(--mu)',fontFamily:'monospace'}}>{s.empresa_codigo}</span></td>
                          <td data-label="Email">{s.email || '—'}</td>
                          <td style={{fontSize:12,color:'var(--mu)'}} data-label="Motivo">{s.motivo || '—'}</td>
                          <td data-label="Estado"><span className={`badge ${s.estado === 'pendiente' ? 'badge-yellow' : s.estado === 'aprobada' ? 'badge-red' : 'badge-gray'}`}>{s.estado}</span></td>
                          <td data-label="Acciones">
                            {s.estado === 'pendiente' && (
                              <>
                                <button type="button" className="btn btn-danger btn-sm" onClick={() => setDelSolModal(s)}
                                  style={{background:'var(--bad)',color:'#fff',border:'none',marginRight:4}}>🗑️ Aprobar</button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => resolverEliminacion(s.id, 'rechazar')}>❌ Rechazar</button>
                              </>
                            )}
                          </td>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap:'wrap', gap:8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>Planes de suscripción</h3>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer', color:'var(--mu)'}}>
                    <input type="checkbox" checked={planIncluirInactivos} onChange={e => setPlanIncluirInactivos(e.target.checked)} />
                    Mostrar inactivos
                  </label>
                  <button type="button" className="btn btn-primary" onClick={openNuevoPlan}>+ Nuevo plan</button>
                </div>
              </div>
              <div style={{fontSize:11, color:'var(--mu)', marginBottom:12}}>
                Ordena por <strong>orden</strong> (menor primero). Al editar se mantiene la posición; usá “Orden” para reordenar. {planIncluirInactivos ? `Mostrando ${planes.length} planes (incluye inactivos).` : `${planes.length} planes activos.`}
              </div>
              <div className="grid-auto" style={{ gap: 16 }}>
                {planes.map(p => {
                  let mods = p.modulos || []; if (typeof mods === 'string') try { mods = JSON.parse(mods) } catch { mods = [] }
                  let lims = p.limites || {}; if (typeof lims === 'string') try { lims = JSON.parse(lims) } catch { lims = {} }
                  const umax = lims.usuarios_max ?? lims.usuarios
                  const smax = lims.sucursales_max ?? lims.sucursales
                  const isInactive = Number(p.activo) === 0
                  const isHighlight = planHighlight === p.id
                  return <div key={p.id} id={'plan-' + p.id} className="card" style={{ padding: 16, opacity: isInactive ? 0.6 : 1, border: isHighlight ? '2px solid var(--ac)' : undefined, boxShadow: isHighlight ? '0 0 0 3px rgba(249,115,22,.15)' : undefined, transition:'all .3s' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{p.nombre || p.codigo}</div>
                      <div style={{display:'flex', gap:4, alignItems:'center'}}>
                        <span className={`badge ${isInactive ? 'badge-gray' : 'badge-green'}`} style={{fontSize:9}}>{isInactive ? '⚪ Inactivo' : '🟢 Activo'}</span>
                        <span className="badge badge-blue" style={{fontSize:9}}>#{p.orden ?? 99}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--ac)', marginBottom: 8 }}>${p.precio || 0}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--mu)' }}>{p.periodo === 'anual' ? '/año' : '/mes'}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 10 }}>👥 {umax || '∞'} usuarios · 🏪 {smax || '∞'} sucursales · {mods.length} módulos · <span style={{fontFamily:'monospace'}}>{p.codigo}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 12 }}>{p.descripcion || ''}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                      {mods.map(m => <span key={m} className="badge badge-orange" style={{ fontSize: 10 }}>{MOD_LABELS[m] || m}</span>)}
                    </div>
                    <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditPlan(p)}>✏️ Editar</button>
                      {isInactive ? (
                        <>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => reactivarPlan(p)}>♻️ Reactivar</button>
                          <button type="button" className="btn btn-danger btn-sm" style={{background:'var(--bad)', color:'#fff'}} onClick={() => eliminarPlanDefinitivo(p)}>🗑️ Eliminar definitivo</button>
                        </>
                      ) : null}
                    </div>
                  </div>
                })}
              </div>
              {planes.length===0 && <div style={{textAlign:'center', color:'var(--mu)', padding:20}}>Sin planes. Creá uno nuevo.</div>}
            </div>
          )}

          {/* ═══════ MÓDULOS ═══════ */}
          {tab === 'modulos' && (
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 16 }}>🧩 Módulos del sistema</h3>
              <p style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 12 }}>Cada tarjeta muestra los roles que tienen acceso al módulo.</p>
              <div className="grid-auto" style={{ gap: 8 }}>
                {modulos.map(m => {
                  const roles = MOD_ROLES[m.codigo] || []
                  return (
                    <div key={m.id} className="card" style={{ fontSize: 12, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 18 }}>{MOD_LABELS[m.codigo]?.split(' ')[0] || '🧩'}</span>
                        <span style={{ flex: 1, fontWeight: 600 }}>{m.nombre || m.codigo}</span>
                        {m.premium ? <span className="badge badge-yellow" style={{ fontSize: 9 }}>⭐ Premium</span> : null}
                        {m.beta ? <span className="badge badge-green" style={{ fontSize: 9 }}>🧪 Beta</span> : null}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {roles.map(r => (
                          <span key={r} style={{ display:'inline-flex',alignItems:'center',gap:3,padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:600,background:ROLE_COLORS[r]+'20',color:ROLE_COLORS[r] }}>
                            <span style={{ width:5,height:5,borderRadius:'50%',background:ROLE_COLORS[r] }} />
                            {ROLE_LABELS[r] || r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TESORERIA: gestion de acceso por empresa */}
          {tab === 'tesoreria' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>💵 Tesorería — gestión de acceso</h3>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTab('planes')}>✏️ Editar planes</button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>
                Habilitá o deshabilitá el módulo para cada empresa. Para agregarlo o quitarlo de un plan, usá la pestaña <strong>Planes</strong>.
              </p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Empresa</th><th>Plan</th><th>Incluido en el plan</th><th>Estado</th><th style={{ width: 130 }}></th></tr></thead>
                  <tbody>
                    {(empresas || []).filter((e) => Number(e.activo) !== 0).map((e) => {
                      let extra = []; try { extra = JSON.parse(e.modulos_extra || '[]') || [] } catch {}
                      let bloq = []; try { bloq = JSON.parse(e.modulos_bloqueados || '[]') || [] } catch {}
                      const plan = planes.find((p) => p.id === e.plan_id) || {}
                      let planMods = plan.modulos || []; if (typeof planMods === 'string') try { planMods = JSON.parse(planMods) || [] } catch { planMods = [] }
                      const enPlan = planMods.includes('tesoreria')
                      const habilitada = !bloq.includes('tesoreria') && (enPlan || extra.includes('tesoreria'))
                      return (
                        <tr key={e.id || e.codigo}>
                          <td><div style={{ fontWeight: 600 }}>{e.nombre}</div><div style={{ fontSize: 11, color: 'var(--mu)' }}>{e.codigo}</div></td>
                          <td style={{ fontSize: 12 }}>{e.plan_nombre || e.plan_id || '—'}</td>
                          <td>{enPlan ? <span className="badge badge-green">Sí</span> : <span className="badge badge-gray">No</span>}</td>
                          <td>{habilitada ? <span className="badge badge-green">✅ Habilitada</span> : <span className="badge badge-gray">❌ Sin acceso</span>}</td>
                          <td>
                            <button type="button" className={`btn btn-sm ${habilitada ? 'btn-secondary' : 'btn-primary'}`} onClick={() => toggleTesEmpresa(e)} disabled={tesSaving === e.id}>
                              {tesSaving === e.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : habilitada ? 'Deshabilitar' : 'Habilitar'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {(empresas || []).filter((e) => Number(e.activo) !== 0).length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--mu)' }}>Sin empresas</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════ ROLES ═══════ */}
          {tab === 'roles' && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 16 }}>👤 Roles del sistema</h3>
              <p style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 16 }}>
                Cada rol define qué módulos puede ver y usar un usuario dentro de su empresa.
                Los roles se asignan desde Configuración → Usuarios en el CRM de cada empresa.
              </p>
              <div className="grid-auto" style={{ gap: 16 }}>
                {Object.entries(ROLE_LABELS).map(([key, label]) => {
                  const mods = Object.entries(MOD_ROLES).filter(([, roles]) => roles.includes(key)).map(([mod]) => mod)
                  const allMods = Object.keys(MOD_ROLES)
                  const cant = mods.length
                  const total = allMods.length
                  return (
                    <div key={key} className="card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <span style={{ width:28,height:28,borderRadius:'50%',background:ROLE_COLORS[key]+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:ROLE_COLORS[key] }}>
                          {label[0]}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
                          <div style={{ fontSize: 11, color: 'var(--mu)' }}>{cant} de {total} módulos habilitados</div>
                        </div>
                      </div>
                      <div className="grid-auto" style={{ gap: 4 }}>
                        {allMods.map(mod => {
                          const has = mods.includes(mod)
                          return (
                            <div key={mod} style={{ display:'flex',alignItems:'center',gap:6,padding:'4px 8px',borderRadius:6,background:has ? ROLE_COLORS[key]+'10' : 'var(--bg)', fontSize:11 }}>
                              <span style={{ opacity: has ? 1 : .3 }}>{MOD_LABELS[mod]?.split(' ')[0] || '🧩'}</span>
                              <span style={{ flex:1, color: has ? 'var(--tx)' : 'var(--mu)', fontWeight: has ? 600 : 400 }}>{MOD_LABELS[mod]?.split(' ').slice(1).join(' ') || mod}</span>
                              {has ? <span style={{ color:ROLE_COLORS[key],fontSize:12 }}>✓</span> : <span style={{ color:'var(--mu)',fontSize:12,opacity:.4 }}>—</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══════ SEGURIDAD ═══════ */}
          {tab === 'seguridad' && (
            <div style={{ maxWidth: 760 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 16 }}>🔒 Seguridad</h3>

              <div className="card" style={{ marginBottom: 16, maxWidth: 540 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>🔐 Autenticación en dos pasos (2FA)</div>
                {saSecErr && (
                  <div style={{ color: 'var(--bad)', fontSize: 12, marginBottom: 12, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 8, padding: '8px 12px' }}>⚠️ {saSecErr}</div>
                )}
                {saSecBackup && (
                  <div style={{ background: 'var(--sf)', borderRadius: 8, padding: 12, marginBottom: 12, border: '1px solid var(--bd)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mu)', marginBottom: 8 }}>Códigos de respaldo (10) — guardalos en un lugar seguro</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 13, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {saSecBackup.map((c, i) => (
                        <div key={c + i} style={{ background: '#0f172a', color: '#e2e8f0', padding: '4px 8px', borderRadius: 6, textAlign: 'center' }}>
                          {c.match(/.{1,4}/g).join('-')}
                        </div>
                      ))}
                    </div>
                    <button type="button" className="btn btn-sm btn-secondary" style={{ marginTop: 8 }}
                      onClick={() => { navigator.clipboard?.writeText(saSecBackup.join('\n')) }}>📋 Copiar</button>
                  </div>
                )}
                {saSecEnabled === null ? (
                  <div style={{ fontSize: 12, color: 'var(--mu)' }}>Cargando...</div>
                ) : saSecEnabled ? (
                  <div>
                    <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>✅</span>
                      <span style={{ fontWeight: 600, color: 'var(--ok)' }}>2FA está activo</span>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={saSecDisable} disabled={saSecLoading} style={{ color: 'var(--bad)' }}>
                      {saSecLoading ? '⏳' : 'Deshabilitar 2FA'}
                    </button>
                  </div>
                ) : saSecSetup ? (
                  <div>
                    <p style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 12 }}>Escaneá este código QR con tu app de autenticación (Google Authenticator, Authy, etc.)</p>
                    <div style={{ textAlign: 'center', marginBottom: 12 }}>
                      <div style={{ display: 'inline-block', background: '#fff', padding: 10, borderRadius: 12 }}>
                        <SaQR otpauth={saSecSetup.otpauth} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 12 }}>
                      O ingresá esta clave manualmente: <strong style={{ fontFamily: 'monospace' }}>{saSecSetup.secret}</strong>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <input value={saSecCode} onChange={e => setSaSecCode(e.target.value)} placeholder="Código de 6 dígitos" maxLength={6} inputMode="numeric"
                        style={{ width: '100%', textAlign: 'center', fontSize: 20, letterSpacing: 6, fontFamily: 'monospace' }} />
                    </div>
                    <button type="button" className="btn btn-primary" onClick={saSecConfirm} disabled={saSecLoading || saSecCode.length < 6} style={{ width: '100%' }}>
                      {saSecLoading ? '⏳' : 'Verificar y activar'}
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }}
                      onClick={() => { setSaSecSetup(null); setSaSecCode(''); setSaSecErr('') }}>← Cancelar</button>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 12 }}>
                      Al activar 2FA, además de tu contraseña necesitarás un código de 6 dígitos para ingresar al panel.
                    </p>
                    <button type="button" className="btn btn-primary" onClick={saSecStartSetup} disabled={saSecLoading}>
                      {saSecLoading ? '⏳' : 'Configurar 2FA →'}
                    </button>
                  </div>
                )}
              </div>

              <div className="card" style={{ maxWidth: 540 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>💻 Dispositivos confiables</div>
                  {saSecDevices?.length > 0 && (
                    <button type="button" className="btn btn-sm btn-secondary" onClick={saSecRevokeAll} style={{ fontSize: 11 }}>Revocar todos</button>
                  )}
                </div>
                {saSecDevices === null ? (
                  <div style={{ fontSize: 12, color: 'var(--mu)' }}>Cargando...</div>
                ) : saSecDevices.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--mu)' }}>Sin dispositivos confiables registrados.</div>
                ) : saSecDevices.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bd)', fontSize: 12 }}>
                    <div style={{ flex: 1, marginRight: 12 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 11 }}>{d.ip || '—'}</div>
                      <div style={{ color: 'var(--mu)', fontSize: 10 }}>{d.ua || '—'} · {d.ultimo_uso ? 'último uso ' + new Date(d.ultimo_uso).toLocaleString('es-AR') : ''}</div>
                    </div>
                    <button type="button" className="btn btn-sm btn-secondary" style={{ fontSize: 10 }} onClick={() => saSecRevokeDevice(i)}>Revocar</button>
                  </div>
                ))}
                <p style={{ fontSize: 11, color: 'var(--mu)', marginTop: 12 }}>
                  Los dispositivos confiables omiten el 2FA durante 90 días. Al revocarlos, se volverá a pedir el código.
                </p>
              </div>
            </div>
          )}

          {/* ═══════ EMAIL ═══════ */}
          {tab === 'email' && (
            <div className="card" style={{ maxWidth: 600 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 16 }}>📧 Configuración SMTP Global</h3>
              <p style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>
                Este SMTP se usa como respaldo cuando una empresa no tiene su propio email configurado. También para los emails del superadmin (olvidé mi clave).
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="fr">
                  <div style={{ flex: 1 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Servidor SMTP</label><input value={emailConfig.smtp_host} onChange={e => setEmailConfig(p => ({ ...p, smtp_host: e.target.value }))} placeholder="smtp.gmail.com" /></div>
                  <div style={{ width: 100 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Puerto</label><input value={emailConfig.smtp_port} onChange={e => setEmailConfig(p => ({ ...p, smtp_port: e.target.value }))} placeholder="465" /></div>
                </div>
                <div className="fr">
                  <div style={{ flex: 1 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Usuario SMTP</label><input value={emailConfig.smtp_user} onChange={e => setEmailConfig(p => ({ ...p, smtp_user: e.target.value }))} placeholder="tu@email.com" /></div>
                  <div style={{ flex: 1 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Contraseña / App Password</label><input type="password" value={emailConfig.smtp_pass} onChange={e => setEmailConfig(p => ({ ...p, smtp_pass: e.target.value }))} placeholder="••••••••" /></div>
                </div>
                <div className="fr">
                  <div style={{ flex: 1 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Email remitente (FROM)</label><input value={emailConfig.smtp_from} onChange={e => setEmailConfig(p => ({ ...p, smtp_from: e.target.value }))} placeholder="noreply@midominio.com" /></div>
                  <div style={{ flex: 1 }}><label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Nombre remitente</label><input value={emailConfig.smtp_from_name} onChange={e => setEmailConfig(p => ({ ...p, smtp_from_name: e.target.value }))} placeholder="FlexCRM" /></div>
                </div>
                {emailTestResult && (
                  <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 12, background: emailTestResult.ok ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)', border: '1px solid ' + (emailTestResult.ok ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'), color: emailTestResult.ok ? 'var(--ok)' : 'var(--bad)' }}>
                    {emailTestResult.ok ? '✅ ' : '❌ '}{emailTestResult.msg}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={testEmail} disabled={emailTesting}>{emailTesting ? '⏳ Probando...' : '📨 Probar conexión'}</button>
                  <button type="button" className="btn btn-primary" onClick={saveEmailConfig} disabled={emailSaving}>{emailSaving ? '⏳ Guardando...' : '💾 Guardar configuración'}</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════ PAGOS / BILLING ═══════ */}
          {tab === 'pagos' && (
            <>
              {/* Config MercadoPago */}
              <div className="card" style={{ maxWidth: 640, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>💳 MercadoPago — Configuración</h3>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!mpConfig?.enabled} onChange={e => setMpConfig(p => ({ ...p, enabled: e.target.checked }))} />
                    <strong>{mpConfig?.enabled ? 'Habilitado' : 'Deshabilitado'}</strong>
                  </label>
                </div>
                {mpConfig && <>
                  <div className="fr">
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Modo</label>
                      <select value={mpConfig.mode || 'test'} onChange={e => setMpConfig(p => ({ ...p, mode: e.target.value }))}>
                        <option value="test">🧪 Test</option>
                        <option value="live">🚀 Producción (live)</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Moneda</label>
                      <select value={mpConfig.currency || 'ARS'} onChange={e => setMpConfig(p => ({ ...p, currency: e.target.value }))}>
                        <option value="ARS">ARS — Peso argentino</option>
                        <option value="USD">USD — Dólar</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Access Token {mpConfig.access_token_configurado && <span style={{ color: 'var(--ok)' }}>(configurado ✓)</span>}</label>
                    <input type="password" value={mpConfig.access_token_masked || ''} onChange={e => setMpConfig(p => ({ ...p, access_token_masked: e.target.value }))} placeholder={mpConfig.access_token_configurado ? '•••••••• (dejar vacío para no cambiar)' : 'APP_USR-... o TEST-...'} style={{ width: '100%' }} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Webhook Secret {mpConfig.webhook_secret_configurado && <span style={{ color: 'var(--ok)' }}>(configurado ✓)</span>}</label>
                    <input type="password" value={mpConfig.webhook_secret_masked || ''} onChange={e => setMpConfig(p => ({ ...p, webhook_secret_masked: e.target.value }))} placeholder={mpConfig.webhook_secret_configurado ? '•••••••• (dejar vacío para no cambiar)' : 'Clave secreta para firmar webhooks'} style={{ width: '100%' }} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>URL del Webhook (copiala en el panel de MercadoPago → Notificaciones Webhooks)</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={mpConfig.webhook_url || ''} readOnly style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} onFocus={e => e.target.select()} />
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard?.writeText(mpConfig.webhook_url || ''); alert('URL copiada') }}>📋</button>
                    </div>
                  </div>
                  {mpTestResult && (
                    <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 12, background: mpTestResult.ok ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)', border: '1px solid ' + (mpTestResult.ok ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'), color: mpTestResult.ok ? 'var(--ok)' : 'var(--bad)' }}>
                      {mpTestResult.ok ? '✅ ' : '❌ '}{mpTestResult.msg}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button type="button" className="btn btn-secondary" onClick={testMp} disabled={mpTesting}>{mpTesting ? '⏳ Probando...' : '🔌 Probar conexión'}</button>
                    <button type="button" className="btn btn-primary" onClick={saveMpConfig} disabled={mpSaving}>{mpSaving ? '⏳ Guardando...' : '💾 Guardar MercadoPago'}</button>
                  </div>
                </>}
              </div>

              {/* Políticas de billing */}
              <div className="card" style={{ maxWidth: 640, marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 12 }}>📅 Políticas de vencimiento y avisos</h3>
                {billingConfig && <>
                  <div className="fr">
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Días de gracia (acceso permitido tras vencer)</label>
                      <input type="number" min="0" max="30" value={billingConfig.grace_days} onChange={e => setBillingConfig(p => ({ ...p, grace_days: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Días de aviso (lista separada por comas)</label>
                      <input value={billingConfig.aviso_dias} onChange={e => setBillingConfig(p => ({ ...p, aviso_dias: e.target.value }))} placeholder="7,3,1,0,-1,-3" style={{ fontFamily: 'monospace', fontSize: 12 }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 4, padding: '8px 12px', background: 'var(--sf)', borderRadius: 6 }}>
                    💡 Se notifica a la empresa (campana + email) en cada uno de esos días respecto del vencimiento. Ej: 7 = "vence en 7 días", -1 = "venció ayer". Se evita duplicar avisos del mismo día.
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!billingConfig.suspend_after_grace} onChange={e => setBillingConfig(p => ({ ...p, suspend_after_grace: e.target.checked }))} />
                    Suspender empresa automáticamente al superar el período de gracia
                  </label>
                  <div style={{ marginTop: 14 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Asunto del email de comprobante/aviso (placeholders: {'{{empresa}} {{plan}} {{monto}} {{vencimiento}} {{comprobante}} {{dias}}'})</label>
                    <input value={billingConfig.mail_subject} onChange={e => setBillingConfig(p => ({ ...p, mail_subject: e.target.value }))} placeholder="Pago confirmado — FlexCRM {{plan}}" />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Cuerpo del email</label>
                    <textarea value={billingConfig.mail_body} onChange={e => setBillingConfig(p => ({ ...p, mail_body: e.target.value }))} rows={4} placeholder="Dejar vacío para usar el texto por defecto" style={{ resize: 'vertical' }} />
                  </div>
                  <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={saveBillingConfig} disabled={billingSaving}>{billingSaving ? '⏳ Guardando...' : '💾 Guardar políticas'}</button>
                </>}
              </div>

              {/* Listado de pagos */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>🧾 Cobros registrados</h3>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <select value={pagosFiltro} onChange={e => { setPagosFiltro(e.target.value); setTimeout(loadPagos, 0) }} style={{ ...S.select, width: 'auto', fontSize: 12, padding: '6px 10px' }}>
                      <option value="">Todos</option>
                      <option value="approved">✅ Aprobados</option>
                      <option value="pending">⏳ Pendientes</option>
                      <option value="rejected">❌ Rechazados</option>
                    </select>
                    <input type="month" value={pagosMes} onChange={e => { setPagosMes(e.target.value); setTimeout(loadPagos, 0) }} style={{ border: '1px solid var(--bd)', borderRadius: 6, fontSize: 12, padding: '6px 10px' }} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={exportPagosCSV} title="Exportar aprobados a CSV">📥 CSV</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={loadPagos}>↻</button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr><th>Fecha</th><th>Empresa</th><th>Plan</th><th>Tipo</th><th>Origen</th><th>Monto</th><th>Estado</th><th>Comprobante</th><th></th></tr></thead>
                    <tbody>
                      {pagosList.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--mu)' }}>Sin pagos registrados</td></tr>}
                      {pagosList.map(p => {
                        const ESTADOS = { approved: ['✅ Aprobado', 'badge-green'], pending: ['⏳ Pendiente', 'badge-yellow'], rejected: ['❌ Rechazado', 'badge-red'], cancelled: ['🚫 Cancelado', 'badge-gray'], refunded: ['↩️ Reembolsado', 'badge-gray'] }
                        const [estLabel, estCls] = ESTADOS[p.estado] || [p.estado, 'badge-gray']
                        return (
                          <tr key={p.id} style={{ fontSize: 12 }}>
                            <td style={{ whiteSpace: 'nowrap' }} data-label="Fecha">{p.creado ? new Date(p.creado).toLocaleDateString('es-AR') : '—'}</td>
                            <td data-label="Empresa"><span style={{ fontWeight: 600 }}>{p.empresa_nombre || p.empresa_codigo || '—'}</span></td>
                            <td data-label="Plan">{p.plan_nombre || p.plan_id}</td>
                            <td data-label="Tipo"><span className="badge badge-blue" style={{ fontSize: 10 }}>{p.tipo}</span></td>
                            <td data-label="Origen" style={{ fontSize: 11, color: 'var(--mu)' }}>{p.origen === 'manual_efectivo' ? '💵 Efectivo' : p.origen === 'manual_transferencia' ? '🏦 Transferencia' : '💳 MercadoPago'}</td>
                            <td data-label="Monto" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{p.monto != null ? '$' + Number(p.monto).toLocaleString('es-AR') : '—'}</td>
                            <td data-label="Estado"><span className={`badge ${estCls}`} style={{ fontSize: 10 }}>{estLabel}</span></td>
                            <td data-label="Comprobante" style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.comprobante_num || '—'}</td>
                            <td data-label="Acciones" style={{ whiteSpace: 'nowrap' }}>
                              {p.estado === 'approved' && <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 10 }} title="Regenerar comprobante PDF" onClick={() => reenviarComprobante(p.id)}>📄</button>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Log de webhooks */}
              <details className="card" style={{ marginTop: 16 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--mu)' }}>🔍 Log de webhooks MercadoPago ({webhookLogs.length})</summary>
                <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
                  {webhookLogs.length === 0 ? <div style={{ color: 'var(--mu)', textAlign: 'center', padding: 20 }}>Sin eventos</div> : (
                    <table>
                      <thead><tr><th>Fecha</th><th>Payment ID</th><th>Firma</th><th>Procesado</th><th>Error</th></tr></thead>
                      <tbody>
                        {webhookLogs.map(w => (
                          <tr key={w.id} style={{ fontSize: 11 }}>
                            <td style={{ whiteSpace: 'nowrap' }}>{w.creado ? new Date(w.creado).toLocaleString('es-AR') : '—'}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{w.mp_payment_id || '—'}</td>
                            <td>{w.firma_valida ? '✅' : '❌'}</td>
                            <td>{w.procesado ? '✅' : '❌'}</td>
                            <td style={{ color: 'var(--bad)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={w.error}>{w.error || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </details>
            </>
          )}

          {/* ═══════ ATRIBUTOS POR RUBRO ═══════ */}
          {tab === 'atributos' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>🏷️ Atributos por Rubro</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={atributoFiltroRubro} onChange={e => setAtributoFiltroRubro(e.target.value)} style={{ ...S.select, width: 'auto', fontSize: 12, padding: '6px 10px' }}>
                    <option value="">Todos los rubros</option>
                    {[...new Set(atributos.map(a => a.rubro))].map(r => <option key={r} value={r}>{RUBROS.find(x => x.v === r)?.l || r}</option>)}
                  </select>
                  <button type="button" className="btn btn-primary btn-sm" onClick={openNewAtributo}>+ Nuevo atributo</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={loadAtributos}>↻</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {atributos.filter(a => !atributoFiltroRubro || a.rubro === atributoFiltroRubro).map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)', fontSize: 13 }}>
                    <span style={{ fontWeight: 600, width: 140, flexShrink: 0 }}>{RUBROS.find(x => x.v === a.rubro)?.l || a.rubro}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--ac)', width: 120, flexShrink: 0 }}>{a.atributo_key}</span>
                    <span style={{ flex: 1 }}>{a.atributo_label}</span>
                    <span className="badge badge-gray" style={{ fontSize: 10 }}>{a.tipo}</span>
                    {Array.isArray(a.opciones) && a.opciones.length > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--mu)' }}>{a.opciones.join(', ')}</span>
                    )}
                    <button type="button" className="btn btn-icon btn-sm" onClick={() => openEditAtributo(a)}>✏️</button>
                  </div>
                ))}
                {atributos.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--mu)' }}>Sin atributos configurados</div>}
              </div>
            </div>
          )}

          {/* ═══════ MANTENIMIENTO ═══════ */}
          {tab === 'mantenimiento' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>🔧 Mantenimiento</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={openNewMt}>+ Nuevo item</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={loadMantenimiento}>↻</button>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>Dominios, servidores, APIs, certificados con fecha de vencimiento. Todo lo que necesita seguimiento.</p>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Item</th><th>Tipo</th><th>Vence</th><th>Proveedor</th><th>URL</th><th></th></tr></thead>
                  <tbody>
                    {mtItems.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--mu)' }}>Sin items de mantenimiento</td></tr>}
                    {mtItems.map(m => {
                      const vence = m.fecha_vencimiento ? new Date(m.fecha_vencimiento) : null
                      const dias = vence ? Math.ceil((vence - new Date()) / 86400000) : null
                      const vencido = dias !== null && dias < 0
                      const pronto = dias !== null && dias >= 0 && dias <= 30
                      return (
                        <tr key={m.id} style={{ background: vencido ? 'rgba(239,68,68,.06)' : pronto ? 'rgba(245,158,11,.06)' : 'transparent' }}>
                          <td style={{ fontWeight: 600 }} data-label="Item">{m.nombre}</td>
                          <td data-label="Tipo"><span className={`badge ${m.tipo === 'dominio' ? 'badge-blue' : m.tipo === 'servidor' ? 'badge-purple' : m.tipo === 'api' ? 'badge-green' : m.tipo === 'certificado' ? 'badge-orange' : 'badge-gray'}`}>{m.tipo}</span></td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap' }} data-label="Vence">
                            {m.fecha_vencimiento ? (
                              <span style={{ color: vencido ? 'var(--bad)' : pronto ? 'var(--warn)' : 'var(--mu)', fontWeight: vencido ? 700 : 400 }}>
                                {new Date(m.fecha_vencimiento).toLocaleDateString('es-AR')}
                                {dias !== null && <span style={{ fontSize: 10, marginLeft: 4 }}>({vencido ? Math.abs(dias) + 'd atras' : dias + 'd'})</span>}
                              </span>
                            ) : <span style={{ color: 'var(--mu)' }}>—</span>}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--mu)' }} data-label="Proveedor">{m.proveedor || '—'}</td>
                          <td style={{ fontSize: 12 }} data-label="URL">{m.url ? <a href={m.url} target="_blank" rel="noopener" style={{ color: 'var(--ac)' }}>{m.url.replace(/https?:\/\//,'').substring(0, 30)}</a> : '—'}</td>
                          <td style={{ whiteSpace: 'nowrap' }} data-label="Acciones">
                            <button type="button" className="btn btn-icon btn-sm" onClick={() => openEditMt(m)}>✏️</button>
                            <button type="button" className="btn btn-icon btn-sm" onClick={() => deleteMt(m.id)}>🗑️</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════ LANDING ═══════ */}
          {tab === 'landing' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase' }}>🌐 Landing Page</h3>
                  <select value={statsDias} onChange={e => { const v = Number(e.target.value); setStatsDias(v); setTimeout(() => loadLandingStats(), 0) }} style={{ ...S.select, width: 'auto', fontSize: 11, padding: '4px 8px' }}>
                    <option value="7">7 días</option>
                    <option value="30">30 días</option>
                    <option value="90">90 días</option>
                  </select>
                  <input type="text" placeholder="Filtrar página..." value={statsPagina} onChange={e => setStatsPagina(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} onBlur={e => { if (e.target.value !== statsPagina) { setStatsPagina(e.target.value); setTimeout(loadLandingStats, 0) } }} style={{ border: '1px solid var(--bo, #ccc)', borderRadius: 6, fontSize: 11, padding: '4px 8px', width: 120 }} />
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { loadLanding(); loadLandingStats() }}>↻</button>
              </div>
              {/* KPIs */}
              {landingStats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                  <div className="kpi-card"><K label="Visitas" value={landingStats.visitas} sub={landingStats.periodo_dias + ' días'} /></div>
                  <div className="kpi-card"><K label="Únicas" value={landingStats.visitas_unicas || '—'} sub="por IP aprox" /></div>
                  <div className="kpi-card" style={{ borderLeft: '3px solid var(--ac)' }}><K label="Leads" value={landingStats.leads} sub={landingStats.conversion + '% conversión'} /></div>
                  <div className="kpi-card" style={{ borderLeft: '3px solid var(--warn)' }}><K label="Sin leer" value={leads.filter(l => !l.leido).length} /></div>
                  {landingStats.bots_filtrados > 0 && <div className="kpi-card" style={{ borderLeft: '3px solid var(--mu)' }}><K label="Bots" value={landingStats.bots_filtrados} sub="filtrados" /></div>}
                </div>
              )}
              {/* Gráfico por día */}
              {landingStats && landingStats.por_dia && landingStats.por_dia.length > 0 && (
                <div style={{ marginBottom: 20, padding: '12px 16px', background: 'var(--bg-alt, #f8f8f8)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--mu)' }}>Visitas diarias</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 130, paddingBottom: 2 }}>
                    {landingStats.por_dia.slice(-30).map(d => {
                      const max = Math.max(...landingStats.por_dia.map(x => x.visitas), 1)
                      const h = Math.max(4, (d.visitas / max) * 126)
                      return (
                        <div key={d.dia} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }} title={`${d.dia}: ${d.visitas} visitas, ${d.leads || 0} leads`}>
                          <span style={{ fontSize: 8, color: 'var(--ac)', whiteSpace: 'nowrap', fontWeight: 600, minHeight: 10 }}>{d.leads > 0 ? d.leads : ''}</span>
                          <div style={{ width: '100%', height: h, background: 'var(--ac2)', borderRadius: '3px 3px 0 0', minWidth: 8, position: 'relative' }} />
                          <span style={{ fontSize: 7, color: 'var(--mu)', whiteSpace: 'nowrap', marginTop: 2 }}>{d.dia.slice(5)}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--mu)', marginTop: 8 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--ac2)', borderRadius: 2 }} /> Visitas
                    <span style={{ color: 'var(--ac)', fontWeight: 700 }}>Leads (números arriba)</span>
                  </div>
                </div>
              )}
              {/* Tabla por fuente */}
              {landingStats && landingStats.por_fuente && landingStats.por_fuente.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--mu)' }}>Origen del tráfico</div>
                  <table>
                    <thead><tr><th>Fuente</th><th>Visitas</th><th>%</th></tr></thead>
                    <tbody>
                      {landingStats.por_fuente.map(f => (
                        <tr key={f.fuente}><td style={{ fontWeight: 600 }}>{f.fuente}</td><td>{f.visitas}</td><td>{landingStats.visitas > 0 ? ((f.visitas / landingStats.visitas) * 100).toFixed(0) : 0}%</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Tabla de leads */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--mu)' }}>Leads ({leads.length})</h4>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={landingFiltro} onChange={e => setLandingFiltro(e.target.value)} style={{ ...S.select, width: 'auto', fontSize: 12, padding: '4px 8px' }}>
                    <option value="todos">Todos ({leads.length})</option>
                    <option value="noleidos">No leídos ({leads.filter(l => !l.leido).length})</option>
                    <option value="leidos">Leídos ({leads.filter(l => l.leido).length})</option>
                  </select>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={exportLeadsCSV} style={{ fontSize: 11, padding: '4px 10px' }}>📥 CSV</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Fecha</th><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Empresa</th><th>Mensaje</th><th>Página</th><th>Fuente</th><th></th></tr></thead>
                  <tbody>
                    {leadsFiltrados.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--mu)' }}>Sin leads</td></tr>}
                    {leadsFiltrados.map(l => {
                      const fuente = l.utm_source || (l.ref && l.ref.length < 60 ? l.ref : '') || l.pagina || '—'
                      return (
                        <tr key={l.id} style={{ background: l.leido ? 'transparent' : 'rgba(249,115,22,.04)' }}>
                          <td style={{ fontSize: 11, whiteSpace: 'nowrap' }} data-label="Fecha">{l.fecha ? new Date(l.fecha).toLocaleString('es-AR') : '—'}</td>
                          <td style={{ fontWeight: l.leido ? 400 : 700 }} data-label="Nombre">{l.nombre || '—'}</td>
                          <td style={{ fontSize: 12 }} data-label="Teléfono">{l.telefono || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--ac)' }} data-label="Email">{l.email || '—'}</td>
                          <td style={{ fontSize: 12 }} data-label="Empresa">{l.empresa_interes || '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--mu)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-label="Mensaje">{l.mensaje || '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--mu)' }} data-label="Página">{l.pagina || '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--ac)' }} data-label="Fuente">{fuente}</td>
                          <td data-label="Acciones">{!l.leido && <button type="button" className="btn btn-primary btn-sm" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => marcarLeadLeido(l.id)}>✓ Leído</button>}</td>
                        </tr>
                      )
                    })}
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
                        <td style={{ fontSize: 11, whiteSpace: 'nowrap' }} data-label="Fecha">{t.fecha ? new Date(t.fecha).toLocaleString('es-AR') : '—'}</td>
                        <td data-label="Empresa"><span style={{ fontWeight: 600, fontSize: 12 }}>{t.empresa_nombre || t.empresa_id || '—'}</span></td>
                        <td style={{ fontWeight: 600, fontSize: 13 }} data-label="Asunto">{t.asunto || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--mu)' }} data-label="Por">{t.creado_por || '—'}</td>
                        <td data-label="Estado"><span className={`badge ${t.estado==='pendiente'?'badge-yellow':'badge-green'}`}>{t.estado === 'pendiente' ? '⏳ Pendiente' : '✅ Respondida'}</span></td>
                        <td style={{ whiteSpace: 'nowrap' }} data-label="Acciones">
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
                        <td style={{ whiteSpace: 'nowrap' }} data-label="Fecha">{a.fecha ? new Date(a.fecha).toLocaleString('es-AR') : '—'}</td>
                        <td data-label="Admin">{a.admin_id || '—'}</td>
                        <td data-label="Acción">{a.accion || '—'}</td>
                        <td data-label="Empresa">{a.empresa_id || '—'}</td>
                        <td style={{ color: 'var(--mu)' }} data-label="Detalle">{a.detalle || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════ APPS ═══════ */}
          {tab === 'apps' && (
            <div>
              {/* Stats */}
              {appsStats && (
                <div className="grid-3" style={{ gap: 12, marginBottom: 20 }}>
                  <div style={{ background:'var(--bg)', border:'1px solid var(--bd)', borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11,color:'var(--mu)',textTransform:'uppercase',marginBottom:4 }}>Apps en catálogo</div>
                    <div style={{ fontSize:24,fontWeight:800 }}>{appsStats.totalApps}</div>
                  </div>
                  <div style={{ background:'var(--bg)', border:'1px solid var(--bd)', borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11,color:'var(--mu)',textTransform:'uppercase',marginBottom:4 }}>Instalaciones activas</div>
                    <div style={{ fontSize:24,fontWeight:800 }}>{appsStats.totalInstalaciones}</div>
                  </div>
                  <div style={{ background:'var(--bg)', border:'1px solid var(--bd)', borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11,color:'var(--mu)',textTransform:'uppercase',marginBottom:4 }}>Apps más instaladas</div>
                    <div style={{ fontSize:13 }}>
                      {appsStats.porApp.slice(0,3).map(a => (
                        <div key={a.app_slug} style={{ display:'flex',justifyContent:'space-between' }}><span>{a.nombre || a.app_slug}</span><span style={{fontWeight:700}}>{a.n}</span></div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Catálogo + Instalaciones (2 cols) */}
              <div className="grid-2" style={{ gap: 16 }}>
                {/* Catálogo */}
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
                    <h3 style={{ fontSize:13,fontWeight:700,color:'var(--mu)',textTransform:'uppercase' }}>📦 Catálogo</h3>
                    <div style={{ display:'flex',gap:6 }}>
                      <select value={appsFiltroCat} onChange={e => setAppsFiltroCat(e.target.value)} style={{ fontSize:11,padding:'3px 6px',borderRadius:6,border:'1px solid var(--bd)' }}>
                        <option value="">Todas</option>
                        {APP_CATS.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
                      </select>
                      <button type="button" className="btn btn-sm btn-primary" onClick={openNewApp} style={{ fontSize:11 }}>+ Nueva</button>
                    </div>
                  </div>
                  <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                    {appsFiltradas.map(a => (
                      <div key={a.slug} style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'var(--sf)',borderRadius:8,border:'1px solid var(--bd)' }}>
                        <span style={{ fontSize:20 }}>{a.icono || '📦'}</span>
                        <div style={{ flex:1,minWidth:0 }}>
                          <div style={{ fontSize:13,fontWeight:700 }}>{a.nombre} <span style={{ fontSize:11,color:'var(--mu)',fontWeight:400 }}>v{a.version}</span></div>
                          <div style={{ fontSize:11,color:'var(--mu)' }}>
                            {CAT_LABELS[a.categoria] || a.categoria}
                            {a.precio_mensual > 0 && <span style={{ marginLeft:6,color:'var(--ok)',fontWeight:600 }}>${a.precio_mensual}/mes</span>}
                            {a.precio_mensual === 0 && a.precio_base === 0 && <span style={{ marginLeft:6,color:'var(--ok)',fontWeight:600 }}>Gratis</span>}
                          </div>
                        </div>
                        {!a.activa && <span style={{ fontSize:10,color:'var(--bad)',fontWeight:600 }}>INACTIVA</span>}
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => openEditApp(a)} style={{ fontSize:10 }}>Editar</button>
                      </div>
                    ))}
                    {appsFiltradas.length === 0 && <div style={{ textAlign:'center',color:'var(--mu)',padding:20 }}>Sin apps en esta categoría</div>}
                  </div>
                </div>

                {/* Instalaciones */}
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
                    <h3 style={{ fontSize:13,fontWeight:700,color:'var(--mu)',textTransform:'uppercase' }}>📥 Instalaciones</h3>
                    <div style={{ display:'flex',gap:6 }}>
                      <select value={appsFiltroEmp} onChange={e => setAppsFiltroEmp(e.target.value)} style={{ fontSize:11,padding:'3px 6px',borderRadius:6,border:'1px solid var(--bd)' }}>
                        <option value="">Todas las empresas</option>
                        {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                      </select>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => { loadAppsInstaladas(); loadAppsStats() }} style={{ fontSize:11 }}>↻</button>
                    </div>
                  </div>
                  <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                    {appsInstFiltradas.slice(0, 30).map(i => (
                      <div key={i.id} style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:'var(--sf)',borderRadius:8,border:'1px solid var(--bd)' }}>
                        <span style={{ fontSize:16 }}>{i.app_icono || '📦'}</span>
                        <div style={{ flex:1,minWidth:0 }}>
                          <div style={{ fontSize:12,fontWeight:700 }}>{i.app_nombre || i.app_slug}</div>
                          <div style={{ fontSize:10,color:'var(--mu)' }}>{i.empresa_nombre || i.empresa_id} · v{i.version_instalada}</div>
                        </div>
                        {!i.activa && <span style={{ fontSize:10,color:'var(--bad)',fontWeight:600 }}>PAUSADA</span>}
                        <button type="button" className="btn btn-sm" style={{ fontSize:10,background: i.activa ? 'var(--bad)' : 'var(--ok)',color:'#fff',border:'none',borderRadius:6,padding:'2px 8px' }}
                          onClick={() => toggleAppInstStatus(i.id, i.activa)}>
                          {i.activa ? 'Pausar' : 'Activar'}
                        </button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => desinstalarApp(i.id)} style={{ fontSize:10,color:'var(--bad)' }}>✕</button>
                      </div>
                    ))}
                    {appsInstFiltradas.length === 0 && <div style={{ textAlign:'center',color:'var(--mu)',padding:20 }}>Sin instalaciones</div>}
                  </div>
                </div>
              </div>

              {/* Quick Install */}
              <div className="card" style={{ marginTop: 16, padding: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', marginBottom: 12 }}>⚡ Instalación rápida</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select id="qinstall-app" style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bd)', flex: 1 }}>
                    <option value="">Seleccionar app...</option>
                    {appsData.filter(a => a.activa).map(a => <option key={a.slug} value={a.slug}>{a.nombre}</option>)}
                  </select>
                  <select id="qinstall-emp" style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bd)', flex: 1 }}>
                    <option value="">Seleccionar empresa...</option>
                    {empresas.filter(e => e.activo).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => {
                    const appSlug = document.getElementById('qinstall-app').value
                    const empId = document.getElementById('qinstall-emp').value
                    if (!appSlug || !empId) { alert('Seleccioná app y empresa'); return }
                    instalarAppEnEmpresa(appSlug, empId)
                  }} style={{ fontSize: 12 }}>Instalar</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════ LEGAL ═══════ */}
          {tab === 'legal' && (
            <div>
              <h2 style={{ fontSize:18, fontWeight:700, marginBottom:16 }}>⚖️ Gestión Legal</h2>
              <div className="card" style={{ padding:16, marginBottom:16 }}>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📤 Subir nueva versión</h3>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
                  <div style={{ flex:1, minWidth:120 }}><label style={{ fontSize:11, color:'var(--mu)', display:'block', marginBottom:4 }}>Tipo</label><select id="legal-tipo" style={S.select}><option value="terminos">Términos y Condiciones</option><option value="privacidad">Política de Privacidad</option><option value="cookies">Política de Cookies</option></select></div>
                  <div style={{ flex:1, minWidth:100 }}><label style={{ fontSize:11, color:'var(--mu)', display:'block', marginBottom:4 }}>Versión</label><input id="legal-version" placeholder="1.1" style={S.input} /></div>
                  <div style={{ flex:1, minWidth:100 }}><label style={{ fontSize:11, color:'var(--mu)', display:'block', marginBottom:4 }}>Acción</label><button type="button" className="btn btn-primary btn-sm" style={{ width:'100%' }} onClick={subirVersionLegal}>Subir nueva versión</button></div>
                </div>
                <p style={{ fontSize:11, color:'var(--mu)', marginTop:8 }}>Al subir una nueva versión, los administradores de cada empresa deberán re-aceptarla en su próximo inicio de sesión (período de gracia: 7 días).</p>
                {legalMsg && <div style={{ marginTop:8, padding:'8px 12px', borderRadius:8, fontSize:12, background:legalMsgErr?'rgba(239,68,68,.1)':'rgba(34,197,94,.1)', color:legalMsgErr?'var(--bad)':'var(--ok)' }}>{legalMsg}</div>}
              </div>
              <div className="card" style={{ padding:16, marginBottom:16 }}>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📊 Estado de Consentimientos por Empresa</h3>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead><tr style={{ borderBottom:'1px solid var(--bd)' }}><th style={{ textAlign:'left', padding:'8px 6px', color:'var(--mu)', fontSize:11 }}>Empresa</th><th style={{ textAlign:'left', padding:'8px 6px', color:'var(--mu)', fontSize:11 }}>Admin</th><th style={{ textAlign:'center', padding:'8px 6px', color:'var(--mu)', fontSize:11 }}>Términos</th><th style={{ textAlign:'center', padding:'8px 6px', color:'var(--mu)', fontSize:11 }}>Privacidad</th><th style={{ textAlign:'center', padding:'8px 6px', color:'var(--mu)', fontSize:11 }}>Estado</th></tr></thead>
                    <tbody>
                      {(legalEmpresas || []).map((e, i) => {
                        const tOk = e.estado?.terminos?.aceptado;
                        const pOk = e.estado?.privacidad?.aceptado;
                        const ok = tOk && pOk;
                        return <tr key={i} style={{ borderBottom:'1px solid var(--bd)', background:i%2===0?'var(--sf)':'transparent' }}>
                          <td style={{ padding:'8px 6px', fontWeight:600 }} data-label="Empresa">{e.nombre} <span style={{ color:'var(--mu)', fontSize:10 }}>({e.codigo})</span></td>
                          <td style={{ padding:'8px 6px', color:'var(--mu)', fontSize:10 }} data-label="Admin">{e.admin_email}</td>
                          <td style={{ padding:'8px 6px', textAlign:'center' }} data-label="Términos">{tOk ? <span style={{ color:'var(--ok)', fontSize:11 }}>✅ v{e.estado?.terminos?.vigente||'—'}<br/><span style={{ fontSize:9, color:'var(--mu)' }}>{e.estado?.terminos?.aceptado_fecha ? new Date(e.estado.terminos.aceptado_fecha).toLocaleDateString('es-AR') : ''}</span></span> : <span style={{ color:'var(--bad)', fontSize:11 }}>❌ v{e.estado?.terminos?.vigente||'—'}</span>}</td>
                          <td style={{ padding:'8px 6px', textAlign:'center' }} data-label="Privacidad">{pOk ? <span style={{ color:'var(--ok)', fontSize:11 }}>✅ v{e.estado?.privacidad?.vigente||'—'}<br/><span style={{ fontSize:9, color:'var(--mu)' }}>{e.estado?.privacidad?.aceptado_fecha ? new Date(e.estado.privacidad.aceptado_fecha).toLocaleDateString('es-AR') : ''}</span></span> : <span style={{ color:'var(--bad)', fontSize:11 }}>❌ v{e.estado?.privacidad?.vigente||'—'}</span>}</td>
                          <td style={{ padding:'8px 6px', textAlign:'center' }} data-label="Estado"><span style={{ padding:'2px 8px', borderRadius:10, fontSize:10, fontWeight:600, background:ok?'rgba(34,197,94,.15)':'rgba(239,68,68,.15)', color:ok?'var(--ok)':'var(--bad)' }}>{ok?'Al día':'Pendiente'}</span></td>
                        </tr>;
                      })}
                      {(!legalEmpresas || legalEmpresas.length === 0) && <tr><td colSpan={5} style={{ padding:16, textAlign:'center', color:'var(--mu)', fontSize:12 }}>Cargando...</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop:12 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={loadLegalEstado}>🔄 Actualizar</button>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft:8 }} onClick={cargarLegalAuditoria}>📋 Ver auditoría</button>
                </div>
              </div>
              {legalAuditData && <div className="card" style={{ padding:16, marginBottom:16 }}>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📋 Auditoría de Acciones Legales</h3>
                <div style={{ maxHeight:400, overflowY:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                    <thead><tr style={{ borderBottom:'1px solid var(--bd)', position:'sticky', top:0, background:'var(--bg)' }}><th style={{ textAlign:'left', padding:'6px', color:'var(--mu)', fontSize:10 }}>Fecha</th><th style={{ textAlign:'left', padding:'6px', color:'var(--mu)', fontSize:10 }}>Acción</th><th style={{ textAlign:'left', padding:'6px', color:'var(--mu)', fontSize:10 }}>Empresa</th><th style={{ textAlign:'left', padding:'6px', color:'var(--mu)', fontSize:10 }}>Detalle</th></tr></thead>
                    <tbody>{(legalAuditData.auditoria||[]).map((a,i) => <tr key={i} style={{ borderBottom:'1px solid var(--bd)' }}><td style={{ padding:'6px', whiteSpace:'nowrap', fontSize:10 }} data-label="Fecha">{a.fecha?new Date(a.fecha).toLocaleString('es-AR'):'—'}</td><td style={{ padding:'6px', fontSize:10 }} data-label="Acción"><code style={{ fontSize:10 }}>{a.accion}</code></td><td style={{ padding:'6px', fontSize:10 }} data-label="Empresa">{a.empresa_id||'—'}</td><td style={{ padding:'6px', fontSize:10, maxWidth:300, overflow:'hidden', textOverflow:'ellipsis' }} data-label="Detalle">{typeof a.detalle==='string'&&a.detalle.startsWith('{')?(d=>{try{const o=JSON.parse(d);return o.msg||d}catch{return d}})(a.detalle):a.detalle}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>}
            </div>
          )}

          {/* ═══════ NOTIFICACIONES ═══════ */}
          {tab === 'notificaciones' && (
            <div>
              <h2 style={{ fontSize:18, fontWeight:700, marginBottom:16 }}>🔔 Notificaciones</h2>
              <div className="card" style={{ padding:16, marginBottom:16 }}>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📤 Enviar notificación</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ display:'flex', gap:8 }}>
                    <div style={{ flex:1 }}>
                      <label style={{ fontSize:11, color:'var(--mu)', display:'block', marginBottom:4 }}>Empresa</label>
                      <select value={notifForm.empresa} onChange={e => setNotifForm(p=>({...p,empresa:e.target.value}))} style={S.select}>
                        <option value="">Todas las empresas</option>
                        {empresas.filter(e=>e.activo).map(e => <option key={e.id} value={e.codigo}>{e.nombre}</option>)}
                      </select>
                    </div>
                    <div style={{ flex:1 }}>
                      <label style={{ fontSize:11, color:'var(--mu)', display:'block', marginBottom:4 }}>Tipo</label>
                      <select value={notifForm.tipo} onChange={e => setNotifForm(p=>({...p,tipo:e.target.value}))} style={S.select}>
                        <option value="manual">📝 Manual</option>
                        <option value="renovacion">⚠️ Renovación de plan</option>
                        <option value="nuevos_terminos">📄 Nuevos términos</option>
                        <option value="nueva_app">📦 Nueva app</option>
                      </select>
                    </div>
                  </div>
                  <div><label style={{ fontSize:11, color:'var(--mu)', display:'block', marginBottom:4 }}>Título</label><input value={notifForm.titulo} onChange={e => setNotifForm(p=>({...p,titulo:e.target.value}))} placeholder="Ej: Recordatorio de pago" style={S.input} /></div>
                  <div><label style={{ fontSize:11, color:'var(--mu)', display:'block', marginBottom:4 }}>Mensaje</label><textarea value={notifForm.mensaje} onChange={e => setNotifForm(p=>({...p,mensaje:e.target.value}))} rows={3} placeholder="Mensaje de la notificación..." style={{...S.textarea, width:'100%'}} /></div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={enviarNotificacion} disabled={notifEnviando}>
                      {notifEnviando ? '⏳ Enviando...' : '📤 Enviar notificación'}
                    </button>
                    {notifMsg && <span style={{ fontSize:12, color:notifMsg.includes('Error')||notifMsg.includes('requerido')?'var(--bad)':'var(--ok)' }}>{notifMsg}</span>}
                  </div>
                </div>
              </div>
              <div className="card" style={{ padding:16 }}>
                <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📋 Historial de notificaciones</h3>
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom:12 }} onClick={loadNotifHistorial}>🔄 Cargar historial</button>
                {notifHistorial && (
                  <div style={{ maxHeight:400, overflowY:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                      <thead><tr style={{ borderBottom:'1px solid var(--bd)' }}><th style={{ textAlign:'left', padding:'6px', color:'var(--mu)', fontSize:10 }}>Fecha</th><th style={{ textAlign:'left', padding:'6px', color:'var(--mu)', fontSize:10 }}>Empresa</th><th style={{ textAlign:'left', padding:'6px', color:'var(--mu)', fontSize:10 }}>Tipo</th><th style={{ textAlign:'left', padding:'6px', color:'var(--mu)', fontSize:10 }}>Título</th><th style={{ textAlign:'center', padding:'6px', color:'var(--mu)', fontSize:10 }}>Leída</th></tr></thead>
                      <tbody>
                        {(notifHistorial||[]).map((n,i) => (
                          <tr key={i} style={{ borderBottom:'1px solid var(--bd)', background:i%2===0?'var(--sf)':'transparent' }}>
                            <td style={{ padding:'6px', fontSize:10, whiteSpace:'nowrap' }} data-label="Fecha">{new Date(n.creado).toLocaleString('es-AR')}</td>
                            <td style={{ padding:'6px', fontSize:10 }} data-label="Empresa">{n.empresa_codigo}</td>
                            <td style={{ padding:'6px', fontSize:10 }} data-label="Tipo"><span style={{ padding:'1px 6px', borderRadius:8, fontSize:9, background:'var(--sf)', color:'var(--mu)' }}>{n.tipo}</span></td>
                            <td style={{ padding:'6px', fontSize:11, fontWeight:600 }} data-label="Título">{n.titulo}</td>
                            <td style={{ padding:'6px', textAlign:'center', fontSize:10 }} data-label="Leída">{n.leida?'✅':'📩'}</td>
                          </tr>
                        ))}
                        {(!notifHistorial || notifHistorial.length === 0) && <tr><td colSpan={5} style={{ padding:16, textAlign:'center', color:'var(--mu)', fontSize:12 }}>Sin notificaciones</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          </div>
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
                  <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Contraseña admin</label><input type="password" value={empForm.password} onChange={e => setEmpForm(p => ({ ...p, password: e.target.value }))} placeholder="Mínimo 8 caracteres" style={S.input} /></div>
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
                  <div className="grid-2" style={{ gap: 12 }}>
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

      {/* Modal: Eliminar Empresa */}
      {deleteModal && (
        <div className="modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal-header"><h3>🗑️ Eliminar empresa</h3><button type="button" onClick={() => setDeleteModal(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background:'rgba(239,68,68,.06)', borderRadius:8, padding:12, fontSize:13, border:'1px solid rgba(239,68,68,.2)' }}>
                <p style={{ marginBottom:4 }}>⚠️ Vas a eliminar permanentemente:</p>
                <p style={{ fontWeight:700 }}>{deleteModal.nombre || deleteModal.codigo}</p>
                <p style={{ fontSize:11, color:'var(--mu)', fontFamily:'monospace' }}>{deleteModal.codigo}{deleteModal.admin_email ? ' · '+deleteModal.admin_email : ''}</p>
              </div>
              {deleteModal.admin_email && (
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', padding:'8px 12px', background:'var(--sf)', borderRadius:8, border:'1px solid var(--bd)' }}>
                  <input type="checkbox" checked={deleteEmail} onChange={e => setDeleteEmail(e.target.checked)} style={{ width:16,height:16 }} />
                  📧 Enviar backup por email a <strong>{deleteModal.admin_email}</strong>
                </label>
              )}
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', padding:'8px 12px', background:'var(--sf)', borderRadius:8, border:'1px solid var(--bd)' }}>
                <input type="checkbox" checked={deleteBackup} onChange={e => setDeleteBackup(e.target.checked)} style={{ width:16,height:16 }} />
                💾 Descargar backup antes de eliminar
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-danger" onClick={deleteEmpresa} disabled={deleteSaving} style={{ background:'var(--bad)', color:'#fff', border:'none' }}>
                {deleteSaving ? '⏳ Eliminando...' : '🗑️ Eliminar permanentemente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Resolver eliminación */}
      {delSolModal && (
        <div className="modal-overlay" onClick={() => setDelSolModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal-header"><h3>🗑️ Aprobar eliminación</h3><button type="button" onClick={() => setDelSolModal(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background:'rgba(239,68,68,.06)', borderRadius:8, padding:12, fontSize:13, border:'1px solid rgba(239,68,68,.2)' }}>
                <p style={{ marginBottom:4 }}>⚠️ Vas a eliminar permanentemente:</p>
                <p style={{ fontWeight:700 }}>{delSolModal.empresa_nombre || delSolModal.empresa_codigo}</p>
                <p style={{ fontSize:11, color:'var(--mu)', fontFamily:'monospace' }}>{delSolModal.empresa_codigo} · {delSolModal.email || ''}</p>
              </div>
              {delSolModal.email && (
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', padding:'8px 12px', background:'var(--sf)', borderRadius:8, border:'1px solid var(--bd)' }}>
                  <input type="checkbox" checked={delSolEmail} onChange={e => setDelSolEmail(e.target.checked)} style={{ width:16,height:16 }} />
                  📧 Enviar backup por email a <strong>{delSolModal.email}</strong>
                </label>
              )}
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', padding:'8px 12px', background:'var(--sf)', borderRadius:8, border:'1px solid var(--bd)' }}>
                <input type="checkbox" checked={delSolBackup} onChange={e => setDelSolBackup(e.target.checked)} style={{ width:16,height:16 }} />
                💾 Descargar backup antes de eliminar
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setDelSolModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-danger" onClick={() => resolverEliminacion(delSolModal.id, 'aprobar')} disabled={delSolSaving} style={{ background:'var(--bad)', color:'#fff', border:'none' }}>
                {delSolSaving ? '⏳ Eliminando...' : '🗑️ Eliminar permanentemente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalle empresa */}
      {empresaDetail && (
        <div className="modal-overlay" onClick={() => setEmpresaDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>🏢 Detalle: {empresaDetail.nombre || empresaDetail.codigo}</h3>
              <button type="button" onClick={() => setEmpresaDetail(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Tabs */}
              <div style={{display:'flex',gap:4,marginBottom:14,borderBottom:'2px solid var(--bd)',paddingBottom:8,flexWrap:'wrap'}}>
                {[['info','📋 Info'],['pagos','💳 Pagos'],['vencimientos','📅 Vencimientos'],['audit','📋 Auditoría'],['apps','📦 Apps'],['integraciones','🔌 Integraciones'],['notas','📝 Notas']].map(([k,l]) => (
                  <button key={k} type="button" className={`btn btn-sm ${empresaDetailTab===k?'btn-primary':'btn-secondary'}`} onClick={() => setEmpresaDetailTab(k)}>{l}</button>
                ))}
              </div>

              {detailLoading ? (
                <div style={{textAlign:'center',padding:40}}><div className="spinner" style={{margin:'0 auto'}}/></div>
              ) : (
                <>
                  {/* ═══ Tab Info ═══ */}
                  {empresaDetailTab === 'info' && (
                    <div style={{display:'flex',flexDirection:'column',gap:12}}>
                      <div className="fr">
                        <div style={{flex:1}}><label className="" style={{display:'block',marginBottom:4}}>Nombre</label><input value={empresaDetail.nombre||''} disabled style={{width:'100%',opacity:.7}}/></div>
                        <div style={{flex:1}}><label className="" style={{display:'block',marginBottom:4}}>Código</label><input value={empresaDetail.codigo||''} disabled style={{width:'100%',opacity:.7,fontFamily:'monospace'}}/></div>
                      </div>
                      <div className="fr">
                        <div style={{flex:1}}><label className="" style={{display:'block',marginBottom:4}}>Plan</label><input value={empresaDetail.plan_id||'—'} disabled style={{width:'100%',opacity:.7}}/></div>
                        <div style={{flex:1}}><label className="" style={{display:'block',marginBottom:4}}>Vencimiento</label><input value={empresaDetail.vencimiento||'—'} disabled style={{width:'100%',opacity:.7,color:empresaDetail.vencimiento&&empresaDetail.vencimiento<new Date().toISOString().substr(0,10)?'var(--bad)':'inherit'}}/></div>
                      </div>
                      <div className="fr">
                        <div style={{flex:1}}>
                          <label className="" style={{display:'block',marginBottom:4}}>Email admin</label>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <input value={empresaDetail.admin_email||''} disabled style={{flex:1,opacity:.7}}/>
                            {empresaDetail.email_verificado === 1
                              ? <span className="badge badge-green" style={{fontSize:11,whiteSpace:'nowrap'}}>✅ Verificado</span>
                              : (
                                <>
                                  <span className="badge badge-red" style={{fontSize:11,whiteSpace:'nowrap'}}>❌ Pendiente</span>
                                  {empresaDetail.admin_email && (
                                    <button type="button" className="btn btn-secondary btn-sm" style={{fontSize:10,padding:'2px 8px'}}
                                      onClick={async () => {
                                        try { await saApi('POST', '/empresas/' + empresaDetail.codigo + '/resend-verification'); alert('✅ Email de verificación reenviado'); }
                                        catch(e) { alert(e.message) }
                                      }}>Reenviar</button>
                                  )}
                                  <button type="button" className="btn btn-secondary btn-sm" style={{fontSize:10,padding:'2px 8px',color:'var(--ok)'}}
                                    onClick={async () => {
                                      if (!confirm('¿Marcar email como verificado manualmente?')) return;
                                      try {
                                        await saApi('POST', '/empresas/' + empresaDetail.codigo + '/mark-verified');
                                        const updated = await saApi('GET', '/empresas/' + empresaDetail.codigo);
                                        setEmpresaDetail(updated);
                                      } catch(e) { alert(e.message) }
                                    }}>Marcar verificado</button>
                                </>
                              )}
                          </div>
                        </div>
                        <div style={{flex:1}}><label className="" style={{display:'block',marginBottom:4}}>Estado</label><span className={`badge ${empresaDetail.activo?'badge-green':'badge-red'}`} style={{fontSize:12}}>{empresaDetail.activo?'Activo':'Suspendido'}</span></div>
                      </div>
                      <div style={{padding:'10px 12px',background:'var(--sf)',borderRadius:8,border:'1px solid var(--bd)'}}>
                        <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Estadísticas</div>
                        <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
                          <span>👥 <strong>{empresaDetail.usuarios?.length||empresaDetail.usuarios||'?'}</strong> usuarios</span>
                          <span>🛒 <strong>{empresaDetail.ventas||'?'}</strong> ventas</span>
                          <span>👤 <strong>{empresaDetail.clientes||'?'}</strong> clientes</span>
                          <span>🏪 <strong>{empresaDetail.sucursales?.length||empresaDetail.sucursales||'?'}</strong> sucursales</span>
                        </div>
                      </div>
                      {empresaDetail.config?.modulos_habilitados?.length > 0 && (
                        <div style={{padding:'10px 12px',background:'var(--sf)',borderRadius:8,border:'1px solid var(--bd)'}}>
                          <div style={{fontWeight:600,fontSize:13,marginBottom:6}}>Módulos habilitados</div>
                          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                            {empresaDetail.config.modulos_habilitados.map(m => (
                              <span key={m} className="badge badge-orange" style={{fontSize:10}}>{MOD_LABELS[m]||m}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{fontSize:11,color:'var(--mu)'}}>Creado: {empresaDetail.creado ? new Date(empresaDetail.creado).toLocaleString('es-AR') : '—'}</div>
                    </div>
                  )}

                  {/* ═══ Tab Pagos ═══ */}
                  {empresaDetailTab === 'pagos' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: 'var(--mu)' }}>{detailPagos.length} pago(s) registrados</div>
                        <button type="button" className="btn btn-primary btn-sm"
                          onClick={() => {
                            const planActual = empresaDetail.plan_id || ''
                            setManualPagoForm({ plan_id: planActual, monto: '', origen: 'manual_efectivo', notas: '' })
                            setManualPagoModal(true)
                          }}>
                          + Registrar pago manual
                        </button>
                      </div>
                      {detailPagos.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--mu)' }}>Sin pagos registrados para esta empresa.</div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table>
                            <thead><tr><th>Fecha</th><th>Plan</th><th>Tipo</th><th>Origen</th><th>Monto</th><th>Estado</th><th>Comprobante</th><th></th></tr></thead>
                            <tbody>
                              {detailPagos.map(p => {
                                const EST = { approved: ['✅', 'badge-green'], pending: ['⏳', 'badge-yellow'], rejected: ['❌', 'badge-red'], cancelled: ['🚫', 'badge-gray'], refunded: ['↩️', 'badge-gray'] }
                                const [icon, cls] = EST[p.estado] || [p.estado, 'badge-gray']
                                return (
                                  <tr key={p.id} style={{ fontSize: 12 }}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{p.creado ? new Date(p.creado).toLocaleDateString('es-AR') : '—'}</td>
                                    <td>{p.plan_nombre || p.plan_id}</td>
                                    <td><span className="badge badge-blue" style={{ fontSize: 9 }}>{p.tipo}</span></td>
                                    <td style={{ fontSize: 11, color: 'var(--mu)' }}>{p.origen === 'manual_efectivo' ? '💵 Efectivo' : p.origen === 'manual_transferencia' ? '🏦 Transferencia' : '💳 MP'}</td>
                                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{p.monto != null ? '$' + Number(p.monto).toLocaleString('es-AR') : '—'}</td>
                                    <td><span className={`badge ${cls}`} style={{ fontSize: 10 }}>{icon} {p.estado}</span></td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{p.comprobante_num || '—'}</td>
                                    <td>
                                      {p.estado === 'approved' && (
                                        <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 10 }} title="Regenerar comprobante" onClick={() => reenviarComprobante(p.id)}>📄</button>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Modal pago manual */}
                      {manualPagoModal && (
                        <div className="modal-overlay" onClick={() => setManualPagoModal(false)}>
                          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                            <div className="modal-header"><h3>💵 Registrar pago manual</h3><button type="button" onClick={() => setManualPagoModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--mu)' }}>×</button></div>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div>
                                <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Plan a aplicar</label>
                                <select value={manualPagoForm.plan_id} onChange={e => setManualPagoForm(p => ({ ...p, plan_id: e.target.value }))} style={{ width: '100%' }}>
                                  {planes.map(pl => <option key={pl.id} value={pl.id}>{pl.nombre} (${pl.precio || 0}{pl.periodo === 'anual' ? '/año' : '/mes'})</option>)}
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Monto cobrado</label>
                                <input type="number" min="0" step="0.01" value={manualPagoForm.monto} onChange={e => setManualPagoForm(p => ({ ...p, monto: e.target.value }))} placeholder={'Sugerido: ' + ((planes.find(x => x.id === manualPagoForm.plan_id) || {}).precio || '')} style={{ width: '100%' }} />
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Medio de cobro</label>
                                <select value={manualPagoForm.origen} onChange={e => setManualPagoForm(p => ({ ...p, origen: e.target.value }))} style={{ width: '100%' }}>
                                  <option value="manual_efectivo">💵 Efectivo</option>
                                  <option value="manual_transferencia">🏦 Transferencia bancaria</option>
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--mu)' }}>Notas (opcional)</label>
                                <textarea value={manualPagoForm.notas} onChange={e => setManualPagoForm(p => ({ ...p, notas: e.target.value }))} rows={2} style={{ width: '100%', resize: 'vertical' }} placeholder="Ej: transferencia HSBC, nº operación..." />
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--mu)', padding: '8px 10px', background: 'var(--sf)', borderRadius: 6 }}>
                                Al registrar: se extiende el vencimiento, se actualiza el plan, se genera comprobante PDF y se envía email al cliente.
                              </div>
                            </div>
                            <div className="modal-footer">
                              <button type="button" className="btn btn-secondary" onClick={() => setManualPagoModal(false)}>Cancelar</button>
                              <button type="button" className="btn btn-primary" onClick={registrarPagoManual} disabled={manualPagoSaving}>{manualPagoSaving ? '⏳ Registrando...' : '💾 Registrar pago'}</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ Tab Vencimientos ═══ */}
                  {empresaDetailTab === 'vencimientos' && (
                    <div>
                      {detailVencimientos?.empresa && (
                        <div style={{ padding: '10px 14px', background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)', marginBottom: 14, fontSize: 13, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span>📅 <strong>Vencimiento actual:</strong> {detailVencimientos.empresa.vencimiento_actual ? new Date(detailVencimientos.empresa.vencimiento_actual).toLocaleDateString('es-AR') : '—'}</span>
                          <span>📦 <strong>Plan:</strong> {detailVencimientos.empresa.plan_id || '—'}</span>
                        </div>
                      )}
                      {(detailVencimientos?.eventos || []).length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--mu)' }}>Sin historial de pagos ni cambios de vencimiento.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {detailVencimientos.eventos.map((ev, i) => (
                            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 10px', borderLeft: ev.tipo === 'pago' ? '3px solid var(--ok)' : '3px solid var(--ac2)', background: 'var(--sf)', borderRadius: 6 }}>
                              <span style={{ fontSize: 14, flexShrink: 0 }}>{ev.tipo === 'pago' ? '💳' : '📋'}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.detalle || ev.accion || '—'}</div>
                                <div style={{ fontSize: 10, color: 'var(--mu)' }}>
                                  {ev.fecha ? new Date(ev.fecha).toLocaleString('es-AR') : '—'}
                                  {ev.comprobante && <span style={{ marginLeft: 8, fontFamily: 'monospace' }}>CP: {ev.comprobante}</span>}
                                  {ev.accion && <span className="badge badge-gray" style={{ marginLeft: 8, fontSize: 9 }}>{ev.accion}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ Tab Auditoría ═══ */}
                  {empresaDetailTab === 'audit' && (
                    <div>
                      <input value={detailAuditSearch} onChange={e => setDetailAuditSearch(e.target.value)} placeholder="🔍 Buscar en auditoría..." style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid var(--bd)',marginBottom:12,fontSize:13}} />
                      {detailAudit.length === 0 ? (
                        <div style={{textAlign:'center',padding:24,color:'var(--mu)'}}>Sin registros de auditoría para esta empresa.</div>
                      ) : (
                        <div style={{overflowX:'auto',maxHeight:400,overflowY:'auto'}}>
                          <table>
                            <thead><tr><th>Fecha</th><th>Acción</th><th>Detalle</th></tr></thead>
                            <tbody>
                              {detailAudit.filter(a => !detailAuditSearch || (a.accion||'').toLowerCase().includes(detailAuditSearch.toLowerCase()) || (a.detalle||'').toLowerCase().includes(detailAuditSearch.toLowerCase())).map(a => (
                                <tr key={a.id} style={{fontSize:12}}>
                                  <td style={{whiteSpace:'nowrap'}} data-label="Fecha">{a.fecha ? new Date(a.fecha).toLocaleString('es-AR') : '—'}</td>
                                  <td data-label="Acción"><span className="badge" style={{fontSize:10,background:'var(--sf)',color:'var(--tx)'}}>{a.accion||'—'}</span></td>
                                  <td style={{color:'var(--mu)',maxWidth:300,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={a.detalle} data-label="Detalle">{(()=>{try{const d=JSON.parse(a.detalle);return d.msg||d}catch{return a.detalle||'—'}})()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ Tab Apps ═══ */}
                  {empresaDetailTab === 'apps' && (
                    <div>
                      {detailApps.length === 0 ? (
                        <div style={{textAlign:'center',padding:24,color:'var(--mu)'}}>Sin apps instaladas en esta empresa.</div>
                      ) : (
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          {detailApps.map(app => (
                            <div key={app.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:8,border:'1px solid var(--bd)',background:'var(--sf)'}}>
                              <span style={{fontSize:20}}>{app.app_icono||'📦'}</span>
                              <div style={{flex:1}}>
                                <div style={{fontWeight:600,fontSize:13}}>{app.app_nombre||app.app_slug}</div>
                                <div style={{fontSize:11,color:'var(--mu)'}}>v{app.version_instalada||'—'} · {new Date(app.fecha_instalacion).toLocaleDateString('es-AR')}</div>
                              </div>
                              <span className={`badge ${app.activa?'badge-green':'badge-gray'}`} style={{fontSize:10}}>{app.activa?'Activa':'Pausada'}</span>
                              <button type="button" className="btn btn-sm btn-secondary" onClick={() => toggleDetailApp(app)} title={app.activa?'Pausar':'Activar'} style={{fontSize:11}}>
                                {app.activa ? '⏸️' : '▶️'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ Tab Integraciones ═══ */}
                  {empresaDetailTab === 'integraciones' && (
                    <div>
                      {!empresaDetail?.integraciones?.todos_providers?.length ? (
                        <div style={{textAlign:'center',padding:24,color:'var(--mu)'}}>No hay providers de integración configurados en el sistema.</div>
                      ) : (
                        <div style={{display:'flex',flexDirection:'column',gap:10}}>
                          <div style={{display:'flex',gap:4,marginBottom:4}}>
                            <button type="button" className="btn btn-sm btn-accent" style={{fontSize:11}}
                              onClick={async () => {
                                try {
                                  await saApi('POST','/empresas/'+empresaDetail.codigo+'/integraciones/batch',{
                                    providers: empresaDetail.integraciones.todos_providers.map(p=>({provider:p.provider,habilitado:p.en_plan}))
                                  });
                                  const u = await saApi('GET','/empresas/'+empresaDetail.codigo);
                                  setEmpresaDetail(u);
                                } catch(err) { alert(err.message) }
                              }}>
                              ⚡ Activar integraciones del plan
                            </button>
                          </div>
                          {empresaDetail.integraciones.todos_providers.map(p => {
                            const estado = empresaDetail.integraciones.estados?.[p.provider] || {};
                            const icons = {arca:'📄',mercadolibre:'🛒',tiendanube:'🛍️'};
                            const names = {arca:'ARCA / AFIP',mercadolibre:'MercadoLibre',tiendanube:'Tiendanube'};
                            return (
                              <div key={p.provider} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:8,border:'1px solid var(--bd)',background:'var(--sf)',opacity:p.habilitado?1:.6}}>
                                <span style={{fontSize:20}}>{p.icono||icons[p.provider]||'🔌'}</span>
                                <div style={{flex:1}}>
                                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                                    <span style={{fontWeight:600,fontSize:13}}>{p.nombre||names[p.provider]||p.provider}</span>
                                    {p.en_plan && <span className="badge badge-blue" style={{fontSize:9}}>Plan</span>}
                                    {p.habilitado && (
                                      <span style={{fontSize:10,color:estado.status==='connected'?'var(--ok)':estado.status==='error'?'var(--bad)':'var(--mu)'}}>
                                        {estado.status==='connected'?'🟢':estado.status==='error'?'🔴':'⚪'}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{fontSize:10,color:'var(--mu)'}}>
                                    {estado.external_account_id ? estado.external_account_id+' · ' : ''}
                                    {estado.last_sync ? 'Sync: '+new Date(estado.last_sync).toLocaleDateString('es-AR') : ''}
          </div>

        </div>
                                <label style={{cursor:'pointer'}}>
                                  <input type="checkbox" checked={p.habilitado}
                                    onChange={async () => {
                                      try {
                                        await saApi('POST','/empresas/'+empresaDetail.codigo+'/integraciones',{provider:p.provider,habilitado:!p.habilitado});
                                        const u = await saApi('GET','/empresas/'+empresaDetail.codigo);
                                        setEmpresaDetail(u);
                                      } catch(err) { alert(err.message) }
                                    }} />
                                </label>
                              </div>
                            );
                          })}
                          <button type="button" className="btn btn-sm btn-secondary" style={{fontSize:11,marginTop:4}}
                            onClick={async () => {
                              try {
                                const logs = await saApi('GET','/empresas/'+empresaDetail.codigo+'/integraciones/logs?limit=50');
                                alert(logs.map(l=>'['+new Date(l.created_at).toLocaleString('es-AR')+'] '+l.provider+' · '+l.tipo+' · '+l.status+' · '+(l.mensaje||'')).join('\n')||'Sin logs.');
                              } catch(err) { alert('Error: '+err.message) }
                            }}>
                            📋 Ver logs de integración
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ Tab Notas ═══ */}
                  {empresaDetailTab === 'notas' && (
                    <div>
                      <div style={{display:'flex',gap:8,marginBottom:12}}>
                        <textarea value={notaForm.texto} onChange={e => setNotaForm(p=>({...p,texto:e.target.value}))} placeholder="Escribí una nota interna..." style={{flex:1,minHeight:60,padding:'8px 12px',borderRadius:8,border:'1px solid var(--bd)',fontSize:13,resize:'vertical'}} />
                        <button type="button" className="btn btn-primary" onClick={agregarNota} disabled={notaSaving||!notaForm.texto.trim()} style={{alignSelf:'flex-end'}}>
                          {notaSaving ? '⏳' : '💾 Agregar'}
                        </button>
                      </div>
                      {detailNotas.length === 0 ? (
                        <div style={{textAlign:'center',padding:24,color:'var(--mu)'}}>Sin notas internas.</div>
                      ) : (
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          {detailNotas.map(n => (
                            <div key={n.id} style={{padding:'10px 12px',borderRadius:8,border:'1px solid var(--bd)',background:'var(--sf)'}}>
                              <div style={{fontSize:12,color:'var(--mu)',marginBottom:4}}>{new Date(n.fecha).toLocaleString('es-AR')} · {n.autor||'—'}</div>
                              <div style={{fontSize:13,whiteSpace:'pre-wrap'}}>{n.texto}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
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
                <div style={{ flex:0.6 }}><label className="" style={{ display:'block',marginBottom:4 }}>Orden</label><input type="number" value={planForm.orden} onChange={e => setPlanForm(p => ({ ...p, orden: e.target.value }))} min="0" placeholder="99" style={S.input} /></div>
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

      {/* Modal: Atributo Rubro */}
      {atributoModal && (
        <div className="modal-overlay" onClick={() => setAtributoModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal-header"><h3>{atributoModal === 'new' ? 'Nuevo atributo' : 'Editar atributo'}</h3><button type="button" onClick={() => setAtributoModal(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fr">
                <div style={{ flex:1 }}><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>Rubro</label><select value={atributoForm.rubro} onChange={e => setAtributoForm(p => ({ ...p, rubro: e.target.value }))} style={S.select}>{RUBROS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select></div>
                <div style={{ flex:1 }}><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>Tipo</label><select value={atributoForm.tipo} onChange={e => setAtributoForm(p => ({ ...p, tipo: e.target.value }))} style={S.select}><option value="text">Texto</option><option value="number">Número</option><option value="select">Selector</option></select></div>
              </div>
              <div className="fr">
                <div style={{ flex:1 }}><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>Key *</label><input value={atributoForm.atributo_key} onChange={e => setAtributoForm(p => ({ ...p, atributo_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'') }))} placeholder="ej: sabor" style={{...S.input, fontFamily:'monospace'}} /></div>
                <div style={{ flex:1 }}><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>Label *</label><input value={atributoForm.atributo_label} onChange={e => setAtributoForm(p => ({ ...p, atributo_label: e.target.value }))} placeholder="ej: Sabor" style={S.input} /></div>
              </div>
              {atributoForm.tipo === 'select' && (
                <div><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>Opciones (separadas por coma)</label><input value={atributoForm.opciones} onChange={e => setAtributoForm(p => ({ ...p, opciones: e.target.value }))} placeholder="ej: Vainilla, Chocolate, Frutilla" style={S.input} /></div>
              )}
              <div><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>Orden</label><input type="number" value={atributoForm.orden} onChange={e => setAtributoForm(p => ({ ...p, orden: e.target.value }))} min="0" style={{...S.input, width:100}} /></div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setAtributoModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={saveAtributo} disabled={atributoSaving}>{atributoSaving ? '⏳' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Mantenimiento */}
      {mtModal && (
        <div className="modal-overlay" onClick={() => setMtModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header"><h3>{mtModal === 'new' ? '+ Nuevo item' : 'Editar item'}</h3><button type="button" onClick={() => setMtModal(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fr">
                <div style={{ flex:1 }}><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>Tipo</label><select value={mtForm.tipo} onChange={e => setMtForm(p => ({...p,tipo:e.target.value}))} style={S.select}>
                  <option value="dominio">🌐 Dominio</option>
                  <option value="servidor">🖥️ Servidor</option>
                  <option value="api">🔌 API / Token</option>
                  <option value="certificado">🔒 Certificado SSL</option>
                  <option value="otro">📌 Otro</option>
                </select></div>
                <div style={{ flex:1 }}><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>Nombre *</label><input value={mtForm.nombre} onChange={e => setMtForm(p => ({...p,nombre:e.target.value}))} placeholder="Ej: flexcrm.com.ar" style={S.input} /></div>
              </div>
              <div><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>Descripción</label><input value={mtForm.descripcion} onChange={e => setMtForm(p => ({...p,descripcion:e.target.value}))} placeholder="Detalle del item..." style={S.input} /></div>
              <div className="fr">
                <div style={{ flex:1 }}><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>Fecha vencimiento</label><input type="date" value={mtForm.fecha_vencimiento} onChange={e => setMtForm(p => ({...p,fecha_vencimiento:e.target.value}))} style={S.input} /></div>
                <div style={{ flex:1 }}><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>Proveedor</label><input value={mtForm.proveedor} onChange={e => setMtForm(p => ({...p,proveedor:e.target.value}))} placeholder="Ej: Cloudflare, Fly.io" style={S.input} /></div>
              </div>
              <div className="fr">
                <div style={{ flex:1 }}><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>URL</label><input value={mtForm.url} onChange={e => setMtForm(p => ({...p,url:e.target.value}))} placeholder="https://..." style={S.input} /></div>
              </div>
              <div><label style={{ display:'block',marginBottom:4,fontSize:11,fontWeight:600 }}>Notas</label><textarea value={mtForm.notas} onChange={e => setMtForm(p => ({...p,notas:e.target.value}))} rows={2} style={{...S.textarea, width:'100%'}} /></div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setMtModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={saveMt} disabled={mtSaving}>{mtSaving ? '⏳' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: App */}
      {appModal && (
        <div className="modal-overlay" onClick={() => setAppModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 550 }}>
            <div className="modal-header"><h3>{appModal === 'new' ? 'Nueva app' : 'Editar app: ' + appModal.slug}</h3><button type="button" onClick={() => setAppModal(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--mu)'}}>×</button></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Slug *</label><input value={appForm.slug} onChange={e => setAppForm(p => ({ ...p, slug: e.target.value }))} placeholder="mi-app" disabled={appModal !== 'new'} style={{...S.input, fontFamily:'monospace'}} /></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Nombre *</label><input value={appForm.nombre} onChange={e => setAppForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Mi App" style={S.input} /></div>
                <div style={{ width:100 }}><label className="" style={{ display:'block',marginBottom:4 }}>Versión</label><input value={appForm.version} onChange={e => setAppForm(p => ({ ...p, version: e.target.value }))} style={S.input} /></div>
              </div>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Categoría</label><select value={appForm.categoria} onChange={e => setAppForm(p => ({ ...p, categoria: e.target.value }))} style={S.select}>{APP_CATS.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}</select></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Icono</label><input value={appForm.icono} onChange={e => setAppForm(p => ({ ...p, icono: e.target.value }))} placeholder="📦" style={S.input} /></div>
              </div>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Precio mensual ($)</label><input type="number" value={appForm.precio_mensual} onChange={e => setAppForm(p => ({ ...p, precio_mensual: e.target.value }))} min="0" placeholder="0" style={S.input} /></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Precio anual ($)</label><input type="number" value={appForm.precio_anual} onChange={e => setAppForm(p => ({ ...p, precio_anual: e.target.value }))} min="0" placeholder="0" style={S.input} /></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Trial (días)</label><input type="number" value={appForm.trial_dias} onChange={e => setAppForm(p => ({ ...p, trial_dias: e.target.value }))} min="0" style={S.input} /></div>
              </div>
              <div><label className="" style={{ display:'block',marginBottom:4 }}>Descripción corta</label><input value={appForm.descripcion} onChange={e => setAppForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Descripción breve..." style={S.input} /></div>
              <div><label className="" style={{ display:'block',marginBottom:4 }}>Descripción larga (markdown)</label><textarea value={appForm.descripcion_larga} onChange={e => setAppForm(p => ({ ...p, descripcion_larga: e.target.value }))} rows={3} style={S.textarea} /></div>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Módulos requeridos (coma)</label><input value={appForm.modulos_requeridos} onChange={e => setAppForm(p => ({ ...p, modulos_requeridos: e.target.value }))} placeholder="productos, ventas" style={S.input} /></div>
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Roles permitidos (coma)</label><input value={appForm.roles_permitidos} onChange={e => setAppForm(p => ({ ...p, roles_permitidos: e.target.value }))} placeholder="admin, supervisor" style={S.input} /></div>
              </div>
              <div className="fr">
                <div style={{ flex:1 }}><label className="" style={{ display:'block',marginBottom:4 }}>Tags (coma)</label><input value={appForm.tags} onChange={e => setAppForm(p => ({ ...p, tags: e.target.value }))} placeholder="costos, finanzas" style={S.input} /></div>
                <div style={{ display:'flex',alignItems:'center',gap:8 }}><label className="" style={{ display:'flex',alignItems:'center',gap:6,cursor:'pointer' }}><input type="checkbox" checked={appForm.activa} onChange={e => setAppForm(p => ({ ...p, activa: e.target.checked }))} /> Activa</label></div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setAppModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={saveApp} disabled={appSaving}>{appSaving ? '⏳ Guardando...' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
