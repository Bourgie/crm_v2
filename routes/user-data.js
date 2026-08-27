const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getConsentimientosEmpresa, getVersionesVigentes, isInGracePeriod, getGraceDaysLeft } = require('../lib/legal-versions');

router.get('/mis-consentimientos', authMiddleware, (req, res) => {
  try {
    const empresa = req.user.empresa || 'default';
    const isAdmin = req.user.rol === 'admin';
    const consentimientos = getConsentimientosEmpresa(req.db, empresa);
    const versiones = getVersionesVigentes();
    const pendientes = [];
    const tipos = ['terminos', 'privacidad'];
    let graceDays = 0;
    for (const tipo of tipos) {
      const vigente = versiones[tipo];
      if (!vigente) continue;
      const firmado = consentimientos.find(c => c.tipo === tipo && c.version === vigente);
      if (!firmado) {
        pendientes.push({ tipo, version: vigente });
      }
    }
    if (pendientes.length > 0 && isAdmin) {
      const { getVersionVigente } = require('../db_master');
      for (const p of pendientes) {
        const v = getVersionVigente(p.tipo);
        if (v && isInGracePeriod(v.vigente_desde)) {
          const d = getGraceDaysLeft(v.vigente_desde);
          if (d > graceDays) graceDays = d;
        }
      }
    }
    res.json({ isAdmin, empresa, consentimientos, pendientes, grace_days: graceDays });
  } catch(e) {
    console.error('[MisConsentimientos] Error:', e.message);
    res.status(500).json({ error: 'Error al obtener consentimientos' });
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
