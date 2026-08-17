const SITE_URL = 'https://unfulanodev.com.ar';
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

const FAQ_ITEMS = [
  {
    name: '¿Cuánto cuesta una página web en Catamarca?',
    text: 'No hay un precio único: depende de la cantidad de secciones, el contenido y las funciones que necesites. Primero revisamos el alcance y después recibís un presupuesto claro antes de empezar.',
  },
  {
    name: '¿Cuánto demora desarrollar una página web?',
    text: 'Depende del alcance y de la información disponible. Antes de empezar se acuerda una primera etapa y un calendario realista para el proyecto.',
  },
  {
    name: '¿Hacen tiendas online?',
    text: 'Sí. Se puede trabajar sobre catálogo, categorías, pedidos, carrito y cobros según las necesidades del negocio y el alcance acordado.',
  },
  {
    name: '¿Pueden integrar Mercado Pago?',
    text: 'La integración se evalúa según el flujo de venta, la plataforma y el alcance del proyecto. Se confirma la solución antes de empezar.',
  },
  {
    name: '¿Hacen sistemas a medida?',
    text: 'Sí. Se pueden analizar procesos de clientes, stock, ventas, caja, pedidos o reportes y construir una primera etapa según la prioridad del negocio.',
  },
  {
    name: '¿Desarrollan CRM?',
    text: 'Sí. Un CRM puede ordenar clientes, oportunidades, ventas, tareas y reportes. También existe FlexCRM como producto de gestión relacionado.',
  },
  {
    name: '¿Trabajan con clientes de otras provincias?',
    text: 'La primera conversación puede ser por WhatsApp o email. Si el proyecto es viable, la modalidad de trabajo y el alcance se acuerdan según cada caso.',
  },
  {
    name: '¿Cómo comienza un proyecto?',
    text: 'Me contás de tu negocio, qué querés resolver y qué te gustaría mostrar. Revisamos el alcance y, si puedo ayudarte, preparo una propuesta antes de empezar.',
  },
];

const SERVICES = [
  {
    slug: 'desarrollo-web',
    path: '/desarrollo-web',
    url: `${SITE_URL}/desarrollo-web`,
    name: 'Desarrollo web',
    description: 'Landing pages y sitios web para presentar un negocio de forma clara y profesional.',
  },
  {
    slug: 'tiendas-online',
    path: '/tiendas-online',
    url: `${SITE_URL}/tiendas-online`,
    name: 'Tiendas online',
    description: 'Tiendas online con catálogo, carrito y cobros según el alcance de cada proyecto.',
  },
  {
    slug: 'sistemas-a-medida',
    path: '/sistemas-a-medida',
    url: `${SITE_URL}/sistemas-a-medida`,
    name: 'Sistemas a medida',
    description: 'Sistemas de gestión adaptados al flujo de trabajo de un negocio.',
  },
  {
    slug: 'crm',
    path: '/crm',
    url: `${SITE_URL}/crm`,
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

function pageJsonLd(page) {
  const pageId = `${SITE_URL}${page.path}#webpage`;
  const service = SERVICES.find((item) => item.slug === page.serviceSlug);
  const graph = [
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
      '@id': pageId,
      url: `${SITE_URL}${page.path}`,
      name: page.title,
      description: page.description,
      isPartOf: { '@id': WEBSITE_ID },
      about: { '@id': ORGANIZATION_ID },
      inLanguage: 'es-AR',
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${SITE_URL}${page.path}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: page.breadcrumb, item: `${SITE_URL}${page.path}` },
      ],
    },
  ];

  if (service) graph.push(serviceNode(service));
  if (page.kind === 'portfolio-index') {
    graph.push({
      '@type': 'CollectionPage',
      '@id': `${SITE_URL}${page.path}#collection`,
      url: `${SITE_URL}${page.path}`,
      name: page.title,
      isPartOf: { '@id': WEBSITE_ID },
      mainEntity: { '@id': `${SITE_URL}${page.path}#itemlist` },
    });
    graph.push({
      '@type': 'ItemList',
      '@id': `${SITE_URL}${page.path}#itemlist`,
      itemListElement: page.items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'CreativeWork',
          '@id': `${SITE_URL}${item.path}#project`,
          name: item.name,
          url: `${SITE_URL}${item.path}`,
        },
      })),
    });
  }
  if (page.kind === 'portfolio-case' && page.project) {
    graph.push({
      '@type': 'CreativeWork',
      '@id': `${SITE_URL}${page.path}#project`,
      name: page.project.name,
      description: page.project.description,
      url: `${SITE_URL}${page.path}`,
      genre: page.project.category,
      creator: { '@id': ORGANIZATION_ID },
      isPartOf: { '@id': `${SITE_URL}/portfolio#webpage` },
    });
  }
  if (page.faq?.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${SITE_URL}${page.path}#faq`,
      url: `${SITE_URL}${page.path}#faq`,
      isPartOf: { '@id': pageId },
      mainEntity: page.faq.map((item) => ({
        '@type': 'Question',
        name: item.name,
        acceptedAnswer: { '@type': 'Answer', text: item.text },
      })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
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
  SITE_URL,
  SERVICES,
  homeJsonLd,
  pageJsonLd,
  serializeJsonLdScript,
  organizationNode,
  serviceId,
  serviceNode,
};
