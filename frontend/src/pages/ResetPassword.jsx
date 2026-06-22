import { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'

export function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''
  const empresa = searchParams.get('empresa') || 'default'

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    if (password.length < 6) { setError('Mínimo 6 caracteres'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, empresa }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Error'); return }
      setDone(true)
    } catch (err) { setError(err.message || 'Error de conexión') }
    finally { setLoading(false) }
  }

  if (!token) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h2 style={{ textAlign: 'center' }}>Enlace inválido</h2>
          <p style={{ textAlign: 'center', color: 'var(--mu)', margin: '16px 0' }}>
            Este enlace no es válido. Solicitá uno nuevo.
          </p>
          <Link to="/app/forgot-password" className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }}>
            Solicitar enlace
          </Link>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 16 }}>✅</div>
          <h2 style={{ textAlign: 'center', marginBottom: 8 }}>Contraseña actualizada</h2>
          <p style={{ textAlign: 'center', color: 'var(--mu)', marginBottom: 20 }}>
            Ya podés iniciar sesión con tu nueva contraseña.
          </p>
          <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/app/login')}>
            Ir al inicio →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.logo}>Flex<span style={{ color: 'var(--ac)' }}>CRM</span></div>
        <h2 style={{ marginBottom: 4 }}>Nueva contraseña</h2>
        <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 24 }}>
          Elegí una nueva contraseña para tu cuenta.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="fg">
            <label>Nueva contraseña *</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required autoFocus />
          </div>
          <div className="fg">
            <label>Confirmar contraseña *</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repetí la contraseña" required />
          </div>
          {error && (
            <div style={{ background: '#fee2e2', color: 'var(--bad)', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
              ⚠️ {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Guardando...' : 'Cambiar contraseña →'}
          </button>
        </form>
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
