const { describe, it, before, after } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const bcrypt = require('bcryptjs')

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests-only'

const { createDB, getEmpresaDB } = require('../db_sqlite')

// ══════════════════════════════════════════════════════════════
// TESTS DE CAPA DB (sin HTTP)
// ══════════════════════════════════════════════════════════════
describe('Treasury DB Layer', () => {
  let tmpDir, testDB

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'treasury_test_'))
    testDB = createDB(path.join(tmpDir, 'test.db'))
    testDB.insert('sucursales', { id: 's1', nombre: 'Suc Test', activo: true })
  })

  after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  })

  it('crea las tablas de tesorería en el schema', () => {
    const tables = testDB.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'treasury%'").all().map(r => r.name)
    for (const t of ['treasury_accounts', 'treasury_transactions', 'treasury_transfers']) {
      assert.ok(tables.includes(t), `falta ${t}`)
    }
  })

  it('calcula saldo = inicial + ingresos - egresos + transferencias', () => {
    const c1 = testDB.insert('treasury_accounts', { id: 'tc_a', nombre: 'Banco A', tipo: 'banco', suc_id: null, saldo_inicial: 1000, saldo_actual: 1000, activo: true })
    assert.ok(c1)
    testDB.insert('treasury_transactions', { id: 'tx1', cuenta_id: 'tc_a', tipo: 'income', monto: 500, fecha: new Date().toISOString(), concepto: 'Venta', anulado: 0 })
    testDB.insert('treasury_transactions', { id: 'tx2', cuenta_id: 'tc_a', tipo: 'expense', monto: 200, fecha: new Date().toISOString(), concepto: 'Gasto', anulado: 0 })
    testDB.insert('treasury_accounts', { id: 'tc_b', nombre: 'Banco B', tipo: 'banco', suc_id: null, saldo_inicial: 0, saldo_actual: 0, activo: true })
    testDB.insert('treasury_transfers', { id: 'tf1', cuenta_origen: 'tc_a', cuenta_destino: 'tc_b', monto: 300, fecha: new Date().toISOString(), concepto: 'Pase', anulado: 0 })

    const tx = testDB.raw.prepare("SELECT tipo, monto FROM treasury_transactions WHERE cuenta_id='tc_a' AND anulado=0").all()
    let saldo = 1000
    for (const t of tx) saldo += t.tipo === 'income' ? t.monto : -t.monto
    const tr = testDB.raw.prepare("SELECT cuenta_origen, cuenta_destino, monto FROM treasury_transfers WHERE anulado=0 AND (cuenta_origen='tc_a' OR cuenta_destino='tc_a')").all()
    for (const t of tr) {
      if (t.cuenta_destino === 'tc_a') saldo += t.monto
      if (t.cuenta_origen === 'tc_a') saldo -= t.monto
    }
    assert.strictEqual(saldo, 1000 + 500 - 200 - 300) // 1000
  })

  it('índice único anti-duplicado por ref_tipo+ref_id', () => {
    testDB.insert('treasury_transactions', { id: 'txr1', cuenta_id: 'tc_a', tipo: 'income', monto: 100, fecha: new Date().toISOString(), concepto: 'Ref test', ref_tipo: 'proveedor_pago', ref_id: 'p1', anulado: 0 })
    assert.throws(() => {
      testDB.raw.prepare("INSERT INTO treasury_transactions (id, cuenta_id, tipo, monto, fecha, concepto, ref_tipo, ref_id, anulado) VALUES (?,?,?,?,?,?,?,?,0)")
        .run('txr2', 'tc_a', 'income', 100, new Date().toISOString(), 'Ref test dup', 'proveedor_pago', 'p1')
    }, /UNIQUE|constraint/i)
  })

  it('migra tipos_pago con campo medio y métodos de gastos/proveedores', () => {
    const cfg = testDB.getConfig('tipos_pago')
    const tp = typeof cfg === 'string' ? JSON.parse(cfg) : cfg
    assert.ok(Array.isArray(tp) && tp.length >= 9, 'debería haber al menos 9 métodos')
    assert.ok(tp.every(p => p.medio), 'todos deben tener medio')
    for (const id of ['cheque', 'debito_cuenta', 'tarjeta_corp']) {
      assert.ok(tp.some(p => p.id === id), `falta ${id}`)
    }
  })
})

// ══════════════════════════════════════════════════════════════
// TESTS HTTP (endpoints reales con usuario sembrado)
// ══════════════════════════════════════════════════════════════
describe('Treasury HTTP API', () => {
  let server, baseUrl, cookies, adminUser, cajeroUser
  const creados = { cuentas: [], txs: [], transfers: [] }
  const CSRF_TOKEN = 'csrf-treasury-test-token'
  const csrfHdr = { 'x-csrf-token': CSRF_TOKEN }

  function request(method, p, opts = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(p, baseUrl)
      const body = opts.body ? JSON.stringify(opts.body) : null
      const req = http.request(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookies || '',
          ...opts.headers,
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      }, (res) => {
        let data = ''
        res.on('data', c => data += c)
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
    const sc = res.headers['set-cookie']
    if (!sc) return null
    const arr = Array.isArray(sc) ? sc : [sc]
    for (const c of arr) {
      const m = c.match(new RegExp(name + '=([^;]+)'))
      if (m) return m[1]
    }
    return null
  }

  before(async () => {
    await new Promise((resolve, reject) => {
      server = require('../server').listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`
        resolve()
      })
    })

    const empDB = getEmpresaDB('default')
    const now = new Date().toISOString()
    const pass = bcrypt.hashSync('tesoreria-test-pass', 10)
    adminUser = empDB.insert('usuarios', {
      id: 'utest_tesorero_admin', nombre: 'Test Tesorero', usuario: 'tesoreria_test_admin', email: 'tesoreria_test_admin@test.com',
      password: pass, rol: 'admin', roles: ['admin'], suc_sesiones_permitidas: [], activo: true,
      creado: now, must_change_password: 0, email_verificado: 1, password_changed_at: now,
    })
    cajeroUser = empDB.insert('usuarios', {
      id: 'utest_cajero', nombre: 'Test Cajero', usuario: 'tesoreria_test_cajero', email: 'tesoreria_test_cajero@test.com',
      password: pass, rol: 'cajero', roles: ['cajero'], suc_sesiones_permitidas: [], activo: true,
      creado: now, must_change_password: 0, email_verificado: 1, password_changed_at: now,
    })

    const jwt = require('jsonwebtoken')
    const token = jwt.sign({ id: adminUser.id, rol: 'admin', empresa: 'default' }, process.env.JWT_SECRET)
    cookies = `access-token=${token}; csrf-token=${CSRF_TOKEN}`
  })

  after(async () => {
    const empDB = getEmpresaDB('default')
    for (const id of creados.transfers) { try { empDB.delete('treasury_transfers', id) } catch {} }
    for (const id of creados.txs) { try { empDB.delete('treasury_transactions', id) } catch {} }
    for (const id of creados.cuentas) { try { empDB.delete('treasury_accounts', id) } catch {} }
    for (const u of [adminUser, cajeroUser]) { try { empDB.delete('usuarios', u.id) } catch {} }
    if (server) server.close()
  })

  it('GET /tesoreria/cuentas lista cuentas incluyendo bóvedas', async () => {
    const r = await request('GET', '/api/tesoreria/cuentas')
    assert.strictEqual(r.status, 200)
    assert.ok(Array.isArray(r.body))
    assert.ok(r.body.some(c => c.tipo === 'cash'), 'debería haber bóvedas CASH')
    assert.ok(r.body.every(c => c.saldo !== undefined), 'todas con saldo')
  })

  it('crea cuenta, registra ingreso, valida duplicado, anula y desactiva', async () => {
    const hdr = csrfHdr

    const cuenta = await request('POST', '/api/tesoreria/cuentas', { headers: hdr, body: { nombre: 'TEST_BANCO_' + Date.now(), tipo: 'banco', suc_id: '', saldo_inicial: 0 } })
    assert.strictEqual(cuenta.status, 200, cuenta.raw)
    creados.cuentas.push(cuenta.body.id)

    const ing = await request('POST', '/api/tesoreria/transacciones', { headers: hdr, body: { cuenta_id: cuenta.body.id, tipo: 'income', monto: 5000, concepto: 'Ingreso test', ref_tipo: 'test', ref_id: 'r1' } })
    assert.strictEqual(ing.status, 200, ing.raw)
    creados.txs.push(ing.body.id)
    assert.strictEqual(ing.body.saldo_cuenta, 5000)

    const dup = await request('POST', '/api/tesoreria/transacciones', { headers: hdr, body: { cuenta_id: cuenta.body.id, tipo: 'income', monto: 1, concepto: 'Dup', ref_tipo: 'test', ref_id: 'r1' } })
    assert.strictEqual(dup.status, 409, 'duplicado debe dar 409')

    const anul = await request('POST', `/api/tesoreria/transacciones/${ing.body.id}/anular`, { headers: hdr })
    assert.strictEqual(anul.status, 200)
    assert.strictEqual(anul.body.saldo_cuenta, 0)

    const del = await request('DELETE', '/api/tesoreria/cuentas/' + cuenta.body.id, { headers: hdr })
    assert.strictEqual(del.status, 200)
  })

  it('transferencia entre cuentas actualiza saldos y se puede anular', async () => {
    const hdr = csrfHdr

    const a = await request('POST', '/api/tesoreria/cuentas', { headers: hdr, body: { nombre: 'TEST_TRANSF_A_' + Date.now(), tipo: 'banco', suc_id: '', saldo_inicial: 1000 } })
    const b = await request('POST', '/api/tesoreria/cuentas', { headers: hdr, body: { nombre: 'TEST_TRANSF_B_' + Date.now(), tipo: 'billetera', suc_id: '', saldo_inicial: 0 } })
    creados.cuentas.push(a.body.id, b.body.id)

    const tf = await request('POST', '/api/tesoreria/transferencias', { headers: hdr, body: { cuenta_origen: a.body.id, cuenta_destino: b.body.id, monto: 400, concepto: 'Test transfer' } })
    assert.strictEqual(tf.status, 200, tf.raw)
    creados.transfers.push(tf.body.id)
    assert.strictEqual(tf.body.saldo_origen, 600)
    assert.strictEqual(tf.body.saldo_destino, 400)

    const insuf = await request('POST', '/api/tesoreria/transferencias', { headers: hdr, body: { cuenta_origen: a.body.id, cuenta_destino: b.body.id, monto: 99999 } })
    assert.strictEqual(insuf.status, 400, 'saldo insuficiente debe dar 400')

    const anul = await request('POST', `/api/tesoreria/transferencias/${tf.body.id}/anular`, { headers: hdr })
    assert.strictEqual(anul.status, 200)
  })

  it('GET /tesoreria/resumen devuelve totales coherentes', async () => {
    const r = await request('GET', '/api/tesoreria/resumen')
    assert.strictEqual(r.status, 200)
    assert.ok(r.body.total !== undefined)
    assert.ok(Array.isArray(r.body.cuentas))
    assert.ok(r.body.ingresos_mes >= 0 && r.body.egresos_mes >= 0)
  })

  it('cajero recibe 403 en tesorería', async () => {
    const jwt = require('jsonwebtoken')
    const token = jwt.sign({ id: cajeroUser.id, rol: 'cajero', empresa: 'default' }, process.env.JWT_SECRET)
    const r = await request('GET', '/api/tesoreria/cuentas', { headers: { Cookie: `access-token=${token}` } })
    assert.strictEqual(r.status, 403)
  })
})
