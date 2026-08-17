const SITE_URL = 'https://unfulanodev.com.ar';
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

const FAQ_ITEMS = [
  {
    name: '¿Cuánto cuesta?',
    text: 'La landing básica es gratis. Un sitio completo desde $450.000, una tienda o sistema a medida desde $900.000. Cada proyecto es distinto igual: te doy un número exacto antes de arrancar. Nada de presupuestos abiertos ni sorpresas.',
  },
  {
    name: '¿Necesitás saber de tecnología?',
    text: 'Para nada. Vos te ocupás del negocio, yo de la web. Te explico todo en criollo, sin palabras raras. Si algo no se entiende, la culpa es mía, no tuya.',
  },
  {
    name: '¿Y si quiero cambios después?',
    text: 'Si tenés el Plan Tini, los cambios chicos entran en la cuota mensual. Si no, te cotizo el cambio suelto. Siempre te aviso antes de hacer cualquier cosa que implique costo. No me gusta sorprender con la factura.',
  },
  {
    name: '¿Cómo empezamos?',
    text: 'Me escribís por WhatsApp, charlamos cinco minutos, y si veo que puedo ayudarte te paso un presupuesto. Si te va bien, arrancamos. La mitad al inicio, la mitad cuando te entrego el sitio funcionando.',
  },
  {
    name: '¿Qué necesitás de mí?',
    text: 'Tu WhatsApp, fotos de tu negocio (o lo que quieras mostrar), y una charla de cinco minutos. Nada de llenar formularios eternos ni adjuntar documentos. Simple.',
  },
];

const SERVICES = [
  {
    slug: 'desarrollo-web',
    path: '/desarrollo-web',
    url: `${SITE_URL}/#para-quien`,
    name: 'Desarrollo web',
    description: 'Landing pages y sitios web para presentar un negocio de forma clara y profesional.',
  },
  {
    slug: 'tiendas-online',
    path: '/tiendas-online',
    url: `${SITE_URL}/#para-quien`,
    name: 'Tiendas online',
    description: 'Tiendas online con catálogo, carrito y cobros según el alcance de cada proyecto.',
  },
  {
    slug: 'sistemas-a-medida',
    path: '/sistemas-a-medida',
    url: `${SITE_URL}/#para-quien`,
    name: 'Sistemas a medida',
    description: 'Sistemas de gestión adaptados al flujo de trabajo de un negocio.',
  },
  {
    slug: 'crm',
    path: '/crm',
    url: `${SITE_URL}/#para-quien`,
    name: 'CRM',
    description: 'Herramientas CRM y de gestión para ordenar clientes, ventas y operaciones.',
  },
];

function serviceId(service) {
  return `${SITE_URL}/#service-${service.slug}`;
}

function organizationNode() {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'Un Fulano Dev',
    url: `${SITE_URL}/`,
    email: 'contacto@unfulanodev.com.ar',
    telephone: '+54 9 351 742-4391',
    description: 'Desarrollo web, tiendas online, sistemas a medida y CRM para negocios desde Catamarca, Argentina.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Catamarca',
      addressCountry: 'AR',
    },
    areaServed: 'Catamarca, Argentina',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: 'contacto@unfulanodev.com.ar',
      telephone: '+54 9 351 742-4391',
      availableLanguage: 'es',
    },
    knowsAbout: ['Desarrollo web', 'Paginas web', 'Tiendas online', 'Sistemas a medida', 'CRM'],
  };
}

function serviceNode(service) {
  return {
    '@type': 'Service',
    '@id': serviceId(service),
    name: service.name,
    serviceType: service.name,
    description: service.description,
    url: service.url,
    provider: { '@id': ORGANIZATION_ID },
    areaServed: 'Catamarca, Argentina',
  };
}

function homeJsonLd() {
  const faqId = `${SITE_URL}/#faq`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(),
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        name: 'Un Fulano Dev',
        url: `${SITE_URL}/`,
        inLanguage: 'es-AR',
        publisher: { '@id': ORGANIZATION_ID },
      },
      {
        '@type': 'WebPage',
        '@id': `${SITE_URL}/#webpage`,
        url: `${SITE_URL}/`,
        name: 'Un Fulano Dev | Desarrollo web y software a medida',
        description: 'Desarrollo web, paginas web, tiendas online, sistemas a medida y CRM desde Catamarca, Argentina.',
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': ORGANIZATION_ID },
        inLanguage: 'es-AR',
      },
      ...SERVICES.map(serviceNode),
      {
        '@type': 'FAQPage',
        '@id': faqId,
        url: `${SITE_URL}/#faq`,
        isPartOf: { '@id': WEBSITE_ID },
        mainEntity: FAQ_ITEMS.map((item) => ({
          '@type': 'Question',
          name: item.name,
          acceptedAnswer: { '@type': 'Answer', text: item.text },
        })),
      },
    ],
  };
}

function serializeJsonLdScript(value) {
  const json = JSON.stringify(value, null, 2)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

module.exports = {
  FAQ_ITEMS,
  SERVICES,
  homeJsonLd,
  serializeJsonLdScript,
  serviceId,
};
