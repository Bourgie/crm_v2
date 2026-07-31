import { Link } from 'react-router-dom'

export function Terminos() {
  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.headerRow}>
          <h1 style={s.title}>
            <span style={{ fontSize: 32, marginRight: 10 }}>&#128196;</span>
            T&eacute;rminos y Condiciones del Servicio
          </h1>
        </div>

        <div style={s.meta}>
          <span>&Uacute;ltima actualizaci&oacute;n: Julio 2026</span>
          <span style={{ marginLeft: 16 }}>Versi&oacute;n 1.0</span>
        </div>

        <div style={s.intro}>
          Bienvenido a <strong>FlexCRM</strong>, un software como servicio (SaaS) provisto por{' '}
          <strong>Un Fulano Dev</strong> a trav&eacute;s de <strong>unfulanodev.com.ar</strong>.
          Al utilizar nuestros servicios, acept&aacute;s estos T&eacute;rminos y Condiciones en su totalidad.
          Leelos atentamente antes de comenzar a usar la plataforma.
        </div>

        <Section num="1" title="OBJETO">
          <P>
            FlexCRM es un software como servicio (SaaS) dise&ntilde;ado para la gesti&oacute;n integral de negocios,
            que incluye m&oacute;dulos de ventas, clientes, productos, caja, recursos humanos, gastos,
            proveedores, presupuestos y dem&aacute;s funcionalidades disponibles seg&uacute;n el plan contratado.
          </P>
          <P>
            El servicio es provisto por <strong>Un Fulano Dev</strong>, con domicilio legal en la
            Provincia de Catamarca, Argentina, y operado a trav&eacute;s del sitio web{' '}
            <strong>unfulanodev.com.ar</strong>. El acceso y uso de FlexCRM est&aacute;n sujetos
            a los presentes t&eacute;rminos.
          </P>
        </Section>

        <Section num="2" title="REGISTRO">
          <P>
            El registro en FlexCRM es realizado por una persona f&iacute;sica en calidad de{' '}
            <strong>administrador</strong> de la empresa u organizaci&oacute;n. Al registrarse,
            el administrador declara bajo juramento:
          </P>
          <ul style={s.list}>
            <li>Ser mayor de 18 a&ntilde;os.</li>
            <li>Tener plena capacidad legal para contratar y obligar a la organizaci&oacute;n que representa.</li>
            <li>Que todos los datos proporcionados son veraces, completos y se mantendr&aacute;n actualizados.</li>
          </ul>
          <P>
            FlexCRM se reserva el derecho de verificar la informaci&oacute;n proporcionada y de rechazar
            o suspender cuentas que contengan datos falsos o inexactos.
          </P>
        </Section>

        <Section num="3" title="PLANES Y PAGOS">
          <P>
            FlexCRM ofrece un per&iacute;odo de prueba gratuito de <strong>14 (catorce) d&iacute;as</strong>,
            durante el cual el usuario puede acceder a las funcionalidades del plan contratado sin costo alguno.
            Finalizado el per&iacute;odo de prueba, el servicio se facturar&aacute; seg&uacute;n el plan
            seleccionado por el administrador.
          </P>
          <P>
            Los precios de los planes pueden ser modificados con un{' '}
            <strong>preaviso de 30 (treinta) d&iacute;as</strong>, comunicado a trav&eacute;s de la
            plataforma y/o por correo electr&oacute;nico. El usuario podr&aacute; optar por darse de baja
            antes de que la modificaci&oacute;n entre en vigencia.
          </P>
          <P>
            FlexCRM <strong>no almacena datos de tarjetas de cr&eacute;dito o d&eacute;bito</strong>.
            Los pagos son procesados a trav&eacute;s de procesadores de pago externos (como Mercado Pago),
            quienes son responsables del tratamiento seguro de dichos datos conforme a sus propios
            t&eacute;rminos y pol&iacute;ticas de privacidad.
          </P>
        </Section>

        <Section num="4" title="PROPIEDAD INTELECTUAL">
          <P>
            El software FlexCRM, su c&oacute;digo fuente, dise&ntilde;o, interfaz de usuario,
            logotipos, marcas, documentaci&oacute;n y dem&aacute;s elementos que componen la
            plataforma son propiedad exclusiva de <strong>Un Fulano Dev</strong>.
          </P>
          <P>
            El cliente recibe una <strong>licencia de uso no exclusiva, intransferible y revocable</strong>{' '}
            para utilizar FlexCRM mientras su cuenta se encuentre activa y al d&iacute;a con los pagos
            correspondientes. Esta licencia no otorga ning&uacute;n derecho de propiedad sobre el software.
          </P>
          <P>
            Queda expresamente prohibido copiar, modificar, descompilar, realizar ingenier&iacute;a inversa,
            distribuir, vender, sublicenciar o crear obras derivadas del software sin autorizaci&oacute;n
            previa y por escrito de Un Fulano Dev.
          </P>
        </Section>

        <Section num="5" title="DATOS DEL CLIENTE">
          <P>
            Todos los datos que el usuario y su organizaci&oacute;n cargan en FlexCRM
            (informaci&oacute;n de clientes, productos, ventas, empleados, gastos y dem&aacute;s)
            son de <strong>exclusiva propiedad del cliente</strong>.
          </P>
          <P>
            FlexCRM no comparte, vende ni cede los datos del cliente a terceros, salvo en los
            siguientes casos:
          </P>
          <ul style={s.list}>
            <li>Por obligaci&oacute;n legal o requerimiento de autoridad judicial competente.</li>
            <li>A procesadores de pago y proveedores de infraestructura necesarios para la operaci&oacute;n del servicio.</li>
            <li>Con consentimiento expreso del cliente.</li>
          </ul>
          <P>
            FlexCRM implementa medidas de seguridad t&eacute;cnicas y organizativas para proteger
            los datos del cliente, de conformidad con la Ley 25.326 de Protecci&oacute;n de Datos
            Personales de la Rep&uacute;blica Argentina.
          </P>
        </Section>

        <Section num="6" title="LIMITACI&Oacute;N DE RESPONSABILIDAD">
          <P>
            FlexCRM se brinda <strong>&quot;tal cual&quot; (&quot;as is&quot;)</strong>, sin garant&iacute;as
            de ning&uacute;n tipo, expresas o impl&iacute;citas. Un Fulano Dev no garantiza:
          </P>
          <ul style={s.list}>
            <li>Disponibilidad ininterrumpida o libre de errores del servicio.</li>
            <li>Que el servicio est&eacute; disponible el 100% del tiempo.</li>
            <li>Que los resultados obtenidos del uso del servicio sean exactos o confiables.</li>
          </ul>
          <P>
            Un Fulano Dev <strong>no ser&aacute; responsable</strong> por da&ntilde;os directos, indirectos,
            incidentales, especiales o consecuentes derivados de:
          </P>
          <ul style={s.list}>
            <li>Mal uso o mala configuraci&oacute;n de la plataforma por parte del usuario.</li>
            <li>Datos incorrectos o incompletos cargados por el usuario.</li>
            <li>Casos de fuerza mayor o hechos de terceros (cortes de internet, fallas en servicios de terceros, desastres naturales, etc.).</li>
            <li>Decisiones comerciales tomadas con base en la informaci&oacute;n proporcionada por FlexCRM.</li>
          </ul>
        </Section>

        <Section num="7" title="SUSPENSI&Oacute;N Y TERMINACI&Oacute;N">
          <P>
            FlexCRM se reserva el derecho de <strong>suspender o cancelar</strong> cuentas
            de forma temporal o permanente en los siguientes casos:
          </P>
          <ul style={s.list}>
            <li>Violaci&oacute;n de los presentes T&eacute;rminos y Condiciones.</li>
            <li>Uso fraudulento, ilegal o no autorizado de la plataforma.</li>
            <li>Falta de pago por un per&iacute;odo superior a 15 (quince) d&iacute;as desde el vencimiento.</li>
          </ul>
          <P>
            El administrador puede solicitar la <strong>baja de la cuenta</strong> en cualquier momento
            desde la secci&oacute;n de configuraci&oacute;n de la plataforma. Los datos del cliente
            ser&aacute;n eliminados de nuestros servidores en un plazo de 30 (treinta) d&iacute;as
            desde la solicitud de baja, salvo aquellos que deban conservarse por obligaci&oacute;n legal.
          </P>
        </Section>

        <Section num="8" title="MODIFICACIONES">
          <P>
            FlexCRM puede modificar los presentes T&eacute;rminos y Condiciones en cualquier momento.
            Las modificaciones ser&aacute;n <strong>notificadas en la plataforma</strong> con una
            antelaci&oacute;n m&iacute;nima de 30 (treinta) d&iacute;as antes de su entrada en vigencia.
          </P>
          <P>
            El administrador deber&aacute; <strong>re-aceptar</strong> los nuevos t&eacute;rminos
            para continuar utilizando el servicio. Se otorgar&aacute; un per&iacute;odo de gracia de{' '}
            <strong>7 (siete) d&iacute;as</strong> desde la entrada en vigencia de las modificaciones
            para que el administrador pueda revisarlas y aceptarlas. Si transcurrido dicho plazo los
            t&eacute;rminos no han sido aceptados, la cuenta podr&aacute; ser suspendida.
          </P>
        </Section>

        <Section num="9" title="LEY APLICABLE Y JURISDICCI&Oacute;N">
          <P>
            Los presentes T&eacute;rminos y Condiciones se rigen por las leyes de la Rep&uacute;blica
            Argentina, en particular:
          </P>
          <ul style={s.list}>
            <li>Ley 24.240 de Defensa del Consumidor.</li>
            <li>C&oacute;digo Civil y Comercial de la Naci&oacute;n.</li>
            <li>Ley 25.326 de Protecci&oacute;n de Datos Personales.</li>
          </ul>
          <P>
            Para toda controversia derivada de la interpretaci&oacute;n o ejecuci&oacute;n de estos
            t&eacute;rminos, las partes se someten a la jurisdicci&oacute;n de los{' '}
            <strong>Tribunales Ordinarios de la Ciudad de San Fernando del Valle de Catamarca,
            Provincia de Catamarca, Argentina</strong>, renunciando a cualquier otro fuero o
            jurisdicci&oacute;n que pudiera corresponder.
          </P>
        </Section>

        <Section num="10" title="CONTACTO">
          <P>
            Para cualquier consulta, reclamo o sugerencia relacionada con estos T&eacute;rminos y
            Condiciones, pod&eacute;s comunicarte con nosotros a trav&eacute;s de:
          </P>
          <P>
            <strong>&#9993; Correo electr&oacute;nico:</strong>{' '}
            <a href="mailto:contacto@unfulanodev.com.ar" style={{ color: 'var(--ac)' }}>
              contacto@unfulanodev.com.ar
            </a>
          </P>
          <P>
            <strong>Sitio web:</strong>{' '}
            <a href="https://unfulanodev.com.ar" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)' }}>
              unfulanodev.com.ar
            </a>
          </P>
        </Section>

        <div style={s.footer}>
          <Link to="/app/login" style={s.backLink}>
            &#8592; Volver al inicio
          </Link>
          <button type="button" style={s.pdfBtn}>
            &#128206; Descargar PDF
          </button>
        </div>
      </div>

      <div style={s.bottom}>
        &copy; {new Date().getFullYear()} Un Fulano Dev &mdash; Todos los derechos reservados.
      </div>
    </div>
  )
}

function Section({ num, title, children }) {
  return (
    <section style={s.section}>
      <h2 style={s.sectionTitle}>
        {num}. {title}
      </h2>
      <div style={s.sectionBody}>
        {children}
      </div>
    </section>
  )
}

function P({ children }) {
  return <p style={s.p}>{children}</p>
}

const s = {
  wrap: {
    minHeight: '100vh',
    background: 'var(--sf)',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    color: 'var(--tx, #1f2937)',
    padding: '24px 16px 40px',
    lineHeight: 1.65,
  },
  card: {
    maxWidth: 'min(800px, 96vw)',
    margin: '40px auto 24px',
    background: 'var(--bg)',
    borderRadius: 16,
    padding: '40px 44px',
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--bd)',
  },
  headerRow: {
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
    lineHeight: 1.3,
  },
  meta: {
    fontSize: 13,
    color: 'var(--mu)',
    marginBottom: 28,
    paddingBottom: 20,
    borderBottom: '1px solid var(--bd)',
  },
  intro: {
    fontSize: 14,
    color: 'var(--mu)',
    lineHeight: 1.7,
    marginBottom: 32,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--ac, #F97316)',
  },
  sectionBody: {
    paddingLeft: 16,
    borderLeft: '3px solid var(--bd)',
  },
  p: {
    fontSize: 14,
    lineHeight: 1.7,
    margin: '0 0 10px',
  },
  list: {
    margin: '0 0 10px',
    paddingLeft: 24,
    fontSize: 14,
    lineHeight: 1.7,
  },
  footer: {
    marginTop: 36,
    paddingTop: 20,
    borderTop: '1px solid var(--bd)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  backLink: {
    color: 'var(--ac)',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
  },
  pdfBtn: {
    background: 'var(--ac)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  bottom: {
    textAlign: 'center',
    fontSize: 12,
    color: 'var(--mu)',
    paddingBottom: 20,
  },
}
