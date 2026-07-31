import { Link } from 'react-router-dom'

export function CookiesPolicy() {
  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>&#127850;</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--tx)' }}>
            Pol&iacute;tica de Cookies
          </h1>
          <p style={{ color: 'var(--mu)', fontSize: 13, marginTop: 8 }}>
            &Uacute;ltima actualizaci&oacute;n: Julio 2026 &middot; Versi&oacute;n 1.0
          </p>
        </div>

        {/* Descargar PDF */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <button
            className="btn btn-primary"
            style={{ padding: '10px 24px', fontSize: 14, fontWeight: 600 }}
            onClick={() => window.print()}
          >
            &#128196; Descargar PDF
          </button>
        </div>

        {/* Secci&oacute;n 1 */}
        <section style={styles.section}>
          <h2 style={styles.h2}>1. &iquest;Qu&eacute; son las cookies?</h2>
          <p style={styles.p}>
            Las cookies son peque&ntilde;os archivos de texto que los sitios web env&iacute;an al navegador
            del usuario y que este almacena en el dispositivo (computadora, tablet, celular). Las cookies
            se utilizan para diversos fines: recordar preferencias del usuario, mantener sesiones
            activas, garantizar la seguridad de la plataforma y habilitar funcionalidades esenciales
            del servicio. No contienen informaci&oacute;n personal identificable por s&iacute; mismas, sino
            identificadores an&oacute;nimos que permiten al servidor reconocer al navegador durante la
            navegaci&oacute;n.
          </p>
        </section>

        {/* Secci&oacute;n 2 */}
        <section style={styles.section}>
          <h2 style={styles.h2}>2. Cookies que utilizamos</h2>
          <p style={styles.p}>
            FlexCRM utiliza exclusivamente cookies t&eacute;cnicas y esenciales para el correcto
            funcionamiento de la plataforma. A continuaci&oacute;n se detallan las cookies que
            empleamos actualmente:
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Cookie</th>
                  <th style={styles.th}>Tipo</th>
                  <th style={styles.th}>Finalidad</th>
                  <th style={styles.th}>Duraci&oacute;n</th>
                  <th style={styles.th}>&iquest;Esencial?</th>
                </tr>
              </thead>
              <tbody>
                {cookieData.map((row, i) => (
                  <tr key={i} style={i % 2 === 1 ? styles.trAlt : styles.tr}>
                    <td style={styles.td}><code style={styles.code}>{row.name}</code></td>
                    <td style={styles.td}>{row.type}</td>
                    <td style={styles.td}>{row.purpose}</td>
                    <td style={styles.td}>{row.duration}</td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        background: row.essential ? '#dcfce7' : '#fee2e2',
                        color: row.essential ? '#166534' : 'var(--bad)',
                        padding: '2px 10px',
                        borderRadius: 100,
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        {row.essential ? 'S\u00ed' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Secci&oacute;n 3 */}
        <section style={styles.section}>
          <h2 style={styles.h2}>3. Cookies que NO utilizamos</h2>
          <p style={styles.p}>
            FlexCRM <strong>no utiliza</strong> cookies de rastreo, cookies publicitarias ni cookies de
            analytics de terceros. Espec&iacute;ficamente, no empleamos:
          </p>
          <ul style={styles.ul}>
            <li>Google Analytics</li>
            <li>Facebook Pixel</li>
            <li>Cookies de redes sociales</li>
            <li>Cookies de remarketing o segmentaci&oacute;n comportamental</li>
            <li>Cualquier otro servicio de tracking de terceros</li>
          </ul>
          <p style={styles.p}>
            Toda la informaci&oacute;n recolectada a trav&eacute;s de cookies permanece bajo nuestro
            control exclusivo y no es compartida con terceros con fines comerciales o publicitarios.
          </p>
        </section>

        {/* Secci&oacute;n 4 */}
        <section style={styles.section}>
          <h2 style={styles.h2}>4. Base legal</h2>
          <p style={styles.p}>
            El uso de cookies esenciales se encuentra amparado por el art&iacute;culo 5 de la
            Ley N&deg; 25.326 de Protecci&oacute;n de Datos Personales de la Rep&uacute;blica Argentina,
            en tanto resultan necesarias para la ejecuci&oacute;n de medidas precontractuales y para
            la prestaci&oacute;n del servicio solicitado por el titular de los datos.
          </p>
          <p style={styles.p}>
            De acuerdo con las directrices de la Agencia de Acceso a la Informaci&oacute;n
            P&uacute;blica (AAIP), las cookies estrictamente necesarias para el funcionamiento del
            servicio <strong>no requieren consentimiento previo</strong> del usuario. Esto incluye
            cookies de sesi&oacute;n, autenticaci&oacute;n y seguridad como las que utiliza FlexCRM.
          </p>
          <p style={styles.p}>
            En caso de que en el futuro incorporemos cookies no esenciales (por ejemplo, cookies
            de rendimiento o de funcionalidades opcionales), solicitaremos el consentimiento
            expl&iacute;cito, libre e informado del usuario antes de su instalaci&oacute;n, en
            cumplimiento con lo dispuesto por la normativa vigente y las recomendaciones de la AAIP.
          </p>
        </section>

        {/* Secci&oacute;n 5 */}
        <section style={styles.section}>
          <h2 style={styles.h2}>5. &iquest;C&oacute;mo desactivarlas?</h2>
          <p style={styles.p}>
            El usuario puede configurar su navegador para bloquear, eliminar o ser notificado del
            env&iacute;o de cookies. Sin embargo, dado que FlexCRM utiliza exclusivamente cookies
            esenciales para la autenticaci&oacute;n y seguridad, <strong>el bloqueo de cookies
            afectar&aacute; el funcionamiento del servicio e impedir&aacute; el inicio de
            sesi&oacute;n</strong>.
          </p>
          <p style={styles.p}>
            A continuaci&oacute;n, se indican las instrucciones para gestionar cookies en los
            navegadores m&aacute;s utilizados:
          </p>
          <ul style={styles.ul}>
            <li>
              <strong>Google Chrome:</strong> Men&uacute; &rarr; Configuraci&oacute;n &rarr;
              Privacidad y seguridad &rarr; Cookies y otros datos de sitios.
            </li>
            <li>
              <strong>Mozilla Firefox:</strong> Men&uacute; &rarr; Opciones &rarr;
              Privacidad y seguridad &rarr; Cookies y datos del sitio.
            </li>
            <li>
              <strong>Safari:</strong> Preferencias &rarr; Privacidad &rarr; Cookies y
              datos de sitios web.
            </li>
          </ul>
        </section>

        {/* Secci&oacute;n 6 */}
        <section style={styles.section}>
          <h2 style={styles.h2}>6. Actualizaciones</h2>
          <p style={styles.p}>
            Esta Pol&iacute;tica de Cookies puede ser modificada o actualizada peri&oacute;dicamente
            para reflejar cambios en nuestras pr&aacute;cticas, en los servicios que ofrecemos o en
            la normativa aplicable. Cualquier modificaci&oacute;n ser&aacute; informada mediante un
            aviso visible en la plataforma con antelaci&oacute;n razonable a su entrada en vigencia.
            Recomendamos revisar esta p&aacute;gina peri&oacute;dicamente para mantenerse informado
            sobre el uso de cookies en FlexCRM.
          </p>
          <p style={styles.p}>
            El uso continuado de la plataforma tras la publicaci&oacute;n de cambios en esta
            pol&iacute;tica constituir&aacute; la aceptaci&oacute;n de dichos cambios.
          </p>
        </section>

        {/* Contacto */}
        <section style={{ ...styles.section, borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
          <div style={{
            background: 'var(--sf)', borderRadius: 12, padding: '20px 24px',
            border: '1px solid var(--bd)',
          }}>
            <p style={{ ...styles.p, margin: 0 }}>
              <strong>&iquest;Ten&eacute;s dudas?</strong> Si necesit&aacute;s m&aacute;s
              informaci&oacute;n sobre nuestra pol&iacute;tica de cookies o sobre el tratamiento de
              tus datos personales, pod&eacute;s contactarnos a trav&eacute;s de nuestra
              p&aacute;gina de{' '}
              <Link to="/app/login" style={{ color: 'var(--ac)', fontWeight: 600 }}>
                Contacto
              </Link>{' '}
              o escribiendo a{' '}
              <a href="mailto:privacidad@flexcrm.com.ar" style={{ color: 'var(--ac)', fontWeight: 600 }}>
                privacidad@flexcrm.com.ar
              </a>.
            </p>
          </div>
        </section>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--bd)' }}>
          <Link to="/app/login" style={{ color: 'var(--ac)', fontSize: 14, fontWeight: 500 }}>
            &larr; Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}

const cookieData = [
  {
    name: 'access-token',
    type: 'Sesi\u00f3n / Autenticaci\u00f3n',
    purpose: 'Identificar al usuario autenticado',
    duration: '24 horas',
    essential: true,
  },
  {
    name: 'refresh-token',
    type: 'Sesi\u00f3n',
    purpose: 'Renovar sesi\u00f3n sin volver a pedir contrase\u00f1a',
    duration: '7 d\u00edas',
    essential: true,
  },
  {
    name: 'csrf-token',
    type: 'Seguridad',
    purpose: 'Proteger contra ataques CSRF',
    duration: 'Sesi\u00f3n',
    essential: true,
  },
]

const styles = {
  wrap: {
    minHeight: '100vh',
    background: 'var(--sf)',
    padding: 24,
  },
  card: {
    maxWidth: 'min(800px, 96vw)',
    margin: '40px auto',
    background: 'var(--bg)',
    borderRadius: 16,
    padding: 40,
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--bd)',
  },
  section: {
    marginBottom: 28,
    paddingBottom: 28,
    borderBottom: '1px solid var(--bd)',
  },
  h2: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 12,
    color: 'var(--tx)',
  },
  p: {
    fontSize: 14,
    lineHeight: 1.7,
    color: 'var(--tx)',
    marginBottom: 12,
  },
  ul: {
    fontSize: 14,
    lineHeight: 1.7,
    color: 'var(--tx)',
    paddingLeft: 20,
    marginBottom: 12,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    marginTop: 12,
    marginBottom: 4,
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    background: 'var(--sf)',
    fontWeight: 700,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--mu)',
    borderBottom: '2px solid var(--bd)',
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--bd)',
    color: 'var(--tx)',
    verticalAlign: 'middle',
  },
  tr: {
    background: 'var(--bg)',
  },
  trAlt: {
    background: 'var(--sf)',
  },
  code: {
    background: 'var(--sf)',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 12,
    fontFamily: 'monospace',
    border: '1px solid var(--bd)',
  },
}
