// ═══════════════════════════════════════════════════════════════
// PequeñosCRM Pro — SQLite Database Layer
// Usa node:sqlite (incorporado en Node.js 22+) — sin dependencias
// ═══════════════════════════════════════════════════════════════
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { encryptValue, decryptValue, isSensitiveKey, isEncrypted } = require('./lib/crypto-utils');


const crypto = require('crypto');

const uid = () => Date.now().toString(36) + crypto.randomBytes(8).toString('hex');

function createDB(dbPath) {
const DB_PATH = dbPath;
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sqlite = new DatabaseSync(DB_PATH);
sqlite.exec("PRAGMA journal_mode=WAL");
sqlite.exec("PRAGMA foreign_keys=ON");

const CURRENT_SCHEMA_VERSION = 3;
sqlite.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER)");
const sv = sqlite.prepare("SELECT version FROM schema_version").get();
const dbVersion = sv ? sv.version : 0;

function ensureVersion(v) { return dbVersion < v; }


// ─── SCHEMA ──────────────────────────────────────────────────
sqlite.exec(`
CREATE TABLE IF NOT EXISTS sucursales (
  id TEXT PRIMARY KEY, nombre TEXT, dir TEXT, ciudad TEXT,
  tel TEXT, email TEXT, responsable TEXT, activo INTEGER DEFAULT 1,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, nombre TEXT, usuario TEXT UNIQUE, email TEXT,
  password TEXT, rol TEXT, roles TEXT DEFAULT '[]',
  suc_id TEXT, suc_sesiones_permitidas TEXT DEFAULT '[]',
  activo INTEGER DEFAULT 1, creado TEXT,
  must_change_password INTEGER DEFAULT 0,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS vendedores (
  id TEXT PRIMARY KEY, nombre TEXT, apellido TEXT, dni TEXT,
  tel TEXT, email TEXT, rol TEXT, suc_id TEXT, suc_nombre TEXT,
  usuario_id TEXT, comision REAL DEFAULT 5, activo INTEGER DEFAULT 1,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY, nombre TEXT, apellido TEXT, dni TEXT,
  tel TEXT, email TEXT, ciudad TEXT, bebe_nac TEXT, notas TEXT,
  lista INTEGER DEFAULT 1, limite_credito REAL DEFAULT 0,
  puntos INTEGER DEFAULT 0, suc_origen TEXT,
  activo INTEGER DEFAULT 1, creado TEXT,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS puntos_movimientos (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  puntos INTEGER NOT NULL,
  motivo TEXT,
  referencia_id TEXT,
  fecha TEXT,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_puntos_cli ON puntos_movimientos(cliente_id);
CREATE TABLE IF NOT EXISTS productos (
  id TEXT PRIMARY KEY, nombre TEXT, sku TEXT, codigo_barras TEXT, categoria TEXT,
  talle TEXT, color TEXT, temporada TEXT,
  costo REAL DEFAULT 0, precio_l1 REAL, precio_l2 REAL, precio_l3 REAL,
  unidad TEXT DEFAULT 'unidad',
  stock_min INTEGER DEFAULT 3, stock_max INTEGER DEFAULT 20,
  favorito INTEGER DEFAULT 0, activo INTEGER DEFAULT 1,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS stock_suc (
  prod_id TEXT, suc_id TEXT, cantidad INTEGER DEFAULT 0,
  PRIMARY KEY (prod_id, suc_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_suc_prod ON stock_suc(prod_id);
CREATE TABLE IF NOT EXISTS stock_movimientos (
  id TEXT PRIMARY KEY, prod_id TEXT, nombre_prod TEXT,
  tipo TEXT, cantidad INTEGER,
  stock_antes INTEGER, stock_despues INTEGER,
  motivo TEXT, usuario_id TEXT, usuario TEXT,
  fecha TEXT, suc_id TEXT,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS ventas (
  id TEXT PRIMARY KEY, numero INTEGER, fecha TEXT,
  suc_id TEXT, vend_id TEXT, vend_nombre_fallback TEXT,
  cliente_id TEXT, subtotal REAL, descuento REAL DEFAULT 0,
  total REAL, pago TEXT, comprobante TEXT,
  recargo_pago REAL DEFAULT 0, es_ctacte INTEGER DEFAULT 0,
  anulada INTEGER DEFAULT 0, envio_monto REAL DEFAULT 0,
  observacion TEXT,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_suc ON ventas(suc_id);
CREATE TABLE IF NOT EXISTS venta_items (
  id TEXT PRIMARY KEY, venta_id TEXT, prod_id TEXT,
  nombre TEXT, talle TEXT, precio REAL, cantidad INTEGER,
  subtotal REAL, costo REAL DEFAULT 0,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_vitems_venta ON venta_items(venta_id);
CREATE TABLE IF NOT EXISTS cajas (
  id TEXT PRIMARY KEY, suc_id TEXT, fecha TEXT, estado TEXT DEFAULT 'abierta',
  fondo_inicial REAL DEFAULT 0, usuario_apertura TEXT, usuario_cierre TEXT,
  saldo_esperado_efectivo REAL, saldo_real REAL, diferencia REAL,
  fecha_cierre TEXT, notas TEXT, cierre_forzado INTEGER DEFAULT 0,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS movimientos_caja (
  id TEXT PRIMARY KEY, caja_id TEXT, suc_id TEXT, fecha TEXT,
  tipo TEXT, concepto TEXT, monto REAL,
  pago_metodo TEXT, usuario TEXT, auto INTEGER DEFAULT 0,
  anulado INTEGER DEFAULT 0, pendiente_id TEXT, venta_id TEXT,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS presupuestos (
  id TEXT PRIMARY KEY, numero INTEGER, fecha TEXT, fecha_vto TEXT,
  suc_id TEXT, vend_id TEXT, vend_nombre_fallback TEXT,
  cliente_id TEXT, cli_nombre_manual TEXT,
  subtotal REAL, descuento REAL DEFAULT 0, total REAL,
  notas TEXT, observaciones TEXT, estado TEXT DEFAULT 'borrador',
  dias_validez INTEGER DEFAULT 15,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS presupuesto_items (
  id TEXT PRIMARY KEY, presupuesto_id TEXT, prod_id TEXT,
  nombre TEXT, talle TEXT, precio REAL, cantidad INTEGER, subtotal REAL,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS pendientes (
  id TEXT PRIMARY KEY, numero INTEGER, fecha TEXT, fecha_vto TEXT,
  fecha_entrega_estimada TEXT, fecha_entrega TEXT,
  suc_id TEXT, suc_entrega TEXT, vend_id TEXT,
  vend_nombre_fallback TEXT, cliente_id TEXT,
  total REAL, sena REAL DEFAULT 0, saldo REAL,
  estado TEXT DEFAULT 'pendiente', notas TEXT,
  venta_id TEXT, activo_stock INTEGER DEFAULT 1,
  data TEXT DEFAULT '{}'
);
`);
try { sqlite.exec("ALTER TABLE pendientes ADD COLUMN concepto TEXT DEFAULT ''"); } catch(e) {}
try { sqlite.exec("ALTER TABLE pendientes ADD COLUMN suc_cobro TEXT DEFAULT ''"); } catch(e) {}
sqlite.exec(`
CREATE TABLE IF NOT EXISTS pendiente_items (
  id TEXT PRIMARY KEY, pendiente_id TEXT, prod_id TEXT,
  nombre TEXT, talle TEXT, precio REAL, cantidad INTEGER,
  subtotal REAL, entregado INTEGER DEFAULT 0,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS ctacte_movimientos (
  id TEXT PRIMARY KEY, cliente_id TEXT, tipo TEXT,
  concepto TEXT, monto REAL, fecha TEXT, fecha_vto TEXT,
  cancelado INTEGER DEFAULT 0, suc_id TEXT,
  venta_id TEXT, pendiente_id TEXT,
  observaciones TEXT,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS proveedores (
  id TEXT PRIMARY KEY, nombre TEXT, cuit TEXT, dir TEXT,
  tel TEXT, email TEXT, contacto TEXT, categoria TEXT,
  condicion_pago TEXT DEFAULT 'net30', notas TEXT,
  activo INTEGER DEFAULT 1,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS prov_oc (
  id TEXT PRIMARY KEY, numero INTEGER, prov_id TEXT,
  fecha TEXT, fecha_entrega_est TEXT, estado TEXT DEFAULT 'borrador',
  total REAL, notas TEXT, creado_por TEXT,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS prov_facturas (
  id TEXT PRIMARY KEY, prov_id TEXT, nro_factura TEXT,
  fecha TEXT, recibio TEXT, monto REAL,
  pagado REAL DEFAULT 0, saldo REAL,
  condicion_pago TEXT, vencimiento TEXT,
  oc_id TEXT, notas TEXT,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS prov_pagos_fact (
  id TEXT PRIMARY KEY, fact_id TEXT, prov_id TEXT,
  monto REAL, fecha TEXT, metodo TEXT,
  nro_comprobante TEXT, concepto TEXT, registrado_por TEXT,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS prov_ordenes (
  id TEXT PRIMARY KEY, prov_id TEXT, concepto TEXT, monto REAL,
  fecha TEXT, eliminada INTEGER DEFAULT 0, cancelada INTEGER DEFAULT 0,
  pagado_al_recibir REAL DEFAULT 0, notas TEXT,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_prov_ordenes ON prov_ordenes(prov_id);
CREATE TABLE IF NOT EXISTS prov_pagos (
  id TEXT PRIMARY KEY, prov_id TEXT, monto REAL,
  concepto TEXT, fecha TEXT, metodo TEXT,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_prov_pagos ON prov_pagos(prov_id);
CREATE TABLE IF NOT EXISTS gastos_categorias (
  id TEXT PRIMARY KEY, nombre TEXT, icono TEXT DEFAULT '💸', activo INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS gastos_recurrentes (
  id TEXT PRIMARY KEY, nombre TEXT, categoria_id TEXT,
  monto_estimado REAL DEFAULT 0, dia_vencimiento INTEGER DEFAULT 1,
  suc_id TEXT, activo INTEGER DEFAULT 1, notas TEXT,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS gastos (
  id TEXT PRIMARY KEY, nombre TEXT, categoria_id TEXT, categoria_nombre TEXT,
  monto REAL, fecha TEXT, fecha_vencimiento TEXT,
  estado TEXT DEFAULT 'pendiente',
  metodo_pago TEXT DEFAULT 'transferencia',
  suc_id TEXT, recurrente_id TEXT,
  nro_comprobante TEXT, notas TEXT,
  registrado_por TEXT, pagado_por TEXT,
  genera_egreso_caja INTEGER DEFAULT 0,
  caja_movimiento_id TEXT,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_suc ON gastos(suc_id);
CREATE TABLE IF NOT EXISTS transferencias (
  id TEXT PRIMARY KEY,
  numero INTEGER,
  fecha TEXT,
  suc_origen TEXT NOT NULL,
  suc_destino TEXT NOT NULL,
  estado TEXT DEFAULT 'borrador',
  notas TEXT,
  creado_por TEXT,
  enviado_por TEXT,
  recibido_por TEXT,
  fecha_envio TEXT,
  fecha_recepcion TEXT,
  observacion_recepcion TEXT,
  con_diferencias INTEGER DEFAULT 0,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_transf_origen ON transferencias(suc_origen);
CREATE INDEX IF NOT EXISTS idx_transf_destino ON transferencias(suc_destino);
CREATE TABLE IF NOT EXISTS transferencia_items (
  id TEXT PRIMARY KEY,
  transferencia_id TEXT NOT NULL,
  prod_id TEXT NOT NULL,
  nombre TEXT,
  talle TEXT,
  cantidad INTEGER NOT NULL,
  cantidad_recibida INTEGER DEFAULT 0,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_transf_items ON transferencia_items(transferencia_id);
CREATE TABLE IF NOT EXISTS seguimiento (
  id TEXT PRIMARY KEY,
  entidad_tipo TEXT NOT NULL,
  entidad_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  usuario_id TEXT,
  usuario_nombre TEXT,
  suc_id TEXT,
  accion TEXT NOT NULL,
  nota TEXT,
  estado_anterior TEXT,
  estado_nuevo TEXT,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_seg_entidad ON seguimiento(entidad_tipo, entidad_id);

CREATE TABLE IF NOT EXISTS pipeline_etapas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden INTEGER DEFAULT 0,
  color TEXT DEFAULT '#6366f1',
  suc_id TEXT,
  activo INTEGER DEFAULT 1,
  data TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS pipeline_oportunidades (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  etapa_id TEXT NOT NULL,
  cliente_id TEXT,
  cli_nombre TEXT,
  valor_estimado REAL DEFAULT 0,
  probabilidad INTEGER DEFAULT 50,
  fecha_creacion TEXT,
  fecha_cierre_estimada TEXT,
  fecha_cierre TEXT,
  vend_id TEXT,
  vend_nombre TEXT,
  usuario_id TEXT,
  usuario_nombre TEXT,
  observacion TEXT DEFAULT '',
  proximo_contacto TEXT,
  suc_id TEXT,
  notas TEXT,
  estado TEXT DEFAULT 'activo',
  venta_id TEXT,
  activo INTEGER DEFAULT 1,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_pipeline_etapa ON pipeline_oportunidades(etapa_id);

CREATE TABLE IF NOT EXISTS lista_bebe (
  id TEXT PRIMARY KEY,
  mama TEXT NOT NULL,
  bebe TEXT,
  tel TEXT,
  email TEXT,
  fecha_parto TEXT,
  estado TEXT DEFAULT 'activa',
  notas TEXT,
  suc_id TEXT,
  creado TEXT,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS lista_bebe_items (
  id TEXT PRIMARY KEY,
  lista_id TEXT NOT NULL,
  prod_id TEXT,
  nombre TEXT,
  cantidad INTEGER DEFAULT 1,
  cantidad_recibida INTEGER DEFAULT 0,
  data TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  usuario_id TEXT,
  usuario_nombre TEXT,
  suc_id TEXT,
  modulo TEXT NOT NULL,
  accion TEXT NOT NULL,
  descripcion TEXT,
  entidad_id TEXT,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_audit_fecha ON audit_log(fecha);
CREATE INDEX IF NOT EXISTS idx_audit_modulo ON audit_log(modulo);
CREATE INDEX IF NOT EXISTS idx_audit_usuario ON audit_log(usuario_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  fecha TEXT,
  autor_id TEXT,
  autor_nombre TEXT,
  suc_origen TEXT,
  suc_destino TEXT,
  texto TEXT,
  leido INTEGER DEFAULT 0,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_chat_fecha ON chat_messages(fecha);
CREATE INDEX IF NOT EXISTS idx_chat_suc ON chat_messages(suc_destino);

CREATE TABLE IF NOT EXISTS chat_settings (
  id TEXT PRIMARY KEY,
  suc_id TEXT,
  peer TEXT,
  fijado INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 0,
  hasta TEXT,
  by TEXT,
  fecha TEXT,
  data TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  usuario_id TEXT,
  email TEXT,
  token TEXT UNIQUE,
  expires TEXT,
  usado INTEGER DEFAULT 0,
  creado TEXT
);

CREATE TABLE IF NOT EXISTS codigos_descuento (
  codigo TEXT PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'porcentaje',
  valor REAL NOT NULL DEFAULT 0,
  usos_maximos INTEGER DEFAULT 0,
  usos_actuales INTEGER DEFAULT 0,
  monto_minimo REAL DEFAULT 0,
  activo INTEGER DEFAULT 1,
  aplica_a TEXT,
  vence TEXT,
  creado TEXT,
  notas TEXT
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  eventos TEXT NOT NULL DEFAULT '[]',
  token TEXT UNIQUE,
  activo INTEGER DEFAULT 1,
  creado TEXT
);

CREATE TABLE IF NOT EXISTS empleados (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT,
  dni TEXT,
  cuil TEXT,
  tel TEXT,
  email TEXT,
  direccion TEXT,
  fecha_ingreso TEXT,
  puesto TEXT,
  salario REAL DEFAULT 0,
  obra_social TEXT,
  suc_id TEXT,
  activo INTEGER DEFAULT 1,
  notas TEXT,
  creado TEXT
);

CREATE TABLE IF NOT EXISTS ausencias (
  id TEXT PRIMARY KEY,
  empleado_id TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'otro',
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT,
  motivo TEXT,
  certificado INTEGER DEFAULT 0,
  aprobado_por TEXT,
  creado TEXT
);

CREATE TABLE IF NOT EXISTS asistencias (
  id TEXT PRIMARY KEY,
  empleado_id TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'entrada',
  fecha_hora TEXT NOT NULL,
  suc_id TEXT,
  notas TEXT,
  creado TEXT
);

CREATE TABLE IF NOT EXISTS historial_salarios (
  id TEXT PRIMARY KEY,
  empleado_id TEXT NOT NULL,
  salario_anterior REAL DEFAULT 0,
  salario_nuevo REAL DEFAULT 0,
  fecha TEXT NOT NULL,
  motivo TEXT,
  modificado_por TEXT
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY, value TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  last_attempt TEXT,
  locked_until TEXT
);
CREATE TABLE IF NOT EXISTS user_2fa (
  user_id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  enabled INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS user_2fa_backup_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS password_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS categorias (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  icono TEXT DEFAULT '📦',
  activo INTEGER DEFAULT 1,
  data TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS producto_variantes (
  id TEXT PRIMARY KEY,
  producto_id TEXT NOT NULL,
  nombre TEXT,
  sku TEXT,
  codigo_barras TEXT,
  atributos TEXT DEFAULT '{}',
  costo REAL DEFAULT 0,
  precio_l1 REAL DEFAULT 0,
  precio_l2 REAL DEFAULT 0,
  precio_l3 REAL DEFAULT 0,
  orden INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 1,
  data TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_variantes_prod ON producto_variantes(producto_id);

CREATE TABLE IF NOT EXISTS variante_stock_suc (
  variante_id TEXT NOT NULL,
  suc_id TEXT NOT NULL,
  cantidad INTEGER DEFAULT 0,
  PRIMARY KEY (variante_id, suc_id)
);

CREATE TABLE IF NOT EXISTS tareas (
  id TEXT PRIMARY KEY,
  creado_por TEXT,
  creado_nombre TEXT,
  descripcion TEXT NOT NULL,
  fecha_creacion TEXT,
  fecha_fin TEXT,
  asignado_a TEXT DEFAULT '[]',
  suc_id TEXT,
  estado TEXT DEFAULT 'pendiente',
  observacion TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  data TEXT DEFAULT '{}'
);
`);

// ─── MIGRATIONS (version-gated) ──
if (ensureVersion(1)) {
try { sqlite.exec("ALTER TABLE pipeline_etapas ADD COLUMN data TEXT DEFAULT '{}'"); } catch(e) {}
try { sqlite.exec("ALTER TABLE pipeline_oportunidades ADD COLUMN data TEXT DEFAULT '{}'"); } catch(e) {}
try { sqlite.exec("ALTER TABLE pipeline_oportunidades ADD COLUMN usuario_id TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE pipeline_oportunidades ADD COLUMN usuario_nombre TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE pipeline_oportunidades ADD COLUMN observacion TEXT DEFAULT ''"); } catch(e) {}
try { sqlite.exec("ALTER TABLE pipeline_oportunidades ADD COLUMN proximo_contacto TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE pipeline_oportunidades ADD COLUMN motivo TEXT DEFAULT ''"); } catch(e) {}
try { sqlite.exec("ALTER TABLE tareas ADD COLUMN data TEXT DEFAULT '{}'"); } catch(e) {}
try { sqlite.exec("ALTER TABLE password_reset_tokens ADD COLUMN data TEXT DEFAULT '{}'"); } catch(e) {}
// 2FA and password history tables (idempotent)
try { sqlite.exec("CREATE TABLE IF NOT EXISTS user_2fa (user_id TEXT PRIMARY KEY, secret TEXT NOT NULL, enabled INTEGER DEFAULT 0, created_at TEXT)"); } catch(e) {}
try { sqlite.exec("CREATE TABLE IF NOT EXISTS user_2fa_backup_codes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code_hash TEXT NOT NULL, used INTEGER DEFAULT 0, created_at TEXT)"); } catch(e) {}
try { sqlite.exec("CREATE TABLE IF NOT EXISTS password_history (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT)"); } catch(e) {}
// ARCA factura columns
try { sqlite.exec("ALTER TABLE venta_items ADD COLUMN variante_id TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE presupuesto_items ADD COLUMN variante_id TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE pendiente_items ADD COLUMN variante_id TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE transferencia_items ADD COLUMN variante_id TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN facturada INTEGER DEFAULT 0"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN factura_cae TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN factura_numero INTEGER"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN factura_tipo TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN factura_fecha_vto TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN factura_doc_tipo INTEGER"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN factura_doc_nro INTEGER"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN cobrada INTEGER DEFAULT 0"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN pago_principal TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN fecha_cobro TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN cobrado_por TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN pagos_detalle TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN ctacte_monto REAL DEFAULT 0"); } catch(e) {}
try { sqlite.exec("ALTER TABLE ventas ADD COLUMN envio_detalle TEXT"); } catch(e) {}
// RRHH-Usuarios link
try { sqlite.exec("ALTER TABLE empleados ADD COLUMN usuario_id TEXT"); } catch(e) {}
// Force password change flag
try { sqlite.exec("ALTER TABLE usuarios ADD COLUMN must_change_password INTEGER DEFAULT 0"); } catch(e) {}
}
sqlite.prepare("INSERT OR REPLACE INTO schema_version(version) VALUES(?)").run(CURRENT_SCHEMA_VERSION);

// ─── SEED ────────────────────────────────────────────────────
function buildSeed() {
  const existing = sqlite.prepare("SELECT COUNT(*) as n FROM sucursales").get();
  if (existing.n > 0) return;
  console.log('Sembrando base de datos SQLite...');

  const suc = [
    ['s1','Centro','San Martín 123','Catamarca','03833-420001','centro@entremimos.com','Laura Gómez'],
    ['s2','Alto Verde','Av. Güemes 456','Catamarca','03833-420002','altoverde@entremimos.com','Carlos Díaz'],
    ['s3','Depósito','Ruta 38 km 5','Catamarca','03833-420003','deposito@entremimos.com','Administración'],
  ];
  const insS = sqlite.prepare("INSERT INTO sucursales(id,nombre,dir,ciudad,tel,email,responsable) VALUES(?,?,?,?,?,?,?)");
  suc.forEach(s => insS.run(...s));

  const seedAdminPass = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const seedVendPass = process.env.SEED_ADMIN_PASSWORD || 'vend123';
  const pass = bcrypt.hashSync(seedAdminPass,10);
  const pass2 = bcrypt.hashSync(seedVendPass,10);
  const now = new Date().toISOString();
  const insU = sqlite.prepare("INSERT INTO usuarios(id,nombre,usuario,email,password,rol,suc_id,suc_sesiones_permitidas,activo,creado,must_change_password) VALUES(?,?,?,?,?,?,?,?,1,?,1)");
  [
    ['u1','Administrador','admin','admin@entremimos.com',pass,'admin','s1',now],
    ['u2','Laura Gómez','laura','laura@entremimos.com',pass,'supervisor','s1',now],
    ['u3','Marcos Pérez','marcos','marcos@entremimos.com',pass2,'vendedor','s1',now],
    ['u4','Carlos Díaz','carlos','carlos@entremimos.com',pass2,'cajero','s2',now],
  ].forEach(u => insU.run(...u));

  const insV = sqlite.prepare("INSERT INTO vendedores(id,nombre,apellido,dni,tel,email,rol,suc_id,comision,activo) VALUES(?,?,?,?,?,?,?,?,?,1)");
  [
    ['v1','Laura','Gómez','28000001','3833-500001','laura@entremimos.com','supervisor','s1',5],
    ['v2','Marcos','Pérez','30000002','3833-500002','marcos@entremimos.com','vendedor','s1',5],
    ['v3','Carlos','Díaz','31000003','3833-500003','carlos@entremimos.com','cajero','s2',0],
  ].forEach(v => insV.run(...v));

  const insC = sqlite.prepare("INSERT INTO clientes(id,nombre,apellido,dni,tel,email,ciudad,lista,limite_credito,activo,creado) VALUES(?,?,?,?,?,?,?,?,?,1,?)");
  [
    ['c1','María','López','32000001','383 600-1001','maria@mail.com','Catamarca',1,50000,now],
    ['c2','Ana','García','33000002','383 600-1002','ana@mail.com','Catamarca',2,30000,now],
    ['c3','Jorge','Martínez','34000003','383 600-1003','jorge@mail.com','Catamarca',1,0,now],
  ].forEach(c => insC.run(...c));

  const insP = sqlite.prepare("INSERT INTO productos(id,nombre,sku,categoria,talle,color,temporada,costo,precio_l1,precio_l2,precio_l3,stock_min,stock_max,favorito,activo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
  const insSS = sqlite.prepare("INSERT INTO stock_suc(prod_id,suc_id,cantidad) VALUES(?,?,?)");
  [
    ['p1','Body Manga Larga','BML-001','Bodies','0-3m','Blanco','Todo el año',1800,3900,3510,2800,4,30,'s1',1,12],
    ['p2','Body Manga Larga','BML-002','Bodies','3-6m','Celeste','Todo el año',1800,3900,3510,2800,4,30,'s1',1,8],
    ['p3','Conjunto Verano Estampado','CVE-001','Conjuntos','6-9m','Amarillo','Verano 2025',3200,6800,6120,4900,3,20,'s1',1,5],
    ['p4','Pijama Polar','PP-001','Pijamas','12-18m','Gris','Invierno 2025',2900,6200,5580,4400,3,20,'s1',0,7],
    ['p5','Vestido Floral','VF-001','Vestidos','2A','Rosa','Verano 2025',3500,7500,6750,5400,2,15,'s1',0,4],
    ['p6','Remera Algodón','RA-001','Remeras','3A','Blanco/Azul','Verano 2025',1200,2800,2520,1900,5,40,'s2',1,15],
    ['p7','Pantalón Jean','PJ-001','Pantalones','4A','Azul','Todo el año',2800,5900,5310,4200,3,25,'s2',0,9],
    ['p8','Buzo Capucha','BC-001','Abrigos','6A','Verde','Invierno 2025',3800,8200,7380,5900,3,20,'s2',0,6],
    ['p9','Gorra de Sol','GS-001','Accesorios','RN','Celeste','Verano 2025',900,1900,1710,1300,5,50,'s1',1,20],
    ['p10','Zapatillas Baby','ZB-001','Calzado','16','Blanco/Rosa','Todo el año',3200,6900,6210,4900,3,15,'s3',0,3],
    ['p11','Conjunto Invierno Polar','CIP-001','Conjuntos','18-24m','Rojo','Invierno 2025',4500,9500,8550,6800,2,15,'s2',0,5],
    ['p12','Body Unicornio','BVU-001','Bodies','9-12m','Lila','Verano 2025',1900,4200,3780,2900,4,30,'s3',1,10],
    ['p13','Ranita Punto','RP-001','Conjuntos','0-3m','Beige','Todo el año',2200,4800,4320,3300,3,20,'s1',0,2],
  ].forEach(p => {
    const stock = p.pop(); // remove stock (last element)
    const suc = p[13];     // suc_id at index 13 (before removing it)
    p.splice(13, 1);       // remove suc_id from array — product is now global
    insP.run(...p);         // insert without suc_id
    insSS.run(p[0], suc, stock); // stock_suc: product has stock in its home suc
  });

  // Pagos config
  const insCfg = sqlite.prepare("INSERT OR REPLACE INTO config(key,value) VALUES(?,?)");
  const cfgDefaults = {
    nombre:'Entremimos',cuit:'30-12345678-9',dir:'San Martín 123',
    tel:'03833-420000',email:'info@entremimos.com',
    moneda:'ARS',iva:'21',comision:'5',
    ctacte_recargo:'0',ctacte_dias_vto:'30',ctacte_mora:'0',
    pendiente_dias_max:'30',pendiente_seña_min:'30',
    recargo_debito:'0',recargo_credito:'10',recargo_cuotas:'3',
    // jwt_secret now managed via JWT_SECRET env variable
    puntos_por_peso:'0.01', // 1 punto por cada $100 vendido
    pagos_metodos: JSON.stringify([
      {id:'efectivo',nombre:'Efectivo',icono:'💵',recargo:0,activo:true},
      {id:'debito',nombre:'Débito',icono:'💳',recargo:0,activo:true},
      {id:'credito',nombre:'Crédito',icono:'💳',recargo:10,activo:true},
      {id:'qr',nombre:'QR / MP',icono:'📱',recargo:0,activo:true},
      {id:'transfer',nombre:'Transferencia',icono:'📲',recargo:0,activo:true},
    ])
  };
  for (const [k,v] of Object.entries(cfgDefaults)) insCfg.run(k, v);
  // Default gasto categories
  const insGCat = sqlite.prepare("INSERT INTO gastos_categorias(id,nombre,icono,activo) VALUES(?,?,?,1)");
  [
    ['gc1','Alquiler','🏠'],['gc2','Servicios (Luz/Gas/Agua)','💡'],
    ['gc3','Internet / Telefonía','📡'],['gc4','Sueldos','👤'],
    ['gc5','Insumos / Librería','📦'],['gc6','Mantenimiento','🔧'],
    ['gc7','Publicidad','📢'],['gc8','Impuestos / Tasas','🏛️'],['gc9','Otros','💸'],
  ].forEach(g => insGCat.run(...g));

  console.log('✓ Base de datos SQLite creada con datos de ejemplo');
  console.log('  Stock por sucursal inicializado correctamente.');
}

// Only seed the default empresa DB — new empresa DBs start clean
if (DB_PATH.endsWith('crm.db')) {
  buildSeed();
}

// All empresa DBs get default gastos_categorias if empty
const gcCount = sqlite.prepare("SELECT COUNT(*) as n FROM gastos_categorias").get();
if (!gcCount || gcCount.n === 0) {
  const insGCat = sqlite.prepare("INSERT OR IGNORE INTO gastos_categorias(id,nombre,icono,activo) VALUES(?,?,?,1)");
  [
    ['gc1','Alquiler','🏠'],['gc2','Servicios (Luz/Gas/Agua)','💡'],
    ['gc3','Internet / Telefonía','📡'],['gc4','Sueldos','👤'],
    ['gc5','Insumos / Librería','📦'],['gc6','Mantenimiento','🔧'],
    ['gc7','Publicidad','📢'],['gc8','Impuestos / Tasas','🏛️'],['gc9','Otros','💸'],
  ].forEach(g => insGCat.run(...g));
}


// ─── PIPELINE MIGRATIONS ──
// Force cleanup: delete old/unwanted stages, reassign opportunities to "En negociación"
const unwantedNames = ['nuevo', 't1', 'nuevo pipeline'];
const enNegEtapa = sqlite.prepare("SELECT id FROM pipeline_etapas WHERE LOWER(nombre) = 'en negociación' AND activo != 0").get();
const fallbackId = enNegEtapa?.id || (() => {
  const f = sqlite.prepare("SELECT id FROM pipeline_etapas WHERE activo != 0 ORDER BY orden LIMIT 1").get();
  return f?.id || null;
})();
const allCurrent = sqlite.prepare("SELECT id, nombre FROM pipeline_etapas WHERE activo != 0").all();
const toDel = allCurrent.filter(e => unwantedNames.includes(e.nombre.trim().toLowerCase()));
for (const e of toDel) {
  if (fallbackId) sqlite.prepare("UPDATE pipeline_oportunidades SET etapa_id = ? WHERE etapa_id = ?").run(fallbackId, e.id);
  sqlite.prepare("UPDATE pipeline_etapas SET activo = 0 WHERE id = ?").run(e.id);
  console.log('  ✗ Etapa pipeline eliminada:', e.nombre);
}
// Ensure standard pipeline stages exist (upsert by nombre)
const pipelineStages = [
  { nombre: 'Contactado', orden: 1, color: '#f59e0b' },
  { nombre: 'En negociación', orden: 2, color: '#3b82f6' },
  { nombre: 'Cerrado', orden: 3, color: '#22c55e' },
  { nombre: 'Perdido', orden: 4, color: '#ef4444' },
  { nombre: 'Postventa', orden: 5, color: '#8b5cf6' },
];
const allEtapas = sqlite.prepare("SELECT id, nombre, orden, color FROM pipeline_etapas WHERE activo != 0").all();
const standardNames = pipelineStages.map(s => s.nombre.toLowerCase());
const standardNamesSet = new Set(standardNames);
const seenNames = new Set();
const toDelete = [];
for (const e of allEtapas) {
  const nameLower = e.nombre.trim().toLowerCase();
  const match = pipelineStages.find(s => s.nombre.toLowerCase() === nameLower);
  if (match) {
    if (seenNames.has(nameLower)) {
      // Duplicate name: mark for deletion (reassign opportunities first)
      const first = allEtapas.find(x => x.nombre.trim().toLowerCase() === nameLower && x.id !== e.id);
      if (first) {
        sqlite.prepare("UPDATE pipeline_oportunidades SET etapa_id = ? WHERE etapa_id = ?").run(first.id, e.id);
      }
      toDelete.push(e.id);
    } else {
      seenNames.add(nameLower);
      // Update existing stage to match standard name/color/orden
      if (e.nombre !== match.nombre || e.orden !== match.orden || e.color !== match.color) {
        sqlite.prepare("UPDATE pipeline_etapas SET nombre = ?, orden = ?, color = ? WHERE id = ?").run(match.nombre, match.orden, match.color, e.id);
      }
    }
  } else if (!standardNamesSet.has(nameLower)) {
    // Non-standard stage (t1, nuevo pipeline): mark for deletion unless it has opportunities
    const count = sqlite.prepare("SELECT COUNT(*) as n FROM pipeline_oportunidades WHERE etapa_id = ? AND activo != 0").get(e.id);
    if (!count || count.n === 0) {
      toDelete.push(e.id);
    }
  }
}
// Soft-delete old unused duplicate stages
const delStmt = sqlite.prepare("UPDATE pipeline_etapas SET activo = 0 WHERE id = ?");
for (const id of toDelete) delStmt.run(id);
// Insert any missing standard stages
const existingNames = new Set(allEtapas.flatMap(e => toDelete.includes(e.id) ? [] : [e.nombre.trim().toLowerCase()]));
for (const st of pipelineStages) {
  if (!existingNames.has(st.nombre.toLowerCase())) {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    sqlite.prepare("INSERT INTO pipeline_etapas(id,nombre,orden,color,activo) VALUES(?,?,?,?,1)").run(id, st.nombre, st.orden, st.color);
    console.log('  + Etapa pipeline creada:', st.nombre);
  }
}
// Migrate existing oportunidades: copy vend_nombre → usuario_nombre where empty
sqlite.exec("UPDATE pipeline_oportunidades SET usuario_nombre = vend_nombre WHERE (usuario_nombre IS NULL OR usuario_nombre = '') AND (vend_nombre IS NOT NULL AND vend_nombre != '')");

// Seed categorias from existing products if categories table is empty
const catCount = sqlite.prepare("SELECT COUNT(*) as n FROM categorias").get();
if (catCount && catCount.n === 0) {
  try {
    const existingCats = [...new Set(sqlite.prepare("SELECT DISTINCT categoria FROM productos WHERE categoria IS NOT NULL AND categoria != ''").all().map(r=>r.categoria))];
    if (existingCats.length) {
      const insCat = sqlite.prepare("INSERT OR IGNORE INTO categorias(id,nombre,icono,activo) VALUES(?,?,?,1)");
      existingCats.forEach(c => insCat.run('cat_'+c.toLowerCase().replace(/\s+/g,'_'), c, '📦'));
    }
  } catch(e) { /* seed categorias silently */ }
}

// Startup verification
const dbCheck = sqlite.prepare("SELECT COUNT(*) as n FROM stock_suc").get();
console.log(`SQLite activo — ${dbCheck.n} entradas en stock_suc`);

// ─── HELPERS ─────────────────────────────────────────────────
const BOOL_FIELDS = new Set(['activo','favorito','anulada','es_ctacte','cancelado','auto','anulado','activo_stock','cierre_forzado','cobrada']);

// JSON array columns that need to be parsed back from string
const JSON_ARRAY_COLS = new Set(['roles','categorias','pagos_metodos','suc_sesiones_permitidas','asignado_a']);

function expandRow(row) {
  if (!row) return null;
  const r = {...row};
  if (r.data) {
    try { Object.assign(r, JSON.parse(r.data)); } catch(e) {}
    delete r.data;
  }
  for (const k of BOOL_FIELDS) {
    if (r[k] !== undefined) r[k] = r[k] === 1 || r[k] === true;
  }
  // Parse JSON array columns stored as strings
  for (const k of JSON_ARRAY_COLS) {
    if (r[k] !== undefined && typeof r[k] === 'string') {
      try { r[k] = JSON.parse(r[k]); } catch(e) {}
    }
  }
  return r;
}

// Column definitions per table (for separating known cols from extra data)
const COLS = {
  sucursales:['id','nombre','dir','ciudad','tel','email','responsable','activo'],
  usuarios:['id','nombre','usuario','email','password','rol','roles','suc_id','suc_sesiones_permitidas','activo','creado'],
  vendedores:['id','nombre','apellido','dni','tel','email','rol','suc_id','suc_nombre','usuario_id','comision','activo'],
  clientes:['id','nombre','apellido','dni','tel','email','ciudad','bebe_nac','notas','lista','limite_credito','puntos','suc_origen','activo','creado'],
  productos:['id','nombre','sku','codigo_barras','categoria','talle','color','temporada','costo','precio_l1','precio_l2','precio_l3','unidad','stock_min','stock_max','favorito','activo'],
  stock_suc:['prod_id','suc_id','cantidad'],
  stock_movimientos:['id','prod_id','nombre_prod','tipo','cantidad','stock_antes','stock_despues','motivo','usuario_id','usuario','fecha','suc_id'],
  ventas:['id','numero','fecha','suc_id','vend_id','vend_nombre_fallback','cliente_id','subtotal','descuento','total','pago','comprobante','recargo_pago','es_ctacte','anulada','envio_monto','observacion','facturada','factura_cae','factura_numero','factura_tipo','factura_fecha_vto','factura_doc_tipo','factura_doc_nro','cobrada','pago_principal','fecha_cobro','cobrado_por','pagos_detalle','ctacte_monto','envio_detalle'],
  venta_items:['id','venta_id','prod_id','variante_id','nombre','talle','precio','cantidad','subtotal','costo'],
  cajas:['id','suc_id','fecha','estado','fondo_inicial','usuario_apertura','usuario_cierre','saldo_esperado_efectivo','saldo_real','diferencia','fecha_cierre','notas','cierre_forzado'],
  movimientos_caja:['id','caja_id','suc_id','fecha','tipo','concepto','monto','pago_metodo','usuario','auto','anulado','pendiente_id','venta_id'],
  presupuestos:['id','numero','fecha','fecha_vto','suc_id','vend_id','vend_nombre_fallback','cliente_id','cli_nombre_manual','subtotal','descuento','total','notas','observaciones','estado','dias_validez'],
  presupuesto_items:['id','presupuesto_id','prod_id','variante_id','nombre','talle','precio','cantidad','subtotal'],
  pendientes:['id','numero','fecha','fecha_vto','fecha_entrega_estimada','fecha_entrega','suc_id','suc_entrega','suc_cobro','vend_id','vend_nombre_fallback','cliente_id','total','sena','saldo','estado','concepto','notas','venta_id','activo_stock'],
  pendiente_items:['id','pendiente_id','prod_id','variante_id','nombre','talle','precio','cantidad','subtotal','entregado'],
  ctacte_movimientos:['id','cliente_id','tipo','concepto','monto','fecha','fecha_vto','cancelado','suc_id','venta_id','pendiente_id','observaciones'],
  proveedores:['id','nombre','cuit','dir','tel','email','contacto','categoria','condicion_pago','notas','activo'],
  prov_oc:['id','numero','prov_id','fecha','fecha_entrega_est','estado','total','notas','creado_por'],
  prov_facturas:['id','prov_id','nro_factura','fecha','recibio','monto','pagado','saldo','condicion_pago','vencimiento','oc_id','notas'],
  prov_pagos_fact:['id','fact_id','prov_id','monto','fecha','metodo','nro_comprobante','concepto','registrado_por'],
  prov_ordenes:['id','prov_id','concepto','monto','fecha','eliminada','cancelada','pagado_al_recibir','notas'],
  prov_pagos:['id','prov_id','monto','concepto','fecha','metodo'],
  gastos_categorias:['id','nombre','icono','activo'],
  gastos_recurrentes:['id','nombre','categoria_id','monto_estimado','dia_vencimiento','suc_id','activo','notas'],
  gastos:['id','nombre','categoria_id','categoria_nombre','monto','fecha','fecha_vencimiento','estado','metodo_pago','suc_id','recurrente_id','nro_comprobante','notas','registrado_por','pagado_por','genera_egreso_caja','caja_movimiento_id'],
  audit_log:['id','fecha','usuario_id','usuario_nombre','suc_id','modulo','accion','descripcion','entidad_id','data'],
  chat_messages:['id','fecha','autor_id','autor_nombre','suc_origen','suc_destino','texto','leido'],
  chat_settings:['id','suc_id','peer','fijado','activo','hasta','by','fecha'],
  lista_bebe:['id','mama','bebe','tel','email','fecha_parto','estado','notas','suc_id','creado'],
  lista_bebe_items:['id','lista_id','prod_id','nombre','cantidad','cantidad_recibida'],
  seguimiento:['id','entidad_tipo','entidad_id','fecha','usuario_id','usuario_nombre','suc_id','accion','nota','estado_anterior','estado_nuevo'],
  transferencias:['id','numero','fecha','suc_origen','suc_destino','estado','notas','creado_por','enviado_por','recibido_por','fecha_envio','fecha_recepcion','observacion_recepcion','con_diferencias'],
  puntos_movimientos:['id','cliente_id','tipo','puntos','motivo','referencia_id','fecha'],
  categorias:['id','nombre','icono','activo'],
  producto_variantes:['id','producto_id','nombre','sku','codigo_barras','atributos','costo','precio_l1','precio_l2','precio_l3','orden','activo'],
  variante_stock_suc:['variante_id','suc_id','cantidad'],
  transferencia_items:['id','transferencia_id','prod_id','variante_id','nombre','talle','cantidad','cantidad_recibida'],
  pipeline_etapas:['id','nombre','orden','color','suc_id','activo'],
  pipeline_oportunidades:['id','nombre','etapa_id','cliente_id','cli_nombre','valor_estimado','probabilidad','fecha_creacion','fecha_cierre_estimada','fecha_cierre','vend_id','vend_nombre','usuario_id','usuario_nombre','observacion','proximo_contacto','suc_id','notas','estado','venta_id','activo','motivo'],
  tareas:['id','creado_por','creado_nombre','descripcion','fecha_creacion','fecha_fin','asignado_a','suc_id','estado','observacion','activo'],
  user_2fa:['user_id','secret','enabled','created_at'],
  user_2fa_backup_codes:['id','user_id','code_hash','used','created_at'],
  password_history:['id','user_id','password_hash','created_at'],
  password_reset_tokens:['id','usuario_id','email','token','expires','usado','creado'],
  codigos_descuento:['codigo','tipo','valor','usos_maximos','usos_actuales','monto_minimo','activo','aplica_a','vence','creado','notas'],
  webhooks:['id','url','eventos','token','activo','creado'],
  empleados:['id','nombre','apellido','dni','cuil','tel','email','direccion','fecha_ingreso','puesto','salario','obra_social','suc_id','activo','notas','creado','usuario_id'],
  ausencias:['id','empleado_id','tipo','fecha_inicio','fecha_fin','motivo','certificado','aprobado_por','creado'],
  asistencias:['id','empleado_id','tipo','fecha_hora','suc_id','notas','creado'],
  historial_salarios:['id','empleado_id','salario_anterior','salario_nuevo','fecha','motivo','modificado_por'],
};

function prepareRow(table, obj) {
  const cols = COLS[table] || Object.keys(obj);
  const colsSet = new Set(cols);
  const row = {};
  const extra = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'stock_suc' || k === 'stock' || k === 'stock_actual') continue;
    if (colsSet.has(k)) {
      if (typeof v === 'boolean') row[k] = v ? 1 : 0;
      else if (Array.isArray(v) || (v && typeof v === 'object')) row[k] = JSON.stringify(v);
      else row[k] = v;
    } else {
      extra[k] = v;
    }
  }
  if (Object.keys(extra).length) row.data = JSON.stringify(extra);
  return row;
}

// ─── STOCK PER-SUC ───────────────────────────────────────────
function getStockSuc(prod_id, suc_id) {
  const row = sqlite.prepare("SELECT cantidad FROM stock_suc WHERE prod_id=? AND suc_id=?").get(prod_id, suc_id);
  return row ? row.cantidad : 0;
}

function updateStockSuc(prod_id, suc_id, delta) {
  const before = getStockSuc(prod_id, suc_id);
  const after = before + delta;
  sqlite.prepare("INSERT INTO stock_suc(prod_id,suc_id,cantidad) VALUES(?,?,?) ON CONFLICT(prod_id,suc_id) DO UPDATE SET cantidad=excluded.cantidad")
    .run(prod_id, suc_id, after);
  return { before, after };
}

function enrichProduct(row, viewer_suc_id) {
  if (!row) return null;
  const p = expandRow(row);
  const stocks = sqlite.prepare("SELECT suc_id, cantidad FROM stock_suc WHERE prod_id=?").all(p.id);
  const stock_suc = {};
  stocks.forEach(s => { stock_suc[s.suc_id] = s.cantidad; });
  const stock_total = stocks.reduce((a, s) => a + s.cantidad, 0);
  const stock_actual = viewer_suc_id !== undefined && viewer_suc_id !== null
    ? (stock_suc[viewer_suc_id] !== undefined ? stock_suc[viewer_suc_id] : 0)
    : null;
  // Map stock_actual → stock so frontend always uses the right value
  // If no viewer_suc, stock = stock_total (admin context only)
  const stock = stock_actual !== null ? stock_actual : 0; // 0 when no suc context — never global
  return { ...p, stock_suc, stock_total, stock_actual, stock };
}

// ─── DB API ──────────────────────────────────────────────────
const db = {
  all(table) {
    const rows = sqlite.prepare(`SELECT * FROM \`${table}\``).all();
    return rows.map(expandRow); // never auto-enrich — caller must use enrichProduct with suc_id
  },

  find(table, filters = {}) {
    const entries = Object.entries(filters);
    let sql = `SELECT * FROM \`${table}\` WHERE 1=1`;
    const params = [];
    for (const [k, v] of entries) {
      sql += ` AND \`${k}\`=?`;
      params.push(v === true ? 1 : v === false ? 0 : v);
    }
    return sqlite.prepare(sql).all(...params).map(expandRow); // never auto-enrich
  },

  _pk(table) {
    const cols = COLS[table];
    if (!cols || cols[0] === 'id') return 'id';
    return cols[0]; // first COLS entry is the PK (e.g. codigo for codigos_descuento)
  },

  findOne(table, id) {
    const pk = db._pk(table);
    const row = sqlite.prepare(`SELECT * FROM \`${table}\` WHERE \`${pk}\`=?`).get(id);
    return expandRow(row);
  },

  where(table, fn) {
    return db.all(table).filter(fn);
  },

  insert(table, record) {
    const row = prepareRow(table, record);
    const keys = Object.keys(row).filter(k => row[k] !== undefined && row[k] !== null);
    const vals = keys.map(k => row[k]);
    const sql = `INSERT OR REPLACE INTO \`${table}\`(${keys.map(k=>'`'+k+'`').join(',')}) VALUES(${keys.map(()=>'?').join(',')})`;
    try {
      sqlite.prepare(sql).run(...vals);
    } catch(e) {
      console.error(`db.insert error [${table}]:`, e.message);
      throw e;
    }
    return record;
  },

  update(table, id, updates) {
    const existing = db.findOne(table, id);
    if (!existing) return null;
    const pk = db._pk(table);
    return db.insert(table, {...existing, ...updates, [pk]: id});
  },

  delete(table, id) {
    const pk = db._pk(table);
    sqlite.prepare(`DELETE FROM \`${table}\` WHERE \`${pk}\`=?`).run(id);
  },

  softDel(table, id) {
    db.update(table, id, {activo: false});
  },

  // Config
  getConfig(key) {
    if (key) {
      const row = sqlite.prepare("SELECT value FROM config WHERE key=?").get(key);
      if (!row) return null;
      const val = (() => { try { return JSON.parse(row.value); } catch(e) { return row.value; } })();
      if (isSensitiveKey(key) && isEncrypted(val)) return decryptValue(val);
      return val;
    }
    const rows = sqlite.prepare("SELECT key, value FROM config").all();
    const cfg = {};
    rows.forEach(r => {
      let val = (() => { try { return JSON.parse(r.value); } catch(e) { return r.value; } })();
      if (isSensitiveKey(r.key) && isEncrypted(val)) val = decryptValue(val);
      cfg[r.key] = val;
    });
    return cfg;
  },

  setConfig(data) {
    const stmt = sqlite.prepare("INSERT OR REPLACE INTO config(key,value) VALUES(?,?)");
    for (const [k, v] of Object.entries(data)) {
      let val = typeof v === 'string' ? v : JSON.stringify(v);
      if (isSensitiveKey(k) && !isEncrypted(val)) val = encryptValue(val);
      stmt.run(k, val);
    }
  },

  // Stock per-suc — used by stock_helpers.js
  getStockSuc,
  updateStockSuc,
  enrichProduct,

  // Variant stock helpers
  getStockSucVariant(variante_id, suc_id) {
    const row = sqlite.prepare("SELECT cantidad FROM variante_stock_suc WHERE variante_id=? AND suc_id=?").get(variante_id, suc_id);
    return row ? row.cantidad : 0;
  },

  // Backup
  hacerBackup() {
    const today = new Date().toISOString().substr(0, 10);
    const backupDir = path.join(__dirname, 'data', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const dest = path.join(backupDir, `crm_backup_${today}.db`);
    const safeDest = dest.replace(/[^a-zA-Z0-9_\\/.\-:]/g, '');
    sqlite.exec(`VACUUM INTO '${safeDest.replace(/'/g, "''")}'`);
    // Keep last 30 backups
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).sort();
    if (files.length > 30) files.slice(0, files.length - 30).forEach(f => fs.unlinkSync(path.join(backupDir, f)));
    return dest;
  },

  // Compat shims
  save: () => {},
  raw: sqlite,

  // ── Audit helper — disponible en todas las DBs ──
  audit(usuario, suc_id, modulo, accion, descripcion, entidad_id, extra) {
    try {
      this.insert('audit_log', {
        id: Math.random().toString(36).substr(2,9) + Date.now().toString(36),
        fecha: new Date().toISOString(),
        usuario_id: usuario ? usuario.id : null,
        usuario_nombre: usuario ? usuario.nombre : 'Sistema',
        suc_id: suc_id || null,
        modulo, accion,
        descripcion: descripcion || accion,
        entidad_id: entidad_id || null,
        data: extra ? JSON.stringify(extra) : '{}',
      });
    } catch(e) { /* audit never breaks the app */ }
  },
};

  return db;
}

// ── Cache per empresa ──
const _dbCache = {};
function getEmpresaDB(empresaCode) {
  if(!empresaCode) empresaCode = 'default';
  if(!_dbCache[empresaCode]) {
    const dbPath = require('path').join(__dirname, 'data', 'empresa_' + empresaCode + '.db');
    _dbCache[empresaCode] = createDB(dbPath);
  }
  return _dbCache[empresaCode];
}

// ── Backward compat: default DB ──
const db = createDB(require('path').join(__dirname, 'data', 'crm.db'));

module.exports = db;
module.exports.uid = uid;
module.exports.db = db;

module.exports.createDB = createDB;
module.exports.getEmpresaDB = getEmpresaDB;
module.exports._dbCache = _dbCache;
