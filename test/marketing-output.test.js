// Tests del artefacto estático de marketing (dist/marketing).
// Verifica que el build solo publique URLs públicas, canónicas y completas,
// y que metadata, sitemap, robots, llms y JSON-LD estén sincronizados.
// Ejecutar: npm run test:backend

const { describe, it, before } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')

const TEST_OUT = path.join(__dirname, '..', 'data', 'test', 'marketing')
const { build, collectUrls, canonical } = require('../scripts/build-marketing')

function read(rel) {
  return fs.readFileSync(path.join(TEST_OUT, rel), 'utf8')
}

function listHtml(dir) {
  const files = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'index.html') files.push(full)
    }
  }
  walk(dir)
  return files
}

describe('Marketing output', () => {
  before(() => {
    build({ outDir: TEST_OUT, skipPublicSync: true })
  })

  it('genera index.html raíz con metadata completa', () => {
    const html = read('index.html')
    assert.ok(html.includes('<title>FlexCRM — El CRM multi-rubro para tu negocio</title>'))
    assert.ok(html.includes('name="robots" content="index, follow"'))
    assert.ok(html.includes('rel="canonical" href="https://flexcrm.com.ar/"'))
    assert.ok(html.includes('property="og:title"'))
    assert.ok(html.includes('name="twitter:card"'))
    const h1Count = (html.match(/<h1[^>]*>/g) || []).length
    assert.strictEqual(h1Count, 1, 'la home debe tener exactamente un H1')
    assert.ok(html.includes('application/ld+json'))
  })

  it('todas las páginas tienen título, canonical y JSON-LD únicos', () => {
    const files = listHtml(TEST_OUT)
    const canonicals = new Set()
    const titles = new Set()
    for (const file of files) {
      const html = fs.readFileSync(file, 'utf8')
      const titleMatch = html.match(/<title>([^<]+)<\/title>/)
      const canonicalMatch = html.match(/rel="canonical" href="([^"]+)"/)
      assert.ok(titleMatch, `falta title en ${file}`)
      assert.ok(canonicalMatch, `falta canonical en ${file}`)
      assert.ok(html.includes('application/ld+json'), `falta JSON-LD en ${file}`)
      const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
      if (ld) {
        const parsed = JSON.parse(ld[1])
        assert.ok(parsed['@graph'], `JSON-LD sin @graph en ${file}`)
        const ids = parsed['@graph'].map((node) => node['@id']).filter(Boolean)
        assert.strictEqual(new Set(ids).size, ids.length, `@id duplicados en ${file}`)
      }
      titles.add(titleMatch[1])
      canonicals.add(canonicalMatch[1])
    }
    assert.strictEqual(titles.size, files.length, 'hay títulos duplicados')
    assert.strictEqual(canonicals.size, files.length, 'hay canonicals duplicados')
  })

  it('el sitemap contiene solo URLs públicas y todas resuelven a un archivo', () => {
    const xml = read('sitemap.xml')
    assert.ok(xml.includes('<urlset'))
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    assert.ok(urls.length >= 30, `sitemap con pocas URLs: ${urls.length}`)
    for (const url of urls) {
      assert.ok(!url.includes('/app'), `URL privada en sitemap: ${url}`)
      assert.ok(!url.includes('/admin'), `URL privada en sitemap: ${url}`)
      assert.ok(!url.includes('/api/'), `URL privada en sitemap: ${url}`)
      assert.ok(url.startsWith('https://flexcrm.com.ar/'), `dominio inválido: ${url}`)
      const rel = url.replace('https://flexcrm.com.ar/', '')
      const target = rel ? path.join(TEST_OUT, rel, 'index.html') : path.join(TEST_OUT, 'index.html')
      assert.ok(fs.existsSync(target), `URL del sitemap sin archivo: ${url}`)
    }
    const collected = collectUrls()
    assert.deepStrictEqual(urls.slice().sort(), collected.slice().sort(), 'sitemap desincronizado con collectUrls')
  })

  it('robots.txt permite crawlers IA y referencia el sitemap', () => {
    const robots = read('robots.txt')
    for (const bot of ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
      assert.ok(robots.includes(bot), `robots.txt debe mencionar a ${bot}`)
    }
    assert.ok(robots.includes('Sitemap: https://flexcrm.com.ar/sitemap.xml'))
  })

  it('no publica archivos privados ni de la app', () => {
    for (const priv of ['app/index.html', 'superadmin.html', 'sw.js', 'manifest.json', 'landing.html', 'unfulano-landing.html', 'gracias.html', 'offline.html']) {
      assert.ok(!fs.existsSync(path.join(TEST_OUT, priv)), `archivo privado publicado: ${priv}`)
    }
  })

  it('llms.txt y llms-full.txt están sincronizados con los precios publicados', () => {
    const llms = read('llms.txt')
    const llmsFull = read('llms-full.txt')
    const precios = read(path.join('precios', 'index.html'))
    for (const price of ['USD 15', 'USD 40', 'USD 90', '$0']) {
      assert.ok(llms.includes(price), `llms.txt sin precio ${price}`)
      assert.ok(precios.includes(price), `página de precios sin ${price}`)
    }
    assert.ok(llms.includes('# FlexCRM'))
    assert.ok(llmsFull.includes('Módulos principales'))
    assert.ok(!llms.includes('/api/'), 'llms.txt expone rutas de API')
    assert.ok(!llms.includes('/admin'), 'llms.txt expone rutas privadas')
  })

  it('el FAQ de la home es visible y coincide con el JSON-LD', () => {
    const html = read('index.html')
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    const graph = JSON.parse(ld[1])['@graph']
    const faq = graph.find((node) => node['@type'] === 'FAQPage')
    assert.ok(faq, 'la home debe tener FAQPage')
    for (const question of faq.mainEntity) {
      assert.ok(html.includes(question.name), `FAQ no visible en el HTML: ${question.name}`)
    }
  })

  it('404.html y assets públicos existen', () => {
    assert.ok(fs.existsSync(path.join(TEST_OUT, '404.html')))
    assert.ok(fs.existsSync(path.join(TEST_OUT, 'fc-og.png')))
    assert.ok(fs.existsSync(path.join(TEST_OUT, 'flexcrm-indexnow-key.txt')))
    assert.ok(fs.existsSync(path.join(TEST_OUT, '_headers')))
    assert.strictEqual(canonical(''), 'https://flexcrm.com.ar/')
  })
})
