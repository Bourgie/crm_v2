// Build estático del sitio de marketing de FlexCRM para Cloudflare Pages.
// Genera dist/marketing con HTML, JSON-LD, sitemap.xml, robots.txt,
// llms.txt, llms-full.txt, _headers y 404.html a partir de marketing/data.js.
//
// Uso: npm run build:marketing
// Salida por defecto: dist/marketing (override con MARKETING_OUT).

const fs = require('fs');
const path = require('path');

const DATA = require('../marketing/data');
const { SITE, PLANS, FEATURES, SOLUTIONS, COMPARATIVAS, BLOG_POSTS, BLOG_PLANNED, DOC_SECTIONS, GENERAL_FAQ } = DATA;

const OUT = path.resolve(process.env.MARKETING_OUT || path.join(__dirname, '..', 'dist', 'marketing'));

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function canonical(slug) {
  return `${SITE.url}/${slug}`.replace(/\/$/, '') + (slug ? '/' : '/');
}

function ogImageUrl() {
  return SITE.url + SITE.ogImage;
}

// ── JSON-LD: grafo de entidades con @id estables ──
function buildSchema(slug, meta, opts = {}) {
  const pageUrl = canonical(slug);
  const graph = [
    {
      '@id': `${SITE.url}/#org`,
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url,
      logo: ogImageUrl(),
      email: SITE.email,
      sameAs: [SITE.whatsapp, SITE.creatorUrl],
    },
    {
      '@id': `${SITE.url}/#brand`,
      '@type': 'Brand',
      name: SITE.name,
    },
    {
      '@id': `${SITE.url}/#software`,
      '@type': 'SoftwareApplication',
      name: SITE.name,
      url: SITE.url,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'es-AR',
      description: SITE.description,
      brand: { '@id': `${SITE.url}/#brand` },
      publisher: { '@id': `${SITE.url}/#org` },
    },
    {
      '@id': `${SITE.url}/#website`,
      '@type': 'WebSite',
      url: SITE.url,
      name: SITE.name,
      inLanguage: 'es-AR',
      publisher: { '@id': `${SITE.url}/#org` },
    },
  ];

  if (opts.offers) {
    const offerEntities = PLANS.map((plan) => ({
      '@id': `${SITE.url}/precios/#offer-${plan.id}`,
      '@type': 'Offer',
      name: plan.name,
      price: plan.priceValue,
      priceCurrency: 'USD',
      description: plan.features.join('. ') + '.',
    }));
    graph.push(
      {
        '@id': `${SITE.url}/precios/#catalog`,
        '@type': 'OfferCatalog',
        name: 'Planes de FlexCRM',
        offers: offerEntities.map((offer) => ({ '@id': offer['@id'] })),
      },
      ...offerEntities
    );
    graph.push({
      '@id': `${SITE.url}/#software-offers`,
      '@type': 'SoftwareApplication',
      name: SITE.name,
      offers: { '@id': `${SITE.url}/precios/#catalog` },
    });
  }

  const breadcrumb = (opts.breadcrumb || []).map((item) => ({
    '@type': 'ListItem',
    position: item.position,
    name: item.name,
    item: item.url || SITE.url,
  }));

  const webpage = {
    '@id': `${pageUrl}#webpage`,
    '@type': 'WebPage',
    url: pageUrl,
    name: meta.title,
    description: meta.description,
    inLanguage: 'es-AR',
    isPartOf: { '@id': `${SITE.url}/#website` },
    about: { '@id': `${SITE.url}/#software` },
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: breadcrumb },
  };
  graph.push(webpage);

  if (opts.faq && opts.faq.length) {
    graph.push({
      '@id': `${pageUrl}#faq`,
      '@type': 'FAQPage',
      mainEntity: opts.faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
  }

  if (opts.article) {
    graph.push({
      '@id': `${pageUrl}#article`,
      '@type': 'Article',
      headline: meta.title,
      description: meta.description,
      datePublished: opts.article.date,
      inLanguage: 'es-AR',
      author: { '@id': `${SITE.url}/#org` },
      publisher: { '@id': `${SITE.url}/#org` },
      mainEntityOfPage: { '@id': `${pageUrl}#webpage` },
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 0);
}

// ── Layout compartido ──
const NAV_LINKS = [
  { href: '/funcionalidades/', label: 'Funcionalidades' },
  { href: '/soluciones/', label: 'Soluciones' },
  { href: '/precios/', label: 'Precios' },
  { href: '/comparativas/', label: 'Comparativas' },
  { href: '/documentacion/', label: 'Documentación' },
  { href: '/blog/', label: 'Blog' },
  { href: '/contacto/', label: 'Contacto' },
];

function nav(currentSlug) {
  const links = NAV_LINKS.map((link) => {
    const active = currentSlug.startsWith(link.href.slice(1).replace(/\/$/, '')) && link.href !== '/';
    return `<a href="${link.href}"${active ? ' class="active"' : ''}>${esc(link.label)}</a>`;
  }).join('');
  return `<nav><div class="wrap nav-row">
    <a class="nav-logo" href="/">Flex<span>CRM</span></a>
    <div class="nav-links">
      ${links}
      <a class="nav-btn" href="${SITE.loginUrl}" rel="noopener">Ingresar</a>
    </div>
  </div></nav>`;
}

function breadcrumbHtml(items) {
  return `<nav class="crumb" aria-label="Miga de pan"><div class="wrap">${items
    .map((item, index) => {
      const isLast = index === items.length - 1;
      const label = esc(item.name);
      return isLast
        ? `<span aria-current="page">${label}</span>`
        : `<a href="${item.url}">${label}</a><span class="sep">/</span>`;
    })
    .join('')}</div></nav>`;
}

function faqHtml(faq) {
  if (!faq || !faq.length) return '';
  const items = faq
    .map(
      (item) => `<details>
        <summary>${esc(item.q)}</summary>
        <p>${esc(item.a)}</p>
      </details>`
    )
    .join('');
  return `<section class="sec sec-alt" id="faq"><div class="wrap">
    <h2>Preguntas frecuentes</h2>
    <div class="faq-list">${items}</div>
  </div></section>`;
}

function ctaBlock() {
  return `<section class="cta"><div class="wrap">
    <h2>Probá FlexCRM gratis durante 14 días</h2>
    <p>Sin tarjeta de crédito. Creás tu cuenta y empezás a vender hoy.</p>
    <div class="cta-btns">
      <a class="btn btn-primary" href="${SITE.signupUrl}" rel="noopener">🚀 Probar gratis</a>
      <a class="btn btn-secondary" href="/precios/">Ver planes</a>
      <a class="btn btn-wa" href="${SITE.whatsapp}" target="_blank" rel="noopener">💬 WhatsApp</a>
    </div>
  </div></section>`;
}

function footer() {
  return `<footer>
  <div class="wrap footer-grid">
    <div>
      <p class="footer-brand">Flex<span>CRM</span></p>
      <p>CRM multi-rubro para PyMEs y comercios de Argentina.</p>
      <p><a href="${SITE.whatsapp}" target="_blank" rel="noopener">${esc(SITE.whatsappLabel)}</a> · <a href="mailto:${SITE.email}">${esc(SITE.email)}</a></p>
    </div>
    <div>
      <p class="footer-title">Producto</p>
      <a href="/funcionalidades/">Funcionalidades</a>
      <a href="/soluciones/">Soluciones por rubro</a>
      <a href="/precios/">Precios</a>
      <a href="/demo/">Demo gratis</a>
    </div>
    <div>
      <p class="footer-title">Recursos</p>
      <a href="/documentacion/">Documentación</a>
      <a href="/comparativas/">Comparativas</a>
      <a href="/blog/">Blog</a>
      <a href="/casos-de-exito/">Casos de éxito</a>
    </div>
    <div>
      <p class="footer-title">Empresa</p>
      <a href="/sobre-flexcrm/">Sobre FlexCRM</a>
      <a href="/contacto/">Contacto</a>
      <a href="${SITE.appUrl}/terminos-y-condiciones">Términos y Condiciones</a>
      <a href="${SITE.appUrl}/politica-de-privacidad">Política de Privacidad</a>
    </div>
  </div>
  <div class="wrap"><p class="footer-note">© 2026 FlexCRM. Hecho en Argentina por <a href="${SITE.creatorUrl}" target="_blank" rel="noopener">${esc(SITE.creatorName)}</a>.</p></div>
</footer>`;
}

function page({ slug, meta, breadcrumb, schemaOpts, content }) {
  const pageUrl = canonical(slug);
  const schema = buildSchema(slug, meta, schemaOpts);
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${ogImageUrl()}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${SITE.locale}">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(meta.title)}">
<meta name="twitter:description" content="${esc(meta.description)}">
<meta name="twitter:image" content="${ogImageUrl()}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${pageUrl}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect x='4' y='6' width='24' height='20' rx='4' fill='%236366f1'/><rect x='10' y='12' width='12' height='3' rx='1' fill='white' opacity='0.6'/><rect x='10' y='17' width='8' height='2' rx='1' fill='white' opacity='0.4'/></svg>">
<script type="application/ld+json">${schema}</script>
<style>${CSS}</style>
</head>
<body>
${nav(slug)}
${breadcrumb ? breadcrumbHtml(breadcrumb) : ''}
<main id="contenido">${content}</main>
${faqHtml(schemaOpts.faq)}
${ctaBlock()}
${footer()}
</body>
</html>`;
}

// ── CSS compartido (mismo lenguaje visual de la landing actual) ──
const CSS = `
:root { --ink:#0f172a; --white:#f8fafc; --ac:#6366f1; --ac2:#f97316; --gray:#64748b; --light:#f1f5f9; --card:#fff; --shadow:0 4px 24px rgba(0,0,0,.08); --radius:12px; --font:system-ui,-apple-system,sans-serif; }
* { margin:0; padding:0; box-sizing:border-box; }
html { scroll-behavior:smooth; }
body { font-family:var(--font); color:var(--ink); background:var(--white); -webkit-font-smoothing:antialiased; line-height:1.6; }
a { color:inherit; text-decoration:none; }
.wrap { max-width:1100px; margin:0 auto; padding:0 24px; }
h1,h2,h3 { text-wrap:balance; line-height:1.2; }
.btn { display:inline-block; padding:14px 32px; border-radius:10px; font-weight:700; font-size:15px; transition:all .2s; cursor:pointer; border:none; }
.btn-primary { background:var(--ac); color:#fff; }
.btn-primary:hover { background:#4f46e5; transform:translateY(-1px); box-shadow:0 8px 24px rgba(99,102,241,.3); }
.btn-secondary { background:var(--ink); color:#fff; }
.btn-secondary:hover { background:#1e293b; transform:translateY(-1px); }
.btn-wa { background:#22c55e; color:#fff; }
.btn-wa:hover { background:#16a34a; transform:translateY(-1px); }
nav { position:sticky; top:0; z-index:100; backdrop-filter:blur(12px); background:rgba(248,250,252,.92); border-bottom:1px solid rgba(0,0,0,.06); min-height:64px; display:flex; align-items:center; }
.nav-row { display:flex; align-items:center; justify-content:space-between; width:100%; flex-wrap:wrap; gap:8px; }
.nav-logo { font-weight:800; font-size:20px; color:var(--ink); }
.nav-logo span { color:var(--ac); }
.nav-links { display:flex; gap:20px; font-size:14px; align-items:center; flex-wrap:wrap; }
.nav-links a { color:var(--gray); transition:color .2s; }
.nav-links a:hover, .nav-links a.active { color:var(--ink); }
.nav-links a.active { font-weight:700; }
.nav-btn { background:var(--ac); color:#fff !important; padding:8px 20px; border-radius:8px; font-weight:600; }
.crumb { padding:16px 0 0; font-size:.85rem; color:var(--gray); }
.crumb a { color:var(--ac); }
.crumb .sep { margin:0 8px; opacity:.5; }
.sec { padding:56px 0; }
.sec-alt { background:var(--light); }
.sec h2 { font-size:clamp(1.4rem,3vw,1.9rem); margin-bottom:12px; }
.hero { padding:72px 0 48px; }
.hero h1 { font-size:clamp(1.9rem,4.5vw,2.8rem); line-height:1.12; margin-bottom:16px; }
.hero h1 span { color:var(--ac2); }
.hero .lead { font-size:1.1rem; color:var(--gray); max-width:60ch; margin-bottom:24px; }
.hero-btns { display:flex; gap:12px; flex-wrap:wrap; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:20px; }
.card { background:var(--card); border-radius:var(--radius); padding:26px; border:1px solid rgba(0,0,0,.06); transition:transform .2s, box-shadow .2s; }
.card:hover { transform:translateY(-2px); box-shadow:var(--shadow); }
.card .icon { font-size:30px; margin-bottom:10px; }
.card h3 { font-size:1.05rem; margin-bottom:6px; }
.card p { font-size:.92rem; color:var(--gray); }
.card .more { display:inline-block; margin-top:10px; color:var(--ac); font-weight:600; font-size:.9rem; }
.two-col { display:grid; grid-template-columns:1fr 1fr; gap:32px; align-items:start; }
@media (max-width:800px) { .two-col { grid-template-columns:1fr; } }
.two-col h3 { margin-bottom:8px; }
.two-col ul { list-style:none; }
.two-col ul li { padding-left:22px; position:relative; margin-bottom:10px; color:var(--gray); }
.two-col ul li::before { content:'✓'; position:absolute; left:0; color:#22c55e; font-weight:700; }
.prose p { margin-bottom:14px; color:var(--ink); max-width:72ch; }
.prose h2 { margin:28px 0 10px; font-size:1.35rem; }
.prose ul { margin:0 0 14px 20px; }
.prose ul li { margin-bottom:8px; }
.plans-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:20px; max-width:960px; margin:0 auto; }
.plan { background:var(--card); border-radius:var(--radius); padding:30px 26px; border:1px solid rgba(0,0,0,.06); text-align:center; }
.plan.popular { border:2px solid var(--ac2); position:relative; }
.plan.popular::before { content:'Más elegido'; position:absolute; top:-12px; left:50%; transform:translateX(-50%); background:var(--ac2); color:#fff; padding:3px 16px; border-radius:20px; font-size:11px; font-weight:700; }
.plan.primary { background:linear-gradient(135deg,var(--ac),#4f46e5); color:#fff; border:none; }
.plan.primary h3, .plan.primary .price { color:#fff; }
.plan h3 { font-size:1.15rem; margin-bottom:4px; }
.plan .price { font-size:2.1rem; font-weight:800; margin:10px 0 4px; }
.plan .price span { font-size:.85rem; font-weight:400; color:var(--gray); }
.plan.primary .price span { color:rgba(255,255,255,.6); }
.plan .period { font-size:.8rem; color:var(--gray); margin-bottom:18px; }
.plan.primary .period { color:rgba(255,255,255,.6); }
.plan ul { text-align:left; margin-bottom:22px; font-size:.88rem; color:var(--gray); list-style:none; line-height:1.9; }
.plan.primary ul { color:rgba(255,255,255,.85); }
.plan ul li::before { content:'✓ '; color:#22c55e; font-weight:700; }
.faq-list { max-width:760px; margin:0 auto; }
.faq-list details { background:var(--card); border:1px solid rgba(0,0,0,.06); border-radius:10px; padding:16px 18px; margin-bottom:10px; }
.faq-list summary { cursor:pointer; font-weight:600; }
.faq-list details p { margin-top:10px; color:var(--gray); font-size:.95rem; }
.table-compare { width:100%; border-collapse:collapse; margin:20px 0; background:var(--card); border-radius:var(--radius); overflow:hidden; box-shadow:var(--shadow); }
.table-compare th, .table-compare td { padding:14px 16px; text-align:left; border-bottom:1px solid rgba(0,0,0,.05); font-size:.92rem; vertical-align:top; }
.table-compare th { background:var(--ink); color:#fff; }
.table-compare td.aspect { font-weight:700; width:22%; }
.table-compare td.win { color:#15803d; }
.cta { background:linear-gradient(135deg,var(--ac),#4f46e5); color:#fff; padding:64px 0; text-align:center; }
.cta h2 { font-size:clamp(1.5rem,3vw,2rem); margin-bottom:8px; }
.cta p { opacity:.9; margin-bottom:24px; }
.cta-btns { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
.cta .btn-primary { background:#fff; color:var(--ac); }
.cta .btn-secondary { background:rgba(255,255,255,.15); color:#fff; }
.cta .btn-wa { background:#22c55e; }
footer { padding:48px 0 28px; border-top:1px solid rgba(0,0,0,.06); background:var(--ink); color:#cbd5e1; font-size:.88rem; }
.footer-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:28px; margin-bottom:28px; }
.footer-brand { font-weight:800; font-size:1.05rem; color:#fff; margin-bottom:6px; }
.footer-brand span { color:var(--ac); }
.footer-title { font-weight:700; color:#fff; margin-bottom:10px; }
.footer-grid a { display:block; color:#cbd5e1; margin-bottom:8px; }
.footer-grid a:hover { color:#fff; }
.footer-note { font-size:.8rem; color:#94a3b8; }
.footer-note a { color:#a5b4fc; }
.tagline-row { display:flex; gap:12px; flex-wrap:wrap; margin:20px 0 0; }
.tag { background:var(--light); border-radius:20px; padding:6px 14px; font-size:.85rem; color:var(--gray); }
.verdict { background:#fef3c7; border:1px solid #fcd34d; border-radius:var(--radius); padding:20px 24px; margin:24px 0; }
.verdict strong { color:#92400e; }
.contact-form { max-width:480px; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
.contact-form input, .contact-form textarea, .contact-form select { padding:14px 18px; border-radius:10px; border:1.5px solid rgba(0,0,0,.1); font-size:.95rem; font-family:inherit; background:var(--card); color:var(--ink); outline:none; }
.contact-form input:focus, .contact-form textarea:focus, .contact-form select:focus { border-color:var(--ac); }
.contact-form textarea { resize:vertical; min-height:100px; }
.toc { background:var(--card); border:1px solid rgba(0,0,0,.06); border-radius:var(--radius); padding:20px 24px; margin:24px 0; max-width:760px; }
.toc a { display:block; color:var(--ac); margin-bottom:6px; }
@media (max-width:640px) { .nav-links { gap:12px; font-size:13px; } }
`;

// ── Contenido: home ──
function renderHome() {
  const meta = {
    title: 'FlexCRM — El CRM multi-rubro para tu negocio',
    description: SITE.description,
  };
  const featureCards = FEATURES.map(
    (f) => `<div class="card">
      <div class="icon">${f.icon}</div>
      <h3>${esc(f.name)}</h3>
      <p>${esc(f.short)}</p>
      <a class="more" href="/funcionalidades/${f.slug}/">Ver más →</a>
    </div>`
  ).join('');

  const planCards = PLANS.map((plan) => {
    const cls = plan.highlight && plan.id === 'demo' ? 'plan primary popular' : plan.highlight ? 'plan popular' : 'plan';
    const features = plan.features.map((f) => `<li>${esc(f)}</li>`).join('');
    return `<div class="${cls}">
      <h3>${plan.id === 'demo' ? '✨ ' : ''}${esc(plan.name)}</h3>
      <div class="price">${esc(plan.price)}<span>${esc(plan.period)}</span></div>
      <div class="period">${esc(plan.periodNote)}</div>
      <ul>${features}</ul>
      <a href="${plan.id === 'demo' ? SITE.signupUrl : '/precios/'}" class="btn ${plan.highlight && plan.id !== 'demo' ? 'btn-primary' : 'btn-secondary'}" style="width:100%;text-align:center" ${plan.id === 'demo' ? 'rel="noopener"' : ''}>${plan.id === 'demo' ? '🚀 Probalo ya' : 'Ver plan'}</a>
    </div>`;
  }).join('');

  const content = `
<section class="hero"><div class="wrap">
  <h1>El CRM que <span>crece</span> con tu negocio</h1>
  <p class="lead">Ventas, caja, stock, clientes, cuenta corriente y facturación ARCA. Multi-sucursal, multi-rubro. Todo en un solo lugar, sin instalación.</p>
  <div class="hero-btns">
    <a href="/precios/" class="btn btn-primary">Ver planes</a>
    <a href="${SITE.signupUrl}" class="btn btn-secondary" rel="noopener">Probar gratis</a>
    <a href="/demo/" class="btn btn-wa">Conocer la demo</a>
  </div>
</div></section>

<section class="sec sec-alt" id="features"><div class="wrap">
  <h2>Todo lo que necesitás para gestionar tu negocio</h2>
  <p style="color:var(--gray);max-width:60ch;margin-bottom:36px;">Desde el punto de venta hasta el reporte mensual. Sin módulos que no usás, sin complicaciones.</p>
  <div class="grid">${featureCards}</div>
  <p style="margin-top:28px;"><a class="more" href="/funcionalidades/">Ver todas las funcionalidades →</a></p>
</div></section>

<section class="sec" id="soluciones"><div class="wrap">
  <h2>Hecho para tu rubro</h2>
  <p style="color:var(--gray);max-width:60ch;margin-bottom:36px;">Indumentaria, ferreterías, panaderías y comercios minoristas: FlexCRM se adapta a lo que vendés, no al revés.</p>
  <div class="grid">
    ${SOLUTIONS.map((s) => `<div class="card"><div class="icon">${s.icon}</div><h3>${esc(s.rubro)}</h3><p>${esc(s.intro[0]).substring(0, 110)}…</p><a class="more" href="/soluciones/${s.slug}/">Ver solución →</a></div>`).join('')}
  </div>
</div></section>

<section class="sec sec-alt" id="plans"><div class="wrap">
  <h2 style="text-align:center;">Planes simples, sin letra chica</h2>
  <p style="text-align:center;color:var(--gray);margin-bottom:36px;">Todos incluyen soporte por WhatsApp. Sin compromiso.</p>
  <div class="plans-grid">${planCards}</div>
</div></section>`;

  return page({
    slug: '',
    meta,
    breadcrumb: [],
    schemaOpts: { faq: GENERAL_FAQ.slice(0, 5), offers: true },
    content,
  });
}

// ── Contenido: hubs y páginas ──
function renderFuncionalidadesHub() {
  const meta = {
    title: 'Funcionalidades de FlexCRM: POS, caja, stock y más',
    description:
      'Todas las funcionalidades de FlexCRM: punto de venta, caja, control de stock, clientes, cuenta corriente, reportes, multi-sucursal y facturación ARCA.',
  };
  const content = `
<section class="hero"><div class="wrap">
  <h1>Funcionalidades de FlexCRM</h1>
  <p class="lead">Un solo sistema para vender, cobrar, controlar stock y conocer a tus clientes. Cada módulo está integrado con el resto: una venta alimenta caja, stock y clientes al mismo tiempo.</p>
</div></section>
<section class="sec"><div class="wrap"><div class="grid">
${FEATURES.map((f) => `<div class="card"><div class="icon">${f.icon}</div><h3>${esc(f.name)}</h3><p>${esc(f.short)}</p><a class="more" href="/funcionalidades/${f.slug}/">Ver ${esc(f.name.toLowerCase())} →</a></div>`).join('')}
</div></div></section>`;
  return page({
    slug: 'funcionalidades',
    meta,
    breadcrumb: [{ position: 1, name: 'Inicio', url: `${SITE.url}/` }, { position: 2, name: 'Funcionalidades' }],
    schemaOpts: {},
    content,
  });
}

function renderFeature(feature) {
  const meta = { title: `${feature.title} | FlexCRM`, description: feature.description };
  const content = `
<section class="hero"><div class="wrap">
  <h1>${esc(feature.title)}</h1>
  <p class="lead">${esc(feature.short)}</p>
  <div class="hero-btns">
    <a href="${SITE.signupUrl}" class="btn btn-primary" rel="noopener">Probar gratis</a>
    <a href="/precios/" class="btn btn-secondary">Ver planes</a>
  </div>
</div></section>
<section class="sec"><div class="wrap"><div class="prose">
${feature.intro.map((p) => `<p>${esc(p)}</p>`).join('')}
</div></div></section>
<section class="sec sec-alt"><div class="wrap two-col">
  <div><h3>El problema que resuelve</h3><ul>${feature.problem.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
  <div><h3>Cómo funciona en FlexCRM</h3><ul>${feature.how.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
</div></section>
<section class="sec"><div class="wrap">
  <h2>Características</h2>
  <div class="grid" style="margin-top:24px;">
    ${feature.bullets.map((b) => `<div class="card"><p style="font-weight:600;">✓ ${esc(b)}</p></div>`).join('')}
  </div>
  <div class="tagline-row">
    ${FEATURES.filter((f) => f.slug !== feature.slug).map((f) => `<a class="tag" href="/funcionalidades/${f.slug}/">${esc(f.name)}</a>`).join('')}
  </div>
</div></section>`;
  return page({
    slug: `funcionalidades/${feature.slug}`,
    meta,
    breadcrumb: [
      { position: 1, name: 'Inicio', url: `${SITE.url}/` },
      { position: 2, name: 'Funcionalidades', url: `${SITE.url}/funcionalidades/` },
      { position: 3, name: feature.name },
    ],
    schemaOpts: { faq: feature.faq },
    content,
  });
}

function renderSolucionesHub() {
  const meta = {
    title: 'Soluciones de FlexCRM por rubro',
    description:
      'Sistema de gestión para indumentaria, ferreterías, panaderías y comercios minoristas: cómo FlexCRM resuelve las necesidades de cada rubro.',
  };
  const content = `
<section class="hero"><div class="wrap">
  <h1>Soluciones por rubro</h1>
  <p class="lead">Cada comercio tiene su forma de vender. FlexCRM es multi-rubro y se adapta a la tuya: stock con variantes, venta por mostrador, cuenta corriente y caja diaria.</p>
</div></section>
<section class="sec"><div class="wrap"><div class="grid">
${SOLUTIONS.map((s) => `<div class="card"><div class="icon">${s.icon}</div><h3>${esc(s.rubro)}</h3><p>${esc(s.intro[0])}</p><a class="more" href="/soluciones/${s.slug}/">Ver solución →</a></div>`).join('')}
</div></div></section>`;
  return page({
    slug: 'soluciones',
    meta,
    breadcrumb: [{ position: 1, name: 'Inicio', url: `${SITE.url}/` }, { position: 2, name: 'Soluciones' }],
    schemaOpts: {},
    content,
  });
}

function renderSolution(solution) {
  const meta = { title: `${solution.title} | FlexCRM`, description: solution.description };
  const content = `
<section class="hero"><div class="wrap">
  <h1>${esc(solution.title)}</h1>
  <p class="lead">${esc(solution.description)}</p>
  <div class="hero-btns">
    <a href="${SITE.signupUrl}" class="btn btn-primary" rel="noopener">Probar gratis</a>
    <a href="/precios/" class="btn btn-secondary">Ver planes</a>
  </div>
</div></section>
<section class="sec"><div class="wrap"><div class="prose">
${solution.intro.map((p) => `<p>${esc(p)}</p>`).join('')}
</div></div></section>
<section class="sec sec-alt"><div class="wrap two-col">
  <div><h3>Dolores típicos del rubro</h3><ul>${solution.pain.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
  <div><h3>Cómo lo resuelve FlexCRM</h3><ul>${solution.how.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
</div></section>
<section class="sec"><div class="wrap">
  <h2>Otras soluciones</h2>
  <div class="tagline-row">
    ${SOLUTIONS.filter((s) => s.slug !== solution.slug).map((s) => `<a class="tag" href="/soluciones/${s.slug}/">${esc(s.rubro)}</a>`).join('')}
  </div>
</div></section>`;
  return page({
    slug: `soluciones/${solution.slug}`,
    meta,
    breadcrumb: [
      { position: 1, name: 'Inicio', url: `${SITE.url}/` },
      { position: 2, name: 'Soluciones', url: `${SITE.url}/soluciones/` },
      { position: 3, name: solution.rubro },
    ],
    schemaOpts: { faq: solution.faq },
    content,
  });
}

function renderPrecios() {
  const meta = {
    title: 'Precios de FlexCRM: Demo, Básico, Pro y Enterprise',
    description:
      'Planes de FlexCRM: demo gratis 14 días sin tarjeta, Básico USD 15, Pro USD 40 y Enterprise USD 90 por mes. Soporte por WhatsApp incluido.',
  };
  const planCards = PLANS.map((plan) => {
    const cls = plan.id === 'demo' ? 'plan primary popular' : plan.highlight ? 'plan popular' : 'plan';
    const features = plan.features.map((f) => `<li>${esc(f)}</li>`).join('');
    return `<div class="${cls}">
      <h3>${plan.id === 'demo' ? '✨ ' : ''}${esc(plan.name)}</h3>
      <div class="price">${esc(plan.price)}<span>${esc(plan.period)}</span></div>
      <div class="period">${esc(plan.periodNote)}</div>
      <ul>${features}</ul>
      <a href="${SITE.signupUrl}" class="btn ${plan.highlight && plan.id !== 'demo' ? 'btn-primary' : 'btn-secondary'}" style="width:100%;text-align:center" rel="noopener">Comenzar</a>
    </div>`;
  }).join('');
  const content = `
<section class="hero"><div class="wrap">
  <h1>Planes simples, sin letra chica</h1>
  <p class="lead">Empezá gratis 14 días sin tarjeta de crédito y elegí el plan según tu cantidad de usuarios y sucursales. Todos incluyen soporte por WhatsApp.</p>
</div></section>
<section class="sec"><div class="wrap"><div class="plans-grid">${planCards}</div></div></section>
<section class="sec sec-alt"><div class="wrap">
  <h2>Preguntas frecuentes sobre precios</h2>
  <div class="faq-list" style="margin-top:20px;">
    <details><summary>¿La demo tiene costo?</summary><p>No. La demo es gratis por 14 días, sin tarjeta de crédito, con hasta 5 usuarios y 1 sucursal.</p></details>
    <details><summary>¿Los precios incluyen impuestos?</summary><p>Los precios publicados son en dólares estadounidenses y corresponden a la facturación mensual del servicio. Escribinos para confirmar las condiciones de facturación.</p></details>
    <details><summary>¿Puedo cambiar de plan después?</summary><p>Sí. Podés cambiar de plan cuando tu negocio lo necesite y conservás tu información.</p></details>
    <details><summary>¿Hay descuentos por pago anual?</summary><p>Escribinos por WhatsApp y te confirmamos las opciones de facturación disponibles para tu empresa.</p></details>
  </div>
</div></section>`;
  return page({
    slug: 'precios',
    meta,
    breadcrumb: [{ position: 1, name: 'Inicio', url: `${SITE.url}/` }, { position: 2, name: 'Precios' }],
    schemaOpts: { offers: true, faq: GENERAL_FAQ.slice(2, 4) },
    content,
  });
}

function renderComparativasHub() {
  const meta = {
    title: 'Comparativas: FlexCRM vs Excel, CRM, POS y más',
    description:
      'Comparativas objetivas para elegir sistema de gestión: FlexCRM vs Excel, CRM vs sistema de gestión, POS vs sistema de gestión, nube vs instalado y tienda online.',
  };
  const content = `
<section class="hero"><div class="wrap">
  <h1>Comparativas para elegir con criterio</h1>
  <p class="lead">Comparamos herramientas y conceptos para que decidas con información real, sin humo: cuándo alcanza una planilla, un POS o un CRM, y cuándo necesitás un sistema de gestión.</p>
</div></section>
<section class="sec"><div class="wrap"><div class="grid">
${COMPARATIVAS.map((c) => `<div class="card"><h3>${esc(c.title)}</h3><p>${esc(c.intro[0])}</p><a class="more" href="/comparativas/${c.slug}/">Leer comparativa →</a></div>`).join('')}
</div></div></section>`;
  return page({
    slug: 'comparativas',
    meta,
    breadcrumb: [{ position: 1, name: 'Inicio', url: `${SITE.url}/` }, { position: 2, name: 'Comparativas' }],
    schemaOpts: {},
    content,
  });
}

function renderComparativa(comparativa) {
  const meta = { title: `${comparativa.title} | FlexCRM`, description: comparativa.description };
  const rows = comparativa.rows
    .map(
      (row) => `<tr>
        <td class="aspect">${esc(row.aspect)}</td>
        <td>${esc(row.a)}</td>
        <td class="win">${esc(row.b)}</td>
      </tr>`
    )
    .join('');
  const content = `
<section class="hero"><div class="wrap">
  <h1>${esc(comparativa.title)}</h1>
  <p class="lead">${esc(comparativa.description)}</p>
</div></section>
<section class="sec"><div class="wrap"><div class="prose">
${comparativa.intro.map((p) => `<p>${esc(p)}</p>`).join('')}
</div>
<table class="table-compare">
  <thead><tr><th>Aspecto</th><th>Opción A</th><th>FlexCRM</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="verdict"><strong>Conclusión:</strong> ${esc(comparativa.verdict)}</div>
<div class="hero-btns">
  <a href="${SITE.signupUrl}" class="btn btn-primary" rel="noopener">Probar gratis</a>
  <a href="/comparativas/" class="btn btn-secondary">Ver más comparativas</a>
</div>
</div></section>`;
  return page({
    slug: `comparativas/${comparativa.slug}`,
    meta,
    breadcrumb: [
      { position: 1, name: 'Inicio', url: `${SITE.url}/` },
      { position: 2, name: 'Comparativas', url: `${SITE.url}/comparativas/` },
      { position: 3, name: comparativa.title },
    ],
    schemaOpts: { faq: comparativa.faq },
    content,
  });
}

function renderCasosDeExito() {
  const meta = {
    title: 'Casos de éxito de FlexCRM',
    description:
      'Casos de éxito de FlexCRM: comercios reales que usan el sistema para vender, cobrar y controlar stock. Si tu negocio usa FlexCRM, contanos tu caso.',
  };
  const content = `
<section class="hero"><div class="wrap">
  <h1>Casos de éxito</h1>
  <p class="lead">Publicamos historias reales de comercios que usan FlexCRM, con su problema, la solución y los resultados. No inventamos números: cada caso se publica con la información que el comercio autoriza.</p>
</div></section>
<section class="sec"><div class="wrap">
  <h2>¿Tu negocio usa FlexCRM?</h2>
  <div class="prose"><p>Si FlexCRM te ayudó a ordenar tu comercio, contanos tu experiencia. Publicamos el caso con tu nombre comercial, el rubro y los resultados que quieras compartir.</p></div>
  <div class="hero-btns" style="margin-top:16px;">
    <a href="/contacto/" class="btn btn-primary">Contar mi caso</a>
    <a href="${SITE.signupUrl}" class="btn btn-secondary" rel="noopener">Probar FlexCRM</a>
  </div>
</div></section>`;
  return page({
    slug: 'casos-de-exito',
    meta,
    breadcrumb: [{ position: 1, name: 'Inicio', url: `${SITE.url}/` }, { position: 2, name: 'Casos de éxito' }],
    schemaOpts: {},
    content,
  });
}

function renderDocumentacion() {
  const meta = {
    title: 'Documentación de FlexCRM: guía de uso',
    description:
      'Documentación pública de FlexCRM: introducción, primeros pasos, usuarios, sucursales, productos, clientes, ventas, caja, stock, reportes, facturación ARCA y cuenta corriente.',
  };
  const toc = DOC_SECTIONS.map(
    (section) => `<a href="#${section.id}">${esc(section.title)}</a>`
  ).join('');
  const sections = DOC_SECTIONS.map(
    (section) => `<h2 id="${section.id}">${esc(section.title)}</h2>${section.p.map((p) => `<p>${esc(p)}</p>`).join('')}`
  ).join('');
  const content = `
<section class="hero"><div class="wrap">
  <h1>Documentación de FlexCRM</h1>
  <p class="lead">La guía oficial para empezar y sacarle el máximo provecho al sistema. Es pública y se actualiza junto con el producto.</p>
</div></section>
<section class="sec"><div class="wrap">
  <div class="toc"><strong>Contenido</strong>${toc}</div>
  <div class="prose">${sections}</div>
</div></section>`;
  return page({
    slug: 'documentacion',
    meta,
    breadcrumb: [{ position: 1, name: 'Inicio', url: `${SITE.url}/` }, { position: 2, name: 'Documentación' }],
    schemaOpts: {},
    content,
  });
}

function renderSobre() {
  const meta = {
    title: 'Sobre FlexCRM: el CRM multi-rubro argentino',
    description:
      'FlexCRM es un CRM multi-rubro desarrollado en Argentina para PyMEs y comercios: conoce el producto, su enfoque y quién lo construye.',
  };
  const content = `
<section class="hero"><div class="wrap">
  <h1>Sobre FlexCRM</h1>
  <p class="lead">FlexCRM es un CRM multi-rubro desarrollado en Argentina para PyMEs y comercios minoristas. Nació de la necesidad de un negocio real y creció como producto comercial para el retail argentino.</p>
</div></section>
<section class="sec"><div class="wrap"><div class="prose">
  <h2>Qué es FlexCRM</h2>
  <p>Un SaaS multi-tenant: cada empresa tiene su propia base de datos aislada, con sus usuarios, productos, clientes, caja y configuraciones. Funciona 100% en el navegador, sin instalación ni mantenimiento de servidores.</p>
  <h2>Qué lo hace distinto</h2>
  <ul>
    <li>Multi-rubro: se adapta a lo que vendés, con variantes como talle, color y sabor.</li>
    <li>Multi-sucursal: stock y caja independientes por local en una misma cuenta.</li>
    <li>Integrado: la venta alimenta stock, caja, clientes y reportes sin cargar dos veces.</li>
    <li>Argentino: pensado para el comercio local, con facturación ARCA y soporte en español por WhatsApp.</li>
  </ul>
  <h2>Quién lo construye</h2>
  <p>FlexCRM es desarrollado por ${esc(SITE.creatorName)}, un estudio de desarrollo web y software argentino. Conocé más en <a href="${SITE.creatorUrl}" target="_blank" rel="noopener" style="color:var(--ac);">unfulanodev.com.ar</a>.</p>
</div></div></section>`;
  return page({
    slug: 'sobre-flexcrm',
    meta,
    breadcrumb: [{ position: 1, name: 'Inicio', url: `${SITE.url}/` }, { position: 2, name: 'Sobre FlexCRM' }],
    schemaOpts: {},
    content,
  });
}

function renderDemo() {
  const meta = {
    title: 'Demo gratis de FlexCRM: 14 días sin tarjeta',
    description:
      'Probá FlexCRM gratis durante 14 días sin tarjeta de crédito: POS, caja, stock, clientes, cuenta corriente, presupuestos y reportes con hasta 5 usuarios.',
  };
  const content = `
<section class="hero"><div class="wrap">
  <h1>Demo gratis de 14 días</h1>
  <p class="lead">Sin tarjeta de crédito, sin compromiso. Creás tu cuenta, activás el email y empezás a vender el mismo día.</p>
  <div class="hero-btns">
    <a href="${SITE.signupUrl}" class="btn btn-primary" rel="noopener">🚀 Crear mi cuenta gratis</a>
    <a href="/documentacion/" class="btn btn-secondary">Ver la documentación</a>
  </div>
</div></section>
<section class="sec"><div class="wrap two-col">
  <div>
    <h3>Qué incluye la demo</h3>
    <ul>
      <li>Hasta 5 usuarios y 1 sucursal</li>
      <li>POS, Caja y Clientes</li>
      <li>Ventas, Productos y Stock</li>
      <li>Cuenta Corriente</li>
      <li>Presupuestos y Reportes</li>
      <li>Soporte por WhatsApp</li>
    </ul>
  </div>
  <div>
    <h3>Cómo empezar</h3>
    <ul>
      <li>Creá tu cuenta con el nombre de tu negocio y tu email</li>
      <li>Activá tu cuenta desde el email de verificación</li>
      <li>Cargá productos y clientes, o importalos desde Excel</li>
      <li>Abrí la caja de tu sucursal y vendé</li>
    </ul>
  </div>
</div></section>`;
  return page({
    slug: 'demo',
    meta,
    breadcrumb: [{ position: 1, name: 'Inicio', url: `${SITE.url}/` }, { position: 2, name: 'Demo' }],
    schemaOpts: { faq: GENERAL_FAQ.slice(3, 4) },
    content,
  });
}

function renderContacto() {
  const meta = {
    title: 'Contacto de FlexCRM: escribinos por WhatsApp o email',
    description:
      'Contactá a FlexCRM por WhatsApp o email: dudas sobre el sistema, planes, facturación ARCA, migración de datos o integraciones.',
  };
  const content = `
<section class="hero"><div class="wrap">
  <h1>Hablemos de tu negocio</h1>
  <p class="lead">Respondemos en el día por WhatsApp o email. Contanos qué vendés y qué necesitás ordenar.</p>
  <div class="hero-btns">
    <a href="${SITE.whatsapp}" class="btn btn-wa" target="_blank" rel="noopener">💬 ${esc(SITE.whatsappLabel)}</a>
    <a href="mailto:${SITE.email}" class="btn btn-secondary">✉️ ${esc(SITE.email)}</a>
  </div>
</div></section>
<section class="sec"><div class="wrap">
  <form action="${SITE.appUrl}/api/landing/lead" method="POST" class="contact-form">
    <input type="hidden" name="pagina" value="flexcrm" />
    <input type="text" name="nombre" required placeholder="Tu nombre *" aria-label="Tu nombre" />
    <input type="email" name="email" placeholder="tu@email.com" aria-label="Tu email" />
    <input type="tel" name="telefono" placeholder="WhatsApp o teléfono" aria-label="Tu teléfono" />
    <select name="empresa_interes" aria-label="Qué te interesa">
      <option value="">¿Qué te interesa?</option>
      <option value="flexcrm">FlexCRM</option>
      <option value="web">Página web</option>
      <option value="tienda">Tienda online</option>
      <option value="otro">Otro</option>
    </select>
    <textarea name="mensaje" required placeholder="Contanos de tu negocio y qué necesitás *" aria-label="Tu mensaje"></textarea>
    <button type="submit" class="btn btn-primary" style="width:100%;text-align:center">Enviar consulta</button>
  </form>
</div></section>`;
  return page({
    slug: 'contacto',
    meta,
    breadcrumb: [{ position: 1, name: 'Inicio', url: `${SITE.url}/` }, { position: 2, name: 'Contacto' }],
    schemaOpts: {},
    content,
  });
}

function renderBlogHub() {
  const meta = {
    title: 'Blog de FlexCRM: guías para comercios',
    description:
      'Artículos prácticos para comercios argentinos: sistemas de gestión, stock, caja, POS, cuenta corriente, facturación ARCA y más.',
  };
  const publishedCards = BLOG_POSTS.map(
    (post) => `<div class="card"><h3>${esc(post.title)}</h3><p>${esc(post.description)}</p><a class="more" href="/blog/${post.slug}/">Leer artículo →</a></div>`
  ).join('');
  const plannedItems = BLOG_PLANNED.map((title) => `<li>${esc(title)}</li>`).join('');
  const content = `
<section class="hero"><div class="wrap">
  <h1>Blog de FlexCRM</h1>
  <p class="lead">Guías prácticas y comparaciones para comercios argentinos, escritas desde la experiencia real con el producto.</p>
</div></section>
<section class="sec"><div class="wrap"><div class="grid">${publishedCards}</div></div></section>
<section class="sec sec-alt"><div class="wrap">
  <h2>Próximos artículos</h2>
  <div class="prose"><p>Estamos preparando estos temas. Si querés que desarrollemos alguno primero, escribinos.</p></div>
  <ul style="margin:16px 0 0 20px;color:var(--gray);columns:2;column-gap:40px;">${plannedItems}</ul>
</div></section>`;
  return page({
    slug: 'blog',
    meta,
    breadcrumb: [{ position: 1, name: 'Inicio', url: `${SITE.url}/` }, { position: 2, name: 'Blog' }],
    schemaOpts: {},
    content,
  });
}

function renderBlogPost(post) {
  const meta = { title: `${post.title} | Blog FlexCRM`, description: post.description };
  const sections = post.sections
    .map(
      (section) => `<h2>${esc(section.h2)}</h2>${section.p.map((p) => `<p>${esc(p)}</p>`).join('')}`
    )
    .join('');
  const content = `
<section class="hero"><div class="wrap">
  <h1>${esc(post.title)}</h1>
  <p class="lead">${esc(post.description)}</p>
  <p style="font-size:.85rem;color:var(--gray);">Publicado el ${post.date}</p>
</div></section>
<section class="sec"><div class="wrap"><div class="prose">${sections}</div>
<div class="hero-btns" style="margin-top:24px;">
  <a href="/demo/" class="btn btn-primary">Conocer la demo</a>
  <a href="/blog/" class="btn btn-secondary">Volver al blog</a>
</div>
</div></section>`;
  return page({
    slug: `blog/${post.slug}`,
    meta,
    breadcrumb: [
      { position: 1, name: 'Inicio', url: `${SITE.url}/` },
      { position: 2, name: 'Blog', url: `${SITE.url}/blog/` },
      { position: 3, name: post.title },
    ],
    schemaOpts: { faq: post.faq, article: { date: post.date } },
    content,
  });
}

// ── robots / sitemap / llms / headers ──
function buildRobots() {
  return `# FlexCRM — robots.txt
# Todos los crawlers pueden indexar el sitio público de marketing.

User-Agent: *
Allow: /

User-Agent: GPTBot
User-Agent: OAI-SearchBot
User-Agent: ChatGPT-User
User-Agent: ClaudeBot
User-Agent: Claude-SearchBot
User-Agent: Claude-User
User-Agent: PerplexityBot
User-Agent: Perplexity-User
User-Agent: Google-Extended
User-Agent: Applebot-Extended
User-Agent: Bytespider
User-Agent: Amazonbot
User-Agent: cohere-ai
User-Agent: MistralBot
User-Agent: meta-externalagent
Allow: /

Sitemap: ${SITE.url}/sitemap.xml
`;
}

function collectUrls() {
  const urls = [canonical('')];
  urls.push(canonical('funcionalidades'));
  FEATURES.forEach((f) => urls.push(canonical(`funcionalidades/${f.slug}`)));
  urls.push(canonical('soluciones'));
  SOLUTIONS.forEach((s) => urls.push(canonical(`soluciones/${s.slug}`)));
  urls.push(canonical('precios'));
  urls.push(canonical('comparativas'));
  COMPARATIVAS.forEach((c) => urls.push(canonical(`comparativas/${c.slug}`)));
  urls.push(canonical('casos-de-exito'));
  urls.push(canonical('documentacion'));
  urls.push(canonical('sobre-flexcrm'));
  urls.push(canonical('contacto'));
  urls.push(canonical('demo'));
  urls.push(canonical('blog'));
  BLOG_POSTS.filter((p) => p.published).forEach((p) => urls.push(canonical(`blog/${p.slug}`)));
  return urls;
}

function buildSitemap(urls) {
  const entries = urls
    .map(
      (url) => `  <url>
    <loc>${url}</loc>
    <lastmod>${SITE.updated}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${url === canonical('') ? '1.0' : '0.7'}</priority>
  </url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}

function buildLlmsTxt() {
  const lines = [
    '# FlexCRM',
    '',
    `> ${SITE.description}`,
    '',
    'FlexCRM es un SaaS de gestión comercial argentino que funciona en el navegador: punto de venta, caja con arqueo, control de stock con variantes, clientes con cuenta corriente y puntos, presupuestos, pedidos pendientes, reportes y factura electrónica ARCA (A, B y C) en planes Pro y Enterprise. Multi-sucursal, multi-rubro, datos aislados por empresa.',
    '',
    '## Links',
    `- [Sitio oficial](${SITE.url})`,
    `- [Funcionalidades](${SITE.url}/funcionalidades/)`,
    `- [Precios](${SITE.url}/precios/)`,
    `- [Documentación](${SITE.url}/documentacion/)`,
    `- [Probar gratis / registrarse](${SITE.signupUrl})`,
    `- [Ingresar](${SITE.loginUrl})`,
    '',
    '## Precios (facturación mensual, soporte por WhatsApp incluido)',
    ...PLANS.map(
      (plan) =>
        `- ${plan.name}: ${plan.price}${plan.id === 'demo' ? ' por 14 días' : '/mes'} — ${plan.features.slice(0, 4).join('; ')}`
    ),
    '',
    '## Contacto',
    `- WhatsApp: ${SITE.whatsappLabel}`,
    `- Email: ${SITE.email}`,
    `- Creado por [${SITE.creatorName}](${SITE.creatorUrl})`,
    '',
    '## Notas',
    '- Producto argentino, orientado a retail y PyMEs (indumentaria, panadería, ferretería, farmacia).',
    '- La facturación ARCA está disponible en planes Pro y Enterprise y requiere configuración fiscal.',
    '- FlexCRM no tiene API pública para desarrolladores; cuenta con integraciones (Mercado Libre, Tiendanube) y webhooks de eventos.',
    `- Última verificación de esta información: ${SITE.updated}.`,
  ];
  return lines.join('\n') + '\n';
}

function buildLlmsFullTxt() {
  const featureLines = FEATURES.map(
    (f) => `- **${f.name}:** ${f.short}`
  );
  const faqLines = GENERAL_FAQ.map((item) => `### ${item.q}\n\n${item.a}`);
  const lines = [
    '# FlexCRM — Documentación extendida para modelos de lenguaje',
    '',
    '## ¿Qué es FlexCRM?',
    '',
    GENERAL_FAQ[0].a,
    '',
    '## Módulos principales',
    '',
    ...featureLines,
    '',
    '## Seguridad',
    '',
    '- Datos aislados por empresa (una base de datos SQLite por tenant).',
    '- Roles y permisos por usuario.',
    '- 2FA (código de doble factor), bloqueo por intentos fallidos y cierre de sesión por inactividad.',
    '- Encriptación de credenciales de integraciones (AFIP, Mercado Libre).',
    '- Rate limiting y validación de entrada en los endpoints públicos.',
    '',
    '## Planes y precios (USD, facturación mensual)',
    '',
    '| Plan | Precio | Incluye |',
    '|---|---|---|',
    ...PLANS.map((plan) => `| ${plan.name} | ${plan.price} | ${plan.features.join(', ')} |`),
    '',
    'Todos los planes incluyen soporte por WhatsApp.',
    '',
    '## Preguntas frecuentes',
    '',
    ...faqLines,
    '',
    '## URLs',
    '',
    `- Sitio oficial: ${SITE.url}`,
    `- Precios: ${SITE.url}/precios/`,
    `- Documentación: ${SITE.url}/documentacion/`,
    `- Registro (demo gratis): ${SITE.signupUrl}`,
    `- Login: ${SITE.loginUrl}`,
    `- Desarrollador: ${SITE.creatorUrl}`,
    '',
    '## Contacto',
    '',
    `- WhatsApp: ${SITE.whatsappLabel}`,
    `- Email: ${SITE.email}`,
    '',
    '## Idoneidad',
    '',
    'FlexCRM es útil para: comercios minoristas con o sin sucursales, panaderías, indumentaria, ferreterías, farmacias, tiendas de regalos y cualquier PyME argentina que necesite vender, cobrar y controlar stock con facturación AFIP.',
    '',
    `Última verificación: ${SITE.updated}.`,
  ];
  return lines.join('\n') + '\n';
}

function buildHeaders() {
  return `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Robots-Tag: index, follow

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
}

function build404() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Página no encontrada — FlexCRM</title>
<meta name="robots" content="noindex, nofollow">
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}.card{background:#fff;border-radius:16px;padding:48px 40px;max-width:420px;box-shadow:0 4px 32px rgba(0,0,0,.06);border:1px solid rgba(0,0,0,.06)}h1{font-size:1.6rem;margin-bottom:12px}p{color:#64748b;line-height:1.6;margin-bottom:24px}a{display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;border-radius:10px;text-decoration:none;font-weight:600}a:hover{background:#4f46e5}</style>
</head>
<body>
<div class="card">
  <h1>Página no encontrada</h1>
  <p>La página que buscás no existe o fue movida.</p>
  <a href="/">Volver al inicio</a>
</div>
</body>
</html>`;
}

// ── Escritura ──
function writePage(out, slug, html) {
  const target = slug ? path.join(out, slug, 'index.html') : path.join(out, 'index.html');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, 'utf8');
}

function build(options = {}) {
  const out = path.resolve(options.outDir || OUT);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  writePage(out, '', renderHome());
  writePage(out, 'funcionalidades', renderFuncionalidadesHub());
  FEATURES.forEach((feature) => writePage(out, `funcionalidades/${feature.slug}`, renderFeature(feature)));
  writePage(out, 'soluciones', renderSolucionesHub());
  SOLUTIONS.forEach((solution) => writePage(out, `soluciones/${solution.slug}`, renderSolution(solution)));
  writePage(out, 'precios', renderPrecios());
  writePage(out, 'comparativas', renderComparativasHub());
  COMPARATIVAS.forEach((comparativa) => writePage(out, `comparativas/${comparativa.slug}`, renderComparativa(comparativa)));
  writePage(out, 'casos-de-exito', renderCasosDeExito());
  writePage(out, 'documentacion', renderDocumentacion());
  writePage(out, 'sobre-flexcrm', renderSobre());
  writePage(out, 'demo', renderDemo());
  writePage(out, 'contacto', renderContacto());
  writePage(out, 'blog', renderBlogHub());
  BLOG_POSTS.filter((post) => post.published).forEach((post) => writePage(out, `blog/${post.slug}`, renderBlogPost(post)));

  fs.writeFileSync(path.join(out, 'robots.txt'), buildRobots(), 'utf8');
  fs.writeFileSync(path.join(out, 'sitemap.xml'), buildSitemap(collectUrls()), 'utf8');
  fs.writeFileSync(path.join(out, 'llms.txt'), buildLlmsTxt(), 'utf8');
  fs.writeFileSync(path.join(out, 'llms-full.txt'), buildLlmsFullTxt(), 'utf8');
  fs.writeFileSync(path.join(out, '404.html'), build404(), 'utf8');
  fs.writeFileSync(path.join(out, '_headers'), buildHeaders(), 'utf8');

  // Assets públicos copiados desde public/ (allowlist)
  const assets = ['fc-og.png', 'fc-og.svg', 'flexcrm-indexnow-key.txt'];
  for (const asset of assets) {
    const src = path.join(__dirname, '..', 'public', asset);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(out, asset));
    }
  }

  // Mantener sincronizadas las copias servidas por el backend (localhost/app)
  const publicDir = path.join(__dirname, '..', 'public');
  if (!options.skipPublicSync) {
    fs.writeFileSync(path.join(publicDir, 'llms.txt'), buildLlmsTxt(), 'utf8');
    fs.writeFileSync(path.join(publicDir, 'llms-full.txt'), buildLlmsFullTxt(), 'utf8');
  }

  return {
    out,
    urls: collectUrls(),
    pages: collectUrls().length,
  };
}

module.exports = { build, collectUrls, buildRobots, buildSitemap, buildLlmsTxt, buildLlmsFullTxt, canonical };

if (require.main === module) {
  const result = build();
  console.log('✓ Marketing generado en', result.out);
  console.log('✓ URLs publicadas:', result.urls.length);
}
