// ═══════════════════════════════════════════
// Integration Center — Errores tipados
// ═══════════════════════════════════════════

class IntegrationError extends Error {
  constructor(message, code = 'INTEGRATION_ERROR') {
    super(message);
    this.name = 'IntegrationError';
    this.code = code;
  }
}

class ProviderNotFoundError extends IntegrationError {
  constructor(provider) {
    super(`Provider "${provider}" no registrado`, 'PROVIDER_NOT_FOUND');
  }
}

class ConnectionError extends IntegrationError {
  constructor(provider, detail) {
    super(`Error de conexión con ${provider}: ${detail}`, 'CONNECTION_ERROR');
  }
}

class AuthError extends IntegrationError {
  constructor(provider, detail) {
    super(`Error de autenticación con ${provider}: ${detail}`, 'AUTH_ERROR');
  }
}

class ValidationError extends IntegrationError {
  constructor(provider, detail) {
    super(`Validación fallida para ${provider}: ${detail}`, 'VALIDATION_ERROR');
  }
}

class RateLimitError extends IntegrationError {
  constructor(provider, retryAfter) {
    super(`Rate limit excedido en ${provider}. Reintentar en ${retryAfter}s`, 'RATE_LIMIT');
    this.retryAfter = retryAfter;
  }
}

class TokenExpiredError extends IntegrationError {
  constructor(provider) {
    super(`Token expirado para ${provider}`, 'TOKEN_EXPIRED');
  }
}

class WebhookValidationError extends IntegrationError {
  constructor(provider, detail) {
    super(`Webhook de ${provider} inválido: ${detail}`, 'WEBHOOK_VALIDATION');
  }
}

class SyncError extends IntegrationError {
  constructor(provider, detail) {
    super(`Error de sincronización con ${provider}: ${detail}`, 'SYNC_ERROR');
  }
}

module.exports = {
  IntegrationError,
  ProviderNotFoundError,
  ConnectionError,
  AuthError,
  ValidationError,
  RateLimitError,
  TokenExpiredError,
  WebhookValidationError,
  SyncError,
};
