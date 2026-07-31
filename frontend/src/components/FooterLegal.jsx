export function FooterLegal() {
  const linkStyle = {
    color: 'var(--mu)',
    textDecoration: 'none',
  }

  return (
    <footer
      className="footer-legal"
      style={{
        background: 'var(--sf, transparent)',
        borderTop: '1px solid var(--bd)',
        padding: '10px 20px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--mu)',
      }}
    >
      &copy; 2026 FlexCRM &middot;{' '}
      <a
        href="/terminos-y-condiciones"
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        onMouseEnter={(e) => { e.target.style.textDecoration = 'underline' }}
        onMouseLeave={(e) => { e.target.style.textDecoration = 'none' }}
      >
        T&eacute;rminos y Condiciones
      </a>
      {' '}&middot;{' '}
      <a
        href="/politica-de-privacidad"
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        onMouseEnter={(e) => { e.target.style.textDecoration = 'underline' }}
        onMouseLeave={(e) => { e.target.style.textDecoration = 'none' }}
      >
        Pol&iacute;tica de Privacidad
      </a>
      {' '}&middot;{' '}
      <a
        href="/politica-de-cookies"
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        onMouseEnter={(e) => { e.target.style.textDecoration = 'underline' }}
        onMouseLeave={(e) => { e.target.style.textDecoration = 'none' }}
      >
        Cookies
      </a>
      {' '}&middot; Hecho en Argentina
    </footer>
  )
}
