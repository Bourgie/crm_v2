import { useState, useEffect } from 'react'
import { PasswordInput } from '../components/PasswordInput'

export function Signup() {
  const [form, setForm] = useState({ empresa_nombre: '', email: '', password: '', rubro: 'general', nombre_dueno: '', apellido_dueno: '', telefono: '', ciudad: '', como_conociste: '' })
  const [planSel, setPlanSel] = useState(() => new URLSearchParams(window.location.search).get('plan') || '')
  const [planes, setPlanes] = useState([])
  const [mpEnabled, setMpEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [aceptaTerminos, setAceptaTerminos] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  const set = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }))

  useEffect(() => {
    fetch('/api/billing/mp/config-public').then(r => r.json()).then(d => setMpEnabled(!!d.enabled)).catch(() => {})
    fetch('/api/billing/mp/planes').then(r => r.json()).then(p => {
      const filtrados = Array.isArray(p) ? p.filter(x => x.id !== 'plan_trial' && !x.id.endsWith('_anual')) : []
      setPlanes(filtrados)
      const urlPlan = new URLSearchParams(window.location.search).get('plan')
      if (urlPlan && filtrados.some(x => x.id === urlPlan)) setPlanSel(urlPlan)
    }).catch(() => {})
  }, [])

  async function handleResend() {
    setResending(true); setError('')
    try {
      const r = await fetch('/api/auth/verify-email/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim() }),
      })
      const data = await r.json()
      if (r.ok) setResent(true)
      else setError(data.error || 'Error al reenviar')
    } catch (e) { setError('Error de conexión') }
    finally { setResending(false) }
  }

  async function handleSignup() {
    setError(''); setSuccess('')
    if (!aceptaTerminos) { setError('Debés aceptar los términos y la política de privacidad'); return }
    if (!form.empresa_nombre.trim() || !form.email.trim() || !form.password) {
      setError('Todos los campos son obligatorios'); return
    }
    if (form.password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    if (!/[A-Z]/.test(form.password)) { setError('Debe contener al menos una mayúscula'); return }
    if (!/[0-9]/.test(form.password)) { setError('Debe contener al menos un número'); return }
    if (!/[^A-Za-z0-9]/.test(form.password)) { setError('Debe contener al menos un símbolo'); return }

    // Si el plan requiere pago y MP está habilitado → Checkout Pro (no crear cuenta directo)
    const planPrecio = (planes.find(p => p.id === planSel) || {}).precio
    const requierePago = mpEnabled && planSel && planPrecio > 0
    setLoading(true)
    try {
      if (requierePago) {
        const r = await fetch('/api/billing/mp/create-preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, plan_id: planSel, tipo: 'signup' }),
        })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Error al iniciar el pago')
        if (data.init_point) { window.location.href = data.init_point; return }
      }
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, acepta_terminos: true, acepta_privacidad: true }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Error al crear la cuenta')
      setSuccess(true)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  if (success) {
    return (
      <div style={{ maxWidth: 'min(440px, 94vw)', margin: '60px auto', textAlign: 'center', padding: '0 12px' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>📧</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>¡Revisá tu email!</h2>
        <p style={{ color: 'var(--mu)', fontSize: 14, marginBottom: 4 }}>Enviamos un link de verificación a</p>
        <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>{form.email}</p>
        <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
          Abrí el mail y hacé clic en <strong>"Verificar email y empezar"</strong> para activar tu cuenta.
        </p>
        {!resent ? (
          <div>
            <p style={{ color: 'var(--mu)', fontSize: 12, marginBottom: 8 }}>¿No te llegó? Revisá spam o reenvialo:</p>
            <button type="button" className="btn btn-secondary" style={{ padding: '10px 24px' }} onClick={handleResend} disabled={resending}>
              {resending ? '⏳ Reenviando...' : '📤 Reenviar email de verificación'}
            </button>
          </div>
        ) : (
          <p style={{ color: 'var(--ok)', fontSize: 13, marginTop: 8 }}>✅ Email reenviado. Revisá tu bandeja de entrada.</p>
        )}
        {error && <p style={{ color: 'var(--bad)', fontSize: 12, marginTop: 16 }}>{error}</p>}
        <p style={{ marginTop: 32, fontSize: 13, color: 'var(--mu)' }}>
          <a href="/app/login" style={{ color: 'var(--ac)', fontWeight: 600 }}>Ir al inicio de sesión</a>
        </p>
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
        {planes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Plan</label>
            <select value={planSel} onChange={e => setPlanSel(e.target.value)} style={{ width: '100%' }}>
              <option value="">🆓 Prueba gratis — 14 días</option>
              {planes.map(pl => <option key={pl.id} value={pl.id}>📦 {pl.nombre} — ${pl.precio}{pl.periodo === 'anual' ? '/año' : '/mes'}</option>)}
            </select>
            {mpEnabled && planSel && (planes.find(p => p.id === planSel) || {}).precio > 0 && (
              <div style={{ fontSize: 11, color: 'var(--ok)', marginTop: 4, padding: '8px 10px', background: 'rgba(34,197,94,.06)', borderRadius: 6 }}>
                💳 Serás redirigido a MercadoPago para completar el pago. Tu cuenta se activará automáticamente al confirmar.
              </div>
            )}
          </div>
        )}
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
        <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Nombre dueño</label>
            <input value={form.nombre_dueno} onChange={set('nombre_dueno')} placeholder="Opcional" style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Apellido dueño</label>
            <input value={form.apellido_dueno} onChange={set('apellido_dueno')} placeholder="Opcional" style={{ width: '100%' }} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Teléfono / WhatsApp</label>
          <input type="tel" value={form.telefono} onChange={set('telefono')} placeholder="+54 9 11 1234-5678" style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>Ciudad</label>
            <input value={form.ciudad} onChange={set('ciudad')} placeholder="Opcional" style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 4, display: 'block' }}>¿Cómo nos conociste?</label>
            <select value={form.como_conociste} onChange={set('como_conociste')} style={{ width: '100%' }}>
              <option value="">—</option>
              <option value="google">🔍 Google</option>
              <option value="instagram">📸 Instagram</option>
              <option value="recomendacion">💬 Recomendación</option>
              <option value="facebook">📘 Facebook</option>
              <option value="otro">📌 Otro</option>
            </select>
          </div>
        </div>
        {error && <div style={{ color: 'var(--bad)', fontSize: 12, marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,.06)', borderRadius: 8 }}>{error}</div>}
        <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={handleSignup} disabled={loading}>
          {loading ? '⏳ Procesando...' : (() => {
            const pr = (planes.find(p => p.id === planSel) || {}).precio
            return mpEnabled && planSel && pr > 0 ? `💳 Pagar y crear cuenta — $${pr}` : '🚀 Comenzar prueba gratis'
          })()}
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
