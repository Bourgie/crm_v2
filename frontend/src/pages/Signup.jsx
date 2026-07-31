import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store'
import { PasswordInput } from '../components/PasswordInput'

export function Signup() {
  const navigate = useNavigate()
  const { setMe } = useAuth()
  const [form, setForm] = useState({ empresa_nombre: '', email: '', password: '', rubro: 'general' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [aceptaTerminos, setAceptaTerminos] = useState(false)

  const set = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }))

  async function handleSignup() {
    setError(''); setSuccess('')
    if (!aceptaTerminos) { setError('Debés aceptar los términos y la política de privacidad'); return }
    if (!form.empresa_nombre.trim() || !form.email.trim() || !form.password) {
      setError('Todos los campos son obligatorios'); return
    }
    if (form.password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, acepta_terminos: true, acepta_privacidad: true }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Error al crear la cuenta')
      setMe({ nombre: data.nombre, empresa: data.empresa, rol: 'admin' })
      setSuccess(data.mensaje || 'Cuenta creada')
      setTimeout(() => navigate('/app/dashboard', { replace: true }), 1500)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  if (success) {
    return (
      <div style={{ maxWidth: 'min(420px, 94vw)', margin: '80px auto', textAlign: 'center', padding: '0 12px' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🚀</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>¡Cuenta creada!</h2>
        <p style={{ color: 'var(--ok)', fontSize: 14, marginBottom: 20 }}>{success}</p>
        <p style={{ color: 'var(--mu)', fontSize: 13 }}>Redirigiendo al panel...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 'min(420px, 94vw)', margin: '60px auto', textAlign: 'center', padding: '0 12px' }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🚀</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Creá tu cuenta gratis</h2>
      <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 24 }}>14 días de prueba. Sin tarjeta.</p>

      <div className="card" style={{ textAlign: 'left' }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Nombre de tu negocio *</label>
          <input value={form.empresa_nombre} onChange={set('empresa_nombre')} placeholder="Ej: Mi Tienda" style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Tu email *</label>
          <input type="email" value={form.email} onChange={set('email')} placeholder="tu@email.com" style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Contraseña *</label>
          <PasswordInput value={form.password} onChange={set('password')} placeholder="Mín. 8 caracteres" style={{ width: '100%' }} onKeyDown={e => e.key === 'Enter' && handleSignup()} />
          <input type="text" name="website" value={form.website||''} onChange={set('website')} style={{ display:'none' }} tabIndex={-1} autoComplete="off" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Rubro (opcional)</label>
          <select value={form.rubro} onChange={set('rubro')} style={{ width: '100%' }}>
            <option value="general">🏪 General</option>
            <option value="indumentaria">👗 Indumentaria</option>
            <option value="ropa_infantil">👶 Ropa infantil</option>
            <option value="panaderia">🍞 Panadería</option>
            <option value="ferreteria">🔧 Ferretería</option>
            <option value="farmacia">💊 Farmacia</option>
            <option value="calzado">👟 Calzado</option>
            <option value="restaurant">🍽️ Restaurant</option>
            <option value="otro">📌 Otro</option>
          </select>
        </div>
        {error && <div style={{ color: 'var(--bad)', fontSize: 12, marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,.06)', borderRadius: 8 }}>{error}</div>}
        <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={handleSignup} disabled={loading}>
          {loading ? '⏳ Creando cuenta...' : '🚀 Comenzar prueba gratis'}
        </button>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--tx)', lineHeight: 1.5 }}>
            <input type="checkbox" checked={aceptaTerminos} onChange={e => setAceptaTerminos(e.target.checked)}
              style={{ marginTop: 2, cursor: 'pointer' }} />
            <span>
              Soy mayor de 18 años y acepto los{' '}
              <a href="/terminos-y-condiciones" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)', fontWeight: 600 }}>Términos y Condiciones</a>
              {' '}y la{' '}
              <a href="/politica-de-privacidad" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)', fontWeight: 600 }}>Política de Privacidad</a>.
            </span>
          </label>
        </div>
        <p style={{ fontSize: 11, color: 'var(--mu)', textAlign: 'center', marginTop: 10 }}>
          Sin compromiso. 14 días gratis.
        </p>
      </div>

      <p style={{ marginTop: 16, fontSize: 13, color: 'var(--mu)' }}>
        ¿Ya tenés cuenta? <a href="/app/login" style={{ color: 'var(--ac)', fontWeight: 600 }}>Iniciar sesión</a>
      </p>
    </div>
  )
}
