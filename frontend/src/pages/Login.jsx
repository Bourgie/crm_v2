import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth, useApp, useToast } from '../store'

export function Login() {
  const [form, setForm] = useState({ usuario: '', password: '', empresa: '' })
  const [sucs, setSucs] = useState(null)  // null = not shown, [] = loading
  const [loginData, setLoginData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { setToken, setMe } = useAuth()
  const { setSucs: setAppSucs, setProds, setClis, setSucSesion, setModulos, setRubro, setCfg } = useApp()
  const { toast } = useToast()
  const navigate = useNavigate()

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

      // Load sucursales
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

      // Clear any stale suc_id from a previous session/empresa
      const storedSuc = localStorage.getItem('crm_suc')
      const storedValid = storedSuc && permitidas.some(s => s.id === storedSuc)
      if (storedSuc && !storedValid) localStorage.removeItem('crm_suc')

      if (permitidas.length === 1) {
        await completarLogin(data, permitidas[0].id, allSucsLogin)
      } else {
        setLoginData({ data, allSucs: allSucsLogin })
        setSucs(permitidas)
      }
    } catch (err) {
      setError(err.message || 'Error de conexión')
    } finally {
      setLoading(false)
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

    // Load config, modules and initial data
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

  // Sucursal picker screen
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
              <button key={s.id} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '14px 16px' }} onClick={() => selectSuc(s.id)} disabled={loading}>
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
            <input type="password" value={form.password} onChange={set('password')} placeholder="Tu contraseña" required autoComplete="current-password" />
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
