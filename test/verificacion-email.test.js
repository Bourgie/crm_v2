// flexcrm — Verificación de email: flujo completo signup→verify→re-login + migración blob→columna
// Run: npx vitest run test/verificacion-email.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'

// Aislar DB de tests (master y tenants) — no tocar data/ real
process.env.NODE_ENV = 'test'
process.env.MASTER_PATH = path.join(process.cwd(), 'data', 'test', 'master.db')
process.env.TENANT_DATA_DIR = path.join(process.cwd(), 'data', 'test')
// SMTP fake para que signup/verify "envien" mail (interceptado abajo, nunca sale a la red)
process.env.SMTP_HOST = 'smtp.test.local'
process.env.SMTP_USER = 'test@test.local'
process.env.SMTP_PASS = 'testpass'
process.env.SMTP_FROM = 'test@test.local'

// Interceptar sendEmail para capturar los HTML (y no tocar red)
const captured = []
const sendEmailMod = require('../lib/send-email')
sendEmailMod.sendEmail = async (...args) => {
  captured.push(args[7] || '')
  return { messageId: 'test-message' }
}

let server, baseUrl

beforeAll(async () => {
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
  let data = {}
  try { data = await res.json() } catch(e) {}
  return { status: res.status, ...data }
}

function tokensCapturados() {
  return captured
    .map(h => { const m = h.match(/\/api\/auth\/verify-email\/([0-9a-f]+)/); return m ? m[1] : null })
    .filter(Boolean)
}

async function crearCuenta(prefix) {
  const ts = Date.now()
  const email = prefix + ts + '@test.com'
  const password = 'FlowTest1234!'
  const r = await api('POST', '/api/auth/signup', {
    empresa_nombre: prefix.toUpperCase() + 'Shop-' + ts, email, password, rubro: 'general'
  })
  expect(r.ok).toBe(true)
  const { getEmpresas } = require('../db_master')
  const emp = getEmpresas().find(e => e.admin_email === email)
  expect(emp).toBeTruthy()
  return { email, password, empresaCodigo: emp.codigo }
}

describe('Flujo verificación de email (signup → verify → re-login)', () => {
  let ctx

  it('signup crea usuario con email_verificado=0 en columna real (no blob)', async () => {
    ctx = await crearCuenta('flow')
    const { getEmpresaDB } = require('../db_sqlite')
    const db = getEmpresaDB(ctx.empresaCodigo, { existingOnly: true })
    const row = db.raw.prepare("SELECT email_verificado, data FROM usuarios WHERE email=?").get(ctx.email)
    expect(row).toBeTruthy()
    expect(row.email_verificado).toBe(0)
    const data = JSON.parse(row.data || '{}')
    expect(data.email_verificado).toBeUndefined()
    const pend = db.raw.prepare("SELECT COUNT(*) AS n FROM email_tokens WHERE email=? AND usado=0").get(ctx.email)
    expect(pend.n).toBe(1)
  })

  it('verify con el token del signup: redirige ok, marca verificado y envía bienvenida', async () => {
    const tokens = tokensCapturados()
    expect(tokens.length).toBeGreaterThanOrEqual(1)
    const token = tokens[tokens.length - 1]
    const before = captured.length

    const res = await fetch(baseUrl + '/api/auth/verify-email/' + token, { redirect: 'manual' })
    expect(res.status).toBe(302)
    const loc = res.headers.get('location') || ''
    expect(loc).toContain('verified=ok')

    const { getEmpresaDB } = require('../db_sqlite')
    const db = getEmpresaDB(ctx.empresaCodigo, { existingOnly: true })
    const row = db.raw.prepare("SELECT email_verificado, data FROM usuarios WHERE email=?").get(ctx.email)
    expect(row.email_verificado).toBe(1)
    const data = JSON.parse(row.data || '{}')
    expect(data.email_verificado).toBeUndefined()
    const pend = db.raw.prepare("SELECT COUNT(*) AS n FROM email_tokens WHERE email=? AND usado=0").get(ctx.email)
    expect(pend.n).toBe(0)

    // Welcome email enviado tras verificar
    const welcome = captured.slice(before).find(h => h.includes('Bienvenido a FlexCRM'))
    expect(welcome).toBeTruthy()
    expect(welcome).toContain('Primeros pasos')
    expect(welcome).toContain('contacto@unfulanodev.com.ar')
    expect(welcome).toContain('tutoriales')
  })

  it('login normal funciona y sigue funcionando en el siguiente login (el bug reportado)', async () => {
    const r1 = await api('POST', '/api/auth/login', { usuario: ctx.email, password: ctx.password, empresa: ctx.empresaCodigo })
    expect(r1.status).toBe(200)
    expect(r1.user).toBeTruthy()

    const r2 = await api('POST', '/api/auth/login', { usuario: ctx.email, password: ctx.password, empresa: ctx.empresaCodigo })
    expect(r2.status).toBe(200)
    expect(r2.user).toBeTruthy()
  })
})

describe('Login sin verificar → 401 + reenvío → verify con token reenviado', () => {
  let ctx

  it('login falla con email_pendiente y reenvía un token nuevo', async () => {
    ctx = await crearCuenta('resend')
    // El reenvío del login usa SMTP de config global (no env) — activarlo en master
    const { setGlobalConfig } = require('../db_master')
    setGlobalConfig('smtp_host', 'smtp.test.local')
    setGlobalConfig('smtp_port', '465')
    setGlobalConfig('smtp_user', 'test@test.local')
    setGlobalConfig('smtp_pass', 'testpass')

    const signupTokens = tokensCapturados().length
    const r = await api('POST', '/api/auth/login', { usuario: ctx.email, password: ctx.password, empresa: ctx.empresaCodigo })
    expect(r.status).toBe(401)
    expect(r.email_pendiente).toBe(true)

    const tokens = tokensCapturados()
    expect(tokens.length).toBe(signupTokens + 1) // un token nuevo reenviado
    expect(tokens[tokens.length - 1]).not.toBe(tokens[signupTokens - 1])

    const { getEmpresaDB } = require('../db_sqlite')
    const db = getEmpresaDB(ctx.empresaCodigo, { existingOnly: true })
    const pend = db.raw.prepare("SELECT COUNT(*) AS n FROM email_tokens WHERE email=? AND usado=0").get(ctx.email)
    expect(pend.n).toBe(1)
  })

  it('verify con el token reenviado → login OK', async () => {
    const tokens = tokensCapturados()
    const token = tokens[tokens.length - 1]
    const res = await fetch(baseUrl + '/api/auth/verify-email/' + token, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location') || '').toContain('verified=ok')

    const r = await api('POST', '/api/auth/login', { usuario: ctx.email, password: ctx.password, empresa: ctx.empresaCodigo })
    expect(r.status).toBe(200)
    expect(r.user).toBeTruthy()
  })
})

describe('Migración blob→columna (DBs viejas)', () => {
  const migDir = path.join(process.cwd(), 'data', 'test', 'migracion')
  const migPath = path.join(migDir, 'migracion.db')
  const now = new Date().toISOString()

  beforeAll(() => {
    fs.mkdirSync(migDir, { recursive: true })
    for (const f of [migPath, migPath + '-wal', migPath + '-shm']) {
      try { fs.rmSync(f, { force: true }) } catch(e) {}
    }
    const { createDB } = require('../db_sqlite')
    const db = createDB(migPath)
    const insUser = db.raw.prepare(
      "INSERT INTO usuarios (id, nombre, usuario, email, password, rol, email_verificado, data) VALUES (?,?,?,?,?,?,?,?)"
    )
    insUser.run('u_no_verif', 'A', 'a', 'a@x.com', 'x', 'admin', 1, JSON.stringify({ email_verificado: 0, apellido: 'X' }))
    insUser.run('u_verif', 'B', 'b', 'b@x.com', 'x', 'admin', 1, JSON.stringify({ email_verificado: 0 }))
    insUser.run('u_sin_tokens', 'C', 'c', 'c@x.com', 'x', 'admin', 1, JSON.stringify({ email_verificado: 1 }))
    insUser.run('u_intacto', 'D', 'd', 'd@x.com', 'x', 'admin', 1, JSON.stringify({ apellido: 'Y' }))
    insUser.run('u_null', 'E', 'e', 'e@x.com', 'x', 'admin', 1, null)
    const insToken = db.raw.prepare(
      "INSERT INTO email_tokens (id, usuario_id, email, token_hash, expires, usado, creado) VALUES (?,?,?,?,?,?,?)"
    )
    insToken.run('t1', 'u_no_verif', 'a@x.com', 'hash1', now, 0, now)
    insToken.run('t2', 'u_verif', 'b@x.com', 'hash2', now, 1, now)
    insToken.run('t3', 'u_verif', 'b@x.com', 'hash3', now, 1, now)
  })

  it('promueve a columna real según tokens pendientes y limpia el blob', () => {
    const { createDB } = require('../db_sqlite')
    const db2 = createDB(migPath) // reabrir → migración always-run corre
    const rows = db2.raw.prepare("SELECT id, email_verificado, data FROM usuarios").all()
    const byId = Object.fromEntries(rows.map(r => [r.id, r]))

    expect(byId['u_no_verif'].email_verificado).toBe(0) // token sin usar → no verificado
    expect(JSON.parse(byId['u_no_verif'].data || '{}')).toEqual({ apellido: 'X' })
    expect(byId['u_verif'].email_verificado).toBe(1)     // todos los tokens usados → verificado
    expect(JSON.parse(byId['u_verif'].data || '{}')).toEqual({})
    expect(byId['u_sin_tokens'].email_verificado).toBe(1) // sin tokens → 1
    expect(JSON.parse(byId['u_sin_tokens'].data || '{}')).toEqual({})
    expect(byId['u_intacto'].email_verificado).toBe(1)   // sin key en blob → intacto
    expect(JSON.parse(byId['u_intacto'].data || '{}')).toEqual({ apellido: 'Y' })
    expect(byId['u_null'].email_verificado).toBe(1)      // data NULL → intacto
  })
})