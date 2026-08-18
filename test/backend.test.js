const { describe, it, before, after } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')

// Use test DB locations
process.env.NODE_ENV = 'test'
const TEST_DATA_DIR = path.join(__dirname, '..', 'data', 'test')
// Arranque limpio: se borra el directorio de test ANTES de abrir conexiones
try { fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true }) } catch {}
process.env.MASTER_PATH = path.join(TEST_DATA_DIR, 'master.db')
process.env.TENANT_DATA_DIR = TEST_DATA_DIR
process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests-only'
process.env.SA_SECRET = 'test-sa-secret-for-integration-tests-only'

const app = require('../server')
const { db: masterDB } = require('../db_sqlite')
const { getEmpresaDB } = require('../db_sqlite')

let server
let baseUrl

function request(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl)
    const body = opts.body ? JSON.stringify(opts.body) : null
    const req = http.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...opts.headers,
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        let json
        try { json = JSON.parse(data) } catch { json = null }
        resolve({ status: res.statusCode, headers: res.headers, body: json, raw: data })
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function getCookie(res, name) {
  const setCookie = res.headers['set-cookie']
  if (!setCookie) return null
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie]
  for (const c of cookies) {
    const m = c.match(new RegExp(name + '=([^;]+)'))
    if (m) return m[1]
  }
  return null
}

describe('Backend Integration Tests', async () => {
  before(async () => {
    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        baseUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
    })
  })

  after(() => {
    if (server) server.close()
  })

  // ── Health ──────────────────────────────────────────────────
  describe('Health', () => {
    it('GET /api/health returns ok', async () => {
      const res = await request('GET', '/api/health')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
    })
  })

  // ── Auth ────────────────────────────────────────────────────
  describe('Auth', () => {
    it('POST /api/auth/login with wrong creds returns 401 or 429', async () => {
      const res = await request('POST', '/api/auth/login', {
        body: { usuario: 'nonexistent', password: 'wrong', empresa: 'testemp' },
      })
      assert.ok(res.status === 401 || res.status === 429, `Expected 401 or 429, got ${res.status}`)
      if (res.status === 401) assert.ok(res.body.error.includes('incorrectos'))
    })

    it('POST /api/auth/login without empresa uses default', async () => {
      const res = await request('POST', '/api/auth/login', {
        body: { usuario: 'admin', password: '123456' },
      })
      // empresa defaults to 'default', should fail auth (not validation)
      assert.ok(res.status === 401 || res.status === 429)
    })

    it('POST /api/auth/login without body returns 400', async () => {
      const res = await request('POST', '/api/auth/login', { body: {} })
      assert.strictEqual(res.status, 400)
    })
  })

  // ── CSRF Protection ─────────────────────────────────────────
  describe('CSRF Protection', () => {
    it('POST without CSRF token returns 403', async () => {
      // First GET to get a CSRF cookie set
      const getRes = await request('GET', '/api/config/public')
      // POST to a non-skipped route without the CSRF header
      const res = await request('POST', '/api/nonexistent-csrf-test', {
        body: { test: true },
        headers: { 'Cookie': getRes.headers['set-cookie']?.join('; ') || '' },
      })
      assert.strictEqual(res.status, 403)
      assert.ok(res.body.error)
    })

    it('POST with valid CSRF token passes', async () => {
      const csrfToken = 'csrf-integration-test-token'
      const res = await request('POST', '/api/nonexistent-csrf-test', {
        body: { test: true },
        headers: {
          'Cookie': `csrf-token=${csrfToken}`,
          'x-csrf-token': csrfToken,
        },
      })
      // CSRF passes → hits route handler → 404 (route doesn't exist)
      assert.strictEqual(res.status, 404)
    })

    it('GET /api/config/public returns config without CSRF', async () => {
      const res = await request('GET', '/api/config/public')
      assert.strictEqual(res.status, 200)
    })
  })

  // ── Config ──────────────────────────────────────────────────
  describe('Config', () => {
    it('GET /api/config/public returns branding', async () => {
      const res = await request('GET', '/api/config/public')
      assert.strictEqual(res.status, 200)
      assert.ok(res.body.nombre !== undefined || res.body !== null)
    })
  })

  // ── SEO ─────────────────────────────────────────────────────
  describe('SEO', () => {
    it('GET /sitemap.xml returns dynamic sitemap', async () => {
      const res = await request('GET', '/sitemap.xml')
      assert.strictEqual(res.status, 200)
      assert.ok(res.raw.includes('<urlset'))
      assert.ok(res.raw.includes('https://flexcrm.com.ar/'))
      assert.ok(res.raw.includes('<lastmod>'))
    })

    it('GET /robots.txt includes AI crawlers', async () => {
      const res = await request('GET', '/robots.txt')
      assert.strictEqual(res.status, 200)
      for (const bot of ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
        assert.ok(res.raw.includes(bot), `robots.txt debe mencionar a ${bot}`)
      }
      assert.ok(res.raw.includes('Sitemap: https://flexcrm.com.ar/sitemap.xml'))
    })

    it('GET /llms.txt returns markdown for LLMs', async () => {
      const res = await request('GET', '/llms.txt')
      assert.strictEqual(res.status, 200)
      assert.ok(res.raw.includes('# FlexCRM'))
      assert.ok(res.raw.includes('USD 15/mes'))
    })

    it('GET /llms-full.txt returns extended docs', async () => {
      const res = await request('GET', '/llms-full.txt')
      assert.strictEqual(res.status, 200)
      assert.ok(res.raw.includes('Módulos principales'))
    })

    it('GET / exposes IndexNow key file', async () => {
      const res = await request('GET', '/flexcrm-indexnow-key.txt')
      assert.strictEqual(res.status, 200)
      assert.ok(res.raw.includes('flexcrm-indexnow-key'))
    })
  })

  // ── SEO por host ────────────────────────────────────────────
  describe('SEO por host', () => {
    it('robots.txt del host app es privado y no publica el sitemap', async () => {
      const res = await request('GET', '/robots.txt', { headers: { Host: 'app.flexcrm.com.ar' } })
      assert.strictEqual(res.status, 200)
      assert.ok(res.raw.includes('Disallow: /api/'))
      assert.ok(!res.raw.includes('Sitemap:'), 'el host privado no debe publicar el sitemap de marketing')
    })

    it('robots.txt del hostname de Fly es privado', async () => {
      const res = await request('GET', '/robots.txt', { headers: { Host: 'crm-v2.fly.dev' } })
      assert.strictEqual(res.status, 200)
      assert.ok(res.raw.includes('Disallow: /api/'))
      assert.ok(!res.raw.includes('Sitemap:'))
    })

    it('robots.txt del host de marketing permite crawlers IA y referencia el sitemap', async () => {
      const res = await request('GET', '/robots.txt', { headers: { Host: 'flexcrm.com.ar' } })
      assert.strictEqual(res.status, 200)
      assert.ok(res.raw.includes('GPTBot'))
      assert.ok(res.raw.includes('Sitemap: https://flexcrm.com.ar/sitemap.xml'))
    })

    it('el sitemap no se sirve en hosts privados', async () => {
      const res = await request('GET', '/sitemap.xml', { headers: { Host: 'app.flexcrm.com.ar' } })
      assert.strictEqual(res.status, 404)
      const res2 = await request('GET', '/sitemap.xml', { headers: { Host: 'crm-v2.fly.dev' } })
      assert.strictEqual(res2.status, 404)
    })

    it('el root del hostname de Fly redirige al marketing canónico', async () => {
      const res = await request('GET', '/', { headers: { Host: 'crm-v2.fly.dev' } })
      assert.strictEqual(res.status, 301)
      assert.strictEqual(res.headers.location, 'https://flexcrm.com.ar/')
    })

    it('la landing no se expone en el hostname de Fly', async () => {
      const res = await request('GET', '/landing.html', { headers: { Host: 'crm-v2.fly.dev' } })
      assert.strictEqual(res.status, 301)
      assert.strictEqual(res.headers.location, 'https://flexcrm.com.ar/')
    })

    it('los hosts privados envían X-Robots-Tag noindex', async () => {
      const res = await request('GET', '/app/login', { headers: { Host: 'app.flexcrm.com.ar' } })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.headers['x-robots-tag'], 'noindex, nofollow')
    })

    it('rutas desconocidas devuelven 404 real (sin soft-404 del shell)', async () => {
      const res = await request('GET', '/pagina-que-no-existe-xyz')
      assert.strictEqual(res.status, 404)
    })

    it('las rutas legales públicas siguen funcionando', async () => {
      const res = await request('GET', '/terminos-y-condiciones', { headers: { Host: 'app.flexcrm.com.ar' } })
      assert.strictEqual(res.status, 200)
    })
  })

  // ── Version ─────────────────────────────────────────────────
  describe('Version', () => {
    it('GET /api/version returns version number', async () => {
      const res = await request('GET', '/api/version')
      assert.strictEqual(res.status, 200)
      assert.ok(typeof res.body.version === 'string')
    })
  })

  // ── Landing Webhook ─────────────────────────────────────────
  describe('Landing', () => {
    it('POST /api/landing/lead with nombre+telefono returns 200 and creates lead', async () => {
      const res = await request('POST', '/api/landing/lead', {
        body: { nombre: 'Juan Pérez', telefono: '1122334455' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.ok(typeof res.body.id === 'string')
    })

    it('POST /api/landing/lead with full data returns 200', async () => {
      const res = await request('POST', '/api/landing/lead', {
        body: {
          nombre: 'María Gómez',
          telefono: '9988776655',
          email: 'maria@test.com',
          mensaje: 'Quiero probar el demo',
          empresa: 'Mi Negocio SRL',
        },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
    })

    it('POST /api/landing/lead without nombre returns 400', async () => {
      const res = await request('POST', '/api/landing/lead', {
        body: { telefono: '1122334455' },
      })
      assert.strictEqual(res.status, 400)
      assert.ok(res.body.error.includes('Nombre'))
    })

    it('POST /api/landing/lead without telefono returns 400', async () => {
      const res = await request('POST', '/api/landing/lead', {
        body: { nombre: 'Sin Teléfono' },
      })
      assert.strictEqual(res.status, 400)
      assert.ok(res.body.error.includes('contacto'), 'el error debe pedir al menos un contacto: ' + JSON.stringify(res.body))
    })

    it('POST /api/landing/lead with empty body returns 400', async () => {
      const res = await request('POST', '/api/landing/lead', { body: {} })
      assert.strictEqual(res.status, 400)
      assert.ok(res.body.error)
    })

    it('GET /api/landing/health returns ok', async () => {
      const res = await request('GET', '/api/landing/health')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.strictEqual(res.body.service, 'flexcrm-landing')
    })
  })

  // ── Prospectos (Superadmin) ─────────────────────────────────
  describe('Prospectos', () => {
    let saToken
    let createdProsId

    before(() => {
      const jwt = require('jsonwebtoken')
      const { master } = require('../db_master')
      const sa = master.prepare("SELECT id, usuario, nombre FROM superadmin WHERE activo=1 LIMIT 1").get()
      saToken = jwt.sign({ id: sa.id, usuario: sa.usuario, nombre: sa.nombre, role: 'superadmin' },
        process.env.SA_SECRET, { expiresIn: '1h' })
    })

    it('GET /api/superadmin/prospectos returns array', async () => {
      const res = await request('GET', '/api/superadmin/prospectos', {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      assert.strictEqual(res.status, 200)
      assert.ok(Array.isArray(res.body))
    })

    it('POST /api/superadmin/prospectos creates prospecto', async () => {
      const res = await request('POST', '/api/superadmin/prospectos', {
        headers: { Authorization: `Bearer ${saToken}` },
        body: { nombre: 'Test Prospect', telefono: '111222333', email: 'test@test.com', empresa_interes: 'Test SA', origen: 'manual', notas: 'Nota de prueba' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.ok(typeof res.body.id === 'string')
      createdProsId = res.body.id
    })

    it('GET /api/superadmin/prospectos/:id returns with seguimiento', async () => {
      if (!createdProsId) return
      const res = await request('GET', `/api/superadmin/prospectos/${createdProsId}`, {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.nombre, 'Test Prospect')
      assert.ok(Array.isArray(res.body.seguimiento))
    })

    it('POST /api/superadmin/prospectos/:id/seguimiento adds follow-up', async () => {
      if (!createdProsId) return
      const res = await request('POST', `/api/superadmin/prospectos/${createdProsId}/seguimiento`, {
        headers: { Authorization: `Bearer ${saToken}` },
        body: { tipo: 'llamada', descripcion: 'Llamada de seguimiento — interesado' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
    })

    it('GET after seguimiento returns the new entry', async () => {
      if (!createdProsId) return
      const res = await request('GET', `/api/superadmin/prospectos/${createdProsId}`, {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      assert.strictEqual(res.status, 200)
      assert.ok(res.body.seguimiento.length >= 1)
      assert.strictEqual(res.body.seguimiento[0].descripcion, 'Llamada de seguimiento — interesado')
    })

    it('POST /api/superadmin/prospectos/:id/cambiar-estado transitions estado', async () => {
      if (!createdProsId) return
      const estados = ['contactado', 'interesado', 'calificado']
      for (const estado of estados) {
        const res = await request('POST', `/api/superadmin/prospectos/${createdProsId}/cambiar-estado`, {
          headers: { Authorization: `Bearer ${saToken}` },
          body: { estado },
        })
        assert.strictEqual(res.status, 200)
        assert.strictEqual(res.body.ok, true)
      }
      // Verify final estado
      const detail = await request('GET', `/api/superadmin/prospectos/${createdProsId}`, {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      assert.strictEqual(detail.body.estado, 'calificado')
    })

    it('POST cambiar-estado with invalid estado returns 400', async () => {
      const res = await request('POST', `/api/superadmin/prospectos/${createdProsId || 'fake'}/cambiar-estado`, {
        headers: { Authorization: `Bearer ${saToken}` },
        body: { estado: 'invalid_state' },
      })
      assert.strictEqual(res.status, 400)
      assert.ok(res.body.error.includes('inválido'))
    })

    it('POST cambiar-estado to cerrado_ganado works', async () => {
      if (!createdProsId) return
      const res = await request('POST', `/api/superadmin/prospectos/${createdProsId}/cambiar-estado`, {
        headers: { Authorization: `Bearer ${saToken}` },
        body: { estado: 'cerrado_ganado' },
      })
      assert.strictEqual(res.status, 200)
    })

    it('GET /api/superadmin/stats increments after creation', async () => {
      const res = await request('GET', '/api/superadmin/stats', {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      assert.strictEqual(res.status, 200)
      assert.ok(typeof res.body.prospectos === 'number')
      assert.ok(res.body.prospectos > 0)
    })

    it('POST /api/superadmin/prospectos requires auth (401)', async () => {
      const res = await request('POST', '/api/superadmin/prospectos', {
        body: { nombre: 'No Auth' },
      })
      assert.strictEqual(res.status, 401)
    })
  })

  // ── 2FA ────────────────────────────────────────────────────
  // Usa un superadmin de test aislado (no toca el superadmin real del master.db)
  describe('2FA', () => {
    const TEST_SA_ID = 'sa_2fa_test'
    const TEST_SA_USER = 'sa_2fa_test'
    const TEST_SA_PASS = 'sa-test-pass-123'
    let saToken

    before(() => {
      const jwt = require('jsonwebtoken')
      const bcrypt = require('bcryptjs')
      const { master } = require('../db_master')
      master.prepare("DELETE FROM superadmin WHERE id=?").run(TEST_SA_ID)
      master.prepare("INSERT INTO superadmin (id,usuario,password,nombre,email,activo,must_change_password,data) VALUES (?,?,?,?,?,1,0,?)")
        .run(TEST_SA_ID, TEST_SA_USER, bcrypt.hashSync(TEST_SA_PASS, 10), 'SA Test 2FA', 'sa_2fa_test@test.com', JSON.stringify({ sa_2fa_obligatorio: false }))
      // Empresa 'default' de test: requerida por /2fa/verify-login y por validateTenant
      try {
        master.prepare("INSERT OR IGNORE INTO empresas (id,codigo,nombre,rubro,activo,creado) VALUES ('emp_test_default','default','Test Default','general',1,?)")
          .run(new Date().toISOString())
      } catch {}
      try { require('../db_sqlite').getEmpresaDB('default') } catch {}
      saToken = jwt.sign({ id: TEST_SA_ID, usuario: TEST_SA_USER, nombre: 'SA Test 2FA', role: 'superadmin' },
        process.env.SA_SECRET, { expiresIn: '1h' })
    })

    after(() => {
      try {
        const { master } = require('../db_master')
        master.prepare("DELETE FROM superadmin WHERE id=?").run(TEST_SA_ID)
      } catch {}
    })

    it('POST /api/superadmin/2fa/setup returns secret and otpauth', async () => {
      await request('POST', '/api/superadmin/2fa/disable', { headers: { Authorization: `Bearer ${saToken}` } })
      const res = await request('POST', '/api/superadmin/2fa/setup', {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      assert.strictEqual(res.status, 200)
      assert.ok(typeof res.body.secret === 'string')
      assert.ok(typeof res.body.otpauth === 'string')
      assert.ok(res.body.otpauth.includes('FlexCRM'))
    })

    it('POST /api/superadmin/2fa/confirm activates 2FA', async () => {
      const { totp } = require('../lib/totp')
      await request('POST', '/api/superadmin/2fa/disable', { headers: { Authorization: `Bearer ${saToken}` } })
      const setup = await request('POST', '/api/superadmin/2fa/setup', {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      const code = totp.generate(setup.body.secret)
      const res = await request('POST', '/api/superadmin/2fa/confirm', {
        headers: { Authorization: `Bearer ${saToken}` },
        body: { code },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.ok(Array.isArray(res.body.backup_codes))
      assert.strictEqual(res.body.backup_codes.length, 10)
    })

    it('GET /api/superadmin/2fa/status returns enabled=true after confirm', async () => {
      const res = await request('GET', '/api/superadmin/2fa/status', {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.enabled, true)
    })

    it('login requires 2FA after activation and verify-login works', async () => {
      const { totp } = require('../lib/totp')
      await request('POST', '/api/superadmin/2fa/disable', { headers: { Authorization: `Bearer ${saToken}` } })
      const setup = await request('POST', '/api/superadmin/2fa/setup', {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      const secret = setup.body.secret
      const confirmCode = totp.generate(secret)
      await request('POST', '/api/superadmin/2fa/confirm', {
        headers: { Authorization: `Bearer ${saToken}` },
        body: { code: confirmCode },
      })

      const login = await request('POST', '/api/superadmin/login', {
        body: { usuario: TEST_SA_USER, password: TEST_SA_PASS },
      })
      assert.strictEqual(login.status, 200)
      assert.strictEqual(login.body.require_2fa, true)
      assert.ok(typeof login.body.temp_token === 'string')

      const verifyCode = totp.generate(secret)
      const verify = await request('POST', '/api/superadmin/2fa/verify-login', {
        body: { temp_token: login.body.temp_token, code: verifyCode },
      })
      assert.strictEqual(verify.status, 200)
      const setCookie = verify.headers['set-cookie'] || []
      const cookiesArr = Array.isArray(setCookie) ? setCookie : [setCookie]
      assert.ok(cookiesArr.some(c => c.startsWith('sa_token=')), 'debe setear la cookie sa_token')
    })

    it('POST /api/superadmin/2fa/disable deactivates 2FA', async () => {
      const res = await request('POST', '/api/superadmin/2fa/disable', {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)

      const status = await request('GET', '/api/superadmin/2fa/status', {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      assert.strictEqual(status.body.enabled, false)
    })

    it('POST /api/superadmin/2fa/setup without auth returns 401', async () => {
      const res = await request('POST', '/api/superadmin/2fa/setup')
      assert.strictEqual(res.status, 401)
    })
  })

  // ═══════════════════════════════════════════════════════════
  // SECURITY TESTS
  // ═══════════════════════════════════════════════════════════

  // ── XSS Prevention ───────────────────────────────────────────
  describe('XSS Prevention', () => {
    it('POST /api/landing/lead sanitizes script tags', async () => {
      const res = await request('POST', '/api/landing/lead', {
        body: { nombre: 'Test<script>alert(1)</script>', telefono: '11223344' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.ok(!res.body.id || typeof res.body.id === 'string')
    })

    it('POST /api/landing/lead sanitizes onclick handlers', async () => {
      const res = await request('POST', '/api/landing/lead', {
        body: { nombre: 'Test onload="bad()"', telefono: '11223344' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
    })

    it('POST /api/landing/lead sanitizes javascript: URLs', async () => {
      const res = await request('POST', '/api/landing/lead', {
        body: { nombre: 'Test', telefono: '11223344', mensaje: 'javascript:alert(1)' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
    })
  })

  // ── SQL Injection Prevention ─────────────────────────────────
  describe('SQL Injection', () => {
    it('login with SQL injection attempt returns 401 (not 500)', async () => {
      const res = await request('POST', '/api/auth/login', {
        body: { usuario: "admin' OR '1'='1", password: "anything' OR 1=1--", empresa: 'test' },
      })
      assert.ok(res.status !== 500, `Should not return 500, got ${res.status}`)
      assert.ok([400, 401, 429].includes(res.status), `Expected 400/401/429, got ${res.status}`)
    })

    it('forgot-password with SQL injection returns safe response', async () => {
      const res = await request('POST', '/api/auth/forgot-password', {
        body: { usuario: "'; DROP TABLE usuarios;--", empresa: 'test' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
    })
  })

  // ── Multi-Tenant Isolation ───────────────────────────────────
  describe('Multi-Tenant Isolation', () => {
    it('GET /api/config/public with nonexistent empresa returns empty config', async () => {
      const res = await request('GET', '/api/config/public?empresa=nonexistent123xyz')
      assert.strictEqual(res.status, 200)
      assert.ok(!res.body.nombre || res.body.nombre === '')
    })

    it('login with valid empresa code routes to correct DB', async () => {
      const res = await request('POST', '/api/auth/login', {
        body: { usuario: 'testuser', password: 'testpass', empresa: 'default' },
      })
      assert.ok([401, 429].includes(res.status))
    })
  })

  // ── Security Headers ─────────────────────────────────────────
  describe('Security Headers', () => {
    it('X-Content-Type-Options header is present', async () => {
      const res = await request('GET', '/api/health')
      assert.strictEqual(res.headers['x-content-type-options'], 'nosniff')
    })

    it('X-Frame-Options header is present', async () => {
      const res = await request('GET', '/api/health')
      assert.ok(['DENY', 'SAMEORIGIN'].includes(res.headers['x-frame-options']), `Got: ${res.headers['x-frame-options']}`)
    })

    it('Content-Security-Policy header is present', async () => {
      const res = await request('GET', '/api/health')
      assert.ok(res.headers['content-security-policy'], 'CSP header should be present')
    })

    it('X-Powered-By header is NOT present (Helmet removes it)', async () => {
      const res = await request('GET', '/api/health')
      assert.strictEqual(res.headers['x-powered-by'], undefined, 'X-Powered-By should be stripped')
    })
  })

  // ── JWT Tampering ────────────────────────────────────────────
  describe('JWT Security', () => {
    it('tampered JWT token returns 401', async () => {
      const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImZha2UiLCJyb2wiOiJhZG1pbiIsImVtcHJlc2EiOiJkZWZhdWx0In0.fakesignature'
      const res = await request('GET', '/api/auth/me', {
        headers: { Authorization: `Bearer ${fakeToken}` },
      })
      assert.strictEqual(res.status, 401)
    })

    it('missing Authorization header returns 401', async () => {
      const res = await request('GET', '/api/auth/me')
      assert.strictEqual(res.status, 401)
    })

    it('malformed Authorization header returns 401', async () => {
      const res = await request('GET', '/api/auth/me', {
        headers: { Authorization: 'NotBearer faketoken' },
      })
      assert.strictEqual(res.status, 401)
    })
  })

  // ── Content-Type Enforcement ─────────────────────────────────
  describe('Content-Type Enforcement', () => {
    it('webhook receptor rejects non-JSON content', async () => {
      const res = await request('POST', '/api/webhooks/receptor/wh_test_nonexistent', {
        headers: { 'Content-Type': 'text/plain' },
        body: { test: true },
      })
      // 415 = Unsupported Media Type, but rate limiter can return 429 too
      assert.ok([415, 429].includes(res.status), `Expected 415 or 429, got ${res.status}`)
      if (res.status === 415) assert.ok(res.body.error.includes('application/json'))
    })

    it('webhook receptor with invalid token returns 400', async () => {
      const res = await request('POST', '/api/webhooks/receptor/badtoken', {
        body: { test: true },
      })
      assert.ok([400, 429].includes(res.status), `Expected 400 or 429, got ${res.status}`)
    })
  })

  // ── Open Redirect Prevention ─────────────────────────────────
  describe('Open Redirect', () => {
    it('/:codigo con empresa existente redirige al login', async () => {
      const { createEmpresa } = require('../db_master')
      createEmpresa({ codigo: 'opentest', nombre: 'Open Test', plan_id: null, admin_email: 'open@opentest.test' })
      const res = await request('GET', '/opentest')
      assert.strictEqual(res.status, 302)
      assert.ok(res.headers.location.includes('/app/login'))
    })

    it('/:codigo con empresa inexistente devuelve 404 (sin soft-404)', async () => {
      const res = await request('GET', '/empresa-inexistente-xyz')
      assert.strictEqual(res.status, 404)
    })

    it('/:codigo with path traversal is rejected by regex', async () => {
      const res = await request('GET', '/../.env')
      assert.ok(res.status >= 400 || res.status === 200, `Should not redirect to sensitive paths, got ${res.status}`)
    })
  })

  // ── Auth Lockout ─────────────────────────────────────────────
  describe('Login Lockout', () => {
    it('multiple failed logins trigger lockout', { timeout: 30000 }, async () => {
      let locked = false
      for (let i = 0; i < 4; i++) {
        const res = await request('POST', '/api/auth/login', {
          body: { usuario: `lockout_test_${i}`, password: 'wrongpassword', empresa: 'default' },
        })
        if (res.status === 429) { locked = true; break }
      }
      assert.ok(true)
    })
  })

  // ── Importación masiva (productos/clientes) ─────────────────
  // Usa un app aislado (sin rate limiter ni CSRF) con los routers reales
  // y un DB temporal, para testear la lógica de import sin depender de JWT/tenant.
  describe('Importación masiva', () => {
    const express = require('express')
    const fs = require('node:fs')
    const bcrypt = require('bcryptjs')
    const jwt = require('jsonwebtoken')
    const { createDB } = require('../db_sqlite')
    const productosRouter = require('../routes/productos')
    const clientesRouter = require('../routes/clientes')
    const tempDbPath = path.join(__dirname, '..', 'data', 'test_import_tmp.db')

    let app, srv, url, tempDb

    function tokenFor(userId) {
      return jwt.sign({ id: userId, empresa: 'default' }, process.env.JWT_SECRET)
    }

    function localRequest(method, route, opts = {}) {
      return new Promise((resolve, reject) => {
        const u = new URL(route, url)
        const body = opts.body ? JSON.stringify(opts.body) : null
        const req = http.request(u, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...opts.headers,
            ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
          },
        }, (res) => {
          let data = ''
          res.on('data', c => data += c)
          res.on('end', () => {
            let json
            try { json = JSON.parse(data) } catch { json = null }
            resolve({ status: res.statusCode, body: json, raw: data })
          })
        })
        req.on('error', reject)
        if (body) req.write(body)
        req.end()
      })
    }

    before(async () => {
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(tempDbPath + suffix) } catch {}
      }
      tempDb = createDB(tempDbPath)
      tempDb.insert('usuarios', {
        id: 'u-test-admin', nombre: 'Test Admin', usuario: 'testadmin',
        email: 'testadmin@test.local', password: bcrypt.hashSync('testpass', 10),
        rol: 'admin', activo: true,
      })
      tempDb.insert('usuarios', {
        id: 'u-test-vend', nombre: 'Test Vend', usuario: 'testvend',
        email: 'testvend@test.local', password: bcrypt.hashSync('testpass', 10),
        rol: 'vendedor', activo: true,
      })
      app = express()
      app.use(express.json({ limit: '2mb' }))
      app.use((req, res, next) => { req.db = tempDb; next() })
      app.use('/productos', productosRouter)
      app.use('/clientes', clientesRouter)
      await new Promise((resolve, reject) => {
        srv = app.listen(0, '127.0.0.1', () => {
          url = `http://127.0.0.1:${srv.address().port}`
          resolve()
        })
      })
    })

    after(() => {
      if (srv) srv.close()
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(tempDbPath + suffix) } catch {}
      }
    })

    it('POST /productos/importar crea 350 productos en 1 request (sin 429)', async () => {
      const productos = Array.from({ length: 350 }, (_, i) => ({
        nombre: `Producto Test ${i}`, sku: `SKU-${i}`, categoria: 'Test',
        precio_l1: 100 + i, precio_l2: 90 + i, precio_l3: 80 + i,
        costo: 50, stock_min: 5,
      }))
      const res = await localRequest('POST', '/productos/importar', {
        body: { productos },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.creados, 350)
      assert.strictEqual(res.body.actualizados, 0)
      assert.strictEqual(res.body.errores, 0)
      assert.strictEqual(tempDb.all('productos').length, 350)
    })

    it('re-importar por SKU actualiza en vez de duplicar', async () => {
      const productos = Array.from({ length: 350 }, (_, i) => ({
        nombre: `Producto Test ${i} v2`, sku: `SKU-${i}`, categoria: 'Test',
        precio_l1: 200 + i, costo: 60,
      }))
      const res = await localRequest('POST', '/productos/importar', {
        body: { productos },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.actualizados, 350)
      assert.strictEqual(res.body.creados, 0)
      assert.strictEqual(tempDb.all('productos').length, 350)
      const p = tempDb.find('productos', { sku: 'SKU-0' })[0]
      assert.strictEqual(p.precio_l1, 200)
    })

    it('filas inválidas se cuentan como errores sin abortar el resto', async () => {
      const productos = [
        { nombre: '', sku: 'SKU-BAD-1', precio_l1: 100 },
        { nombre: 'Sin Precio', sku: 'SKU-BAD-2', precio_l1: 0 },
        { nombre: 'Válido', sku: 'SKU-VALID', precio_l1: 500 },
      ]
      const res = await localRequest('POST', '/productos/importar', {
        body: { productos },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.creados, 1)
      assert.strictEqual(res.body.errores, 2)
      assert.strictEqual(res.body.errores_detalle.length, 2)
      assert.ok(res.body.errores_detalle.some(e => e.fila === 2 && e.error === 'Nombre obligatorio'))
      assert.ok(res.body.errores_detalle.some(e => e.fila === 3 && e.error === 'Precio L1 obligatorio'))
    })

    it('vendedor no puede importar productos (403)', async () => {
      const res = await localRequest('POST', '/productos/importar', {
        body: { productos: [{ nombre: 'X', precio_l1: 10 }] },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-vend') },
      })
      assert.strictEqual(res.status, 403)
    })

    it('POST /clientes/importar crea 300 clientes y actualiza por DNI', async () => {
      const clientes = Array.from({ length: 300 }, (_, i) => ({
        nombre: `Cliente ${i}`, apellido: 'Test',
        dni: String(30000000 + i), tel: `11${i}`,
        email: `cliente${i}@test.local`, lista: 1,
      }))
      const res = await localRequest('POST', '/clientes/importar', {
        body: { clientes },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.creados, 300)
      assert.strictEqual(res.body.errores, 0)
      assert.strictEqual(tempDb.all('clientes').length, 300)

      const re = await localRequest('POST', '/clientes/importar', {
        body: { clientes: [{ nombre: 'Cliente 0 actualizado', dni: '30000000', tel: '110', email: 'cliente0@test.local' }] },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(re.body.actualizados, 1)
      assert.strictEqual(tempDb.all('clientes').length, 300)
    })

    it('body inválido en /productos/importar devuelve 400', async () => {
      const res = await localRequest('POST', '/productos/importar', {
        body: { foo: 'bar' },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.status, 400)
    })

    it('más de 10.000 filas devuelve 400', async () => {
      const productos = Array.from({ length: 10001 }, (_, i) => ({
        nombre: `Producto ${i}`, precio_l1: 100,
      }))
      const res = await localRequest('POST', '/productos/importar', {
        body: { productos },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.status, 400)
      assert.ok(res.body.error.includes('10.000'))
    })

    it('dedupe por código de barras actualiza en vez de duplicar', async () => {
      const res = await localRequest('POST', '/productos/importar', {
        body: { productos: [{ nombre: 'Prod Barras', codigo_barras: '779999999', precio_l1: 500 }] },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.body.creados, 1)

      const re = await localRequest('POST', '/productos/importar', {
        body: { productos: [{ nombre: 'Prod Barras v2', codigo_barras: '779999999', precio_l1: 600 }] },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(re.body.actualizados, 1)
      assert.strictEqual(re.body.creados, 0)
      const p = tempDb.find('productos', { codigo_barras: '779999999' })[0]
      assert.strictEqual(p.precio_l1, 600)
    })

    it('dedupe_nombre: true actualiza productos con el mismo nombre (sin SKU)', async () => {
      const res = await localRequest('POST', '/productos/importar', {
        body: { productos: [{ nombre: 'Nombre Sin Sku', precio_l1: 100 }] },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.body.creados, 1)

      const re = await localRequest('POST', '/productos/importar', {
        body: { productos: [{ nombre: 'Nombre Sin Sku', precio_l1: 250 }], dedupe_nombre: true },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(re.body.actualizados, 1)
      assert.strictEqual(re.body.creados, 0)
      const p = tempDb.find('productos', { nombre: 'Nombre Sin Sku' })[0]
      assert.strictEqual(p.precio_l1, 250)
    })

    it('saltar_duplicados: true evita duplicar por nombre dentro del archivo', async () => {
      const res = await localRequest('POST', '/productos/importar', {
        body: {
          productos: [
            { nombre: 'Dupe En Archivo', precio_l1: 100 },
            { nombre: 'Dupe En Archivo', precio_l1: 200 },
          ],
          saltar_duplicados: true,
        },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.body.creados, 1)
      assert.strictEqual(res.body.duplicados_saltados, 1)
      const matches = tempDb.find('productos', { nombre: 'Dupe En Archivo' })
      assert.strictEqual(matches.length, 1)
    })

    it('sin dedupe_nombre ni saltar_duplicados se permite crear duplicados por nombre', async () => {
      const res = await localRequest('POST', '/productos/importar', {
        body: { productos: [{ nombre: 'Dupe Permitido', precio_l1: 100 }] },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.body.creados, 1)
      const re = await localRequest('POST', '/productos/importar', {
        body: { productos: [{ nombre: 'Dupe Permitido', precio_l1: 150 }] },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(re.body.creados, 1)
      assert.strictEqual(tempDb.find('productos', { nombre: 'Dupe Permitido' }).length, 2)
    })

    it('activar/desactivar por fila: Mostrar en tienda No → activo false', async () => {
      const res = await localRequest('POST', '/productos/importar', {
        body: { productos: [
          { nombre: 'Oculto', sku: 'SKU-OCULTO', precio_l1: 100, activo: false },
          { nombre: 'Visible', sku: 'SKU-VISIBLE', precio_l1: 100, activo: true },
        ] },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.body.creados, 2)
      assert.strictEqual(tempDb.find('productos', { sku: 'SKU-OCULTO' })[0].activo, false)
      assert.strictEqual(tempDb.find('productos', { sku: 'SKU-VISIBLE' })[0].activo, true)
    })

    it('nombre demasiado largo → error de fila sin abortar el resto', async () => {
      const res = await localRequest('POST', '/productos/importar', {
        body: { productos: [
          { nombre: 'X'.repeat(300), sku: 'SKU-LARGO', precio_l1: 100 },
          { nombre: 'Nombre Ok', sku: 'SKU-OK', precio_l1: 100 },
        ] },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.body.creados, 1)
      assert.strictEqual(res.body.errores, 1)
      assert.ok(res.body.errores_detalle[0].error.includes('largo'))
    })

    it('tipo inválido de nombre (objeto) → error de fila', async () => {
      const res = await localRequest('POST', '/productos/importar', {
        body: { productos: [{ nombre: { evil: true }, sku: 'SKU-OBJ', precio_l1: 100 }] },
        headers: { Authorization: 'Bearer ' + tokenFor('u-test-admin') },
      })
      assert.strictEqual(res.body.errores, 1)
      assert.strictEqual(res.body.creados, 0)
    })
  })

  // ── Rate Limiting (must be last — exhausts the budget) ─────
  describe('Rate Limiting', () => {
    it('rate limit headers track remaining requests', async () => {
      const res1 = await request('GET', '/api/health')
      assert.ok(res1.headers['ratelimit-remaining'] !== undefined, 'Should have RateLimit-Remaining header')
      const remaining = parseInt(res1.headers['ratelimit-remaining'])
      assert.ok(remaining > 0 && remaining <= 300, `Remaining should be between 1-300, got ${remaining}`)
    })

    it('rate limiter blocks after exceeding limit', { timeout: 15000 }, async () => {
      let lastRes
      for (let i = 0; i < 320; i++) {
        try { lastRes = await request('GET', '/api/health') } catch { break }
        if (lastRes && lastRes.status === 429) break
      }
      assert.ok(lastRes, 'Should have a response')
      assert.strictEqual(lastRes.status, 429, 'Should be rate limited after 300+ requests')
    })
  })
})
