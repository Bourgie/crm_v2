const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { buildUnfulanoSite } = require('../scripts/build-unfulano-site');
const { routes } = require('../seo/unfulanodev/routes');

const temporaryOutputDirectories = [];

function createOutputDir() {
  const outputRoot = path.resolve(__dirname, '..', 'dist');
  fs.mkdirSync(outputRoot, { recursive: true });
  const outputDir = fs.mkdtempSync(path.join(outputRoot, 'unfulano-site-'));
  temporaryOutputDirectories.push(outputDir);
  return outputDir;
}

test.after(() => {
  for (const directory of temporaryOutputDirectories) fs.rmSync(directory, { recursive: true, force: true });
});

function listHtmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listHtmlFiles(fullPath) : entry.name.endsWith('.html') ? [fullPath] : [];
  });
}

test('builds an isolated Un Fulano static site', () => {
  const outputDir = createOutputDir();

  buildUnfulanoSite({ outputDir });

  assert.ok(fs.existsSync(path.join(outputDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(outputDir, 'robots.txt')));
  assert.ok(fs.existsSync(path.join(outputDir, 'sitemap.xml')));
  assert.ok(fs.existsSync(path.join(outputDir, '_headers')));
  assert.ok(fs.existsSync(path.join(outputDir, '_redirects')));
  assert.ok(fs.existsSync(path.join(outputDir, 'manifest.webmanifest')));
  assert.ok(fs.existsSync(path.join(outputDir, 'favicon.svg')));
  assert.ok(!fs.existsSync(path.join(outputDir, 'unfulano-landing.html')));
});

test('publishes only canonical Un Fulano URLs in the sitemap', () => {
  const outputDir = createOutputDir();

  buildUnfulanoSite({ outputDir });

  const sitemap = fs.readFileSync(path.join(outputDir, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /<loc>https:\/\/unfulanodev\.com\.ar<\/loc>/);
  assert.doesNotMatch(sitemap, /flexcrm|unfulano-landing\.html|\.html/);
  assert.doesNotMatch(sitemap, /\/blog\//);
  assert.equal((sitemap.match(/<loc>/g) || []).length, 15);
});

test('publishes search-friendly crawler policy for the Un Fulano site', () => {
  const outputDir = createOutputDir();

  buildUnfulanoSite({ outputDir });

  const robots = fs.readFileSync(path.join(outputDir, 'robots.txt'), 'utf8');
  const llms = fs.readFileSync(path.join(outputDir, 'llms.txt'), 'utf8');

  assert.match(robots, /Sitemap: https:\/\/unfulanodev\.com\.ar\/sitemap\.xml/);
  assert.match(robots, /User-agent: OAI-SearchBot[\s\S]*Allow: \/?/);
  assert.match(robots, /User-agent: GPTBot[\s\S]*Disallow: \/?/);
  assert.match(llms, /^# Un Fulano Dev/m);
  assert.match(llms, /Catamarca, Argentina/);
});

test('publishes complete canonical metadata for the home page', () => {
  const outputDir = createOutputDir();

  buildUnfulanoSite({ outputDir });

  const home = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');

  assert.match(home, /<title>Un Fulano Dev \| Desarrollo web/);
  assert.match(home, /<meta name="description" content="[^"]+Catamarca[^"]+">/);
  assert.match(home, /<meta name="robots" content="index, follow">/);
  assert.match(home, /<link rel="canonical" href="https:\/\/unfulanodev\.com\.ar">/);
  assert.match(home, /<meta property="og:image" content="https:\/\/unfulanodev\.com\.ar\/og\.svg">/);
  assert.match(home, /<meta property="og:image:width" content="1200">/);
  assert.match(home, /<meta property="og:image:height" content="630">/);
  assert.match(home, /<meta property="og:image:type" content="image\/svg\+xml">/);
  assert.match(home, /<meta name="twitter:image:alt" content="[^"]+">/);
  assert.match(home, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/);
  assert.match(home, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(home, /href="\/desarrollo-web"/);
  assert.match(home, /href="\/tiendas-online"/);
  assert.match(home, /href="\/crm"/);
  assert.doesNotMatch(home, /meta name="keywords"/);
  assert.equal((home.match(/<h1\b/g) || []).length, 1);
});

test('publishes parseable JSON-LD with stable entity identifiers', () => {
  const outputDir = createOutputDir();

  buildUnfulanoSite({ outputDir });

  const home = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
  const blocks = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const graph = blocks.flatMap((block) => block['@graph'] || [block]);
  const ids = new Set(graph.map((node) => node['@id']).filter(Boolean));

  assert.ok(blocks.length > 0);
  assert.ok(graph.some((node) => node['@type'] === 'Organization'));
  assert.ok(graph.some((node) => node['@type'] === 'WebSite'));
  assert.ok(graph.some((node) => node['@type'] === 'WebPage'));
  assert.ok(graph.some((node) => node['@type'] === 'Service'));
  assert.ok(graph.some((node) => node['@type'] === 'FAQPage'));
  assert.ok(ids.has('https://unfulanodev.com.ar/#organization'));
  assert.ok(ids.has('https://unfulanodev.com.ar/#website'));
  assert.ok(ids.has('https://unfulanodev.com.ar/#webpage'));
  assert.deepEqual(
    graph.filter((node) => node['@type'] === 'Service').map((node) => node['@id']),
    [
      'https://unfulanodev.com.ar/#service-desarrollo-web',
      'https://unfulanodev.com.ar/#service-tiendas-online',
      'https://unfulanodev.com.ar/#service-sistemas-a-medida',
      'https://unfulanodev.com.ar/#service-crm',
    ],
  );
  assert.ok(graph.every((node) => !node.sameAs || node.sameAs.every((url) => !url.includes('wa.me'))));
});

test('does not expose the build-only home template through public output', () => {
  assert.equal(fs.existsSync(path.resolve(__dirname, '..', 'public', 'unfulano-landing.html')), false);
});

test('keeps the landing form and tracking within the approved integration contract', () => {
  const outputDir = createOutputDir();

  buildUnfulanoSite({ outputDir });

  const home = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
  assert.match(home, /headers: \{ 'Content-Type': 'application\/json', 'Accept': 'application\/json' \}/);
  assert.match(home, /body: JSON\.stringify\(payload\)/);
  assert.doesNotMatch(home, /body: new URLSearchParams\(fd\)/);
  assert.doesNotMatch(home, /<noscript><img src="https:\/\/app\.flexcrm\.com\.ar\/api\/landing\/pixel/);
  assert.match(home, /TRACKED_QUERY_KEYS/);
});

test('rejects output paths outside the dedicated dist directory', () => {
  assert.throws(
    () => buildUnfulanoSite({ outputDir: path.resolve(__dirname, '..', 'public') }),
    /Output directory must be inside/,
  );
});

test('builds canonical service pages with one H1 and page-level metadata', () => {
  const outputDir = createOutputDir();
  const servicePaths = [
    '/desarrollo-web',
    '/tiendas-online',
    '/sistemas-a-medida',
    '/crm',
  ];

  buildUnfulanoSite({ outputDir });

  for (const route of servicePaths) {
    const file = path.join(outputDir, `${route.slice(1)}.html`);
    assert.ok(fs.existsSync(file), `missing generated page for ${route}`);
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, new RegExp(`<link rel="canonical" href="https://unfulanodev\\.com\\.ar${route}">`));
    assert.match(html, /<meta property="og:type" content="website">/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /BreadcrumbList/);
    assert.match(html, /"@type": "Service"/);
  }
});

test('builds local, about and contact pages with unique page content', () => {
  const outputDir = createOutputDir();
  const pagePaths = [
    '/desarrollo-web-catamarca',
    '/tiendas-online-catamarca',
    '/sobre-nosotros',
    '/contacto',
  ];

  buildUnfulanoSite({ outputDir });

  for (const route of pagePaths) {
    const file = path.join(outputDir, `${route.slice(1)}.html`);
    assert.ok(fs.existsSync(file), `missing generated page for ${route}`);
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, new RegExp(`<link rel="canonical" href="https://unfulanodev\\.com\\.ar${route}">`));
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /Catamarca/);
    assert.match(html, /BreadcrumbList/);
  }
});

test('builds the portfolio index and individual demo pages', () => {
  const outputDir = createOutputDir();
  const portfolioPaths = [
    '/portfolio',
    '/portfolio/entremimos',
    '/portfolio/vertice-propiedades',
    '/portfolio/trama-indumentaria',
    '/portfolio/el-fogon-del-valle',
    '/portfolio/crm-retail',
  ];

  buildUnfulanoSite({ outputDir });

  for (const route of portfolioPaths) {
    const file = path.join(outputDir, `${route.slice(1)}.html`);
    assert.ok(fs.existsSync(file), `missing generated portfolio page for ${route}`);
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, new RegExp(`<link rel="canonical" href="https://unfulanodev\\.com\\.ar${route}">`));
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /demo/i);
    assert.match(html, /CreativeWork|CollectionPage|ItemList/);
  }
});

test('does not keep the old broken demo URLs in the generated home', () => {
  const outputDir = createOutputDir();

  buildUnfulanoSite({ outputDir });

  const home = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
  assert.doesNotMatch(home, /\/demos\//);
  assert.match(home, /\/portfolio\/entremimos/);
  assert.match(home, /\/portfolio\/vertice-propiedades/);
});

test('keeps visible FAQ questions aligned with FAQ JSON-LD', () => {
  const outputDir = createOutputDir();

  buildUnfulanoSite({ outputDir });

  const home = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
  const visibleQuestions = [...home.matchAll(/<div class="faq-q">\s*<button type="button">([^<]+)<\/button>/g)]
    .map((match) => match[1].trim());
  const blocks = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const faq = blocks.flatMap((block) => block['@graph'] || [block]).find((node) => node['@type'] === 'FAQPage');
  const schemaQuestions = faq.mainEntity.map((item) => item.name);

  assert.equal(visibleQuestions.length, 8);
  assert.deepEqual(visibleQuestions, schemaQuestions);
});

test('keeps all requested editorial articles as reviewable drafts', () => {
  const { ARTICLES } = require('../seo/unfulanodev/content/articles');
  const expectedSlugs = [
    'cuanto-cuesta-pagina-web-catamarca',
    'cuanto-cuesta-pagina-web-argentina',
    'cuanto-demora-crear-pagina-web',
    'pagina-web-vs-redes-sociales',
    'que-necesita-una-empresa-para-tener-pagina-web',
    'cuanto-cuesta-tienda-online',
    'tienda-online-vs-tiendanube',
    'como-empezar-a-vender-online',
    'como-administrar-stock-tienda-online',
    'como-integrar-mercado-pago',
    'cuando-conviene-sistema-a-medida',
    'sistema-de-gestion-vs-excel',
    'que-es-un-crm',
    'cuando-necesita-una-empresa-un-crm',
    'crm-a-medida-vs-crm-estandar',
  ];

  assert.deepEqual(ARTICLES.map((article) => article.slug), expectedSlugs);
  for (const article of ARTICLES) {
    assert.equal(article.status, 'draft');
    assert.ok(article.title);
    assert.ok(article.description);
    assert.ok(article.quickAnswer);
    assert.ok(article.sections?.length);
    assert.ok(article.example);
    assert.ok(article.faq?.length);
    assert.ok(article.links?.length);
    assert.ok(article.cta?.href);
    assert.equal(article.schemaType, 'Article');
  }
});

test('publishes accessible home landmarks, labels and progressive FAQ behavior', () => {
  const outputDir = createOutputDir();

  buildUnfulanoSite({ outputDir });

  const home = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
  assert.match(home, /<html class="no-js" lang="es">/);
  assert.match(home, /href="#contenido">Saltar al contenido/);
  assert.match(home, /<main id="contenido">/);
  assert.match(home, /aria-controls="navLinks"/);
  assert.match(home, /<label class="sr-only" for="lead-nombre">/);
  assert.match(home, /<label class="sr-only" for="lead-email">/);
  assert.match(home, /<label class="sr-only" for="lead-telefono">/);
  assert.match(home, /<label class="sr-only" for="lead-mensaje">/);
  assert.match(home, /id="form-status" role="status" aria-live="polite"/);
  assert.match(home, /\.no-js \.faq-answer/);
  assert.match(home, /:focus-visible/);
  assert.doesNotMatch(home, /<noscript><img src="https:\/\/app\.flexcrm\.com\.ar\/api\/landing\/pixel/);
});

test('publishes Cloudflare security headers compatible with the approved form integration', () => {
  const outputDir = createOutputDir();

  buildUnfulanoSite({ outputDir });

  const headers = fs.readFileSync(path.join(outputDir, '_headers'), 'utf8');
  assert.match(headers, /Strict-Transport-Security/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/);
  assert.match(headers, /Permissions-Policy/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /connect-src[^\n]*https:\/\/app\.flexcrm\.com\.ar/);
  assert.match(headers, /form-action[^\n]*https:\/\/app\.flexcrm\.com\.ar/);
});

test('publishes explicit canonical redirects for legacy and slash variants', () => {
  const outputDir = createOutputDir();

  buildUnfulanoSite({ outputDir });

  const redirects = fs.readFileSync(path.join(outputDir, '_redirects'), 'utf8');
  assert.match(redirects, /\/index\.html \/ 301/);
  assert.match(redirects, /\/unfulano-landing\.html \/ 301/);
  assert.match(redirects, /\/desarrollo-web\/ \/desarrollo-web 301/);
  assert.doesNotMatch(redirects, / 200$/m);
});

test('keeps the preliminary privacy page available but out of the indexable sitemap', () => {
  const outputDir = createOutputDir();

  buildUnfulanoSite({ outputDir });

  const privacy = fs.readFileSync(path.join(outputDir, 'privacidad.html'), 'utf8');
  const sitemap = fs.readFileSync(path.join(outputDir, 'sitemap.xml'), 'utf8');
  assert.match(privacy, /<meta name="robots" content="noindex, nofollow, noarchive">/);
  assert.doesNotMatch(sitemap, /\/privacidad/);
});

test('keeps all generated internal links inside the published route contract', () => {
  const outputDir = createOutputDir();
  const publishedPaths = new Set(routes.map((route) => route.path));

  buildUnfulanoSite({ outputDir });

  for (const file of listHtmlFiles(outputDir)) {
    const html = fs.readFileSync(file, 'utf8');
    for (const [, href] of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
      if (!href.startsWith('/')) continue;
      const internalPath = href.split(/[?#]/, 1)[0] || '/';
      assert.ok(publishedPaths.has(internalPath), `${path.relative(outputDir, file)} links to missing ${href}`);
    }
  }
});

test('builds an IndexNow payload only for indexable Un Fulano URLs', async () => {
  const { buildPayload, ping } = require('../scripts/indexnow-unfulano');
  const payload = buildPayload('test-indexnow-key');

  assert.equal(payload.host, 'unfulanodev.com.ar');
  assert.equal(payload.keyLocation, 'https://unfulanodev.com.ar/test-indexnow-key.txt');
  assert.equal(payload.urlList.length, 15);
  assert.ok(payload.urlList.includes('https://unfulanodev.com.ar/portfolio'));
  assert.ok(!payload.urlList.includes('https://unfulanodev.com.ar/privacidad'));

  const previousKey = process.env.UNFULANO_INDEXNOW_KEY;
  delete process.env.UNFULANO_INDEXNOW_KEY;
  let calls = 0;
  let skipped;
  try {
    skipped = await ping({ fetchImpl: async () => { calls += 1; } });
  } finally {
    if (previousKey !== undefined) process.env.UNFULANO_INDEXNOW_KEY = previousKey;
  }
  assert.equal(skipped.skipped, true);
  assert.equal(calls, 0);
});

test('fails when an IndexNow endpoint responds with a non-2xx status', async () => {
  const { ping } = require('../scripts/indexnow-unfulano');
  await assert.rejects(
    ping({ key: 'test-indexnow-key', fetchImpl: async () => ({ ok: false, status: 500 }) }),
    /HTTP 500/,
  );
});

test('writes the IndexNow key at the location advertised by the payload', () => {
  const outputDir = createOutputDir();
  const previousKey = process.env.UNFULANO_INDEXNOW_KEY;
  process.env.UNFULANO_INDEXNOW_KEY = 'test-indexnow-key';
  try {
    buildUnfulanoSite({ outputDir });
  } finally {
    if (previousKey === undefined) delete process.env.UNFULANO_INDEXNOW_KEY;
    else process.env.UNFULANO_INDEXNOW_KEY = previousKey;
  }

  const keyFile = path.join(outputDir, 'test-indexnow-key.txt');
  assert.equal(fs.readFileSync(keyFile, 'utf8').trim(), 'test-indexnow-key');
});
