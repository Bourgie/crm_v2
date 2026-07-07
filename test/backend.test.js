const { describe, it, before, after } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const path = require('node:path')

// Use test DB locations
process.env.NODE_ENV = 'test'
process.env.DB_PATH = path.join(__dirname, '..', 'data', 'test_master.db')
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
      assert.ok(res.body.error.includes('tel'))
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
  describe('2FA', () => {
    let saToken

    before(() => {
      const jwt = require('jsonwebtoken')
      const { master } = require('../db_master')
      const sa = master.prepare("SELECT id, usuario, nombre FROM superadmin WHERE activo=1 LIMIT 1").get()
      saToken = jwt.sign({ id: sa.id, usuario: sa.usuario, nombre: sa.nombre, role: 'superadmin' },
        process.env.SA_SECRET, { expiresIn: '1h' })
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
        body: { usuario: 'superadmin', password: 'superadmin123' },
      })
      assert.strictEqual(login.status, 200)
      assert.strictEqual(login.body.require_2fa, true)
      assert.ok(typeof login.body.temp_token === 'string')

      const verifyCode = totp.generate(secret)
      const verify = await request('POST', '/api/superadmin/2fa/verify-login', {
        body: { temp_token: login.body.temp_token, code: verifyCode },
      })
      assert.strictEqual(verify.status, 200)
      assert.ok(typeof verify.body.token === 'string')
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
