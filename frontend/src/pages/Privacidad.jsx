import { Link } from 'react-router-dom'

const styles = {
  wrapper: {
    minHeight: '100vh',
    background: 'var(--sf)',
    padding: '40px 20px',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    color: 'var(--tx)',
    lineHeight: 1.7,
  },
  card: {
    maxWidth: 'min(800px, 96vw)',
    margin: '0 auto',
    background: 'var(--bg)',
    borderRadius: 16,
    padding: '48px 48px 40px',
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--bd)',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    color: 'var(--ac)',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 32,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
  },
  headerIcon: {
    fontSize: 32,
    lineHeight: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: 800,
    color: 'var(--tx)',
    lineHeight: 1.2,
    margin: 0,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    marginTop: 10,
    marginBottom: 36,
  },
  metaBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 12px',
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 600,
    background: 'var(--sf)',
    color: 'var(--mu)',
    border: '1px solid var(--bd)',
  },
  pdfBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 18px',
    borderRadius: 'var(--radius)',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: '1.5px solid var(--bd)',
    background: 'var(--bg)',
    color: 'var(--tx)',
    transition: 'all .15s',
    textDecoration: 'none',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--tx)',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottom: '1px solid var(--bd)',
  },
  sectionNumber: {
    color: 'var(--ac)',
    fontWeight: 800,
    marginRight: 6,
  },
  paragraph: {
    marginBottom: 10,
    fontSize: 14,
    color: 'var(--tx)',
  },
  list: {
    marginTop: 6,
    marginBottom: 10,
    paddingLeft: 20,
    fontSize: 14,
  },
  listItem: {
    marginBottom: 5,
  },
  subSection: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--tx)',
  },
  footer: {
    marginTop: 40,
    paddingTop: 20,
    borderTop: '1px solid var(--bd)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: 12,
    color: 'var(--mu)',
  },
  link: {
    color: 'var(--ac)',
    textDecoration: 'none',
    fontWeight: 600,
  },
}

function Section({ number, title, children }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>
        <span style={styles.sectionNumber}>{number}.</span>
        {title}
      </h2>
      {children}
    </div>
  )
}

function P({ children }) {
  return <p style={styles.paragraph}>{children}</p>
}

export function Privacidad() {
  const handlePdfClick = () => {
    window.print()
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        {/* Back link */}
        <Link to="/" style={styles.backLink}>
          ← Volver al inicio
        </Link>

        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerIcon}>🔒</span>
          <h1 style={styles.title}>Política de Privacidad</h1>
        </div>

        {/* Meta */}
        <div style={styles.meta}>
          <span style={styles.metaBadge}>Última actualización: Julio 2026</span>
          <span style={styles.metaBadge}>Versión 1.0</span>
          <button
            type="button"
            style={styles.pdfBtn}
            onClick={handlePdfClick}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--ac)'
              e.currentTarget.style.color = 'var(--ac)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--bd)'
              e.currentTarget.style.color = 'var(--tx)'
            }}
          >
            📄 Descargar PDF
          </button>
        </div>

        {/* 1. RESPONSABLE DEL TRATAMIENTO */}
        <Section number="1" title="RESPONSABLE DEL TRATAMIENTO">
          <P>
            El responsable del tratamiento de los datos personales es{' '}
            <strong>Un Fulano Dev</strong>, titular del servicio{' '}
            <strong>FlexCRM</strong>, con domicilio legal en San Fernando del
            Valle de Catamarca, Catamarca, Argentina. Sitio web:{' '}
            <a href="https://unfulanodev.com.ar" style={styles.link}>
              unfulanodev.com.ar
            </a>
            .
          </P>
          <P>
            Para cualquier consulta relacionada con la privacidad de tus datos,
            podés contactarnos a través de{' '}
            <a href="mailto:privacidad@flexcrm.com.ar" style={styles.link}>
              privacidad@flexcrm.com.ar
            </a>
            .
          </P>
        </Section>

        {/* 2. DATOS QUE RECOPILAMOS */}
        <Section number="2" title="DATOS QUE RECOPILAMOS">
          <P>
            En FlexCRM recopilamos únicamente los datos necesarios para
            proporcionar el servicio de gestión comercial y CRM. A
            continuación, detallamos las categorías de datos tratados:
          </P>

          <div style={styles.subSection}>Datos de registro</div>
          <ul style={styles.list}>
            <li style={styles.listItem}>Nombre del negocio o razón social</li>
            <li style={styles.listItem}>Correo electrónico del administrador</li>
            <li style={styles.listItem}>Rubro o sector comercial</li>
          </ul>

          <div style={styles.subSection}>Datos de uso del servicio</div>
          <ul style={styles.list}>
            <li style={styles.listItem}>
              Información de clientes cargada por el administrador y usuarios
              autorizados
            </li>
            <li style={styles.listItem}>
              Productos, precios, stock y catálogos
            </li>
            <li style={styles.listItem}>
              Ventas, presupuestos, facturación y movimientos de caja
            </li>
            <li style={styles.listItem}>
              Cualquier otro dato ingresado voluntariamente por el usuario en
              los módulos del sistema
            </li>
          </ul>

          <div style={styles.subSection}>Datos técnicos</div>
          <ul style={styles.list}>
            <li style={styles.listItem}>
              Dirección IP, tipo de navegador y sistema operativo (logs de
              acceso)
            </li>
          </ul>

          <P>
            <strong>Importante:</strong> FlexCRM{' '}
            <strong>NO recopila datos sensibles</strong> en los términos del
            artículo 2 de la Ley 25.326 (origen racial o étnico, opiniones
            políticas, convicciones religiosas, filosóficas o morales,
            afiliación sindical, información referente a la salud o a la vida
            sexual). No obstante, el administrador o los usuarios podrían
            cargar voluntariamente información de esta naturaleza en campos de
            texto libre o notas. En tal caso, FlexCRM no utiliza ni procesa
            dicha información de manera diferenciada, limitándose a almacenarla
            como parte del servicio contratado.
          </P>
        </Section>

        {/* 3. FINALIDAD Y BASE LEGAL */}
        <Section number="3" title="FINALIDAD Y BASE LEGAL">
          <P>
            El tratamiento de datos personales en FlexCRM se realiza conforme a
            las siguientes finalidades y sus respectivas bases legales, de
            acuerdo con la Ley 25.326:
          </P>

          <div style={styles.subSection}>
            Proveer el servicio contratado
          </div>
          <P>
            <strong>Base legal:</strong> Relación contractual (artículo 5,
            inciso 2, Ley 25.326). Los datos son necesarios para ejecutar el
            contrato de servicios entre FlexCRM y el administrador de la
            cuenta.
          </P>

          <div style={styles.subSection}>
            Facturación y obligaciones fiscales
          </div>
          <P>
            <strong>Base legal:</strong> Obligación legal. Emitimos
            comprobantes fiscales y conservamos registros conforme a las
            disposiciones de la Agencia de Recaudación y Control Aduanero
            (ARCA) y normativa fiscal aplicable.
          </P>

          <div style={styles.subSection}>Comunicaciones</div>
          <P>
            <strong>Base legal:</strong> Consentimiento. Envío de correos
            electrónicos transaccionales (verificación de cuenta,
            restablecimiento de contraseña, notificaciones de seguridad) y
            comunicaciones comerciales, siempre que el usuario haya prestado su
            consentimiento expreso, el cual puede revocar en cualquier momento.
          </P>

          <div style={styles.subSection}>Mejora del producto</div>
          <P>
            <strong>Base legal:</strong> Interés legítimo del responsable. El
            análisis agregado y anonimizado de patrones de uso permite mejorar
            la plataforma sin afectar derechos fundamentales de los titulares.
          </P>

          <div style={styles.subSection}>
            Seguridad y prevención de fraude
          </div>
          <P>
            <strong>Base legal:</strong> Interés legítimo. Monitoreo de accesos
            sospechosos, prevención de uso indebido de cuentas y protección de
            la integridad del sistema.
          </P>
        </Section>

        {/* 4. DESTINATARIOS DE LOS DATOS */}
        <Section number="4" title="DESTINATARIOS DE LOS DATOS">
          <P>
            FlexCRM <strong>no comparte, vende ni cede</strong> datos
            personales a terceros con fines comerciales. Los datos solo pueden
            ser compartidos en los siguientes supuestos:
          </P>
          <ul style={styles.list}>
            <li style={styles.listItem}>
              <strong>Obligación legal:</strong> cuando una autoridad
              competente, en el marco de sus funciones y mediante el
              procedimiento legal correspondiente, requiera información.
            </li>
            <li style={styles.listItem}>
              <strong>Procesadores de pago:</strong> los datos necesarios para
              procesar pagos son transmitidos a MercadoPago, que actúa como
              procesador de pagos externo, sujeto a sus propios términos y
              políticas de privacidad.
            </li>
            <li style={styles.listItem}>
              <strong>API de MercadoLibre:</strong> si el administrador activa
              voluntariamente la integración con MercadoLibre, los datos
              necesarios para la sincronización de productos, ventas y
              publicaciones serán transmitidos a dicha plataforma conforme a
              sus términos de uso.
            </li>
          </ul>
          <P>
            En todos los casos, exigimos contractualmente a los terceros que
            traten los datos con el mismo nivel de protección exigido por la
            Ley 25.326.
          </P>
        </Section>

        {/* 5. TRANSFERENCIA INTERNACIONAL */}
        <Section number="5" title="TRANSFERENCIA INTERNACIONAL">
          <P>
            Los datos se almacenan en servidores cloud provistos por{' '}
            <strong>Fly.io</strong>, cuyos centros de datos pueden estar
            ubicados fuera del territorio argentino.
          </P>
          <P>
            La República Argentina ha sido declarada{' '}
            <strong>país con nivel adecuado de protección</strong> por la
            Comisión Europea (Decisión 2003/490/CE), lo que garantiza que las
            transferencias internacionales desde y hacia Argentina cumplen con
            los estándares internacionales de protección de datos.
          </P>
          <P>
            Asimismo, implementamos cláusulas contractuales estándar y exigimos
            a nuestros proveedores de infraestructura medidas técnicas y
            organizativas equivalentes a las requeridas por la Ley 25.326 y la
            Disposición 10/2008 de la AAIP.
          </P>
        </Section>

        {/* 6. PLAZOS DE CONSERVACIÓN */}
        <Section number="6" title="PLAZOS DE CONSERVACIÓN">
          <P>
            Los datos personales son conservados únicamente durante el tiempo
            necesario para cumplir con las finalidades para las que fueron
            recopilados:
          </P>
          <ul style={styles.list}>
            <li style={styles.listItem}>
              <strong>Datos de ventas y documentación fiscal:</strong> 10 años
              (obligación legal conforme a normativa ARCA).
            </li>
            <li style={styles.listItem}>
              <strong>Logs de acceso y auditoría:</strong> 2 años.
            </li>
            <li style={styles.listItem}>
              <strong>Datos de usuario y cuenta:</strong> mientras la cuenta
              permanezca activa. Al solicitar la baja, los datos se eliminan en
              un plazo máximo de 30 días corridos, salvo aquellos que deban
              conservarse por obligación legal.
            </li>
            <li style={styles.listItem}>
              <strong>Sesiones y cookies de autenticación:</strong> 24 horas
              (sesión activa), cookies persistentes hasta 7 días.
            </li>
          </ul>
        </Section>

        {/* 7. DERECHOS ARCO */}
        <Section number="7" title="DERECHOS ARCO">
          <P>
            De conformidad con los artículos 14, 15 y 16 de la Ley 25.326, los
            titulares de datos personales tienen los siguientes derechos:
          </P>

          <div style={styles.subSection}>Acceso (art. 14)</div>
          <P>
            Podés solicitar en cualquier momento una copia completa de los
            datos personales que FlexCRM tiene almacenados sobre tu cuenta. La
            funcionalidad de exportación de datos está disponible desde la
            sección <strong>Mi Cuenta</strong> dentro del sistema.
          </P>

          <div style={styles.subSection}>Rectificación (art. 16)</div>
          <P>
            Tenés derecho a actualizar, rectificar o completar tus datos
            personales cuando resulten inexactos o incompletos. Podés hacerlo
            directamente desde <strong>Mi Cuenta</strong> en la plataforma.
          </P>

          <div style={styles.subSection}>Cancelación (art. 16)</div>
          <P>
            Podés solicitar la baja definitiva de tu cuenta y la eliminación de
            tus datos personales, siempre que no exista una obligación legal
            que exija su conservación. La solicitud de baja se realiza desde{' '}
            <strong>Mi Cuenta</strong> o escribiendo a{' '}
            <a href="mailto:privacidad@flexcrm.com.ar" style={styles.link}>
              privacidad@flexcrm.com.ar
            </a>
            .
          </P>

          <div style={styles.subSection}>Oposición (art. 16)</div>
          <P>
            Podés oponerte al tratamiento de tus datos personales para fines
            específicos, como el envío de comunicaciones comerciales. La
            oposición puede ejercerse desde la configuración de notificaciones
            en <strong>Mi Cuenta</strong>.
          </P>

          <div style={styles.subSection}>
            ¿Cómo ejercer tus derechos?
          </div>
          <ul style={styles.list}>
            <li style={styles.listItem}>
              Desde la sección <strong>Mi Cuenta</strong> dentro de la
              plataforma.
            </li>
            <li style={styles.listItem}>
              Enviando un correo electrónico a{' '}
              <a href="mailto:privacidad@flexcrm.com.ar" style={styles.link}>
                privacidad@flexcrm.com.ar
              </a>{' '}
              con el asunto &ldquo;Ejercicio de derechos ARCO&rdquo;,
              acreditando tu identidad.
            </li>
          </ul>

          <P>
            <strong>Plazo de respuesta:</strong> FlexCRM responderá tu
            solicitud en un plazo máximo de{' '}
            <strong>10 días hábiles</strong>, conforme a lo establecido en la
            Ley 25.326. En caso de denegatoria, la respuesta será fundada.
          </P>
        </Section>

        {/* 8. SEGURIDAD */}
        <Section number="8" title="SEGURIDAD">
          <P>
            FlexCRM implementa medidas de seguridad técnicas y organizativas
            para proteger los datos personales contra accesos no autorizados,
            alteración, divulgación o destrucción, conforme a la Disposición
            10/2008 de la Agencia de Acceso a la Información Pública (AAIP):
          </P>
          <ul style={styles.list}>
            <li style={styles.listItem}>
              <strong>Encriptación:</strong> contraseñas almacenadas con bcrypt
              (hash irreversible); sesiones gestionadas mediante cookies
              httpOnly, Secure y SameSite.
            </li>
            <li style={styles.listItem}>
              <strong>Aislamiento multi-tenant:</strong> base de datos
              independiente por empresa (SQLite por tenant), garantizando que
              los datos de un cliente no sean accesibles por otro.
            </li>
            <li style={styles.listItem}>
              <strong>Protección CSRF:</strong> validación de tokens en todas
              las solicitudes que modifican estado.
            </li>
            <li style={styles.listItem}>
              <strong>Rate limiting:</strong> límite de solicitudes por IP para
              prevenir ataques de fuerza bruta y abuso del sistema.
            </li>
            <li style={styles.listItem}>
              <strong>Auditoría de accesos:</strong> registro de eventos de
              inicio de sesión, modificaciones sensibles y acciones
              administrativas.
            </li>
          </ul>
          <P>
            Realizamos revisiones periódicas de nuestras medidas de seguridad y
            las actualizamos conforme a la evolución tecnológica y las
            recomendaciones de la AAIP.
          </P>
        </Section>

        {/* 9. COOKIES */}
        <Section number="9" title="COOKIES">
          <P>
            FlexCRM utiliza exclusivamente{' '}
            <strong>cookies estrictamente necesarias</strong> para el
            funcionamiento del servicio:
          </P>
          <ul style={styles.list}>
            <li style={styles.listItem}>
              Cookie de sesión (autenticación): permite mantener la sesión
              iniciada de forma segura. Duración: 24 horas.
            </li>
            <li style={styles.listItem}>
              Cookie de seguridad (CSRF): protege contra falsificación de
              solicitudes entre sitios. Duración: sesión.
            </li>
          </ul>
          <P>
            No utilizamos cookies de seguimiento, publicitarias ni de terceros.
          </P>
          <P>
            Para más información, consultá nuestra{' '}
            <Link to="/politica-de-cookies" style={styles.link}>
              Política de Cookies
            </Link>
            .
          </P>
        </Section>

        {/* 10. MENORES DE EDAD */}
        <Section number="10" title="MENORES DE EDAD">
          <P>
            El servicio de FlexCRM <strong>no está destinado</strong> a
            menores de 18 años. Al registrarse, el administrador declara bajo
            juramento ser mayor de edad y tener capacidad legal para contratar
            los servicios ofrecidos.
          </P>
          <P>
            Si detectamos que una cuenta ha sido creada por un menor de 18
            años, procederemos a la cancelación inmediata de la misma y a la
            eliminación de los datos asociados. Si tenés conocimiento de que un
            menor ha proporcionado datos personales a través de FlexCRM, te
            solicitamos que nos lo comuniques de inmediato a{' '}
            <a href="mailto:privacidad@flexcrm.com.ar" style={styles.link}>
              privacidad@flexcrm.com.ar
            </a>
            .
          </P>
        </Section>

        {/* 11. MODIFICACIONES */}
        <Section number="11" title="MODIFICACIONES">
          <P>
            Esta Política de Privacidad puede ser actualizada periódicamente
            para reflejar cambios en nuestras prácticas de tratamiento de datos
            o en la normativa aplicable. En caso de modificaciones sustanciales:
          </P>
          <ul style={styles.list}>
            <li style={styles.listItem}>
              Se notificará al administrador de la cuenta mediante correo
              electrónico con al menos 15 días de antelación.
            </li>
            <li style={styles.listItem}>
              Se requerirá la aceptación explícita de la nueva versión al
              iniciar sesión.
            </li>
            <li style={styles.listItem}>
              Si el administrador no acepta los nuevos términos, podrá cancelar
              la cuenta antes de que la modificación entre en vigor.
            </li>
          </ul>
          <P>
            El uso continuado del servicio tras la entrada en vigencia de las
            modificaciones implica la aceptación de las mismas.
          </P>
        </Section>

        {/* 12. AUTORIDAD DE CONTROL */}
        <Section number="12" title="AUTORIDAD DE CONTROL">
          <P>
            La autoridad de aplicación de la Ley 25.326 de Protección de Datos
            Personales en la República Argentina es:
          </P>
          <P style={{ ...styles.paragraph, marginLeft: 16 }}>
            <strong>Agencia de Acceso a la Información Pública (AAIP)</strong>
            <br />
            Dirección Nacional de Protección de Datos Personales
            <br />
            Av. Pte. Gral. Julio A. Roca 710, Piso 2
            <br />
            Ciudad Autónoma de Buenos Aires (C1067ABP)
            <br />
            Sitio web:{' '}
            <a href="https://www.argentina.gob.ar/aaip" style={styles.link}>
              argentina.gob.ar/aaip
            </a>
          </P>
          <P>
            Los titulares de datos tienen derecho a interponer una denuncia
            ante la AAIP en caso de considerar que FlexCRM ha vulnerado sus
            derechos en materia de protección de datos personales.
          </P>
        </Section>

        {/* 13. REGISTRO DE BASE DE DATOS */}
        <Section number="13" title="REGISTRO DE BASE DE DATOS">
          <P>
            En cumplimiento del artículo 21 de la Ley 25.326 y la Disposición
            11/2006 de la entonces Dirección Nacional de Protección de Datos
            Personales, las bases de datos de FlexCRM se encuentran registradas
            o en proceso de registro ante el{' '}
            <strong>
              Registro Nacional de Bases de Datos de la AAIP
            </strong>
            .
          </P>
          <P>
            Los titulares de datos pueden consultar el estado de registro a
            través de la AAIP o solicitando información a{' '}
            <a href="mailto:privacidad@flexcrm.com.ar" style={styles.link}>
              privacidad@flexcrm.com.ar
            </a>
            .
          </P>
        </Section>

        {/* Footer */}
        <div style={styles.footer}>
          <span>&copy; {new Date().getFullYear()} FlexCRM — Un Fulano Dev</span>
          <Link to="/" style={styles.link}>
            ← Volver al inicio
          </Link>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          [class*="wrapper"] { background: #fff !important; padding: 0 !important; min-height: auto !important; }
          [class*="wrapper"] > div { visibility: visible; box-shadow: none !important; border: none !important; margin: 0 !important; max-width: 100% !important; padding: 20px 0 !important; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  )
}
