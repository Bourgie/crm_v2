// ═══════════════════════════════════════════════════════════
// PequeñosCRM Pro — Transferencias de Stock entre Sucursales
// Estados: borrador → enviada → recibida (o rechazada)
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol, permiteSucursal } = require('../middleware/auth');
router.use(authMiddleware);

function enrichTransf(t, empDB) {
  const sucs = empDB.all('sucursales');
  const items = empDB.where('transferencia_items', i => i.transferencia_id === t.id)
    .map(it => {
      const p = empDB.findOne('productos', it.prod_id);
      return { ...it, nombre: it.nombre || (p ? p.nombre : '—'), talle: it.talle || (p ? p.talle : '') };
    });
  return {
    ...t,
    suc_origen_nombre: (sucs.find(s => s.id === t.suc_origen) || {}).nombre || t.suc_origen,
    suc_destino_nombre: (sucs.find(s => s.id === t.suc_destino) || {}).nombre || t.suc_destino,
    items,
  };
}

// GET / — list, filtered by suc (origin or destination)
router.get('/', (req, res) => {
  const db = _getDB(req);
  const { suc_id, estado } = req.query;
  const sucSesion = suc_id || req.user.suc_id;
  let rows = db.all('transferencias');
  if (sucSesion && req.user.rol !== 'admin') {
    rows = rows.filter(t => t.suc_origen === sucSesion || t.suc_destino === sucSesion);
  }
  if (estado) rows = rows.filter(t => t.estado === estado);
  rows = rows.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  res.json(rows.map(t => enrichTransf(t, db)));
});

// GET /:id
router.get('/:id', (req, res) => {
  const db = _getDB(req);
  const t = db.findOne('transferencias', req.params.id);
  if (!t) return res.status(404).json({ error: 'No encontrada' });
  res.json(enrichTransf(t, db));
});

// POST / — create transfer in borrador state
router.post('/', requireRol('admin', 'supervisor'), (req, res) => {
  const db = _getDB(req);
  const { suc_origen, suc_destino, items, notas } = req.body;
  if (!suc_origen || !suc_destino) return res.status(400).json({ error: 'Origen y destino requeridos' });
  if (suc_origen === suc_destino) return res.status(400).json({ error: 'Origen y destino deben ser distintos' });
  if (!items || !items.length) return res.status(400).json({ error: 'Debe incluir al menos un producto' });

  // Auto-number
  const existing = db.all('transferencias');
  const numero = (existing.reduce((max, t) => Math.max(max, t.numero || 0), 0)) + 1;

  const id = 't' + uid();
  const fecha = new Date().toISOString().substr(0, 10);
  db.insert('transferencias', {
    id, numero, fecha, suc_origen, suc_destino,
    estado: 'borrador', notas: notas || '',
    creado_por: req.user.nombre
  });

  items.forEach(it => {
    const p = it.prod_id ? db.findOne('productos', it.prod_id) : null;
    db.insert('transferencia_items', {
      id: 'ti' + uid(),
      transferencia_id: id,
      prod_id: it.prod_id,
      nombre: it.nombre || (p ? p.nombre : ''),
      talle: it.talle || (p ? p.talle : ''),
      cantidad: parseInt(it.cantidad) || 1,
      cantidad_recibida: 0,
    });
  });

  db.audit(req.user, suc_origen, 'transferencias', 'crear', 'Transfer #'+numero+' → '+suc_destino, id);
  res.json({ id, numero, ok: true });
});

// PUT /:id — update borrador
router.put('/:id', requireRol('admin', 'supervisor'), (req, res) => {
  const db = _getDB(req);
  const t = db.findOne('transferencias', req.params.id);
  if (!t) return res.status(404).json({ error: 'No encontrada' });
  if (t.estado !== 'borrador') return res.status(400).json({ error: 'Solo se puede editar en borrador' });

  const { notas, items } = req.body;
  if (notas !== undefined) db.update('transferencias', req.params.id, { notas });

  if (items && items.length) {
    // Delete existing items and re-insert
    db.where('transferencia_items', i => i.transferencia_id === req.params.id)
      .forEach(i => db.delete('transferencia_items', i.id));
    items.forEach(it => {
      const p = it.prod_id ? db.findOne('productos', it.prod_id) : null;
      db.insert('transferencia_items', {
        id: 'ti' + uid(),
        transferencia_id: req.params.id,
        prod_id: it.prod_id,
        nombre: it.nombre || (p ? p.nombre : ''),
        talle: it.talle || (p ? p.talle : ''),
        cantidad: parseInt(it.cantidad) || 1,
        cantidad_recibida: 0,
      });
    });
  }
  res.json({ ok: true });
});

// POST /:id/enviar — suc_origen confirms shipment, deducts stock
router.post('/:id/enviar', requireRol('admin', 'supervisor', 'cajero'), (req, res) => {
  const db = _getDB(req);
  const t = db.findOne('transferencias', req.params.id);
  if (!t) return res.status(404).json({ error: 'No encontrada' });
  if (!permiteSucursal(req.user, t.suc_origen)) return res.status(403).json({ error: 'No pertenecés a la sucursal de origen' });
  if (t.estado !== 'borrador') return res.status(400).json({ error: 'Solo se puede enviar desde borrador' });

  const items = db.where('transferencia_items', i => i.transferencia_id === req.params.id);
  if (!items.length) return res.status(400).json({ error: 'Sin items' });

  // Deduct stock from origin suc
  items.forEach(it => {
    const before = db.getStockSuc(it.prod_id, t.suc_origen);
    db.updateStockSuc(it.prod_id, t.suc_origen, -it.cantidad);
    const after = db.getStockSuc(it.prod_id, t.suc_origen);
    db.insert('stock_movimientos', {
      id: 'sm' + uid(),
      prod_id: it.prod_id, nombre_prod: it.nombre,
      tipo: 'salida', cantidad: -it.cantidad,
      stock_antes: before, stock_despues: after,
      motivo: 'Transferencia #' + t.numero + ' → ' + t.suc_destino,
      usuario_id: req.user.id, usuario: req.user.nombre,
      fecha: new Date().toISOString(), suc_id: t.suc_origen
    });
  });

  db.update('transferencias', req.params.id, {
    estado: 'enviada',
    fecha_envio: new Date().toISOString(),
    enviado_por: req.user.nombre
  });

  db.audit(req.user, t.suc_destino, 'transferencias', 'enviar', 'Envío Transfer #'+t.numero, req.params.id);
  res.json({ ok: true });
});

// POST /:id/recibir — suc_destino confirms receipt, adds stock
router.post('/:id/recibir', requireRol('admin', 'supervisor', 'cajero'), (req, res) => {
  const db = _getDB(req);
  const t = db.findOne('transferencias', req.params.id);
  if (!t) return res.status(404).json({ error: 'No encontrada' });
  if (!permiteSucursal(req.user, t.suc_destino)) return res.status(403).json({ error: 'No pertenecés a la sucursal de destino' });
  if (t.estado !== 'enviada') return res.status(400).json({ error: 'Solo se puede recibir transferencias enviadas' });

  // cantidades_recibidas puede diferir de las enviadas (recepción parcial)
  const cantidades = req.body.cantidades || {}; // { item_id: cantidad_recibida }
  const items = db.where('transferencia_items', i => i.transferencia_id === req.params.id);

  items.forEach(it => {
    const cantRecibida = cantidades[it.id] !== undefined ? parseInt(cantidades[it.id]) : it.cantidad;
    const cantReal = Math.max(0, Math.min(cantRecibida, it.cantidad));

    db.update('transferencia_items', it.id, { cantidad_recibida: cantReal });

    if (cantReal > 0) {
      const before = db.getStockSuc(it.prod_id, t.suc_destino);
      db.updateStockSuc(it.prod_id, t.suc_destino, cantReal);
      const after = db.getStockSuc(it.prod_id, t.suc_destino);
      db.insert('stock_movimientos', {
        id: 'sm' + uid(),
        prod_id: it.prod_id, nombre_prod: it.nombre,
        tipo: 'entrada', cantidad: cantReal,
        stock_antes: before, stock_despues: after,
        motivo: 'Transferencia #' + t.numero + ' desde ' + t.suc_origen,
        usuario_id: req.user.id, usuario: req.user.nombre,
        fecha: new Date().toISOString(), suc_id: t.suc_destino
      });
    }

    // If received less than sent, return difference to origin
    const diferencia = it.cantidad - cantReal;
    if (diferencia > 0) {
      db.updateStockSuc(it.prod_id, t.suc_origen, diferencia);
      db.insert('stock_movimientos', {
        id: 'sm' + uid(),
        prod_id: it.prod_id, nombre_prod: it.nombre,
        tipo: 'entrada', cantidad: diferencia,
        stock_antes: db.getStockSuc(it.prod_id, t.suc_origen) - diferencia,
        stock_despues: db.getStockSuc(it.prod_id, t.suc_origen),
        motivo: 'Devolución parcial Transfer #' + t.numero,
        usuario_id: req.user.id, usuario: req.user.nombre,
        fecha: new Date().toISOString(), suc_id: t.suc_origen
      });
    }
  });

  db.update('transferencias', req.params.id, {
    estado: 'recibida',
    fecha_recepcion: new Date().toISOString(),
    recibido_por: req.user.nombre,
    observacion_recepcion: req.body.observacion || null,
    con_diferencias: req.body.con_diferencias ? 1 : 0,
  });

  const itemsRec = items.map(i=>i.nombre+' x'+(cantidades[i.id]!==undefined?cantidades[i.id]:i.cantidad)).join(', ');
  db.audit(req.user, t.suc_destino, 'transferencias', 'recibir', 'Recepción Transfer #'+t.numero+(req.body.con_diferencias?' (con dif.)':'')+' | '+itemsRec, req.params.id);
  res.json({ ok: true });
});

// POST /:id/cancelar — cancel before sending (returns to origin if already sent)
router.post('/:id/cancelar', requireRol('admin', 'supervisor'), (req, res) => {
  const db = _getDB(req);
  const t = db.findOne('transferencias', req.params.id);
  if (!t) return res.status(404).json({ error: 'No encontrada' });
  if (t.estado === 'recibida') return res.status(400).json({ error: 'No se puede cancelar una transferencia ya recibida' });

  // If already sent, return stock to origin
  if (t.estado === 'enviada') {
    const items = db.where('transferencia_items', i => i.transferencia_id === req.params.id);
    items.forEach(it => {
      db.updateStockSuc(it.prod_id, t.suc_origen, it.cantidad);
      db.insert('stock_movimientos', {
        id: 'sm' + uid(),
        prod_id: it.prod_id, nombre_prod: it.nombre,
        tipo: 'entrada', cantidad: it.cantidad,
        stock_antes: db.getStockSuc(it.prod_id, t.suc_origen) - it.cantidad,
        stock_despues: db.getStockSuc(it.prod_id, t.suc_origen),
        motivo: 'Cancelación Transfer #' + t.numero,
        usuario_id: req.user.id, usuario: req.user.nombre,
        fecha: new Date().toISOString(), suc_id: t.suc_origen
      });
    });
  }

  db.audit(req.user, t.suc_origen, 'transferencias', 'cancelar', 'Cancelación Transfer #'+t.numero, req.params.id);
  db.update('transferencias', req.params.id, { estado: 'cancelada' });
  res.json({ ok: true });
});

module.exports = router;
