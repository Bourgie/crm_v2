import { useState } from 'react'
import { Link } from 'react-router-dom'

export function ForgotPassword() {
  const [form, setForm] = useState({ usuario: '', empresa: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const r = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: form.usuario.trim(), empresa: form.empresa.trim() || 'default' }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Error'); return }
      setSent(true)
    } catch (err) { setError(err.message || 'Error de conexión') }
    finally { setLoading(false) }
  }

  if (sent) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 16 }}>📬</div>
          <h2 style={{ textAlign: 'center', marginBottom: 8 }}>Revisá tu email</h2>
          <p style={{ textAlign: 'center', color: 'var(--mu)', fontSize: 14, marginBottom: 20 }}>
            Si el usuario existe, recibirás un enlace para restablecer tu contraseña.
          </p>
          <Link to="/app/login" className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }}>
            ← Volver al inicio
          </Link>
        </div>
      </div>
    )
  }

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }))

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.logo}>Flex<span style={{ color: 'var(--ac)' }}>CRM</span></div>
        <h2 style={{ marginBottom: 4 }}>Restablecer contraseña</h2>
        <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 24 }}>
          Ingresá tu usuario o email. Te enviaremos un enlace.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="fg">
            <label>Empresa</label>
            <input value={form.empresa} onChange={set('empresa')} placeholder="Código de empresa" />
          </div>
          <div className="fg">
            <label>Usuario o email *</label>
            <input value={form.usuario} onChange={set('usuario')} placeholder="Tu usuario registrado" required />
          </div>
          {error && (
            <div style={{ background: '#fee2e2', color: 'var(--bad)', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
              ⚠️ {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar enlace →'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--mu)' }}>
          <Link to="/app/login" style={{ color: 'var(--ac)' }}>← Volver al inicio</Link>
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
    width: '100%', maxWidth: 'min(400px, 92vw)', boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--bd)',
  },
  logo: { fontSize: 24, fontWeight: 800, marginBottom: 20, textAlign: 'center' },
}
