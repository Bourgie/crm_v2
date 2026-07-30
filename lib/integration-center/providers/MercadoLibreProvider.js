// ═══════════════════════════════════════════
// Integration Center — MercadoLibreProvider
// OAuth 2.0 + sync productos/pedidos
// ═══════════════════════════════════════════

const { BaseOAuthProvider } = require('../BaseOAuthProvider');
const { ConnectionError, AuthError } = require('../errors');

class MercadoLibreProvider extends BaseOAuthProvider {
  get name() { return 'mercadolibre'; }
  get displayName() { return 'MercadoLibre'; }
  get icon() { return '🛒'; }
  get category() { return 'ecommerce'; }
  get requiredEnvKeys() { return ['MELI_APP_ID', 'MELI_CLIENT_SECRET']; }

  get authUrl() { return 'https://auth.mercadolibre.com.ar/authorization'; }
  get tokenUrl() { return 'https://api.mercadolibre.com/oauth/token'; }
  get scopes() { return ['read', 'write', 'offline_access']; }

  // ── Token Refresh ──

  async refreshToken(tokens) {
    if (!tokens.refreshToken) throw new AuthError(this.name, 'No hay refresh token');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.getClientId(),
      client_secret: this.getClientSecret(),
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
      throw new AuthError(this.name, data.message || data.error_description || `HTTP ${response.status}`);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in || 21600) * 1000).toISOString(),
      tokenType: data.token_type || 'Bearer',
    };
  }

  // ── API Request helper ──

  async _request(accessToken, method, endpoint, body) {
    const url = `https://api.mercadolibre.com/${endpoint}`;
    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const text = await res.text();

    if (res.status === 401) throw new AuthError(this.name, 'Token expirado o revocado');
    if (res.status === 429) throw new Error('Rate limit excedido');
    if (!res.ok) throw new Error(`ML ${res.status}: ${text.slice(0, 300)}`);

    try { return JSON.parse(text); } catch { return text; }
  }

  // ── Health Check ──

  async healthCheck(tokens) {
    const start = Date.now();
    try {
      await this._request(tokens.accessToken, 'GET', 'users/me');
      return { ok: true, responseTimeMs: Date.now() - start };
    } catch (e) {
      return { ok: false, error: e.message, responseTimeMs: Date.now() - start };
    }
  }

  // ── Sync ──

  async sync(entityType, tokens, options) {
    switch (entityType) {
      case 'productos': return this._syncProductos(tokens, options);
      case 'pedidos': return this._syncPedidos(tokens, options);
      default: throw new Error(`Entity type "${entityType}" no soportado por MercadoLibre`);
    }
  }

  /**
   * Sincroniza stock de productos del CRM hacia MercadoLibre.
   */
  async _syncProductos(tokens, options) {
    const { productos, sellerId } = options;
    if (!sellerId) return { ok: 0, fail: 0, errors: [], total: productos.length, error: 'Seller ID no configurado' };

    let ok = 0;
    const errors = [];

    for (const prod of productos) {
      try {
        const search = await this._request(tokens.accessToken, 'GET',
          `items/search?seller=${sellerId}&sku=${encodeURIComponent(prod.sku)}`);
        const items = search?.results || [];
        if (items.length > 0) {
          await this._request(tokens.accessToken, 'PUT', `items/${items[0]}`,
            { available_quantity: prod.stock || 0 });
        }
        ok++;
      } catch (e) {
        errors.push({ sku: prod.sku, error: e.message });
      }
    }

    return { ok, fail: productos.length - ok, errors, total: productos.length };
  }

  /**
   * Trae pedidos desde MercadoLibre al CRM.
   */
  async _syncPedidos(tokens, options) {
    const { sellerId, db, sucursalId, userId, userName } = options;
    if (!sellerId) return { importadas: 0, error: 'Seller ID no configurado' };

    const orders = await this._request(tokens.accessToken, 'GET',
      `orders/search?seller=${sellerId}&order.status=paid&limit=25`);
    const results = orders?.results || [];
    let importadas = 0;

    for (const order of results) {
      const existing = db.where('ventas', v => v.origen === 'online' && v.id_externo === String(order.id))[0];
      if (existing) continue;

      const items = (order.order_items || []).map(oi => {
        const item = oi.item || {};
        const prod = db.all('productos').find(pr => pr.sku === item.sku);
        return {
          id: db.uid ? db._sqlite ? 'vi_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6) : require('crypto').randomBytes(8).toString('hex') : '',
          venta_id: '', prod_id: prod ? prod.id : null,
          nombre: item.title || '', talle: null,
          cantidad: oi.quantity || 1, precio: parseFloat(item.unit_price) || 0,
          subtotal: parseFloat(item.total_amount) || 0,
        };
      });

      const total = items.reduce((a, i) => a + i.subtotal, 0);
      const buyer = order.buyer || {};
      const cliNombre = `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() || 'Comprador ML';

      const venta = {
        id: 'v' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
        fecha: order.date_created || new Date().toISOString(),
        suc_id: sucursalId,
        cli_id: null, cli_nombre: cliNombre,
        vendedor_id: userId, vendedor_nombre: userName,
        subtotal: total, descuento: 0, total,
        pago: 'mercadopago', pagos: null,
        es_cuenta_corriente: false, anulada: false, cobrada: true,
        origen: 'online', id_externo: String(order.id),
      };

      db.insert('ventas', venta);
      items.forEach(it => { it.venta_id = venta.id; db.insert('venta_items', it); });
      items.forEach(it => { try { if (it.prod_id) db.updateStockSuc(it.prod_id, sucursalId, -it.cantidad); } catch {} });
      importadas++;
    }

    return { importadas, total_en_api: results.length };
  }

  // ── Obtener info de cuenta ──

  async getAccountInfo(tokens) {
    const me = await this._request(tokens.accessToken, 'GET', 'users/me');
    return {
      externalAccountId: String(me.id),
      externalUserId: String(me.id),
      nickname: me.nickname,
      email: me.email,
    };
  }

  // ── Webhooks ──

  getWebhookEvents() {
    return ['orders', 'items'];
  }

  async processWebhook(payload, signature) {
    const { resource, topic, user_id } = payload;
    return { processed: true, resource, topic, userId: user_id };
  }

  getConfigurationSchema() {
    return {
      fields: [
        { key: 'sellerId', label: 'Seller ID', type: 'text', required: true },
        { key: 'autoSync', label: 'Sincronización automática', type: 'boolean', default: false },
        { key: 'syncIntervalMinutes', label: 'Intervalo de sync (minutos)', type: 'number', default: 15 },
      ],
    };
  }
}

module.exports = { MercadoLibreProvider };
