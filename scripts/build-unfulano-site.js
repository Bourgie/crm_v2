const fs = require('node:fs');
const path = require('node:path');

const { SITE_URL, routes } = require('../seo/unfulanodev/routes');
const { homeJsonLd, serializeJsonLdScript } = require('../seo/unfulanodev/schema');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, 'dist', 'unfulanodev');
const DIST_DIR = path.join(REPO_ROOT, 'dist');
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
  const relativeToDist = path.relative(DIST_DIR, resolved);
  if (!relativeToDist || relativeToDist.startsWith('..') || path.isAbsolute(relativeToDist)) {
    throw new Error(`Output directory must be inside ${DIST_DIR}: ${resolved}`);
  }
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    throw new Error(`Refusing to write through a symbolic link: ${resolved}`);
  }
}

function buildUnfulanoSite({ outputDir = DEFAULT_OUTPUT_DIR } = {}) {
  assertSafeOutputDir(outputDir);

  const homeRoute = routes.find((route) => route.path === '/' && route.status === 'published');
  if (!homeRoute) throw new Error('Un Fulano site requires a published home route');

  const homeSource = path.join(REPO_ROOT, homeRoute.source);
  if (!fs.existsSync(homeSource)) throw new Error(`Missing home template: ${homeSource}`);
  const homeHtml = fs.readFileSync(homeSource, 'utf8');
  if (!homeHtml.includes('<!-- UNFULANO_JSON_LD -->')) {
    throw new Error('Home template is missing the JSON-LD marker');
  }
  const renderedHome = homeHtml.replace('<!-- UNFULANO_JSON_LD -->', serializeJsonLdScript(homeJsonLd()));
  const publishedRoutes = routes.filter((route) => route.status === 'published');

  const temporaryDir = `${path.resolve(outputDir)}.tmp-${process.pid}-${Date.now()}`;
  assertSafeOutputDir(temporaryDir);
  try {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
    fs.mkdirSync(temporaryDir, { recursive: true });
    fs.cpSync(STATIC_DIR, temporaryDir, { recursive: true });
    fs.writeFileSync(path.join(temporaryDir, 'index.html'), renderedHome);
    fs.writeFileSync(path.join(temporaryDir, 'sitemap.xml'), buildSitemap(publishedRoutes));

    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.renameSync(temporaryDir, outputDir);
  } catch (error) {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
    throw error;
  }

  return { outputDir: path.resolve(outputDir), routes: publishedRoutes };
}

if (require.main === module) {
  const result = buildUnfulanoSite();
  console.log(`Un Fulano site built at ${result.outputDir}`);
}

module.exports = { buildUnfulanoSite, canonicalUrl };
