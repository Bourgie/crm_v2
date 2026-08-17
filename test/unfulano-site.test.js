const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { buildUnfulanoSite } = require('../scripts/build-unfulano-site');

function createOutputDir() {
  const outputRoot = path.resolve(__dirname, '..', 'dist');
  fs.mkdirSync(outputRoot, { recursive: true });
  return fs.mkdtempSync(path.join(outputRoot, 'unfulano-site-'));
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
  assert.equal((sitemap.match(/<loc>/g) || []).length, 1);
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
