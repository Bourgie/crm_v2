// FlexCRM — Sync offline-to-cloud
// Recibe un batch de operaciones encoladas mientras no había red,
// las aplica en orden y devuelve el resultado de cada una.
const express = require('express');
const router  = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware } = require('../middleware/auth');
router.use(authMiddleware);

// POST /api/sync/push  — body: { ops: [{id, method, endpoint, body, ts}] }
router.post('/push', async (req, res) => {
  const empDB = _getDB(req);
  const ops   = req.body.ops || [];
  if (!Array.isArray(ops) || ops.length === 0)
    return res.json({ ok: true, results: [] });

  const results = [];

  for (const op of ops) {
    try {
      const r = await applyOp(op, empDB, req);
      results.push({ id: op.id, ok: true, data: r });
    } catch (e) {
      results.push({ id: op.id, ok: false, error: e.message });
    }
  }

  // Record sync in audit
  empDB.audit(req.user, req.user.suc_id, 'sync', 'offline_push',
    `Sync: ${ops.length} ops, ${results.filter(r=>r.ok).length} OK`);

  res.json({ ok: true, results, server_ts: new Date().toISOString() });
});

// GET /api/sync/status — health check + server timestamp
router.get('/status', (req, res) => {
  res.json({ online: true, ts: new Date().toISOString() });
});

// ── Apply a single queued operation ──────────────────────────
async function applyOp(op, empDB, req) {
  const { method, endpoint, body } = op;
  const path = endpoint.replace(/^\/api/, '').replace(/\?.+$/, '');
  const m = method.toUpperCase();

  // ── VENTAS ──────────────────────────────────────────────────
  if (path === '/ventas' && m === 'POST') {
    return applyVenta(body, empDB, req);
  }

  // ── CAJA: movimiento ────────────────────────────────────────
  if (path === '/caja/movimiento' && m === 'POST') {
    return applyCajaMovimiento(body, empDB, req);
  }

  // ── CLIENTES: crear / actualizar ────────────────────────────
  if (path === '/clientes' && m === 'POST') {
    return applyClienteCreate(body, empDB);
  }
  if (path.match(/^\/clientes\/[^/]+$/) && m === 'PUT') {
    const id = path.split('/')[2];
    const existing = empDB.findOne('clientes', id);
    if (!existing) throw new Error('Cliente no encontrado: ' + id);
    empDB.update('clientes', id, body);
    return { ok: true };
  }

  // ── PENDIENTES ──────────────────────────────────────────────
  if (path === '/pendientes' && m === 'POST') {
    return applyPendiente(body, empDB, req);
  }

  // ── PRODUCTOS: ajuste stock ─────────────────────────────────
  if (path.match(/^\/productos\/[^/]+\/stock$/) && m === 'POST') {
    const prod_id = path.split('/')[2];
    return applyStockAjuste(prod_id, body, empDB);
  }

  throw new Error(`Operación no soportada offline: ${m} ${path}`);
}

// ── Venta offline ────────────────────────────────────────────
function applyVenta(body, empDB, req) {
  const suc_id = body.suc_id || req.user.suc_id;

  // Verificar/ajustar stock — nunca dejar negativo
  const stockConflicts = [];
  const items = body.items || [];
  items.forEach(item => {
    const prod = empDB.findOne('productos', item.prod_id);
    if (!prod) return;
    const stockDisp = empDB.getStockSuc ? empDB.getStockSuc(item.prod_id, suc_id) : 0;
    if (stockDisp < item.cantidad) {
      stockConflicts.push({
        prod_id: item.prod_id,
        nombre: prod.nombre,
        pedido: item.cantidad,
        disponible: stockDisp
      });
    }
  });

  // Aplicar venta con advertencia si hubo conflicto de stock
  const id = body.id || ('v' + uid());
  const venta = {
    id,
    fecha: body.fecha || new Date().toISOString(),
    suc_id,
    cli_id: body.cli_id || null,
    cli_nombre: body.cli_nombre || 'Consumidor final',
    vendedor_id: body.vendedor_id || req.user.id,
    vendedor_nombre: body.vendedor_nombre || req.user.nombre,
    subtotal: body.subtotal || 0,
    descuento: body.descuento || 0,
    total: body.total || 0,
    pago: body.pago || 'efectivo',
    pagos: body.pagos ? JSON.stringify(body.pagos) : null,
    es_cuenta_corriente: body.es_cuenta_corriente || false,
    anulada: false,
    origen: 'offline',
    sync_ts: new Date().toISOString(),
    stock_conflicts: stockConflicts.length ? JSON.stringify(stockConflicts) : null
  };

  empDB.insert('ventas', venta);

  // Insert items
  items.forEach(item => {
    empDB.insert('venta_items', {
      id: uid(),
      venta_id: id,
      prod_id: item.prod_id,
      nombre: item.nombre,
      talle: item.talle || null,
      cantidad: item.cantidad,
      precio: item.precio,
      subtotal: item.subtotal || item.precio * item.cantidad
    });
    // Descontar stock (puede quedar negativo — se registra el conflicto)
    try { empDB.updateStockSuc(item.prod_id, suc_id, -item.cantidad); } catch(e) {}
  });

  // Caja: registrar ingreso si caja está abierta
  try {
    const hoy = new Date().toISOString().substr(0, 10);
    const caja = empDB.where('cajas', c =>
      c.suc_id === suc_id && c.fecha.substr(0, 10) === hoy && c.estado === 'abierta'
    )[0];
    if (caja) {
      empDB.insert('movimientos_caja', {
        id: uid(), caja_id: caja.id, suc_id,
        fecha: venta.fecha, tipo: 'ingreso',
        concepto: 'Venta offline #' + id.substr(-6),
        monto: venta.total,
        pago_metodo: venta.pago, auto: true, venta_id: id, anulado: false
      });
    }
  } catch(e) {}

  empDB.audit(req.user, suc_id, 'ventas', 'crear_offline',
    'Venta offline: $' + venta.total + (stockConflicts.length ? ' (conflictos stock)' : ''), id);

  return { id, ok: true, stock_conflicts: stockConflicts };
}

// ── Movimiento de caja offline ───────────────────────────────
function applyCajaMovimiento(body, empDB, req) {
  const suc_id = body.suc_id || req.user.suc_id;
  const hoy = new Date().toISOString().substr(0, 10);
  const caja = empDB.where('cajas', c =>
    c.suc_id === suc_id && c.fecha.substr(0, 10) === hoy && c.estado === 'abierta'
  )[0];
  if (!caja) throw new Error('No hay caja abierta hoy para ' + suc_id);
  empDB.insert('movimientos_caja', {
    id: uid(), caja_id: caja.id, suc_id,
    fecha: body.fecha || new Date().toISOString(),
    tipo: body.tipo, concepto: body.concepto,
    monto: parseFloat(body.monto), auto: false,
    pago_metodo: body.pago_metodo || 'efectivo',
    usuario: req.user.nombre, anulado: false
  });
  return { ok: true };
}

// ── Cliente offline ──────────────────────────────────────────
function applyClienteCreate(body, empDB) {
  // Check duplicate by nombre/tel
  const existing = empDB.where('clientes', c =>
    c.nombre === body.nombre && c.tel === body.tel
  )[0];
  if (existing) return { id: existing.id, ok: true, merged: true };
  const id = body.id || ('c' + uid());
  empDB.insert('clientes', { ...body, id, origen: 'offline' });
  return { id, ok: true };
}

// ── Pendiente offline ────────────────────────────────────────
function applyPendiente(body, empDB, req) {
  const id = body.id || ('p' + uid());
  empDB.insert('pedidos_pendientes', {
    ...body, id,
    creado: body.creado || new Date().toISOString(),
    usuario_id: req.user.id,
    origen: 'offline'
  });
  return { id, ok: true };
}

// ── Ajuste de stock offline ──────────────────────────────────
function applyStockAjuste(prod_id, body, empDB) {
  try {
    empDB.updateStockSuc(prod_id, body.suc_id, body.delta);
    return { ok: true };
  } catch(e) {
    throw new Error('Error ajustando stock: ' + e.message);
  }
}

module.exports = router;
