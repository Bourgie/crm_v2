import { useState } from 'react'
import { Link } from 'react-router-dom'

const STORAGE_KEY = 'crm_cookies_consent'

export function CookieBanner() {
  const [show, setShow] = useState(() => !localStorage.getItem(STORAGE_KEY))

  if (!show) return null

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      esenciales: true,
      analytics: null,
      marketing: null,
    }))
    setShow(null)
  }

  return (
    <div style={styles.bar}>
      <span style={styles.text}>
        &#127850; Usamos cookies estrictamente necesarias para el funcionamiento
        del sitio. No recolectamos cookies de rastreo ni publicitarias.
      </span>
      <div style={styles.actions}>
        <Link to="/politica-de-cookies" style={styles.link}>
          M&aacute;s informaci&oacute;n
        </Link>
        <button type="button" style={styles.btn} onClick={accept}>
          Entendido
        </button>
      </div>
    </div>
  )
}

const styles = {
  bar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    background: 'rgba(30,30,40,0.95)',
    zIndex: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '12px 24px',
    flexWrap: 'wrap',
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  text: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 1.5,
    flex: '1 1 auto',
    minWidth: 0,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  link: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
    whiteSpace: 'nowrap',
  },
  btn: {
    background: 'transparent',
    color: 'rgba(255,255,255,0.95)',
    border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 6,
    padding: '6px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
}
