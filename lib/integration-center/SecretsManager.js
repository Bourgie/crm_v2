// ═══════════════════════════════════════════
// Integration Center — SecretsManager
// Lee credenciales de providers desde env vars
// Preparado para futuro: Vault / AWS Secrets Manager
// ═══════════════════════════════════════════

class SecretsManager {
  constructor() {
    this._providerEnvMap = {
      arca: [
        { key: 'ARCA_ACCESS_TOKEN', name: 'Access Token' },
      ],
      mercadolibre: [
        { key: 'MELI_APP_ID', name: 'App ID' },
        { key: 'MELI_CLIENT_SECRET', name: 'Client Secret' },
      ],
      tiendanube: [
        { key: 'TN_CLIENT_ID', name: 'Client ID' },
        { key: 'TN_CLIENT_SECRET', name: 'Client Secret' },
      ],
    };
  }

  /**
   * Obtiene el valor de una variable de entorno para un provider.
   */
  get(provider, key) {
    return process.env[key] || null;
  }

  /**
   * Obtiene todas las keys requeridas y sus valores para un provider.
   * No incluye los valores de las keys sensibles, solo si existen.
   */
  getStatus(provider) {
    const keys = this._providerEnvMap[provider] || [];
    return keys.map(k => ({
      key: k.key,
      name: k.name,
      configured: !!process.env[k.key],
    }));
  }

  /**
   * Valida que todas las keys requeridas para los providers registrados existan.
   * @returns {Array} - [{ provider, missing: [] }]
   */
  validateAll() {
    const missing = [];
    for (const [provider, keys] of Object.entries(this._providerEnvMap)) {
      const missingKeys = keys.filter(k => !process.env[k.key]);
      if (missingKeys.length > 0) {
        missing.push({
          provider,
          missing: missingKeys.map(k => k.key),
          names: missingKeys.map(k => k.name),
        });
      }
    }
    return missing;
  }

  /**
   * Obtiene client_id para un provider OAuth.
   */
  getClientId(provider) {
    const keys = this._providerEnvMap[provider] || [];
    if (keys.length < 2) return null;
    return process.env[keys[0].key] || null;
  }

  /**
   * Obtiene client_secret para un provider OAuth.
   */
  getClientSecret(provider) {
    const keys = this._providerEnvMap[provider] || [];
    if (keys.length < 2) return null;
    return process.env[keys[1].key] || null;
  }
}

module.exports = { SecretsManager };
