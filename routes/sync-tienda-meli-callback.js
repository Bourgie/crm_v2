const express = require('express');
const router = express.Router();
const { getEmpresa } = require('../db_master');
const { getEmpresaDB } = require('../db_sqlite');

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Faltan parámetros code o state');

  try {
    const empresa = getEmpresa(state);
    if (!empresa) return res.status(404).send('Empresa no encontrada');

    const empDB = getEmpresaDB(state);
    const cfg = empDB.getConfig();
    const appId = cfg.tienda_meli_app_id;
    const secret = cfg.tienda_meli_client_secret;
    if (!appId || !secret) return res.status(400).send('APP_ID o Client Secret no configurados');

    const redirectUri = `${req.protocol}://${req.get('host')}/api/meli-callback`;
    const r = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', client_id: appId, client_secret: secret,
        code, redirect_uri: redirectUri,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || data.error_description || 'Error al obtener token');

    const expiresAt = new Date(Date.now() + (data.expires_in || 21600) * 1000).toISOString();
    empDB.setConfig({
      tienda_meli_access_token: data.access_token,
      tienda_meli_refresh_token: data.refresh_token || cfg.tienda_meli_refresh_token,
      tienda_meli_user_id: String(data.user_id || ''),
      tienda_meli_expires_at: expiresAt,
    });

    res.send(`<!DOCTYPE html><html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#0f172a;color:#fff"><div style="text-align:center"><div style="font-size:48px">✅</div><h2>MercadoLibre conectado</h2><p style="color:#94a3b8">Ya podés cerrar esta ventana</p><script>setTimeout(window.close,1500)</script></div></body></html>`);
  } catch (e) {
    console.error('[MeliCallback] Error:', e.message);
    res.status(500).json({ error: 'Error al conectar con MercadoLibre' });
  }
});

module.exports = router;
