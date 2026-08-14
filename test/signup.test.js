// flexcrm — Unit Tests (no server needed)
// Run: npx vitest run
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import path from 'node:path'

// Aislar DB de tests (master y tenants) — no tocar data/ real
process.env.NODE_ENV = 'test'
process.env.MASTER_PATH = path.join(process.cwd(), 'data', 'test', 'master.db')
process.env.TENANT_DATA_DIR = path.join(process.cwd(), 'data', 'test')

let server, baseUrl

beforeAll(async () => {
  // Start Express app on random port
  const app = require('../server')
  server = http.createServer(app)
  await new Promise(resolve => server.listen(0, () => resolve()))
  const port = server.address().port
  baseUrl = `http://localhost:${port}`
})

afterAll(() => { if (server) server.close() })

async function api(method, path, body) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  return { status: res.status, ...data }
}

describe('POST /api/auth/signup', () => {
  it('rejects empty fields', async () => {
    const r = await api('POST', '/api/auth/signup', { empresa_nombre: '', email: '', password: '' })
    expect(r.error).toBeTruthy()
  })

  it('rejects weak password (no uppercase/no digit)', async () => {
    const r = await api('POST', '/api/auth/signup', {
      empresa_nombre: 'TestShop',
      email: 'weak@test.com',
      password: 'solominuscula'
    })
    expect(r.error).toBeTruthy()
  })

  it('creates account and returns ok', async () => {
    const ts = Date.now()
    const r = await api('POST', '/api/auth/signup', {
      empresa_nombre: 'UnitTest-' + ts,
      email: 'unittest' + ts + '@test.com',
      password: 'Test1234!',
      rubro: 'general'
    })
    expect(r.ok).toBe(true)
    expect(r.mensaje).toBeTruthy()
  })
})

describe('GET /api/health', () => {
  it('returns version, uptime, memory, db', async () => {
    const r = await api('GET', '/api/health')
    expect(r.ok).toBe(true)
    expect(r.version).toBeTruthy()
  })
})

describe('POST /api/landing/lead', () => {
  it('accepts valid lead form', async () => {
    const r = await api('POST', '/api/landing/lead', {
      nombre: 'Test Lead Unit',
      mensaje: 'Probando desde test unitario',
      telefono: '123456789',
      pagina: 'unittest'
    })
    expect(r.ok).toBe(true)
    expect(r.id).toBeTruthy()
  })
})

describe('POST /api/landing/zoho-form', () => {
  it('accepts Zoho-style JSON payload', async () => {
    const r = await api('POST', '/api/landing/zoho-form', {
      Name: { first_name: 'Zoho', last_name: 'Test' },
      Email: { value: 'zoho@test.com' },
      PhoneNumber: { value: '999' },
      MultiLine: { value: 'Mensaje de Zoho Forms' },
    })
    expect(r.ok).toBe(true)
  })
})
