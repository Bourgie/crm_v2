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
const { isValidCuit } = require('../validar-cuit');

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
      // ARCA (facturación) es funcionalidad base: no se gatea por plan.
      .filter(p => p.name === 'arca' || habilitados.includes(p.name))
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
    const providers = Array.from(new Set([...habilitados, 'arca']));

    const byProvider = {};
    for (const name of providers) {
      const integration = integrations.find(i => i.provider === name);

      // ARCA: el estado real se deriva de la config de la empresa
      // (Configuracion > ARCA), no de una fila en company_integrations.
      if (name === 'arca') {
        const c = tenantRepo.integrationConfig('arca');
        const tieneToken = !!c.access_token;
        const tieneCuit = isValidCuit(c.cuit);
        const connected = tieneToken && tieneCuit;
        byProvider[name] = {
          status: connected ? 'connected' : 'disconnected',
          lastSync: integration ? integration.last_sync : null,
          lastError: integration ? integration.last_error : null,
          healthStatus: integration ? integration.health_status : 'unknown',
          lastHealthCheck: integration ? integration.last_health_check : null,
          externalAccountId: c.cuit || null,
          connected,
          configStatus: {
            accessToken: tieneToken,
            cuit: tieneCuit,
            cert: !!c.cert,
            ambiente: c.ambiente,
          },
          configPendiente: !tieneToken ? 'access_token' : (!tieneCuit ? 'cuit' : null),
        };
        continue;
      }

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
      total: providers.length,
      conectadas: Object.values(byProvider).filter(i => i.connected).length,
    };
  }

  /**
   * Inicia el flujo de conexión para un provider.
   */
  async connect(empresaCodigo, empresaId, providerName, extraConfig = {}) {
    // Verificar que está habilitado
    const habilitados = masterRepo.getHabilitados(empresaId);
    const providerClass = getProvider(providerName);
    const isCore = providerName === 'arca';
    if (!isCore && !habilitados.includes(providerName)) {
      throw new Error(`Provider "${providerName}" no está habilitado para esta empresa`);
    }

    // Los providers con credenciales por empresa (ARCA) no usan env vars.
    if (!providerClass.usesTenantCredentials) {
      const envStatus = secretsManager.getStatus(providerName);
      const missing = envStatus.filter(k => !k.configured);
      if (missing.length > 0) {
        throw new Error(`Credenciales no configuradas: ${missing.map(k => k.name).join(', ')}`);
      }
    }

    const provider = providerClass;
    const tenantRepo = new TenantRepo(empresaCodigo);

    const result = await provider.connect({
      empresaCodigo,
      empresaId,
      config: tenantRepo.integrationConfig(providerName),
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
    const config = tenantRepo.integrationConfig(providerName);

    if (provider.usesTenantCredentials) {
      // Valida que la empresa tenga su config completa (lanza con mensaje claro).
      await provider.connect({ config });
      // Asegura la fila de la integración para poder registrar last_sync / health.
      tenantRepo.upsert(providerName, { status: 'connected', config_json: JSON.stringify(config) });
    } else {
      const integration = tenantRepo.getByProvider(providerName);
      if (!integration || integration.status !== 'connected') {
        throw new Error(`Provider "${providerName}" no está conectado`);
      }
    }

    // Refresh token si está por expirar (solo providers OAuth)
    let tokens = { config };
    if (!provider.usesTenantCredentials) {
      const integration = tenantRepo.getByProvider(providerName);
      tokens = {
        accessToken: integration.access_token,
        refreshToken: integration.refresh_token,
        expiresAt: integration.expires_at,
        config,
      };

      if (tokens.refreshToken && tokens.expiresAt) {
        const expiresIn = new Date(tokens.expiresAt).getTime() - Date.now();
        if (expiresIn < 60 * 60 * 1000) { // menos de 1 hora
          try {
            const refreshed = await provider.refreshToken(tokens);
            tenantRepo.updateTokens(providerName, refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt);
            tokens = { ...tokens, ...refreshed };
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
    }

    // ARCA consulta AFIP: bloquea y devuelve el resultado real.
    if (provider.syncBlocking) {
      return syncService.syncNow(tenantRepo, provider, tokens, entityType, options);
    }
    return syncService.syncAsync(tenantRepo, provider, tokens, entityType, options);
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
    const config = tenantRepo.integrationConfig(providerName);

    let tokens;
    if (provider.usesTenantCredentials) {
      if (!config || !config.access_token || !isValidCuit(config.cuit)) {
        return { ok: false, error: 'Falta configurar ARCA en Configuración → ARCA (Access Token y CUIT)' };
      }
      // Asegura la fila para registrar el resultado del health check.
      tenantRepo.upsert(providerName, { status: 'connected', config_json: JSON.stringify(config) });
      tokens = { config };
    } else {
      const integration = tenantRepo.getByProvider(providerName);
      if (!integration || !integration.access_token) {
        return { ok: false, error: 'No conectado' };
      }
      tokens = {
        accessToken: integration.access_token,
        refreshToken: integration.refresh_token,
        config,
      };
    }

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
