import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { useAuth, useToast } from '../store'
import { PageHeader, Field, Loader } from '../components/UI'

const ROLE_LABELS = { admin: 'Admin', supervisor: 'Supervisor', cajero: 'Cajero', vendedor: 'Vendedor', readonly: 'Solo lectura' }

export function MiCuenta() {
  const { api } = useApi()
  const { toast } = useToast()
  const { me } = useAuth()

  const [form, setForm] = useState({ password_actual: '', password_nuevo: '', password_repetir: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteSent, setDeleteSent] = useState(false)

  async function cambiarPass() {
    if (!form.password_actual || !form.password_nuevo) return toast('Completá todos los campos', 'err')
    if (form.password_nuevo.length < 6) return toast('Mínimo 6 caracteres', 'err')
    if (form.password_nuevo !== form.password_repetir) return toast('Las contraseñas nuevas no coinciden', 'err')
    setSaving(true)
    try {
      await api('POST', '/auth/cambiar-password', { password_actual: form.password_actual, password_nuevo: form.password_nuevo })
      toast('Contraseña cambiada correctamente', 'ok')
      setForm({ password_actual: '', password_nuevo: '', password_repetir: '' })
    } catch (e) { toast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function solicitarEliminacion() {
    if (!window.confirm('⚠️ ¿Estás seguro? Esta acción no se puede deshacer.\n\nSe enviará una solicitud al administrador quien procesará la eliminación definitiva de tu cuenta y todos sus datos.')) return
    setDeleting(true)
    try {
      await api('POST', '/auth/solicitar-eliminacion', { motivo: '' })
      setDeleteSent(true)
      toast('Solicitud de eliminación enviada. El administrador la procesará a la brevedad.', 'ok')
    } catch (e) { toast(e.message, 'err') }
    finally { setDeleting(false) }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader title="👤 Mi Cuenta" subtitle="Administrá tus datos de acceso" />

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Mis datos</div>
        <div className="fr">
          <Field label="Nombre"><input value={me?.nombre || ''} disabled style={{ opacity: .7 }} /></Field>
          <Field label="Usuario"><input value={me?.usuario || ''} disabled style={{ opacity: .7 }} /></Field>
        </div>
        <div className="fr">
          <Field label="Email"><input value={me?.email || ''} disabled style={{ opacity: .7 }} /></Field>
          <Field label="Rol"><input value={ROLE_LABELS[me?.rol] || me?.rol || ''} disabled style={{ opacity: .7 }} /></Field>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Cambiar contraseña</div>
        <Field label="Contraseña actual">
          <input type="password" value={form.password_actual} onChange={e => setForm(p => ({ ...p, password_actual: e.target.value }))} placeholder="••••••••" />
        </Field>
        <Field label="Nueva contraseña">
          <input type="password" value={form.password_nuevo} onChange={e => setForm(p => ({ ...p, password_nuevo: e.target.value }))} placeholder="Mín. 6 caracteres" minLength={6} />
        </Field>
        <Field label="Repetir nueva contraseña">
          <input type="password" value={form.password_repetir} onChange={e => setForm(p => ({ ...p, password_repetir: e.target.value }))} placeholder="Confirmar" />
        </Field>
        <button type="button" className="btn btn-primary" onClick={cambiarPass} disabled={saving} style={{ marginTop: 8 }}>
          {saving ? '⏳ Cambiando...' : 'Cambiar contraseña'}
        </button>
      </div>

      <div className="card" style={{ borderColor: 'rgba(239,68,68,.3)' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--bad)' }}>Zona peligrosa</div>
        {deleteSent ? (
          <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,.1)', border: '1px solid var(--warn)', borderRadius: 8, fontSize: 13 }}>
            ⏳ Solicitud de eliminación enviada. El administrador la procesará a la brevedad. Te contactaremos por email.
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--mu)', marginBottom: 12 }}>
              Solicitar la eliminación permanente de tu cuenta y todos sus datos. Esta acción requiere confirmación del administrador.
            </p>
            <button type="button" className="btn btn-danger" onClick={solicitarEliminacion} disabled={deleting}
              style={{ background: 'var(--bad)', color: '#fff', border: 'none' }}>
              {deleting ? '⏳ Enviando...' : '🗑️ Solicitar eliminación de mi cuenta'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
