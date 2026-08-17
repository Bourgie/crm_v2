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
  {
    path: '/portfolio',
    kind: 'portfolio-index',
    breadcrumb: 'Portfolio',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'Portfolio de demos web y sistemas | Un Fulano Dev',
    description: 'Demos de sitios web, tiendas online y sistemas creados para mostrar distintas posibilidades de trabajo.',
    h1: 'Demos de sitios, tiendas y sistemas',
    intro: 'Estos ejemplos muestran ideas de estructura y funcionalidad. Son demos con contenido de ejemplo, no reseñas ni resultados atribuidos a clientes.',
    sections: [
      {
        heading: 'Una muestra del tipo de trabajo',
        paragraphs: [
          'Cada demo parte de un rubro diferente para mostrar como puede organizarse la informacion, que acciones puede ofrecer una web y que tipo de experiencia puede tener una persona que la visita.',
        ],
      },
    ],
    items: [
      { path: '/portfolio/entremimos', name: 'Entre Mimos', category: 'Tienda online', description: 'Demo de catalogo para un negocio de bebes con lista de regalos.' },
      { path: '/portfolio/vertice-propiedades', name: 'Vertice Propiedades', category: 'Inmobiliaria', description: 'Demo de catalogo de propiedades con filtros y contacto directo.' },
      { path: '/portfolio/trama-indumentaria', name: 'TRAMA Indumentaria', category: 'Indumentaria', description: 'Demo de lookbook con coleccion filtrable y consulta por WhatsApp.' },
      { path: '/portfolio/el-fogon-del-valle', name: 'El Fogon del Valle', category: 'Gastronomia', description: 'Demo de menu interactivo y reservas por WhatsApp.' },
      { path: '/portfolio/crm-retail', name: 'CRM para retail', category: 'Sistema / CRM', description: 'Demo de gestion con ventas, stock, caja y cuenta corriente.' },
    ],
    related: [
      { href: '/desarrollo-web', label: 'Ver desarrollo web' },
      { href: '/tiendas-online', label: 'Ver tiendas online' },
      { href: '/sistemas-a-medida', label: 'Ver sistemas a medida' },
    ],
    cta: { href: '/#contacto', label: 'Consultar por un proyecto' },
  },
  {
    path: '/portfolio/entremimos',
    kind: 'portfolio-case',
    breadcrumb: 'Entre Mimos',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'Entre Mimos | Demo de tienda online | Un Fulano Dev',
    description: 'Demo de tienda online para mostrar catalogo de productos para bebes y lista de regalos.',
    h1: 'Entre Mimos: demo de tienda online',
    intro: 'Un ejemplo de como puede organizarse una tienda online de productos para bebes con catalogo y lista de regalos.',
    project: { name: 'Entre Mimos', category: 'Tienda online', description: 'Demo de catalogo para un negocio de bebes con lista de regalos.' },
    notice: 'Esta pagina presenta una demo con contenido de ejemplo. No es una reseña de cliente ni publica resultados comerciales.',
    sections: [
      { heading: 'Que problema explora', paragraphs: ['Como mostrar muchos productos de una forma simple y ofrecer una alternativa para organizar regalos y consultas.'] },
      { heading: 'Funciones representadas', bullets: ['Catalogo de productos', 'Categorias para recorrer la propuesta', 'Lista de regalos', 'Flujo de consulta o compra'] },
      { heading: 'Alcance del ejemplo', paragraphs: ['La demo sirve para conversar sobre estructura, contenido y prioridades. Un proyecto real se define con los datos y procesos del negocio correspondiente.'] },
    ],
    related: [
      { href: '/tiendas-online', label: 'Ver tiendas online' },
      { href: '/portfolio', label: 'Volver al portfolio' },
      { href: '/#contacto', label: 'Consultar por una tienda' },
    ],
    cta: { href: '/#contacto', label: 'Hablar sobre una tienda' },
  },
  {
    path: '/portfolio/vertice-propiedades',
    kind: 'portfolio-case',
    breadcrumb: 'Vertice Propiedades',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'Vertice Propiedades | Demo de sitio inmobiliario | Un Fulano Dev',
    description: 'Demo de sitio inmobiliario con catalogo de propiedades, filtros y contacto directo.',
    h1: 'Vertice Propiedades: demo inmobiliaria',
    intro: 'Un ejemplo de como presentar propiedades, facilitar filtros y llevar una consulta desde una ficha hasta WhatsApp.',
    project: { name: 'Vertice Propiedades', category: 'Inmobiliaria', description: 'Demo de catalogo de propiedades con filtros y contacto directo.' },
    notice: 'Esta pagina presenta una demo con contenido de ejemplo. No es un caso de resultados ni una ficha de una inmobiliaria real.',
    sections: [
      { heading: 'Que problema explora', paragraphs: ['Como ordenar una oferta de propiedades para que una persona pueda recorrerla y encontrar una opcion relevante.'] },
      { heading: 'Funciones representadas', bullets: ['Catalogo de propiedades', 'Filtros para acotar la busqueda', 'Fichas con informacion principal', 'Contacto directo por WhatsApp'] },
      { heading: 'Alcance del ejemplo', paragraphs: ['La estructura se puede adaptar a la informacion, zonas y formas de contacto de un negocio inmobiliario real.'] },
    ],
    related: [
      { href: '/desarrollo-web', label: 'Ver desarrollo web' },
      { href: '/portfolio', label: 'Volver al portfolio' },
      { href: '/#contacto', label: 'Consultar por un sitio' },
    ],
    cta: { href: '/#contacto', label: 'Hablar sobre un sitio inmobiliario' },
  },
  {
    path: '/portfolio/trama-indumentaria',
    kind: 'portfolio-case',
    breadcrumb: 'TRAMA Indumentaria',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'TRAMA Indumentaria | Demo de lookbook | Un Fulano Dev',
    description: 'Demo de lookbook para indumentaria con coleccion filtrable y consultas por WhatsApp.',
    h1: 'TRAMA Indumentaria: demo de lookbook',
    intro: 'Un ejemplo editorial para mostrar una coleccion de indumentaria y convertir el interes en una consulta.',
    project: { name: 'TRAMA Indumentaria', category: 'Indumentaria', description: 'Demo de lookbook con coleccion filtrable y consulta por WhatsApp.' },
    notice: 'Esta pagina presenta una demo con contenido de ejemplo. No es un testimonio ni publica datos de ventas.',
    sections: [
      { heading: 'Que problema explora', paragraphs: ['Como combinar una presentacion visual de producto con una navegacion que ayude a encontrar una prenda o coleccion.'] },
      { heading: 'Funciones representadas', bullets: ['Lookbook editorial', 'Coleccion organizada por categorias', 'Filtros para recorrer productos', 'Consulta de compra por WhatsApp'] },
      { heading: 'Alcance del ejemplo', paragraphs: ['El contenido final, las fotos y el proceso de compra se definen con el negocio que quiera publicar su propia propuesta.'] },
    ],
    related: [
      { href: '/desarrollo-web', label: 'Ver desarrollo web' },
      { href: '/tiendas-online', label: 'Ver tiendas online' },
      { href: '/portfolio', label: 'Volver al portfolio' },
    ],
    cta: { href: '/#contacto', label: 'Consultar por una web de indumentaria' },
  },
  {
    path: '/portfolio/el-fogon-del-valle',
    kind: 'portfolio-case',
    breadcrumb: 'El Fogon del Valle',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'El Fogon del Valle | Demo gastronomica | Un Fulano Dev',
    description: 'Demo de sitio gastronomico con menu interactivo y reservas por WhatsApp.',
    h1: 'El Fogon del Valle: demo gastronomica',
    intro: 'Un ejemplo de como una propuesta gastronomica puede presentar su menu y facilitar una reserva desde el celular.',
    project: { name: 'El Fogon del Valle', category: 'Gastronomia', description: 'Demo de menu interactivo y reservas por WhatsApp.' },
    notice: 'Esta pagina presenta una demo con contenido de ejemplo. No es una pagina oficial ni publica reseñas o resultados.',
    sections: [
      { heading: 'Que problema explora', paragraphs: ['Como hacer que una persona encuentre rapido el menu, entienda la propuesta y sepa como consultar o reservar.'] },
      { heading: 'Funciones representadas', bullets: ['Menu interactivo', 'Presentacion de una propuesta gastronomica', 'Informacion util para la visita', 'Reservas por WhatsApp'] },
      { heading: 'Alcance del ejemplo', paragraphs: ['Los horarios, ubicacion, menu y medios de reserva deben confirmarse con el negocio antes de publicar un sitio real.'] },
    ],
    related: [
      { href: '/desarrollo-web', label: 'Ver desarrollo web' },
      { href: '/portfolio', label: 'Volver al portfolio' },
      { href: '/#contacto', label: 'Consultar por un sitio gastronomico' },
    ],
    cta: { href: '/#contacto', label: 'Hablar sobre un sitio gastronomico' },
  },
  {
    path: '/portfolio/crm-retail',
    kind: 'portfolio-case',
    breadcrumb: 'CRM para retail',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'CRM para retail | Demo de sistema de gestion | Un Fulano Dev',
    description: 'Demo de sistema de gestion para retail con ventas, stock, caja y cuenta corriente.',
    h1: 'CRM para retail: demo de sistema de gestion',
    intro: 'Un ejemplo de sistema para reunir ventas, stock, caja y cuenta corriente en una misma herramienta.',
    project: { name: 'CRM para retail', category: 'Sistema / CRM', description: 'Demo de gestion con ventas, stock, caja y cuenta corriente.' },
    notice: 'Esta pagina presenta una demo de producto. No es un caso de estudio con metricas ni una reseña de cliente.',
    sections: [
      { heading: 'Que problema explora', paragraphs: ['Como reunir operaciones que muchas veces quedan separadas entre planillas, anotaciones y herramientas distintas.'] },
      { heading: 'Funciones representadas', bullets: ['Ventas y clientes', 'Stock y productos', 'Caja y movimientos', 'Cuenta corriente', 'Gestion para mas de una sucursal'] },
      { heading: 'Producto relacionado', paragraphs: ['FlexCRM es el producto de gestion relacionado con esta demo. Sus modulos y disponibilidad deben evaluarse segun cada negocio.'], links: [{ href: 'https://flexcrm.com.ar', label: 'Conocer FlexCRM' }] },
    ],
    related: [
      { href: '/crm', label: 'Ver servicio CRM' },
      { href: '/sistemas-a-medida', label: 'Ver sistemas a medida' },
      { href: '/portfolio', label: 'Volver al portfolio' },
    ],
    cta: { href: '/#contacto', label: 'Consultar por un sistema' },
  },
  {
    path: '/desarrollo-web-catamarca',
    kind: 'local',
    breadcrumb: 'Desarrollo web en Catamarca',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'Desarrollo web en Catamarca | Un Fulano Dev',
    description: 'Desarrollo web, paginas web y diseño web para negocios de Catamarca, Argentina.',
    h1: 'Desarrollo web en Catamarca para negocios',
    intro: 'Trabajo desde Catamarca con una mirada practica: entender que necesita tu negocio y convertirlo en una web que la gente pueda usar.',
    sections: [
      {
        heading: 'Paginas web que explican lo que haces',
        paragraphs: [
          'Una pagina web puede servir para presentar servicios, mostrar productos, recibir consultas y darle a tu negocio un lugar propio mas alla de las redes sociales.',
        ],
        bullets: ['Landing pages para una propuesta concreta', 'Sitios institucionales con varias secciones', 'Integracion con WhatsApp, email y redes', 'Contenido pensado para personas de Catamarca y de otras zonas'],
      },
      {
        heading: 'Diseño web y desarrollo en un mismo proyecto',
        paragraphs: [
          'La estructura visual y la parte tecnica tienen que trabajar juntas. Por eso se revisa que informacion hace falta, como se navega y cual es el siguiente paso para quien visita la pagina.',
        ],
      },
      {
        heading: 'Una charla antes de empezar',
        paragraphs: [
          'Contame de tu rubro, tus clientes y lo que hoy te cuesta explicar. Con eso se puede definir una primera etapa sin llenar formularios interminables.',
        ],
      },
    ],
    related: [
      { href: '/desarrollo-web', label: 'Ver desarrollo web' },
      { href: '/tiendas-online-catamarca', label: 'Ver tiendas online en Catamarca' },
      { href: '/sistemas-a-medida', label: 'Ver software a medida' },
    ],
    cta: { href: '/#contacto', label: 'Consultar por una pagina web' },
  },
  {
    path: '/tiendas-online-catamarca',
    kind: 'local',
    breadcrumb: 'Tiendas online en Catamarca',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'Tiendas online en Catamarca | Un Fulano Dev',
    description: 'Tiendas online para catalogos, pedidos y ventas por internet desde Catamarca, Argentina.',
    h1: 'Tiendas online en Catamarca',
    intro: 'Si tenes productos para mostrar y pedidos que ordenar, una tienda online puede convertirse en un canal propio para vender.',
    sections: [
      {
        heading: 'Pensada para la forma de vender de tu negocio',
        paragraphs: [
          'No todos los negocios venden igual. Se conversa si necesitas catalogo, carrito, consultas por WhatsApp, cobros online, entregas o retiro, y se define el alcance a partir de eso.',
        ],
        bullets: ['Catalogos de productos y categorias', 'Variantes, precios e informacion util', 'Pedidos y consultas desde la web', 'Integracion de cobros segun el proyecto', 'Base para administrar el contenido'],
      },
      {
        heading: 'Vender desde Catamarca y llegar mas lejos',
        paragraphs: [
          'Una tienda online puede atender consultas locales y tambien mostrar tu propuesta a personas de otras ciudades. La comunicacion, los envios y los medios de pago se definen con datos reales del negocio.',
        ],
      },
      {
        heading: 'Empezar por un catalogo posible',
        paragraphs: [
          'No hace falta cargar todo de una vez. Se puede planificar una primera version con los productos y procesos mas importantes, y ampliar despues.',
        ],
      },
    ],
    related: [
      { href: '/tiendas-online', label: 'Ver tiendas online' },
      { href: '/desarrollo-web-catamarca', label: 'Ver desarrollo web en Catamarca' },
      { href: '/#portfolio', label: 'Explorar demos' },
    ],
    cta: { href: '/#contacto', label: 'Hablar sobre una tienda' },
  },
  {
    path: '/sobre-nosotros',
    kind: 'about',
    breadcrumb: 'Sobre Un Fulano Dev',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'Sobre Un Fulano Dev | Desarrollo web desde Catamarca',
    description: 'Conoce la forma de trabajo de Un Fulano Dev, un servicio de desarrollo web desde Catamarca, Argentina.',
    h1: 'Sobre Un Fulano Dev',
    intro: 'Un Fulano Dev es una forma directa de trabajar en desarrollo web: hablas con la persona que piensa y construye el proyecto.',
    sections: [
      {
        heading: 'Una comunicacion sin vueltas',
        paragraphs: [
          'La idea es entender el negocio antes de hablar de herramientas. Se explica lo necesario en lenguaje claro y se revisa el alcance antes de empezar.',
        ],
      },
      {
        heading: 'Que se puede construir',
        paragraphs: [
          'El trabajo incluye paginas web, tiendas online, sistemas a medida y herramientas de gestion. Cada proyecto se define segun el problema y la etapa del negocio.',
        ],
      },
      {
        heading: 'Una relacion de trabajo clara',
        paragraphs: [
          'No se publican reseñas, resultados o nombres de clientes sin autorizacion. El portfolio muestra demos y ejemplos de trabajo para explicar posibilidades.',
        ],
      },
    ],
    related: [
      { href: '/desarrollo-web-catamarca', label: 'Desarrollo web en Catamarca' },
      { href: '/sistemas-a-medida', label: 'Sistemas a medida' },
      { href: '/#portfolio', label: 'Ver portfolio' },
    ],
    cta: { href: '/#contacto', label: 'Contar mi proyecto' },
  },
  {
    path: '/contacto',
    kind: 'contact',
    breadcrumb: 'Contacto',
    status: 'published',
    lastmod: '2026-08-17',
    title: 'Contacto | Un Fulano Dev',
    description: 'Contacta a Un Fulano Dev para hablar sobre una pagina web, tienda online, sistema o CRM.',
    h1: 'Hablemos de tu proyecto',
    intro: 'La mejor forma de empezar es contar que haces, que queres resolver y que te gustaria que pase con tu web.',
    sections: [
      {
        heading: 'Por WhatsApp',
        paragraphs: ['Si preferis una conversacion directa, podes escribir por WhatsApp y contarme de que se trata.'],
        links: [{ href: 'https://wa.me/5493517424391', label: 'Escribir por WhatsApp' }],
      },
      {
        heading: 'Por email',
        paragraphs: ['Tambien podes enviar una consulta por email con la informacion que ya tengas.'],
        links: [{ href: 'mailto:contacto@unfulanodev.com.ar', label: 'Enviar un email' }],
      },
      {
        heading: 'Que conviene contar',
        paragraphs: ['No hace falta preparar un documento. Con estos datos alcanza para una primera charla:'],
        bullets: ['De que es tu negocio', 'Que queres mostrar o mejorar', 'Si necesitas una web, una tienda o un sistema', 'Como te gustaria que te contacten'],
      },
    ],
    related: [
      { href: '/desarrollo-web', label: 'Desarrollo web' },
      { href: '/tiendas-online', label: 'Tiendas online' },
      { href: '/crm', label: 'CRM' },
    ],
    cta: { href: '/#contacto', label: 'Usar el formulario de la home' },
  },
  {
    path: '/privacidad',
    kind: 'legal',
    breadcrumb: 'Privacidad',
    status: 'published',
    indexable: false,
    robots: 'noindex, nofollow, noarchive',
    lastmod: '2026-08-17',
    title: 'Privacidad | Un Fulano Dev',
    description: 'Información sobre el formulario de contacto y las mediciones del sitio de Un Fulano Dev.',
    h1: 'Privacidad y datos de contacto',
    intro: 'Esta información explica qué datos pueden enviarse cuando usás el formulario o aceptás la medición de visitas. Debe revisarse antes de publicarse como texto legal definitivo.',
    sections: [
      {
        heading: 'Formulario de contacto',
        paragraphs: ['Si completás el formulario, se envían los datos que ingreses, como nombre, email, teléfono y mensaje, al servicio que gestiona las consultas de Un Fulano Dev.'],
      },
      {
        heading: 'Medición del sitio',
        paragraphs: ['La medición se activa después del consentimiento. Puede incluir información técnica de la visita, referencia y parámetros UTM permitidos para entender de dónde llegan las consultas.'],
      },
      {
        heading: 'Consultas',
        paragraphs: ['Para consultar sobre tus datos o pedir una revisión, escribí a contacto@unfulanodev.com.ar. Los plazos de conservación y otros detalles legales deben confirmarse antes de publicar esta página como política definitiva.'],
      },
    ],
    related: [
      { href: '/contacto', label: 'Ir a contacto' },
      { href: '/', label: 'Volver al inicio' },
    ],
    cta: { href: '/contacto', label: 'Consultar sobre datos' },
  },
];

module.exports = { PAGES };
