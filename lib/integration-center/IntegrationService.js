// ═══════════════════════════════════════════
// Integration Center — IntegrationService
// Orquestador principal de todas las integraciones
// ═══════════════════════════════════════════

const { getProvider } = require('./providers');
const { MasterRepo } = require('./MasterRepo');
const { TenantRepo } = require('./TenantRepo');
const { SecretsManager } = require('./SecretsManager');
const { SyncService } = require('./SyncService');
const { HealthCheckService } = require('./HealthCheckService');
const { AuthError, ConnectionError, ProviderNotFoundError } = require('./errors');

const masterRepo = new MasterRepo();
const secretsManager = new SecretsManager();
const syncService = new SyncService();
const healthCheckService = new HealthCheckService();

class IntegrationService {
  /**
   * Obtiene los providers disponibles para una empresa.
   * Filtra por los habilitados en master DB.
   * @param {string} empresaId - ID de la empresa en master DB
   * @returns {Array}
   */
  getAvailableProviders(empresaId) {
    const allMeta = require('./providers').getAllProvidersMeta();
    const habilitados = masterRepo.getHabilitados(empresaId);

    return allMeta
      .filter(p => habilitados.includes(p.name))
      .map(p => {
        const envStatus = secretsManager.getStatus(p.name);
        return {
          ...p,
          envConfigured: envStatus.every(k => k.configured),
          envKeys: envStatus,
        };
      });
  }

  /**
   * Dashboard de todas las integraciones para una empresa.
   */
  getStatus(empresaCodigo, empresaId) {
    const tenantRepo = new TenantRepo(empresaCodigo);
    const integrations = tenantRepo.getAll();
    const habilitados = masterRepo.getHabilitados(empresaId);

    const byProvider = {};
    for (const name of habilitados) {
      const integration = integrations.find(i => i.provider === name);
      if (integration) {
        byProvider[name] = {
          status: integration.status,
          lastSync: integration.last_sync,
          lastError: integration.last_error,
          healthStatus: integration.health_status,
          lastHealthCheck: integration.last_health_check,
          externalAccountId: integration.external_account_id,
          externalUserId: integration.external_user_id,
          expiresAt: integration.expires_at,
          connected: integration.status === 'connected',
        };
      } else {
        byProvider[name] = {
          status: 'disconnected',
          lastSync: null,
          lastError: null,
          healthStatus: 'unknown',
          lastHealthCheck: null,
          externalAccountId: null,
          connected: false,
        };
      }
    }

    return {
      integraciones: byProvider,
      total: habilitados.length,
      conectadas: Object.values(byProvider).filter(i => i.connected).length,
    };
  }

  /**
   * Inicia el flujo de conexión para un provider.
   */
  async connect(empresaCodigo, empresaId, providerName, extraConfig = {}) {
    // Verificar que está habilitado
    const habilitados = masterRepo.getHabilitados(empresaId);
    if (!habilitados.includes(providerName)) {
      throw new Error(`Provider "${providerName}" no está habilitado para esta empresa`);
    }

    // Verificar env vars
    const envStatus = secretsManager.getStatus(providerName);
    const missing = envStatus.filter(k => !k.configured);
    if (missing.length > 0) {
      throw new Error(`Credenciales no configuradas: ${missing.map(k => k.name).join(', ')}`);
    }

    const provider = getProvider(providerName);
    const tenantRepo = new TenantRepo(empresaCodigo);

    const result = await provider.connect({
      empresaCodigo,
      empresaId,
      ...extraConfig,
    });

    // Non-OAuth providers auto-connect (no callback needed)
    if (!result.url && (result.success || result.connected)) {
      tenantRepo.upsert(providerName, {
        status: 'connected',
      });
      tenantRepo.log({
        provider: providerName,
        tipo: 'connect',
        status: 'success',
        mensaje: 'Conexión automática (non-OAuth)',
      });
      return { connected: true, provider: providerName };
    }

    // OAuth providers — return auth URL
    tenantRepo.log({
      provider: providerName,
      tipo: 'connect',
      status: 'success',
      mensaje: 'Inicio de conexión OAuth',
    });

    return result;
  }

  /**
   * Procesa el callback OAuth.
   */
  async handleCallback(providerName, params) {
    const { code, state, empresaCodigo } = params;
    if (!empresaCodigo) throw new Error('Falta empresaCodigo en callback params');

    const provider = getProvider(providerName);
    const tenantRepo = new TenantRepo(empresaCodigo);

    tenantRepo.log({
      provider: providerName,
      tipo: 'oauth',
      status: 'success',
      mensaje: 'Callback OAuth recibido',
    });

    const tokens = await provider.callback({ code, state, empresaCodigo });

    // Guardar tokens
    tenantRepo.upsert(providerName, {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      status: 'connected',
      external_account_id: tokens.externalAccountId,
      external_user_id: tokens.externalUserId,
      seller_id: tokens.sellerId,
    });

    tenantRepo.log({
      provider: providerName,
      tipo: 'oauth',
      status: 'success',
      mensaje: 'Tokens guardados — conexión exitosa',
    });

    return { ok: true, provider: providerName, connected: true };
  }

  /**
   * Desconecta un provider.
   */
  async disconnect(empresaCodigo, providerName, usuario) {
    const provider = getProvider(providerName);
    const tenantRepo = new TenantRepo(empresaCodigo);

    const existing = tenantRepo.getByProvider(providerName);
    if (existing) {
      try {
        await provider.disconnect({
          accessToken: existing.access_token,
          refreshToken: existing.refresh_token,
        });
      } catch (e) {
        // Non-fatal: proceed with cleanup even if revoke fails
      }
      tenantRepo.delete(providerName);
    }

    tenantRepo.log({
      provider: providerName,
      tipo: 'disconnect',
      status: 'success',
      mensaje: 'Integración desconectada',
      usuario_id: usuario?.id,
      usuario_nombre: usuario?.nombre,
    });

    return { ok: true, disconnected: true };
  }

  /**
   * Sincroniza datos con un provider.
   */
  async sync(empresaCodigo, providerName, entityType, options = {}) {
    const provider = getProvider(providerName);
    const tenantRepo = new TenantRepo(empresaCodigo);

    const integration = tenantRepo.getByProvider(providerName);
    if (!integration || integration.status !== 'connected') {
      throw new Error(`Provider "${providerName}" no está conectado`);
    }

    // Refresh token si está por expirar
    let tokens = {
      accessToken: integration.access_token,
      refreshToken: integration.refresh_token,
      expiresAt: integration.expires_at,
    };

    if (tokens.refreshToken && tokens.expiresAt) {
      const expiresIn = new Date(tokens.expiresAt).getTime() - Date.now();
      if (expiresIn < 60 * 60 * 1000) { // menos de 1 hora
        try {
          const refreshed = await provider.refreshToken(tokens);
          tenantRepo.updateTokens(providerName, refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt);
          tokens = refreshed;
          tenantRepo.log({
            provider: providerName,
            tipo: 'refresh',
            status: 'success',
            mensaje: 'Token refrescado automáticamente',
          });
        } catch (e) {
          tenantRepo.log({
            provider: providerName,
            tipo: 'refresh',
            status: 'error',
            mensaje: `Error refrescando token: ${e.message}`,
          });
        }
      }
    }

    return syncService.syncAsync(tenantRepo, provider, { ...tokens, config: integration.config_json }, entityType, options);
  }

  /**
   * Health check de todas las integraciones de una empresa.
   */
  async healthCheckAll(empresaCodigo) {
    const tenantRepo = new TenantRepo(empresaCodigo);
    return healthCheckService.checkAll(tenantRepo);
  }

  /**
   * Health check de un provider específico.
   */
  async healthCheck(empresaCodigo, providerName) {
    const provider = getProvider(providerName);
    const tenantRepo = new TenantRepo(empresaCodigo);
    const integration = tenantRepo.getByProvider(providerName);

    if (!integration || !integration.access_token) {
      return { ok: false, error: 'No conectado' };
    }

    const tokens = {
      accessToken: integration.access_token,
      refreshToken: integration.refresh_token,
      config: integration.config_json,
    };

    return healthCheckService.check(tenantRepo, provider, tokens);
  }

  /**
   * Obtiene logs de integración para una empresa.
   */
  getLogs(empresaCodigo, filters) {
    const tenantRepo = new TenantRepo(empresaCodigo);
    return tenantRepo.getLogs(filters);
  }

  /**
   * Guarda configuración no-sensible para un provider.
   */
  saveConfig(empresaCodigo, providerName, config) {
    const tenantRepo = new TenantRepo(empresaCodigo);
    const existing = tenantRepo.getByProvider(providerName);

    if (!existing) {
      throw new Error(`Provider "${providerName}" no encontrado`);
    }

    tenantRepo.upsert(providerName, {
      ...existing,
      config_json: JSON.stringify(config),
    });

    tenantRepo.log({
      provider: providerName,
      tipo: 'config',
      status: 'success',
      mensaje: 'Configuración actualizada',
    });

    return { ok: true };
  }

  /**
   * Purga logs antiguos de todas las empresas.
   */
  purgeLogsGlobal(days = 90) {
    const { getEmpresas } = require('../../db_master');
    const empresas = getEmpresas();
    let total = 0;
    for (const empresa of empresas) {
      try {
        const tenantRepo = new TenantRepo(empresa.codigo);
        total += tenantRepo.purgeLogs(days);
      } catch (e) {
        // skip empresas sin DB
      }
    }
    return { purged: total };
  }
}

module.exports = { IntegrationService, masterRepo, secretsManager, syncService, healthCheckService };
