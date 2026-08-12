const { uid } = require('../db_sqlite');

// ═══════════════════════════════════════════════════════════════
// Framework de dinero de FlexCRM — fuente única de movimientos
// Un hecho económico se registra UNA sola vez en UNA sola fuente:
//   - cajón del día → movimientos_caja (requiere caja abierta)
//   - tesorería     → treasury_transactions (requiere cuenta activa)
// Referencia cruzada (ref_tipo/ref_id) + índice único anti-duplicado.
// ═══════════════════════════════════════════════════════════════

function calcSaldo(db, cuentaId) {
  const acc = db.findOne('treasury_accounts', cuentaId);
  if (!acc) return 0;
  let saldo = parseFloat(acc.saldo_inicial) || 0;
  const txs = db.raw.prepare("SELECT tipo, monto FROM treasury_transactions WHERE cuenta_id=? AND anulado=0").all(cuentaId);
  for (const t of txs) saldo += t.tipo === 'income' ? (parseFloat(t.monto) || 0) : -(parseFloat(t.monto) || 0);
  const trs = db.raw.prepare("SELECT cuenta_origen, cuenta_destino, monto FROM treasury_transfers WHERE anulado=0 AND (cuenta_origen=? OR cuenta_destino=?)").all(cuentaId, cuentaId);
  for (const t of trs) {
    if (t.cuenta_destino === cuentaId) saldo += parseFloat(t.monto) || 0;
    if (t.cuenta_origen === cuentaId) saldo -= parseFloat(t.monto) || 0;
  }
  return Math.round(saldo * 100) / 100;
}

function sincSaldo(db, cuentaId) {
  const saldo = calcSaldo(db, cuentaId);
  db.update('treasury_accounts', cuentaId, { saldo_actual: saldo });
  return saldo;
}

// Registra un movimiento en el cajón del día (requiere caja abierta hoy)
function movCajon(db, { suc_id, tipo, concepto, monto, pago_metodo, usuario, auto, gasto_id, venta_id, pendiente_id }) {
  if (!suc_id) return { ok: false, error: 'suc_id requerido para registrar en caja' };
  const hoy = new Date().toISOString().substr(0, 10);
  const caja = db.where('cajas', c => c.suc_id === suc_id && c.fecha.substr(0, 10) === hoy && c.estado === 'abierta')[0];
  if (!caja) return { ok: false, error: 'No hay caja abierta hoy en esa sucursal' };
  const id = 'm' + uid();
  db.insert('movimientos_caja', {
    id, caja_id: caja.id, suc_id,
    fecha: new Date().toISOString(),
    tipo, concepto,
    monto: Math.round((parseFloat(monto) || 0) * 100) / 100,
    pago_metodo: pago_metodo || 'efectivo',
    usuario: (usuario && usuario.nombre) || 'Sistema',
    auto: !!auto, anulado: false,
    gasto_id: gasto_id || null,
    venta_id: venta_id || null,
    pendiente_id: pendiente_id || null,
  });
  return { ok: true, id, caja_id: caja.id };
}

// Registra un movimiento en una cuenta de tesorería
function movTes(db, { cuenta_id, tipo, concepto, monto, categoria, metodo_pago, medio, suc_id, usuario, ref_tipo, ref_id }) {
  const cuenta = db.findOne('treasury_accounts', cuenta_id);
  if (!cuenta || !cuenta.activo) return { ok: false, error: 'Cuenta de tesorería inválida' };
  const m = Math.round((parseFloat(monto) || 0) * 100) / 100;
  if (m <= 0) return { ok: false, error: 'Monto debe ser mayor a 0' };
  if (ref_tipo && ref_id) {
    const dup = db.raw.prepare("SELECT id FROM treasury_transactions WHERE ref_tipo=? AND ref_id=? AND anulado=0").get(ref_tipo, String(ref_id));
    if (dup) return { ok: false, dup: true, id: dup.id, error: 'Este movimiento ya fue registrado' };
  }
  const id = 'tt_' + uid();
  db.insert('treasury_transactions', {
    id, cuenta_id, tipo, monto: m,
    fecha: new Date().toISOString(),
    concepto: concepto || '',
    categoria: categoria || '',
    metodo_pago: metodo_pago || '',
    medio: medio || '',
    ref_tipo: ref_tipo || null,
    ref_id: ref_id ? String(ref_id) : null,
    suc_id: cuenta.suc_id || suc_id || null,
    usuario: (usuario && usuario.nombre) || 'Sistema',
    usuario_id: usuario ? usuario.id : null,
    anulado: 0,
  });
  sincSaldo(db, cuenta_id);
  return { ok: true, id };
}

// ── API de alto nivel ─────────────────────────────────────────
// pagar(): egreso de dinero con fuente seleccionable
//   fuente 'cajon'     → movCajon (requiere suc_id + caja abierta)
//   fuente 'tesoreria' → movTes (requiere cuenta_id)
function pagar(db, { monto, concepto, categoria, metodo_pago, medio, suc_id, usuario, ref_tipo, ref_id, fuente, cuenta_id, gasto_id }) {
  const f = fuente || 'tesoreria';
  if (f === 'cajon') {
    return movCajon(db, { suc_id, tipo: 'egreso', concepto, monto, pago_metodo: metodo_pago, usuario, auto: true, gasto_id });
  }
  return movTes(db, { cuenta_id, tipo: 'expense', concepto, monto, categoria, metodo_pago, medio, suc_id, usuario, ref_tipo, ref_id });
}

// cobrar(): ingreso de dinero con fuente seleccionable
function cobrar(db, { monto, concepto, categoria, metodo_pago, medio, suc_id, usuario, ref_tipo, ref_id, fuente, cuenta_id, venta_id, pendiente_id }) {
  const f = fuente || 'tesoreria';
  if (f === 'cajon') {
    return movCajon(db, { suc_id, tipo: 'ingreso', concepto, monto, pago_metodo: metodo_pago, usuario, auto: true, venta_id, pendiente_id });
  }
  return movTes(db, { cuenta_id, tipo: 'income', concepto, monto, categoria, metodo_pago, medio, suc_id, usuario, ref_tipo, ref_id });
}

module.exports = { calcSaldo, sincSaldo, movCajon, movTes, pagar, cobrar };
