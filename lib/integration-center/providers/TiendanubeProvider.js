// ═══════════════════════════════════════════
// Integration Center — TiendanubeProvider
// OAuth 2.0 + sync productos/pedidos
// ═══════════════════════════════════════════

const { BaseOAuthProvider } = require('../BaseOAuthProvider');
const { AuthError } = require('../errors');

class TiendanubeProvider extends BaseOAuthProvider {
  get name() { return 'tiendanube'; }
  get displayName() { return 'Tiendanube'; }
  get icon() { return '🛍️'; }
  get category() { return 'ecommerce'; }
  get requiredEnvKeys() { return ['TN_CLIENT_ID', 'TN_CLIENT_SECRET']; }

  get authUrl() { return 'https://app.tiendanube.com/apps/authorize/token'; }
  get tokenUrl() { return 'https://app.tiendanube.com/apps/authorize/token'; }
  get scopes() { return ['read_products', 'write_products', 'read_orders', 'write_orders']; }

  // ── API Request ──

  async _request(accessToken, storeId, method, endpoint, body) {
    const url = `https://api.tiendanube.com/v1/${storeId}/${endpoint}`;
    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'FlexCRM (info@unfulanodev.com.ar)',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const text = await res.text();

    if (res.status === 401) throw new AuthError(this.name, 'Token expirado o revocado');
    if (!res.ok) throw new Error(`Tiendanube ${res.status}: ${text.slice(0, 300)}`);

    try { return JSON.parse(text); } catch { return text; }
  }

  // ── Health Check ──

  async healthCheck(tokens) {
    const start = Date.now();
    try {
      const storeId = tokens.config?.storeId || tokens.sellerId;
      if (!storeId) return { ok: false, error: 'Store ID no configurado', responseTimeMs: Date.now() - start };
      await this._request(tokens.accessToken, storeId, 'GET', 'store');
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
      default: throw new Error(`Entity type "${entityType}" no soportado por Tiendanube`);
    }
  }

  async _syncProductos(tokens, options) {
    const { productos, storeId } = options;
    if (!storeId) return { ok: 0, fail: 0, errors: [], total: productos.length, error: 'Store ID no configurado' };

    let ok = 0;
    const errors = [];

    for (const prod of productos) {
      try {
        const existing = await this._request(tokens.accessToken, storeId, 'GET',
          `products?sku=${encodeURIComponent(prod.sku)}`);
        if (existing.length > 0) {
          await this._request(tokens.accessToken, storeId, 'PUT', `products/${existing[0].id}`,
            { stock: prod.stock || 0 });
        }
        ok++;
      } catch (e) {
        errors.push({ sku: prod.sku, error: e.message });
      }
    }

    return { ok, fail: productos.length - ok, errors, total: productos.length };
  }

  async _syncPedidos(tokens, options) {
    const { storeId, db, sucursalId, userId, userName } = options;
    if (!storeId) return { importadas: 0, error: 'Store ID no configurado' };

    const orders = await this._request(tokens.accessToken, storeId, 'GET', 'orders?status=paid&per_page=25');
    let importadas = 0;

    for (const order of orders) {
      const existing = db.where('ventas', v => v.origen === 'online' && v.id_externo === String(order.id))[0];
      if (existing) continue;

      const items = (order.products || []).map(p => {
        const prod = db.all('productos').find(pr => pr.sku === p.sku);
        return {
          id: 'vi_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
          venta_id: '', prod_id: prod ? prod.id : null,
          nombre: p.name || '', talle: null,
          cantidad: p.quantity || 1, precio: parseFloat(p.unit_price) || 0,
          subtotal: parseFloat(p.total) || 0,
        };
      });

      const total = items.reduce((a, i) => a + i.subtotal, 0);
      const cliNombre = order.customer?.name || order.customer?.email || 'Pedido web';

      const venta = {
        id: 'v' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
        fecha: order.created_at || new Date().toISOString(),
        suc_id: sucursalId,
        cli_id: null, cli_nombre: cliNombre,
        vendedor_id: userId, vendedor_nombre: userName,
        subtotal: total, descuento: 0, total,
        pago: 'transferencia', pagos: null,
        es_cuenta_corriente: false, anulada: false, cobrada: true,
        origen: 'online', id_externo: String(order.id),
      };

      db.insert('ventas', venta);
      items.forEach(it => { it.venta_id = venta.id; db.insert('venta_items', it); });
      items.forEach(it => { try { if (it.prod_id) db.updateStockSuc(it.prod_id, sucursalId, -it.cantidad); } catch {} });
      importadas++;
    }

    return { importadas, total_en_api: orders.length };
  }

  // ── Account info ──

  async getAccountInfo(tokens) {
    const storeId = tokens.config?.storeId || tokens.sellerId;
    if (!storeId) return { externalAccountId: 'unknown', externalUserId: 'unknown' };
    try {
      const store = await this._request(tokens.accessToken, storeId, 'GET', 'store');
      return {
        externalAccountId: String(store.id),
        externalUserId: String(store.id),
        name: store.name || '',
        domain: store.domain || '',
      };
    } catch {
      return { externalAccountId: String(storeId), externalUserId: String(storeId) };
    }
  }

  getWebhookEvents() {
    return ['order/paid', 'order/cancelled', 'product/change'];
  }

  getConfigurationSchema() {
    return {
      fields: [
        { key: 'storeId', label: 'Store ID', type: 'text', required: true },
        { key: 'autoSync', label: 'Sincronización automática', type: 'boolean', default: false },
        { key: 'syncIntervalMinutes', label: 'Intervalo de sync (minutos)', type: 'number', default: 15 },
      ],
    };
  }
}

module.exports = { TiendanubeProvider };
