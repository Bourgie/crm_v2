const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getConsentimientosEmpresa } = require('../lib/legal-versions');

router.get('/mis-consentimientos', authMiddleware, (req, res) => {
  try {
    const empresa = req.user.empresa || 'default';
    const isAdmin = req.user.rol === 'admin';
    const consentimientos = getConsentimientosEmpresa(req.db, empresa);
    res.json({ isAdmin, empresa, consentimientos });
  } catch(e) {
    res.status(500).json({ error: 'Error al obtener consentimientos' });
  }
});

router.get('/mis-datos/exportar', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const empresa = req.user.empresa || 'default';
    const userId = req.user.id;
    const sucId = req.user.suc_id;
    const user = db.findOne('usuarios', userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { password, ...userSafe } = user;

    const exportData = {
      exportado: new Date().toISOString(),
      empresa,
      usuario: userSafe,
      clientes: db.where('clientes', c => c.activo !== false),
      productos: db.where('productos', p => p.activo !== false),
      ventas: db.where('ventas', v => v.suc_id === sucId && v.anulada !== true),
      pendientes: db.where('pendientes', p => p.suc_id === sucId && p.estado !== 'cancelado'),
      presupuestos: db.where('presupuestos', p => p.suc_id === sucId),
      consentimientos: getConsentimientosEmpresa(db, empresa),
    };

    const { saAuditExtended } = require('../db_master');
    saAuditExtended('system', 'exportacion_datos', empresa,
      'Usuario ' + (user.email || user.usuario) + ' exportó sus datos', { ip: req.ip || '' });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="mis-datos-' + empresa + '.json"');
    res.json(exportData);
  } catch(e) {
    console.error('[ExportarDatos] Error:', e.message);
    res.status(500).json({ error: 'Error al exportar datos' });
  }
});

router.post('/derecho-oposicion', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const empresa = req.user.empresa || 'default';
    const motivo = req.body.motivo || '';
    db.update('usuarios', userId, { oposicion_comercial: 1, oposicion_motivo: motivo });
    db.audit(req.user, req.user.suc_id, 'legal', 'derecho_oposicion',
      'Usuario ejerció derecho de oposición', userId, { motivo });
    const { saAuditExtended } = require('../db_master');
    saAuditExtended('system', 'derecho_oposicion', empresa,
      'Usuario ' + (req.user.email || req.user.usuario) + ' ejerció derecho de oposición: ' + motivo, { ip: req.ip || '' });
    res.json({ ok: true, mensaje: 'Derecho de oposición registrado. No recibirás comunicaciones comerciales.' });
  } catch(e) {
    console.error('[Oposicion] Error:', e.message);
    res.status(500).json({ error: 'Error al registrar oposición' });
  }
});

module.exports = router;
