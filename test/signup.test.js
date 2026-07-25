// flexcrm — Basic Integration Tests
// Run: npm test or npx vitest run

import { describe, it, expect } from 'vitest'

// ═══ Signup Tests ═══
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000'

async function api(method, path, body) {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  return { status: res.status, ...data }
}

describe('POST /api/auth/signup', () => {
  it('rejects missing fields', async () => {
    const r = await api('POST', '/api/auth/signup', { empresa_nombre: '', email: '', password: '' })
    expect(r.error).toBeTruthy()
  })

  it('rejects weak password', async () => {
    const r = await api('POST', '/api/auth/signup', { empresa_nombre: 'Test', email: 'test@test.com', password: '123' })
    expect(r.error).toBeTruthy()
  })

  it('creates account with valid data', async () => {
    const ts = Date.now()
    const r = await api('POST', '/api/auth/signup', {
      empresa_nombre: 'TestSignup' + ts,
      email: 'test' + ts + '@test.com',
      password: 'Test1234!',
      rubro: 'general'
    })
    expect(r.ok).toBe(true)
    expect(r.token).toBeTruthy()
    expect(r.empresa).toBeTruthy()
  })
})

describe('GET /api/health', () => {
  it('returns ok with version', async () => {
    const r = await api('GET', '/api/health')
    expect(r.ok).toBe(true)
    expect(r.version).toBeTruthy()
  })
})

describe('POST /api/landing/lead (form submission)', () => {
  it('accepts valid lead', async () => {
    const r = await api('POST', '/api/landing/lead', {
      nombre: 'Test Lead',
      mensaje: 'Hola, quiero probar',
      telefono: '123456',
      pagina: 'test'
    })
    expect(r.ok).toBe(true)
  })
})
