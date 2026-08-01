import { useState } from 'react'

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
  padding: 16,
  overflowY: 'auto',
}

const cardStyle = {
  background: 'var(--bg)',
  borderRadius: 16,
  width: '100%',
  maxWidth: 550,
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: 'var(--shadow-lg)',
  animation: 'modalIn .2s ease',
}

const headerStyle = {
  padding: '22px 24px 0',
  marginBottom: 14,
}

const bodyStyle = {
  padding: '0 24px',
}

const footerStyle = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
  padding: '16px 24px 22px',
  borderTop: '1px solid var(--bd)',
  marginTop: 18,
}

const accordionSummaryStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  background: 'var(--sf)',
  border: '1px solid var(--bd)',
  borderRadius: 8,
  padding: '12px 14px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--tx)',
  cursor: 'pointer',
  marginBottom: 8,
}

const accordionContentStyle = {
  padding: '12px 14px',
  marginBottom: 12,
  border: '1px solid var(--bd)',
  borderRadius: 8,
  background: 'var(--bg)',
}

const textStyle = {
  fontSize: 12,
  lineHeight: 1.65,
  color: 'var(--mu)',
  marginBottom: 10,
}

const linkStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ac)',
  textDecoration: 'none',
}

const checkboxStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  marginTop: 8,
  marginBottom: 4,
}

const termsSummary = `FlexCRM es un SaaS de gestión comercial y atención al cliente. Al usar el servicio, aceptás estos términos y condiciones que regulan el uso de la plataforma, las obligaciones de cada parte y las limitaciones de responsabilidad. Ley aplicable: Argentina, San Fernando del Valle de Catamarca.`

const privacySummary = `Recopilamos datos de registro, datos de uso de la plataforma y datos técnicos del dispositivo. No compartimos información personal con terceros. Los titulares de datos pueden ejercer sus derechos ARCO (Acceso, Rectificación, Cancelación y Oposición) escribiendo a nuestro equipo de privacidad.`

export function ConsentModal({ onAccept, onReject, onSkip, skipAllowed, daysLeft, versiones, tempToken, empresaNombre }) {
  const [loading, setLoading] = useState(false)
  const [skipLoading, setSkipLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState(null)
  const [expandedTerminos, setExpandedTerminos] = useState(false)
  const [expandedPrivacidad, setExpandedPrivacidad] = useState(false)

  const handleAccept = async () => {
    setError(null)
    setLoading(true)
    try {
      await onAccept({
        tempToken,
        aceptaciones: Object.entries(versiones).map(([tipo, version]) => ({ tipo, version })),
      })
    } catch (err) {
      setError(err?.message || 'Error al aceptar los términos. Intentá de nuevo.')
      setLoading(false)
    }
  }

  const handleSkip = async () => {
    setError(null)
    setSkipLoading(true)
    try {
      await onSkip({ tempToken })
    } catch (err) {
      setError(err?.message || 'Error al posponer. Intentá de nuevo.')
      setSkipLoading(false)
    }
  }

  return (
    <div
      style={overlayStyle}
      onClick={(e) => { if (e.target === e.currentTarget) onReject() }}
    >
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            Términos y Condiciones del Servicio
          </h3>
        </div>

        <div style={bodyStyle}>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--mu)', marginBottom: 18 }}>
            Como administrador de <strong style={{ color: 'var(--tx)' }}>"{empresaNombre}"</strong>, necesitás aceptar
            los documentos legales para continuar usando FlexCRM.
          </p>

          <div>
            <button
              type="button"
              style={accordionSummaryStyle}
              onClick={() => setExpandedTerminos(!expandedTerminos)}
            >
              <span style={{ transition: 'transform .15s', display: 'inline-block', transform: expandedTerminos ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 11, width: 14 }}>
                ▶
              </span>
              Términos y Condiciones v{versiones.terminos || '1.0'}
            </button>
            {expandedTerminos && (
              <div style={accordionContentStyle}>
                <p style={textStyle}>{termsSummary}</p>
                <a
                  href="/terminos-y-condiciones"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkStyle}
                >
                  Ver documento completo →
                </a>
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              style={accordionSummaryStyle}
              onClick={() => setExpandedPrivacidad(!expandedPrivacidad)}
            >
              <span style={{ transition: 'transform .15s', display: 'inline-block', transform: expandedPrivacidad ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 11, width: 14 }}>
                ▶
              </span>
              Política de Privacidad v{versiones.privacidad || '1.0'}
            </button>
            {expandedPrivacidad && (
              <div style={accordionContentStyle}>
                <p style={textStyle}>{privacySummary}</p>
                <a
                  href="/politica-de-privacidad"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkStyle}
                >
                  Ver documento completo →
                </a>
              </div>
            )}
          </div>

          <label style={checkboxStyle}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--ac)', flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--mu)' }}>
              Leí y acepto los Términos y Condiciones y la Política de Privacidad
              en nombre de mi organización.
            </span>
          </label>

          {error && (
            <p style={{ fontSize: 12, color: 'var(--bad)', marginTop: 10, marginBottom: 0 }}>
              {error}
            </p>
          )}
        </div>

        <div style={footerStyle}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onReject}
            disabled={loading || skipLoading}
          >
            Cancelar
          </button>
          {skipAllowed && daysLeft > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSkip}
              disabled={loading || skipLoading}
              style={{ background: 'rgba(245,158,11,.08)', color: 'var(--warn)', borderColor: 'var(--warn)' }}
            >
              {skipLoading ? '⏳ ...' : `⏰ Recordarme en ${daysLeft} día(s)`}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAccept}
            disabled={!checked || loading || skipLoading}
            style={{ background: 'var(--ac)', color: '#fff' }}
          >
            {loading ? 'Procesando...' : 'Aceptar y continuar'}
          </button>
        </div>
      </div>
    </div>
  )
}
