const express = require('express');
const router = express.Router();
const { uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || require('../db_sqlite').db;
const { authMiddleware, requireRol } = require('../middleware/auth');

router.get('/', authMiddleware, (req, res) => {
  const db = _getDB(req);
  res.json(db.where('codigos_descuento', () => true).sort((a, b) => (a.creado || '').localeCompare(b.creado || '') || -1));
});

router.post('/', authMiddleware, requireRol('admin'), (req, res) => {
  const db = _getDB(req);
  const { codigo, tipo, valor, usos_maximos, monto_minimo, activo, aplica_a, vence, notas } = req.body;
  if (!codigo || !tipo || valor === undefined) return res.status(400).json({ error: 'Faltan campos requeridos (codigo, tipo, valor)' });
  if (!['porcentaje', 'monto'].includes(tipo)) return res.status(400).json({ error: 'tipo debe ser porcentaje o monto' });
  const existing = db.findOne('codigos_descuento', codigo);
  if (existing) return res.status(409).json({ error: 'El código ya existe' });
  const r = db.insert('codigos_descuento', {
    codigo: codigo.toUpperCase(), tipo, valor: parseFloat(valor),
    usos_maximos: parseInt(usos_maximos) || 0, usos_actuales: 0,
    monto_minimo: parseFloat(monto_minimo) || 0,
    activo: activo !== undefined ? (activo ? 1 : 0) : 1,
    aplica_a: aplica_a || null, vence: vence || null,
    creado: new Date().toISOString(), notas: notas || null,
  });
  res.json(r);
});

router.put('/:codigo', authMiddleware, requireRol('admin'), (req, res) => {
  const db = _getDB(req);
  const existing = db.findOne('codigos_descuento', req.params.codigo);
  if (!existing) return res.status(404).json({ error: 'Código no encontrado' });
  const { usos_actuales, ...rest } = req.body;
  const allowed = {};
  for (const k of ['tipo', 'valor', 'usos_maximos', 'monto_minimo', 'activo', 'aplica_a', 'vence', 'notas']) {
    if (rest[k] !== undefined) allowed[k] = k === 'activo' ? (rest[k] ? 1 : 0) : rest[k];
  }
  const r = db.update('codigos_descuento', req.params.codigo, allowed);
  res.json(r);
});

router.delete('/:codigo', authMiddleware, requireRol('admin'), (req, res) => {
  const db = _getDB(req);
  const r = db.delete('codigos_descuento', req.params.codigo);
  if (!r) return res.status(404).json({ error: 'Código no encontrado' });
  res.json({ ok: true });
});

router.post('/validar', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const { codigo, monto_compra } = req.body;
  if (!codigo) return res.status(400).json({ error: 'Código requerido' });
  const c = db.findOne('codigos_descuento', codigo.toUpperCase());
  if (!c) return res.status(404).json({ error: 'Código no encontrado', valido: false });
  if (!c.activo) return res.status(400).json({ error: 'Código desactivado', valido: false });
  if (c.vence && new Date(c.vence) < new Date(new Date().toDateString()))
    return res.status(400).json({ error: 'Código vencido', valido: false });
  if (c.usos_maximos > 0 && c.usos_actuales >= c.usos_maximos)
    return res.status(400).json({ error: 'Código agotado (usos máximos: ' + c.usos_maximos + ')', valido: false });
  const montoCompra = parseFloat(monto_compra) || 0;
  if (montoCompra > 0 && c.monto_minimo > 0 && montoCompra < c.monto_minimo)
    return res.status(400).json({ error: 'Compra mínima: $' + c.monto_minimo.toFixed(2), valido: false });
  let descuento = 0;
  let descuento_pct = 0;
  if (c.tipo === 'porcentaje') {
    descuento_pct = c.valor;
    descuento = Math.round(montoCompra * c.valor / 100);
  } else {
    descuento = Math.min(c.valor, montoCompra);
  }
  res.json({ valido: true, codigo: c.codigo, tipo: c.tipo, valor: c.valor, descuento, descuento_pct, notas: c.notas });
});

module.exports = router;
