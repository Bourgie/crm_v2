const PAGES = [
  {
    path: '/desarrollo-web',
    kind: 'service',
    serviceSlug: 'desarrollo-web',
    breadcrumb: 'Desarrollo web',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'Desarrollo web para negocios | Un Fulano Dev',
    description: 'Paginas web y sitios institucionales pensados para presentar tu negocio desde Catamarca, Argentina.',
    h1: 'Desarrollo web para tu negocio',
    intro: 'Una web clara ayuda a que las personas entiendan que haces, confien en tu propuesta y sepan como contactarte.',
    sections: [
      {
        heading: 'Que puede resolver una pagina web',
        paragraphs: [
          'Una landing puede concentrar la informacion principal de tu negocio. Un sitio con varias secciones puede explicar mejor tus servicios, tu forma de trabajo y las consultas mas frecuentes.',
        ],
        bullets: ['Presentar servicios y formas de contacto', 'Ordenar informacion para clientes nuevos', 'Integrar WhatsApp, email y redes', 'Dejar una base preparada para crecer'],
      },
      {
        heading: 'Un sitio pensado para tu rubro',
        paragraphs: [
          'El contenido, la estructura y las llamadas a la accion se definen a partir de lo que necesita tu negocio. No hace falta empezar con un proyecto enorme: primero se aclara el alcance y despues se construye.',
        ],
      },
      {
        heading: 'Como empezamos',
        paragraphs: [
          'Me contas que haces, que queres mostrar y que consultas recibis. Con esa charla se puede definir una primera propuesta y revisar el alcance antes de avanzar.',
        ],
      },
    ],
    related: [
      { href: '/tiendas-online', label: 'Ver tiendas online' },
      { href: '/sistemas-a-medida', label: 'Conocer sistemas a medida' },
      { href: '/#portfolio', label: 'Explorar demos' },
    ],
    cta: { href: '/#contacto', label: 'Contar mi proyecto' },
  },
  {
    path: '/tiendas-online',
    kind: 'service',
    serviceSlug: 'tiendas-online',
    breadcrumb: 'Tiendas online',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'Tiendas online para vender por internet | Un Fulano Dev',
    description: 'Tiendas online con catalogo, carrito y cobros definidos segun las necesidades de tu negocio.',
    h1: 'Tiendas online para vender por internet',
    intro: 'Una tienda online permite mostrar un catalogo, recibir pedidos y ordenar el proceso de compra en un solo lugar.',
    sections: [
      {
        heading: 'Que puede incluir una tienda online',
        paragraphs: [
          'La estructura se define segun la cantidad de productos, las variantes, la forma de entrega y el modo en que queres recibir los pedidos.',
        ],
        bullets: ['Catalogo de productos', 'Categorias y fichas de producto', 'Carrito y flujo de consulta o compra', 'Integracion de cobros segun el proyecto', 'Panel para administrar el contenido cuando corresponda'],
      },
      {
        heading: 'Vender online sin perder el control',
        paragraphs: [
          'Ademas de mostrar productos, una tienda debe ayudarte a responder consultas, actualizar informacion y entender que necesita tu operacion. Por eso el alcance se conversa antes de elegir herramientas.',
        ],
      },
      {
        heading: 'Un proyecto que puede crecer',
        paragraphs: [
          'Se puede empezar con un catalogo acotado y sumar funciones cuando el negocio las necesite. La prioridad es que el primer lanzamiento sea claro y util.',
        ],
      },
    ],
    related: [
      { href: '/desarrollo-web', label: 'Ver desarrollo web' },
      { href: '/sistemas-a-medida', label: 'Conocer sistemas a medida' },
      { href: '/#portfolio', label: 'Ver demos de tiendas' },
    ],
    cta: { href: '/#contacto', label: 'Hablar sobre mi tienda' },
  },
  {
    path: '/sistemas-a-medida',
    kind: 'service',
    serviceSlug: 'sistemas-a-medida',
    breadcrumb: 'Sistemas a medida',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'Sistemas a medida para negocios | Un Fulano Dev',
    description: 'Sistemas de gestion y software a medida para ordenar procesos concretos de un negocio.',
    h1: 'Sistemas a medida para trabajar mejor',
    intro: 'Cuando una herramienta generica no encaja con tu forma de trabajar, un sistema a medida puede ordenar el proceso que mas tiempo te consume.',
    sections: [
      {
        heading: 'Cuando tiene sentido un sistema propio',
        paragraphs: [
          'Puede ser una buena opcion cuando hay tareas repetitivas, informacion repartida o reglas del negocio que las herramientas estandar no contemplan.',
        ],
        bullets: ['Centralizar informacion operativa', 'Reducir carga manual y duplicacion de datos', 'Acompanar procesos propios del negocio', 'Construir por etapas y prioridades'],
      },
      {
        heading: 'Algunos ejemplos de alcance',
        paragraphs: [
          'El proyecto puede involucrar gestion de clientes, stock, ventas, caja, pedidos o reportes. La lista final depende del problema que se quiera resolver y de los datos disponibles.',
        ],
      },
      {
        heading: 'Primero se entiende el problema',
        paragraphs: [
          'Antes de hablar de tecnologia, revisamos como se trabaja hoy, que informacion se pierde y que resultado seria util. Con eso se arma una primera etapa concreta.',
        ],
      },
    ],
    related: [
      { href: '/crm', label: 'Ver soluciones CRM' },
      { href: '/desarrollo-web', label: 'Ver desarrollo web' },
      { href: '/#portfolio', label: 'Ver demo de CRM retail' },
    ],
    cta: { href: '/#contacto', label: 'Contar un problema de gestion' },
  },
  {
    path: '/crm',
    kind: 'service',
    serviceSlug: 'crm',
    breadcrumb: 'CRM',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'CRM para negocios y equipos | Un Fulano Dev',
    description: 'CRM y herramientas de gestion para ordenar clientes, ventas y operaciones de un negocio.',
    h1: 'CRM para ordenar clientes y ventas',
    intro: 'Un CRM ayuda a reunir la informacion comercial y a seguir el trabajo cotidiano sin depender de planillas sueltas.',
    sections: [
      {
        heading: 'Que puede ordenar un CRM',
        paragraphs: [
          'El alcance depende del negocio. Puede incluir clientes, oportunidades, ventas, tareas, seguimiento, stock o reportes, siempre que esas funciones respondan a una necesidad real.',
        ],
        bullets: ['Fichas de clientes y contactos', 'Seguimiento de oportunidades', 'Historial de ventas y consultas', 'Tareas y estados de trabajo', 'Reportes para tomar decisiones'],
      },
      {
        heading: 'Una herramienta que acompana el proceso',
        paragraphs: [
          'El objetivo no es sumar pantallas, sino tener la informacion necesaria en el momento adecuado. Por eso conviene empezar por el proceso y no por una lista de modulos.',
        ],
      },
      {
        heading: 'Un producto relacionado',
        paragraphs: [
          'FlexCRM es una solucion de gestion orientada a comercios y pequenas empresas. Puede servir como punto de partida cuando las necesidades encajan con sus modulos.',
        ],
        links: [{ href: 'https://flexcrm.com.ar', label: 'Conocer FlexCRM' }],
      },
    ],
    related: [
      { href: '/sistemas-a-medida', label: 'Ver sistemas a medida' },
      { href: '/#portfolio', label: 'Ver demo de CRM retail' },
      { href: '/#contacto', label: 'Consultar por un sistema' },
    ],
    cta: { href: '/#contacto', label: 'Hablar sobre un CRM' },
  },
];

module.exports = { PAGES };
