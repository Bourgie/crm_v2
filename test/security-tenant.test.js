// ══════════════════════════════════════════════════════════════
// Tests de seguridad: aislamiento multi-tenant, sucursal,
// borrado a cero, passwords, lockout y revocación superadmin.
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
process.env.JWT_SECRET = 'test-jwt-secret-for-security-tests-only'
process.env.SA_SECRET = 'test-sa-secret-for-security-tests-only'

const jwt = require('jsonwebtoken')
const { getEmpresaDB, _dbCache } = require('../db_sqlite')
const { master, createEmpresa } = require('../db_master')

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

function signSaToken(saId, tokenVersion) {
  return jwt.sign(
    { id: saId, usuario: 'sa_sec_test', nombre: 'SA Sec', role: 'superadmin', token_version: tokenVersion },
    process.env.SA_SECRET, { expiresIn: '1h' }
  )
}

describe('Security: aislamiento y borrado a cero', () => {
  let empresaA, empresaB, empresaDel, empresaFail
  let userAAdmin, userAVend1, userBAdmin
  let saId, saToken
  const PASS = 'Test1234!'

  before(async () => {
    // ── Empresas y datos ──
    empresaA = createEmpresa({ codigo: 'seca', nombre: 'Sec A', plan_id: null, admin_email: 'a@sec.test' })
    empresaB = createEmpresa({ codigo: 'secb', nombre: 'Sec B', plan_id: null, admin_email: 'b@sec.test' })
    empresaDel = createEmpresa({ codigo: 'secdel', nombre: 'Sec Del', plan_id: null, admin_email: 'del@sec.test' })
    empresaFail = createEmpresa({ codigo: 'secfail', nombre: 'Sec Fail', plan_id: null, admin_email: 'fail@sec.test' })

    const dbA = getEmpresaDB('seca')
    const dbB = getEmpresaDB('secb')
    const dbDel = getEmpresaDB('secdel')
    const now = new Date().toISOString()
    const hash = bcrypt.hashSync(PASS, 10)

    dbA.insert('sucursales', { id: 's1', nombre: 'Suc 1', activo: true })
    dbA.insert('sucursales', { id: 's2', nombre: 'Suc 2', activo: true })
    userAAdmin = dbA.insert('usuarios', {
      id: 'ua_admin', nombre: 'Admin A', usuario: 'admin_a', email: 'admin_a@sec.test',
      password: hash, rol: 'admin', roles: ['admin'], suc_sesiones_permitidas: [], activo: true,
      creado: now, must_change_password: 0, email_verificado: 1, password_changed_at: now,
    })
    userAVend1 = dbA.insert('usuarios', {
      id: 'ua_vend1', nombre: 'Vend Uno', usuario: 'vend_uno', email: 'vend_uno@sec.test',
      password: hash, rol: 'vendedor', roles: ['vendedor'], suc_id: 's1', suc_sesiones_permitidas: ['s1'], activo: true,
      creado: now, must_change_password: 0, email_verificado: 1, password_changed_at: now,
    })
    dbA.insert('vendedores', { id: 'vd1', nombre: 'Vend', apellido: 'Uno', rol: 'vendedor', suc_id: 's1', usuario_id: 'ua_vend1', comision: 5, activo: true })

    userBAdmin = dbB.insert('usuarios', {
      id: 'ub_admin', nombre: 'Admin B', usuario: 'admin_b', email: 'admin_b@sec.test',
      password: hash, rol: 'admin', roles: ['admin'], suc_sesiones_permitidas: [], activo: true,
      creado: now, must_change_password: 0, email_verificado: 1, password_changed_at: now,
    })
    dbB.insert('sucursales', { id: 'sb1', nombre: 'Suc B', activo: true })

    // Ventas: s1 = 1000, s2 = 5000 (empresa A) · sb1 = 999999 (empresa B)
    const hoy = new Date().toISOString().substr(0, 10)
    dbA.insert('ventas', { id: 'va1', numero: 1, fecha: hoy + 'T10:00:00.000Z', suc_id: 's1', vend_id: 'vd1', subtotal: 1000, total: 1000, pago: 'efectivo', comprobante: 'ticket', anulada: 0 })
    dbA.insert('ventas', { id: 'va2', numero: 2, fecha: hoy + 'T11:00:00.000Z', suc_id: 's2', subtotal: 5000, total: 5000, pago: 'efectivo', comprobante: 'ticket', anulada: 0 })
    dbA.insert('gastos', { id: 'ga1', nombre: 'Gasto s2', monto: 500, fecha: hoy + 'T12:00:00.000Z', suc_id: 's2', estado: 'pagado' })
    dbB.insert('ventas', { id: 'vb1', numero: 3, fecha: hoy + 'T10:00:00.000Z', suc_id: 'sb1', subtotal: 999999, total: 999999, pago: 'efectivo', comprobante: 'ticket', anulada: 0 })

    dbDel.insert('sucursales', { id: 'sd1', nombre: 'Suc Del', activo: true })
    dbDel.insert('clientes', { id: 'cd1', nombre: 'Cli', apellido: 'Del', dni: '99999991', activo: true, creado: now })
    // filas huérfanas en master para la empresa a eliminar
    master.prepare("INSERT INTO empresa_notas (id,empresa_id,texto,autor,fecha) VALUES ('n1',?,'nota','sa',?)").run(empresaDel, now)

    // ── Superadmin de test ──
    saId = 'sa_security_test'
    master.prepare("DELETE FROM superadmin WHERE id=?").run(saId)
    master.prepare("INSERT INTO superadmin (id,usuario,password,nombre,email,activo,must_change_password) VALUES (?,?,?,?,?,1,0)")
      .run(saId, 'sa_sec_test', bcrypt.hashSync('sa-sec-pass-123', 10), 'SA Sec', 'sa_sec@test.com')
    saToken = signSaToken(saId, 0)

    await new Promise((resolve, reject) => {
      server = require('../server').listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`
        resolve()
      })
    })
  })

  after(() => { if (server) server.close() })

  // ── Passwords ──────────────────────────────────────────────
  describe('Passwords', () => {
    it('los passwords se guardan con bcrypt (nunca plaintext)', () => {
      const dbA = getEmpresaDB('seca')
      const u = dbA.findOne('usuarios', 'ua_admin')
      assert.ok(u.password.startsWith('$2a$') || u.password.startsWith('$2b$'), 'hash bcrypt esperado')
      assert.ok(!u.password.includes(PASS), 'no debe contener la contraseña en claro')
    })

    it('login con usuario inexistente devuelve 401 genérico (sin enumerar usuarios)', async () => {
      const r = await request('POST', '/api/auth/login', {
        body: { usuario: 'no_existe_user', password: 'cualquiera1', empresa: 'seca' },
      })
      assert.ok([401, 429].includes(r.status))
      if (r.status === 401) assert.ok(r.body.error.includes('incorrectos'))
    })
  })

  // ── Multi-tenant ───────────────────────────────────────────
  describe('Aislamiento por empresa', () => {
    it('login de usuario de A contra empresa B falla', async () => {
      const r = await request('POST', '/api/auth/login', {
        body: { usuario: 'admin_a', password: PASS, empresa: 'secb' },
      })
      assert.ok([401, 429].includes(r.status))
    })

    it('token de A no ve ventas de B (ni de ninguna otra empresa)', async () => {
      const r = await request('GET', '/api/dashboard', {
        headers: { Authorization: `Bearer ${signUserToken('ua_admin', 'admin', 'seca')}` },
      })
      assert.strictEqual(r.status, 200)
      const vMes = r.body.kpis.ventas_mes
      assert.ok(vMes.t < 999999, 'no debe incluir ventas de la empresa B')
      assert.ok(vMes.t >= 1000, 'debe incluir ventas de su empresa')
    })
  })

  // ── Sucursal ───────────────────────────────────────────────
  describe('Aislamiento por sucursal', () => {
    it('vendedor de s1 pidiendo suc_id=s2 recibe 403', async () => {
      const r = await request('GET', '/api/dashboard?suc_id=s2', {
        headers: { Authorization: `Bearer ${signUserToken('ua_vend1', 'vendedor', 'seca')}` },
      })
      assert.strictEqual(r.status, 403)
    })

    it('vendedor sin suc_id solo ve sus sucursales (no las de otros)', async () => {
      const r = await request('GET', '/api/dashboard', {
        headers: { Authorization: `Bearer ${signUserToken('ua_vend1', 'vendedor', 'seca')}` },
      })
      assert.strictEqual(r.status, 200)
      const vMes = r.body.kpis.ventas_mes
      assert.strictEqual(vMes.t, 1000, 'solo la venta de s1 (1000), no la de s2 (5000)')
      const gastos = r.body.kpis.gastos_mes
      assert.strictEqual(gastos.t, 0, 'no debe ver gastos de s2')
    })

    it('vendedor de s1 pidiendo suc_id=s1 (propia) funciona', async () => {
      const r = await request('GET', '/api/dashboard?suc_id=s1', {
        headers: { Authorization: `Bearer ${signUserToken('ua_vend1', 'vendedor', 'seca')}` },
      })
      assert.strictEqual(r.status, 200)
      assert.strictEqual(r.body.kpis.ventas_mes.t, 1000)
    })

    it('admin ve todas las sucursales', async () => {
      const r = await request('GET', '/api/dashboard', {
        headers: { Authorization: `Bearer ${signUserToken('ua_admin', 'admin', 'seca')}` },
      })
      assert.strictEqual(r.status, 200)
      assert.strictEqual(r.body.kpis.ventas_mes.t, 6000, 'admin ve s1+s2')
    })
  })

  // ── Endpoints públicos ─────────────────────────────────────
  describe('Endpoints públicos sin creación de archivos', () => {
    it('GET /api/config/public con empresa inexistente no crea archivo', async () => {
      const codigo = 'nonexist_sec_xyz'
      const r = await request('GET', '/api/config/public?empresa=' + codigo)
      assert.strictEqual(r.status, 200)
      assert.ok(!fs.existsSync(path.join(TEST_DATA_DIR, 'empresa_' + codigo + '.db')), 'no debe crear empresa_<codigo>.db')
    })

    it('getEmpresaDB rechaza códigos maliciosos', () => {
      assert.throws(() => getEmpresaDB('../../evil'), /inválido/)
      assert.throws(() => getEmpresaDB('a-b!'), /inválido/)
    })

    it('getEmpresaDB existingOnly devuelve null si no existe', () => {
      assert.strictEqual(getEmpresaDB('noexiste', { existingOnly: true }), null)
    })
  })

  // ── Borrado a cero ─────────────────────────────────────────
  describe('Borrado a cero de empresa', () => {
    it('DELETE con backup deja cero residuos y respalda solo esa empresa', async () => {
      const r = await request('DELETE', '/api/superadmin/empresas/' + empresaDel + '?hacer_backup=true', {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      assert.strictEqual(r.status, 200, r.raw)
      assert.ok(r.body.backup, 'debe devolver nombre de backup')
      assert.ok(r.body.backup.startsWith('empresa_secdel-'), 'backup por empresa, no global')

      // sin fila en master
      assert.strictEqual(master.prepare("SELECT id FROM empresas WHERE codigo='secdel'").get(), undefined)
      // sin archivos en disco
      for (const suf of ['.db', '.db-wal', '.db-shm']) {
        assert.ok(!fs.existsSync(path.join(TEST_DATA_DIR, 'empresa_secdel' + suf)), 'archivo ' + suf + ' debe desaparecer')
      }
      // sin cache
      assert.strictEqual(_dbCache['secdel'], undefined)
      // filas huérfanas master purgadas
      assert.strictEqual(master.prepare("SELECT id FROM empresa_notas WHERE empresa_id=?").get(empresaDel), undefined)
      // backup existe y contiene los datos de la empresa
      const backupPath = path.join(TEST_DATA_DIR, 'backups', r.body.backup)
      assert.ok(fs.existsSync(backupPath), 'backup existe en disco')
      const { DatabaseSync } = require('node:sqlite')
      const bdb = new DatabaseSync(backupPath, { readOnly: true })
      const n = bdb.prepare("SELECT COUNT(*) as n FROM sucursales").get().n
      assert.ok(n >= 1, 'backup contiene datos del tenant')
      bdb.close()

      // segundo DELETE devuelve 404
      const r2 = await request('DELETE', '/api/superadmin/empresas/' + empresaDel, {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      assert.strictEqual(r2.status, 404)
    })

    it('DELETE con backup fallido NO elimina la empresa (fail-safe)', async () => {
      // empresa sin archivo de DB → makeEmpresaBackup falla
      const r = await request('DELETE', '/api/superadmin/empresas/' + empresaFail + '?hacer_backup=true', {
        headers: { Authorization: `Bearer ${saToken}` },
      })
      assert.strictEqual(r.status, 500)
      assert.ok(r.body.error.includes('NO fue eliminada'))
      assert.ok(master.prepare("SELECT id FROM empresas WHERE codigo='secfail'").get(), 'la empresa sigue en master')
    })

    it('la empresa default NO se auto-recrea al recargar db_master (regresión auto-seed)', () => {
      // Eliminar cualquier default existente y recargar el módulo db_master
      master.prepare("DELETE FROM empresas WHERE codigo='default'").run()
      const dbMasterPath = require.resolve('../db_master')
      delete require.cache[dbMasterPath]
      const fresh = require('../db_master')
      assert.strictEqual(fresh.master.prepare("SELECT id FROM empresas WHERE codigo='default'").get(), undefined,
        'emp_default no debe volver a crearse')
      fresh.master.close()
      delete require.cache[dbMasterPath]
      require('../db_master')
    })
  })

  // ── Superadmin: revocación y lockout ───────────────────────
  describe('Superadmin: revocación y lockout', () => {
    it('token firmado con token_version viejo es rechazado tras rotación', async () => {
      const oldToken = signSaToken(saId, 0)
      // rotar versión
      master.prepare("UPDATE superadmin SET token_version = 1 WHERE id=?").run(saId)
      const rOld = await request('GET', '/api/superadmin/stats', { headers: { Authorization: `Bearer ${oldToken}` } })
      assert.strictEqual(rOld.status, 401, 'token viejo debe ser rechazado')
      const newToken = signSaToken(saId, 1)
      const rNew = await request('GET', '/api/superadmin/stats', { headers: { Authorization: `Bearer ${newToken}` } })
      assert.strictEqual(rNew.status, 200)
      master.prepare("UPDATE superadmin SET token_version = 0 WHERE id=?").run(saId)
    })

    it('5 fallos de login superadmin bloquean al usuario (lockout persistente)', async () => {
      const key = 'sa_lockout_test'
      master.prepare("DELETE FROM sa_login_attempts WHERE key=?").run(key)
      let last
      for (let i = 0; i < 5; i++) {
        last = await request('POST', '/api/superadmin/login', {
          body: { usuario: key, password: 'wrong-pass-1' },
        })
        assert.ok([401, 429].includes(last.status), 'intento ' + (i + 1) + ': ' + last.status)
      }
      const row = master.prepare("SELECT * FROM sa_login_attempts WHERE key=?").get(key)
      assert.ok(row && row.locked_until, 'debe quedar registrado el lockout')
      assert.strictEqual(row.count, 5)
      const sixth = await request('POST', '/api/superadmin/login', {
        body: { usuario: key, password: 'wrong-pass-1' },
      })
      assert.strictEqual(sixth.status, 429, 'usuario bloqueado')
      master.prepare("DELETE FROM sa_login_attempts WHERE key=?").run(key)
    })
  })
})
