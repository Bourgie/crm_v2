require('dotenv').config();
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { master, getEmpresas, getEmpresa, createEmpresa, updateEmpresa,
        getPlanes, getPlan, getModulos, saAudit,
        getProspectos, getProspecto, getProspectoSeguimiento, getLandingLeads, getDbStats,
        getGlobalConfig, setGlobalConfig, getAllGlobalConfig,
        getRubroAtributos, getAllRubrosAtributos, createRubroAtributo, updateRubroAtributo,
        getMantenimientoItems, createMantenimientoItem, updateMantenimientoItem, deleteMantenimientoItem, getVencimientosProximos,
        getAppsDisponibles, getAppDisponible, upsertAppDisponible,
        getAppsInstaladas, getAppInstalada, installApp, uninstallApp, updateAppStatus, updateAppConfig,
        logAppEvent, getAppStats } = require('../db_master');
const { getEmpresaDB } = require('../db_sqlite');
const { validate, superadminLoginSchema } = require('../middleware/validate');

const SA_SECRET = process.env.SA_SECRET || (() => { throw new Error('SA_SECRET no configurado. Revisá el archivo .env'); })();

function setAuthCookie(res, token) {
  res.cookie('sa_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  });
}

// ── Superadmin rate limiters ──
const superadminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos de login superadmin. Esperá 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const superadminForgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Demasiados intentos. Esperá 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Superadmin auth middleware ──
function superAuth(req, res, next) {
  const token = req.cookies?.sa_token || (req.headers.authorization||'').replace('Bearer ','');
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
router.post('/login', superadminLoginLimiter, validate(superadminLoginSchema), async (req, res) => {
  const { usuario, password } = req.body;
  const sa = master.prepare("SELECT * FROM superadmin WHERE usuario=? AND activo=1").get(usuario);
  if(!sa || !await bcrypt.compare(password, sa.password))
    return res.status(401).json({error:'Credenciales incorrectas'});

  if (sa.must_change_password) {
    const tempToken = jwt.sign(
      { id: sa.id, purpose: 'change_password', role: 'superadmin' },
      SA_SECRET,
      { expiresIn: '15m' }
    );
    return res.json({ require_password_change: true, temp_token: tempToken, nombre: sa.nombre });
  }

  // Check if superadmin has 2FA enabled
  let saData = {};
  try { saData = JSON.parse(sa.data || '{}'); } catch(e) {}
  if (saData.twofa_enabled && saData.twofa_secret) {
    const crypto = require('crypto');
    const tempToken = jwt.sign(
      { id: sa.id, purpose: '2fa', role: 'superadmin' },
      SA_SECRET,
      { expiresIn: '5m' }
    );
    return res.json({ require_2fa: true, temp_token: tempToken, nombre: sa.nombre });
  }

  const token = jwt.sign({id:sa.id, usuario:sa.usuario, nombre:sa.nombre, role:'superadmin'}, SA_SECRET, {expiresIn:'8h'});
  saAudit(sa.id, 'login', null, 'Login superadmin');
  setAuthCookie(res, token);
  res.json({nombre:sa.nombre});
});

router.put('/password', superAuth, async (req, res) => {
  const { password_actual, password_nuevo } = req.body;
  if(!password_nuevo || password_nuevo.length < 8)
    return res.status(400).json({error:'Minimo 8 caracteres'});
  if(!/[A-Z]/.test(password_nuevo) || !/[0-9]/.test(password_nuevo) || !/[^A-Za-z0-9]/.test(password_nuevo))
    return res.status(400).json({error:'Debe contener mayúscula, número y símbolo'});
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(req.sadmin.id);
  if(!sa || !await bcrypt.compare(password_actual, sa.password))
    return res.status(401).json({error:'Contraseña actual incorrecta'});

  // Check password history from data field
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  const history = data.password_history || [];
  for (const oldHash of history) {
    if (await bcrypt.compare(password_nuevo, oldHash)) {
      return res.status(400).json({error:'No podés usar una contraseña reciente. Elegí una que no hayas usado antes.'});
    }
  }

  // Save old password to history (keep last 5)
  history.push(sa.password);
  if (history.length > 5) history.shift();
  data.password_history = history;

  master.prepare("UPDATE superadmin SET password=?, data=?, must_change_password=0 WHERE id=?")
    .run(bcrypt.hashSync(password_nuevo,10), JSON.stringify(data), req.sadmin.id);
  saAudit(req.sadmin.id, 'cambio_password', null, 'Cambio de contraseña superadmin');
  res.json({ok:true});
});

// ── Superadmin 2FA ──
const { totp } = require('../lib/totp');

// POST /api/superadmin/2fa/status
router.get('/2fa/status', superAuth, (req, res) => {
  const sa = master.prepare("SELECT data FROM superadmin WHERE id=?").get(req.sadmin.id);
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  res.json({ enabled: !!data.twofa_enabled });
});

// POST /api/superadmin/2fa/setup
router.post('/2fa/setup', superAuth, (req, res) => {
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(req.sadmin.id);
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  if (data.twofa_enabled) return res.status(400).json({ error: 'Ya tenés 2FA activo. Deshabilitalo primero.' });

  const label = sa.email || sa.usuario || 'superadmin';
  const secret = totp.generateSecret();
  const otpauth = totp.toURI({ label, issuer: 'FlexCRM SuperAdmin', secret });
  data.twofa_secret = secret;
  data.twofa_enabled = false;
  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), req.sadmin.id);
  res.json({ secret, otpauth, email: label });
});

// POST /api/superadmin/2fa/confirm
router.post('/2fa/confirm', superAuth, validate(require('../middleware/validate').twofaConfirmSchema), (req, res) => {
  const { code } = req.body;
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(req.sadmin.id);
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  if (!data.twofa_secret) return res.status(400).json({ error: 'Ejecutá /2fa/setup primero' });
  if (data.twofa_enabled) return res.status(400).json({ error: '2FA ya está activo' });

  const isValid = totp.verify({ token: code, secret: data.twofa_secret }).valid;
  if (!isValid) return res.status(400).json({ error: 'Código inválido' });

  // Generate backup codes
  const crypto = require('crypto');
  const backupCodes = [];
  for (let i = 0; i < 10; i++) {
    const bc = crypto.randomBytes(4).toString('hex').toUpperCase();
    backupCodes.push(bc);
  }
  data.twofa_enabled = true;
  data.twofa_backup = backupCodes.map(c => crypto.createHash('sha256').update(c).digest('hex'));
  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), req.sadmin.id);
  saAudit(req.sadmin.id, '2fa_activado', null, '2FA activado');
  res.json({ ok: true, backup_codes: backupCodes, mensaje: '2FA activado. Guardá tus códigos de respaldo.' });
});

// POST /api/superadmin/2fa/disable
router.post('/2fa/disable', superAuth, (req, res) => {
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(req.sadmin.id);
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  delete data.twofa_secret;
  delete data.twofa_enabled;
  delete data.twofa_backup;
  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), req.sadmin.id);
  saAudit(req.sadmin.id, '2fa_desactivado', null, '2FA desactivado');
  res.json({ ok: true, mensaje: '2FA deshabilitado' });
});

// POST /api/superadmin/2fa/verify-login
router.post('/2fa/verify-login', validate(require('../middleware/validate').superadmin2faVerifySchema), (req, res) => {
  const { temp_token, code } = req.body;
  let payload;
  try {
    payload = jwt.verify(temp_token, SA_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Token temporal inválido o expirado' });
  }
  if (payload.purpose !== '2fa' || payload.role !== 'superadmin') {
    return res.status(401).json({ error: 'Token inválido' });
  }
  const sa = master.prepare("SELECT * FROM superadmin WHERE id=?").get(payload.id);
  if (!sa) return res.status(401).json({ error: 'Superadmin no encontrado' });
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  if (!data.twofa_enabled || !data.twofa_secret) return res.status(400).json({ error: '2FA no está activo' });

  const crypto = require('crypto');
  let valid = totp.verify({ token: code, secret: data.twofa_secret }).valid;
  if (!valid) {
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    const bcIndex = (data.twofa_backup || []).indexOf(hash);
    if (bcIndex === -1) return res.status(400).json({ error: 'Código inválido o ya usado' });
    data.twofa_backup.splice(bcIndex, 1);
    master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), req.sadmin.id);
  }

  const token = jwt.sign({id:sa.id, usuario:sa.usuario, nombre:sa.nombre, role:'superadmin'}, SA_SECRET, {expiresIn:'8h'});
  saAudit(sa.id, 'login_2fa', null, 'Login superadmin con 2FA');
  setAuthCookie(res, token);
  res.json({nombre:sa.nombre});
});

router.get('/me', superAuth, (req, res) => {
  const sa = master.prepare("SELECT id, usuario, nombre, email FROM superadmin WHERE id=?").get(req.sadmin.id);
  res.json(sa || { nombre: req.sadmin.nombre });
});

router.post('/logout', (req, res) => {
  res.clearCookie('sa_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.json({ ok: true });
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
  const planesById = new Map(planes.map(p => [p.id, p]));
  for (const e of empresas) {
    if (!e.activo) continue;
    const plan = planesById.get(e.plan_id);
    if (plan && plan.precio) mrr += parseFloat(plan.precio) || 0;
  }

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
  let totalUsuarios = 0, totalVentas = 0, totalVentasMonto = 0, totalClientes = 0;
  let ventasMes = 0, ventasMontoMes = 0;
  const mesActualKey = hoy.substr(0,7);
  for (const e of empresas) {
    if (!e.activo) continue;
    try {
      const db = getEmpresaDB(e.codigo);
      totalUsuarios += db.find('usuarios').filter(u => u.activo !== false).length;
      const ventas = db.all('ventas').filter(v => !v.anulada);
      totalVentas += ventas.length;
      totalVentasMonto += ventas.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
      totalClientes += db.find('clientes').filter(c => c.activo !== false).length;
      // Ventas del mes actual
      const ventasDelMes = ventas.filter(v => v.fecha && v.fecha.substr(0,7) === mesActualKey);
      ventasMes += ventasDelMes.length;
      ventasMontoMes += ventasDelMes.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
    } catch(err) {}
  }
  const ticketPromedio = totalVentas > 0 ? Math.round(totalVentasMonto / totalVentas) : 0;
  const ticketPromedioMes = ventasMes > 0 ? Math.round(ventasMontoMes / ventasMes) : 0;

  res.json({
    empresas_total: empresas.length, empresas_activas: activas,
    vencidas, vencer_7: vencer7, vencer_30: vencer30,
    prox_vencer: vencer7,
    mrr, nuevas_mes: nuevasMes,
    solicitudes_pendientes,
    total_usuarios: totalUsuarios, total_ventas: totalVentas,
    total_ventas_monto: totalVentasMonto, total_clientes: totalClientes,
    ventas_mes: ventasMes, ventas_monto_mes: ventasMontoMes,
    ticket_promedio: ticketPromedio, ticket_promedio_mes: ticketPromedioMes,
    vencimientos_prox: getVencimientosProximos(30),
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
  const { codigo, nombre, rubro, plan_id, admin_email, admin_pass, admin_password, vencimiento, usuarios_max, sucursales_max } = req.body;
  const adminPass = admin_password || admin_pass;
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
    if(admin_email && adminPass) {
      try {
        const hash = bcrypt.hashSync(adminPass, 10);
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
  const e = master.prepare("SELECT * FROM empresas WHERE id=? OR codigo=?").get(req.params.id, req.params.id);
  if(!e) return res.status(404).json({error:'No encontrado'});
  const { nombre, rubro, plan_id, activo, vencimiento, usuarios_max, sucursales_max, modulos_extra, modulos_bloqueados } = req.body;
  master.prepare(`UPDATE empresas SET nombre=?,rubro=?,plan_id=?,activo=?,vencimiento=?,
    usuarios_max=?,sucursales_max=?,modulos_extra=?,modulos_bloqueados=? WHERE id=?`)
    .run(nombre||e.nombre, rubro||e.rubro, plan_id||e.plan_id, activo!=null?activo:e.activo,
      vencimiento||e.vencimiento, usuarios_max||e.usuarios_max, sucursales_max||e.sucursales_max,
      JSON.stringify(modulos_extra||[]), JSON.stringify(modulos_bloqueados||[]), e.id);
  saAudit(req.sadmin.id, 'editar_empresa', e.id, `Edit: ${nombre||e.nombre}`);
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
  try {
    const e = master.prepare("SELECT * FROM empresas WHERE id=? OR codigo=?").get(req.params.id, req.params.id);
    if(!e) return res.status(404).json({error:'No encontrado'});

    const path = require('path');
    const empresaId = e.id;
    const empresaCodigo = e.codigo;

    // Soft delete first (mark inactive)
    master.prepare("UPDATE empresas SET activo=0 WHERE id=?").run(empresaId);
    
    // Try to delete DB file if it exists
    try {
      const dbPath = path.join(__dirname, '../data', `empresa_${empresaCodigo}.db`);
      const fs = require('fs');
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    } catch(fe) { console.error('[DeleteEmpresa] File error:', fe.message); }

    saAudit(req.sadmin.id, 'eliminar_empresa', empresaId, 'Eliminada: ' + (e.nombre||empresaCodigo));
    res.json({ ok: true, mensaje: 'Empresa eliminada.' });
  } catch(err) {
    console.error('[DeleteEmpresa] CRASH:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

// ══ Crear empresa desde backup ══
router.post('/empresas/from-backup', superAuth, (req, res) => {
  const { codigo, nombre, backup_file, rubro, plan_id } = req.body;
  if (!codigo || !nombre || !backup_file) return res.status(400).json({ error: 'Codigo, nombre y archivo de backup requeridos' });
  if (!/^[a-z0-9_]+$/.test(codigo)) return res.status(400).json({ error: 'Solo minusculas, numeros y _' });
  if (getEmpresa(codigo)) return res.status(400).json({ error: 'Ese codigo ya existe' });

  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  try {
    const backupPath = path.join(__dirname, '../data/backups', backup_file);
    if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Archivo de backup no encontrado' });

    // Copy the backup as the new tenant DB
    const destPath = path.join(__dirname, '../data', `empresa_${codigo}.db`);
    fs.copyFileSync(backupPath, destPath);

    // Create empresa in master DB
    createEmpresa({ codigo, nombre, rubro: rubro || 'general', plan_id: plan_id || 'plan_basic', admin_email: req.sadmin?.email || '', vencimiento: null, usuarios_max: 5, sucursales_max: 1 });

    saAudit(req.sadmin.id, 'crear_desde_backup', codigo, `Empresa restaurada desde backup: ${backup_file}`);
    res.json({ ok: true, codigo, mensaje: 'Empresa creada desde backup' });
  } catch(e) {
    console.error('[BackupRestore] Error:', e.message);
    res.status(500).json({ error: 'Error al restaurar: ' + e.message });
  }
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
  try { empDB.audit({ id: admin.id, nombre: admin.nombre + ' (vía ' + req.sadmin.usuario + ')' }, null, 'superadmin', 'login_as', 'Superadmin ' + req.sadmin.usuario + ' accedió como admin', admin.id); } catch(ex) {}
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
  const {codigo,nombre,descripcion,precio,modulos,limites,activo,orden} = req.body;
  master.prepare("UPDATE planes SET codigo=?,nombre=?,descripcion=?,precio=?,modulos=?,limites=?,activo=?,orden=? WHERE id=?")
    .run(codigo||'',nombre,descripcion||'',precio||0,JSON.stringify(modulos||[]),JSON.stringify(limites||{}),activo != null ? (activo ? 1 : 0) : 1,orden||99,req.params.id);
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
// SOLICITUDES DE SOPORTE
// ══════════════════════════════════════
router.get('/solicitudes-soporte', superAuth, (req, res) => {
  try {
    const rows = master.prepare(`
      SELECT ss.*, e.nombre as empresa_nombre
      FROM solicitudes_soporte ss
      LEFT JOIN empresas e ON e.codigo = ss.empresa_id
      ORDER BY ss.fecha DESC
    `).all();
    res.json(rows);
  } catch(e) { res.json([]); }
});

router.post('/solicitudes-soporte/:id/responder', superAuth, (req, res) => {
  const { respuesta } = req.body;
  if (!respuesta) return res.status(400).json({ error: 'Respuesta requerida' });
  master.prepare(`UPDATE solicitudes_soporte SET estado='respondida', respuesta=?, respondido_por=?, fecha_respuesta=? WHERE id=?`)
    .run(respuesta, req.sadmin.nombre || req.sadmin.usuario, new Date().toISOString(), req.params.id);
  saAudit(req.sadmin.id, 'soporte_responder', null, 'Respondida solicitud ' + req.params.id);
  res.json({ ok: true });
});

router.delete('/solicitudes-soporte/:id', superAuth, (req, res) => {
  master.prepare('DELETE FROM solicitudes_soporte WHERE id=?').run(req.params.id);
  saAudit(req.sadmin.id, 'soporte_eliminar', null, 'Eliminada solicitud ' + req.params.id);
  res.json({ ok: true });
});

// ── Reset password de empresa desde superadmin ──
router.post('/empresas/:codigo/reset-password', superAuth, (req, res) => {
  const e = getEmpresa(req.params.codigo);
  if (!e) return res.status(404).json({ error: 'Empresa no encontrada' });
  const { getEmpresaDB } = require('../db_sqlite');
  const empDB = getEmpresaDB(e.codigo);
  const admin = empDB.find('usuarios').find(u => u.rol === 'admin' && u.activo !== false);
  if (!admin) return res.status(404).json({ error: 'Sin usuario admin en esta empresa' });
  const nueva = Math.random().toString(36).slice(2, 10) + 'A1!';
  const hash = bcrypt.hashSync(nueva, 10);
  empDB.update('usuarios', admin.id, { password: hash, debe_cambiar_password: 1 });
  saAudit(req.sadmin.id, 'reset_password', e.id, 'Password reseteado para admin de ' + e.codigo);
  res.json({ ok: true, usuario: admin.usuario, mensaje: 'Contrasea reseteada. Entregala de forma segura al administrador de la empresa.' });
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

// ══════════════════════════════════════
// PROSPECTOS
// ══════════════════════════════════════
router.get('/prospectos', superAuth, (req, res) => {
  try { res.json(getProspectos()) } catch(e) { res.status(500).json({ error: e.message }) }
});

router.get('/prospectos/:id', superAuth, (req, res) => {
  try {
    const p = getProspecto(req.params.id);
    if (!p) return res.status(404).json({ error: 'No encontrado' });
    const seg = getProspectoSeguimiento(req.params.id);
    res.json({ ...p, seguimiento: seg });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/prospectos', superAuth, (req, res) => {
  try {
    const { nombre, telefono, email, empresa_interes, origen, notas, asignado_a } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const id = 'pros_' + Date.now();
    const fecha = new Date().toISOString();
    master.prepare(`INSERT INTO prospectos (id,nombre,telefono,email,empresa_interes,origen,estado,notas,asignado_a,fecha_creacion)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      id, nombre.trim(), (telefono || '').trim(), (email || '').trim(), (empresa_interes || '').trim(),
      origen || 'manual', 'nuevo', notas || '', asignado_a || '', fecha
    );
    saAudit(req.sadmin.id, 'crear_prospecto', null, `Prospecto: ${nombre}`);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.put('/prospectos/:id', superAuth, (req, res) => {
  try {
    const { nombre, telefono, email, empresa_interes, estado, notas, asignado_a } = req.body;
    const p = getProspecto(req.params.id);
    if (!p) return res.status(404).json({ error: 'No encontrado' });
    master.prepare(`UPDATE prospectos SET nombre=?,telefono=?,email=?,empresa_interes=?,estado=?,notas=?,asignado_a=? WHERE id=?`)
      .run(nombre||p.nombre, telefono||p.telefono, email||p.email, empresa_interes||p.empresa_interes,
        estado||p.estado, notas||p.notas, asignado_a||p.asignado_a, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/prospectos/:id/seguimiento', superAuth, (req, res) => {
  try {
    const { tipo, descripcion } = req.body;
    if (!descripcion) return res.status(400).json({ error: 'Descripción requerida' });
    const id = 'seg_' + Date.now();
    const fecha = new Date().toISOString();
    master.prepare(`INSERT INTO prospecto_seguimiento (id,prospecto_id,tipo,descripcion,fecha,creado_por) VALUES (?,?,?,?,?,?)`)
      .run(id, req.params.id, tipo || 'nota', descripcion, fecha, req.sadmin.usuario || 'superadmin');
    master.prepare("UPDATE prospectos SET fecha_ultimo_contacto=?,ultimo_seguimiento=? WHERE id=?")
      .run(fecha, descripcion, req.params.id);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/prospectos/:id/cambiar-estado', superAuth, (req, res) => {
  try {
    const { estado } = req.body;
    if (!['nuevo','contactado','interesado','calificado','cerrado_ganado','cerrado_perdido'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    master.prepare("UPDATE prospectos SET estado=? WHERE id=?").run(estado, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

// ══════════════════════════════════════
// LANDING LEADS
// ══════════════════════════════════════
router.get('/landing-leads', superAuth, (req, res) => {
  try { res.json(getLandingLeads(req.query.no_leidos === 'true')) } catch(e) { res.json([]) }
});

router.put('/landing-leads/:id/leer', superAuth, (req, res) => {
  try { master.prepare("UPDATE landing_leads SET leido=1 WHERE id=?").run(req.params.id); res.json({ ok: true }) }
  catch(e) { res.status(500).json({ error: e.message }) }
});

// ══════════════════════════════════════
// SYSTEM STATS
// ══════════════════════════════════════
router.get('/stats', superAuth, (req, res) => {
  try { res.json(getDbStats()) } catch(e) { res.status(500).json({ error: e.message }) }
});

// ══════════════════════════════════════
// STALE PROSPECT REMINDER
// ══════════════════════════════════════
router.get('/prospectos-recuperables', superAuth, (req, res) => {
  try {
    const { getStaleProspects } = require('../lib/stale-prospect-reminder');
    res.json(getStaleProspects());
  } catch(e) { res.status(500).json({ error: e.message }) }
});

router.post('/prospectos-recuperables/notificar', superAuth, async (req, res) => {
  try {
    const { runStaleCheck } = require('../lib/stale-prospect-reminder');
    await runStaleCheck();
    saAudit(req.sadmin.id, 'notificar_stale_prospects', null, 'Envío manual de recordatorios a prospectos sin seguimiento');
    res.json({ ok: true, mensaje: 'Resumen de prospectos recuperables enviado' });
  } catch(e) { res.status(500).json({ error: e.message }) }
});

// ══════════════════════════════════════
// GLOBAL EMAIL CONFIG (SMTP)
// ══════════════════════════════════════
router.get('/email-config', superAuth, (req, res) => {
  const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_from', 'smtp_from_name'];
  const config = {};
  for (const key of keys) {
    config[key] = getGlobalConfig(key) || '';
  }
  res.json(config);
});

router.put('/email-config', superAuth, (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_from_name } = req.body;
  if (smtp_host) setGlobalConfig('smtp_host', smtp_host);
  if (smtp_port) setGlobalConfig('smtp_port', String(smtp_port));
  if (smtp_user) setGlobalConfig('smtp_user', smtp_user);
  if (smtp_pass && smtp_pass.trim() && !smtp_pass.includes('***')) {
    const { encryptValue } = require('../lib/crypto-utils');
    setGlobalConfig('smtp_pass', encryptValue(smtp_pass));
  }
  if (smtp_from) setGlobalConfig('smtp_from', smtp_from);
  if (smtp_from_name !== undefined) setGlobalConfig('smtp_from_name', smtp_from_name || '');
  saAudit(req.sadmin.id, 'config_smtp', null, 'Configuración SMTP global actualizada');
  res.json({ ok: true });
});

router.post('/email-test', superAuth, (req, res) => {
  const { host, port, user, pass, from, to } = req.body;
  const testTo = to || master.prepare("SELECT email FROM superadmin WHERE id=?").get(req.sadmin.id)?.email || user;
  if (!host || !user || !testTo) return res.status(400).json({ error: 'Faltan datos: host, user y destinatario requeridos' });
  try {
    const { sendEmail } = require('../lib/send-email');
    let smtpPass = pass;
    if (!smtpPass || smtpPass.includes('***')) {
      const { decryptValue } = require('../lib/crypto-utils');
      const encrypted = getGlobalConfig('smtp_pass');
      if (encrypted) smtpPass = decryptValue(encrypted);
    }
    sendEmail(host, parseInt(port) || 465, user, smtpPass, from || user,
      testTo, 'Test de conexión — FlexCRM SuperAdmin',
      `<div style="font-family:sans-serif;padding:20px"><h2>✅ ¡Funciona!</h2><p>Tu configuración SMTP global es correcta.</p><p style="color:#64748b;font-size:12px">Enviado: ${new Date().toLocaleString('es-AR')}</p></div>`
    ).then(() => res.json({ ok: true, message: 'Mail de prueba enviado ✅' }))
      .catch(e => res.status(500).json({ error: 'Error SMTP: ' + e.message }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Superadmin forgot-password ──
router.post('/forgot-password', superadminForgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  const search = (email || '').trim().toLowerCase();
  if (!search) return res.json({ ok: true, mensaje: 'Si la cuenta existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.' });
  // Search by email first, then by usuario
  let sa = master.prepare("SELECT * FROM superadmin WHERE LOWER(email)=? AND activo=1").get(search);
  if (!sa) sa = master.prepare("SELECT * FROM superadmin WHERE LOWER(usuario)=? AND activo=1").get(search);
  if (!sa) return res.json({ ok: true, mensaje: 'Si la cuenta existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.' });
  const userEmail = sa.email || search;
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  // Store reset token in superadmin data
  let data = {};
  try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
  data.reset_token = crypto.createHash('sha256').update(token).digest('hex');
  data.reset_token_expires = expiresAt;
  master.prepare("UPDATE superadmin SET data=? WHERE id=?").run(JSON.stringify(data), sa.id);
  // Try to send email using global SMTP
  const smtpHost = getGlobalConfig('smtp_host');
  const smtpPort = parseInt(getGlobalConfig('smtp_port')) || 465;
  const smtpUser = getGlobalConfig('smtp_user');
  const { decryptValue } = require('../lib/crypto-utils');
  const smtpPass = getGlobalConfig('smtp_pass') ? decryptValue(getGlobalConfig('smtp_pass')) : '';
  const smtpFrom = getGlobalConfig('smtp_from') || smtpUser || '';
  const smtpFromName = getGlobalConfig('smtp_from_name') || 'FlexCRM';
  if (smtpHost && smtpUser && smtpPass && smtpFrom && userEmail) {
    const resetLink = `${process.env.APP_URL || 'https://app.flexcrm.com.ar'}/admin?token=${token}`;
    const { sendEmail } = require('../lib/send-email');
    const html = `<div style="font-family:sans-serif;padding:20px"><h2>Restablecer contraseña</h2><p>Recibiste este email porque solicitaste restablecer tu contraseña de superadmin en FlexCRM.</p><p><a href="${resetLink}" style="display:inline-block;padding:12px 32px;background:#F97316;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px">Restablecer contraseña</a></p><p style="color:#64748b;font-size:12px">Este enlace expira en 1 hora. Si no solicitaste este cambio, ignorá este mensaje.</p></div>`;
    try {
      await sendEmail(smtpHost, smtpPort, smtpUser, smtpPass, `"${smtpFromName}" <${smtpFrom}>`, userEmail, 'Restablecer contraseña — FlexCRM SuperAdmin', html);
      saAudit(sa.id, 'forgot_password', null, 'Token enviado a ' + userEmail);
    } catch(e) {
      console.error('[SA] Error enviando email forgot-password:', e.message);
    }
  } else {
    console.warn('[SA] SMTP global no configurado — token de reset NO enviado por email.');
  }
  res.json({ ok: true, mensaje: 'Si la cuenta existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.' });
});

// ── Superadmin reset-password ──
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token y contraseña requeridos' });
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un símbolo' });
  const crypto = require('crypto');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const admins = master.prepare("SELECT * FROM superadmin WHERE activo=1").all();
  let found = null;
  for (const sa of admins) {
    let data = {};
    try { data = JSON.parse(sa.data || '{}'); } catch(e) {}
    if (data.reset_token === hashedToken && data.reset_token_expires && new Date(data.reset_token_expires) > new Date()) {
      found = sa;
      break;
    }
  }
  if (!found) return res.status(400).json({ error: 'Token inválido o expirado' });
  // Check password history
  let data = {};
  try { data = JSON.parse(found.data || '{}'); } catch(e) {}
  const history = data.password_history || [];
  for (const oldHash of history) {
    if (await bcrypt.compare(password, oldHash)) {
      return res.status(400).json({ error: 'No podés usar una contraseña reciente.' });
    }
  }
  history.push(found.password);
  if (history.length > 5) history.shift();
  data.password_history = history;
  delete data.reset_token;
  delete data.reset_token_expires;
  master.prepare("UPDATE superadmin SET password=?, data=?, must_change_password=0 WHERE id=?")
    .run(bcrypt.hashSync(password, 10), JSON.stringify(data), found.id);
  saAudit(found.id, 'reset_password', null, 'Contraseña restablecida vía token');
  res.json({ ok: true, mensaje: 'Contraseña restablecida correctamente' });
});

// ══════════════════════════════════════
// RUBROS ATRIBUTOS (atributos dinámicos por rubro)
// ══════════════════════════════════════
router.get('/rubros-atributos', superAuth, (req, res) => {
  const rubro = req.query.rubro;
  if (rubro) return res.json(getRubroAtributos(rubro));
  res.json(getAllRubrosAtributos());
});

router.post('/rubros-atributos', superAuth, (req, res) => {
  const { rubro, atributo_key, atributo_label, tipo, opciones, orden } = req.body;
  if (!rubro || !atributo_key || !atributo_label) return res.status(400).json({ error: 'Rubro, key y label requeridos' });
  const id = createRubroAtributo({ rubro, atributo_key, atributo_label, tipo, opciones, orden });
  saAudit(req.sadmin.id, 'crear_atributo_rubro', null, `Atributo ${atributo_key} para rubro ${rubro}`);
  res.json({ id, ok: true });
});

router.put('/rubros-atributos/:id', superAuth, (req, res) => {
  const { rubro, atributo_key, atributo_label, tipo, opciones, orden, activo } = req.body;
  updateRubroAtributo(req.params.id, { rubro, atributo_key, atributo_label, tipo, opciones, orden, activo });
  saAudit(req.sadmin.id, 'editar_atributo_rubro', null, `Atributo ${req.params.id}`);
  res.json({ ok: true });
});

// ══════════════════════════════════════
// APPS (ecosistema)
// ══════════════════════════════════════

// ── Catálogo: listar todas las apps ──
router.get('/apps', superAuth, (req, res) => {
  try {
    const categoria = req.query.categoria || null;
    const apps = getAppsDisponibles(categoria);
    res.json(apps);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Catálogo: crear/actualizar app ──
router.post('/apps', superAuth, (req, res) => {
  try {
    const { slug, nombre, version, descripcion, descripcion_larga, categoria, icono,
            screenshots, precio_base, periodicidad, precio_mensual, precio_anual, trial_dias,
            modulos_requeridos, roles_permitidos, activa, autor, tags, orden, data } = req.body;
    if (!slug || !nombre || !version) return res.status(400).json({ error: 'slug, nombre y version requeridos' });
    upsertAppDisponible({
      slug, nombre, version, descripcion: descripcion || '', descripcion_larga: descripcion_larga || '',
      categoria: categoria || 'general', icono: icono || '📦',
      screenshots: screenshots || [], precio_base: precio_base || 0,
      periodicidad: periodicidad || 'unico', precio_mensual: precio_mensual || 0,
      precio_anual: precio_anual || 0, trial_dias: trial_dias || 0,
      modulos_requeridos: modulos_requeridos || [],
      roles_permitidos: roles_permitidos || [],
      activa: activa !== false, autor: autor || 'FlexCRM',
      tags: tags || [], orden: orden || 99, data: data || {},
    });
    saAudit(req.sadmin.id, 'app_upsert', null, `App: ${nombre} (${slug})`);
    res.json({ ok: true, slug });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Catálogo: actualizar app ──
router.put('/apps/:slug', superAuth, (req, res) => {
  try {
    const existing = getAppDisponible(req.params.slug);
    if (!existing) return res.status(404).json({ error: 'App no encontrada' });
    const data = { ...existing, ...req.body };
    upsertAppDisponible(data);
    saAudit(req.sadmin.id, 'app_update', null, `App actualizada: ${req.params.slug}`);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Instalaciones: listar todas (cross-empresa) ──
router.get('/apps/instaladas', superAuth, (req, res) => {
  try {
    const empresaId = req.query.empresa_id || null;
    if (empresaId) {
      const inst = getAppsInstaladas(empresaId);
      const enriched = inst.map(i => {
        const app = getAppDisponible(i.app_slug);
        return { ...i, app_nombre: app?.nombre || i.app_slug, app_icono: app?.icono || '📦', app_categoria: app?.categoria || 'general' };
      });
      return res.json(enriched);
    }
    // Todas las instalaciones
    const all = master.prepare(`
      SELECT ai.*, e.nombre as empresa_nombre, e.codigo as empresa_codigo,
             ad.nombre as app_nombre, ad.icono as app_icono, ad.categoria as app_categoria
      FROM apps_instaladas ai
      JOIN empresas e ON e.id = ai.empresa_id
      LEFT JOIN apps_disponibles ad ON ad.slug = ai.app_slug
      ORDER BY ai.fecha_instalacion DESC
    `).all();
    res.json(all);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Instalar app en una empresa (forzado desde superadmin) ──
router.post('/apps/instalar', superAuth, (req, res) => {
  try {
    const { empresa_id, app_slug } = req.body;
    if (!empresa_id || !app_slug) return res.status(400).json({ error: 'empresa_id y app_slug requeridos' });

    const app = getAppDisponible(app_slug);
    if (!app) return res.status(404).json({ error: 'App no encontrada en el catálogo' });
    if (!app.activa) return res.status(400).json({ error: 'App no disponible (inactiva)' });

    const empresa = master.prepare("SELECT * FROM empresas WHERE id=?").get(empresa_id);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    installApp(empresa_id, app_slug, app.id, app.version);
    logAppEvent(empresa_id, app_slug, 'installed', null, app.version, req.sadmin.usuario);
    saAudit(req.sadmin.id, 'app_instalar', empresa_id, `App ${app_slug} instalada en ${empresa.nombre}`);

    // Limpiar caché
    try {
      const appLoader = require('../lib/app-loader');
      appLoader.clearTenantCache(empresa.codigo, app_slug);
    } catch(e) {}

    res.json({ ok: true, mensaje: `App "${app.nombre}" instalada en ${empresa.nombre}.` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Desinstalar app de una empresa ──
router.delete('/apps/instaladas/:id', superAuth, (req, res) => {
  try {
    const inst = master.prepare("SELECT * FROM apps_instaladas WHERE id=?").get(req.params.id);
    if (!inst) return res.status(404).json({ error: 'Instalación no encontrada' });

    const empresa = master.prepare("SELECT * FROM empresas WHERE id=?").get(inst.empresa_id);
    const app = getAppDisponible(inst.app_slug);

    uninstallApp(inst.empresa_id, inst.app_slug);
    logAppEvent(inst.empresa_id, inst.app_slug, 'uninstalled', inst.version_instalada, null, req.sadmin.usuario);
    saAudit(req.sadmin.id, 'app_desinstalar', inst.empresa_id,
      `App ${inst.app_slug} desinstalada de ${empresa?.nombre || inst.empresa_id}`);

    if (empresa) {
      try {
        const appLoader = require('../lib/app-loader');
        appLoader.clearTenantCache(empresa.codigo, inst.app_slug);
      } catch(e) {}
    }

    res.json({ ok: true, mensaje: 'App desinstalada.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Activar/desactivar app en empresa ──
router.put('/apps/instaladas/:id/status', superAuth, (req, res) => {
  try {
    const { activa } = req.body;
    const inst = master.prepare("SELECT * FROM apps_instaladas WHERE id=?").get(req.params.id);
    if (!inst) return res.status(404).json({ error: 'Instalación no encontrada' });

    updateAppStatus(inst.empresa_id, inst.app_slug, activa ? 1 : 0);
    logAppEvent(inst.empresa_id, inst.app_slug, activa ? 'activated' : 'deactivated', null, null, req.sadmin.usuario);

    if (!activa) {
      const empresa = master.prepare("SELECT codigo FROM empresas WHERE id=?").get(inst.empresa_id);
      if (empresa) {
        try {
          const appLoader = require('../lib/app-loader');
          appLoader.clearTenantCache(empresa.codigo, inst.app_slug);
        } catch(e) {}
      }
    }

    res.json({ ok: true, activa: !!activa });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Stats de apps ──
router.get('/apps/stats', superAuth, (req, res) => {
  try {
    const stats = getAppStats();
    // Enriquecer con nombres
    stats.porApp = stats.porApp.map(a => {
      const app = getAppDisponible(a.app_slug);
      return { ...a, nombre: app?.nombre || a.app_slug, icono: app?.icono || '📦' };
    });
    res.json(stats);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Liste app registradas en el loader ──
router.get('/apps/registradas', superAuth, (req, res) => {
  try {
    const appLoader = require('../lib/app-loader');
    res.json(appLoader.getRegisteredApps());
  } catch(e) { res.json([]); }
});

// ══════════════════════════════════════
// BACKUP GLOBAL
// ══════════════════════════════════════
router.post('/backup/download', superAuth, (req, res) => {
  try {
    const { makeFullBackup } = require('./backup');
    const result = makeFullBackup();
    saAudit(req.sadmin.id, 'backup_global', null, `Backup: ${result.name} — ${(result.size/1024).toFixed(1)}KB`);
    res.download(result.path, result.name);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════
// MANTENIMIENTO
// ══════════════════════════════════════
router.get('/mantenimiento', superAuth, (req, res) => {
  res.json(getMantenimientoItems());
});

router.post('/mantenimiento', superAuth, (req, res) => {
  const { tipo, nombre, descripcion, fecha_vencimiento, proveedor, url, notas } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const id = createMantenimientoItem({ tipo, nombre, descripcion, fecha_vencimiento, proveedor, url, notas });
  saAudit(req.sadmin.id, 'crear_mantenimiento', null, `Item: ${nombre}`);
  res.json({ id, ok: true });
});

router.put('/mantenimiento/:id', superAuth, (req, res) => {
  const { tipo, nombre, descripcion, fecha_vencimiento, proveedor, url, notas, estado } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  updateMantenimientoItem(req.params.id, { tipo, nombre, descripcion, fecha_vencimiento, proveedor, url, notas, estado });
  saAudit(req.sadmin.id, 'editar_mantenimiento', null, `Item: ${nombre}`);
  res.json({ ok: true });
});

router.delete('/mantenimiento/:id', superAuth, (req, res) => {
  deleteMantenimientoItem(req.params.id);
  saAudit(req.sadmin.id, 'eliminar_mantenimiento', null, `Item: ${req.params.id}`);
  res.json({ ok: true });
});

module.exports = router;
