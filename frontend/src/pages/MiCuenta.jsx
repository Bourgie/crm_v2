import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi'
import { useAuth, useToast } from '../store'
import { PageHeader, Field, Loader } from '../components/UI'

const ROLE_LABELS = { admin: 'Admin', supervisor: 'Supervisor', cajero: 'Cajero', vendedor: 'Vendedor', readonly: 'Solo lectura' }

export function MiCuenta() {
  const { api } = useApi()
  const { toast } = useToast()
  const { me, token } = useAuth()

  const [form, setForm] = useState({ password_actual: '', password_nuevo: '', password_repetir: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteSent, setDeleteSent] = useState(false)
  const [consentData, setConsentData] = useState(null)
  const [exportando, setExportando] = useState(false)
  const [firmando, setFirmando] = useState(false)

  useEffect(() => {
    reloadConsent()
  }, [])

  async function reloadConsent() {
    try {
      const data = await api('GET', '/user-data/mis-consentimientos')
      setConsentData(data)
    } catch (e) {
      toast('No se pudieron cargar los consentimientos: ' + e.message, 'err')
    }
  }

  async function exportarDatos() {
    setExportando(true)
    try {
      const r = await fetch('/api/user-data/mis-datos/exportar', {
        headers: { Authorization: 'Bearer ' + token },
      })
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'mis-datos.json'; a.click()
      URL.revokeObjectURL(url)
      toast('Datos exportados', 'ok')
    } catch (e) { toast(e.message, 'err') }
    finally { setExportando(false) }
  }

  async function handleFirmar() {
    setFirmando(true)
    try {
      const r = await api('POST', '/auth/firmar-terminos')
      toast(r.mensaje || 'Documentos firmados correctamente.', 'ok')
      await reloadConsent()
    } catch (e) { toast(e.message, 'err') }
    finally { setFirmando(false) }
  }

  async function cambiarPass() {
    if (!form.password_actual || !form.password_nuevo) return toast('Completá todos los campos', 'err')
    if (form.password_nuevo.length < 8) return toast('Mínimo 8 caracteres', 'err')
    if (!/[A-Z]/.test(form.password_nuevo)) return toast('Debe contener al menos una mayúscula', 'err')
    if (!/[0-9]/.test(form.password_nuevo)) return toast('Debe contener al menos un número', 'err')
    if (!/[^A-Za-z0-9]/.test(form.password_nuevo)) return toast('Debe contener al menos un símbolo', 'err')
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
          <input type="password" value={form.password_nuevo} onChange={e => setForm(p => ({ ...p, password_nuevo: e.target.value }))} placeholder="Mín. 8 caracteres, mayúscula, número y símbolo" minLength={8} />
        </Field>
        <Field label="Repetir nueva contraseña">
          <input type="password" value={form.password_repetir} onChange={e => setForm(p => ({ ...p, password_repetir: e.target.value }))} placeholder="Confirmar" />
        </Field>
        <button type="button" className="btn btn-primary" onClick={cambiarPass} disabled={saving} style={{ marginTop: 8 }}>
          {saving ? '⏳ Cambiando...' : 'Cambiar contraseña'}
        </button>
      </div>

      {me?.rol === 'admin' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>📋 Documentos Legales Vigentes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              📄 <a href="/terminos-y-condiciones" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)' }}>Términos y Condiciones v1.0</a>
            </div>
            <div>
              📄 <a href="/politica-de-privacidad" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)' }}>Política de Privacidad v1.0</a>
            </div>
            <div>
              📄 <a href="/politica-de-cookies" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)' }}>Política de Cookies v1.0</a>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>📝 Consentimientos</div>
        {consentData && consentData.isAdmin && consentData.grace_days > 0 && (
          <div style={{ fontSize: 12, padding: '8px 12px', background: 'rgba(245,158,11,.08)', borderRadius: 8, marginBottom: 12, color: 'var(--warn)' }}>
            ⏰ Tenés <strong>{consentData.grace_days} día(s)</strong> para aceptar los documentos legales. Después se bloqueará el acceso.
          </div>
        )}
        {consentData && consentData.consentimientos && consentData.consentimientos.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {consentData.consentimientos
              .filter(c => !c.tipo.startsWith('pospuesto-'))
              .map((c, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--mu)', padding: '6px 0', borderBottom: '1px solid var(--bd)' }}>
                  ✓ {c.tipo === 'terminos' ? 'Términos y Condiciones' : c.tipo === 'privacidad' ? 'Política de Privacidad' : c.tipo} v{c.version} — {new Date(c.creado).toLocaleDateString('es-AR')} — IP: {c.ip || '—'}
                </div>
              ))}
            {me?.rol !== 'admin' && (
              <p style={{ fontSize: 11, color: 'var(--mu)', marginTop: 4 }}>
                Tu administrador aceptó estos documentos en nombre de la empresa.
              </p>
            )}
          </div>
        ) : (
          !consentData?.isAdmin && (
            <div style={{ fontSize: 12, color: 'var(--mu)', padding: '8px 0' }}>
              Tu empresa aún no aceptó los documentos legales.
            </div>
          )
        )}
        {consentData && consentData.isAdmin && consentData.pendientes && consentData.pendientes.length > 0 && (
          <div style={{ marginTop: (consentData.consentimientos?.length > 0) ? 8 : 0 }}>
            <p style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 600, marginBottom: 8 }}>
              ⚠️ Documentos pendientes de firma:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              {consentData.pendientes.map((p, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--warn)', padding: '4px 0' }}>
                  ⚠️ {p.tipo === 'terminos' ? 'Términos y Condiciones' : p.tipo === 'privacidad' ? 'Política de Privacidad' : p.tipo} v{p.version} — pendiente
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              <a href="/terminos-y-condiciones" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)', fontSize: 12 }}>
                📄 Términos y Condiciones
              </a>
              <a href="/politica-de-privacidad" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)', fontSize: 12 }}>
                📄 Política de Privacidad
              </a>
              <a href="/politica-de-cookies" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)', fontSize: 12 }}>
                📄 Política de Cookies
              </a>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleFirmar} disabled={firmando}
              style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700 }}>
              {firmando ? '⌛ Firmando...' : '✍️ Firmar documentos ahora'}
            </button>
          </div>
        )}
        {consentData && consentData.isAdmin && (!consentData.consentimientos || consentData.consentimientos.length === 0) && (!consentData.pendientes || consentData.pendientes.length === 0) && (
          <div style={{ fontSize: 12, padding: '8px 0' }}>
            <p style={{ color: 'var(--warn)', marginBottom: 8 }}>
              ⚠️ Tu empresa aún no firmó los documentos legales.
            </p>
            <p style={{ color: 'var(--mu)', marginBottom: 8 }}>
              Revisalos y firmá para cumplir con los requisitos legales:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              <a href="/terminos-y-condiciones" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)', fontSize: 12 }}>
                📄 Términos y Condiciones
              </a>
              <a href="/politica-de-privacidad" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)', fontSize: 12 }}>
                📄 Política de Privacidad
              </a>
              <a href="/politica-de-cookies" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)', fontSize: 12 }}>
                📄 Política de Cookies
              </a>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleFirmar} disabled={firmando}
              style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700 }}>
              {firmando ? '⌛ Firmando...' : '✍️ Firmar documentos ahora'}
            </button>
          </div>
        )}
        {me?.rol === 'admin' && consentData?.consentimientos?.length > 0 && (!consentData.pendientes || consentData.pendientes.length === 0) && (
          <p style={{ fontSize: 11, color: 'var(--mu)', marginTop: 4 }}>
            Como administrador, aceptaste estos documentos en nombre de tu empresa.
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>📦 Tus Datos</div>
        <p style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 12 }}>
          De acuerdo a la Ley 25.326, tenés derecho a acceder, rectificar, cancelar y oponerte al tratamiento de tus datos personales.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportarDatos} disabled={exportando}>
            {exportando ? '⏳ Exportando...' : '📥 Exportar mis datos'}
          </button>
          {!deleteSent && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={solicitarEliminacion} disabled={deleting}
              style={{ background: 'rgba(239,68,68,.08)', color: 'var(--bad)' }}>
              {deleting ? '⏳ Solicitando...' : '🗑️ Solicitar baja'}
            </button>
          )}
        </div>
        {deleteSent && (
          <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(99,102,241,.06)', borderRadius: 8, fontSize: 12 }}>
            ✓ Solicitud de baja enviada. El administrador la procesará a la brevedad.
          </div>
        )}
        <p style={{ fontSize: 11, color: 'var(--mu)', marginTop: 12 }}>
          Para más información, consultá nuestra{' '}
          <a href="/politica-de-privacidad" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)' }}>Política de Privacidad</a>.
        </p>
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
