// ═══════════════════════════════════════════
// Integration Center — IntegrationProvider
// Interfaz base abstracta para todos los providers
// ═══════════════════════════════════════════

class IntegrationProvider {
  constructor() {
    if (new.target === IntegrationProvider) {
      throw new Error('IntegrationProvider es abstracta — extendela para crear un provider');
    }
  }

  // ── Metadata ──
  get name() { throw new Error('Implementar get name()'); }
  get displayName() { return this.name; }
  get icon() { return '🔌'; }
  get category() { return 'general'; }
  get requiredEnvKeys() { return []; }
  // true = las credenciales se cargan por empresa (no desde env vars globales).
  get usesTenantCredentials() { return false; }
  // true = sync() debe bloquear y devolver el resultado real (no background).
  get syncBlocking() { return false; }

  // ── Lifecycle ──

  /**
   * Inicia el proceso de conexión.
   * Para OAuth: retorna URL de autorización.
   * @param {object} config - configuración del provider (no sensible)
   * @returns {Promise<object>} { url } o { success, ... }
   */
  async connect(config) {
    throw new Error(`${this.name}: connect() no implementado`);
  }

  /**
   * Procesa el callback de OAuth (intercambia code por tokens).
   * @param {object} params - code, state, etc
   * @returns {Promise<object>} { accessToken, refreshToken, expiresAt, externalAccountId, ... }
   */
  async callback(params) {
    throw new Error(`${this.name}: callback() no implementado`);
  }

  /**
   * Desconecta / revoca tokens.
   * @param {object} tokens - tokens de la integración
   * @returns {Promise<void>}
   */
  async disconnect(tokens) {
    return;
  }

  // ── Operaciones ──

  /**
   * Sincroniza datos.
   * @param {string} entityType - tipo de entidad (products, orders, etc)
   * @param {object} tokens - tokens de acceso
   * @param {object} options - opciones de sincronización
   * @returns {Promise<object>} resultado de la sincronización
   */
  async sync(entityType, tokens, options = {}) {
    throw new Error(`${this.name}: sync() no implementado`);
  }

  /**
   * Refresca el access token usando el refresh token.
   * @param {object} tokens - tokens actuales
   * @returns {Promise<object>} { accessToken, refreshToken, expiresAt }
   */
  async refreshToken(tokens) {
    throw new Error(`${this.name}: refreshToken() no implementado`);
  }

  /**
   * Verifica el estado de la API externa.
   * @param {object} tokens - tokens de acceso
   * @returns {Promise<object>} { ok, status, responseTime, ... }
   */
  async healthCheck(tokens) {
    throw new Error(`${this.name}: healthCheck() no implementado`);
  }

  /**
   * Prueba la conexión con los tokens actuales.
   * @param {object} tokens - tokens de acceso
   * @returns {Promise<object>} { ok, message }
   */
  async testConnection(tokens) {
    return this.healthCheck(tokens);
  }

  // ── Config ──

  /**
   * Devuelve el schema de configuración no-sensible para UI dinámica.
   * @returns {object} { fields: [{ key, label, type, required, default }] }
   */
  getConfigurationSchema() {
    return { fields: [] };
  }

  /**
   * Valida la configuración no-sensible del provider.
   * @param {object} config - configuración a validar
   * @returns {object} { valid, errors: [] }
   */
  async validateConfig(config) {
    return { valid: true, errors: [] };
  }

  // ── Webhooks ──

  /**
   * Lista de eventos que este provider soporta como webhook entrante.
   */
  getWebhookEvents() {
    return [];
  }

  /**
   * Registra webhooks para este provider.
   * @param {string[]} events - eventos a registrar
   * @param {object} tokens - tokens de acceso
   * @param {string} baseUrl - URL base del CRM para callbacks
   * @returns {Promise<void>}
   */
  async registerWebhooks(events, tokens, baseUrl) {
    return;
  }

  /**
   * Procesa un webhook entrante.
   * @param {object} payload - body del webhook
   * @param {string} signature - firma (si aplica)
   * @returns {Promise<object>} resultado del procesamiento
   */
  async processWebhook(payload, signature) {
    throw new Error(`${this.name}: processWebhook() no implementado`);
  }
}

module.exports = { IntegrationProvider };
