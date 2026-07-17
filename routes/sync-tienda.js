const express = require('express');
const router = express.Router();
const { db: globalDB, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || globalDB;
const { authMiddleware, requireRol } = require('../middleware/auth');
router.use(authMiddleware);

const PLATFORMAS = ['woocommerce', 'tiendanube', 'mercadolibre'];

function ensureTiendaSucursal(db) {
  const cfg = db.getConfig();
  if (cfg.tienda_suc_online_id) {
    const existing = db.findOne('sucursales', cfg.tienda_suc_online_id);
    if (existing) return existing;
  }
  const existing = db.where('sucursales', s => s.nombre === '🛒 Tienda Online' && s.activo !== false)[0];
  if (existing) {
    db.setConfig({ tienda_suc_online_id: existing.id });
    return existing;
  }
  const id = uid();
  const body = { id, nombre: '🛒 Tienda Online', activo: true, created_at: new Date().toISOString() };
  db.insert('sucursales', body);
  db.setConfig({ tienda_suc_online_id: id });
  return body;
}

function isPlataformaConfigurada(cfg, p) {
  if (p === 'woocommerce') return cfg.tienda_woo_url && cfg.tienda_woo_key && cfg.tienda_woo_secret;
  if (p === 'tiendanube') return cfg.tienda_tn_store_id && cfg.tienda_tn_access_token;
  if (p === 'mercadolibre') return cfg.tienda_meli_access_token && cfg.tienda_meli_seller_id;
  return false;
}

function stockDesdeTiendaOnline(db, tiendaSucId, prodId) {
  return db.getStockSuc(prodId, tiendaSucId) || 0;
}

async function wcRequest(cfg, method, endpoint, data) {
  const base = (cfg.tienda_woo_url || '').replace(/\/+$/, '');
  const url = `${base}/wp-json/wc/v3/${endpoint}`;
  const auth = Buffer.from(`${cfg.tienda_woo_key}:${cfg.tienda_woo_secret}`).toString('base64');
  const opts = { method, headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' } };
  if (data) opts.body = JSON.stringify(data);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`WooCommerce ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

function collectSettled(settled, total) {
  let ok = 0;
  const errors = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') ok++;
    else errors.push(s.reason);
  }
  return { ok, fail: total - ok, errors, total };
}

async function pushStockWoo(cfg, db, tiendaSucId) {
  const prods = db.all('productos').filter(p => p.activo !== false && p.sku);
  const settled = await Promise.allSettled(prods.map(prod => (async () => {
    try {
      const stock = stockDesdeTiendaOnline(db, tiendaSucId, prod.id);
      const existing = await wcRequest(cfg, 'GET', `products?sku=${encodeURIComponent(prod.sku)}&per_page=1`);
      if (existing.length > 0) {
        await wcRequest(cfg, 'PUT', `products/${existing[0].id}`, { stock_quantity: stock, manage_stock: true });
      }
    } catch (e) {
      throw { sku: prod.sku, error: e.message };
    }
  })()));
  return collectSettled(settled, prods.length);
}

async function tnRequest(cfg, method, endpoint, data) {
  const base = `https://api.tiendanube.com/v1/${cfg.tienda_tn_store_id}`;
  const url = `${base}/${endpoint}`;
  const opts = { method, headers: { 'Authorization': `Bearer ${cfg.tienda_tn_access_token}`,       'User-Agent': 'FlexCRM (info@unfulanodev.com.ar)', 'Content-Type': 'application/json', 'Accept': 'application/json' } };
  if (data) opts.body = JSON.stringify(data);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`TiendaNube ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function pushStockTN(cfg, db, tiendaSucId) {
  const prods = db.all('productos').filter(p => p.activo !== false && p.sku);
  const settled = await Promise.allSettled(prods.map(prod => (async () => {
    try {
      const stock = stockDesdeTiendaOnline(db, tiendaSucId, prod.id);
      const existing = await tnRequest(cfg, 'GET', `products?sku=${encodeURIComponent(prod.sku)}`);
      if (existing.length > 0) {
        await tnRequest(cfg, 'PUT', `products/${existing[0].id}`, { stock });
      }
    } catch (e) {
      throw { sku: prod.sku, error: e.message };
    }
  })()));
  return collectSettled(settled, prods.length);
}

async function meliRequest(cfg, method, endpoint, data) {
  const url = `https://api.mercadolibre.com/${endpoint}`;
  const opts = { method, headers: { 'Authorization': `Bearer ${cfg.tienda_meli_access_token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' } };
  if (data) opts.body = JSON.stringify(data);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (res.status === 401) throw new Error('Token ML expirado — renová el token desde Config > Tienda');
  if (!res.ok) throw new Error(`MercadoLibre ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function pushStockML(cfg, db, tiendaSucId) {
  const prods = db.all('productos').filter(p => p.activo !== false && p.sku);
  const sellerId = cfg.tienda_meli_seller_id;
  if (!sellerId) return { ok: 0, fail: 0, errors: [], total: prods.length, error: 'Seller ID no configurado' };
  const settled = await Promise.allSettled(prods.map(prod => (async () => {
    try {
      const stock = stockDesdeTiendaOnline(db, tiendaSucId, prod.id);
      const search = await meliRequest(cfg, 'GET', `items/search?seller=${sellerId}&sku=${encodeURIComponent(prod.sku)}`);
      const items = search?.results || [];
      if (items.length > 0) {
        await meliRequest(cfg, 'PUT', `items/${items[0]}`, { available_quantity: stock });
      }
    } catch (e) {
      throw { sku: prod.sku, error: e.message };
    }
  })()));
  return collectSettled(settled, prods.length);
}

async function pullOrdersWoo(cfg, db, tiendaSucId, req) {
  const orders = await wcRequest(cfg, 'GET', 'orders?status=processing&per_page=25');
  let importadas = 0;
  for (const order of orders) {
    const existing = db.where('ventas', v => v.origen === 'online' && v.id_externo === String(order.id))[0];
    if (existing) continue;
    const items = (order.line_items || []).map(li => ({
      id: uid(), venta_id: '', prod_id: null, nombre: li.name, talle: null,
      cantidad: li.quantity, precio: parseFloat(li.price), subtotal: parseFloat(li.total),
    }));
    const total = parseFloat(order.total) || 0;
    const cliNombre = `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || 'Pedido web';
    const venta = {
      id: uid(), fecha: order.date_created || new Date().toISOString(), suc_id: tiendaSucId,
      cli_id: null, cli_nombre: cliNombre, vendedor_id: req.user.id, vendedor_nombre: req.user.nombre,
      subtotal: total, descuento: 0, total, pago: 'transferencia', pagos: null,
      es_cuenta_corriente: false, anulada: false, cobrada: true, origen: 'online', id_externo: String(order.id),
    };
    db.insert('ventas', venta);
    items.forEach(it => { it.venta_id = venta.id; db.insert('venta_items', it); });
    items.forEach(it => { try { db.updateStockSuc(it.prod_id, tiendaSucId, -it.cantidad); } catch {} });
    db.audit(req.user, req.user.suc_id, 'ventas', 'importar_tienda', `Pedido WooCommerce #${order.id} - $${total}`, venta.id);
    importadas++;
  }
  return { importadas, total_en_api: orders.length };
}

async function pullOrdersTN(cfg, db, tiendaSucId, req) {
  const orders = await tnRequest(cfg, 'GET', 'orders?status=paid&per_page=25');
  let importadas = 0;
  for (const order of orders) {
    const existing = db.where('ventas', v => v.origen === 'online' && v.id_externo === String(order.id))[0];
    if (existing) continue;
    const items = (order.products || []).map(p => {
      const prod = db.all('productos').find(pr => pr.sku === p.sku);
      return { id: uid(), venta_id: '', prod_id: prod ? prod.id : null, nombre: p.name || '', talle: null, cantidad: p.quantity || 1, precio: parseFloat(p.unit_price) || 0, subtotal: parseFloat(p.total) || 0 };
    });
    const total = items.reduce((a, i) => a + i.subtotal, 0);
    const cliNombre = order.customer?.name || order.customer?.email || 'Pedido web';
    const venta = {
      id: uid(), fecha: order.created_at || new Date().toISOString(), suc_id: tiendaSucId,
      cli_id: null, cli_nombre: cliNombre, vendedor_id: req.user.id, vendedor_nombre: req.user.nombre,
      subtotal: total, descuento: 0, total, pago: 'transferencia', pagos: null,
      es_cuenta_corriente: false, anulada: false, cobrada: true, origen: 'online', id_externo: String(order.id),
    };
    db.insert('ventas', venta);
    items.forEach(it => { it.venta_id = venta.id; db.insert('venta_items', it); });
    items.forEach(it => { try { if (it.prod_id) db.updateStockSuc(it.prod_id, tiendaSucId, -it.cantidad); } catch {} });
    db.audit(req.user, req.user.suc_id, 'ventas', 'importar_tienda', `Pedido TiendaNube #${order.id} - $${total}`, venta.id);
    importadas++;
  }
  return { importadas, total_en_api: orders.length };
}

async function pullOrdersML(cfg, db, tiendaSucId, req) {
  const sellerId = cfg.tienda_meli_seller_id;
  if (!sellerId) return { importadas: 0, error: 'Seller ID no configurado' };
  const orders = await meliRequest(cfg, 'GET', `orders/search?seller=${sellerId}&order.status=paid&limit=25`);
  const results = orders?.results || [];
  let importadas = 0;
  for (const order of results) {
    const existing = db.where('ventas', v => v.origen === 'online' && v.id_externo === String(order.id))[0];
    if (existing) continue;
    const items = (order.order_items || []).map(oi => {
      const item = oi.item || {};
      const prod = db.all('productos').find(pr => pr.sku === item.sku);
      return { id: uid(), venta_id: '', prod_id: prod ? prod.id : null, nombre: item.title || '', talle: null, cantidad: oi.quantity || 1, precio: parseFloat(item.unit_price) || 0, subtotal: parseFloat(item.total_amount) || 0 };
    });
    const total = items.reduce((a, i) => a + i.subtotal, 0);
    const buyer = order.buyer || {};
    const cliNombre = `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() || 'Comprador ML';
    const venta = {
      id: uid(), fecha: order.date_created || new Date().toISOString(), suc_id: tiendaSucId,
      cli_id: null, cli_nombre: cliNombre, vendedor_id: req.user.id, vendedor_nombre: req.user.nombre,
      subtotal: total, descuento: 0, total, pago: 'mercadopago', pagos: null,
      es_cuenta_corriente: false, anulada: false, cobrada: true, origen: 'online', id_externo: String(order.id),
    };
    db.insert('ventas', venta);
    items.forEach(it => { it.venta_id = venta.id; db.insert('venta_items', it); });
    items.forEach(it => { try { if (it.prod_id) db.updateStockSuc(it.prod_id, tiendaSucId, -it.cantidad); } catch {} });
    db.audit(req.user, req.user.suc_id, 'ventas', 'importar_tienda', `Pedido ML #${order.id} - $${total}`, venta.id);
    importadas++;
  }
  return { importadas, total_en_api: results.length };
}

const PUSH_FN = { woocommerce: pushStockWoo, tiendanube: pushStockTN, mercadolibre: pushStockML };
const PULL_FN = { woocommerce: pullOrdersWoo, tiendanube: pullOrdersTN, mercadolibre: pullOrdersML };

router.post('/ensure-sucursal', requireRol('admin'), (req, res) => {
  try { const s = ensureTiendaSucursal(_getDB(req)); res.json({ ok: true, id: s.id, nombre: s.nombre }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/status', requireRol('admin', 'supervisor'), (req, res) => {
  const cfg = _getDB(req).getConfig();
  const status = {};
  PLATFORMAS.forEach(p => { status[p] = isPlataformaConfigurada(cfg, p); });
  res.json({ status, tienda_suc_online_id: cfg.tienda_suc_online_id || null, ultima_sync: cfg.tienda_ultima_sync || null });
});

router.post('/push-stock', requireRol('admin', 'supervisor'), async (req, res) => {
  const db = _getDB(req); const cfg = db.getConfig();
  const suc = ensureTiendaSucursal(db);
  const platforms = PLATFORMAS.filter(p => isPlataformaConfigurada(cfg, p));
  const entries = await Promise.all(platforms.map(async (p) => {
    try { return [p, await PUSH_FN[p](cfg, db, suc.id)]; } catch (e) { return [p, { error: e.message, ok: 0, fail: 0 }]; }
  }));
  const results = Object.fromEntries(entries);
  db.setConfig({ tienda_ultima_sync: new Date().toISOString() });
  db.audit(req.user, req.user.suc_id, 'config', 'sync_tienda_push', `Push completado: ${JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, `${v.ok||0} OK, ${v.fail||0} fail`])))}`);
  res.json({ ok: true, results });
});

router.post('/push-stock/:platform', requireRol('admin', 'supervisor'), async (req, res) => {
  const p = req.params.platform;
  if (!PLATFORMAS.includes(p)) return res.status(400).json({ error: `Plataforma no soportada: ${p}. Usar: ${PLATFORMAS.join(', ')}` });
  const db = _getDB(req); const cfg = db.getConfig();
  if (!isPlataformaConfigurada(cfg, p)) return res.status(400).json({ error: `Plataforma ${p} no configurada` });
  const suc = ensureTiendaSucursal(db);
  try { const r = await PUSH_FN[p](cfg, db, suc.id); res.json({ ok: true, platform: p, ...r }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/pull-orders', requireRol('admin', 'supervisor'), async (req, res) => {
  const db = _getDB(req); const cfg = db.getConfig();
  const suc = ensureTiendaSucursal(db);
  const platforms = PLATFORMAS.filter(p => isPlataformaConfigurada(cfg, p));
  const entries = await Promise.all(platforms.map(async (p) => {
    try { return [p, await PULL_FN[p](cfg, db, suc.id, req)]; } catch (e) { return [p, { error: e.message, importadas: 0 }]; }
  }));
  const results = Object.fromEntries(entries);
  db.audit(req.user, req.user.suc_id, 'ventas', 'importar_tienda', `Pull completado: ${JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, `${v.importadas||0} pedidos`])))}`);
  res.json({ ok: true, results });
});

router.post('/pull-orders/:platform', requireRol('admin', 'supervisor'), async (req, res) => {
  const p = req.params.platform;
  if (!PLATFORMAS.includes(p)) return res.status(400).json({ error: `Plataforma no soportada: ${p}. Usar: ${PLATFORMAS.join(', ')}` });
  const db = _getDB(req); const cfg = db.getConfig();
  if (!isPlataformaConfigurada(cfg, p)) return res.status(400).json({ error: `Plataforma ${p} no configurada` });
  const suc = ensureTiendaSucursal(db);
  try { const r = await PULL_FN[p](cfg, db, suc.id, req); res.json({ ok: true, platform: p, ...r }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/meli/auth-url', (req, res) => {
  const empresa = req.query.empresa;
  if (!empresa) return res.status(400).json({ error: 'Falta parametro empresa' });
  const cfg = _getDB(req).getConfig();
  const appId = cfg.tienda_meli_app_id;
  if (!appId) return res.status(400).json({ error: 'APP_ID de MercadoLibre no configurado' });
  const redirectUri = `${req.protocol}://${req.get('host')}/api/meli-callback`;
  res.json({ url: `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(empresa)}` });
});

router.post('/meli/refresh', requireRol('admin'), async (req, res) => {
  const db = _getDB(req); const cfg = db.getConfig();
  const refreshToken = cfg.tienda_meli_refresh_token;
  if (!refreshToken) return res.status(400).json({ error: 'No hay refresh token' });
  try {
    const r = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: cfg.tienda_meli_app_id, client_secret: cfg.tienda_meli_client_secret, refresh_token: refreshToken }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Error al refrescar token');
    db.setConfig({
      tienda_meli_access_token: data.access_token,
      tienda_meli_refresh_token: data.refresh_token || refreshToken,
      tienda_meli_expires_at: new Date(Date.now() + (data.expires_in || 21600) * 1000).toISOString(),
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
