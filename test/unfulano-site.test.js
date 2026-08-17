const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildUnfulanoSite } = require('../scripts/build-unfulano-site');

function createOutputDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'unfulano-site-'));
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
