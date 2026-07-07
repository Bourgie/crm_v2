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
    admin_email TEXT,
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
`);

// Migration: add email and data columns to existing superadmin
try { master.exec("ALTER TABLE superadmin ADD COLUMN email TEXT"); } catch(e) {}
try { master.exec("ALTER TABLE superadmin ADD COLUMN data TEXT DEFAULT '{}'"); } catch(e) {}
try { master.exec("ALTER TABLE superadmin ADD COLUMN must_change_password INTEGER DEFAULT 0"); } catch(e) {}

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
      id:'plan_basic', codigo:'basic', nombre:'Básico', precio:15, orden:1,
      modulos:JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','proveedores','gastos','reportes']),
      limites:JSON.stringify({usuarios_max:3, sucursales_max:1})
    },
    {
      id:'plan_pro', codigo:'pro', nombre:'Pro', precio:40, orden:2,
      modulos:JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','transferencias','proveedores','gastos','reportes','auditoria','chat','pipeline','arca','tienda']),
      limites:JSON.stringify({usuarios_max:10, sucursales_max:3})
    },
    {
      id:'plan_enterprise', codigo:'enterprise', nombre:'Enterprise', precio:90, orden:3,
      modulos:JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','listabebe','transferencias','proveedores','gastos','reportes','auditoria','chat','pipeline','arca','tienda']),
      limites:JSON.stringify({usuarios_max:999, sucursales_max:999})
    },
  ];
  const stmtPlan = master.prepare("INSERT OR IGNORE INTO planes (id,codigo,nombre,precio,modulos,limites,orden) VALUES (?,?,?,?,?,?,?)");
  PLANES_DEFAULT.forEach(p => stmtPlan.run(p.id,p.codigo,p.nombre,p.precio,p.modulos,p.limites,p.orden));
  console.log('✓ Planes por defecto sembrados:', PLANES_DEFAULT.length);
}

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
    ['plan_basic','basic','Basico',15,JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','proveedores','gastos','reportes']),JSON.stringify({usuarios_max:3,sucursales_max:1}),1],
    ['plan_pro','pro','Pro',40,JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','transferencias','proveedores','gastos','reportes','auditoria','chat','pipeline']),JSON.stringify({usuarios_max:10,sucursales_max:3}),2],
    ['plan_enterprise','enterprise','Enterprise',90,JSON.stringify(['pos','caja','clientes','ventas','productos','ctacte','presupuestos','pendientes','listabebe','transferencias','proveedores','gastos','reportes','auditoria','chat','pipeline']),JSON.stringify({usuarios_max:999,sucursales_max:999}),3],
  ];
  var sp = master.prepare("INSERT OR IGNORE INTO planes (id,codigo,nombre,precio,modulos,limites,activo,orden) VALUES (?,?,?,?,?,?,1,?)");
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
    .map(p => ({...p, modulos: JSON.parse(p.modulos||'[]'), limites: JSON.parse(p.limites||'{}')}));
}
function getPlan(id_or_codigo) {
  const p = master.prepare("SELECT * FROM planes WHERE id=? OR codigo=?").get(id_or_codigo, id_or_codigo);
  if(!p) return null;
  return {...p, modulos: JSON.parse(p.modulos||'[]'), limites: JSON.parse(p.limites||'{}')};
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

console.log('✓ Master DB activa — empresas:', master.prepare("SELECT COUNT(*) as n FROM empresas").get().n);
module.exports = { master, masterDb: master, getEmpresas, getEmpresa, createEmpresa, updateEmpresa, getPlanes, getPlan, getModulos, saAudit, getProspectos, getProspecto, getProspectoSeguimiento, getLandingLeads, getDbStats };
