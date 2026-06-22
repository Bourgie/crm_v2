const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data', 'crm.json');
let _db = null;

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2,6);

function loadFromDisk() {
  if (fs.existsSync(DB_PATH)) {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch(e) {}
  }
  return null;
}

const BACKUP_DIR = path.join(__dirname, 'data', 'backups');

function saveDB() {
  if (!_db) return;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(_db, null, 2), 'utf8');
}

// Auto-backup: guarda una copia diaria en data/backups/
let _lastBackupDate = '';
function autoBackup() {
  try {
    if (!_db) return;
    const today = new Date().toISOString().substr(0, 10);
    if (_lastBackupDate === today) return; // ya se hizo el backup hoy
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `crm_backup_${today}.json`);
    fs.writeFileSync(file, JSON.stringify(_db, null, 2), 'utf8');
    _lastBackupDate = today;
    // Mantener solo los últimos 30 backups
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('crm_backup_') && f.endsWith('.json'))
      .sort();
    if (backups.length > 30) {
      backups.slice(0, backups.length - 30).forEach(f =>
        fs.unlinkSync(path.join(BACKUP_DIR, f))
      );
    }
    console.log(`[backup] Backup creado: ${file}`);
  } catch(e) {
    console.error('[backup] Error en backup:', e.message);
  }
}

// Backup automático cada 6 horas
setInterval(autoBackup, 6 * 60 * 60 * 1000);

function getDB() {
  if (!_db) _db = loadFromDisk() || buildSeed();
  return _db;
}

function initDB() {
  _db = loadFromDisk();
  if (_db) setTimeout(autoBackup, 5000); // backup 5s after start
  if (!_db) { _db = buildSeed(); saveDB(); console.log('Base de datos creada con datos de ejemplo ✓'); }
  return _db;
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────
const db = {
  all: t => getDB()[t] || [],
  find: (t,f={}) => (getDB()[t]||[]).filter(r=>Object.entries(f).every(([k,v])=>r[k]===v)),
  findOne: (t,id) => (getDB()[t]||[]).find(r=>r.id===id)||null,
  where: (t,fn) => (getDB()[t]||[]).filter(fn),
  insert: (t,r) => { if(!getDB()[t])getDB()[t]=[]; getDB()[t].push(r); saveDB(); return r; },
  update: (t,id,d) => {
    const rows=getDB()[t]||[]; const i=rows.findIndex(r=>r.id===id);
    if(i<0)return null; rows[i]={...rows[i],...d}; saveDB(); return rows[i];
  },
  delete: (t,id) => { getDB()[t]=(getDB()[t]||[]).filter(r=>r.id!==id); saveDB(); },
  softDel: (t,id) => db.update(t,id,{activo:false}),
  getConfig: k => { const c=getDB().config||{}; return k?c[k]:c; },
  setConfig: d => { getDB().config={...getDB().config,...d}; saveDB(); },
  save: saveDB,
  raw: getDB,
};

// ── Per-sucursal stock helpers ──
function getStockSuc(prod, suc_id) {
  if (prod.stock_suc && suc_id) return prod.stock_suc[suc_id] || 0;
  return prod.stock || 0; // fallback to global
}

function updateStockSuc(prod_id, suc_id, delta) {
  const db = getDB();
  const prod = db.productos && db.productos.find(p => p.id === prod_id);
  if (!prod) return null;
  if (!prod.stock_suc) prod.stock_suc = {};
  const prev = prod.stock_suc[suc_id] || 0;
  prod.stock_suc[suc_id] = prev + delta;
  // Also update global stock as sum of all sucs
  prod.stock = Object.values(prod.stock_suc).reduce((a, b) => a + b, 0);
  saveDB();
  return { prev, now: prod.stock_suc[suc_id] };
}

module.exports = { db, initDB, uid, saveDB };

// ── SEED ──────────────────────────────────────────────────────────────────────
function buildSeed() {
  const pwHash = bcrypt.hashSync('admin123', 10);
  const pwVend = bcrypt.hashSync('vend123', 10);

  const sucs = [
    {id:'s1',nombre:'Centro',dir:'San Martín 456',ciudad:'Catamarca',tel:'383 421-0000',email:'centro@p.com',responsable:'Laura Gómez',activo:true},
    {id:'s2',nombre:'Alto Verde',dir:'Av. Güemes 1200',ciudad:'Catamarca',tel:'383 421-1111',email:'altoverde@p.com',responsable:'Marcos Díaz',activo:true},
    {id:'s3',nombre:'Villa del Valle',dir:'Belgrano 320',ciudad:'Valle Viejo',tel:'383 421-2222',email:'valle@p.com',responsable:'Ana Rodríguez',activo:true},
  ];

  const usuarios = [
    {id:'u1',nombre:'Administrador',usuario:'admin',email:'admin@p.com',password:pwHash,rol:'admin',suc_id:null,activo:true,creado:new Date().toISOString()},
    {id:'u2',nombre:'Laura Gómez',usuario:'laura',email:'laura@p.com',password:pwHash,rol:'supervisor',suc_id:'s1',activo:true,creado:new Date().toISOString()},
    {id:'u3',nombre:'Marcos Díaz',usuario:'marcos',email:'marcos@p.com',password:pwVend,rol:'vendedor',suc_id:'s2',activo:true,creado:new Date().toISOString()},
    {id:'u4',nombre:'Ana Rodríguez',usuario:'ana',email:'ana@p.com',password:pwVend,rol:'vendedor',suc_id:'s3',activo:true,creado:new Date().toISOString()},
    {id:'u5',nombre:'Carlos Paz',usuario:'carlos',email:'carlos@p.com',password:pwVend,rol:'cajero',suc_id:'s1',activo:true,creado:new Date().toISOString()},
    {id:'u6',nombre:'Sofía Torres',usuario:'sofia',email:'sofia@p.com',password:pwVend,rol:'vendedor',suc_id:'s2',activo:true,creado:new Date().toISOString()},
  ];

  const vendedores = [
    {id:'v1',nombre:'Laura',apellido:'Gómez',dni:'28901234',tel:'383 555-0001',email:'laura@p.com',rol:'supervisor',suc_id:'s1',usuario_id:'u2',comision:5,activo:true},
    {id:'v2',nombre:'Marcos',apellido:'Díaz',dni:'32456789',tel:'383 555-0002',email:'marcos@p.com',rol:'vendedor',suc_id:'s2',usuario_id:'u3',comision:5,activo:true},
    {id:'v3',nombre:'Ana',apellido:'Rodríguez',dni:'35123456',tel:'383 555-0003',email:'ana@p.com',rol:'vendedor',suc_id:'s3',usuario_id:'u4',comision:5,activo:true},
    {id:'v4',nombre:'Carlos',apellido:'Paz',dni:'29876543',tel:'383 555-0004',email:'carlos@p.com',rol:'cajero',suc_id:'s1',usuario_id:'u5',comision:7,activo:true},
    {id:'v5',nombre:'Sofía',apellido:'Torres',dni:'38234567',tel:'383 555-0005',email:'sofia@p.com',rol:'vendedor',suc_id:'s2',usuario_id:'u6',comision:5,activo:true},
  ];

  const clientes = [
    {id:'c1',nombre:'María',apellido:'López',dni:'31234567',tel:'383 600-1001',email:'maria@gmail.com',ciudad:'Catamarca',bebe_nac:'2024-03-15',notas:'Prefiere ropa de algodón',lista:1,limite_credito:50000,activo:true,creado:new Date().toISOString()},
    {id:'c2',nombre:'Valentina',apellido:'Sosa',dni:'33456789',tel:'383 600-1002',email:'valen@gmail.com',ciudad:'Catamarca',bebe_nac:'2023-11-20',notas:'',lista:2,limite_credito:30000,activo:true,creado:new Date().toISOString()},
    {id:'c3',nombre:'Romina',apellido:'Acuña',dni:'29876543',tel:'383 600-1003',email:'romina@hotmail.com',ciudad:'Catamarca',bebe_nac:'2025-01-05',notas:'Baby shower pendiente',lista:1,limite_credito:20000,activo:true,creado:new Date().toISOString()},
    {id:'c4',nombre:'Pablo',apellido:'Herrera',dni:'27654321',tel:'383 600-1004',email:'pablo@gmail.com',ciudad:'Valle Viejo',bebe_nac:'2024-07-22',notas:'',lista:3,limite_credito:100000,activo:true,creado:new Date().toISOString()},
    {id:'c5',nombre:'Claudia',apellido:'Medina',dni:'34567890',tel:'383 600-1005',email:'claudia@yahoo.com',ciudad:'Catamarca',bebe_nac:'2023-09-10',notas:'Cliente frecuente',lista:2,limite_credito:40000,activo:true,creado:new Date().toISOString()},
    {id:'c6',nombre:'Josefina',apellido:'Ruiz',dni:'36789012',tel:'383 600-1006',email:'josei@gmail.com',ciudad:'Catamarca',bebe_nac:'2024-12-01',notas:'',lista:1,limite_credito:20000,activo:true,creado:new Date().toISOString()},
  ];

  const productos = [
    {id:'p1',nombre:'Body Manga Larga',sku:'BML-001',categoria:'Bodies',talle:'0-3m',color:'Blanco',temporada:'Todo el año',costo:1800,precio_l1:3900,precio_l2:3510,precio_l3:2800,stock:12,stock_min:4,stock_max:30,suc_id:'s1',favorito:true,stock_suc:{'s1':12},activo:true},
    {id:'p2',nombre:'Body Manga Larga',sku:'BML-002',categoria:'Bodies',talle:'3-6m',color:'Celeste',temporada:'Todo el año',costo:1800,precio_l1:3900,precio_l2:3510,precio_l3:2800,stock:8,stock_min:4,stock_max:30,suc_id:'s1',favorito:true,stock_suc:{'s1':8},activo:true},
    {id:'p3',nombre:'Conjunto Verano Estampado',sku:'CVE-001',categoria:'Conjuntos',talle:'6-9m',color:'Amarillo',temporada:'Verano 2025',costo:3200,precio_l1:6800,precio_l2:6120,precio_l3:4900,stock:5,stock_min:3,stock_max:20,suc_id:'s1',favorito:true,stock_suc:{'s1':5},activo:true},
    {id:'p4',nombre:'Pijama Polar',sku:'PP-001',categoria:'Pijamas',talle:'12-18m',color:'Gris',temporada:'Invierno 2025',costo:2900,precio_l1:6200,precio_l2:5580,precio_l3:4400,stock:7,stock_min:3,stock_max:20,suc_id:'s1',favorito:false,stock_suc:{'s1':7},activo:true},
    {id:'p5',nombre:'Vestido Floral',sku:'VF-001',categoria:'Vestidos',talle:'2A',color:'Rosa',temporada:'Verano 2025',costo:3500,precio_l1:7500,precio_l2:6750,precio_l3:5400,stock:4,stock_min:2,stock_max:15,suc_id:'s1',favorito:false,stock_suc:{'s1':4},activo:true},
    {id:'p6',nombre:'Remera Algodón',sku:'RA-001',categoria:'Remeras',talle:'3A',color:'Blanco/Azul',temporada:'Verano 2025',costo:1200,precio_l1:2800,precio_l2:2520,precio_l3:1900,stock:15,stock_min:5,stock_max:40,suc_id:'s2',favorito:true,stock_suc:{'s2':15},activo:true},
    {id:'p7',nombre:'Pantalón Jean',sku:'PJ-001',categoria:'Pantalones',talle:'4A',color:'Azul',temporada:'Todo el año',costo:2800,precio_l1:5900,precio_l2:5310,precio_l3:4200,stock:9,stock_min:3,stock_max:25,suc_id:'s2',favorito:false,stock_suc:{'s2':9},activo:true},
    {id:'p8',nombre:'Buzo Capucha',sku:'BC-001',categoria:'Abrigos',talle:'6A',color:'Verde',temporada:'Invierno 2025',costo:3800,precio_l1:8200,precio_l2:7380,precio_l3:5900,stock:6,stock_min:3,stock_max:20,suc_id:'s2',favorito:false,stock_suc:{'s2':6},activo:true},
    {id:'p9',nombre:'Gorra de Sol',sku:'GS-001',categoria:'Accesorios',talle:'RN',color:'Celeste',temporada:'Verano 2025',costo:900,precio_l1:1900,precio_l2:1710,precio_l3:1300,stock:20,stock_min:5,stock_max:50,suc_id:'s1',favorito:true,stock_suc:{'s1':20},activo:true},
    {id:'p10',nombre:'Zapatillas Baby',sku:'ZB-001',categoria:'Calzado',talle:'16',color:'Blanco/Rosa',temporada:'Todo el año',costo:3200,precio_l1:6900,precio_l2:6210,precio_l3:4900,stock:3,stock_min:3,stock_max:15,suc_id:'s3',favorito:false,stock_suc:{'s3':3},activo:true},
    {id:'p11',nombre:'Conjunto Invierno Polar',sku:'CIP-001',categoria:'Conjuntos',talle:'18-24m',color:'Rojo',temporada:'Invierno 2025',costo:4500,precio_l1:9500,precio_l2:8550,precio_l3:6800,stock:5,stock_min:2,stock_max:15,suc_id:'s2',favorito:false,stock_suc:{'s2':5},activo:true},
    {id:'p12',nombre:'Body Unicornio',sku:'BVU-001',categoria:'Bodies',talle:'9-12m',color:'Lila',temporada:'Verano 2025',costo:1900,precio_l1:4200,precio_l2:3780,precio_l3:2900,stock:10,stock_min:4,stock_max:30,suc_id:'s3',favorito:true,stock_suc:{'s3':10},activo:true},
    {id:'p13',nombre:'Ranita Punto',sku:'RP-001',categoria:'Conjuntos',talle:'0-3m',color:'Beige',temporada:'Todo el año',costo:2200,precio_l1:4800,precio_l2:4320,precio_l3:3300,stock:2,stock_min:3,stock_max:20,suc_id:'s1',favorito:false,stock_suc:{'s1':2},activo:true},
  ];

  const proveedores = [
    {id:'pr1',nombre:'Bebés del Norte S.A.',cuit:'30-45678901-2',contacto:'Roberto Villalba',tel:'011 4567-8901',email:'ventas@bebesn.com',categorias:'Bodies, Conjuntos, Pijamas',notas:'Entrega 7 días hábiles',activo:true},
    {id:'pr2',nombre:'Textil Catamarca',cuit:'20-34567890-1',contacto:'Miriam Castro',tel:'383 456-7890',email:'mcasto@textilcat.com',categorias:'Remeras, Pantalones',notas:'Pago contado',activo:true},
    {id:'pr3',nombre:'Kids Fashion Mayorista',cuit:'30-56789012-3',contacto:'Diego Peñaloza',tel:'011 5678-9012',email:'diego@kidsfashion.com',categorias:'Vestidos, Abrigos, Accesorios',notas:'Catálogo por temporada',activo:true},
  ];

  // Generate sample sales
  const pagos=['efectivo','debito','credito','transfer','qr'];
  const ventas=[], venta_items=[];
  const now=new Date();
  for(let i=0;i<70;i++){
    const d=new Date(now); d.setDate(d.getDate()-Math.floor(Math.random()*45));
    const suc=sucs[Math.floor(Math.random()*sucs.length)];
    const vendsF=vendedores.filter(v=>v.suc_id===suc.id);
    const vend=vendsF.length?vendsF[Math.floor(Math.random()*vendsF.length)]:vendedores[0];
    const cli=Math.random()>0.35?clientes[Math.floor(Math.random()*clientes.length)]:null;
    const ni=Math.floor(Math.random()*3)+1;
    let sub=0; const items=[];
    for(let j=0;j<ni;j++){
      const p=productos[Math.floor(Math.random()*productos.length)];
      const qty=Math.floor(Math.random()*2)+1;
      const lista=cli?cli.lista:1;
      const pr=lista===2?p.precio_l2:lista===3?p.precio_l3:p.precio_l1;
      const st=pr*qty; sub+=st;
      items.push({id:uid(),venta_id:'',prod_id:p.id,nombre:p.nombre,talle:p.talle,precio:pr,cantidad:qty,subtotal:st,costo:p.costo});
    }
    const desc=[0,0,0,5,10][Math.floor(Math.random()*5)];
    const total=Math.round(sub*(1-desc/100));
    const vid='v'+uid();
    items.forEach(it=>{it.venta_id=vid; venta_items.push(it);});
    ventas.push({id:vid,numero:1000+i,fecha:d.toISOString(),suc_id:suc.id,vend_id:vend.id,cliente_id:cli?cli.id:null,subtotal:sub,descuento:desc,total,pago:pagos[Math.floor(Math.random()*pagos.length)],comprobante:'ticket',anulada:false});
  }
  ventas.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));

  return {
    config:{
      nombre:'Pequeños & Grandes',cuit:'30-71234567-8',dir:'San Martín 456, Catamarca',
      tel:'383 421-0000',email:'ventas@pequenos.com',moneda:'ARS',iva:'21',comision:'5',
      admin:'Administrador',ticket:'¡Gracias por tu compra! 30 días de cambio con ticket.',
      tema_color:'#F97316',logo:'',modo_oscuro_default:'false',
      ctacte_recargo:'0',ctacte_dias_vto:'30',ctacte_mora:'0',
      pendiente_dias_max:'30',pendiente_seña_min:'30',
      recargo_debito:'0',recargo_credito:'0',recargo_cuotas:'0',
      jwt_secret: uid()+uid()+uid(),
    },
    usuarios,sucursales:sucs,vendedores,clientes,productos,proveedores,
    ventas,venta_items,cajas:[],movimientos_caja:[],
    presupuestos:[],presupuesto_items:[],
    pendientes:[],pendiente_items:[],
    ctacte_movimientos:[],
    stock_movimientos:[],
    auditoria:[],
    prov_oc:[],
    prov_facturas:[],
    prov_pagos_fact:[],
    prov_pagos:[],
    prov_ordenes:[],
  };
}
