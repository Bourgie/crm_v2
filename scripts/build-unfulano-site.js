const fs = require('node:fs');
const path = require('node:path');

const { SITE_URL, routes } = require('../seo/unfulanodev/routes');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, 'dist', 'unfulanodev');
const STATIC_DIR = path.join(REPO_ROOT, 'seo', 'unfulanodev', 'static');

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function canonicalUrl(routePath) {
  return routePath === '/' ? SITE_URL : `${SITE_URL}${routePath}`;
}

function buildSitemap(publishedRoutes) {
  const entries = publishedRoutes.map((route) => {
    const lastmod = route.lastmod ? `\n    <lastmod>${escapeXml(route.lastmod)}</lastmod>` : '';
    return `  <url>\n    <loc>${escapeXml(canonicalUrl(route.path))}</loc>${lastmod}\n  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

function assertSafeOutputDir(outputDir) {
  const resolved = path.resolve(outputDir);
  if (resolved === REPO_ROOT || resolved === path.join(REPO_ROOT, 'public')) {
    throw new Error(`Refusing to delete unsafe output directory: ${resolved}`);
  }
}

function buildUnfulanoSite({ outputDir = DEFAULT_OUTPUT_DIR } = {}) {
  assertSafeOutputDir(outputDir);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  fs.cpSync(STATIC_DIR, outputDir, { recursive: true });

  const homeRoute = routes.find((route) => route.path === '/' && route.status === 'published');
  if (!homeRoute) throw new Error('Un Fulano site requires a published home route');

  const homeSource = path.join(REPO_ROOT, homeRoute.source);
  fs.copyFileSync(homeSource, path.join(outputDir, 'index.html'));

  const publishedRoutes = routes.filter((route) => route.status === 'published');
  fs.writeFileSync(path.join(outputDir, 'sitemap.xml'), buildSitemap(publishedRoutes));

  return { outputDir: path.resolve(outputDir), routes: publishedRoutes };
}

if (require.main === module) {
  const result = buildUnfulanoSite();
  console.log(`Un Fulano site built at ${result.outputDir}`);
}

module.exports = { buildUnfulanoSite, canonicalUrl };
