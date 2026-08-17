// Fuente de verdad del sitio de marketing de FlexCRM.
// El build (scripts/build-marketing.js) genera HTML, JSON-LD, sitemap,
// robots.txt, llms.txt y llms-full.txt a partir de estos datos.
// Regla: no inventar claims. Todo lo publicado acá debe existir en el producto.

const SITE = {
  name: 'FlexCRM',
  url: 'https://flexcrm.com.ar',
  appUrl: 'https://app.flexcrm.com.ar',
  signupUrl: 'https://app.flexcrm.com.ar/app/signup',
  loginUrl: 'https://app.flexcrm.com.ar/app/login',
  whatsapp: 'https://wa.me/5493517424391',
  whatsappLabel: '+54 9 351 742-4391',
  email: 'contacto@unfulanodev.com.ar',
  creatorName: 'Un Fulano Dev',
  creatorUrl: 'https://unfulanodev.com.ar',
  updated: '2026-08-17',
  locale: 'es_AR',
  ogImage: '/fc-og.png',
  description:
    'FlexCRM es un CRM multi-rubro para PyMEs y comercios de Argentina: punto de venta, caja, stock, clientes, cuenta corriente, reportes, multi-sucursal y facturación electrónica ARCA. Probá gratis 14 días.',
};

const PLANS = [
  {
    id: 'demo',
    name: 'Demo gratis',
    price: '$0',
    priceValue: '0',
    period: '/ 14 días',
    periodNote: 'sin tarjeta de crédito',
    highlight: true,
    features: [
      'Hasta 5 usuarios y 1 sucursal',
      'POS, Caja y Clientes',
      'Ventas, Productos y Stock',
      'Cuenta Corriente',
      'Presupuestos y Reportes',
      'Soporte por WhatsApp',
    ],
  },
  {
    id: 'basic',
    name: 'Básico',
    price: 'USD 15',
    priceValue: '15',
    period: '/ mes',
    periodNote: 'facturación mensual',
    highlight: false,
    features: [
      'Hasta 3 usuarios y 1 sucursal',
      'POS, Caja y Clientes',
      'Ventas, Productos y Stock',
      'Cuenta Corriente',
      'Proveedores y Reportes',
      'Soporte por WhatsApp',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'USD 40',
    priceValue: '40',
    period: '/ mes',
    periodNote: 'facturación mensual',
    highlight: true,
    features: [
      'Hasta 10 usuarios y 3 sucursales',
      'Todo lo del plan Básico',
      'Presupuestos y Pendientes',
      'Transferencias entre sucursales',
      'Reportes, Auditoría y Pipeline',
      'Facturación ARCA',
      'Integraciones: Mercado Libre y Tiendanube',
      'Tesorería y soporte prioritario',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'USD 90',
    priceValue: '90',
    period: '/ mes',
    periodNote: 'facturación mensual',
    highlight: false,
    features: [
      'Usuarios y sucursales a escala de empresa',
      'Todo lo del plan Pro',
      'Lista de regalos',
      'Chat entre sucursales',
      'Pipeline comercial',
      'Soporte dedicado',
    ],
  },
];

const GENERAL_FAQ = [
  {
    q: '¿Qué es FlexCRM?',
    a: 'FlexCRM es un CRM multi-rubro para PyMEs y comercios de Argentina: punto de venta, caja, stock, clientes, cuenta corriente, reportes, multi-sucursal y facturación electrónica ARCA. Funciona en el navegador, sin instalación.',
  },
  {
    q: '¿Para quién es FlexCRM?',
    a: 'Para comercios minoristas argentinos con o sin sucursales: indumentaria, ferreterías, panaderías, farmacias, tiendas de regalos y cualquier PyME que necesite vender, cobrar y controlar stock.',
  },
  {
    q: '¿Cuánto cuesta FlexCRM?',
    a: 'Hay una demo gratis de 14 días sin tarjeta. Después, el plan Básico cuesta USD 15 por mes, el Pro USD 40 por mes y el Enterprise USD 90 por mes. Todos incluyen soporte por WhatsApp.',
  },
  {
    q: '¿Tiene prueba gratuita?',
    a: 'Sí. La demo gratis dura 14 días, sin tarjeta de crédito, con hasta 5 usuarios y 1 sucursal. Creás tu cuenta en app.flexcrm.com.ar y la activás desde tu email.',
  },
  {
    q: '¿Tiene POS?',
    a: 'Sí. El Punto de Venta está en todos los planes: búsqueda por código, nombre o categoría, carrito, descuentos y cobro conectado con Caja.',
  },
  {
    q: '¿Tiene control de stock?',
    a: 'Sí. Stock por sucursal, variantes (talle, color, sabor), alertas de stock bajo, ajustes y transferencias entre locales.',
  },
  {
    q: '¿Tiene caja?',
    a: 'Sí. Apertura, cierre, arqueo, movimientos y cobro multi-método: efectivo, débito, crédito, QR y transferencias.',
  },
  {
    q: '¿Tiene multi-sucursal?',
    a: 'Sí. Una cuenta maneja varias sucursales con stock y caja independientes, permisos por usuario y transferencias entre locales. El máximo de sucursales depende del plan.',
  },
  {
    q: '¿Tiene facturación ARCA?',
    a: 'Sí, en los planes Pro y Enterprise. Emite factura A, B y C con CAE y nota de crédito, integrada con ARCA (AFIP), configurando las credenciales fiscales en Ajustes.',
  },
  {
    q: '¿Tiene API pública?',
    a: 'FlexCRM cuenta con integraciones para Mercado Libre y Tiendanube, y con automatizaciones por webhooks para eventos de ventas, clientes y productos. Una API pública para desarrolladores no está publicada en este momento: escribinos si necesitás una integración específica.',
  },
  {
    q: '¿Tiene webhooks?',
    a: 'Sí. Los webhooks permiten avisar a tus sistemas cuando ocurren eventos como venta cobrada, cliente creado o producto actualizado. La disponibilidad depende del plan; consultanos por WhatsApp.',
  },
];

const content = require('./data-content');

module.exports = {
  SITE,
  PLANS,
  GENERAL_FAQ,
  GEO_ANSWERS: GENERAL_FAQ,
  FEATURES: content.FEATURES,
  SOLUTIONS: content.SOLUTIONS,
  COMPARATIVAS: content.COMPARATIVAS,
  BLOG_POSTS: content.BLOG_POSTS,
  BLOG_PLANNED: content.BLOG_PLANNED,
  DOC_SECTIONS: content.DOC_SECTIONS,
};
