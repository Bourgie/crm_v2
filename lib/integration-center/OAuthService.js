// ═══════════════════════════════════════════
// Integration Center — OAuthService
// Manejo de state + flujo OAuth centralizado
// ═══════════════════════════════════════════

class OAuthService {
  /**
   * Valida el state OAuth para una empresa y provider.
   */
  validateState(tenantRepo, provider, receivedState) {
    if (!receivedState) throw new Error('Falta OAuth state');

    const key = `_oauth_state_${provider}`;
    const raw = tenantRepo.getConfig(key);
    if (!raw) throw new Error('State no encontrado — posible replay attack');

    const stored = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!stored || !stored.state) throw new Error('State no encontrado');

    if (Date.now() > stored.expiresAt) {
      tenantRepo.setConfig(key, '');
      throw new Error('State expirado — reiniciá la conexión');
    }

    const crypto = require('crypto');
    if (!crypto.timingSafeEqual(Buffer.from(receivedState), Buffer.from(stored.state))) {
      tenantRepo.setConfig(key, '');
      throw new Error('State inválido — posible CSRF');
    }

    tenantRepo.setConfig(key, '');
    return true;
  }

  /**
   * Extrae el código de empresa desde el state (para callback público sin auth).
   */
  extractEmpresaFromState(state) {
    // El state es un string hex aleatorio. La info de empresa se guarda en DB.
    // Esta función es un placeholder — la empresa se recupera via lookup.
    return null;
  }
}

module.exports = { OAuthService };
