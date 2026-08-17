const { pageJsonLd, serializeJsonLdScript, SITE_URL } = require('./schema');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderLink(link) {
  const external = /^https:\/\//.test(link.href);
  const target = external ? ' target="_blank" rel="noopener"' : '';
  return `<a href="${escapeHtml(link.href)}"${target}>${escapeHtml(link.label)}</a>`;
}

function renderSection(section) {
  const paragraphs = (section.paragraphs || []).map((text) => `<p>${escapeHtml(text)}</p>`).join('\n');
  const bullets = section.bullets?.length
    ? `<ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';
  const links = section.links?.length
    ? `<p class="page-links">${section.links.map(renderLink).join(' · ')}</p>`
    : '';
  return `<section class="content-section"><h2>${escapeHtml(section.heading)}</h2>${paragraphs}${bullets}${links}</section>`;
}

function renderPortfolioItems(items) {
  if (!items?.length) return '';
  return `<section class="portfolio-grid" aria-labelledby="portfolio-items-title"><h2 id="portfolio-items-title">Demos disponibles</h2><div class="portfolio-cards">${items.map((item) => `<article class="portfolio-card"><p class="card-kicker">${escapeHtml(item.category)} · Demo</p><h3><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a></h3><p>${escapeHtml(item.description)}</p><a class="card-link" href="${escapeHtml(item.path)}">Ver demo</a></article>`).join('')}</div></section>`;
}

function pageFileName(pagePath) {
  return `${pagePath.replace(/^\/+|\/+$/g, '')}.html`;
}

function renderPage(page) {
  const canonical = `${SITE_URL}${page.path}`;
  const breadcrumb = `<nav class="breadcrumbs" aria-label="Migas de pan"><ol><li><a href="/">Inicio</a></li><li aria-current="page">${escapeHtml(page.breadcrumb)}</li></ol></nav>`;
  const related = page.related?.length
    ? `<section class="related" aria-labelledby="related-title"><h2 id="related-title">Tambien puede interesarte</h2><ul>${page.related.map((link) => `<li>${renderLink(link)}</li>`).join('')}</ul></section>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="robots" content="index, follow">
  <meta name="author" content="Un Fulano Dev">
  <meta name="theme-color" content="#E85B4F">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${SITE_URL}/og.svg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type" content="image/svg+xml">
  <meta property="og:image:alt" content="Un Fulano Dev - desarrollo web y software a medida">
  <meta property="og:locale" content="es_AR">
  <meta property="og:site_name" content="Un Fulano Dev">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(page.title)}">
  <meta name="twitter:description" content="${escapeHtml(page.description)}">
  <meta name="twitter:image" content="${SITE_URL}/og.svg">
  <meta name="twitter:image:alt" content="Un Fulano Dev - desarrollo web y software a medida">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/page.css">
  ${serializeJsonLdScript(pageJsonLd(page))}
</head>
<body>
  <a class="skip-link" href="#contenido">Saltar al contenido</a>
  <header class="site-header">
    <div class="page-wrap header-row">
      <a class="brand" href="/">Un Fulano Dev</a>
      <nav aria-label="Navegacion principal">
        <a href="/desarrollo-web">Servicios</a>
        <a href="/portfolio">Portfolio</a>
        <a href="/sobre-nosotros">Sobre el proyecto</a>
        <a class="nav-cta" href="/contacto">Contacto</a>
      </nav>
    </div>
  </header>
  <main id="contenido" class="page-wrap">
    ${breadcrumb}
    <article>
      <p class="eyebrow">Un Fulano Dev · Catamarca, Argentina</p>
      <h1>${escapeHtml(page.h1)}</h1>
      <p class="lead">${escapeHtml(page.intro)}</p>
      ${page.notice ? `<p class="page-notice">${escapeHtml(page.notice)}</p>` : ''}
      ${renderPortfolioItems(page.items)}
      ${page.sections.map(renderSection).join('\n')}
    </article>
    ${related}
    <section class="page-cta" aria-labelledby="cta-title">
      <h2 id="cta-title">${escapeHtml(page.cta.label)}</h2>
      <p>Contame que necesitas y revisamos juntos si puedo ayudarte.</p>
      <a class="button" href="${escapeHtml(page.cta.href)}">Escribime</a>
    </section>
  </main>
  <footer class="site-footer">
    <div class="page-wrap">
      <strong>Un Fulano Dev</strong>
      <span>Desarrollo web y software desde Catamarca, Argentina.</span>
      <a href="/contacto">Contacto</a>
    </div>
  </footer>
</body>
</html>
`;
}

module.exports = { escapeHtml, pageFileName, renderPage };
