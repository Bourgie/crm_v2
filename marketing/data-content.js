// Contenido editorial de FlexCRM: funcionalidades, soluciones por rubro,
// comparativas, blog y documentación pública.

const FEATURES = [
  {
    slug: 'punto-de-venta',
    name: 'Punto de Venta',
    icon: '🛒',
    title: 'Punto de Venta (POS) para comercios',
    description:
      'POS para comercios en Argentina: buscá productos por código, nombre o categoría, armá el carrito, aplicá descuentos y cobrá rápido desde Caja.',
    short: 'Vendé rápido con búsqueda por código, nombre o categoría. Carrito, descuentos y cobro en segundos.',
    intro: [
      'El Punto de Venta de FlexCRM está pensado para el ritmo del comercio argentino. En un mostrador o en un local con movimiento, cada segundo cuenta: buscás el producto, lo agregás al carrito y cobrás.',
      'El POS está integrado con la Caja y con el stock. Cada venta descuenta productos automáticamente y queda registrada con su método de cobro, para que el cierre del día sea claro.',
    ],
    problem: [
      'Vender con planillas obliga a anotar cada producto a mano y después reingresar la información.',
      'Sin un POS, el cobro queda desordenado y al final del día no sabés qué se vendió ni cuánto se cobró.',
      'Los sistemas genéricos no entienden la dinámica de un comercio real: búsqueda lenta, pantallas de más y errores en el apuro.',
    ],
    how: [
      'Buscá productos por código de barras, nombre o categoría mientras atendés.',
      'Armá el carrito con cantidades, descuentos y observaciones si las necesitás.',
      'Registrá la venta y pasala a cobrar desde Caja con el método que elija el cliente.',
      'El stock se descuenta en el momento, por sucursal.',
      'Después, todo queda disponible en Ventas y Reportes con el detalle del día.',
    ],
    bullets: [
      'Búsqueda por código, nombre o categoría',
      'Carrito con descuentos y observaciones',
      'Cobro conectado con Caja',
      'Descuento de stock automático por sucursal',
      'Registro de ventas para reportes y auditoría',
    ],
    faq: [
      {
        q: '¿El POS funciona con lector de código de barras?',
        a: 'Sí. El POS busca productos por código de barras, además de por nombre y categoría. También incluye escáner con cámara en los dispositivos que lo permitan.',
      },
      {
        q: '¿La venta se cobra directo desde el POS?',
        a: 'El POS registra la venta y el cobro se completa desde el módulo de Caja, que admite efectivo, débito, crédito, QR y transferencias. Así el arqueo de caja siempre refleja lo cobrado.',
      },
      {
        q: '¿Qué pasa con el stock al vender?',
        a: 'El stock de la sucursal se descuenta automáticamente al registrar la venta. Si un producto no tiene stock, podés registrar el pedido como pendiente y entregarlo después.',
      },
    ],
  },
  {
    slug: 'control-de-stock',
    name: 'Control de Stock',
    icon: '📦',
    title: 'Control de stock por sucursal para comercios',
    description:
      'Controlá el stock de tu comercio por sucursal, con variantes, alertas de stock bajo, movimientos, ajustes y transferencias entre locales.',
    short: 'Stock por sucursal, variantes (talle, color, sabor), alertas de stock bajo y transferencias entre locales.',
    intro: [
      'El stock es la plata inmovilizada de cualquier comercio. FlexCRM te muestra cuántas unidades tenés de cada producto y en qué sucursal, sin depender de planillas que nadie actualiza.',
      'Cada venta, ajuste y transferencia genera un movimiento registrado. Si algo no cierra, podés rastrear qué pasó en lugar de adivinar.',
    ],
    problem: [
      'Las planillas de stock quedan desactualizadas al segundo día y las diferencias se acumulan.',
      'Sin stock por sucursal, no sabés qué tenés en cada local y terminás pidiendo de más o vendiendo de menos.',
      'Los productos con variantes (talle, color, sabor) son imposibles de controlar a mano.',
    ],
    how: [
      'Cargá productos con código, categoría, precio y variantes.',
      'Mirá el stock de cada producto por sucursal en una sola pantalla.',
      'Configurá niveles de stock mínimo para recibir alertas de reposición.',
      'Registrá ajustes y mirá el historial de movimientos de cada producto.',
      'Con los planes Pro y Enterprise, transferí stock entre sucursales con un flujo de envío y recepción.',
    ],
    bullets: [
      'Stock por sucursal',
      'Variantes: talle, color, sabor y más',
      'Alertas de stock bajo',
      'Historial de movimientos y ajustes',
      'Transferencias entre sucursales',
      'Importación de productos por Excel',
    ],
    faq: [
      {
        q: '¿Puedo controlar talles y colores?',
        a: 'Sí. FlexCRM soporta variantes por producto, como talle, color o sabor, con stock independiente para cada variante.',
      },
      {
        q: '¿Cómo me entero cuando un producto está por agotarse?',
        a: 'Configurás un stock mínimo por producto y FlexCRM te avisa cuando alguna sucursal baja de ese nivel, para que repongas a tiempo.',
      },
      {
        q: '¿Puedo pasar stock de un local a otro?',
        a: 'Sí. En los planes Pro y Enterprise podés crear transferencias entre sucursales con estados de envío y recepción, para que el stock de cada local quede consistente.',
      },
      {
        q: '¿Puedo cargar mi catálogo actual?',
        a: 'Sí, los productos se pueden importar desde Excel para no cargar todo a mano.',
      },
    ],
  },
  {
    slug: 'caja',
    name: 'Caja',
    icon: '💰',
    title: 'Caja para comercios: apertura, arqueo y cierre',
    description:
      'Controlá la caja de tu comercio con apertura, cierre, arqueo de efectivo, cobro multi-método y movimientos de ingresos y egresos.',
    short: 'Apertura, cierre, movimientos y arqueo. Controlá efectivo, débito, crédito, QR y transferencias.',
    intro: [
      'La Caja de FlexCRM registra todo lo que entra y sale de cada sucursal. Abrís la caja al empezar el día, cobrás las ventas por el método que corresponda y cerrás con un arqueo que compara lo esperado con lo contado.',
      'Cada movimiento queda registrado con responsable y horario. Si al cierre hay una diferencia, sabés exactamente dónde mirar.',
    ],
    problem: [
      'El efectivo sin registro diario termina en diferencias que nadie puede explicar.',
      'Mezclar efectivo, débito, crédito, QR y transferencias en una planilla es una fuente constante de errores.',
      'Sin apertura y cierre por sucursal, no hay forma de saber cuánto cobró cada local.',
    ],
    how: [
      'Abrí la caja de la sucursal al inicio del turno.',
      'Cobrá ventas con efectivo, débito, crédito, QR o transferencia, incluso combinando métodos.',
      'Registrá ingresos y egresos manuales cuando corresponda.',
      'Cerrá la caja y compará el arqueo esperado con el efectivo contado.',
      'Revisá el historial de movimientos y el detalle por método de pago.',
    ],
    bullets: [
      'Apertura y cierre por sucursal',
      'Cobro multi-método: efectivo, débito, crédito, QR y transferencias',
      'Arqueo con diferencia entre esperado y contado',
      'Ingresos y egresos manuales',
      'Historial de movimientos por responsable',
    ],
    faq: [
      {
        q: '¿Puedo cobrar una venta con dos métodos de pago?',
        a: 'Sí. El cobro multi-método permite dividir el pago de una venta entre efectivo, tarjeta, QR o transferencia y dejar registrado cuánto entró por cada uno.',
      },
      {
        q: '¿Cómo funciona el cierre de caja?',
        a: 'Al cerrar, FlexCRM compara el efectivo esperado según las ventas y movimientos con el monto que contás. La diferencia queda registrada para revisarla con el detalle del día.',
      },
      {
        q: '¿La caja es independiente por sucursal?',
        a: 'Sí. Cada sucursal abre y cierra su propia caja. Los planes Pro y Enterprise suman Tesorería, una bóveda central que consolida los movimientos de todas las sucursales.',
      },
    ],
  },
  {
    slug: 'clientes',
    name: 'Clientes',
    icon: '👥',
    title: 'Gestión de clientes para comercios',
    description:
      'Ficha de clientes con historial de compras, saldo a favor, puntos de fidelización y clasificación automática para tu comercio.',
    short: 'Ficha completa, historial de compras, cuenta corriente, saldo a favor y fidelización por puntos.',
    intro: [
      'Conocer al cliente es la diferencia entre vender una vez y vender siempre. FlexCRM guarda la ficha de cada cliente con su historial de compras, su cuenta corriente y su actividad en el local.',
      'Sin esfuerzo extra, el sistema clasifica a los clientes según su frecuencia de compra y les acumula puntos, para que sepas a quién premiar y a quién recuperar.',
    ],
    problem: [
      'Los cuadernos y las planillas de clientes se pierden cuando cambia quien atiende.',
      'Sin historial de compras, no podés recomendar ni ofrecer promociones acertadas.',
      'No sabés cuáles son tus clientes frecuentes ni cuánto hace que no vuelven.',
    ],
    how: [
      'Creá la ficha del cliente con datos de contacto y documentación.',
      'Cada venta queda asociada al cliente y alimenta su historial automáticamente.',
      'Consultá saldo de cuenta corriente, puntos y compras en segundos desde el POS.',
      'El sistema clasifica a los clientes según su actividad para que priorices los contactos.',
      'Importá o exportá tu base actual desde Excel.',
    ],
    bullets: [
      'Ficha de cliente con datos de contacto',
      'Historial de compras automático',
      'Puntos de fidelización',
      'Clasificación por frecuencia de compra',
      'Importación y exportación por Excel',
      'Detección de clientes duplicados',
    ],
    faq: [
      {
        q: '¿Puedo migrar mi base de clientes actual?',
        a: 'Sí, podés importar clientes desde Excel y arrancar con tu base histórica.',
      },
      {
        q: '¿Cómo funciona la fidelización por puntos?',
        a: 'Los clientes acumulan puntos con sus compras y el saldo queda visible en su ficha, para canjearlo según las promociones que definas.',
      },
      {
        q: '¿Veo las compras de un cliente desde el POS?',
        a: 'Sí. Al asociar un cliente a la venta, su historial y su saldo están a un toque, para atenderlo con contexto.',
      },
    ],
  },
  {
    slug: 'cuenta-corriente',
    name: 'Cuenta Corriente',
    icon: '📒',
    title: 'Cuenta corriente y cobros para comercios',
    description:
      'Manejá la cuenta corriente de tus clientes con límites de crédito, vencimientos, pagos y detección de pagos duplicados.',
    short: 'Límite de crédito por cliente, saldo deudor, vencimientos y registro de pagos.',
    intro: [
      'Vender en cuenta corriente es normal en el comercio argentino, pero cobrar lo fiado es otra historia. FlexCRM lleva el saldo de cada cliente con su límite de crédito y sus vencimientos, para que sepas cuánto debés cobrar y a quién.',
      'Los cobros parciales o totales se registran desde Caja, con aviso si un pago ya fue cargado, para evitar duplicados.',
    ],
    problem: [
      'Sin registro formal, la cuenta corriente se transforma en deudas que se olvidan o se discuten.',
      'Nadie sabe a simple vista cuánto debe cada cliente ni desde cuándo.',
      'Los cobros duplicados o los pagos sin registrar ensucian los saldos.',
    ],
    how: [
      'Definí un límite de crédito para cada cliente.',
      'Cada venta fiada actualiza el saldo de la cuenta corriente.',
      'Registrá pagos parciales o totales desde Caja y descontá el saldo.',
      'FlexCRM avisa cuando un pago ya fue cargado, para evitar duplicados.',
      'Consultá deudores y vencimientos desde el módulo de cuenta corriente.',
    ],
    bullets: [
      'Límite de crédito por cliente',
      'Saldo deudor y a favor',
      'Registro de pagos desde Caja',
      'Detección de pagos duplicados',
      'Pedidos pendientes con seña y entregas parciales',
    ],
    faq: [
      {
        q: '¿Cómo evito cargar un pago dos veces?',
        a: 'FlexCRM detecta recibos de transferencia ya cargados y te avisa antes de duplicar un pago.',
      },
      {
        q: '¿Puedo vender fiado con un tope por cliente?',
        a: 'Sí. Cada cliente puede tener su propio límite de crédito y el saldo se actualiza con cada venta y cada pago.',
      },
      {
        q: '¿Qué pasa con una seña y una entrega parcial?',
        a: 'Los pedidos pendientes admiten señas y entregas parciales: cada pago queda registrado en Caja y descuenta el saldo correspondiente.',
      },
    ],
  },
  {
    slug: 'reportes',
    name: 'Reportes',
    icon: '📊',
    title: 'Reportes de ventas y KPIs para comercios',
    description:
      'Dashboard con KPIs, ventas por período, ranking de productos y clientes, comisiones por vendedor y exportación a Excel.',
    short: 'Dashboard con KPIs, ventas por período, ranking de productos y comisiones por vendedor.',
    intro: [
      'Los datos de tu comercio están en FlexCRM todo el tiempo. Los Reportes los convierten en decisiones: qué vendés, cuándo, en qué sucursal y con qué margen.',
      'Del dashboard general al ranking de productos, pasando por las comisiones de los vendedores, todo se puede filtrar por período y por sucursal, y exportar a Excel si necesitás compartirlo.',
    ],
    problem: [
      'Sin reportes, las decisiones de compra y de precios se toman a ojo.',
      'Armar informes a mano lleva horas y siempre están desactualizados.',
      'No hay forma objetiva de medir a los vendedores ni a las sucursales.',
    ],
    how: [
      'Mirá el dashboard con los KPIs principales del día y del mes.',
      'Filtrá ventas por período, sucursal y vendedor.',
      'Consultá el ranking de productos y de clientes.',
      'Calculá comisiones por vendedor sobre las ventas del período.',
      'Exportá todo a Excel para contabilidad o presentaciones.',
    ],
    bullets: [
      'Dashboard con KPIs',
      'Ventas por período, sucursal y vendedor',
      'Ranking de productos y clientes',
      'Comisiones por vendedor',
      'Margen y ticket promedio',
      'Exportación a Excel',
    ],
    faq: [
      {
        q: '¿Puedo filtrar los reportes por sucursal?',
        a: 'Sí. Los reportes se filtran por período, sucursal y vendedor, para comparar locales y equipos.',
      },
      {
        q: '¿Se pueden exportar los reportes?',
        a: 'Sí, los reportes se exportan a Excel para usarlos en contabilidad o en reuniones.',
      },
      {
        q: '¿Calcula comisiones de vendedores?',
        a: 'Sí, podés ver las ventas por vendedor y calcular comisiones sobre el período que elijas.',
      },
    ],
  },
  {
    slug: 'multi-sucursal',
    name: 'Multi-sucursal',
    icon: '🏪',
    title: 'Sistema multi-sucursal para comercios',
    description:
      'Manejá varios locales desde una misma cuenta de FlexCRM, con stock y caja independientes por sucursal y transferencias entre locales.',
    short: 'Manejá varios locales desde un mismo lugar. Stock y caja independientes por sucursal.',
    intro: [
      'Cuando el negocio crece a más de un local, el control se complica: cada sucursal tiene su stock, su caja y su gente. FlexCRM lo resuelve con una sola cuenta y sucursales independientes.',
      'Cada local opera con su propia caja y su propio stock, mientras el dueño mira todo desde una sola cuenta, con reportes consolidados y transferencias entre locales.',
    ],
    problem: [
      'Con varios locales y un solo sistema, se mezclan ventas, stock y caja.',
      'Sin transferencias entre sucursales, el stock queda mal repartido.',
      'Cada local termina anotando a su manera y la información se pierde.',
    ],
    how: [
      'Creá una sucursal por local dentro de la misma cuenta.',
      'Cada sucursal abre su caja y maneja su stock de forma independiente.',
      'Asigná usuarios y permisos por sucursal.',
      'Transferí stock entre locales con flujo de envío y recepción.',
      'Mirá reportes por sucursal o consolidados según lo necesites.',
    ],
    bullets: [
      'Varias sucursales en una misma cuenta',
      'Stock y caja independientes por local',
      'Permisos de usuario por sucursal',
      'Transferencias entre locales',
      'Reportes por sucursal y consolidados',
    ],
    faq: [
      {
        q: '¿Cuántas sucursales puedo manejar?',
        a: 'Depende del plan: 1 sucursal en Demo y Básico, hasta 3 en Pro y a escala de empresa en Enterprise.',
      },
      {
        q: '¿Cada sucursal tiene su propia caja?',
        a: 'Sí. Cada sucursal abre, cobra y cierra su propia caja. Los planes Pro y Enterprise suman Tesorería con una bóveda central consolidada.',
      },
      {
        q: '¿Puedo limitar qué ve cada usuario?',
        a: 'Sí. Los usuarios se asignan a sucursales y roles, de modo que cada persona ve solo lo que corresponde a su local y su función.',
      },
    ],
  },
  {
    slug: 'facturacion-arca',
    name: 'Facturación ARCA',
    icon: '📄',
    title: 'Facturación electrónica ARCA (AFIP) para comercios',
    description:
      'Emití factura electrónica A, B y C con CAE y nota de crédito desde FlexCRM, integrado con ARCA (AFIP). Disponible en planes Pro y Enterprise.',
    short: 'Factura electrónica A, B y C con CAE, integrada con ARCA (AFIP). Sin sistemas externos.',
    intro: [
      'La facturación electrónica dejó de ser opcional para los comercios argentinos. FlexCRM emite facturas A, B y C integradas con ARCA (ex AFIP), con CAE y numeración por punto de venta.',
      'La facturación se habilita desde los planes Pro y Enterprise y requiere configurar las credenciales fiscales de la empresa en Ajustes. Una vez configurado, facturás sin salir del sistema.',
    ],
    problem: [
      'Usar un sistema para vender y otro para facturar obliga a cargar todo dos veces.',
      'Los errores de facturación salen caros: comprobantes rechazados, notas de crédito mal hechas y demoras.',
      'Saltar entre plataformas le quita tiempo al mostrador y agrega riesgo de equivocarse.',
    ],
    how: [
      'Configurá el punto de venta y las credenciales de ARCA en Ajustes.',
      'Facturá la venta cobrada desde Caja con el tipo A, B o C según corresponda.',
      'FlexCRM valida la condición fiscal de la empresa y del cliente antes de emitir.',
      'El CAE y la numeración quedan guardados en la venta.',
      'Si hay que anular, emití la nota de crédito correspondiente desde el sistema.',
    ],
    bullets: [
      'Factura A, B y C',
      'Nota de crédito',
      'CAE y vencimiento guardados en la venta',
      'Numeración por punto de venta',
      'Validación de condición fiscal de empresa y cliente',
    ],
    faq: [
      {
        q: '¿En qué planes está disponible la facturación ARCA?',
        a: 'En los planes Pro y Enterprise. Requiere configurar el punto de venta y las credenciales fiscales de la empresa en Ajustes.',
      },
      {
        q: '¿Qué tipos de comprobante emite?',
        a: 'Factura A, B y C, y nota de crédito para anular comprobantes ya emitidos. El tipo válido depende de la condición fiscal de la empresa y del cliente, y FlexCRM lo valida antes de emitir.',
      },
      {
        q: '¿Necesito otro sistema para facturar?',
        a: 'No. La emisión se hace desde FlexCRM, integrada con ARCA, sin saltar a otra plataforma.',
      },
    ],
  },
];

const SOLUTIONS = [
  {
    slug: 'indumentaria',
    rubro: 'Indumentaria',
    icon: '👕',
    title: 'Sistema de gestión para tiendas de ropa',
    description:
      'Sistema para tiendas de ropa e indumentaria en Argentina: control de stock por talle y color, clientes con historial, caja diaria y ventas por local.',
    intro: [
      'Vender ropa significa manejar talles, colores, temporadas y clientas que vuelven. FlexCRM controla el stock por variante y por sucursal, registra cada venta en caja y guarda el historial de cada cliente.',
      'Si tenés más de un local, cada sucursal maneja su stock y su caja, con transferencias de prendas entre locales para no perder una venta por falta de talle.',
    ],
    pain: [
      'Los talles y colores multiplican los SKUs y las planillas se vuelven inmanejables.',
      'Sin historial de la clienta, no sabés qué ofrecerle en su próxima visita.',
      'Las liquidaciones y promociones exigen control fino para no vender por debajo del costo.',
    ],
    how: [
      'Productos con variantes de talle y color, y stock por sucursal.',
      'Ventas por POS con descuentos y cobro en Caja.',
      'Clientas con historial de compras, saldo y puntos.',
      'Transferencias de prendas entre locales.',
      'Reportes de ventas por período, sucursal y vendedor.',
    ],
    faq: [
      {
        q: '¿Puedo controlar el stock por talle y color?',
        a: 'Sí. Cada producto puede tener variantes con stock independiente, por ejemplo un mismo modelo en talles S, M y L y varios colores.',
      },
      {
        q: '¿Sirve para más de un local?',
        a: 'Sí. Con los planes Pro y Enterprise manejás varias sucursales con stock y caja independientes, y transferencias de prendas entre locales.',
      },
    ],
  },
  {
    slug: 'ferreterias',
    rubro: 'Ferreterías',
    icon: '🔩',
    title: 'Sistema de gestión para ferreterías',
    description:
      'Sistema para ferreterías en Argentina: stock de miles de artículos con alertas de reposición, ventas rápidas por POS, cuenta corriente y caja diaria.',
    intro: [
      'Una ferretería maneja miles de artículos y precios que cambian todo el tiempo. FlexCRM busca por código, nombre o categoría, actualiza precios por lista y controla el stock con alertas de reposición.',
      'La venta de mostrador es rápida: carrito, descuento y cobro en Caja. Y para los clientes de obra, la cuenta corriente con límite de crédito evita sorpresas al fin de mes.',
    ],
    pain: [
      'El catálogo de una ferretería es enorme y actualizar precios a mano es inviable.',
      'Los clientes de obra piden fiado y sin un registro claro se pierden los cobros.',
      'Las diferencias de stock en artículos de alta rotación generan faltantes constantes.',
    ],
    how: [
      'Catálogo con código, categoría y precios por lista.',
      'Búsqueda rápida por código o nombre en el POS.',
      'Alertas de stock bajo para reponer antes de que falte.',
      'Cuenta corriente con límite de crédito por cliente.',
      'Caja diaria con arqueo y cobro multi-método.',
    ],
    faq: [
      {
        q: '¿Puedo manejar precios distintos por lista?',
        a: 'Sí. El sistema soporta listas de precios para vender según el tipo de cliente o el canal, por ejemplo minorista y mayorista.',
      },
      {
        q: '¿Cómo controlo un catálogo tan grande?',
        a: 'Con búsqueda por código o nombre, categorías, importación por Excel y alertas de stock bajo para los artículos de alta rotación.',
      },
    ],
  },
  {
    slug: 'panaderias',
    rubro: 'Panaderías',
    icon: '🥐',
    title: 'Sistema de gestión para panaderías',
    description:
      'Sistema para panaderías y comercios de elaboración diaria: ventas rápidas por POS, caja diaria con arqueo, control de insumos y reportes de ventas por producto.',
    intro: [
      'En una panadería todo pasa en pocas horas del día y el mostrador no espera. FlexCRM registra las ventas al ritmo del cliente, con POS rápido y caja diaria que cierra con arqueo.',
      'Los insumos de elaboración se controlan como productos y las ventas por producto te muestran qué se vende y qué sobra, para ajustar la producción del día siguiente.',
    ],
    pain: [
      'La venta en hora pico no puede frenarse a anotar nada: el registro tiene que ser instantáneo.',
      'Sin reportes por producto, la producción se calcula a ojo y sobran o faltan unidades.',
      'El cierre del día con varios medios de pago (efectivo, QR, tarjeta) es difícil de cuadrar.',
    ],
    how: [
      'POS con búsqueda rápida y cobro en Caja.',
      'Arqueo diario que compara lo esperado con lo contado.',
      'Cobro multi-método: efectivo, débito, crédito, QR y transferencias.',
      'Reportes de ventas por producto y por período.',
      'Control de insumos de elaboración con stock y alertas.',
    ],
    faq: [
      {
        q: '¿Sirve para cobrar rápido en hora pico?',
        a: 'Sí. El POS busca por nombre o código, arma el carrito y pasa el cobro a Caja en segundos, con varios métodos de pago.',
      },
      {
        q: '¿Puedo controlar los insumos de elaboración?',
        a: 'Sí. Los insumos se cargan como productos con stock y alertas, para saber qué comprar antes de que falte.',
      },
    ],
  },
  {
    slug: 'comercios',
    rubro: 'Comercios minoristas',
    icon: '🏬',
    title: 'Sistema de gestión para comercios minoristas',
    description:
      'Sistema de gestión para comercios minoristas en Argentina: POS, caja, stock, clientes, cuenta corriente y reportes en un solo lugar, sin instalación.',
    intro: [
      'FlexCRM está pensado para el comercio minorista argentino: un solo sistema que cubre el mostrador, la caja, el depósito y los clientes, sin instalar nada y funcionando desde el navegador.',
      'Arrancás con una demo gratis de 14 días, cargás tus productos y tus clientes, y el mismo día estás vendiendo con el POS y cobrando con Caja.',
    ],
    pain: [
      'Usar varias herramientas sueltas (planilla, cuaderno, facturador, mensajería) genera información que no se cruza.',
      'Los sistemas complejos exigen instalación, servidores y un curso para usarlos.',
      'El dueño no tiene una foto clara de ventas, stock y deudas en el momento.',
    ],
    how: [
      'Registro de ventas por POS con cobro en Caja.',
      'Stock por sucursal con alertas y movimientos.',
      'Clientes con historial, cuenta corriente y puntos.',
      'Reportes diarios, mensuales y por sucursal.',
      'Multi-sucursal y facturación ARCA en planes superiores.',
    ],
    faq: [
      {
        q: '¿Necesito instalar algo?',
        a: 'No. FlexCRM funciona 100% desde el navegador, en computadora, tablet o celular. Creás tu cuenta y empezás a usarlo.',
      },
      {
        q: '¿Hay período de prueba?',
        a: 'Sí, la demo gratis dura 14 días, sin tarjeta de crédito, con hasta 5 usuarios y 1 sucursal.',
      },
    ],
  },
];

const COMPARATIVAS = [
  {
    slug: 'flexcrm-vs-excel',
    title: 'FlexCRM vs Excel: cuándo dejar la planilla',
    description:
      'Comparación objetiva entre manejar un comercio con Excel y usar un sistema de gestión como FlexCRM: stock, caja, clientes, errores y tiempo.',
    intro: [
      'Excel es una herramienta excelente para analizar datos, pero no es un sistema de gestión. Cuando el comercio empieza a vender en serio, la planilla se vuelve la fuente de la mayoría de los problemas operativos.',
      'Esta comparación repasa los puntos donde la planilla deja de alcanzar y dónde un sistema como FlexCRM cambia el día a día, sin desmerecer el Excel para lo que sí sirve: presupuestos y análisis ad hoc.',
    ],
    rows: [
      { aspect: 'Registro de ventas', a: 'Se anota a mano o se arma una planilla por día', b: 'Cada venta se registra desde el POS y alimenta stock, caja y clientes' },
      { aspect: 'Trabajo en equipo', a: 'Cada persona actualiza su archivo y se pierden versiones', b: 'Todos trabajan sobre la misma información, en tiempo real' },
      { aspect: 'Stock', a: 'Hay que recalcularlo constantemente', b: 'Se descuenta automáticamente por sucursal' },
      { aspect: 'Control y auditoría', a: 'No hay registro de quién cambió qué ni cuándo', b: 'Cada movimiento queda registrado con usuario y horario' },
      { aspect: 'Errores', a: 'Los errores de fórmula se descubren tarde', b: 'La lógica está validada y probada, sin fórmulas que romper' },
    ],
    verdict:
      'Excel sirve para analizar y proyectar; no para operar un comercio en el día a día. Si ya dedicás horas a actualizar planillas, es el momento de probar un sistema de gestión.',
    faq: [
      {
        q: '¿Puedo migrar mis datos desde Excel?',
        a: 'Sí. FlexCRM permite importar productos y clientes desde Excel, así que no empezás de cero.',
      },
      {
        q: '¿Sigo necesitando Excel después de FlexCRM?',
        a: 'Para el control diario, no. Para análisis puntuales podés exportar reportes desde FlexCRM a Excel cuando quieras.',
      },
    ],
  },
  {
    slug: 'crm-vs-sistema-de-gestion',
    title: 'CRM vs sistema de gestión: qué necesita tu comercio',
    description:
      'Diferencias entre un CRM y un sistema de gestión para comercios, y por qué FlexCRM combina ambas capas: clientes por un lado, ventas, caja y stock por el otro.',
    intro: [
      'Un CRM se enfoca en la relación con el cliente: contactos, historial, seguimiento. Un sistema de gestión abarca la operación: ventas, caja, stock y reportes. Muchos comercios necesitan las dos cosas, pero con un solo sistema.',
      'FlexCRM junta ambas capas: la ficha del cliente con historial y puntos (CRM) y la operación diaria del local (gestión), para que el dato del cliente y la venta no vivan en mundos separados.',
    ],
    rows: [
      { aspect: 'Enfoque', a: 'Contactos y seguimiento comercial', b: 'Clientes + operación completa del comercio' },
      { aspect: 'Operación', a: 'No conoce el stock ni la caja', b: 'Venta, cobro y stock integrados en el mismo flujo' },
      { aspect: 'Datos', a: 'Requiere cargar datos a mano para tener historial', b: 'El historial del cliente se arma solo con cada venta' },
      { aspect: 'Facturación', a: 'Hay que sumar otra herramienta para facturar', b: 'Facturación ARCA incluida en planes Pro y Enterprise' },
    ],
    verdict:
      'Si solo necesitás seguimiento de contactos, un CRM alcanza. Si además vendés, cobrás y controlás stock, necesitás las dos capas integradas, como FlexCRM.',
    faq: [
      {
        q: '¿FlexCRM es un CRM?',
        a: 'Incluye las funciones de un CRM para comercios (ficha, historial, fidelización y pipeline comercial en planes superiores) y además gestiona ventas, caja y stock.',
      },
      {
        q: '¿Qué es más importante para un comercio chico?',
        a: 'La operación diaria. Pero como ambas capas viven en el mismo sistema, no tenés que elegir ni integrar dos herramientas.',
      },
    ],
  },
  {
    slug: 'pos-vs-sistema-de-gestion',
    title: 'POS vs sistema de gestión: alcances distintos',
    description:
      'Qué hace un POS y qué agrega un sistema de gestión: la diferencia entre cobrar una venta y tener el negocio entero controlado.',
    intro: [
      'Un POS resuelve el mostrador: buscar el producto, armar el ticket y cobrar. Un sistema de gestión agrega lo que pasa antes y después de la venta: stock, clientes, cuenta corriente, reportes y caja.',
      'Comprar solo un POS suele terminar en parches: una planilla de stock, un cuaderno de deudas y un facturador aparte. Un sistema de gestión integra todo eso en el mismo flujo.',
    ],
    rows: [
      { aspect: 'Venta', a: 'Registra la venta y el cobro', b: 'Además descuenta stock y alimenta el historial del cliente' },
      { aspect: 'Stock', a: 'No controla la mercadería entre locales', b: 'Stock por sucursal con transferencias' },
      { aspect: 'Reportes', a: 'Cada fin de mes hay que armar los números a mano', b: 'Reportes de ventas, productos y vendedores siempre disponibles' },
      { aspect: 'Facturación', a: 'Facturar requiere otro sistema', b: 'Facturación ARCA integrada en planes Pro y Enterprise' },
    ],
    verdict:
      'Si solo vendés en efectivo y no te importa el stock ni el historial, un POS alcanza. Si querés que cada venta alimente al negocio entero, elegí un sistema de gestión con POS integrado.',
    faq: [
      {
        q: '¿FlexCRM incluye POS?',
        a: 'Sí. El POS es uno de los módulos principales y está en todos los planes, incluida la demo gratis.',
      },
      {
        q: '¿Un sistema de gestión es más caro?',
        a: 'No necesariamente. El plan Básico de FlexCRM cuesta USD 15 por mes e incluye POS, caja, stock, clientes y cuenta corriente.',
      },
    ],
  },
  {
    slug: 'nube-vs-instalado',
    title: 'Sistema en la nube vs sistema instalado',
    description:
      'Ventajas y limitaciones de un sistema en la nube frente a uno instalado: acceso, backups, actualizaciones, costos y seguridad para comercios.',
    intro: [
      'Un sistema instalado vive en una computadora del local: depende de ese equipo, de su disco y de quién haga los backups. Un sistema en la nube vive en servidores profesionales y se accede desde el navegador.',
      'FlexCRM es 100% en la nube: no hay instalación, las actualizaciones llegan solas y cada empresa tiene su base de datos aislada en servidores con acceso controlado.',
    ],
    rows: [
      { aspect: 'Acceso', a: 'Solo desde la PC donde está instalado', b: 'Desde cualquier dispositivo con internet' },
      { aspect: 'Backups', a: 'Dependen de que alguien los haga', b: 'La infraestructura del proveedor respalda los datos' },
      { aspect: 'Actualizaciones', a: 'Hay que instalarlas a mano', b: 'Las mejoras llegan automáticamente' },
      { aspect: 'Costo', a: 'Costo inicial alto por licencias y equipo', b: 'Costo mensual previsible, sin infraestructura propia' },
    ],
    verdict:
      'Para la mayoría de los comercios, la nube gana en acceso, respaldo y simplicidad. El sistema instalado solo se justifica en casos muy específicos de conectividad o normativa.',
    faq: [
      {
        q: '¿Qué pasa si se corta internet?',
        a: 'Necesitás conexión para operar en línea. Como todo SaaS, la nube requiere internet; a cambio ganás acceso desde cualquier lugar y respaldo profesional.',
      },
      {
        q: '¿Mis datos están separados de los de otras empresas?',
        a: 'Sí. FlexCRM es multi-tenant: cada empresa tiene su propia base de datos aislada.',
      },
    ],
  },
  {
    slug: 'tienda-online-vs-sistema-de-gestion',
    title: 'Tienda online vs sistema de gestión',
    description:
      'Por qué la tienda online y el sistema de gestión resuelven problemas distintos, y qué pasa cuando trabajan por separado.',
    intro: [
      'La tienda online vende por internet; el sistema de gestión controla lo que pasa después de la venta: stock, caja, clientes y cuentas por cobrar. Son capas distintas que se necesitan mutuamente.',
      'Cuando la tienda y la gestión no conversan, alguien tiene que copiar pedidos a mano, descontar stock dos veces y cuadrar pagos en una planilla. Ese trabajo es justamente el que un sistema integrado elimina.',
    ],
    rows: [
      { aspect: 'Función', a: 'Vende por internet y recibe pedidos', b: 'Controla stock, caja, clientes y reportes del negocio' },
      { aspect: 'Stock', a: 'El stock de la tienda suele desincronizarse del local', b: 'Centraliza el stock real de cada sucursal' },
      { aspect: 'Caja', a: 'El pedido no alimenta la caja del local', b: 'Cada venta queda registrada con su método de cobro' },
      { aspect: 'Clientes', a: 'Los clientes web y los del local quedan separados', b: 'Un solo historial por cliente' },
    ],
    verdict:
      'No es una cosa o la otra: el comercio con tienda online necesita ambos, y lo ideal es que el stock y los clientes estén sincronizados. FlexCRM integra tiendas como Mercado Libre y Tiendanube en los planes Pro y Enterprise.',
    faq: [
      {
        q: '¿FlexCRM reemplaza mi tienda online?',
        a: 'No. La tienda vende y FlexCRM gestiona. Los planes Pro y Enterprise incluyen integraciones con Mercado Libre y Tiendanube para sincronizar productos y ventas.',
      },
      {
        q: '¿La integración con mi tienda es automática?',
        a: 'FlexCRM tiene integraciones para Mercado Libre y Tiendanube. La sincronización depende de la configuración de cada cuenta; escribinos para ver tu caso puntual.',
      },
    ],
  },
  {
    slug: 'flexcrm-y-tienda-online',
    title: 'FlexCRM + tienda online: el flujo completo',
    description:
      'Cómo se complementan FlexCRM y una tienda online: sincronización de productos, ventas por múltiples canales y control unificado del negocio.',
    intro: [
      'El mejor combo para un comercio que vende por internet es una tienda online para atraer pedidos y un sistema de gestión para sostener la operación completa detrás de cada pedido.',
      'Con FlexCRM, el canal online y el local conviven en el mismo control: productos sincronizados, ventas registradas y clientes con un solo historial, sin planillas intermedias.',
    ],
    rows: [
      { aspect: 'Productos', a: 'Se cargan dos veces y se desincronizan', b: 'El catálogo se sincroniza con Mercado Libre o Tiendanube' },
      { aspect: 'Ventas', a: 'Cada pedido se copia a mano al control del local', b: 'Las ventas entran al flujo de ventas y reportes' },
      { aspect: 'Stock', a: 'Se descuenta dos veces o ninguna', b: 'El stock centralizado refleja todos los canales' },
      { aspect: 'Clientes', a: 'El cliente web y el del local parecen dos personas', b: 'Un solo cliente con su historial completo' },
    ],
    verdict:
      'Si ya vendés o querés vender por internet, integrar la tienda con el sistema de gestión es la mejora operativa más grande que podés hacer, y FlexCRM lo soporta en los planes Pro y Enterprise.',
    faq: [
      {
        q: '¿Con qué tiendas se integra FlexCRM?',
        a: 'Los planes Pro y Enterprise incluyen integraciones con Mercado Libre y Tiendanube.',
      },
      {
        q: '¿Puedo arrancar sin tienda y sumarla después?',
        a: 'Sí. Empezá con el control del local y, cuando abras tu tienda, sumás la integración según tu plan.',
      },
    ],
  },
];

const BLOG_POSTS = [
  {
    slug: 'que-es-un-sistema-de-gestion',
    title: 'Qué es un sistema de gestión para comercios',
    description:
      'Qué es un sistema de gestión, qué módulos incluye y qué cambia en el día a día de un comercio cuando pasa de planillas a un sistema integrado.',
    published: true,
    date: '2026-08-17',
    sections: [
      {
        h2: 'Respuesta rápida',
        p: [
          'Un sistema de gestión para comercios es un software que centraliza la operación diaria del negocio: ventas, caja, stock, clientes, cuenta corriente y reportes, en lugar de llevar cada cosa por separado en planillas y cuadernos.',
        ],
      },
      {
        h2: 'Qué módulos tiene un sistema de gestión',
        p: [
          'Aunque cada sistema varía, los módulos esenciales son: punto de venta (POS) para registrar las ventas, caja para controlar los cobros del día, stock para saber qué tenés y dónde, clientes con historial y saldo, y reportes para ver cómo viene el negocio.',
          'Los sistemas más completos suman multi-sucursal, facturación electrónica, proveedores y tesorería. FlexCRM cubre todos esos módulos, con facturación ARCA y multi-sucursal en los planes superiores.',
        ],
      },
      {
        h2: 'Qué cambia al dejar las planillas',
        p: [
          'La venta deja de ser un dato anotado a mano y pasa a alimentar todo: al vender, el stock se descuenta, la caja registra el cobro y el cliente suma historial. Nadie tiene que reingresar nada.',
          'Los reportes dejan de ser un trabajo de fin de mes: ventas por período, ranking de productos y comisiones están disponibles en cualquier momento.',
        ],
      },
      {
        h2: 'Cuándo conviene dar el paso',
        p: [
          'Cuando la planilla ya no cierra, cuando hay más de una persona vendiendo o cuando abrís un segundo local, el sistema de gestión deja de ser una comodidad y pasa a ser la base para seguir creciendo.',
        ],
      },
    ],
    faq: [
      {
        q: '¿Un sistema de gestión sirve para un comercio chico?',
        a: 'Sí. El plan Básico de FlexCRM cuesta USD 15 por mes e incluye POS, caja, stock, clientes y cuenta corriente, pensado justamente para comercios que recién se ordenan.',
      },
    ],
  },
  {
    slug: 'cuando-dejar-excel',
    title: 'Cuándo dejar Excel y pasar a un sistema de gestión',
    description:
      'Señales claras de que la planilla ya no alcanza para tu comercio: stock desactualizado, diferencias de caja, versiones perdidas y más de una persona cargando datos.',
    published: true,
    date: '2026-08-17',
    sections: [
      {
        h2: 'Respuesta rápida',
        p: [
          'Es hora de dejar Excel cuando la planilla se convierte en el trabajo: cuando actualizarla consume más tiempo que vender, cuando hay versiones distintas dando vueltas o cuando las diferencias de stock y caja se volvieron normales.',
        ],
      },
      {
        h2: 'Señal 1: el stock nunca coincide',
        p: [
          'La planilla dice que tenés 10 unidades y el depósito tiene 6. Cada desfasaje es plata que no ves y ventas que se pierden. Un sistema descuenta el stock automáticamente con cada venta, sin intervención humana.',
        ],
      },
      {
        h2: 'Señal 2: la caja no cierra',
        p: [
          'Si todos los días hay una diferencia de efectivo sin explicación, el problema no es la persona sino el método. La caja de FlexCRM registra cada cobro por método y el cierre compara lo esperado con lo contado.',
        ],
      },
      {
        h2: 'Señal 3: hay más de una persona cargando datos',
        p: [
          'Cuando dos o más personas editan la misma planilla, tarde o temprano se pisan. Un sistema multi-usuario guarda quién hizo qué y cuándo, en tiempo real.',
        ],
      },
      {
        h2: 'Cómo dar el paso sin trauma',
        p: [
          'Importá productos y clientes desde Excel, probá la demo gratis de 14 días y operá en paralelo con la planilla hasta sentirte seguro. La migración no tiene por qué ser un salto al vacío.',
        ],
      },
    ],
    faq: [
      {
        q: '¿Puedo seguir usando Excel para algunas cosas?',
        a: 'Sí. FlexCRM exporta reportes a Excel para análisis y contabilidad. La diferencia es que la planilla deja de ser la fuente de la operación.',
      },
    ],
  },
  {
    slug: 'crm-vs-sistema-de-gestion',
    title: 'CRM vs sistema de gestión: diferencias y cuál elegir',
    description:
      'CRM y sistema de gestión no son lo mismo. Qué resuelve cada uno, en qué se parecen y por qué los comercios suelen necesitar ambas capas en una sola herramienta.',
    published: true,
    date: '2026-08-17',
    sections: [
      {
        h2: 'Respuesta rápida',
        p: [
          'El CRM organiza la relación con clientes y prospectos; el sistema de gestión organiza la operación del negocio. Un comercio necesita las dos cosas, e integrarlas en una sola herramienta evita cargar datos dos veces.',
        ],
      },
      {
        h2: 'Qué hace un CRM',
        p: [
          'Guarda contactos, historial de interacciones, seguimiento de oportunidades y tareas comerciales. Es fuerte en la relación, pero no sabe de stock ni de caja.',
        ],
      },
      {
        h2: 'Qué hace un sistema de gestión',
        p: [
          'Cubre ventas, caja, stock, cuenta corriente, proveedores y reportes. Sin la capa de clientes, la operación funciona pero la relación se enfría.',
        ],
      },
      {
        h2: 'Por qué separarlos sale caro',
        p: [
          'Dos herramientas implican dos cargas de datos, dos contratos y una integración que alguien tiene que mantener. FlexCRM unifica ambas capas: el historial del cliente se arma solo con cada venta, y el pipeline comercial existe en los planes superiores.',
        ],
      },
    ],
    faq: [
      {
        q: '¿Necesito un CRM aparte si uso FlexCRM?',
        a: 'Para la mayoría de los comercios, no. La ficha del cliente, su historial y los puntos de fidelización cubren la capa de relación, y los planes Pro y Enterprise suman pipeline comercial.',
      },
    ],
  },
];

const BLOG_PLANNED = [
  'Qué debe tener un sistema de gestión',
  'Sistema en la nube vs instalado',
  'Cómo controlar el stock',
  'Cómo controlar stock multi-sucursal',
  'Cómo evitar diferencias de inventario',
  'Qué es un POS',
  'Cómo mejorar la gestión de ventas',
  'Cómo controlar vendedores',
  'Qué es un CRM para comercios',
  'Cómo fidelizar clientes',
  'Facturación electrónica ARCA',
  'Factura A, B y C: cuándo usar cada una',
  'Sistema para tiendas de ropa',
  'Sistema para ferreterías',
  'Sistema para panaderías',
  'Sistema para comercios multi-sucursal',
  'Cómo elegir un sistema de gestión',
];

const DOC_SECTIONS = [
  {
    id: 'introduccion',
    title: 'Introducción',
    p: [
      'FlexCRM es un CRM multi-rubro para PyMEs y comercios de Argentina. Funciona 100% desde el navegador, sin instalación: creás tu cuenta, activás el email y empezás a vender.',
      'Cada empresa tiene su propia base de datos aislada, con sus usuarios, productos, clientes, caja y configuraciones.',
    ],
  },
  {
    id: 'primeros-pasos',
    title: 'Primeros pasos',
    p: [
      'Creá tu cuenta gratis en app.flexcrm.com.ar con el nombre de tu negocio, tu email y una contraseña. Recibís un email de verificación y listo.',
      'Después: cargá tus productos (o importalos desde Excel), creá tus clientes y abrí la caja de tu sucursal para empezar a vender.',
    ],
  },
  {
    id: 'usuarios',
    title: 'Usuarios y roles',
    p: [
      'Cada persona del equipo tiene su usuario con un rol: admin, supervisor, cajero, vendedor o depósito. Los permisos definen qué módulos y qué sucursales puede ver cada uno.',
    ],
  },
  {
    id: 'sucursales',
    title: 'Sucursales',
    p: [
      'Creás una sucursal por local. Cada sucursal tiene su stock, su caja y su equipo. Los reportes se pueden ver por sucursal o consolidados.',
    ],
  },
  {
    id: 'productos',
    title: 'Productos y stock',
    p: [
      'Cada producto tiene código, categoría, precio y variantes (talle, color, sabor). El stock se controla por sucursal, con alertas de stock bajo, ajustes e historial de movimientos.',
    ],
  },
  {
    id: 'clientes',
    title: 'Clientes',
    p: [
      'La ficha del cliente guarda contacto, historial de compras, saldo de cuenta corriente y puntos de fidelización. Todo se actualiza automáticamente con cada venta.',
    ],
  },
  {
    id: 'ventas',
    title: 'Ventas y POS',
    p: [
      'La venta se registra desde el POS: búsqueda por código o nombre, carrito, descuentos y cobro en Caja. Cada venta descuenta stock y queda disponible en reportes.',
    ],
  },
  {
    id: 'caja',
    title: 'Caja',
    p: [
      'Abrís la caja al inicio del turno, cobrás con efectivo, débito, crédito, QR o transferencias y cerrás con un arqueo que compara lo esperado con lo contado.',
    ],
  },
  {
    id: 'stock',
    title: 'Stock y transferencias',
    p: [
      'El stock se mueve con las ventas, los ajustes y las transferencias entre sucursales. Cada movimiento queda registrado con usuario y horario.',
    ],
  },
  {
    id: 'reportes',
    title: 'Reportes',
    p: [
      'Dashboard con KPIs, ventas por período, ranking de productos y clientes, comisiones por vendedor y exportación a Excel.',
    ],
  },
  {
    id: 'facturacion-arca',
    title: 'Facturación ARCA',
    p: [
      'En los planes Pro y Enterprise podés configurar ARCA (AFIP) y emitir factura A, B y C con CAE, más nota de crédito. La configuración se hace en Ajustes con las credenciales fiscales de tu empresa.',
    ],
  },
  {
    id: 'cuenta-corriente',
    title: 'Cuenta corriente',
    p: [
      'Cada cliente puede tener límite de crédito y saldo deudor. Los pagos se registran desde Caja, con detección de pagos duplicados.',
    ],
  },
];

module.exports = { FEATURES, SOLUTIONS, COMPARATIVAS, BLOG_POSTS, BLOG_PLANNED, DOC_SECTIONS };
