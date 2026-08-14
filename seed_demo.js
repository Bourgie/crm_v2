/**
 * FlexCRM — Script de datos de prueba
 * Crea empresa "demo" con sucursales, usuarios, productos, clientes y ventas de prueba
 * 
 * Uso: node seed_demo.js
 */

const path = require('path')
const bcrypt = require('bcryptjs')
const { master, createEmpresa, getEmpresa } = require('./db_master')
const { createDB, getEmpresaDB } = require('./db_sqlite')

// ── Helpers ──────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).substr(2, 14) + Date.now().toString(36) }
function now() { return new Date().toISOString() }
function hace(dias) { const d = new Date(); d.setDate(d.getDate() - dias); return d.toISOString() }

const EMPRESA_CODIGO = 'demo'
const EMPRESA_NOMBRE = 'Demo Ropa S.R.L.'

// ── 1. Crear empresa en master.db si no existe ────────────────────
console.log('\n🏢 Configurando empresa demo...')

let empresaId
const existing = master.prepare('SELECT id FROM empresas WHERE codigo = ?').get(EMPRESA_CODIGO)
if (existing) {
  empresaId = existing.id
  console.log(`  ↳ Empresa ya existe (${empresaId}) — actualizando datos de prueba`)
} else {
  // Get first plan or create without plan
  const plan = master.prepare('SELECT id FROM planes ORDER BY precio ASC LIMIT 1').get()
  empresaId = createEmpresa({
    codigo: EMPRESA_CODIGO,
    nombre: EMPRESA_NOMBRE,
    rubro: 'indumentaria',
    plan_id: plan?.id || null,
    admin_email: 'demo@flexcrm.app',
    vencimiento: new Date(Date.now() + 90 * 86400000).toISOString().substr(0, 10),
    usuarios_max: 10,
    sucursales_max: 3,
  })
  console.log(`  ✓ Empresa creada (${empresaId})`)
}

// ── 2. Obtener/crear DB de la empresa ────────────────────────────
const db = getEmpresaDB(EMPRESA_CODIGO)
console.log('\n🗄️  Base de datos de empresa lista')

// Helper para insertar ignorando duplicados
function rawInsert(table, obj) {
  const keys = Object.keys(obj)
  const placeholders = keys.map(() => '?').join(',')
  const sql = `INSERT OR REPLACE INTO \`${table}\` (${keys.join(',')}) VALUES (${placeholders})`
  db.raw.prepare(sql).run(...Object.values(obj))
}
function upsertById(table, obj) {
  // Tables with 'data' column use db.insert; others use raw SQL
  const NO_DATA_TABLES = ['stock_suc','config','ctacte_saldos']
  if (NO_DATA_TABLES.includes(table)) {
    rawInsert(table, obj)
  } else {
    db.insert(table, obj)
  }
}

// ── 3. Sucursales ────────────────────────────────────────────────
console.log('\n🏪 Creando sucursales...')
const SUC1_ID = 'suc_demo_centro'
const SUC2_ID = 'suc_demo_norte'

const sucursales = [
  { id: SUC1_ID, nombre: 'Centro', dir: 'San Martín 145', ciudad: 'Catamarca', tel: '383-4500001', responsable: 'Admin Demo', activo: 1, data: '{}' },
  { id: SUC2_ID, nombre: 'Norte', dir: 'Avenida Guemes 800', ciudad: 'Catamarca', tel: '383-4500002', responsable: 'Supervisor Demo', activo: 1, data: '{}' },
]
sucursales.forEach(s => { upsertById('sucursales', s); console.log(`  ✓ ${s.nombre}`) })

// ── 4. Usuarios ──────────────────────────────────────────────────
console.log('\n👤 Creando usuarios...')
// Fail-fast en producción: el demo nunca debe sembrarse con claves por defecto
if (!process.env.SEED_DEMO_PASSWORD && process.env.NODE_ENV === 'production') {
  throw new Error('SEED_DEMO_PASSWORD no configurada. El seed demo está prohibido en producción sin esta variable.')
}
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'demo123'
const PASS_HASH = bcrypt.hashSync(DEMO_PASSWORD, 10)

const usuarios = [
  {
    id: 'usr_demo_admin', nombre: 'Admin Demo', usuario: 'admin',
    email: 'admin@demo.com', password: PASS_HASH,
    rol: 'admin', roles: JSON.stringify(['admin']),
    suc_id: SUC1_ID, suc_sesiones_permitidas: JSON.stringify([]),
    activo: 1, creado: now(), must_change_password: 1, data: '{}'
  },
  {
    id: 'usr_demo_caja1', nombre: 'María Cajera', usuario: 'cajera',
    email: 'cajera@demo.com', password: PASS_HASH,
    rol: 'cajero', roles: JSON.stringify(['cajero']),
    suc_id: SUC1_ID, suc_sesiones_permitidas: JSON.stringify([SUC1_ID]),
    activo: 1, creado: now(), must_change_password: 1, data: '{}'
  },
  {
    id: 'usr_demo_vend1', nombre: 'Juan Vendedor', usuario: 'vendedor',
    email: 'vendedor@demo.com', password: PASS_HASH,
    rol: 'vendedor', roles: JSON.stringify(['vendedor']),
    suc_id: SUC1_ID, suc_sesiones_permitidas: JSON.stringify([SUC1_ID, SUC2_ID]),
    activo: 1, creado: now(), must_change_password: 1, data: '{}'
  },
  {
    id: 'usr_demo_sup1', nombre: 'Laura Supervisora', usuario: 'supervisor',
    email: 'supervisor@demo.com', password: PASS_HASH,
    rol: 'supervisor', roles: JSON.stringify(['supervisor', 'cajero']),
    suc_id: SUC2_ID, suc_sesiones_permitidas: JSON.stringify([]),
    activo: 1, creado: now(), must_change_password: 1, data: '{}'
  },
]
usuarios.forEach(u => { upsertById('usuarios', u); console.log(`  ✓ ${u.nombre} (${u.usuario})`) })

// ── 5. Productos ─────────────────────────────────────────────────
console.log('\n👕 Creando productos...')
const productos = [
  { id: 'prod_demo_01', nombre: 'Remera Básica', sku: 'REM-BAS-M', categoria: 'Remera', talle: 'M', color: 'Blanco', costo: 2500, precio_l1: 5500, precio_l2: 4800, precio_l3: 4200, stock_min: 3, stock_max: 30, favorito: 1, activo: 1, data: '{}' },
  { id: 'prod_demo_02', nombre: 'Remera Básica', sku: 'REM-BAS-L', categoria: 'Remera', talle: 'L', color: 'Blanco', costo: 2500, precio_l1: 5500, precio_l2: 4800, precio_l3: 4200, stock_min: 3, stock_max: 30, favorito: 1, activo: 1, data: '{}' },
  { id: 'prod_demo_03', nombre: 'Jean Slim', sku: 'JEA-SLM-38', categoria: 'Pantalón', talle: '38', color: 'Azul', costo: 8000, precio_l1: 18500, precio_l2: 16000, precio_l3: 14000, stock_min: 2, stock_max: 15, favorito: 1, activo: 1, data: '{}' },
  { id: 'prod_demo_04', nombre: 'Jean Slim', sku: 'JEA-SLM-40', categoria: 'Pantalón', talle: '40', color: 'Azul', costo: 8000, precio_l1: 18500, precio_l2: 16000, precio_l3: 14000, stock_min: 2, stock_max: 15, favorito: 0, activo: 1, data: '{}' },
  { id: 'prod_demo_05', nombre: 'Campera Inflable', sku: 'CAM-INF-S', categoria: 'Campera', talle: 'S', color: 'Negro', costo: 15000, precio_l1: 35000, precio_l2: 31000, precio_l3: 28000, stock_min: 2, stock_max: 10, favorito: 1, activo: 1, data: '{}' },
  { id: 'prod_demo_06', nombre: 'Vestido Floral', sku: 'VES-FLO-M', categoria: 'Vestido', talle: 'M', color: 'Multicolor', costo: 9000, precio_l1: 21000, precio_l2: 18500, precio_l3: 16000, stock_min: 1, stock_max: 8, favorito: 0, activo: 1, data: '{}' },
  { id: 'prod_demo_07', nombre: 'Calza Deportiva', sku: 'CAL-DEP-L', categoria: 'Calza', talle: 'L', color: 'Gris', costo: 4500, precio_l1: 9800, precio_l2: 8500, precio_l3: 7500, stock_min: 3, stock_max: 20, favorito: 0, activo: 1, data: '{}' },
]
productos.forEach(p => {
  upsertById('productos', p)
  console.log(`  ✓ ${p.nombre} T:${p.talle} — $${p.precio_l1.toLocaleString('es-AR')}`)
})

// ── Stock por sucursal ───────────────────────────────────────────
const stockData = [
  // [prod_id, suc_id, cantidad]
  ['prod_demo_01', SUC1_ID, 12], ['prod_demo_01', SUC2_ID, 8],
  ['prod_demo_02', SUC1_ID, 7],  ['prod_demo_02', SUC2_ID, 5],
  ['prod_demo_03', SUC1_ID, 6],  ['prod_demo_03', SUC2_ID, 4],
  ['prod_demo_04', SUC1_ID, 3],  ['prod_demo_04', SUC2_ID, 2],
  ['prod_demo_05', SUC1_ID, 4],  ['prod_demo_05', SUC2_ID, 3],
  ['prod_demo_06', SUC1_ID, 3],  ['prod_demo_06', SUC2_ID, 1],
  ['prod_demo_07', SUC1_ID, 8],  ['prod_demo_07', SUC2_ID, 6],
]
stockData.forEach(([prod_id, suc_id, cantidad]) => {
  upsertById('stock_suc', {prod_id, suc_id, cantidad})
})
console.log('  ✓ Stock cargado en ambas sucursales')

// ── 6. Clientes ──────────────────────────────────────────────────
console.log('\n👥 Creando clientes...')
const CLI1_ID = 'cli_demo_01'
const CLI2_ID = 'cli_demo_02'
const CLI3_ID = 'cli_demo_03'

const clientes = [
  { id: CLI1_ID, nombre: 'Ana', apellido: 'García', tel: '383-4123456', email: 'ana@mail.com', dni: '28.456.789', lista: 1, limite_credito: 50000, puntos: 150, es_ctacte: 1, suc_origen: SUC1_ID, activo: 1, creado: hace(30), data: '{}' },
  { id: CLI2_ID, nombre: 'Carlos', apellido: 'López', tel: '383-4234567', email: 'carlos@mail.com', dni: '32.789.012', lista: 2, limite_credito: 0, puntos: 80, es_ctacte: 0, suc_origen: SUC1_ID, activo: 1, creado: hace(60), data: '{}' },
  { id: CLI3_ID, nombre: 'María', apellido: 'Rodríguez', tel: '383-4345678', email: 'maria@mail.com', dni: '35.123.456', lista: 3, limite_credito: 100000, puntos: 320, es_ctacte: 1, suc_origen: SUC2_ID, activo: 1, creado: hace(90), data: '{}' },
  { id: 'cli_demo_04', nombre: 'Diego', apellido: 'Fernández', tel: '383-4456789', email: '', dni: '', lista: 1, limite_credito: 0, puntos: 45, es_ctacte: 0, suc_origen: SUC1_ID, activo: 1, creado: hace(15), data: '{}' },
  { id: 'cli_demo_05', nombre: 'Lucía', apellido: 'Martínez', tel: '383-4567890', email: 'lucia@mail.com', dni: '29.876.543', lista: 1, limite_credito: 30000, puntos: 210, es_ctacte: 1, suc_origen: SUC2_ID, activo: 1, creado: hace(45), data: '{}' },
]
clientes.forEach(c => { upsertById('clientes', c); console.log(`  ✓ ${c.nombre} ${c.apellido} (Lista ${c.lista}${c.es_ctacte ? ' · Cta.Cte.' : ''})`) })

// ── 7. Ventas históricas ─────────────────────────────────────────
console.log('\n📋 Creando ventas históricas...')

function crearVenta(data) {
  const id = 'vta_' + uid()
  const numero = Math.floor(Math.random() * 9000) + 1000
  upsertById('ventas', {
    id,
    numero,
    suc_id: data.suc_id,
    cliente_id: data.cli_id || null,
    cli_nombre: data.cli_nombre || 'Consumidor final',
    usuario_id: data.usr_id || 'usr_demo_vend1',
    subtotal: data.total,
    descuento: 0,
    total: data.total,
    pago: data.pago || 'efectivo',
    comprobante: 'ticket',
    cobrada: 1,
    anulada: 0,
    fecha: data.fecha,
    data: '{}',
  })
  data.items.forEach(it => {
    upsertById('venta_items', {
      id: 'vti_' + uid(),
      venta_id: id,
      prod_id: it.prod_id,
      nombre: it.nombre,
      talle: it.talle || '',
      precio: it.precio,
      cantidad: it.cantidad,
      subtotal: it.precio * it.cantidad,
      costo: it.costo || 0,
      data: '{}',
    })
  })
  return id
}

// Ventas de los últimos 30 días
const ventasData = [
  { suc_id: SUC1_ID, cli_id: CLI1_ID, cli_nombre: 'Ana García', pago: 'efectivo', fecha: hace(28), total: 11000, items: [{ prod_id: 'prod_demo_01', nombre: 'Remera Básica', talle: 'M', precio: 5500, cantidad: 2, costo: 2500 }] },
  { suc_id: SUC1_ID, cli_id: CLI2_ID, cli_nombre: 'Carlos López', pago: 'debito', fecha: hace(25), total: 18500, items: [{ prod_id: 'prod_demo_03', nombre: 'Jean Slim', talle: '38', precio: 18500, cantidad: 1, costo: 8000 }] },
  { suc_id: SUC2_ID, cli_id: CLI3_ID, cli_nombre: 'María Rodríguez', pago: 'credito', fecha: hace(20), total: 35000, items: [{ prod_id: 'prod_demo_05', nombre: 'Campera Inflable', talle: 'S', precio: 35000, cantidad: 1, costo: 15000 }] },
  { suc_id: SUC1_ID, pago: 'efectivo', fecha: hace(18), total: 5500, items: [{ prod_id: 'prod_demo_01', nombre: 'Remera Básica', talle: 'L', precio: 5500, cantidad: 1, costo: 2500 }] },
  { suc_id: SUC1_ID, cli_id: CLI1_ID, cli_nombre: 'Ana García', pago: 'ctacte', fecha: hace(15), total: 21000, items: [{ prod_id: 'prod_demo_06', nombre: 'Vestido Floral', talle: 'M', precio: 21000, cantidad: 1, costo: 9000 }] },
  { suc_id: SUC2_ID, pago: 'transferencia', fecha: hace(12), total: 27500, items: [{ prod_id: 'prod_demo_03', nombre: 'Jean Slim', talle: '40', precio: 18500, cantidad: 1, costo: 8000 }, { prod_id: 'prod_demo_07', nombre: 'Calza Deportiva', talle: 'L', precio: 9800, cantidad: 1, costo: 4500 }] },
  { suc_id: SUC1_ID, cli_id: CLI2_ID, cli_nombre: 'Carlos López', pago: 'efectivo', fecha: hace(8), total: 9800, items: [{ prod_id: 'prod_demo_07', nombre: 'Calza Deportiva', talle: 'L', precio: 9800, cantidad: 1, costo: 4500 }] },
  { suc_id: SUC1_ID, pago: 'qr', fecha: hace(5), total: 11000, items: [{ prod_id: 'prod_demo_01', nombre: 'Remera Básica', talle: 'M', precio: 5500, cantidad: 2, costo: 2500 }] },
  { suc_id: SUC2_ID, cli_id: CLI3_ID, cli_nombre: 'María Rodríguez', pago: 'efectivo', fecha: hace(3), total: 18500, items: [{ prod_id: 'prod_demo_03', nombre: 'Jean Slim', talle: '38', precio: 18500, cantidad: 1, costo: 8000 }] },
  { suc_id: SUC1_ID, pago: 'debito', fecha: hace(1), total: 42000, items: [{ prod_id: 'prod_demo_05', nombre: 'Campera Inflable', talle: 'S', precio: 35000, cantidad: 1, costo: 15000 }, { prod_id: 'prod_demo_04', nombre: 'Jean Slim', talle: '40', precio: 18500, cantidad: 0.38, costo: 0 }] },
  // Hoy
  { suc_id: SUC1_ID, cli_id: CLI1_ID, cli_nombre: 'Ana García', pago: 'efectivo', fecha: now(), total: 5500, items: [{ prod_id: 'prod_demo_02', nombre: 'Remera Básica', talle: 'L', precio: 5500, cantidad: 1, costo: 2500 }] },
  { suc_id: SUC1_ID, pago: 'pendiente_cobro', fecha: now(), total: 35000, cobrada: 0, items: [{ prod_id: 'prod_demo_05', nombre: 'Campera Inflable', talle: 'S', precio: 35000, cantidad: 1, costo: 15000 }] },
]

// Override cobrada for pending
ventasData.forEach(vd => {
  const id = crearVenta(vd)
  if (vd.cobrada === 0) {
    try { db.raw.prepare('UPDATE ventas SET cobrada=0 WHERE id=?').run(id) } catch(e){}
  }
})
console.log(`  ✓ ${ventasData.length} ventas creadas (incluyendo 1 pendiente de cobro de hoy)`)

// ── 8. Cuenta corriente ──────────────────────────────────────────
console.log('\n📒 Configurando cuentas corrientes...')
// Ana García debe $21.000 (la venta ctacte de hace 15 días)
try { upsertById('ctacte_saldos', {cliente_id: CLI1_ID, saldo: 21000, ultima_act: now()}) } catch(e) { /* table may not exist */ }
try { upsertById('ctacte_saldos', {cliente_id: CLI3_ID, saldo: 0, ultima_act: now()}) } catch(e) {}
try { upsertById('ctacte_saldos', {cliente_id: 'cli_demo_05', saldo: 0, ultima_act: now()}) } catch(e) {}
console.log('  ✓ Ana García: debe $21.000')
console.log('  ✓ María Rodríguez: al día')

// ── 9. Caja abierta ──────────────────────────────────────────────
console.log('\n💰 Abriendo caja de prueba...')
try {
  const cajaId = 'caja_demo_' + Date.now()
  upsertById('cajas', {id: cajaId, suc_id: SUC1_ID, usuario_id: 'usr_demo_admin', usuario_nombre: 'Admin Demo', estado: 'abierta', fondo_inicial: 5000, apertura: now(), ingresos: 5500, egresos: 0, saldo_efectivo: 10500, data: '{}'})
  try { upsertById('movimientos', {id:'cmov_'+uid(), caja_id:cajaId, suc_id:SUC1_ID, tipo:'apertura', concepto:'Apertura de caja', monto:5000, pago_metodo:'efectivo', usuario:'Admin Demo', fecha:now(), data:'{}'}) } catch(e) {}
  try { upsertById('movimientos', {id:'cmov_'+uid(), caja_id:cajaId, suc_id:SUC1_ID, tipo:'ingreso', concepto:'Venta #demo', monto:5500, pago_metodo:'efectivo', usuario:'Juan Vendedor', fecha:now(), data:'{}'}) } catch(e) {}
  console.log('  ✓ Caja Centro abierta — Fondo: $5.000 · Saldo: $10.500')
} catch (e) {
  console.log('  ↳ Caja ya existe o tabla no disponible:', e.message)
}

// ── 10. Gastos ───────────────────────────────────────────────────
console.log('\n💸 Creando gastos de prueba...')
const gastos = [
  { id: 'gas_demo_01', nombre: 'Alquiler local Centro', monto: 80000, fecha: hace(5), categoria_nombre: 'Alquiler', estado: 'pagado', metodo_pago: 'transferencia', suc_id: SUC1_ID, data: '{}' },
  { id: 'gas_demo_02', nombre: 'Bolsas y packaging', monto: 8500, fecha: hace(10), categoria_nombre: 'Insumos', estado: 'pagado', metodo_pago: 'efectivo', suc_id: SUC1_ID, data: '{}' },
  { id: 'gas_demo_03', nombre: 'Servicio de limpieza', monto: 15000, fecha: hace(7), categoria_nombre: 'Servicios', estado: 'pendiente', metodo_pago: 'efectivo', suc_id: SUC2_ID, data: '{}' },
  { id: 'gas_demo_04', nombre: 'Publicidad Instagram', monto: 25000, fecha: hace(3), categoria_nombre: 'Marketing', estado: 'pagado', metodo_pago: 'debito_cuenta', suc_id: SUC1_ID, data: '{}' },
]
gastos.forEach(g => { try { upsertById('gastos', g); console.log(`  ✓ ${g.nombre} — $${g.monto.toLocaleString('es-AR')}`) } catch(e) { console.log(`  ↳ ${g.nombre}: ${e.message}`) } })

// ── 11. Pendiente de entrega ─────────────────────────────────────
console.log('\n🚚 Creando pedido pendiente...')
try {
  const fechaEnt = new Date(); fechaEnt.setDate(fechaEnt.getDate() + 5)
  upsertById('pendientes', {
    id: 'pend_demo_01',
    numero: 1001,
    suc_id: SUC1_ID,
    cliente_id: CLI2_ID,
    cli_nombre: 'Carlos López',
    tel: '383-4234567',
    concepto: 'Jean Slim T:38 x1 · Campera Inflable T:S x1',
    total: 53500,
    seña: 10000,
    saldo: 43500,
    estado: 'pendiente',
    fecha_entrega: fechaEnt.toISOString().substr(0, 10),
    notas: 'Cliente pidió bordado en campera con iniciales C.L.',
    creado: hace(2),
    data: '{}',
  })
  console.log(`  ✓ Pedido #1001 — Carlos López — $53.500 (seña $10.000)`)
} catch (e) { console.log(`  ↳ ${e.message}`) }

// ── 12. Configuración de la empresa ─────────────────────────────
console.log('\n⚙️  Configurando datos generales...')
try {
  const cfgFields = {
    nombre: EMPRESA_NOMBRE,
    cuit: '30-12345678-9',
    dir: 'San Martín 145, Catamarca',
    tel: '383-4500001',
    email: 'demo@flexcrm.app',
    rubro: 'indumentaria',
    iva: '21',
    ticket_cabecera: 'Gracias por elegirnos',
    ticket_pie: 'Cambios dentro de los 30 días con ticket',
    ctacte_dias_vto: '30',
    ctacte_recargo: '0',
    puntos_peso: '1',
    puntos_minimo_canje: '100',
    puntos_valor_canje: '0.5',
  }
  Object.entries(cfgFields).forEach(([k, v]) => {
    try {
      // FlexCRM config table uses key/value
      db.raw.prepare('INSERT OR REPLACE INTO config(key,value) VALUES(?,?)').run(k, v)
    } catch(e) {
      try { db.raw.prepare('INSERT OR REPLACE INTO config(id,key,value) VALUES(?,?,?)').run(k,k,v) } catch(e2) {}
    }
  })
  console.log('  ✓ Nombre, CUIT, dirección, configuración de puntos')
} catch (e) { console.log(`  ↳ Config: ${e.message}`) }

// ── Resumen final ────────────────────────────────────────────────
console.log('\n' + '═'.repeat(50))
console.log('✅ DATOS DE PRUEBA LISTOS')
console.log('═'.repeat(50))
console.log('')
console.log('🌐 URL de la app:  http://localhost:3000/app/')
console.log('')
console.log('🏢 Empresa:        demo')
console.log('')
console.log('👤 Usuarios (contraseña: la configurada en SEED_DEMO_PASSWORD):')
console.log('   admin       → Admin completo, todas las sucursales')
console.log('   cajera      → Solo Sucursal Centro')
console.log('   vendedor    → Centro y Norte')
console.log('   supervisor  → Todas, rol supervisor + cajero')
console.log('')
console.log('🏪 Sucursales:     Centro | Norte')
console.log('👕 Productos:      7 (Remeras, Jeans, Campera, Vestido, Calza)')
console.log('👥 Clientes:       5 (3 con cta. corriente)')
console.log('📋 Ventas:         12 (10 históricas + 1 hoy + 1 pendiente cobro)')
console.log('🚚 Pendiente:      1 pedido de Carlos López')
console.log('💸 Gastos:         4')
console.log('💰 Caja Centro:    Abierta con $10.500')
console.log('')
console.log('═'.repeat(50))
