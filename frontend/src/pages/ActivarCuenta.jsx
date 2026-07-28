import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { PasswordInput } from '../components/PasswordInput'

export function ActivarCuenta() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const token = searchParams.get('token') || ''
  const empresa = searchParams.get('empresa') || ''

  const [step, setStep] = useState('loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [acepta, setAcepta] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token || !empresa) {
      setStep('expired')
      return
    }
    fetch(`/api/auth/activar-cuenta/verify?token=${encodeURIComponent(token)}&empresa=${encodeURIComponent(empresa)}`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) {
          if (r.status === 410 || r.status === 400) setStep('expired')
          else setStep('expired')
          return
        }
        setEmail(data.email || '')
        setStep('form')
      })
      .catch(() => setStep('expired'))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (!acepta) {
      setError('Debés aceptar los términos y condiciones')
      return
    }
    setLoading(true)
    try {
      const r = await fetch('/api/auth/activar-cuenta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          empresa,
          password,
          acepta_terminos: true,
          acepta_privacidad: true,
          ip: '',
          userAgent: navigator.userAgent || '',
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Error al activar la cuenta')
      setStep('success')
      setTimeout(() => navigate('/app/login', { replace: true }), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (step === 'loading') {
    return (
      <div style={styles.centered}>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <p style={{ color: 'var(--mu)', fontSize: 14 }}>Verificando enlace de activación...</p>
        </div>
      </div>
    )
  }

  if (step === 'expired') {
    return (
      <div style={styles.centered}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Enlace inválido o expirado</h2>
          <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 20 }}>
            El enlace de activación no es válido o ya expiró. Solicitá uno nuevo a tu administrador.
          </p>
          <a href="/app/login" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '10px 24px', textDecoration: 'none', color: '#fff' }}>
            Ir al inicio de sesión
          </a>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div style={styles.centered}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>¡Cuenta activada!</h2>
          <p style={{ color: 'var(--mu)', fontSize: 14 }}>Redirigiendo al inicio de sesión...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.centered}>
      <div className="card" style={{ textAlign: 'left' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            Flex<span style={{ color: 'var(--ac)' }}>CRM</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 12, marginBottom: 4 }}>Activá tu cuenta</h2>
          <p style={{ color: 'var(--mu)', fontSize: 13 }}>
            Completá tus datos para activar tu usuario
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={styles.label}>Email</label>
            <input type="email" value={email} disabled style={{ width: '100%', opacity: 0.7 }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={styles.label}>Contraseña *</label>
            <PasswordInput value={password} onChange={e => setPassword(e.target.value)} placeholder="Mín. 8 caracteres" style={{ width: '100%' }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={styles.label}>Confirmar contraseña *</label>
            <PasswordInput value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repetí la contraseña" style={{ width: '100%' }} />
          </div>

          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <input
              type="checkbox"
              id="acepta-terminos"
              checked={acepta}
              onChange={e => setAcepta(e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <label htmlFor="acepta-terminos" style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.5 }}>
              Acepto los{' '}
              <a href="/terminos" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)', fontWeight: 600 }}>Términos y Condiciones</a>
              {' '}y la{' '}
              <a href="/privacidad" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)', fontWeight: 600 }}>Política de Privacidad</a>
            </label>
          </div>

          {error && (
            <div style={{ color: 'var(--bad)', fontSize: 12, marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,.06)', borderRadius: 8 }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12 }} disabled={loading}>
            {loading ? '⏳ Activando...' : 'Activar cuenta'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--mu)' }}>
          <a href="/app/login" style={{ color: 'var(--ac)' }}>← Volver al inicio de sesión</a>
        </p>
      </div>
    </div>
  )
}

const styles = {
  centered: {
    maxWidth: 420,
    margin: '60px auto',
    padding: '0 16px',
    textAlign: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    color: 'var(--mu)',
    marginBottom: 4,
    display: 'block',
  },
}
