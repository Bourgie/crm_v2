// ═══════════════════════════════════════════
// Integration Center — OAuth Callback Routes
// Endpoints públicos (sin auth) para callbacks OAuth
// ═══════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { IntegrationService } = require('../../lib/integration-center/IntegrationService');
const { getEmpresa } = require('../../db_master');
const rateLimit = require('express-rate-limit');

const callbackLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas solicitudes' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Callback OAuth universal.
 * GET /api/integration-center/:provider/callback?code=xxx&state=xxx&empresa=codigo
 */
router.get('/:provider/callback', callbackLimiter, async (req, res) => {
  try {
    const { code, state, empresa: empresaCodigo } = req.query;
    const providerName = req.params.provider;

    if (!code) return res.status(400).send('Missing authorization code');
    if (!state) return res.status(400).send('Missing state parameter');

    // Resolve empresa from state lookup (state stored per-empresa in DB)
    // First try explicit empresa param, then try all empresas
    let resolvedEmpresa = empresaCodigo;

    if (!resolvedEmpresa) {
      // Search for which empresa has this state
      const empresas = getEmpresa ? getEmpresasFunc() : [];
      const { getEmpresaDB } = require('../../db_sqlite');
      for (const emp of empresas) {
        try {
          const db = getEmpresaDB(emp.codigo);
          const key = `_oauth_state_${providerName}`;
          const storedRaw = db.getConfig(key);
          if (storedRaw) {
            const stored = typeof storedRaw === 'string' ? JSON.parse(storedRaw) : storedRaw;
            if (stored && stored.state === state) {
              resolvedEmpresa = emp.codigo;
              break;
            }
          }
        } catch (_) {}
      }
    }

    if (!resolvedEmpresa) {
      return res.status(400).send('Could not determine empresa from state');
    }

    const service = new IntegrationService();
    const result = await service.handleCallback(providerName, {
      code, state, empresaCodigo: resolvedEmpresa,
    });

    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Conexión exitosa</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#0f172a;color:#fff"><div style="text-align:center"><div style="font-size:48px">✅</div><h2>${providerName} conectado</h2><p style="color:#94a3b8">Ya podés cerrar esta ventana</p><script>if(window.opener){window.opener.postMessage({type:'oauth-callback',provider:'${providerName}',ok:true},'*')}setTimeout(function(){window.close()},1500)</script></div></body></html>`);
  } catch (e) {
    console.error('[OAuth-Callback] Error:', e.message);
    res.status(500).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#0f172a;color:#fff"><div style="text-align:center"><div style="font-size:48px">❌</div><h2>Error de conexión</h2><p style="color:#94a3b8">${e.message}</p><script>if(window.opener){window.opener.postMessage({type:'oauth-callback',ok:false,error:'${e.message.replace(/'/g,"\\'")}'},'*')}</script></div></body></html>`);
  }
});

function getEmpresasFunc() {
  try {
    const { getEmpresas } = require('../../db_master');
    return getEmpresas();
  } catch { return []; }
}

module.exports = router;
