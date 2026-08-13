const { describe, it, before, after } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const bcrypt = require('bcryptjs')

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests-only'
const TEST_DATA_DIR = path.join(__dirname, '..', 'data', 'test')
process.env.TENANT_DATA_DIR = TEST_DATA_DIR
process.env.MASTER_PATH = path.join(TEST_DATA_DIR, 'master.db')

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
  const creados = { cuentas: [], txs: [], transfers: [], cajas: [], proveedores: [], provPagos: [], empleados: [], sueldoPagos: [], gastos: [], pendientes: [] }
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
    // Empresa 'default' en master de test (validateTenant exige que exista y esté activa)
    try {
      const { master } = require('../db_master')
      master.prepare("INSERT OR IGNORE INTO empresas (id,codigo,nombre,rubro,activo,creado) VALUES ('emp_test_default','default','Test Default','general',1,?)")
        .run(new Date().toISOString())
    } catch {}

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

    empDB.insert('sucursales', { id: 'utest_suc_1', nombre: 'Suc Test 1', activo: true, creado: now })
    // Bóveda vieja por sucursal (será consolidada por asegurarBovedaCentral)
    empDB.insert('treasury_accounts', {
      id: 'boveda_utest_suc_1', nombre: 'Bóveda Suc Test 1', tipo: 'cash', suc_id: 'utest_suc_1',
      moneda: 'ARS', saldo_inicial: 0, saldo_actual: 0, activo: true, creado: now, notas: '',
    })
    empDB.insert('treasury_transactions', {
      id: 'utest_tx_boveda_vieja', cuenta_id: 'boveda_utest_suc_1', tipo: 'income', monto: 500,
      fecha: new Date().toISOString(), concepto: 'Viejo retiro', ref_tipo: 'retiro_caja', ref_id: 'utest_mov_viejo',
      suc_id: 'utest_suc_1', usuario: 'Test', usuario_id: null, anulado: 0,
    })

    const jwt = require('jsonwebtoken')
    const token = jwt.sign({ id: adminUser.id, rol: 'admin', empresa: 'default' }, process.env.JWT_SECRET)
    cookies = `access-token=${token}; csrf-token=${CSRF_TOKEN}`
  })

  after(async () => {
    const empDB = getEmpresaDB('default')
    for (const id of creados.transfers) { try { empDB.delete('treasury_transfers', id) } catch {} }
    for (const id of creados.txs) { try { empDB.delete('treasury_transactions', id) } catch {} }
    for (const id of creados.pendientes) {
      try {
        for (const m of empDB.where('movimientos_caja', m => m.pendiente_id === id)) empDB.delete('movimientos_caja', m.id)
        for (const i of empDB.where('pendiente_items', i => i.pendiente_id === id)) empDB.delete('pendiente_items', i.id)
        empDB.delete('pendientes', id)
        try { empDB.raw.prepare("DELETE FROM stock_suc WHERE prod_id='prod_test_seña'").run() } catch {}
        try { empDB.raw.prepare("DELETE FROM stock_movimientos WHERE prod_id='prod_test_seña'").run() } catch {}
      } catch {}
    }
    for (const id of creados.sueldoPagos) {
      try {
        const sp = empDB.findOne('sueldo_pagos', id)
        if (sp) {
          empDB.delete('sueldo_pagos', id)
          empDB.raw.prepare("DELETE FROM treasury_transactions WHERE ref_tipo='sueldo_pago' AND ref_id=?").run(String(id))
        }
      } catch {}
    }
    for (const id of creados.gastos) { try { empDB.delete('gastos', id) } catch {} }
    for (const id of creados.empleados) { try { empDB.delete('empleados', id) } catch {} }
    for (const id of creados.provPagos) {
      try {
        empDB.delete('prov_pagos', id)
        empDB.raw.prepare("DELETE FROM treasury_transactions WHERE ref_tipo='prov_pago' AND ref_id=?").run(String(id))
      } catch {}
    }
    for (const id of creados.proveedores) { try { empDB.delete('proveedores', id) } catch {} }
    for (const id of creados.cajas) {
      try {
        for (const m of empDB.where('movimientos_caja', m => m.caja_id === id)) empDB.delete('movimientos_caja', m.id)
        empDB.delete('cajas', id)
      } catch {}
    }
    for (const id of creados.cuentas) { try { empDB.delete('treasury_accounts', id) } catch {} }
    try { empDB.delete('treasury_accounts', 'boveda_utest_suc_1') } catch {}
    try { empDB.delete('treasury_transactions', 'utest_tx_boveda_vieja') } catch {}
    try { empDB.delete('sucursales', 'utest_suc_1') } catch {}
    for (const u of [adminUser, cajeroUser]) { try { empDB.delete('usuarios', u.id) } catch {} }
    if (server) server.close()
  })

  it('GET /tesoreria/cuentas consolida en una sola Bóveda Central', async () => {
    const empDB = getEmpresaDB('default')
    const r = await request('GET', '/api/tesoreria/cuentas')
    assert.strictEqual(r.status, 200)
    assert.ok(Array.isArray(r.body))
    const cash = r.body.filter(c => c.tipo === 'cash')
    assert.strictEqual(cash.length, 1, 'debe existir UNA sola cuenta cash activa')
    assert.strictEqual(cash[0].nombre, 'Bóveda Central')
    assert.strictEqual(cash[0].suc_id, null, 'la Bóveda Central es de empresa, no de sucursal')
    assert.ok(r.body.every(c => c.saldo !== undefined), 'todas con saldo')
    // La bóveda vieja por sucursal quedó consolidada: su tx apunta a la central y quedó inactiva
    const vieja = empDB.findOne('treasury_accounts', 'boveda_utest_suc_1')
    assert.ok(!vieja || vieja.activo === false || vieja.activo === 0, 'la bóveda vieja quedó desactivada')
    const txVieja = empDB.findOne('treasury_transactions', 'utest_tx_boveda_vieja')
    assert.strictEqual(txVieja.cuenta_id, 'boveda_central', 'la tx vieja se reapuntó a la central')
  })

  it('crear sucursal nueva NO crea bóvedas — sigue una sola central', async () => {
    const empDB = getEmpresaDB('default')
    const r = await request('POST', '/api/sucursales', { headers: csrfHdr, body: { nombre: 'TEST_SUC_BOVEDA_' + Date.now() } })
    assert.strictEqual(r.status, 200, r.raw)
    const sucId = r.body.id

    const bovedas = empDB.where('treasury_accounts', a => a.tipo === 'cash' && a.activo !== false)
    assert.strictEqual(bovedas.length, 1, 'no debe crearse bóveda para la sucursal nueva')
    assert.strictEqual(bovedas[0].id, 'boveda_central')

    empDB.softDel('sucursales', sucId)
  })

  it('la Bóveda Central no se puede eliminar ni crear otra cash', async () => {
    const hdr = csrfHdr
    const del = await request('DELETE', '/api/tesoreria/cuentas/boveda_central', { headers: hdr })
    assert.strictEqual(del.status, 400, 'eliminar bóveda central debe dar 400')
    const crea = await request('POST', '/api/tesoreria/cuentas', { headers: hdr, body: { nombre: 'Bóveda 2', tipo: 'cash', suc_id: '' } })
    assert.strictEqual(crea.status, 400, 'crear otra bóveda cash debe dar 400')
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

  it('cierre de caja deposita el saldo real a la Bóveda Central', async () => {
    const empDB = getEmpresaDB('default')
    const suc = empDB.find('sucursales', { activo: true })[0]
    assert.ok(suc, 'necesita una sucursal activa')

    const abrir = await request('POST', '/api/caja/abrir', { headers: csrfHdr, body: { suc_id: suc.id, fondo_inicial: 0 } })
    if (abrir.status !== 200) return // ya había caja abierta hoy — saltar sin tocar datos reales

    creados.cajas.push(abrir.body.id)
    const cerrar = await request('POST', '/api/caja/cerrar', { headers: csrfHdr, body: { suc_id: suc.id, saldo_real: 1500 } })
    assert.strictEqual(cerrar.status, 200, cerrar.raw)
    assert.ok(cerrar.body.deposito_tesoreria, 'debería depositar en tesorería')
    assert.strictEqual(cerrar.body.deposito_tesoreria.monto, 1500)
    creados.transfers.push(cerrar.body.deposito_tesoreria.transferencia_id)

    const { calcSaldo } = require('../lib/treasury')
    const central = empDB.findOne('treasury_accounts', 'boveda_central')
    assert.ok(central && calcSaldo(empDB, central.id) >= 1500, 'la Bóveda Central debería tener el depósito')
  })

  it('retiro de caja ingresa a la Bóveda Central y anular retiro lo revierte', async () => {
    const empDB = getEmpresaDB('default')
    const suc = empDB.find('sucursales', { activo: true })[0]

    const abrir = await request('POST', '/api/caja/abrir', { headers: csrfHdr, body: { suc_id: suc.id, fondo_inicial: 10000 } })
    if (abrir.status !== 200) return // caja ya abierta hoy — saltar
    creados.cajas.push(abrir.body.id)

    const ret = await request('POST', '/api/caja/movimiento', { headers: csrfHdr, body: { suc_id: suc.id, tipo: 'egreso', concepto: 'Retiro test', monto: 300, pago_metodo: 'efectivo' } })
    assert.strictEqual(ret.status, 200, ret.raw)

    const { calcSaldo } = require('../lib/treasury')
    const central = empDB.findOne('treasury_accounts', 'boveda_central')
    const tx = empDB.raw.prepare("SELECT * FROM treasury_transactions WHERE ref_tipo='retiro_caja' AND ref_id IN (SELECT id FROM movimientos_caja WHERE concepto='Retiro test' ORDER BY fecha DESC LIMIT 1)").get()
    assert.ok(tx, 'debe existir ingreso en Bóveda Central por el retiro')
    assert.strictEqual(tx.cuenta_id, 'boveda_central')
    assert.strictEqual(tx.monto, 300)
    assert.ok(calcSaldo(empDB, central.id) >= 300, 'la central recibió el retiro')

    // Anular el movimiento de caja revierte el ingreso
    const mov = empDB.where('movimientos_caja', m => m.concepto === 'Retiro test')[0]
    const delMov = await request('DELETE', '/api/caja/movimiento/' + mov.id, { headers: csrfHdr })
    assert.strictEqual(delMov.status, 200)
    const txAnulada = empDB.findOne('treasury_transactions', tx.id)
    assert.ok(txAnulada.anulado, 'la tx de retiro quedó anulada')
  })

  it('conciliar movimiento banco y validar en reporte', async () => {
    const hdr = csrfHdr
    const cuenta = await request('POST', '/api/tesoreria/cuentas', { headers: hdr, body: { nombre: 'TEST_CONC_' + Date.now(), tipo: 'banco', suc_id: '', saldo_inicial: 0 } })
    assert.strictEqual(cuenta.status, 200, cuenta.raw)
    creados.cuentas.push(cuenta.body.id)

    const ing = await request('POST', '/api/tesoreria/transacciones', { headers: hdr, body: { cuenta_id: cuenta.body.id, tipo: 'income', monto: 900, concepto: 'Ingreso a conciliar' } })
    assert.strictEqual(ing.status, 200, ing.raw)
    creados.txs.push(ing.body.id)

    const conc = await request('POST', `/api/tesoreria/transacciones/${ing.body.id}/conciliar`, { headers: hdr, body: { conciliado: true } })
    assert.strictEqual(conc.status, 200, conc.raw)
    assert.strictEqual(conc.body.conciliado, 1)

    const noConcBoveda = await request('POST', '/api/tesoreria/transacciones', { headers: hdr, body: { cuenta_id: 'boveda_central', tipo: 'income', monto: 10, concepto: 'No conciliable' } })
    if (noConcBoveda.status === 200) {
      creados.txs.push(noConcBoveda.body.id)
      const cB = await request('POST', `/api/tesoreria/transacciones/${noConcBoveda.body.id}/conciliar`, { headers: hdr, body: { conciliado: true } })
      assert.strictEqual(cB.status, 400, 'movimientos de la bóveda no se concilian')
    }

    const hoy = new Date().toISOString().substr(0, 10)
    const rep = await request('GET', `/api/tesoreria/reporte?desde=${hoy}&hasta=${hoy}`, { headers: hdr })
    assert.strictEqual(rep.status, 200, rep.raw)
    assert.ok(Array.isArray(rep.body.filas))
    assert.ok(rep.body.filas.some(f => f.concepto === 'Ingreso a conciliar' && f.conciliado), 'el reporte marca el conciliado')
  })

  it('resumen incluye por_sucursal y retiros del mes', async () => {
    const r = await request('GET', '/api/tesoreria/resumen')
    assert.strictEqual(r.status, 200)
    assert.ok(Array.isArray(r.body.por_sucursal), 'por_sucursal presente')
    assert.ok(typeof r.body.retiros_mes === 'number', 'retiros_mes presente')
    assert.ok(r.body.egresos_mes_anterior >= 0, 'egresos_mes_anterior presente')
  })

  it('pago a proveedor desde tesorería mueve dinero real', async () => {
    const empDB = getEmpresaDB('default')
    const prov = empDB.insert('proveedores', { id: 'prov_test_tes', nombre: 'Prov Test Tesorería', activo: true })
    creados.proveedores.push(prov.id)

    const cuenta = await request('POST', '/api/tesoreria/cuentas', { headers: csrfHdr, body: { nombre: 'TEST_PROV_CTA_' + Date.now(), tipo: 'banco', suc_id: '', saldo_inicial: 10000 } })
    assert.strictEqual(cuenta.status, 200, cuenta.raw)
    creados.cuentas.push(cuenta.body.id)

    const pago = await request('POST', `/api/proveedores/${prov.id}/pagos`, { headers: csrfHdr, body: { monto: 2500, concepto: 'Pago test', metodo: 'transferencia', fuente: 'tesoreria', cuenta_id: cuenta.body.id } })
    assert.strictEqual(pago.status, 200, pago.raw)
    creados.provPagos.push(pago.body.id)

    const tx = empDB.raw.prepare("SELECT * FROM treasury_transactions WHERE ref_tipo='prov_pago' AND ref_id=? AND anulado=0").get(String(pago.body.id))
    assert.ok(tx, 'debe existir movimiento de tesorería con ref prov_pago')
    assert.strictEqual(tx.tipo, 'expense')
    assert.strictEqual(tx.monto, 2500)

    const { calcSaldo } = require('../lib/treasury')
    assert.strictEqual(calcSaldo(empDB, cuenta.body.id), 7500)
  })

  it('pago de sueldo crea gasto Sueldos y mueve dinero', async () => {
    const empDB = getEmpresaDB('default')
    const emp = empDB.insert('empleados', { id: 'emp_test_tes', nombre: 'Test', apellido: 'Empleado', salario: 80000, activo: true })
    creados.empleados.push(emp.id)

    const cuenta = await request('POST', '/api/tesoreria/cuentas', { headers: csrfHdr, body: { nombre: 'TEST_SUELDO_CTA_' + Date.now(), tipo: 'banco', suc_id: '', saldo_inicial: 100000 } })
    assert.strictEqual(cuenta.status, 200, cuenta.raw)
    creados.cuentas.push(cuenta.body.id)

    const pago = await request('POST', '/api/rrhh/sueldos/pagar', { headers: csrfHdr, body: { empleado_id: emp.id, monto: 80000, fuente: 'tesoreria', cuenta_id: cuenta.body.id, metodo: 'transferencia' } })
    assert.strictEqual(pago.status, 200, pago.raw)
    creados.sueldoPagos.push(pago.body.id)
    creados.gastos.push(pago.body.gasto_id)

    const gasto = empDB.findOne('gastos', pago.body.gasto_id)
    assert.ok(gasto, 'debe existir el gasto')
    assert.strictEqual(gasto.categoria_nombre, 'Sueldos')

    const tx = empDB.raw.prepare("SELECT * FROM treasury_transactions WHERE ref_tipo='sueldo_pago' AND ref_id=?").get(String(pago.body.id))
    assert.ok(tx && tx.tipo === 'expense', 'debe existir egreso con ref sueldo_pago')
  })

  it('seña de pendiente se registra como ingreso en caja', async () => {
    const empDB = getEmpresaDB('default')
    const suc = empDB.find('sucursales', { activo: true })[0]

    const abrir = await request('POST', '/api/caja/abrir', { headers: csrfHdr, body: { suc_id: suc.id, fondo_inicial: 0 } })
    if (abrir.status !== 200) return // ya había caja abierta hoy — saltar
    creados.cajas.push(abrir.body.id)

    const pend = await request('POST', '/api/pendientes', { headers: csrfHdr, body: { suc_id: suc.id, suc_cobro: suc.id, items: [{ prod_id: 'prod_test_seña', nombre: 'Producto test seña', cantidad: 1, precio: 1000, subtotal: 1000 }], total: 1000, sena: 300, cliente_id: null } })
    assert.strictEqual(pend.status, 200, pend.raw)
    creados.pendientes.push(pend.body.id)

    const mov = empDB.where('movimientos_caja', m => m.pendiente_id === pend.body.id && !m.anulado)[0]
    assert.ok(mov, 'debe existir ingreso en caja por la seña')
    assert.strictEqual(mov.tipo, 'ingreso')
    assert.strictEqual(mov.monto, 300)
  })
})
