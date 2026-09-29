// ═══════════════════════════════════════════
// Integration Center — HealthCheckService
// Monitorea estado de todas las integraciones
// ═══════════════════════════════════════════

const CACHE_TTL = 30 * 1000; // 30 segundos
const _cache = new Map();

class HealthCheckService {
  /**
   * Ejecuta health check para una integración específica.
   */
  async check(tenantRepo, providerInstance, tokens) {
    const cacheKey = `${tenantRepo.empresaCodigo}:${providerInstance.name}`;
    const cached = _cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.result;
    }

    try {
      const result = await providerInstance.healthCheck(tokens);
      const status = result.ok ? 'healthy' : 'unhealthy';

      tenantRepo.updateHealth(providerInstance.name, status, result.error || null);
      tenantRepo.log({
        provider: providerInstance.name,
        tipo: 'health',
        status: result.ok ? 'success' : 'error',
        mensaje: result.ok ? 'Health check OK' : result.error,
        respuesta_ms: result.responseTimeMs || null,
      });

      _cache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    } catch (e) {
      const result = { ok: false, error: e.message };
      tenantRepo.updateHealth(providerInstance.name, 'unhealthy', e.message);
      tenantRepo.log({
        provider: providerInstance.name,
        tipo: 'health',
        status: 'error',
        mensaje: `Health check error: ${e.message}`,
      });
      _cache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }
  }

  /**
   * Health check para todas las integraciones conectadas.
   */
  async checkAll(tenantRepo) {
    const integrations = tenantRepo.getAll().filter(i => i.status === 'connected');
    const results = {};

    for (const integration of integrations) {
      try {
        const { getProvider } = require('../providers');
        const provider = getProvider(integration.provider);
        const tokens = {
          accessToken: integration.access_token,
          refreshToken: integration.refresh_token,
          expiresAt: integration.expires_at,
          config: tenantRepo.integrationConfig(integration.provider),
        };
        results[integration.provider] = await this.check(tenantRepo, provider, tokens);
      } catch (e) {
        results[integration.provider] = { ok: false, error: e.message };
      }
    }

    return results;
  }

  /**
   * Limpia el cache de health checks.
   */
  clearCache() {
    _cache.clear();
  }
}

module.exports = { HealthCheckService };
