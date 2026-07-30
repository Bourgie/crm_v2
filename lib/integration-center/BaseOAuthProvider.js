// ═══════════════════════════════════════════
// Integration Center — BaseOAuthProvider
// Implementa flujo OAuth 2.0 estándar
// ═══════════════════════════════════════════

const crypto = require('crypto');
const { IntegrationProvider } = require('./IntegrationProvider');
const { AuthError, TokenExpiredError } = require('./errors');
const { getEmpresaDB } = require('../../db_sqlite');

class BaseOAuthProvider extends IntegrationProvider {
  constructor() {
    super();
    if (new.target === BaseOAuthProvider) {
      throw new Error('BaseOAuthProvider es abstracta — usá MercadoLibreProvider, TiendanubeProvider');
    }
  }

  // ── Subclases deben definir: ──
  get authUrl() { throw new Error('Definir get authUrl()'); }
  get tokenUrl() { throw new Error('Definir get tokenUrl()'); }
  get scopes() { return []; }
  get usePKCE() { return false; }

  /**
   * Obtiene el client_id desde variables de entorno.
   */
  getClientId() {
    const key = this.requiredEnvKeys[0];
    if (!key) throw new Error(`${this.name}: requiredEnvKeys[0] no definido`);
    return process.env[key];
  }

  /**
   * Obtiene el client_secret desde variables de entorno.
   */
  getClientSecret() {
    const key = this.requiredEnvKeys[1];
    if (!key) throw new Error(`${this.name}: requiredEnvKeys[1] no definido`);
    return process.env[key];
  }

  // ── State management ──

  /**
   * Genera y guarda OAuth state para una empresa.
   */
  generateState(empresaCodigo) {
    const state = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutos
    this._storeState(empresaCodigo, state, expiresAt);
    return state;
  }

  _storeState(empresaCodigo, state, expiresAt) {
    const db = getEmpresaDB(empresaCodigo);
    const key = `_oauth_state_${this.name}`;
    db.setConfig({ [key]: JSON.stringify({ state, expiresAt }) });
  }

  _getStoredState(empresaCodigo) {
    const db = getEmpresaDB(empresaCodigo);
    const key = `_oauth_state_${this.name}`;
    const raw = db.getConfig(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  _clearStoredState(empresaCodigo) {
    const db = getEmpresaDB(empresaCodigo);
    const key = `_oauth_state_${this.name}`;
    db.setConfig({ [key]: '' });
  }

  // ── OAuth Flow ──

  /**
   * Genera URL de autorización OAuth.
   * @returns {object} { url }
   */
  async connect(config) {
    const empresaCodigo = config.empresaCodigo;
    if (!empresaCodigo) throw new Error('Falta empresaCodigo en config');

    const clientId = this.getClientId();
    if (!clientId) throw new Error(`${this.name}: client_id no configurado en variables de entorno`);

    const state = this.generateState(empresaCodigo);
    const redirectUri = config.redirectUri || this._defaultRedirectUri(config);
    const scope = this.scopes.join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
    });
    if (scope) params.set('scope', scope);

    return { url: `${this.authUrl}?${params.toString()}`, state };
  }

  _defaultRedirectUri(config) {
    const base = process.env.APP_URL || 'http://localhost:3000';
    return `${base}/api/integration-center/${this.name}/callback`;
  }

  /**
   * Procesa callback OAuth: intercambia code por tokens.
   */
  async callback(params) {
    const { code, state, empresaCodigo } = params;
    if (!code) throw new AuthError(this.name, 'Falta código de autorización');
    if (!state) throw new AuthError(this.name, 'Falta OAuth state');

    // Validar state
    const stored = this._getStoredState(empresaCodigo);
    if (!stored) throw new AuthError(this.name, 'State no encontrado — posible replay attack');
    if (Date.now() > stored.expiresAt) {
      this._clearStoredState(empresaCodigo);
      throw new AuthError(this.name, 'State expirado — reiniciá la conexión');
    }
    if (!crypto.timingSafeEqual(Buffer.from(state), Buffer.from(stored.state))) {
      this._clearStoredState(empresaCodigo);
      throw new AuthError(this.name, 'State inválido — posible CSRF');
    }
    this._clearStoredState(empresaCodigo);

    // Intercambiar code por tokens
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();
    const redirectUri = params.redirectUri || this._defaultRedirectUri(params);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new AuthError(this.name, data.message || data.error_description || `HTTP ${response.status}`);
    }

    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresAt,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope || this.scopes.join(' '),
      externalAccountId: data.user_id ? String(data.user_id) : null,
      externalUserId: data.user_id ? String(data.user_id) : null,
      sellerId: data.seller_id ? String(data.seller_id) : null,
      raw: data,
    };
  }

  // ── Token Refresh ──

  /**
   * Refresca access token usando refresh token.
   */
  async refreshToken(tokens) {
    if (!tokens.refreshToken) throw new TokenExpiredError(this.name);

    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refreshToken,
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new AuthError(this.name, `Error refrescando token: ${data.message || data.error_description || `HTTP ${response.status}`}`);
    }

    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken,
      expiresAt,
      tokenType: data.token_type || tokens.tokenType || 'Bearer',
    };
  }

  // ── Default implementations ──

  async healthCheck(tokens) {
    return { ok: true, message: 'OAuth provider — health check not implemented' };
  }
}

module.exports = { BaseOAuthProvider };
