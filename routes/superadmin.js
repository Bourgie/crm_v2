require('dotenv').config();
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { master, getEmpresas, getEmpresa, createEmpresa, updateEmpresa,
        getPlanes, getPlan, getModulos, saAudit } = require('../db_master');
const { getEmpresaDB } = require('../db_sqlite');

const SA_SECRET = process.env.SA_SECRET || (() => { throw new Error('SA_SECRET no configurado. Revisá el archivo .env'); })();

// ── Superadmin auth middleware ──
function superAuth(req, res, next) {
  const token = (req.headers.authorization||'').replace('Bearer ','');
  if(!token) return res.status(401).json({error:'No autenticado'});
  try {
    const p = jwt.verify(token, SA_SECRET);
    if(p.role !== 'superadmin') return res.status(403).json({error:'Sin permisos'});
    req.sadmin = p;
    next();
  } catch(e) { res.status(401).json({error:'Token inválido o expirado'}); }
}

// ══════════════════════════════════════
// AUTH
// ══════════════════════════════════════
router.post('/login', (req, res) => {
  const { usuario, password } = req.body;
  const sa = master.prepare("SELECT * FROM superadmin WHERE usuario=? AND activo=1").get(usuario);
  if(!sa || !bcrypt.compareSync(password, sa.password))
    return res.status(401).json({error:'Credenciales incorrectas'});
  const token = jwt.sign({id:sa.id, usuario:sa.usuario, nombre:sa.nombre, role:'superadmin'}, SA_SECRET, {expiresIn:'8h'});
  saAudit(sa.id, 'login', null, 'Login superadmin');
  res.json({token, nombre:sa.nombre});
});

router.put('/password', superAuth, (req, res) => {
  const { password_actual, password_nuevo } = req.body;
  if(!password_nuevo || password_nuevo.length < 8)
    return res.status(400).json({error:'Minimo 8 caracteres'});
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(req.sadmin.id);
  if(!sa || !bcrypt.compareSync(password_actual, sa.password))
    return res.status(401).json({error:'Contraseña actual incorrecta'});
  master.prepare("UPDATE superadmin SET password=? WHERE id=?").run(bcrypt.hashSync(password_nuevo,10), req.sadmin.id);
  saAudit(req.sadmin.id, 'cambio_password', null, 'Cambio de contraseña superadmin');
  res.json({ok:true});
});

// ══════════════════════════════════════
// DASHBOARD HEALTH
// ══════════════════════════════════════
router.get('/dashboard', superAuth, (req, res) => {
  const empresas = getEmpresas();
  const planes = getPlanes();
  const hoy = new Date().toISOString().substr(0,10);
  const en7  = new Date(Date.now() +  7*86400000).toISOString().substr(0,10);
  const en30 = new Date(Date.now() + 30*86400000).toISOString().substr(0,10);

  const activas   = empresas.filter(e => e.activo).length;
  const vencidas  = empresas.filter(e => e.activo && e.vencimiento && e.vencimiento < hoy).length;
  const vencer7   = empresas.filter(e => e.activo && e.vencimiento && e.vencimiento >= hoy && e.vencimiento <= en7).length;
  const vencer30  = empresas.filter(e => e.activo && e.vencimiento && e.vencimiento >= hoy && e.vencimiento <= en30).length;

  // MRR: sum of active empresa plan prices
  let mrr = 0;
  empresas.filter(e => e.activo).forEach(e => {
    const plan = planes.find(p => p.id === e.plan_id);
    if (plan && plan.precio) mrr += parseFloat(plan.precio) || 0;
  });

  // Solicitudes de plan pendientes
  let solicitudes_pendientes = 0;
  try {
    solicitudes_pendientes = master.prepare("SELECT COUNT(*) as n FROM solicitudes_plan WHERE estado='pendiente'").get().n;
  } catch(e) {}

  // Empresas nuevas este mes
  const mesActual = hoy.substr(0,7);
  const nuevasMes = master.prepare("SELECT COUNT(*) as n FROM empresas WHERE creado LIKE ?").get(mesActual+'%').n || 0;

  // Growth por mes (últimos 6 meses)
  const growth = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const mes = d.toISOString().substr(0,7);
    const n = master.prepare("SELECT COUNT(*) as n FROM empresas WHERE creado LIKE ?").get(mes+'%').n || 0;
    growth.push({ mes, n });
  }

  // Usage stats
  let totalUsuarios = 0, totalVentas = 0;
  empresas.filter(e => e.activo).forEach(e => {
    try {
      const db = getEmpresaDB(e.codigo);
      totalUsuarios += db.find('usuarios').filter(u => u.activo !== false).length;
      totalVentas   += db.all('ventas').filter(v => !v.anulada).length;
    } catch(err) {}
  });

  res.json({
    empresas_total: empresas.length, empresas_activas: activas,
    vencidas, vencer_7: vencer7, vencer_30: vencer30,
    prox_vencer: vencer7,
    mrr, nuevas_mes: nuevasMes,
    solicitudes_pendientes,
    total_usuarios: totalUsuarios, total_ventas: totalVentas,
    growth, timestamp: new Date().toISOString()
  });
});

// ══════════════════════════════════════
// EMPRESAS (TENANTS)
// ══════════════════════════════════════
router.get('/empresas', superAuth, (req, res) => {
  const planes = getPlanes();
  const empresas = getEmpresas().map(e => {
    const plan = planes.find(p=>p.id===e.plan_id) || planes.find(p=>p.codigo==='basic') || {};
    let usuarios=0, ventas=0, clientes=0, sucursales=0;
    try {
      const db = getEmpresaDB(e.codigo);
      usuarios = db.find('usuarios').filter(u=>u.activo!==false).length;
      ventas = db.all('ventas').filter(v=>!v.anulada).length;
      clientes = db.find('clientes').filter(c=>c.activo!==false).length;
      sucursales = db.find('sucursales').filter(s=>s.activo!==false).length;
    } catch(err) {}
    const hoy = new Date().toISOString().substr(0,10);
    const diasVenc = e.vencimiento ? Math.ceil((new Date(e.vencimiento)-new Date())/86400000) : null;
    return {...e, plan_nombre:plan.nombre||e.plan_id||'—', usuarios, ventas, clientes, sucursales, dias_vencimiento:diasVenc};
  });
  res.json(empresas);
});

router.get('/empresas/:codigo', superAuth, (req, res) => {
  const e = getEmpresa(req.params.codigo) || master.prepare("SELECT * FROM empresas WHERE codigo=?").get(req.params.codigo);
  if(!e) return res.status(404).json({error:'No encontrado'});
  try {
    const db = getEmpresaDB(e.codigo);
    const usuarios = db.find('usuarios').filter(u=>u.activo!==false);
    const sucursales = db.find('sucursales').filter(s=>s.activo!==false);
    const ventas = db.all('ventas').length;
    const clientes = db.find('clientes').filter(c=>c.activo!==false).length;
    res.json({...e, usuarios, sucursales, ventas, clientes});
  } catch(err) { res.json({...e, error: err.message}); }
});

router.post('/empresas', superAuth, (req, res) => {
  const { codigo, nombre, rubro, plan_id, admin_email, admin_pass, vencimiento, usuarios_max, sucursales_max } = req.body;
  if(!codigo||!nombre) return res.status(400).json({error:'Código y nombre requeridos'});
  if(!/^[a-z0-9_]+$/.test(codigo)) return res.status(400).json({error:'Solo minúsculas, números y _'});
  if(getEmpresa(codigo)) return res.status(400).json({error:'Ese código ya existe'});
  
  const plan = plan_id ? getPlan(plan_id) : getPlan('basic');
  const limites = plan ? plan.limites : {};
  const id = createEmpresa({
    codigo, nombre, rubro, plan_id: plan?plan.id:null, admin_email,
    vencimiento: vencimiento||null,
    usuarios_max: usuarios_max || (limites.usuarios_max||5),
    sucursales_max: sucursales_max || (limites.sucursales_max||1)
  });

  // Save config in empresa DB
  console.log('[SA] PASO 1 - iniciando DB para empresa:', codigo);
  try {
    const empDB = getEmpresaDB(codigo);
    console.log('[SA] PASO 2 - empDB obtenida OK');
    const modulos = plan ? plan.modulos : ['pos','caja','clientes','ventas','productos','gastos','reportes'];
    try { empDB.setConfig({rubro:rubro||'general', modulos_habilitados:JSON.stringify(modulos)}); } catch(ec) { console.error('[SA] setConfig error:', ec.message); }
    console.log('[SA] PASO 3 - config guardada');

    const { uid } = require('../db_sqlite');
    // Create admin user
    if(admin_email && admin_pass) {
      try {
        const hash = bcrypt.hashSync(admin_pass, 10);
        empDB.insert('usuarios', {id:uid(), nombre:'Admin', apellido:'', usuario:admin_email.split('@')[0],
          email:admin_email, password:hash, rol:'admin', activo:true, roles:JSON.stringify(['admin']), creado:new Date().toISOString()});
        console.log('[SA] PASO 4 - usuario admin creado:', admin_email);
      } catch(eu) { console.error('[SA] Error usuario:', eu.message); }
    } else {
      console.log('[SA] PASO 4 - sin credenciales admin, se omite creación de usuario');
    }

    // Always create sucursal principal
    console.log('[SA] PASO 5 - verificando sucursales existentes...');
    try {
      const allSucs = empDB.find('sucursales', {});
      console.log('[SA] PASO 5b - sucursales totales en DB:', allSucs.length);
      const activeSucs = allSucs.filter(s => s.activo !== false && s.activo !== 0);
      console.log('[SA] PASO 5c - sucursales activas:', activeSucs.length);
      if(activeSucs.length === 0) {
        const sucId = uid();
        empDB.insert('sucursales', {
          id: sucId,
          nombre: nombre,
          dir: '',
          activo: true,
          creado: new Date().toISOString()
        });
        console.log('[SA] PASO 6 - SUCURSAL CREADA id:', sucId, 'empresa:', codigo);
      } else {
        console.log('[SA] PASO 6 - ya existían sucursales, no se crea nueva');
      }
    } catch(es) { console.error('[SA] Error creando sucursal:', es.message, es.stack); }
  } catch(err) { console.error('[SA] Error crítico init empresa DB:', err.message, err.stack); }

  saAudit(req.sadmin.id, 'crear_empresa', id, `Nueva empresa: ${nombre} (${codigo})`);
  res.json({id, ok:true});
});

router.put('/empresas/:id', superAuth, (req, res) => {
  const e = master.prepare("SELECT * FROM empresas WHERE id=?").get(req.params.id);
  if(!e) return res.status(404).json({error:'No encontrado'});
  const { nombre, rubro, plan_id, activo, vencimiento, usuarios_max, sucursales_max, modulos_extra, modulos_bloqueados } = req.body;
  master.prepare(`UPDATE empresas SET nombre=?,rubro=?,plan_id=?,activo=?,vencimiento=?,
    usuarios_max=?,sucursales_max=?,modulos_extra=?,modulos_bloqueados=? WHERE id=?`)
    .run(nombre||e.nombre, rubro||e.rubro, plan_id||e.plan_id, activo!=null?activo:e.activo,
      vencimiento||e.vencimiento, usuarios_max||e.usuarios_max, sucursales_max||e.sucursales_max,
      JSON.stringify(modulos_extra||[]), JSON.stringify(modulos_bloqueados||[]), req.params.id);
  saAudit(req.sadmin.id, 'editar_empresa', req.params.id, `Edit: ${nombre||e.nombre}`);
  res.json({ok:true});
});

// Renovar / extender suscripción
router.post('/empresas/:id/renovar', superAuth, (req, res) => {
  const { meses, fecha_desde } = req.body;
  const e = master.prepare("SELECT * FROM empresas WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ error: 'No encontrada' });
  const base = fecha_desde || e.vencimiento || new Date().toISOString().substr(0,10);
  const nueva = new Date(base);
  nueva.setMonth(nueva.getMonth() + (parseInt(meses) || 1));
  const nuevaFecha = nueva.toISOString().substr(0,10);
  master.prepare("UPDATE empresas SET vencimiento=? WHERE id=?").run(nuevaFecha, req.params.id);
  saAudit(req.sadmin.id, 'renovar_suscripcion', req.params.id,
    `Renovación ${meses} mes(es) — nuevo venc: ${nuevaFecha}`);
  res.json({ ok: true, nuevo_vencimiento: nuevaFecha });
});

// Notas internas por empresa
router.get('/empresas/:id/notas', superAuth, (req, res) => {
  try {
    const rows = master.prepare("SELECT * FROM empresa_notas WHERE empresa_id=? ORDER BY fecha DESC").all(req.params.id);
    res.json(rows);
  } catch(e) { res.json([]); }
});

router.post('/empresas/:id/notas', superAuth, (req, res) => {
  const { texto } = req.body;
  if (!texto) return res.status(400).json({ error: 'Texto requerido' });
  try {
    const id = 'nota_' + Date.now();
    master.prepare("INSERT INTO empresa_notas(id,empresa_id,texto,autor,fecha) VALUES(?,?,?,?,?)")
      .run(id, req.params.id, texto, req.sadmin.nombre || req.sadmin.usuario, new Date().toISOString());
    res.json({ ok: true, id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/empresas/:empId/notas/:notaId', superAuth, (req, res) => {
  master.prepare("DELETE FROM empresa_notas WHERE id=? AND empresa_id=?")
    .run(req.params.notaId, req.params.empId);
  res.json({ ok: true });
});

// Override de módulos por empresa
router.post('/empresas/:id/modulos', superAuth, (req, res) => {
  const { modulos_extra, modulos_bloqueados } = req.body;
  const e = master.prepare("SELECT * FROM empresas WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ error: 'No encontrada' });
  master.prepare("UPDATE empresas SET modulos_extra=?, modulos_bloqueados=? WHERE id=?")
    .run(JSON.stringify(modulos_extra || []), JSON.stringify(modulos_bloqueados || []), req.params.id);
  // Apply to empresa DB config
  try {
    const empDB = getEmpresaDB(e.codigo);
    const plan = getPlanes().find(p => p.id === e.plan_id);
    const baseMods = plan ? (plan.modulos || []) : [];
    const mods_extra = modulos_extra || [];
    const mods_block = modulos_bloqueados || [];
    const final = [...new Set([...baseMods, ...mods_extra])].filter(m => !mods_block.includes(m));
    empDB.setConfig({ modulos_habilitados: JSON.stringify(final) });
  } catch(err) {}
  saAudit(req.sadmin.id, 'modulos_override', req.params.id,
    `Extra: [${(modulos_extra||[]).join(',')}] Bloq: [${(modulos_bloqueados||[]).join(',')}]`);
  res.json({ ok: true });
});


router.delete('/empresas/:id', superAuth, (req, res) => {
  const e = master.prepare("SELECT * FROM empresas WHERE id=?").get(req.params.id);
  if(!e) return res.status(404).json({error:'No encontrado'});
  master.prepare("UPDATE empresas SET activo=0 WHERE id=?").run(req.params.id);
  saAudit(req.sadmin.id, 'suspender_empresa', req.params.id, `Suspendida: ${e.nombre}`);
  res.json({ok:true});
});

// ══ Login as empresa ══
router.post('/empresas/:codigo/login-as', superAuth, (req, res) => {
  const e = getEmpresa(req.params.codigo);
  if(!e) return res.status(404).json({error:'Empresa no encontrada'});
  const empDB = getEmpresaDB(e.codigo);
  const admin = empDB.find('usuarios').find(u=>u.rol==='admin'&&u.activo!==false);
  if(!admin) return res.status(404).json({error:'Sin usuario admin en esta empresa'});
  const { getSecret } = require('../middleware/auth');
  const token = jwt.sign({
    id:admin.id, rol:admin.rol, nombre:admin.nombre,
    empresa:e.codigo, roles:admin.roles, impersonated_by: req.sadmin.usuario
  }, getSecret(), {expiresIn:'2h'});
  saAudit(req.sadmin.id, 'login_as', e.id, `Acceso como: ${e.nombre} (${e.codigo})`);
  res.json({token, empresa:e.codigo, nombre:admin.nombre, empresa_nombre:e.nombre});
});

// ══════════════════════════════════════
// PLANES
// ══════════════════════════════════════
router.get('/planes', superAuth, (req, res) => res.json(getPlanes()));

router.post('/planes', superAuth, (req, res) => {
  const {codigo,nombre,descripcion,precio,moneda,modulos,limites,orden} = req.body;
  if(!codigo||!nombre) return res.status(400).json({error:'Código y nombre requeridos'});
  const id = 'plan_'+Date.now();
  master.prepare("INSERT INTO planes (id,codigo,nombre,descripcion,precio,moneda,modulos,limites,activo,orden) VALUES (?,?,?,?,?,?,?,?,1,?)")
    .run(id,codigo,nombre,descripcion||'',precio||0,moneda||'USD',
      JSON.stringify(modulos||[]),JSON.stringify(limites||{}),orden||99);
  saAudit(req.sadmin.id,'crear_plan',null,`Plan: ${nombre}`);
  res.json({id,ok:true});
});

router.put('/planes/:id', superAuth, (req, res) => {
  const {nombre,descripcion,precio,modulos,limites,activo,orden} = req.body;
  master.prepare("UPDATE planes SET nombre=?,descripcion=?,precio=?,modulos=?,limites=?,activo=?,orden=? WHERE id=?")
    .run(nombre,descripcion||'',precio||0,JSON.stringify(modulos||[]),JSON.stringify(limites||{}),activo?1:0,orden||99,req.params.id);
  saAudit(req.sadmin.id,'editar_plan',null,`Plan: ${nombre}`);
  res.json({ok:true});
});

// ══════════════════════════════════════
// MÓDULOS
// ══════════════════════════════════════
router.get('/modulos', superAuth, (req, res) => res.json(getModulos()));

router.put('/modulos/:id', superAuth, (req, res) => {
  const {nombre,descripcion,premium,beta,activo,orden} = req.body;
  master.prepare("UPDATE modulos SET nombre=?,descripcion=?,premium=?,beta=?,activo=?,orden=? WHERE id=?")
    .run(nombre,descripcion||'',premium?1:0,beta?1:0,activo?1:0,orden||99,req.params.id);
  res.json({ok:true});
});

// ══════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════
// GET /api/sa/version — sin auth, para verificar que el código nuevo está corriendo
router.get('/version', (req, res) => {
  res.json({ version: 'v74', built: '2026-05-08', ok: true });
});

// GET /api/sa/repair-sucursales — repara empresas sin sucursales
router.get('/repair-sucursales', superAuth, (req, res) => {
  const { uid } = require('../db_sqlite');
  const empresas = getEmpresas();
  const report = [];
  for (const emp of empresas) {
    if (!emp.activo) { report.push({codigo: emp.codigo, status: 'skipped-inactive'}); continue; }
    try {
      const empDB = getEmpresaDB(emp.codigo);
      const allSucs = empDB.find('sucursales', {});
      const activas = allSucs.filter(s => s.activo !== false && s.activo !== 0);
      if (activas.length === 0) {
        const newId = uid();
        empDB.insert('sucursales', { id: newId, nombre: emp.nombre, dir: '', activo: true, creado: new Date().toISOString() });
        console.log('[REPAIR] Sucursal creada para empresa:', emp.codigo);
        report.push({codigo: emp.codigo, status: 'fixed', sucursal_id: newId});
      } else {
        report.push({codigo: emp.codigo, status: 'ok', sucursales: activas.length});
      }
    } catch(e) {
      report.push({codigo: emp.codigo, status: 'error', msg: e.message});
    }
  }
  res.json({ report, total: empresas.length });
});

router.get('/audit', superAuth, (req, res) => {
  const rows = master.prepare("SELECT * FROM sa_audit_log ORDER BY fecha DESC LIMIT 200").all();
  res.json(rows);
});

router.get('/solicitudes-plan', superAuth, (req, res) => {
  const rows = master.prepare(`
    SELECT sp.*, e.nombre as empresa_nombre, e.codigo as empresa_codigo,
           e.vencimiento as empresa_vencimiento, e.plan_id as plan_actual_id,
           pa.nombre as plan_actual_nombre, pa.precio as plan_actual_precio,
           pl.nombre as plan_nombre, pl.precio as plan_nuevo_precio
    FROM solicitudes_plan sp
    LEFT JOIN empresas e ON e.codigo = sp.empresa_id
    LEFT JOIN planes pa ON pa.id = e.plan_id
    LEFT JOIN planes pl ON pl.id = sp.plan_id
    ORDER BY sp.fecha DESC
  `).all();
  res.json(rows);
});

router.post('/solicitudes-plan/:id/resolver', superAuth, (req, res) => {
  const { accion } = req.body;
  const sol = master.prepare('SELECT * FROM solicitudes_plan WHERE id=?').get(req.params.id);
  if (!sol) return res.status(404).json({ error: 'No encontrada' });

  master.prepare('UPDATE solicitudes_plan SET estado=? WHERE id=?')
    .run(accion === 'aprobar' ? 'aprobada' : 'rechazada', req.params.id);

  if (accion === 'aprobar') {
    // empresa_id stores the codigo (tenant code)
    const empresa = master.prepare('SELECT * FROM empresas WHERE codigo=?').get(sol.empresa_id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada: ' + sol.empresa_id });
    const plan = getPlan(sol.plan_id);
    if (plan) {
      const limites = typeof plan.limites === 'string' ? JSON.parse(plan.limites || '{}') : (plan.limites || {});
      master.prepare('UPDATE empresas SET plan_id=?,usuarios_max=?,sucursales_max=? WHERE codigo=?')
        .run(sol.plan_id, limites.usuarios_max || 5, limites.sucursales_max || 2, sol.empresa_id);
      // Apply modules to empresa DB
      try {
        const { getEmpresaDB } = require('../db_sqlite');
        const empDB = getEmpresaDB(sol.empresa_id);
        const mods = Array.isArray(plan.modulos) ? plan.modulos :
          (typeof plan.modulos === 'string' ? JSON.parse(plan.modulos || '[]') : []);
        empDB.setConfig({ modulos_habilitados: JSON.stringify(mods) });
        empDB.setConfig({ solicitud_plan: null });
      } catch(e) { console.error('[SA] error applying plan to DB:', e.message); }
    }
  } else {
    // On reject: clear pending request from empresa config
    try {
      const { getEmpresaDB } = require('../db_sqlite');
      const empDB = getEmpresaDB(sol.empresa_id);
      empDB.setConfig({ solicitud_plan: null });
    } catch(e) {}
  }

  saAudit(req.sadmin.id, `plan_${accion}`, sol.empresa_id,
    `Plan ${accion}: ${sol.plan_id} para ${sol.empresa_id}`);
  res.json({ ok: true });
});

// Calcular prorrateo para cambio de plan (usado por frontend empresa)
router.get('/solicitudes-plan/prorate', superAuth, (req, res) => {
  const { empresa_codigo, nuevo_plan_id } = req.query;
  const empresa = master.prepare('SELECT * FROM empresas WHERE codigo=?').get(empresa_codigo);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  const planActual = getPlan(empresa.plan_id);
  const planNuevo  = getPlan(nuevo_plan_id);
  if (!planActual || !planNuevo) return res.json({ tiene_costo: false });

  const hoy = new Date();
  const vto = empresa.vencimiento ? new Date(empresa.vencimiento) : null;
  if (!vto || vto <= hoy) return res.json({ tiene_costo: false, mensaje: 'Suscripción vencida — se aplica precio completo del nuevo plan' });

  const diasRestantes = Math.ceil((vto - hoy) / 86400000);
  const diasMes = 30;
  const precioActual = parseFloat(planActual.precio) || 0;
  const precioNuevo  = parseFloat(planNuevo.precio)  || 0;
  const esUpgrade = precioNuevo > precioActual;

  if (!esUpgrade) {
    return res.json({
      tiene_costo: false,
      es_downgrade: true,
      dias_restantes: diasRestantes,
      mensaje: `Tu plan actual vence el ${empresa.vencimiento}. El nuevo plan se aplicará desde el próximo ciclo. No hay devolución de saldo.`
    });
  }

  const reembolso = (precioActual / diasMes) * diasRestantes;
  const costoNuevo = (precioNuevo / diasMes) * diasRestantes;
  const neto = Math.max(0, costoNuevo - reembolso);

  res.json({
    tiene_costo: true,
    es_upgrade: true,
    dias_restantes: diasRestantes,
    vencimiento_actual: empresa.vencimiento,
    precio_actual: precioActual,
    precio_nuevo: precioNuevo,
    reembolso: Math.round(reembolso * 100) / 100,
    costo_nuevo_periodo: Math.round(costoNuevo * 100) / 100,
    monto_neto: Math.round(neto * 100) / 100,
    mensaje: `Tenés ${diasRestantes} días restantes de tu plan actual ($${precioActual}/mes). Pagás solo la diferencia proporcional: $${Math.round(neto * 100) / 100}`
  });
});

// ══════════════════════════════════════
// BACKUP / IMPORT por empresa
// ══════════════════════════════════════
router.get('/empresas/:codigo/backup', superAuth, (req, res) => {
  const e = getEmpresa(req.params.codigo);
  if (!e) return res.status(404).json({ error: 'Empresa no encontrada' });
  const dbPath = require('path').join(__dirname, '../data', `empresa_${e.codigo}.db`);
  if (!require('fs').existsSync(dbPath)) return res.status(404).json({ error: 'Archivo DB no encontrado' });
  res.download(dbPath, `empresa_${e.codigo}_${new Date().toISOString().substr(0,10)}.db`);
});

router.post('/empresas/:codigo/import', superAuth, (req, res) => {
  const e = getEmpresa(req.params.codigo);
  if (!e) return res.status(404).json({ error: 'Empresa no encontrada' });
  const fs = require('fs');
  const path = require('path');
  const dbPath = path.join(__dirname, '../data', `empresa_${e.codigo}.db`);
  const { data, nombre_archivo } = req.body;
  if (!data) return res.status(400).json({ error: 'Enviá el contenido del archivo en base64 (campo: data)' });
  // Backup current DB
  const backupPath = dbPath + '.bak.' + Date.now();
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);
  try {
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(dbPath, buf);
    // Clear DB cache
    try {
      const mod = require('../db_sqlite');
      if (mod._dbCache) { delete mod._dbCache[e.codigo]; }
    } catch (ec) { /* ignore */ }
    saAudit(req.sadmin.id, 'import_db', e.id, `Import DB: ${e.nombre} (${e.codigo}) — archivo: ${nombre_archivo || 'unknown'}`);
    // Clean up backup
    try { if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); } catch (eu) { /* ignore */ }
    res.json({ ok: true, mensaje: 'Base de datos importada correctamente' });
  } catch (err) {
    // Restore backup
    try { if (fs.existsSync(backupPath)) fs.copyFileSync(backupPath, dbPath); } catch (eu) { /* ignore */ }
    res.status(500).json({ error: 'Error al importar: ' + err.message });
  }
});

module.exports = router;
