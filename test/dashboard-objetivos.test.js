// ══════════════════════════════════════════════════════════════
// Tests del endpoint de objetivos por sucursal del dashboard.
// Ejecutar: npm run test:backend
// ══════════════════════════════════════════════════════════════
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const bcrypt = require('bcryptjs')

const TEST_DATA_DIR = path.join(__dirname, '..', 'data', 'test')
try { fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true }) } catch {}
process.env.NODE_ENV = 'test'
process.env.MASTER_PATH = path.join(TEST_DATA_DIR, 'master.db')
process.env.TENANT_DATA_DIR = TEST_DATA_DIR
process.env.JWT_SECRET = 'test-jwt-secret-for-objetivos-sucs-tests'
process.env.SA_SECRET = 'test-sa-secret-for-objetivos-sucs-tests'

const jwt = require('jsonwebtoken')
const { getEmpresaDB } = require('../db_sqlite')
const { createEmpresa } = require('../db_master')

let server, baseUrl

function request(method, rpath, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(rpath, baseUrl)
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

function signUserToken(id, rol, empresa) {
  return jwt.sign({ id, rol, empresa }, process.env.JWT_SECRET, { expiresIn: '1h' })
}

describe('Dashboard: objetivos por sucursal', () => {
  const EMPRESA = 'objtest'
  const now = new Date()
  const mesKey = now.toISOString().substr(0, 7)
  const anioAnt = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 10))
  const mesAnioAntKey = anioAnt.toISOString().substr(0, 7)

  let adminToken, vendToken

  before(async () => {
    createEmpresa({ codigo: EMPRESA, nombre: 'Obj Test', plan_id: null, admin_email: 'admin@objtest.test' })
    const dbA = getEmpresaDB(EMPRESA)
    const ts = new Date().toISOString()
    const hash = bcrypt.hashSync('Test1234!', 10)

    dbA.insert('sucursales', { id: 's1', nombre: 'Suc 1', activo: true })
    dbA.insert('sucursales', { id: 's2', nombre: 'Suc 2', activo: true })
    dbA.insert('sucursales', { id: 's3', nombre: 'Suc Inactiva', activo: false })
    dbA.insert('usuarios', {
      id: 'u_admin', nombre: 'Admin', usuario: 'admin_obj', email: 'admin@objtest.test',
      password: hash, rol: 'admin', roles: ['admin'], suc_sesiones_permitidas: [], activo: true,
      creado: ts, must_change_password: 0, email_verificado: 1, password_changed_at: ts,
    })
    dbA.insert('usuarios', {
      id: 'u_vend', nombre: 'Vend', usuario: 'vend_obj', email: 'vend@objtest.test',
      password: hash, rol: 'vendedor', roles: ['vendedor'], suc_id: 's1', suc_sesiones_permitidas: ['s1'], activo: true,
      creado: ts, must_change_password: 0, email_verificado: 1, password_changed_at: ts,
    })

    // Ventas mes actual: s1 = 30000, s2 = 20000 (+ una anulada que no debe contar)
    dbA.insert('ventas', { id: 'v1', numero: 1, fecha: `${mesKey}-10T10:00:00.000Z`, suc_id: 's1', total: 10000, pago: 'efectivo', anulada: 0 })
    dbA.insert('ventas', { id: 'v2', numero: 2, fecha: `${mesKey}-11T10:00:00.000Z`, suc_id: 's1', total: 10000, pago: 'efectivo', anulada: 0 })
    dbA.insert('ventas', { id: 'v3', numero: 3, fecha: `${mesKey}-12T10:00:00.000Z`, suc_id: 's1', total: 10000, pago: 'efectivo', anulada: 0 })
    dbA.insert('ventas', { id: 'v4', numero: 4, fecha: `${mesKey}-10T10:00:00.000Z`, suc_id: 's2', total: 10000, pago: 'efectivo', anulada: 0 })
    dbA.insert('ventas', { id: 'v5', numero: 5, fecha: `${mesKey}-11T10:00:00.000Z`, suc_id: 's2', total: 10000, pago: 'efectivo', anulada: 0 })
    dbA.insert('ventas', { id: 'v6', numero: 6, fecha: `${mesKey}-11T10:00:00.000Z`, suc_id: 's2', total: 99999, pago: 'efectivo', anulada: 1 })
    // Año anterior: s1 = 20000, s2 = 30000
    dbA.insert('ventas', { id: 'v7', numero: 7, fecha: `${mesAnioAntKey}-10T10:00:00.000Z`, suc_id: 's1', total: 20000, pago: 'efectivo', anulada: 0 })
    dbA.insert('ventas', { id: 'v8', numero: 8, fecha: `${mesAnioAntKey}-10T10:00:00.000Z`, suc_id: 's2', total: 30000, pago: 'efectivo', anulada: 0 })

    const cfg = dbA.getConfig() || {}
    cfg.objetivos_mensuales = { ...(cfg.objetivos_mensuales || {}) }
    cfg.objetivos_mensuales[mesKey + '_global'] = 100000
    cfg.objetivos_mensuales[mesKey + '_s1'] = 50000
    dbA.setConfig(cfg)

    adminToken = signUserToken('u_admin', 'admin', EMPRESA)
    vendToken = signUserToken('u_vend', 'vendedor', EMPRESA)

    await new Promise((resolve, reject) => {
      server = require('../server').listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`
        resolve()
      })
    })
  })

  after(() => { if (server) server.close() })

  it('requiere autenticación (401 sin token)', async () => {
    const r = await request('GET', '/api/dashboard/objetivos-sucs')
    assert.strictEqual(r.status, 401)
  })

  it('vendedor recibe 403', async () => {
    const r = await request('GET', '/api/dashboard/objetivos-sucs', {
      headers: { Authorization: `Bearer ${vendToken}` },
    })
    assert.strictEqual(r.status, 403)
  })

  it('admin recibe objetivos por sucursal con fallback global y excluye inactivas', async () => {
    const r = await request('GET', '/api/dashboard/objetivos-sucs', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert.strictEqual(r.status, 200)
    const sucs = r.body.sucursales
    assert.strictEqual(sucs.length, 2, 'solo sucursales activas')
    const s1 = sucs.find(s => s.id === 's1')
    const s2 = sucs.find(s => s.id === 's2')
    assert.ok(s1 && s2, 's1 y s2 presentes')

    assert.strictEqual(s1.objetivo, 50000, 's1 usa su objetivo propio')
    assert.strictEqual(s1.usando_global, false)
    assert.strictEqual(s1.ventas_mes, 30000, 'las anuladas no cuentan')
    assert.strictEqual(s1.cumplimiento, 60)

    assert.strictEqual(s2.objetivo, 100000, 's2 cae al objetivo global')
    assert.strictEqual(s2.usando_global, true)
    assert.strictEqual(s2.ventas_mes, 20000)
    assert.strictEqual(s2.cumplimiento, 20)
  })

  it('calcula comparación año anterior y total', async () => {
    const r = await request('GET', '/api/dashboard/objetivos-sucs', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const s1 = r.body.sucursales.find(s => s.id === 's1')
    const s2 = r.body.sucursales.find(s => s.id === 's2')
    assert.strictEqual(s1.ventas_anio_anterior, 20000)
    assert.strictEqual(s1.delta_anio_anterior, 50, '+50% vs año anterior')
    assert.strictEqual(s2.ventas_anio_anterior, 30000)
    assert.strictEqual(s2.delta_anio_anterior, -33, '-33% vs año anterior')

    const t = r.body.total
    assert.strictEqual(t.objetivo, 100000, 'total usa el objetivo global')
    assert.strictEqual(t.ventas_mes, 50000)
    assert.strictEqual(t.cumplimiento, 50)
    assert.strictEqual(t.ventas_anio_anterior, 50000)
    assert.strictEqual(t.delta_anio_anterior, 0)
  })

  it('calcula proyección de cierre con el ritmo actual', async () => {
    const r = await request('GET', '/api/dashboard/objetivos-sucs', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const diasDelMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const factor = diasDelMes / Math.max(1, now.getDate())
    const s1 = r.body.sucursales.find(s => s.id === 's1')
    const s2 = r.body.sucursales.find(s => s.id === 's2')
    assert.strictEqual(s1.proyeccion, Math.round(30000 * factor))
    assert.strictEqual(s2.proyeccion, Math.round(20000 * factor))
    assert.strictEqual(s1.proyeccion_cumplimiento, Math.round((s1.proyeccion / s1.objetivo) * 100))
    assert.strictEqual(typeof s1.proyectado_cumple, 'boolean')
    const t = r.body.total
    assert.strictEqual(t.proyeccion, s1.proyeccion + s2.proyeccion, 'total = suma de proyecciones por sucursal')
  })

  it('devuelve sin_objetivo cuando ninguna sucursal tiene objetivo', async () => {
    const dbA = getEmpresaDB(EMPRESA)
    const cfg = dbA.getConfig() || {}
    cfg.objetivos_mensuales = {}
    dbA.setConfig(cfg)
    try {
      const r = await request('GET', '/api/dashboard/objetivos-sucs', {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      assert.strictEqual(r.status, 200)
      assert.strictEqual(r.body.total.objetivo, 0)
      assert.strictEqual(r.body.total.sin_objetivo, true)
      assert.ok(r.body.sucursales.every(s => s.sin_objetivo))
    } finally {
      const cfg2 = dbA.getConfig() || {}
      cfg2.objetivos_mensuales = {}
      cfg2.objetivos_mensuales[mesKey + '_global'] = 100000
      cfg2.objetivos_mensuales[mesKey + '_s1'] = 50000
      dbA.setConfig(cfg2)
    }
  })
})
