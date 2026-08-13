const express = require('express');
const router = express.Router();
const { uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || require('../db_sqlite').db;
const { authMiddleware, requireRol, requirePermiso } = require('../middleware/auth');
const { requireModule } = require('../middleware/tenant');
const { calcSaldo, sincSaldo, asegurarBovedaCentral, movTes } = require('../lib/treasury');

router.use(authMiddleware);
router.use(requireModule('tesoreria'));

// ── Helpers ──────────────────────────────────────────────────

// Cuenta de empresa (suc_id = null) requiere permiso cross-sucursal
// (excepto la Bóveda Central, que es de la empresa y visible para todos con acceso)
function puedeVerCuenta(req, cuenta) {
  if (cuenta && !cuenta.suc_id && cuenta.tipo !== 'cash') {
    const perms = req.userPermisos || [];
    return perms.includes('*') || perms.includes('tesoreria_view_all_sucursales');
  }
  return true;
}

function cuentasVisibles(db, req) {
  const perms = req.userPermisos || [];
  const veTodo = perms.includes('*') || perms.includes('tesoreria_view_all_sucursales');
  const cuentas = db.find('treasury_accounts', { activo: true });
  return veTodo ? cuentas : cuentas.filter(c => c.suc_id || c.tipo === 'cash');
}

const TIPOS_CUENTA = ['cash', 'banco', 'billetera', 'tarjeta', 'otro'];
const TIPO_LABEL = { cash: 'Bóveda', banco: 'Banco', billetera: 'Billetera', tarjeta: 'Tarjeta', otro: 'Otra' };

// ── CUENTAS ──────────────────────────────────────────────────
router.get('/cuentas', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  asegurarBovedaCentral(db);
  const { tipo, suc_id } = req.query;
  let rows = cuentasVisibles(db, req);
  if (tipo) rows = rows.filter(c => c.tipo === tipo);
  if (suc_id) rows = rows.filter(c => c.suc_id === suc_id || c.suc_id === null);
  const sucs = db.find('sucursales', {});
  res.json(rows.map(c => ({
    ...c,
    saldo: calcSaldo(db, c.id),
    tipo_label: TIPO_LABEL[c.tipo] || c.tipo,
    suc_nombre: c.suc_id ? ((sucs.find(s => s.id === c.suc_id) || {}).nombre || c.suc_id) : 'Todas las sucursales',
  })));
});

router.post('/cuentas', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  const { nombre, tipo, suc_id, saldo_inicial, moneda, notas } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  if (tipo === 'cash') return res.status(400).json({ error: 'La Bóveda Central es única y ya existe. Creá cuentas banco, billetera o tarjeta.' });
  if (suc_id === undefined || suc_id === '') {
    const perms = req.userPermisos || [];
    if (!perms.includes('*') && !perms.includes('tesoreria_view_all_sucursales')) {
      return res.status(403).json({ error: 'No podés crear cuentas de empresa (todas las sucursales)' });
    }
  }
  const id = 'tc_' + uid();
  const cuenta = db.insert('treasury_accounts', {
    id, nombre, tipo: TIPOS_CUENTA.includes(tipo) ? tipo : 'banco',
    suc_id: suc_id || null,
    moneda: moneda || 'ARS',
    saldo_inicial: parseFloat(saldo_inicial) || 0,
    saldo_actual: parseFloat(saldo_inicial) || 0,
    activo: true,
    creado: new Date().toISOString(),
    notas: notas || '',
  });
  db.audit(req.user, suc_id || null, 'tesoreria', 'crear_cuenta', `${nombre} (${TIPO_LABEL[cuenta.tipo] || cuenta.tipo})`, id);
  res.json({ ...cuenta, saldo: parseFloat(saldo_inicial) || 0 });
});

router.put('/cuentas/:id', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  const existing = db.findOne('treasury_accounts', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada' });
  if (!puedeVerCuenta(req, existing)) return res.status(403).json({ error: 'Sin permisos para esta cuenta' });
  const { nombre, tipo, suc_id, saldo_inicial, moneda, notas, activo } = req.body;
  const updates = {};
  for (const [k, v] of Object.entries({ nombre, tipo, suc_id, saldo_inicial, moneda, notas, activo })) {
    if (v !== undefined) updates[k] = v;
  }
  if (existing.tipo === 'cash' && updates.tipo !== undefined && updates.tipo !== 'cash') {
    return res.status(400).json({ error: 'La Bóveda Central no puede cambiar de tipo' });
  }
  if (updates.suc_id === '') updates.suc_id = null;
  if (updates.tipo !== undefined && !TIPOS_CUENTA.includes(updates.tipo)) delete updates.tipo;
  db.update('treasury_accounts', req.params.id, updates);
  const saldo = sincSaldo(db, req.params.id);
  db.audit(req.user, existing.suc_id || null, 'tesoreria', 'editar_cuenta', (nombre || existing.nombre), req.params.id);
  res.json({ ok: true, saldo });
});

router.delete('/cuentas/:id', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  const existing = db.findOne('treasury_accounts', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada' });
  if (!puedeVerCuenta(req, existing)) return res.status(403).json({ error: 'Sin permisos para esta cuenta' });
  if (existing.tipo === 'cash') return res.status(400).json({ error: 'La Bóveda Central no se puede eliminar ni desactivar' });
  const saldo = calcSaldo(db, req.params.id);
  if (saldo !== 0) return res.status(400).json({ error: `No podés desactivar una cuenta con saldo ($${saldo}). Transferí el saldo primero.` });
  db.update('treasury_accounts', req.params.id, { activo: false });
  db.audit(req.user, existing.suc_id || null, 'tesoreria', 'desactivar_cuenta', existing.nombre, req.params.id);
  res.json({ ok: true });
});

// ── TRANSACCIONES (ingresos / egresos) ──────────────────────
router.get('/transacciones', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  const { cuenta_id, tipo, desde, hasta, limit, ref_tipo, ref_id, suc_id } = req.query;
  const cuentas = cuentasVisibles(db, req);
  const ids = new Set(cuentas.map(c => c.id));
  let rows = db.all('treasury_transactions').filter(t => ids.has(t.cuenta_id));
  if (cuenta_id) rows = rows.filter(t => t.cuenta_id === cuenta_id);
  if (tipo) rows = rows.filter(t => t.tipo === tipo);
  if (desde) rows = rows.filter(t => t.fecha >= desde);
  if (hasta) rows = rows.filter(t => t.fecha <= hasta + 'T23:59:59');
  if (ref_tipo) rows = rows.filter(t => t.ref_tipo === ref_tipo);
  if (ref_id) rows = rows.filter(t => t.ref_id === ref_id);
  if (suc_id) rows = rows.filter(t => t.suc_id === suc_id);
  rows = rows.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  if (limit) rows = rows.slice(0, parseInt(limit) || 100);
  const cuentaNombre = {};
  cuentas.forEach(c => { cuentaNombre[c.id] = c.nombre; });
  const sucs = db.find('sucursales', {});
  res.json(rows.map(t => ({
    ...t,
    cuenta_nombre: cuentaNombre[t.cuenta_id] || t.cuenta_id,
    suc_nombre: t.suc_id ? ((sucs.find(s => s.id === t.suc_id) || {}).nombre || t.suc_id) : '—',
  })));
});

router.post('/transacciones', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  const { cuenta_id, tipo, monto, concepto, categoria, metodo_pago, medio, fecha, suc_id, ref_tipo, ref_id } = req.body;
  const cuenta = db.findOne('treasury_accounts', cuenta_id);
  if (!cuenta || !cuenta.activo) return res.status(400).json({ error: 'Cuenta inválida' });
  if (!puedeVerCuenta(req, cuenta)) return res.status(403).json({ error: 'Sin permisos para esta cuenta' });
  if (!['income', 'expense'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido (income/expense)' });
  const m = Math.round((parseFloat(monto) || 0) * 100) / 100;
  if (m <= 0) return res.status(400).json({ error: 'Monto debe ser mayor a 0' });
  if (!concepto) return res.status(400).json({ error: 'Concepto requerido' });

  const r = movTes(db, {
    cuenta_id, tipo, concepto, monto: m, categoria: categoria || '',
    metodo_pago: metodo_pago || '', medio: medio || '',
    suc_id: cuenta.suc_id || suc_id || null,
    usuario: req.user,
    ref_tipo: ref_tipo || null, ref_id: ref_id || null,
  });
  if (!r.ok) {
    if (r.dup) return res.status(409).json({ error: r.error, id: r.id });
    return res.status(400).json({ error: r.error });
  }
  const tx = db.findOne('treasury_transactions', r.id);
  if (fecha) db.update('treasury_transactions', r.id, { fecha });
  const saldo = sincSaldo(db, cuenta_id);
  db.audit(req.user, tx.suc_id || null, 'tesoreria', tipo === 'income' ? 'ingreso' : 'egreso', `${concepto} — $${m}`, r.id);
  res.json({ ...tx, saldo_cuenta: saldo });
});

// Anular una transacción (soft, con reversión de saldo)
router.post('/transacciones/:id/anular', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  const tx = db.findOne('treasury_transactions', req.params.id);
  if (!tx) return res.status(404).json({ error: 'Movimiento no encontrado' });
  if (tx.anulado) return res.status(400).json({ error: 'Ya está anulado' });
  const cuenta = db.findOne('treasury_accounts', tx.cuenta_id);
  if (cuenta && !puedeVerCuenta(req, cuenta)) return res.status(403).json({ error: 'Sin permisos para esta cuenta' });
  db.update('treasury_transactions', tx.id, { anulado: 1 });
  // Si era un gasto, eliminar el registro de gasto (consistencia contable)
  if (tx.ref_tipo === 'gasto' && tx.ref_id) {
    try { db.delete('gastos', String(tx.ref_id)); } catch(e) {}
  }
  const saldo = sincSaldo(db, tx.cuenta_id);
  db.audit(req.user, tx.suc_id || null, 'tesoreria', 'anular_transaccion', `${tx.concepto} — $${tx.monto}`, tx.id);
  res.json({ ok: true, saldo_cuenta: saldo });
});

// Conciliar/desconciliar un movimiento (control vs extracto bancario)
router.post('/transacciones/:id/conciliar', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  const tx = db.findOne('treasury_transactions', req.params.id);
  if (!tx) return res.status(404).json({ error: 'Movimiento no encontrado' });
  if (tx.anulado) return res.status(400).json({ error: 'El movimiento está anulado' });
  const cuenta = db.findOne('treasury_accounts', tx.cuenta_id);
  if (cuenta && !puedeVerCuenta(req, cuenta)) return res.status(403).json({ error: 'Sin permisos para esta cuenta' });
  if (cuenta && cuenta.tipo === 'cash') return res.status(400).json({ error: 'Los movimientos de la Bóveda Central no requieren conciliación' });
  const conciliado = req.body && req.body.conciliado !== false;
  db.update('treasury_transactions', tx.id, {
    conciliado: conciliado ? 1 : 0,
    conciliado_fecha: conciliado ? new Date().toISOString() : null,
    conciliado_por: conciliado ? req.user.nombre : null,
  });
  db.audit(req.user, tx.suc_id || null, 'tesoreria', conciliado ? 'conciliar' : 'desconciliar', `${tx.concepto} — $${tx.monto}`, tx.id);
  res.json({ ok: true, conciliado: conciliado ? 1 : 0 });
});

// ── TRANSFERENCIAS ENTRE CUENTAS ─────────────────────────────
router.get('/transferencias', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  const { desde, hasta, limit, suc_id } = req.query;
  const cuentas = cuentasVisibles(db, req);
  const ids = new Set(cuentas.map(c => c.id));
  let rows = db.all('treasury_transfers').filter(t => ids.has(t.cuenta_origen) && ids.has(t.cuenta_destino));
  if (desde) rows = rows.filter(t => t.fecha >= desde);
  if (hasta) rows = rows.filter(t => t.fecha <= hasta + 'T23:59:59');
  if (suc_id) rows = rows.filter(t => t.suc_id === suc_id);
  rows = rows.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  if (limit) rows = rows.slice(0, parseInt(limit) || 100);
  const nombre = {};
  cuentas.forEach(c => { nombre[c.id] = c.nombre; });
  const sucs = db.find('sucursales', {});
  res.json(rows.map(t => ({
    ...t,
    origen_nombre: t.cuenta_origen ? (nombre[t.cuenta_origen] || t.cuenta_origen) : 'Depósito externo',
    destino_nombre: nombre[t.cuenta_destino] || t.cuenta_destino,
    suc_nombre: t.suc_id ? ((sucs.find(s => s.id === t.suc_id) || {}).nombre || t.suc_id) : '—',
  })));
});

router.post('/transferencias', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  const { cuenta_origen, cuenta_destino, monto, concepto, fecha, suc_id } = req.body;
  if (cuenta_origen === cuenta_destino) return res.status(400).json({ error: 'Origen y destino deben ser distintos' });
  const origen = db.findOne('treasury_accounts', cuenta_origen);
  const destino = db.findOne('treasury_accounts', cuenta_destino);
  if (!origen || !origen.activo || !destino || !destino.activo) return res.status(400).json({ error: 'Cuentas inválidas' });
  if (!puedeVerCuenta(req, origen) || !puedeVerCuenta(req, destino)) return res.status(403).json({ error: 'Sin permisos para alguna de las cuentas' });
  const m = Math.round((parseFloat(monto) || 0) * 100) / 100;
  if (m <= 0) return res.status(400).json({ error: 'Monto debe ser mayor a 0' });
  const saldoOrigen = calcSaldo(db, cuenta_origen);
  if (saldoOrigen < m) return res.status(400).json({ error: `Saldo insuficiente en origen ($${saldoOrigen})` });

  const id = 'tf_' + uid();
  const tr = db.insert('treasury_transfers', {
    id, cuenta_origen, cuenta_destino, monto: m,
    fecha: fecha || new Date().toISOString(),
    concepto: concepto || 'Transferencia entre cuentas',
    tipo: 'manual', caja_id: null,
    suc_id: suc_id || null,
    usuario: req.user.nombre, usuario_id: req.user.id,
    anulado: 0,
  });
  const sO = sincSaldo(db, cuenta_origen);
  const sD = sincSaldo(db, cuenta_destino);
  db.audit(req.user, suc_id || null, 'tesoreria', 'transferencia', `${origen.nombre} → ${destino.nombre} — $${m}`, id);
  res.json({ ...tr, saldo_origen: sO, saldo_destino: sD });
});

router.post('/transferencias/:id/anular', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  const tr = db.findOne('treasury_transfers', req.params.id);
  if (!tr) return res.status(404).json({ error: 'Transferencia no encontrada' });
  if (tr.anulado) return res.status(400).json({ error: 'Ya está anulada' });
  const origen = db.findOne('treasury_accounts', tr.cuenta_origen);
  const destino = db.findOne('treasury_accounts', tr.cuenta_destino);
  if ((origen && !puedeVerCuenta(req, origen)) || (destino && !puedeVerCuenta(req, destino))) return res.status(403).json({ error: 'Sin permisos' });
  db.update('treasury_transfers', tr.id, { anulado: 1 });
  sincSaldo(db, tr.cuenta_origen);
  sincSaldo(db, tr.cuenta_destino);
  db.audit(req.user, tr.suc_id || null, 'tesoreria', 'anular_transferencia', `${tr.concepto} — $${tr.monto}`, tr.id);
  res.json({ ok: true });
});

// ── RESUMEN ──────────────────────────────────────────────────
router.get('/resumen', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  const { mes } = req.query;
  const mesKey = mes || new Date().toISOString().substr(0, 7);
  const d = new Date(mesKey + '-01T12:00:00');
  d.setMonth(d.getMonth() - 1);
  const mesKeyAnterior = d.toISOString().substr(0, 7);
  const cuentas = cuentasVisibles(db, req);
  const ids = new Set(cuentas.map(c => c.id));

  let total = 0, porTipo = {};
  const detalle = cuentas.map(c => {
    const saldo = calcSaldo(db, c.id);
    total += saldo;
    const k = TIPO_LABEL[c.tipo] || c.tipo;
    if (!porTipo[k]) porTipo[k] = 0;
    porTipo[k] += saldo;
    return { id: c.id, nombre: c.nombre, tipo: c.tipo, tipo_label: k, suc_id: c.suc_id, saldo, bloqueada: c.tipo === 'cash' };
  });

  const txs = db.all('treasury_transactions').filter(t => !t.anulado && ids.has(t.cuenta_id) && t.fecha && t.fecha.substr(0, 7) === mesKey);
  const ingresos_mes = txs.filter(t => t.tipo === 'income').reduce((a, t) => a + t.monto, 0);
  const egresos_mes = txs.filter(t => t.tipo === 'expense').reduce((a, t) => a + t.monto, 0);
  const trs = db.all('treasury_transfers').filter(t => !t.anulado && ids.has(t.cuenta_origen) && t.fecha && t.fecha.substr(0, 7) === mesKey);
  const transferencias_mes = trs.reduce((a, t) => a + t.monto, 0);
  const retiros_mes = txs.filter(t => t.ref_tipo === 'retiro_caja').reduce((a, t) => a + t.monto, 0);

  // Mes anterior (KPI comparativo)
  const txsAnt = db.all('treasury_transactions').filter(t => !t.anulado && ids.has(t.cuenta_id) && t.fecha && t.fecha.substr(0, 7) === mesKeyAnterior);
  const egresos_mes_anterior = txsAnt.filter(t => t.tipo === 'expense').reduce((a, t) => a + t.monto, 0);

  // Aporte de cada sucursal a la tesorería (retiros + cierres del mes)
  const sucs = db.find('sucursales', {});
  const porSuc = {};
  txs.filter(t => t.ref_tipo === 'retiro_caja').forEach(t => {
    const k = t.suc_id || 'otra';
    if (!porSuc[k]) porSuc[k] = { suc_id: k, retiros: 0, cierres: 0 };
    porSuc[k].retiros += t.monto;
  });
  db.all('treasury_transfers').filter(t => !t.anulado && t.tipo === 'cierre_caja' && t.fecha && t.fecha.substr(0, 7) === mesKey).forEach(t => {
    const k = t.suc_id || 'otra';
    if (!porSuc[k]) porSuc[k] = { suc_id: k, retiros: 0, cierres: 0 };
    porSuc[k].cierres += t.monto;
  });
  const por_sucursal = Object.values(porSuc).map(s => ({
    ...s,
    suc_nombre: s.suc_id === 'otra' ? 'Otra / sin sucursal' : ((sucs.find(x => x.id === s.suc_id) || {}).nombre || s.suc_id),
    retiros: Math.round(s.retiros * 100) / 100,
    cierres: Math.round(s.cierres * 100) / 100,
    total: Math.round((s.retiros + s.cierres) * 100) / 100,
  })).sort((a, b) => b.total - a.total);

  // Cuentas en rojo (bancos/billeteras con saldo negativo)
  const en_rojo = cuentas.filter(c => c.tipo !== 'cash' && calcSaldo(db, c.id) < 0)
    .map(c => ({ id: c.id, nombre: c.nombre, saldo: calcSaldo(db, c.id) }));

  res.json({
    total: Math.round(total * 100) / 100,
    por_tipo: Object.entries(porTipo).map(([tipo, saldo]) => ({ tipo, saldo: Math.round(saldo * 100) / 100 })),
    cuentas: detalle,
    ingresos_mes: Math.round(ingresos_mes * 100) / 100,
    egresos_mes: Math.round(egresos_mes * 100) / 100,
    egresos_mes_anterior: Math.round(egresos_mes_anterior * 100) / 100,
    transferencias_mes: Math.round(transferencias_mes * 100) / 100,
    retiros_mes: Math.round(retiros_mes * 100) / 100,
    por_sucursal,
    en_rojo,
  });
});

// ── REPORTE (por período, cuenta y sucursal) ──────────────────
router.get('/reporte', requireRol('admin', 'tesorero'), (req, res) => {
  const db = _getDB(req);
  const { desde, hasta, suc_id, cuenta_id } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta requeridos' });
  const cuentas = cuentasVisibles(db, req);
  const ids = new Set(cuentas.map(c => c.id));
  const nombre = {};
  cuentas.forEach(c => { nombre[c.id] = c.nombre; });
  const sucs = db.find('sucursales', {});

  let txs = db.all('treasury_transactions')
    .filter(t => !t.anulado && ids.has(t.cuenta_id) && t.fecha >= desde && t.fecha <= hasta + 'T23:59:59');
  let trs = db.all('treasury_transfers')
    .filter(t => !t.anulado && ids.has(t.cuenta_origen) && ids.has(t.cuenta_destino) && t.fecha >= desde && t.fecha <= hasta + 'T23:59:59');
  if (cuenta_id) {
    txs = txs.filter(t => t.cuenta_id === cuenta_id);
    trs = trs.filter(t => t.cuenta_origen === cuenta_id || t.cuenta_destino === cuenta_id);
  }
  if (suc_id) {
    txs = txs.filter(t => t.suc_id === suc_id);
    trs = trs.filter(t => t.suc_id === suc_id);
  }

  const filas = [
    ...txs.map(t => ({
      fecha: t.fecha, tipo: t.tipo === 'income' ? 'ingreso' : 'egreso', concepto: t.concepto,
      cuenta: nombre[t.cuenta_id] || t.cuenta_id,
      suc_nombre: t.suc_id ? ((sucs.find(s => s.id === t.suc_id) || {}).nombre || t.suc_id) : '—',
      monto: t.monto, ref_tipo: t.ref_tipo, conciliado: !!t.conciliado,
    })),
    ...trs.map(t => ({
      fecha: t.fecha, tipo: t.tipo === 'cierre_caja' ? 'cierre_caja' : (t.tipo === 'retiro_caja' ? 'retiro_caja' : 'transferencia'),
      concepto: t.concepto,
      cuenta: t.cuenta_origen ? `${nombre[t.cuenta_origen] || '?'} → ${nombre[t.cuenta_destino] || '?'}` : `→ ${nombre[t.cuenta_destino] || '?'}`,
      suc_nombre: t.suc_id ? ((sucs.find(s => s.id === t.suc_id) || {}).nombre || t.suc_id) : '—',
      monto: t.monto, ref_tipo: t.tipo, conciliado: false,
    })),
  ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  const ingresos = txs.filter(t => t.tipo === 'income').reduce((a, t) => a + t.monto, 0);
  const egresos = txs.filter(t => t.tipo === 'expense').reduce((a, t) => a + t.monto, 0);
  const cierres = trs.filter(t => t.tipo === 'cierre_caja').reduce((a, t) => a + t.monto, 0);
  const retiros = txs.filter(t => t.ref_tipo === 'retiro_caja').reduce((a, t) => a + t.monto, 0);

  res.json({
    desde, hasta,
    filas,
    totales: {
      ingresos: Math.round(ingresos * 100) / 100,
      egresos: Math.round(egresos * 100) / 100,
      cierres: Math.round(cierres * 100) / 100,
      retiros: Math.round(retiros * 100) / 100,
    },
  });
});

module.exports = router;
