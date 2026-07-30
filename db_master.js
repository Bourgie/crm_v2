require('dotenv').config();
// ═══════════════════════════════════════
// PequeñosCRM Pro — Master DB
// Stores lista of empresas (tenants)
// ═══════════════════════════════════════
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const MASTER_PATH = path.join(__dirname, 'data', 'master.db');
const dir = path.dirname(MASTER_PATH);
if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});

const master = new DatabaseSync(MASTER_PATH);
master.exec("PRAGMA journal_mode=WAL");
master.exec("PRAGMA foreign_keys=ON");

master.exec(`
  CREATE TABLE IF NOT EXISTS modulos (
    id TEXT PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    categoria TEXT DEFAULT 'general',
    icono TEXT DEFAULT '📦',
    premium INTEGER DEFAULT 0,
    beta INTEGER DEFAULT 0,
    activo INTEGER DEFAULT 1,
    orden INTEGER DEFAULT 99
  );

  CREATE TABLE IF NOT EXISTS planes (
    id TEXT PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    precio REAL DEFAULT 0,
    moneda TEXT DEFAULT 'USD',
    periodo TEXT DEFAULT 'mensual',
    modulos TEXT DEFAULT '[]',
    limites TEXT DEFAULT '{}',
    activo INTEGER DEFAULT 1,
    orden INTEGER DEFAULT 99
  );

  CREATE TABLE IF NOT EXISTS empresas (
    id TEXT PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    rubro TEXT,
    plan_id TEXT,
    activo INTEGER DEFAULT 1,
    creado TEXT,
    vencimiento TEXT,
    admin_email TEXT UNIQUE,
    usuarios_max INTEGER DEFAULT 5,
    sucursales_max INTEGER DEFAULT 2,
    modulos_extra TEXT DEFAULT '[]',
    modulos_bloqueados TEXT DEFAULT '[]',
    config TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS superadmin (
    id TEXT PRIMARY KEY,
    usuario TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nombre TEXT,
    email TEXT,
    activo INTEGER DEFAULT 1,
    must_change_password INTEGER DEFAULT 0,
    data TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS sa_audit_log (
    id TEXT PRIMARY KEY,
    fecha TEXT,
    admin_id TEXT,
    accion TEXT,
    empresa_id TEXT,
    detalle TEXT
  );

  CREATE TABLE IF NOT EXISTS solicitudes_plan (
    id TEXT PRIMARY KEY,
    empresa_id TEXT,
    plan_id TEXT,
    tipo TEXT,
    fecha TEXT,
    usuario TEXT,
    estado TEXT DEFAULT 'pendiente'
  );

  CREATE TABLE IF NOT EXISTS solicitudes_soporte (
    id TEXT PRIMARY KEY,
    empresa_id TEXT,
    tipo TEXT DEFAULT 'soporte',
    asunto TEXT,
    descripcion TEXT,
    fecha TEXT,
    estado TEXT DEFAULT 'pendiente',
    creado_por TEXT,
    respuesta TEXT,
    respondido_por TEXT,
    fecha_respuesta TEXT
  );

  CREATE TABLE IF NOT EXISTS empresa_notas (
    id TEXT PRIMARY KEY,
    empresa_id TEXT,
    texto TEXT,
    autor TEXT,
    fecha TEXT
  );

  CREATE TABLE IF NOT EXISTS prospectos (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    telefono TEXT,
    email TEXT,
    empresa_interes TEXT,
    origen TEXT DEFAULT 'manual',
    estado TEXT DEFAULT 'nuevo',
    notas TEXT DEFAULT '',
    asignado_a TEXT,
    fecha_creacion TEXT,
    fecha_ultimo_contacto TEXT,
    ultimo_seguimiento TEXT
  );

  CREATE TABLE IF NOT EXISTS prospecto_seguimiento (
    id TEXT PRIMARY KEY,
    prospecto_id TEXT,
    tipo TEXT DEFAULT 'nota',
    descripcion TEXT,
    fecha TEXT,
    creado_por TEXT
  );

  CREATE TABLE IF NOT EXISTS landing_leads (
    id TEXT PRIMARY KEY,
    nombre TEXT,
    telefono TEXT,
    email TEXT,
    mensaje TEXT,
    empresa_interes TEXT,
    pagina TEXT,
    leido INTEGER DEFAULT 0,
    fecha TEXT
  );

  CREATE TABLE IF NOT EXISTS global_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS rubros_atributos (
    id TEXT PRIMARY KEY,
    rubro TEXT NOT NULL,
    atributo_key TEXT NOT NULL,
    atributo_label TEXT NOT NULL,
    tipo TEXT DEFAULT 'text',
    opciones TEXT DEFAULT '[]',
    orden INTEGER DEFAULT 0,
    activo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS mantenimiento_items (
    id TEXT PRIMARY KEY,
    tipo TEXT DEFAULT 'dominio',
    nombre TEXT NOT NULL,
    descripcion TEXT,
    fecha_vencimiento TEXT,
    proveedor TEXT,
    url TEXT,
    notas TEXT,
    estado TEXT DEFAULT 'activo',
    creado TEXT,
    actualizado TEXT
  );

  CREATE TABLE IF NOT EXISTS apps_disponibles (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    version TEXT NOT NULL,
    descripcion TEXT,
    descripcion_larga TEXT,
    categoria TEXT NOT NULL DEFAULT 'general',
    icono TEXT DEFAULT '📦',
    screenshots TEXT DEFAULT '[]',
    precio_base REAL DEFAULT 0,
    periodicidad TEXT DEFAULT 'unico',
    precio_mensual REAL DEFAULT 0,
    precio_anual REAL DEFAULT 0,
    trial_dias INTEGER DEFAULT 0,
    modulos_requeridos TEXT DEFAULT '[]',
    roles_permitidos TEXT DEFAULT '[]',
    activa INTEGER DEFAULT 1,
    es_oficial INTEGER DEFAULT 1,
    autor TEXT DEFAULT 'FlexCRM',
    fecha_publicacion TEXT,
    orden INTEGER DEFAULT 99,
    tags TEXT DEFAULT '[]',
    data TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS apps_instaladas (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    app_slug TEXT NOT NULL,
    app_id TEXT NOT NULL,
    version_instalada TEXT NOT NULL,
    activa INTEGER DEFAULT 1,
    fecha_instalacion TEXT,
    fecha_ultima_actualizacion TEXT,
    config TEXT DEFAULT '{}',
    billing_status TEXT DEFAULT 'active',
    trial_hasta TEXT,
    UNIQUE(empresa_id, app_slug)
  );

  CREATE TABLE IF NOT EXISTS app_event_log (
    id TEXT PRIMARY KEY,
    empresa_id TEXT,
    app_slug TEXT,
    evento TEXT,
    version_desde TEXT,
    version_hasta TEXT,
    fecha TEXT,
    realizado_por TEXT
  );

  CREATE TABLE IF NOT EXISTS solicitudes_eliminacion (
    id TEXT PRIMARY KEY,
    empresa_id TEXT,
    empresa_codigo TEXT,
    email TEXT,
    motivo TEXT,
    fecha TEXT,
    estado TEXT DEFAULT 'pendiente'
  );

  CREATE TABLE IF NOT EXISTS textos_legales (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    version TEXT NOT NULL,
    contenido_hash TEXT NOT NULL,
    vigente_desde TEXT NOT NULL,
    creado TEXT NOT NULL,
    UNIQUE(tipo, version)
  );

  CREATE TABLE IF NOT EXISTS notificaciones (
    id TEXT PRIMARY KEY,
    empresa_codigo TEXT,
    tipo TEXT,
    titulo TEXT NOT NULL,
    mensaje TEXT,
    leida INTEGER DEFAULT 0,
    creado TEXT NOT NULL,
    data TEXT DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_notif_empresa ON notificaciones(empresa_codigo, leida);

  CREATE TABLE IF NOT EXISTS oauth_providers (
    id TEXT PRIMARY KEY,
    provider TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    icono TEXT DEFAULT '🔌',
    categoria TEXT DEFAULT 'ecommerce',
    config_schema TEXT DEFAULT '{}',
    env_keys TEXT DEFAULT '[]',
    enabled INTEGER DEFAULT 1,
    orden INTEGER DEFAULT 99,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS empresa_integraciones (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    habilitado INTEGER DEFAULT 0,
    creado TEXT,
    actualizado TEXT,
    UNIQUE(empresa_id, provider)
  );
`);

// Migration: add email and data columns to existing superadmin
try { master.exec("ALTER TABLE superadmin ADD COLUMN email TEXT"); } catch(e) {}
try { master.exec("ALTER TABLE superadmin ADD COLUMN data TEXT DEFAULT '{}'"); } catch(e) {}
try { master.exec("ALTER TABLE superadmin ADD COLUMN must_change_password INTEGER DEFAULT 0"); } catch(e) {}
// Fix superadmin with null email
try { master.prepare("UPDATE superadmin SET email='admin@flexcrm.local' WHERE email IS NULL").run(); } catch(e) {}
// Migration: unique index on admin_email
try { master.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_admin_email ON empresas(admin_email)"); } catch(e) {}
// Migration: integraciones column in planes
try { master.exec("ALTER TABLE planes ADD COLUMN integraciones TEXT DEFAULT '[]'"); } catch(e) {}

// Seed superadmin if not exists
const sa = master.prepare("SELECT id FROM superadmin LIMIT 1").get();
if(!sa) {
  const bcrypt = require('bcryptjs');
  const saPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'superadmin123';
  const hash = bcrypt.hashSync(saPassword, 10);
  master.prepare("INSERT INTO superadmin (id,usuario,password,nombre,email,must_change_password) VALUES (?,?,?,?,?,1)").run(
    'sa_' + Date.now(), 'superadmin', hash, 'Super Admin', 'admin@flexcrm.local'
  );
  console.log('\n✓ ════════════════════════════════════');
  console.log('✓ Superadmin creado — usuario: superadmin');
  console.log('  La contraseña es la configurada en SEED_SUPERADMIN_PASSWORD');
  console.log('  Debe cambiarla en el primer inicio de sesión.');
  console.log('  Panel: /admin');
  console.log('✓ ════════════════════════════════════\n');
}

// Seed default modules
var modCount = master.prepare("SELECT COUNT(*) as n FROM modulos").get().n;
if(modCount === 0) {
  const MODS_DEFAULT = [
    {id:'mod_pos',      codigo:'pos',          nombre:'Punto de Venta',   icono:'🛒', categoria:'operaciones', premium:0, orden:1},
    {id:'mod_caja',     codigo:'caja',         nombre:'Caja',             icono:'💰', categoria:'operaciones', premium:0, orden:2},
    {id:'mod_clientes', codigo:'clientes',     nombre:'Clientes',         icono:'👥', categoria:'operaciones', premium:0, orden:3},
    {id:'mod_ventas',   codigo:'ventas',       nombre:'Ventas',           icono:'📋', categoria:'operaciones', premium:0, orden:4},
    {id:'mod_productos',codigo:'productos',    nombre:'Productos/Stock',  icono:'👕', categoria:'operaciones', premium:0, orden:5},
    {id:'mod_ctacte',   codigo:'ctacte',       nombre:'Cuenta corriente', icono:'📊', categoria:'finanzas',    premium:0, orden:6},
    {id:'mod_pres',     codigo:'presupuestos', nombre:'Presupuestos',     icono:'📄', categoria:'ventas',      premium:0, orden:7},
    {id:'mod_pend',     codigo:'pendientes',   nombre:'Pendientes',       icono:'🚚', categoria:'operaciones', premium:0, orden:8},
    {id:'mod_listab',   codigo:'listabebe',    nombre:'Lista de Regalos', icono:'🎁', categoria:'especial',    premium:0, orden:9},
    {id:'mod_transf',   codigo:'transferencias',nombre:'Transferencias',  icono:'🔄', categoria:'stock',       premium:0, orden:10},
    {id:'mod_prov',     codigo:'proveedores',  nombre:'Proveedores',      icono:'📦', categoria:'compras',     premium:0, orden:11},
    {id:'mod_gastos',   codigo:'gastos',       nombre:'Gastos',           icono:'💸', categoria:'finanzas',    premium:0, orden:12},
    {id:'mod_rep',      codigo:'reportes',     nombre:'Reportes',         icono:'📈', categoria:'analisis',    premium:0, orden:13},
    {id:'mod_audit',    codigo:'auditoria',    nombre:'Auditoría',        icono:'🔍', categoria:'admin',       premium:1, orden:14},
    {id:'mod_chat',     codigo:'chat',         nombre:'Chat sucursales',  icono:'💬', categoria:'comunicacion',premium:0, orden:15},
    {id:'mod_pipeline', codigo:'pipeline',     nombre:'Pipeline Comercial',icono:'📋', categoria:'ventas',      premium:0, orden:16},
    {id:'mod_arca',     codigo:'arca',         nombre:'ARCA Facturación',   icono:'📄', categoria:'admin',       premium:0, orden:17},
    {id:'mod_tienda',   codigo:'tienda',       nombre:'Sincronizar Tienda', icono:'🛒', categoria:'integracion', premium:0, orden:18},
    {id:'mod_webhooks', codigo:'webhooks',     nombre:'Webhooks',            icono:'🔗', categoria:'integracion', premium:0, orden:19},
    {id:'mod_rrhh',     codigo:'rrhh',         nombre:'RRHH',                icono:'👥', categoria:'admin',        premium:0, orden:20},
  ];
  const stmtMod = master.prepare("INSERT OR IGNORE INTO modulos (id,codigo,nombre,icono,categoria,premium,orden) VALUES (?,?,?,?,?,?,?)");
  MODS_DEFAULT.forEach(m => stmtMod.run(m.id,m.codigo,m.nombre,m.icono,m.categoria,m.premium,m.orden));
  console.log('✓ Módulos por defecto sembrados:', MODS_DEFAULT.length);
}
// Always ensure chat module exists (for DBs created before v94)
master.prepare("INSERT OR IGNORE INTO modulos (id,codigo,nombre,icono,categoria,premium,orden) VALUES (?,?,?,?,?,?,?)")
  .run('mod_chat','chat','Chat sucursales','💬','comunicacion',0,15);
// Always ensure pipeline module exists
master.prepare("INSERT OR IGNORE INTO modulos (id,codigo,nombre,icono,categoria,premium,orden) VALUES (?,?,?,?,?,?,?)")
  .run('mod_pipeline','pipeline','Pipeline Comercial','📋','ventas',0,16);
// Always ensure arca module exists
master.prepare("INSERT OR IGNORE INTO modulos (id,codigo,nombre,icono,categoria,premium,orden) VALUES (?,?,?,?,?,?,?)")
  .run('mod_arca','arca','ARCA Facturación','📄','admin',0,17);
// Always ensure tienda module exists
master.prepare("INSERT OR IGNORE INTO modulos (id,codigo,nombre,icono,categoria,premium,orden) VALUES (?,?,?,?,?,?,?)")
  .run('mod_tienda','tienda','Sincronizar Tienda','🛒','integracion',0,18);
// Always ensure webhooks module exists
master.prepare("INSERT OR IGNORE INTO modulos (id,codigo,nombre,icono,categoria,premium,orden) VALUES (?,?,?,?,?,?,?)")
  .run('mod_webhooks','webhooks','Webhooks','🔗','integracion',0,19);
// Always ensure rrhh module exists
master.prepare("INSERT OR IGNORE INTO modulos (id,codigo,nombre,icono,categoria,premium,orden) VALUES (?,?,?,?,?,?,?)")
  .run('mod_rrhh','rrhh','RRHH','👥','admin',0,20);

// Seed default plans
var planCount = master.prepare("SELECT COUNT(*) as n FROM planes").get().n;
if(planCount === 0) {
  const PLANES_DEFAULT = [
    {
      id:'plan_trial', codigo:'trial', nombre:'Prueba (14 días)', precio:0, orden:0,
      modulos:JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','reportes']),
      limites:JSON.stringify({usuarios_max:5, sucursales_max:1}),
      integraciones:JSON.stringify([])
    },
    {
      id:'plan_basic', codigo:'basic', nombre:'Básico', precio:15, orden:1,
      modulos:JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','proveedores','gastos','reportes']),
      limites:JSON.stringify({usuarios_max:3, sucursales_max:1}),
      integraciones:JSON.stringify([])
    },
    {
      id:'plan_pro', codigo:'pro', nombre:'Pro', precio:40, orden:2,
      modulos:JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','transferencias','proveedores','gastos','reportes','auditoria','chat','pipeline','arca','tienda']),
      limites:JSON.stringify({usuarios_max:10, sucursales_max:3}),
      integraciones:JSON.stringify(['arca','mercadolibre','tiendanube'])
    },
    {
      id:'plan_enterprise', codigo:'enterprise', nombre:'Enterprise', precio:90, orden:3,
      modulos:JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','listabebe','transferencias','proveedores','gastos','reportes','auditoria','chat','pipeline','arca','tienda']),
      limites:JSON.stringify({usuarios_max:999, sucursales_max:999}),
      integraciones:JSON.stringify(['arca','mercadolibre','tiendanube'])
    },
  ];
  const stmtPlan = master.prepare("INSERT OR IGNORE INTO planes (id,codigo,nombre,precio,modulos,limites,integraciones,orden) VALUES (?,?,?,?,?,?,?,?)");
  PLANES_DEFAULT.forEach(p => stmtPlan.run(p.id,p.codigo,p.nombre,p.precio,p.modulos,p.limites,p.integraciones,p.orden));
  console.log('✓ Planes por defecto sembrados:', PLANES_DEFAULT.length);
}

// Ensure plan_trial always exists
master.prepare("INSERT OR IGNORE INTO planes (id,codigo,nombre,precio,modulos,limites,integraciones,orden) VALUES ('plan_trial','trial','Prueba (14 dias)',0,?,?,?,0)")
  .run(JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','reportes']), JSON.stringify({usuarios_max:5, sucursales_max:1}), JSON.stringify([]));

// Seed annual plans
master.prepare("INSERT OR IGNORE INTO planes (id,codigo,nombre,precio,periodo,modulos,limites,integraciones,orden) VALUES (?,?,?,?,?,?,?,?,?)")
  .run('plan_basic_anual','basic_anual','Básico Anual',150,'anual',
    JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','proveedores','gastos','reportes']),
    JSON.stringify({usuarios_max:3, sucursales_max:1}), JSON.stringify([]), 10);
master.prepare("INSERT OR IGNORE INTO planes (id,codigo,nombre,precio,periodo,modulos,limites,integraciones,orden) VALUES (?,?,?,?,?,?,?,?,?)")
  .run('plan_pro_anual','pro_anual','Pro Anual',400,'anual',
    JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','transferencias','proveedores','gastos','reportes','auditoria','chat','pipeline','arca','tienda']),
    JSON.stringify({usuarios_max:10, sucursales_max:3}), JSON.stringify(['arca','mercadolibre','tiendanube']), 20);
master.prepare("INSERT OR IGNORE INTO planes (id,codigo,nombre,precio,periodo,modulos,limites,integraciones,orden) VALUES (?,?,?,?,?,?,?,?,?)")
  .run('plan_enterprise_anual','enterprise_anual','Enterprise Anual',900,'anual',
    JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','listabebe','transferencias','proveedores','gastos','reportes','auditoria','chat','pipeline','arca','tienda']),
    JSON.stringify({usuarios_max:999, sucursales_max:999}), JSON.stringify(['arca','mercadolibre','tiendanube']), 30);

// Seed default modules
var modCount = master.prepare("SELECT COUNT(*) as n FROM modulos").get().n;
if(modCount === 0) {
  var MODS = [
    ['mod_pos','pos','Punto de Venta','🛒','operaciones',0,1],
    ['mod_caja','caja','Caja','💰','operaciones',0,2],
    ['mod_clientes','clientes','Clientes','👥','operaciones',0,3],
    ['mod_ventas','ventas','Ventas','📋','operaciones',0,4],
    ['mod_productos','productos','Productos/Stock','👕','operaciones',0,5],
    ['mod_ctacte','ctacte','Cuenta corriente','📊','finanzas',0,6],
    ['mod_pres','presupuestos','Presupuestos','📄','ventas',0,7],
    ['mod_pend','pendientes','Pendientes entrega','🚚','operaciones',0,8],
    ['mod_listab','listabebe','Lista Bebé','🍼','especial',0,9],
    ['mod_transf','transferencias','Transferencias','🔄','stock',0,10],
    ['mod_prov','proveedores','Proveedores','📦','compras',0,11],
    ['mod_gastos','gastos','Gastos','💸','finanzas',0,12],
    ['mod_rep','reportes','Reportes','📈','analisis',0,13],
    ['mod_audit','auditoria','Auditoría','🔍','admin',1,14],
  ];
  var sm = master.prepare("INSERT OR IGNORE INTO modulos (id,codigo,nombre,icono,categoria,premium,orden,activo) VALUES (?,?,?,?,?,?,?,1)");
  MODS.forEach(m=>sm.run(...m));
  console.log('✓ Modulos sembrados:', MODS.length);
}
var planCount = master.prepare("SELECT COUNT(*) as n FROM planes").get().n;
if(planCount === 0) {
  var PLANES = [
    ['plan_basic','basic','Basico',15,JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','proveedores','gastos','reportes']),JSON.stringify({usuarios_max:3,sucursales_max:1}),JSON.stringify([]),1],
    ['plan_pro','pro','Pro',40,JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','transferencias','proveedores','gastos','reportes','auditoria','chat','pipeline']),JSON.stringify({usuarios_max:10,sucursales_max:3}),JSON.stringify(['arca','mercadolibre','tiendanube']),2],
    ['plan_enterprise','enterprise','Enterprise',90,JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','listabebe','transferencias','proveedores','gastos','reportes','auditoria','chat','pipeline']),JSON.stringify({usuarios_max:999,sucursales_max:999}),JSON.stringify(['arca','mercadolibre','tiendanube']),3],
  ];
  var sp = master.prepare("INSERT OR IGNORE INTO planes (id,codigo,nombre,precio,modulos,limites,integraciones,activo,orden) VALUES (?,?,?,?,?,?,?,1,?)");
  PLANES.forEach(p=>sp.run(...p));
  console.log('✓ Planes sembrados:', PLANES.length);
}

// Seed default empresa for backward compat
const def = master.prepare("SELECT id FROM empresas WHERE codigo=?").get('default');
if(!def) {
  master.prepare("INSERT INTO empresas (id,codigo,nombre,rubro,creado) VALUES (?,?,?,?,?)").run(
    'emp_default', 'default', 'Mi Empresa', 'general', new Date().toISOString()
  );
}

function getPlanes() {
  return master.prepare("SELECT * FROM planes WHERE activo=1 ORDER BY orden").all()
    .map(p => ({...p, modulos: JSON.parse(p.modulos||'[]'), limites: JSON.parse(p.limites||'{}'), integraciones: JSON.parse(p.integraciones||'[]')}));
}
function getPlan(id_or_codigo) {
  const p = master.prepare("SELECT * FROM planes WHERE id=? OR codigo=?").get(id_or_codigo, id_or_codigo);
  if(!p) return null;
  return {...p, modulos: JSON.parse(p.modulos||'[]'), limites: JSON.parse(p.limites||'{}'), integraciones: JSON.parse(p.integraciones||'[]')};
}
function getModulos() {
  return master.prepare("SELECT * FROM modulos WHERE activo=1 ORDER BY orden").all();
}
function saAudit(admin_id, accion, empresa_id, detalle) {
  try {
    master.prepare("INSERT INTO sa_audit_log (id,fecha,admin_id,accion,empresa_id,detalle) VALUES (?,?,?,?,?,?)")
      .run('sal_'+Date.now(), new Date().toISOString(), admin_id, accion, empresa_id||null, detalle||null);
  } catch(e) {}
}

// Extended audit with IP, user-agent, and extra metadata
function saAuditExtended(admin_id, accion, empresa_id, detalle, meta = {}) {
  try {
    const fullDetalle = JSON.stringify({
      msg: detalle || '',
      ip: meta.ip || '',
      ua: meta.userAgent || '',
      email: meta.email || '',
      ts: new Date().toISOString(),
      ...meta.data
    });
    master.prepare("INSERT INTO sa_audit_log (id,fecha,admin_id,accion,empresa_id,detalle) VALUES (?,?,?,?,?,?)")
      .run('sal_'+Date.now()+'_'+Math.random().toString(36).substr(2,6), new Date().toISOString(), admin_id, accion, empresa_id||null, fullDetalle);
  } catch(e) { console.error('[Audit] Error:', e.message); }
}

// Add data column to audit log for future use
try { master.exec("ALTER TABLE sa_audit_log ADD COLUMN data TEXT DEFAULT '{}'"); } catch(e) {}

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','yopmail.com','tempmail.com','10minutemail.com','guerrillamail.com','sharklasers.com',
  'trashmail.com','throwaway.email','maildrop.cc','harakirimail.com','getnada.com','temp-mail.org',
  'fakeinbox.com','emailondeck.com','tempmail.net','dispostable.com','mailnesia.com','spamgourmet.com',
  'mytemp.email','emailfake.com','moakt.com','tempail.com','guerrillamail.org','guerrillamail.net',
  'guerrillamail.biz','pokemail.net','spam4.me','wegwerfmail.de','wegwerfmail.net','wegwerfmail.org',
  'nwytg.com','vusra.com','colevillecapital.com','gufum.com','montepaone.com','katamo-mail.com',
]);

function isDisposableEmail(email) {
  const domain = (email || '').split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}
function saPurgeAuditLog(retentionDays) {
  try {
    const days = retentionDays || 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = master.prepare("DELETE FROM sa_audit_log WHERE fecha < ?").run(cutoff);
    if (result.changes > 0) console.log(`[sa-audit-purge] ${result.changes} registros eliminados (> ${days} días)`);
  } catch(e) {}
}
function getEmpresas() {
  return master.prepare("SELECT * FROM empresas ORDER BY nombre").all();
}
function getEmpresa(codigo) {
  return master.prepare("SELECT * FROM empresas WHERE codigo=? AND activo=1").get(codigo);
}
function createEmpresa(data) {
  const id = 'emp_' + Date.now();
  master.prepare(`INSERT INTO empresas 
    (id,codigo,nombre,rubro,plan_id,activo,creado,admin_email,vencimiento,usuarios_max,sucursales_max,modulos_extra,modulos_bloqueados)
    VALUES (?,?,?,?,?,1,?,?,?,?,?,'[]','[]')`).run(
    id, data.codigo, data.nombre, data.rubro||'general', data.plan_id||null,
    new Date().toISOString(), data.admin_email||null, data.vencimiento||null,
    data.usuarios_max||5, data.sucursales_max||1
  );
  return id;
}
function updateEmpresa(id, data) {
  master.prepare(`UPDATE empresas SET nombre=?,rubro=?,plan_id=?,activo=?,admin_email=?,
    vencimiento=?,usuarios_max=?,sucursales_max=? WHERE id=?`).run(
    data.nombre, data.rubro||null, data.plan_id||null, data.activo?1:0,
    data.admin_email||null, data.vencimiento||null,
    data.usuarios_max||5, data.sucursales_max||1, id
  );
}

function getProspectos() {
  return master.prepare("SELECT * FROM prospectos ORDER BY fecha_creacion DESC").all();
}
function getProspecto(id) {
  return master.prepare("SELECT * FROM prospectos WHERE id=?").get(id);
}
function getProspectoSeguimiento(prospecto_id) {
  return master.prepare("SELECT * FROM prospecto_seguimiento WHERE prospecto_id=? ORDER BY fecha DESC").all(prospecto_id);
}
function getLandingLeads(noLeidos) {
  if (noLeidos) return master.prepare("SELECT * FROM landing_leads WHERE leido=0 ORDER BY fecha DESC").all();
  return master.prepare("SELECT * FROM landing_leads ORDER BY fecha DESC").all();
}
function getDbStats() {
  try {
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, 'data', 'master.db');
    const stats = fs.statSync(dbPath);
    const empresaCount = master.prepare("SELECT COUNT(*) as n FROM empresas").get().n;
    const activeCount = master.prepare("SELECT COUNT(*) as n FROM empresas WHERE activo=1").get().n;
    const prospectCount = master.prepare("SELECT COUNT(*) as n FROM prospectos").get().n;
    const newLeads = master.prepare("SELECT COUNT(*) as n FROM landing_leads WHERE leido=0").get().n;
    const auditCount = master.prepare("SELECT COUNT(*) as n FROM sa_audit_log").get().n;
    return { dbSize: stats.size, empresas: empresaCount, activas: activeCount, prospectos: prospectCount, nuevosLeads: newLeads, auditorias: auditCount, timestamp: new Date().toISOString() };
  } catch(e) { return { error: e.message } }
}

function getGlobalConfig(key) {
  const row = master.prepare("SELECT value FROM global_config WHERE key=?").get(key);
  return row ? row.value : null;
}

function setGlobalConfig(key, value) {
  const existing = master.prepare("SELECT key FROM global_config WHERE key=?").get(key);
  if (existing) {
    master.prepare("UPDATE global_config SET value=?, updated_at=? WHERE key=?").run(value, new Date().toISOString(), key);
  } else {
    master.prepare("INSERT INTO global_config (key, value, updated_at) VALUES (?,?,?)").run(key, value, new Date().toISOString());
  }
}

function getAllGlobalConfig() {
  return master.prepare("SELECT key, value, updated_at FROM global_config").all();
}

function getRubroAtributos(rubro) {
  return master.prepare("SELECT * FROM rubros_atributos WHERE rubro=? AND activo=1 ORDER BY orden").all(rubro)
    .map(a => ({ ...a, opciones: JSON.parse(a.opciones || '[]') }));
}

function getAllRubrosAtributos() {
  return master.prepare("SELECT * FROM rubros_atributos WHERE activo=1 ORDER BY rubro, orden").all()
    .map(a => ({ ...a, opciones: JSON.parse(a.opciones || '[]') }));
}

function createRubroAtributo(data) {
  const id = 'ra_' + Date.now();
  master.prepare("INSERT INTO rubros_atributos (id, rubro, atributo_key, atributo_label, tipo, opciones, orden, activo) VALUES (?,?,?,?,?,?,?,1)")
    .run(id, data.rubro, data.atributo_key, data.atributo_label, data.tipo || 'text', JSON.stringify(data.opciones || []), data.orden || 0);
  return id;
}

function updateRubroAtributo(id, data) {
  master.prepare("UPDATE rubros_atributos SET rubro=?, atributo_key=?, atributo_label=?, tipo=?, opciones=?, orden=?, activo=? WHERE id=?")
    .run(data.rubro, data.atributo_key, data.atributo_label, data.tipo || 'text', JSON.stringify(data.opciones || []), data.orden || 0, data.activo !== false ? 1 : 0, id);
}

function seedDefaultRubroAtributos() {
  const count = master.prepare("SELECT COUNT(*) as n FROM rubros_atributos").get().n;
  if (count > 0) return;
  const defaults = [
    // Indumentaria
    { rubro: 'indumentaria', key: 'talle', label: 'Talle', tipo: 'select', opciones: ['XS','S','M','L','XL','XXL','Único'] },
    { rubro: 'indumentaria', key: 'color', label: 'Color', tipo: 'text', opciones: [] },
    { rubro: 'indumentaria', key: 'temporada', label: 'Temporada', tipo: 'text', opciones: [] },
    // Ropa infantil
    { rubro: 'ropa_infantil', key: 'talle', label: 'Talle', tipo: 'select', opciones: ['NB','0-3m','3-6m','6-12m','12-18m','18-24m','2','3','4','6','8','10','12','14','16'] },
    { rubro: 'ropa_infantil', key: 'color', label: 'Color', tipo: 'text', opciones: [] },
    { rubro: 'ropa_infantil', key: 'temporada', label: 'Temporada', tipo: 'text', opciones: [] },
    // Panadería
    { rubro: 'panaderia', key: 'sabor', label: 'Sabor', tipo: 'text', opciones: [] },
    { rubro: 'panaderia', key: 'gramaje', label: 'Gramaje', tipo: 'number', opciones: [] },
    { rubro: 'panaderia', key: 'tipo_masa', label: 'Tipo de masa', tipo: 'select', opciones: ['Común','Hojaldre','Integral','Manteca','Medialuna','Dulce'] },
    { rubro: 'panaderia', key: 'unidad_venta', label: 'Unidad de venta', tipo: 'select', opciones: ['unidad','kg','docena','media docena'] },
    // Ferretería
    { rubro: 'ferreteria', key: 'material', label: 'Material', tipo: 'text', opciones: [] },
    { rubro: 'ferreteria', key: 'medida', label: 'Medida', tipo: 'text', opciones: [] },
    { rubro: 'ferreteria', key: 'marca', label: 'Marca', tipo: 'text', opciones: [] },
    { rubro: 'ferreteria', key: 'peso', label: 'Peso (kg)', tipo: 'number', opciones: [] },
    // Farmacia
    { rubro: 'farmacia', key: 'laboratorio', label: 'Laboratorio', tipo: 'text', opciones: [] },
    { rubro: 'farmacia', key: 'principio_activo', label: 'Principio activo', tipo: 'text', opciones: [] },
    { rubro: 'farmacia', key: 'presentacion', label: 'Presentación', tipo: 'select', opciones: ['Caja','Blister','Frasco','Ampolla','Sobre'] },
    // General
    { rubro: 'general', key: 'marca', label: 'Marca', tipo: 'text', opciones: [] },
    { rubro: 'general', key: 'modelo', label: 'Modelo', tipo: 'text', opciones: [] },
  ];
  const stmt = master.prepare("INSERT INTO rubros_atributos (id, rubro, atributo_key, atributo_label, tipo, opciones, orden, activo) VALUES (?,?,?,?,?,?,?,1)");
  defaults.forEach((d, i) => {
    stmt.run('ra_seed_' + i, d.rubro, d.key, d.label, d.tipo, JSON.stringify(d.opciones), i);
  });
  console.log('✓ Atributos por rubro sembrados:', defaults.length);
}

// Seed default rubro attributes on load
seedDefaultRubroAtributos();

// ── Apps (ecosistema) ──
function getAppsDisponibles(categoria) {
  let rows;
  if (categoria) {
    rows = master.prepare("SELECT * FROM apps_disponibles WHERE activa=1 AND categoria=? ORDER BY orden").all(categoria);
  } else {
    rows = master.prepare("SELECT * FROM apps_disponibles WHERE activa=1 ORDER BY categoria, orden").all();
  }
  return rows.map(a => ({
    ...a,
    screenshots: JSON.parse(a.screenshots || '[]'),
    modulos_requeridos: JSON.parse(a.modulos_requeridos || '[]'),
    roles_permitidos: JSON.parse(a.roles_permitidos || '[]'),
    tags: JSON.parse(a.tags || '[]'),
    data: JSON.parse(a.data || '{}'),
  }));
}
function getAppDisponible(slug) {
  const a = master.prepare("SELECT * FROM apps_disponibles WHERE slug=?").get(slug);
  if (!a) return null;
  return {
    ...a,
    screenshots: JSON.parse(a.screenshots || '[]'),
    modulos_requeridos: JSON.parse(a.modulos_requeridos || '[]'),
    roles_permitidos: JSON.parse(a.roles_permitidos || '[]'),
    tags: JSON.parse(a.tags || '[]'),
    data: JSON.parse(a.data || '{}'),
  };
}
function upsertAppDisponible(data) {
  const existing = master.prepare("SELECT id FROM apps_disponibles WHERE slug=?").get(data.slug);
  if (existing) {
    master.prepare(`UPDATE apps_disponibles SET nombre=?,version=?,descripcion=?,descripcion_larga=?,categoria=?,icono=?,
      screenshots=?,precio_base=?,periodicidad=?,precio_mensual=?,precio_anual=?,trial_dias=?,
      modulos_requeridos=?,roles_permitidos=?,activa=?,es_oficial=?,autor=?,tags=?,orden=?,data=?
      WHERE slug=?`).run(
      data.nombre, data.version, data.descripcion || null, data.descripcion_larga || null,
      data.categoria || 'general', data.icono || '📦',
      JSON.stringify(data.screenshots || []), data.precio_base || 0, data.periodicidad || 'unico',
      data.precio_mensual || 0, data.precio_anual || 0, data.trial_dias || 0,
      JSON.stringify(data.modulos_requeridos || []), JSON.stringify(data.roles_permitidos || []),
      data.activa !== false ? 1 : 0, data.es_oficial !== false ? 1 : 0,
      data.autor || 'FlexCRM', JSON.stringify(data.tags || []), data.orden || 99,
      JSON.stringify(data.data || {}), data.slug
    );
  } else {
    const id = data.id || 'app_' + Date.now();
    master.prepare(`INSERT INTO apps_disponibles (id,slug,nombre,version,descripcion,descripcion_larga,categoria,icono,
      screenshots,precio_base,periodicidad,precio_mensual,precio_anual,trial_dias,
      modulos_requeridos,roles_permitidos,activa,es_oficial,autor,fecha_publicacion,tags,orden,data)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, data.slug, data.nombre, data.version, data.descripcion || null, data.descripcion_larga || null,
      data.categoria || 'general', data.icono || '📦',
      JSON.stringify(data.screenshots || []), data.precio_base || 0, data.periodicidad || 'unico',
      data.precio_mensual || 0, data.precio_anual || 0, data.trial_dias || 0,
      JSON.stringify(data.modulos_requeridos || []), JSON.stringify(data.roles_permitidos || []),
      data.activa !== false ? 1 : 0, data.es_oficial !== false ? 1 : 0,
      data.autor || 'FlexCRM', new Date().toISOString(), JSON.stringify(data.tags || []), data.orden || 99,
      JSON.stringify(data.data || {})
    );
  }
}
function getAppsInstaladas(empresaId) {
  return master.prepare("SELECT * FROM apps_instaladas WHERE empresa_id=? ORDER BY fecha_instalacion").all(empresaId)
    .map(i => ({ ...i, config: JSON.parse(i.config || '{}') }));
}
function getAppInstalada(empresaId, appSlug) {
  const i = master.prepare("SELECT * FROM apps_instaladas WHERE empresa_id=? AND app_slug=?").get(empresaId, appSlug);
  if (!i) return null;
  return { ...i, config: JSON.parse(i.config || '{}') };
}
function installApp(empresaId, appSlug, appId, version) {
  const existing = master.prepare("SELECT id FROM apps_instaladas WHERE empresa_id=? AND app_slug=?").get(empresaId, appSlug);
  if (existing) {
    master.prepare("UPDATE apps_instaladas SET activa=1, version_instalada=?, fecha_instalacion=? WHERE id=?")
      .run(version, new Date().toISOString(), existing.id);
  } else {
    master.prepare(`INSERT INTO apps_instaladas (id,empresa_id,app_slug,app_id,version_instalada,activa,fecha_instalacion,billing_status)
      VALUES (?,?,?,?,?,1,?,?)`).run(
      'ai_' + Date.now(), empresaId, appSlug, appId, version, new Date().toISOString(), 'active'
    );
  }
}
function uninstallApp(empresaId, appSlug) {
  master.prepare("DELETE FROM apps_instaladas WHERE empresa_id=? AND app_slug=?").run(empresaId, appSlug);
}
function updateAppStatus(empresaId, appSlug, activa) {
  master.prepare("UPDATE apps_instaladas SET activa=? WHERE empresa_id=? AND app_slug=?").run(activa ? 1 : 0, empresaId, appSlug);
}
function updateAppConfig(empresaId, appSlug, config) {
  master.prepare("UPDATE apps_instaladas SET config=? WHERE empresa_id=? AND app_slug=?").run(JSON.stringify(config), empresaId, appSlug);
}
function logAppEvent(empresaId, appSlug, evento, versionDesde, versionHasta, realizadoPor) {
  master.prepare("INSERT INTO app_event_log (id,empresa_id,app_slug,evento,version_desde,version_hasta,fecha,realizado_por) VALUES (?,?,?,?,?,?,?,?)")
    .run('ael_' + Date.now(), empresaId, appSlug, evento, versionDesde || null, versionHasta || null, new Date().toISOString(), realizadoPor || null);
}
function getAppStats() {
  const totalApps = master.prepare("SELECT COUNT(*) as n FROM apps_disponibles WHERE activa=1").get().n;
  const totalInstalaciones = master.prepare("SELECT COUNT(*) as n FROM apps_instaladas WHERE activa=1").get().n;
  const porApp = master.prepare("SELECT app_slug, COUNT(*) as n FROM apps_instaladas WHERE activa=1 GROUP BY app_slug ORDER BY n DESC").all();
  const porCategoria = master.prepare("SELECT a.categoria, COUNT(ai.id) as n FROM apps_instaladas ai JOIN apps_disponibles a ON a.slug=ai.app_slug WHERE ai.activa=1 GROUP BY a.categoria ORDER BY n DESC").all();
  return { totalApps, totalInstalaciones, porApp, porCategoria };
}

// Seed _hello-world test app
const hw = master.prepare("SELECT id FROM apps_disponibles WHERE slug=?").get('_hello-world');
if (!hw) {
  upsertAppDisponible({
    id: 'app_hw', slug: '_hello-world', nombre: 'Hello World (test)', version: '1.0.0',
    descripcion: 'App de prueba para validar el ecosistema de apps.',
    categoria: 'general', icono: '👋', es_oficial: 1, activa: 1, orden: 0,
    precio_mensual: 0, trial_dias: 0,
    modulos_requeridos: [], roles_permitidos: ['admin', 'supervisor'],
    tags: ['test']
  });
}

// ── Mantenimiento ──
function getMantenimientoItems() {
  return master.prepare("SELECT * FROM mantenimiento_items ORDER BY fecha_vencimiento ASC").all();
}
function createMantenimientoItem(data) {
  const id = 'mt_' + Date.now();
  const ahora = new Date().toISOString();
  master.prepare("INSERT INTO mantenimiento_items (id,tipo,nombre,descripcion,fecha_vencimiento,proveedor,url,notas,estado,creado,actualizado) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, data.tipo||'dominio', data.nombre, data.descripcion||'', data.fecha_vencimiento||null, data.proveedor||'', data.url||'', data.notas||'', data.estado||'activo', ahora, ahora);
  return id;
}
function updateMantenimientoItem(id, data) {
  const ahora = new Date().toISOString();
  master.prepare("UPDATE mantenimiento_items SET tipo=?,nombre=?,descripcion=?,fecha_vencimiento=?,proveedor=?,url=?,notas=?,estado=?,actualizado=? WHERE id=?")
    .run(data.tipo||'dominio', data.nombre, data.descripcion||'', data.fecha_vencimiento||null, data.proveedor||'', data.url||'', data.notas||'', data.estado||'activo', ahora, id);
}
function deleteMantenimientoItem(id) {
  master.prepare("DELETE FROM mantenimiento_items WHERE id=?").run(id);
}
function getVencimientosProximos(dias) {
  const limite = new Date(Date.now() + (dias||30)*86400000).toISOString().substr(0,10);
  return master.prepare("SELECT COUNT(*) as n FROM mantenimiento_items WHERE fecha_vencimiento IS NOT NULL AND fecha_vencimiento <= ? AND estado = 'activo'").get(limite).n || 0;
}

// ── Textos Legales ──
function getVersionVigente(tipo) {
  return master.prepare("SELECT * FROM textos_legales WHERE tipo=? ORDER BY CAST(version AS REAL) DESC LIMIT 1").get(tipo) || null;
}
function getAllVersiones(tipo) {
  if (tipo) return master.prepare("SELECT * FROM textos_legales WHERE tipo=? ORDER BY CAST(version AS REAL) DESC").all(tipo);
  return master.prepare("SELECT * FROM textos_legales ORDER BY tipo, CAST(version AS REAL) DESC").all();
}
function setVersionVigente(tipo, version, contenidoHash, adminId) {
  const id = 'tl_' + Date.now();
  const vigenteDesde = new Date().toISOString();
  master.prepare("INSERT INTO textos_legales (id, tipo, version, contenido_hash, vigente_desde, creado) VALUES (?,?,?,?,?,?)")
    .run(id, tipo, version, contenidoHash, vigenteDesde, new Date().toISOString());
  saAudit(adminId, 'nueva_version_legal', null, 'Nueva versión ' + version + ' de ' + tipo + ' vigente desde ' + vigenteDesde);
  return id;
}

// ── Consentimiento por Empresa (read from tenant DB for superadmin) ──
function getConsentimientoEstado(empresaCodigo, tipos) {
  const { getEmpresaDB } = require('./db_sqlite');
  try {
    const empDB = getEmpresaDB(empresaCodigo);
    const estado = {};
    for (const tipo of tipos) {
      const vigente = getVersionVigente(tipo);
      if (!vigente) { estado[tipo] = { vigente: null, aceptado: false }; continue; }
      const aceptado = empDB.raw.prepare(
        "SELECT * FROM consentimientos_empresa WHERE empresa_codigo=? AND tipo=? AND version=? ORDER BY creado DESC LIMIT 1"
      ).get(empresaCodigo, tipo, vigente.version);
      estado[tipo] = {
        vigente: vigente.version,
        vigente_desde: vigente.vigente_desde,
        aceptado: !!aceptado,
        aceptado_por: aceptado ? aceptado.aceptado_por : null,
        aceptado_fecha: aceptado ? aceptado.creado : null,
      };
    }
    return estado;
  } catch(e) { return {}; }
}

// ── OAuth Providers (Integration Center) ──
function getOAuthProviders() {
  return master.prepare("SELECT * FROM oauth_providers WHERE enabled=1 ORDER BY orden").all()
    .map(p => ({ ...p, config_schema: JSON.parse(p.config_schema || '{}'), env_keys: JSON.parse(p.env_keys || '[]') }));
}
function getOAuthProvider(provider) {
  const p = master.prepare("SELECT * FROM oauth_providers WHERE provider=?").get(provider);
  if (!p) return null;
  return { ...p, config_schema: JSON.parse(p.config_schema || '{}'), env_keys: JSON.parse(p.env_keys || '[]') };
}
function upsertOAuthProvider(data) {
  const existing = master.prepare("SELECT id FROM oauth_providers WHERE provider=?").get(data.provider);
  const ahora = new Date().toISOString();
  if (existing) {
    master.prepare("UPDATE oauth_providers SET nombre=?,icono=?,categoria=?,config_schema=?,env_keys=?,enabled=?,orden=?,updated_at=? WHERE provider=?")
      .run(data.nombre, data.icono || '🔌', data.categoria || 'ecommerce', JSON.stringify(data.config_schema || {}), JSON.stringify(data.env_keys || []), data.enabled !== false ? 1 : 0, data.orden || 99, ahora, data.provider);
  } else {
    master.prepare("INSERT INTO oauth_providers (id,provider,nombre,icono,categoria,config_schema,env_keys,enabled,orden,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run('prov_' + Date.now(), data.provider, data.nombre, data.icono || '🔌', data.categoria || 'ecommerce', JSON.stringify(data.config_schema || {}), JSON.stringify(data.env_keys || []), data.enabled !== false ? 1 : 0, data.orden || 99, ahora);
  }
}

// ── Empresa Integraciones (per-company integration toggles) ──
function getEmpresaIntegraciones(empresaId) {
  return master.prepare("SELECT * FROM empresa_integraciones WHERE empresa_id=? ORDER BY provider").all(empresaId);
}
function getEmpresaIntegracionesHabilitadas(empresaId) {
  return master.prepare("SELECT provider FROM empresa_integraciones WHERE empresa_id=? AND habilitado=1").all(empresaId).map(r => r.provider);
}
function setEmpresaIntegracion(empresaId, provider, habilitado) {
  const ahora = new Date().toISOString();
  const existing = master.prepare("SELECT id FROM empresa_integraciones WHERE empresa_id=? AND provider=?").get(empresaId, provider);
  if (existing) {
    master.prepare("UPDATE empresa_integraciones SET habilitado=?, actualizado=? WHERE empresa_id=? AND provider=?")
      .run(habilitado ? 1 : 0, ahora, empresaId, provider);
  } else {
    master.prepare("INSERT INTO empresa_integraciones (id,empresa_id,provider,habilitado,creado,actualizado) VALUES (?,?,?,?,?,?)")
      .run('ei_' + Date.now(), empresaId, provider, habilitado ? 1 : 0, ahora, ahora);
  }
}
function setEmpresaIntegracionesBatch(empresaId, providers) {
  providers.forEach(({ provider, habilitado }) => setEmpresaIntegracion(empresaId, provider, habilitado));
}

function syncEmpresaIntegracionesDesdePlan(empresaId, planId) {
  const plan = getPlan(planId);
  if (!plan) return;
  const integracionesPlan = plan.integraciones || [];
  const allProviders = getOAuthProviders().map(p => p.provider);
  for (const provider of allProviders) {
    const habilitado = integracionesPlan.includes(provider);
    setEmpresaIntegracion(empresaId, provider, habilitado);
  }
}

// Seed oauth_providers
const provCount = master.prepare("SELECT COUNT(*) as n FROM oauth_providers").get().n;
if (provCount === 0) {
  const provDefaults = [
    { provider: 'arca', nombre: 'ARCA / AFIP', icono: '📄', categoria: 'fiscal', env_keys: ['ARCA_ACCESS_TOKEN'], orden: 1 },
    { provider: 'mercadolibre', nombre: 'MercadoLibre', icono: '🛒', categoria: 'ecommerce', env_keys: ['MELI_APP_ID', 'MELI_CLIENT_SECRET'], orden: 2 },
    { provider: 'tiendanube', nombre: 'Tiendanube', icono: '🛍️', categoria: 'ecommerce', env_keys: ['TN_CLIENT_ID', 'TN_CLIENT_SECRET'], orden: 3 },
  ];
  provDefaults.forEach(p => upsertOAuthProvider(p));
  console.log('✓ OAuth providers sembrados:', provDefaults.length, '— ARCA, MercadoLibre, Tiendanube');
}

console.log('✓ Master DB activa — empresas:', master.prepare("SELECT COUNT(*) as n FROM empresas").get().n);
module.exports = { master, masterDb: master, getEmpresas, getEmpresa, createEmpresa, updateEmpresa, getPlanes, getPlan, getModulos,   saAudit, saPurgeAuditLog, saAuditExtended, isDisposableEmail, getProspectos, getProspecto, getProspectoSeguimiento, getLandingLeads, getDbStats, getGlobalConfig, setGlobalConfig, getAllGlobalConfig, getRubroAtributos, getAllRubrosAtributos, createRubroAtributo, updateRubroAtributo, getAppsDisponibles, getAppDisponible, upsertAppDisponible, getAppsInstaladas, getAppInstalada, installApp, uninstallApp, updateAppStatus, updateAppConfig, logAppEvent, getAppStats, getMantenimientoItems, createMantenimientoItem, updateMantenimientoItem, deleteMantenimientoItem, getVencimientosProximos, getVersionVigente, getAllVersiones, setVersionVigente, getConsentimientoEstado, getOAuthProviders, getOAuthProvider, upsertOAuthProvider, getEmpresaIntegraciones, getEmpresaIntegracionesHabilitadas, setEmpresaIntegracion, setEmpresaIntegracionesBatch, syncEmpresaIntegracionesDesdePlan };
