const express = require('express');
const router = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol } = require('../middleware/auth');

// GET /config/plan — plan actual de la empresa + planes disponibles
router.get('/plan', authMiddleware, (req, res) => {
  try {
    const { getEmpresa, getPlanes } = require('../db_master');
    const empresa = getEmpresa(req.user.empresa || 'default');
    const planes = getPlanes();
    const planActual = planes.find(p => p.id === (empresa && empresa.plan_id)) || null;
    res.json({ empresa: { nombre: empresa && empresa.nombre, plan_id: empresa && empresa.plan_id, vencimiento: empresa && empresa.vencimiento, usuarios_max: empresa && empresa.usuarios_max, sucursales_max: empresa && empresa.sucursales_max }, plan_actual: planActual, planes });
  } catch(e) { res.json({ empresa: null, plan_actual: null, planes: [] }); }
});

// GET /config/plan/prorate — calcula prorrateo para cambio de plan
router.get('/plan/prorate', authMiddleware, requireRol('admin'), (req, res) => {
  try {
    const { getEmpresa, getPlanes } = require('../db_master');
    const empresa = getEmpresa(req.user.empresa || 'default');
    if (!empresa) return res.json({ tiene_costo: false });
    const planes = getPlanes();
    const planActual = planes.find(p => p.id === empresa.plan_id);
    const planNuevo  = planes.find(p => p.id === req.query.nuevo_plan_id);
    if (!planActual || !planNuevo) return res.json({ tiene_costo: false });

    const hoy = new Date();
    const vto = empresa.vencimiento ? new Date(empresa.vencimiento) : null;
    if (!vto || vto <= hoy) return res.json({ tiene_costo: false, mensaje: 'Suscripción vencida — se aplica precio completo del nuevo plan.' });

    const diasRestantes = Math.ceil((vto - hoy) / 86400000);
    const diasMes = 30;
    const precioActual = parseFloat(planActual.precio) || 0;
    const precioNuevo  = parseFloat(planNuevo.precio)  || 0;
    const esUpgrade = precioNuevo > precioActual;

    if (!esUpgrade) {
      return res.json({
        tiene_costo: false, es_downgrade: true,
        dias_restantes: diasRestantes,
        vencimiento_actual: empresa.vencimiento,
        mensaje: `Tu plan actual vence el ${empresa.vencimiento}. El downgrade se aplica al renovar. No hay devolución de saldo a favor.`
      });
    }

    const reembolso = Math.round((precioActual / diasMes) * diasRestantes * 100) / 100;
    const costoNuevo = Math.round((precioNuevo / diasMes) * diasRestantes * 100) / 100;
    const neto = Math.max(0, Math.round((costoNuevo - reembolso) * 100) / 100);

    res.json({
      tiene_costo: neto > 0, es_upgrade: true,
      dias_restantes: diasRestantes,
      vencimiento_actual: empresa.vencimiento,
      precio_actual: precioActual, precio_nuevo: precioNuevo,
      reembolso, costo_nuevo_periodo: costoNuevo, monto_neto: neto,
      mensaje: `Tenés ${diasRestantes} días restantes en tu plan actual ($${precioActual}/mes). Pagás la diferencia proporcional: $${neto}`
    });
  } catch(e) { res.json({ tiene_costo: false, error: e.message }); }
});

// POST /config/plan/solicitar — solicita cambio de plan
router.post('/plan/solicitar', authMiddleware, requireRol('admin'), (req, res) => {
  const { plan_id, tipo } = req.body;
  const empDB = _getDB(req);
  const solicitud = {
    plan_id, tipo,
    fecha: new Date().toISOString(),
    empresa: req.user.empresa,
    usuario: req.user.nombre,
    estado: 'pendiente'
  };
  // Save in empresa DB (for the user to see)
  empDB.setConfig({ solicitud_plan: JSON.stringify(solicitud) });
  // Also write to master DB so superadmin gets notified
  try {
    const { masterDb } = require('../db_master');
    if (masterDb) {
      const existing = masterDb.prepare('SELECT id FROM solicitudes_plan WHERE empresa_id=? AND estado=?').get(req.user.empresa, 'pendiente');
      if (!existing) {
        masterDb.prepare(`INSERT INTO solicitudes_plan(id,empresa_id,plan_id,tipo,fecha,usuario,estado)
          VALUES(?,?,?,?,?,?,?)`).run(
          'sp' + Date.now(), req.user.empresa, plan_id, tipo,
          solicitud.fecha, req.user.nombre, 'pendiente'
        );
      } else {
        masterDb.prepare(`UPDATE solicitudes_plan SET plan_id=?,tipo=?,fecha=?,usuario=?,estado=? WHERE empresa_id=? AND estado=?`)
          .run(plan_id, tipo, solicitud.fecha, req.user.nombre, 'pendiente', req.user.empresa, 'pendiente');
      }
    }
  } catch(e) { /* master db notification failed silently */ }
  res.json({ ok: true, mensaje: 'Solicitud registrada. El administrador la procesará en breve.' });
});

// ── Enviar solicitud de soporte ──
router.post('/solicitud', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const { tipo, asunto, descripcion } = req.body;
  if (!asunto || !descripcion) return res.status(400).json({ error: 'Asunto y descripción requeridos' });
  const fecha = new Date().toISOString();
  // Guardar en master DB para que el superadmin lo vea
  try {
    const { masterDb } = require('../db_master');
    if (masterDb) {
      masterDb.prepare(`INSERT INTO solicitudes_soporte(id,empresa_id,tipo,asunto,descripcion,fecha,estado,creado_por)
        VALUES(?,?,?,?,?,?,?,?)`).run(
        'ss_' + Date.now(), req.user.empresa, tipo || 'soporte', asunto, descripcion, fecha, 'pendiente', req.user.nombre
      );
    }
  } catch(e) { /* non-fatal */ }
  db.audit(req.user, null, 'config', 'solicitud_soporte', `Solicitud: ${asunto}`);
  res.json({ ok: true, mensaje: 'Solicitud enviada. El administrador la revisará en breve.' });
});

// ── Probar conexión SMTP ──
router.post('/email-test', authMiddleware, (req, res) => {
  const { host, port, user, pass, from } = req.body;
  if (!host || !user) return res.status(400).json({ error: 'SMTP host y usuario requeridos' });
  const emailTo = req.user.email || user;
  try {
    const { sendEmail } = require('../lib/send-email');
    const smtpPass = pass || _getDB(req).getConfig().smtp_pass || '';
    sendEmail(host, parseInt(port) || 465, user, smtpPass, from || user,
      emailTo, 'Test de conexión — FlexCRM',
      `<div style="font-family:sans-serif;padding:20px"><h2>✅ ¡Funciona!</h2><p>Tu configuración SMTP es correcta. Ya podés usar el envío de mails desde FlexCRM.</p><p style="color:#64748b;font-size:12px">Enviado: ${new Date().toLocaleString('es-AR')}</p></div>`
    ).then(() => res.json({ ok: true, message: 'Mail de prueba enviado ✅' }))
      .catch(e => res.status(500).json({ error: 'Error SMTP: ' + e.message }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const SENSITIVE_KEYS = new Set([
  'jwt_secret', 'smtp_pass', 'smtp_user',
  'tienda_woo_key', 'tienda_woo_secret',
  'tienda_tn_access_token',
  'tienda_meli_app_id', 'tienda_meli_client_secret',
  'tienda_meli_access_token', 'tienda_meli_refresh_token',
  'arca_access_token', 'arca_cert', 'arca_key',
]);

const MASK_KEYS = new Set(['arca_access_token', 'arca_cert', 'arca_key']);

router.get('/', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const cfg = { ...db.getConfig() };
  for (const key of SENSITIVE_KEYS) {
    if (key in cfg) {
      if (MASK_KEYS.has(key)) {
        cfg[key] = cfg[key] ? true : false;
      } else {
        delete cfg[key];
      }
    }
  }

  // Incluir apps instaladas
  try {
    const { getEmpresa, getAppsInstaladas } = require('../db_master');
    const empresa = getEmpresa(req.user.empresa || 'default');
    if (empresa) {
      const appLoader = require('../lib/app-loader');
      const instaladas = getAppsInstaladas(empresa.id);
      cfg._apps = instaladas
        .filter(i => i.activa)
        .map(i => {
          const manifest = appLoader.getAppManifest(i.app_slug);
          return {
            slug: i.app_slug,
            nombre: manifest?.nombre || i.app_slug,
            version: i.version_instalada,
            icono: manifest?.icono || '📦',
            categoria: manifest?.categoria || 'general',
            menu: manifest?.menu || null,
            rutas: manifest?.rutas_api || null,
          };
        });
    }
  } catch (e) { /* non-fatal */ }

  res.json(cfg);
});

router.put('/', authMiddleware, requireRol('admin','tesorero'), (req, res) => {
  const db = _getDB(req);
  const { jwt_secret, ...safe } = req.body;

  // El rol tesorero solo puede editar métodos de pago (tipos_pago)
  const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.rol];
  if (!userRoles.includes('admin') && req.user.rol !== 'admin') {
    const permitidos = { tipos_pago: safe.tipos_pago };
    if (safe.tipos_pago !== undefined) db.setConfig(permitidos);
    return res.json({ ok: true });
  }

  // Handle objetivo_mes / objetivo_suc → persist into objetivos_mensuales map
  if (safe.objetivo_mes !== undefined && safe.objetivo_mes !== '') {
    const existing = db.getConfig();
    const objetivos = existing.objetivos_mensuales || {};
    const mes = new Date().toISOString().substr(0, 7);
    const mesKey = mes + '_' + (safe.objetivo_suc || 'global');
    objetivos[mesKey] = parseFloat(safe.objetivo_mes) || 0;
    safe.objetivos_mensuales = objetivos;
  }

  // Skip masked sensitive keys (boolean true/false means "keep existing")
  for (const key of MASK_KEYS) {
    if (key in safe && typeof safe[key] === 'boolean') {
      delete safe[key];
    }
  }

  db.setConfig(safe);
  res.json({ ok: true });
});

// ── Objetivo mensual ──
router.post('/objetivo', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const {mes_key, monto} = req.body;
  if (!mes_key || monto === undefined) return res.status(400).json({error:'Datos incompletos'});
  const cfg = db.getConfig();
  if (!cfg.objetivos_mensuales) cfg.objetivos_mensuales = {};
  cfg.objetivos_mensuales[mes_key] = parseFloat(monto) || 0;
  db.setConfig(cfg);
  res.json({ok:true, mes_key, monto: cfg.objetivos_mensuales[mes_key]});
});

module.exports = router;
