import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth, useApp, useToast } from '../store'
import { PasswordInput } from '../components/PasswordInput'
import { ConsentModal } from '../components/ConsentModal'

function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64)
    return JSON.parse(json)
  } catch { return null }
}

export function Login() {
  const [form, setForm] = useState({ usuario: '', password: '', empresa: '' })
  const [sucs, setSucs] = useState(null)
  const [loginData, setLoginData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [twofaStep, setTwofaStep] = useState(null)
  const [twofaCode, setTwofaCode] = useState('')
  const [twofaMode, setTwofaMode] = useState('totp')
  const [consentStep, setConsentStep] = useState(null)

  const { setToken, setMe } = useAuth()
  const { setSucs: setAppSucs, setProds, setClis, setSucSesion, setModulos, setRubro, setCfg } = useApp()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Pre-fill empresa code from ?e= query param
  useEffect(() => {
    const codigo = searchParams.get('e')
    if (codigo) setForm(f => ({ ...f, empresa: codigo }))
  }, [searchParams])

  // Auto-login via token (verification or superadmin login-as)
  useEffect(() => {
    const verified = searchParams.get('verified');
    const token = searchParams.get('token')
    if (verified === 'ok') toast('Email verificado. Bienvenido!', 'ok');
    if (verified === 'invalid') toast('Link de verificacion invalido', 'err');
    if (verified === 'expired') toast('Link de verificacion expirado. Solicita uno nuevo.', 'err');
    if (!token) return
    const payload = parseJwt(token)
    if (!payload || !payload.empresa) {
      setError('Token inválido')
      return
    }
    setLoading(true)
    fetch('/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Error al validar token')
        await proceedWithLogin(data, payload.empresa)
      })
      .catch((err) => setError(err.message || 'Error al ingresar con el token'))
      .finally(() => setLoading(false))
  }, [searchParams])

  async function handleLogin(e) {
    e.preventDefault()
    setError(''); setLoading(true)

    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario: form.usuario.trim(),
          password: form.password,
          empresa: form.empresa.trim() || 'default',
        }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Error al iniciar sesión'); return }

      // 2FA required
      if (data.require_2fa) {
        setTwofaStep({ temp_token: data.temp_token, empresa: form.empresa.trim() || 'default', nombre: data.user?.nombre })
        return
      }

      // Consent required
      if (data.require_consent) {
        setConsentStep({
          temp_token: data.temp_token,
          versiones: data.versiones,
          empresa_nombre: data.empresa_nombre || (form.empresa.trim() || 'default'),
          user: data.user
        })
        return
      }

      if (data.consent_pending) {
        setError(data.error || 'Tu empresa no aceptó los términos. Contactá al administrador.')
        return
      }

      await proceedWithLogin(data, form.empresa.trim() || 'default')
    } catch (err) {
      setError(err.message || 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  async function handleTwofaSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const r = await fetch('/api/auth/2fa/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          temp_token: twofaStep.temp_token,
          code: twofaCode.trim(),
          empresa: twofaStep.empresa,
        }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Código inválido'); return }
      await proceedWithLogin(data, twofaStep.empresa)
    } catch (err) {
      setError(err.message || 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  async function handleConsentAccept({ tempToken, aceptaciones }) {
    setError(''); setLoading(true)
    try {
      const r = await fetch('/api/auth/aceptar-terminos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: consentStep.temp_token, aceptaciones }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Error'); return }
      await proceedWithLogin(data, consentStep.user?.empresa || form.empresa.trim() || 'default')
    } catch (err) {
      setError(err.message || 'Error de conexión')
    } finally {
      setLoading(false); setConsentStep(null)
    }
  }

  function handleConsentReject() {
    setConsentStep(null)
    setError('Si no aceptás los términos no podrás usar FlexCRM.')
  }

  async function proceedWithLogin(data, empresa) {
    const sucR = await fetch('/api/sucursales', {
      headers: { Authorization: 'Bearer ' + data.token },
    })
    const sucData = await sucR.json().catch(() => [])
    const allSucsLogin = Array.isArray(sucData) ? sucData : (sucData.data || [])

    const permisos = data.user.suc_sesiones_permitidas
    const permitidas = Array.isArray(permisos) && permisos.length
      ? allSucsLogin.filter((s) => permisos.includes(s.id))
      : allSucsLogin

    if (permitidas.length === 0) {
      setError('No tenés sucursales asignadas')
      return
    }

    const storedSuc = localStorage.getItem('crm_suc')
    const storedValid = storedSuc && permitidas.some(s => s.id === storedSuc)
    if (storedSuc && !storedValid) localStorage.removeItem('crm_suc')

    if (permitidas.length === 1) {
      await completarLogin(data, permitidas[0].id, allSucsLogin)
    } else {
      setLoginData({ data, allSucs: allSucsLogin })
      setSucs(permitidas)
    }
  }

  async function selectSuc(sucId) {
    if (!loginData) return
    setLoading(true)
    await completarLogin(loginData.data, sucId, loginData.allSucs)
    setLoading(false)
  }

  async function completarLogin(data, sucId, allSucsLogin) {
    setToken(data.token)
    setMe({ ...data.user, suc_id: sucId, suc_sesion: sucId })
    setSucSesion(sucId)
    setAppSucs(allSucsLogin)

    try {
      const headers = { Authorization: 'Bearer ' + data.token }

      const [cfgR, prodsR, clisR] = await Promise.all([
        fetch('/api/config', { headers }).then((r) => r.json()).catch(() => ({})),
        fetch('/api/productos', { headers }).then((r) => r.json()).catch(() => []),
        fetch('/api/clientes', { headers }).then((r) => r.json()).catch(() => []),
      ])

      setCfg(cfgR)
      if (cfgR.modulos_habilitados) {
        try {
          setModulos(typeof cfgR.modulos_habilitados === 'string'
            ? JSON.parse(cfgR.modulos_habilitados)
            : cfgR.modulos_habilitados)
        } catch { setModulos(null) }
      }
      if (cfgR.rubro) setRubro(cfgR.rubro)
      setProds(Array.isArray(prodsR) ? prodsR : [])
      setClis(Array.isArray(clisR) ? clisR : [])
    } catch { /* non-fatal */ }

    toast('¡Bienvenido/a, ' + data.user.nombre + '!', 'ok')
    navigate('/app/dashboard')
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  if (twofaStep) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.logo}>Flex<span style={{ color: 'var(--ac)' }}>CRM</span></div>
          <h2 style={{ marginBottom: 4 }}>Verificación en dos pasos</h2>
          <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 24 }}>
            {twofaStep.nombre ? `Hola ${twofaStep.nombre}, ` : ''}ingresá el código de tu app de autenticación.
          </p>
          <form onSubmit={handleTwofaSubmit}>
            <div className="fg">
              <label>Código de 6 dígitos</label>
              <input
                value={twofaCode} onChange={e => setTwofaCode(e.target.value)}
                placeholder="000000" required
                maxLength={6} inputMode="numeric"
                style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8, fontFamily: 'monospace' }}
              />
            </div>
            {twofaMode === 'backup' && (
              <p style={{ fontSize: 12, color: 'var(--mu)', marginTop: 8 }}>
                Ingresá uno de tus códigos de respaldo de 8 caracteres.
              </p>
            )}
            {error && (
              <div style={{ background: '#fee2e2', color: 'var(--bad)', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14, marginTop: 10 }}>
                ⚠️ {error}
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} disabled={loading || twofaCode.length < 6}>
              {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Verificando...</> : 'Verificar →'}
            </button>
            <p style={{ textAlign: 'center', marginTop: 12, fontSize: 12 }}>
              <button type="button" onClick={() => { setTwofaMode(m => m === 'backup' ? 'totp' : 'backup'); setTwofaCode(''); setError('') }}
                style={{ background: 'none', border: 'none', color: 'var(--ac)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
                {twofaMode === 'backup' ? '← Usar código de autenticador' : 'Usar código de respaldo'}
              </button>
            </p>
          </form>
        </div>
      </div>
    )
  }

  if (consentStep) {
    return (
      <ConsentModal
        onAccept={handleConsentAccept}
        onReject={handleConsentReject}
        versiones={consentStep.versiones}
        tempToken={consentStep.temp_token}
        empresaNombre={consentStep.empresa_nombre}
      />
    )
  }

  if (sucs) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.logo}>Flex<span style={{ color: 'var(--ac)' }}>CRM</span></div>
          <h2 style={{ marginBottom: 6 }}>Seleccioná tu sucursal</h2>
          <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 20 }}>
            Bienvenido/a, {loginData?.data?.user?.nombre}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sucs.map((s) => (
              <button type="button" key={s.id} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '14px 16px' }} onClick={() => selectSuc(s.id)} disabled={loading}>
                <span>🏪</span> {s.nombre}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.logo}>Flex<span style={{ color: 'var(--ac)' }}>CRM</span></div>
        <h2 style={{ marginBottom: 4 }}>Iniciar sesión</h2>
        <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 24 }}>Ingresá tus datos para continuar</p>

        <form onSubmit={handleLogin}>
          <div className="fg">
            <label>Empresa</label>
            <input value={form.empresa} onChange={set('empresa')} placeholder="Código de empresa (vacío = default)" autoComplete="organization" />
          </div>
          <div className="fg">
            <label>Usuario *</label>
            <input value={form.usuario} onChange={set('usuario')} placeholder="Tu usuario" required autoComplete="username" />
          </div>
          <div className="fg">
            <label>Contraseña *</label>
            <PasswordInput value={form.password} onChange={set('password')} placeholder="Tu contraseña" style={{ width: '100%' }} />
          </div>

          {error && (
            <div style={{ background: '#fee2e2', color: 'var(--bad)', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
              ⚠️ {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Ingresando...</> : 'Ingresar →'}
          </button>

          <p style={{ textAlign: 'center', marginTop: 12, fontSize: 12 }}>
            <Link to="/app/forgot-password" style={{ color: 'var(--mu)' }}>¿Olvidaste tu contraseña?</Link>
          </p>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--mu)', borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
          <a href="/terminos-y-condiciones" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--mu)', textDecoration: 'underline' }}>Términos</a>
          {' · '}
          <a href="/politica-de-privacidad" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--mu)', textDecoration: 'underline' }}>Privacidad</a>
          {' · '}
          <a href="/politica-de-cookies" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--mu)', textDecoration: 'underline' }}>Cookies</a>
        </p>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--mu)' }}>
          <a href="/landing.html" style={{ color: 'var(--ac)' }}>← Volver al inicio</a>
        </p>
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--sf)', padding: 16,
  },
  card: {
    background: 'var(--bg)', borderRadius: 16, padding: '36px 32px',
    width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--bd)',
  },
  logo: { fontSize: 24, fontWeight: 800, marginBottom: 20, textAlign: 'center' },
}


