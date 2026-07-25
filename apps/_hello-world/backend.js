// backend.js — Hello World test app
// Recibe el objeto `crm` del SDK

module.exports = function(crm) {

  // ── GET /api/apps/_hello-world/ping ──
  crm.router.get('/ping', (req, res) => {
    crm.log.info('ping recibido');
    res.json({
      ok: true,
      app: crm.appSlug,
      version: crm.manifest.version,
      empresa: crm.empresaCodigo,
      timestamp: new Date().toISOString(),
      message: '¡Hola desde la app Hello World!'
    });
  });

  // ── GET /api/apps/_hello-world/config ──
  crm.router.get('/config', (req, res) => {
    const key = req.query.key;
    if (key) {
      res.json({ key, value: crm.config.get(key) });
    } else {
      res.json(crm.config.getAll());
    }
  });

  // ── PUT /api/apps/_hello-world/config ──
  crm.router.put('/config', (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Falta key' });
    crm.config.set(key, value);
    crm.log.info('config actualizado: ' + key);
    res.json({ ok: true, key, value });
  });

  // ── GET /api/apps/_hello-world/logs ──
  crm.router.get('/logs', (req, res) => {
    try {
      const logs = crm.db.findAll('app_hw_log', '1=1 ORDER BY fecha DESC');
      res.json(logs || []);
    } catch (e) {
      res.json([]);
    }
  });

  // ── POST /api/apps/_hello-world/log ──
  crm.router.post('/log', (req, res) => {
    const { mensaje } = req.body;
    if (!mensaje) return res.status(400).json({ error: 'Falta mensaje' });
    const id = crm.db.shortId('hwlog_');
    crm.db.insert('app_hw_log', { id, mensaje, fecha: new Date().toISOString() });
    crm.log.info('log creado: ' + mensaje);
    res.json({ ok: true, id });
  });

  // ── Suscribirse a eventos globales ──
  crm.events.on('venta.cobrada', (payload) => {
    crm.log.info('Evento venta.cobrada recibido: ' + JSON.stringify(payload).substring(0, 200));
  });

  console.log(`[_hello-world] Backend inicializado para empresa ${crm.empresaCodigo}`);
};
