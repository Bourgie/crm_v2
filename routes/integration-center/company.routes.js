// ═══════════════════════════════════════════
// Integration Center — Company API Routes
// Endpoints que consumen las empresas (no SuperAdmin)
// ═══════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { authMiddleware, requireRol } = require('../../middleware/auth');
const { IntegrationService } = require('../../lib/integration-center/IntegrationService');
const { getEmpresa } = require('../../db_master');

const service = new IntegrationService();

router.use(authMiddleware);

// ── Dashboard de integraciones ──
router.get('/status', (req, res) => {
  try {
    const empresaCodigo = req.user.empresa || 'default';
    const empresa = getEmpresa(empresaCodigo);
    const result = service.getStatus(empresaCodigo, empresa ? empresa.id : 'emp_default');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Providers disponibles para esta empresa ──
router.get('/available', (req, res) => {
  try {
    const empresaCodigo = req.user.empresa || 'default';
    const empresa = getEmpresa(empresaCodigo);
    const providers = service.getAvailableProviders(empresa ? empresa.id : 'emp_default');
    res.json(providers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Obtener URL de autorización OAuth ──
router.get('/:provider/auth-url', requireRol('admin'), async (req, res) => {
  try {
    const empresaCodigo = req.user.empresa || 'default';
    const empresa = getEmpresa(empresaCodigo);
    const providerName = req.params.provider;

    const redirectUri = `${req.protocol}://${req.get('host')}/api/integration-center/${providerName}/callback`;
    const result = await service.connect(empresaCodigo, empresa ? empresa.id : 'emp_default', providerName, { redirectUri });

    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Desconectar ──
router.post('/:provider/disconnect', requireRol('admin'), async (req, res) => {
  try {
    const empresaCodigo = req.user.empresa || 'default';
    const result = await service.disconnect(empresaCodigo, req.params.provider, req.user);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Sincronizar ──
router.post('/:provider/sync', requireRol('admin', 'supervisor'), async (req, res) => {
  try {
    const empresaCodigo = req.user.empresa || 'default';
    const { entityType, options } = req.body;
    const result = await service.sync(empresaCodigo, req.params.provider, entityType || 'productos', options || {});
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Health check ──
router.get('/:provider/health', requireRol('admin', 'supervisor'), async (req, res) => {
  try {
    const empresaCodigo = req.user.empresa || 'default';
    const result = await service.healthCheck(empresaCodigo, req.params.provider);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Guardar config ──
router.put('/:provider/config', requireRol('admin'), async (req, res) => {
  try {
    const empresaCodigo = req.user.empresa || 'default';
    const result = service.saveConfig(empresaCodigo, req.params.provider, req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Logs de integración ──
router.get('/logs', requireRol('admin', 'supervisor'), (req, res) => {
  try {
    const empresaCodigo = req.user.empresa || 'default';
    const logs = service.getLogs(empresaCodigo, {
      provider: req.query.provider,
      tipo: req.query.tipo,
      limit: parseInt(req.query.limit) || 200,
    });
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
