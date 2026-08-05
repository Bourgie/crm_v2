import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useToast, useAuth, useApp } from '../store'
import QRCode from 'qrcode'

export function Setup2FA() {
  const { api } = useApi()
  const { toast } = useToast()
  const { setMe } = useAuth()
  const { setSucs: setAppSucs, setProds, setClis, setSucSesion, setModulos, setRubro, setCfg } = useApp()
  const qrRef = useRef(null)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const forced = searchParams.get('forced') === '1'
  const forcedTempToken = searchParams.get('temp_token') || ''
  const forcedEmpresa = searchParams.get('empresa') || ''

  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('status')
  const [secret, setSecret] = useState(null)
  const [otpauth, setOtpauth] = useState(null)
  const [code, setCode] = useState('')
  const [backupCodes, setBackupCodes] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (forced) {
      setLoading(false)
      return
    }
    api('GET', '/auth/2fa/status').then(d => {
      setStatus({ enabled: d.enabled, obligatorio: d.obligatorio })
    }).catch(() => setStatus({ enabled: false, obligatorio: false })).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (step === 'verify' && otpauth && qrRef.current) {
      QRCode.toCanvas(qrRef.current, otpauth, { width: 200, margin: 2 }, (err) => {
        if (err) console.error('QR error:', err)
      })
    }
  }, [step, otpauth])

  async function handleSetup() {
    setSaving(true); setError('')
    try {
      let d
      if (forced) {
        const r = await fetch('/api/auth/2fa/setup-forced', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ temp_token: forcedTempToken }),
        })
        d = await r.json()
        if (!r.ok) throw new Error(d.error)
      } else {
        d = await api('POST', '/auth/2fa/setup')
      }
      setSecret(d.secret)
      setOtpauth(d.otpauth)
      setStep('verify')
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleConfirm() {
    if (code.length < 6) { setError('Ingresá el código de 6 dígitos'); return }
    setSaving(true); setError('')
    try {
      let d
      if (forced) {
        const r = await fetch('/api/auth/2fa/confirm-login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ temp_token: forcedTempToken, code }),
        })
        d = await r.json()
        if (!r.ok) throw new Error(d.error)
      } else {
        d = await api('POST', '/auth/2fa/confirm', { code })
      }
      setBackupCodes(d.backup_codes)
      if (!forced) {
        setStep('backup')
        setStatus({ enabled: true, obligatorio: status?.obligatorio })
        toast('2FA activado correctamente', 'ok')
      }
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleForcedDone() {
    setSaving(true)
    try {
      const [sucR, cfgR, prodsR, clisR] = await Promise.all([
        fetch('/api/sucursales', { credentials: 'include' }).then(r => r.json()).catch(() => []),
        fetch('/api/config', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
        fetch('/api/productos', { credentials: 'include' }).then(r => r.json()).catch(() => []),
        fetch('/api/clientes', { credentials: 'include' }).then(r => r.json()).catch(() => []),
      ])
      const allSucs = Array.isArray(sucR) ? sucR : (sucR.data || [])
      const suc = allSucs.find(s => s.activo !== false && s.activo !== 0) || allSucs[0]

      setAppSucs(allSucs)
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
      if (suc) { setMe(p => ({ ...p, suc_id: suc.id, suc_sesion: suc.id })); setSucSesion(suc.id) }
      toast('¡2FA configurado! Bienvenido/a', 'ok')
      navigate('/app/dashboard', { replace: true })
    } catch (e) {
      setError('Error al completar el inicio de sesión. Intentá de nuevo.')
    }
    finally { setSaving(false) }
  }

  async function handleDisable() {
    if (status?.obligatorio) {
      toast('El 2FA es obligatorio en esta empresa. Contactá al administrador.', 'err')
      return
    }
    if (!window.confirm('¿Deshabilitar 2FA? Esto reduce la seguridad de tu cuenta.')) return
    setSaving(true); setError('')
    try {
      await api('POST', '/auth/2fa/disable', {})
      setStatus({ enabled: false, obligatorio: status?.obligatorio })
      setStep('status')
      toast('2FA deshabilitado', 'ok')
    } catch (e) {
      const pwd = window.prompt('Ingresá tu contraseña para deshabilitar 2FA:')
      if (!pwd) return
      try {
        await api('POST', '/auth/2fa/disable', { password: pwd })
        setStatus({ enabled: false, obligatorio: status?.obligatorio })
        setStep('status')
        toast('2FA deshabilitado', 'ok')
      } catch (e2) { setError(e2.message) }
    }
    finally { setSaving(false) }
  }

  async function regenerateBackup() {
    if (!window.confirm('Esto invalida todos tus códigos de respaldo actuales. ¿Continuar?')) return
    setSaving(true)
    try {
      const d = await api('POST', '/auth/2fa/backup-codes')
      setBackupCodes(d.backup_codes)
      toast('Nuevos códigos generados', 'ok')
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  // Forced mode: show backup codes and continue button
  if (forced && step === 'backup' && backupCodes) {
    return (
      <div style={styles.wrap}>
        <div className="card" style={{ maxWidth: 480 }}>
          <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>🔐</div>
          <h3 style={{ textAlign: 'center', marginBottom: 8 }}>¡2FA activado!</h3>
          <p style={{ color: 'var(--mu)', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
            Guardá estos códigos de respaldo en un lugar seguro. Cada código solo se puede usar una vez.
          </p>
          <div style={{ background: 'var(--sf)', borderRadius: 8, padding: 16, border: '1px solid var(--bd)', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.5px' }}>
              Códigos de respaldo (10)
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {backupCodes.map((c, i) => (
                <div key={c} style={{ background: '#0f172a', padding: '6px 10px', borderRadius: 6, textAlign: 'center', color: '#e2e8f0' }}>
                  {c.match(/.{1,4}/g).join('-')}
                </div>
              ))}
            </div>
          </div>
          <button type="button" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => { navigator.clipboard?.writeText(backupCodes.join('\n')); toast('Códigos copiados', 'ok') }}>
            📋 Copiar todos
          </button>
          <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            onClick={handleForcedDone} disabled={saving}>
            {saving ? 'Entrando...' : '✅ Ya los guardé — Entrar'}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'backup' && backupCodes) {
    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>🔐</div>
        <h3 style={{ textAlign: 'center', marginBottom: 8 }}>¡2FA activado!</h3>
        <p style={{ color: 'var(--mu)', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
          Guardá estos códigos de respaldo en un lugar seguro. Cada código solo se puede usar una vez.
        </p>
        <div style={{ background: 'var(--sf)', borderRadius: 8, padding: 16, border: '1px solid var(--bd)', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.5px' }}>
            Códigos de respaldo (10)
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {backupCodes.map((c, i) => (
              <div key={c} style={{ background: '#0f172a', padding: '6px 10px', borderRadius: 6, textAlign: 'center', color: '#e2e8f0' }}>
                {c.match(/.{1,4}/g).join('-')}
              </div>
            ))}
          </div>
        </div>
        <button type="button" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => { navigator.clipboard?.writeText(backupCodes.join('\n')); toast('Códigos copiados', 'ok') }}>
          📋 Copiar todos
        </button>
        <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={() => { setBackupCodes(null); setStep('done') }}>
          ✅ Ya los guardé
        </button>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="card" style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h3 style={{ marginBottom: 8 }}>Todo listo</h3>
        <p style={{ color: 'var(--mu)', fontSize: 13 }}>
          La autenticación en dos pasos está activa. La próxima vez que inicies sesión, te pedirá un código de tu app de autenticación.
        </p>
        <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => { setStep('status'); setStatus({ ...status, enabled: true }) }}>
          Volver
        </button>
      </div>
    )
  }

  if (step === 'verify' && otpauth) {
    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <h3 style={{ marginBottom: 4 }}>Escaneá el código QR</h3>
        <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 20 }}>
          Usá Google Authenticator, Authy o cualquier app compatible.
        </p>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ display: 'inline-block', background: '#fff', padding: 16, borderRadius: 12 }}>
            <canvas ref={qrRef} />
          </div>
        </div>
        <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 4 }}>O ingresá esta clave manualmente:</div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, wordBreak: 'break-all' }}>{secret}</div>
        </div>
        <div className="fg">
          <label>Código de verificación</label>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="000000"
            maxLength={6} inputMode="numeric"
            style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8, fontFamily: 'monospace' }}
          />
        </div>
        {error && <div style={{ color: 'var(--bad)', fontSize: 12, margin: '8px 0' }}>⚠️ {error}</div>}
        <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
          onClick={handleConfirm} disabled={saving || code.length < 6}>
          {saving ? 'Verificando...' : 'Verificar y activar →'}
        </button>
      </div>
    )
  }

  // Forced status — always show setup button
  if (forced) {
    return (
      <div style={styles.wrap}>
        <div className="card" style={{ maxWidth: 480 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 32 }}>🔐</div>
            <div>
              <h3 style={{ margin: 0 }}>Autenticación en dos pasos requerida</h3>
              <p style={{ color: 'var(--mu)', fontSize: 13, margin: '4px 0 0' }}>
                Tu empresa requiere 2FA para acceder. Configuralo ahora para continuar.
              </p>
            </div>
          </div>
          <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--mu)' }}>
              Necesitás una app de autenticación como <strong>Google Authenticator</strong>, <strong>Authy</strong> o <strong>Microsoft Authenticator</strong> en tu teléfono.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleSetup} disabled={saving}>
            {saving ? 'Preparando...' : 'Configurar 2FA →'}
          </button>
          {error && <div style={{ color: 'var(--bad)', fontSize: 12, marginTop: 8 }}>⚠️ {error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 32 }}>🔐</div>
        <div>
          <h3 style={{ margin: 0 }}>Autenticación en dos pasos (2FA)</h3>
          <p style={{ color: 'var(--mu)', fontSize: 13, margin: '4px 0 0' }}>
            Agregá una capa extra de seguridad a tu cuenta.
          </p>
        </div>
      </div>

      {status?.enabled ? (
        <div>
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>✅</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ok)' }}>2FA está activo</span>
            {status?.obligatorio && (
              <span style={{ fontSize: 11, background: 'rgba(245,158,11,.15)', color: '#f59e0b', fontWeight: 600, padding: '2px 8px', borderRadius: 4, marginLeft: 'auto' }}>Obligatorio</span>
            )}
          </div>
          <button type="button" className="btn btn-secondary" onClick={regenerateBackup} disabled={saving} style={{ marginRight: 8 }}>
            Regenerar códigos de respaldo
          </button>
          {!status?.obligatorio && (
            <button type="button" className="btn btn-secondary" style={{ color: 'var(--bad)' }} onClick={handleDisable} disabled={saving}>
              Deshabilitar 2FA
            </button>
          )}
          {error && <div style={{ color: 'var(--bad)', fontSize: 12, marginTop: 8 }}>⚠️ {error}</div>}
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: 'var(--mu)', marginBottom: 16 }}>
            Al activar 2FA, además de tu contraseña necesitarás un código de 6 dígitos que genera tu app de autenticación.
          </p>
          <button type="button" className="btn btn-primary" onClick={handleSetup} disabled={saving}>
            {saving ? 'Preparando...' : 'Configurar 2FA →'}
          </button>
          {error && <div style={{ color: 'var(--bad)', fontSize: 12, marginTop: 8 }}>⚠️ {error}</div>}
        </div>
      )}
    </div>
  )
}

const styles = {
  wrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--sf)', padding: 16,
  },
}
