const express = require('express');
const router = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol } = require('../middleware/auth');
router.use(authMiddleware);

// Métodos que entran físicamente a la caja (efectivo)
const METODOS_EFECTIVO = ['efectivo'];

function esFisicoEnCaja(pago_metodo) {
  if (!pago_metodo) return true;
  return METODOS_EFECTIVO.includes(pago_metodo);
}

// Recibe la db correcta de la empresa
function getCajaEstado(suc_id, empDB) {
  const hoy = new Date().toISOString().substr(0, 10);
  const caja = empDB.where('cajas', c => c.suc_id === suc_id && c.fecha.substr(0, 10) === hoy && c.estado === 'abierta')[0];
  if (!caja) return { estado: 'cerrada', suc_id, movimientos: [], ingresos: 0, egresos: 0, saldo: 0, saldo_efectivo: 0, fondo_inicial: 0 };

  const movs = empDB.where('movimientos_caja', m => m.caja_id === caja.id && !m.anulado)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const ingresos = movs.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
  const egresos  = movs.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0);

  const ingresos_efectivo = movs.filter(m => m.tipo === 'ingreso' && esFisicoEnCaja(m.pago_metodo)).reduce((a, m) => a + m.monto, 0);
  const egresos_efectivo  = movs.filter(m => m.tipo === 'egreso'  && esFisicoEnCaja(m.pago_metodo)).reduce((a, m) => a + m.monto, 0);
  const saldo_efectivo = (caja.fondo_inicial || 0) + ingresos_efectivo - egresos_efectivo;

  const por_pago = {};
  movs.filter(m => m.pago_metodo).forEach(m => {
    if (!por_pago[m.pago_metodo]) por_pago[m.pago_metodo] = 0;
    por_pago[m.pago_metodo] += m.tipo === 'ingreso' ? m.monto : -m.monto;
  });

  return { ...caja, movimientos: movs, ingresos, egresos, saldo: saldo_efectivo, saldo_efectivo, ingresos_efectivo, por_pago };
}

// Estado caja actual
router.get('/estado/:suc_id', (req, res) => {
  const empDB = _getDB(req);
  res.json(getCajaEstado(req.params.suc_id, empDB));
});

// Verificar si caja está abierta
router.get('/check/:suc_id', (req, res) => {
  const empDB = _getDB(req);
  const est = getCajaEstado(req.params.suc_id, empDB);
  res.json({ abierta: est.estado === 'abierta', saldo: est.saldo_efectivo || 0 });
});

// Historial
router.get('/historial/:suc_id', (req, res) => {
  const empDB = _getDB(req);
  const { desde, hasta } = req.query;
  let rows = empDB.where('cajas', c => c.suc_id === req.params.suc_id);
  if (desde) rows = rows.filter(c => c.fecha.substr(0, 10) >= desde);
  if (hasta) rows = rows.filter(c => c.fecha.substr(0, 10) <= hasta);
  rows = rows.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 60).map(c => {
    const movs = empDB.where('movimientos_caja', m => m.caja_id === c.id && !m.anulado);
    const ing  = movs.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
    const egr  = movs.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0);
    const ing_ef = movs.filter(m => m.tipo === 'ingreso' && esFisicoEnCaja(m.pago_metodo)).reduce((a, m) => a + m.monto, 0);
    const egr_ef = movs.filter(m => m.tipo === 'egreso'  && esFisicoEnCaja(m.pago_metodo)).reduce((a, m) => a + m.monto, 0);
    const pp = typeof c.por_pago === 'string' ? JSON.parse(c.por_pago || '{}') : (c.por_pago || {});
    return { ...c, ingresos: ing, egresos: egr, saldo_efectivo: (c.fondo_inicial || 0) + ing_ef - egr_ef, n_movimientos: movs.length, por_pago: pp };
  });
  res.json(rows);
});

// Abrir caja
router.post('/abrir', requireRol('admin', 'supervisor', 'cajero'), (req, res) => {
  const empDB = _getDB(req);
  const { suc_id, fondo_inicial } = req.body;
  if (!suc_id) return res.status(400).json({ error: 'suc_id requerido' });
  const hoy = new Date().toISOString().substr(0, 10);
  const ex = empDB.where('cajas', c => c.suc_id === suc_id && c.fecha.substr(0, 10) === hoy && c.estado === 'abierta')[0];
  if (ex) return res.status(400).json({ error: 'Ya hay una caja abierta hoy' });
  const ahora = new Date().toISOString();
  const id = 'cj' + uid();
  empDB.insert('cajas', { id, suc_id, fecha: ahora, estado: 'abierta', fondo_inicial: parseFloat(fondo_inicial) || 0, apertura: ahora, usuario_apertura: req.user.nombre, usuario_apertura_id: req.user.id });
  empDB.audit(req.user, suc_id, 'caja', 'abrir', 'Apertura caja — Fondo: $'+fondo_inicial, id);
  res.json({ id, ok: true });
});

// Cerrar caja
router.post('/cerrar', requireRol('admin', 'supervisor', 'cajero'), (req, res) => {
  const empDB = _getDB(req);
  const { suc_id, saldo_real } = req.body;
  const hoy = new Date().toISOString().substr(0, 10);
  const caja = empDB.where('cajas', c => c.suc_id === suc_id && c.fecha.substr(0, 10) === hoy && c.estado === 'abierta')[0];
  if (!caja) return res.status(404).json({ error: 'No hay caja abierta' });
  const est = getCajaEstado(suc_id, empDB);
  const saldo_esperado_efectivo = est.saldo_efectivo;
  const diferencia = parseFloat(saldo_real) - saldo_esperado_efectivo;
  empDB.update('cajas', caja.id, {
    estado: 'cerrada',
    cierre: new Date().toISOString(),
    saldo_esperado: saldo_esperado_efectivo,
    saldo_real: parseFloat(saldo_real) || 0,
    diferencia,
    ingresos_totales: est.ingresos,
    por_pago: JSON.stringify(est.por_pago),
    usuario_cierre: req.user.nombre,
    usuario_cierre_id: req.user.id
  });
  empDB.audit(req.user, caja.suc_id, 'caja', 'cerrar', 'Cierre caja — Saldo: $'+saldo_esperado_efectivo, caja.id);
  res.json({ ok: true, saldo_esperado: saldo_esperado_efectivo, diferencia });
});

// Cierre forzado
router.post('/cerrar-forzado/:id', requireRol('admin', 'supervisor', 'cajero'), (req, res) => {
  const empDB = _getDB(req);
  const caj = empDB.findOne('cajas', req.params.id);
  if (!caj) return res.status(404).json({ error: 'Caja no encontrada' });
  if (caj.estado !== 'abierta') return res.status(400).json({ error: 'La caja ya está cerrada' });
  const est = getCajaEstado(caj.suc_id, empDB);
  empDB.update('cajas', caj.id, {
    estado: 'cerrada',
    fecha_cierre: new Date().toISOString(),
    usuario_cierre: req.user.nombre,
    saldo_esperado_efectivo: est.saldo_efectivo,
    saldo_real: 0,
    diferencia: -est.saldo_efectivo,
    notas: (req.body.notas || 'Cierre forzado desde historial'),
    cierre_forzado: true
  });
  res.json({ ok: true });
});

// Movimiento manual
router.post('/movimiento', requireRol('admin', 'supervisor', 'cajero'), (req, res) => {
  const empDB = _getDB(req);
  const { suc_id, tipo, concepto, monto, pago_metodo, confirmar_retiro } = req.body;
  if (!suc_id || !tipo || !concepto || !monto) return res.status(400).json({ error: 'Datos incompletos' });
  const hoy = new Date().toISOString().substr(0, 10);
  const caja = empDB.where('cajas', c => c.suc_id === suc_id && c.fecha.substr(0, 10) === hoy && c.estado === 'abierta')[0];
  if (!caja) return res.status(400).json({ error: 'La caja está cerrada' });

  // Validar que el retiro no supere el efectivo disponible
  if (tipo === 'egreso' && (!pago_metodo || pago_metodo === 'efectivo')) {
    const est = getCajaEstado(suc_id, empDB);
    const montoRetiro = parseFloat(monto);
    if (montoRetiro > est.saldo_efectivo && !confirmar_retiro) {
      return res.status(200).json({
        advertencia: true,
        efectivo_disponible: est.saldo_efectivo,
        mensaje: `El retiro ($${montoRetiro.toFixed(2)}) supera el efectivo disponible en caja ($${est.saldo_efectivo.toFixed(2)}). ¿Confirmar de todas formas?`
      });
    }
  }

  empDB.insert('movimientos_caja', { id: uid(), caja_id: caja.id, suc_id, fecha: new Date().toISOString(), tipo, concepto, monto: parseFloat(monto), auto: false, pago_metodo: pago_metodo || 'efectivo', usuario: req.user.nombre, anulado: false });
  res.json({ ok: true });
});

// Anular movimiento
router.delete('/movimiento/:id', requireRol('admin'), (req, res) => {
  const empDB = _getDB(req);
  const mov = empDB.findOne('movimientos_caja', req.params.id);
  if (!mov) return res.status(404).json({ error: 'No encontrado' });
  if (mov.auto) return res.status(400).json({ error: 'Los movimientos automáticos no se pueden anular aquí.' });
  empDB.update('movimientos_caja', req.params.id, { anulado: true, anulado_por: req.user.nombre, anulado_fecha: new Date().toISOString() });
  res.json({ ok: true });
});

// Movimientos filtrados
router.get('/movimientos', (req, res) => {
  const empDB = _getDB(req);
  const { venta_id, suc_id } = req.query;
  let movs = empDB.all('movimientos_caja');
  if (venta_id) movs = movs.filter(m => m.venta_id === venta_id);
  if (suc_id) movs = movs.filter(m => m.suc_id === suc_id);
  res.json(movs);
});

// Resumen de cierre — datos completos para mostrar antes/después de cerrar
router.get('/resumen-cierre/:suc_id', (req, res) => {
  const empDB = _getDB(req);
  const suc_id = req.params.suc_id;
  const hoy = new Date().toISOString().substr(0, 10);

  // Caja abierta hoy
  const caja = empDB.where('cajas', c => c.suc_id === suc_id && c.fecha.substr(0, 10) === hoy && c.estado === 'abierta')[0];
  if (!caja) return res.status(404).json({ error: 'No hay caja abierta hoy' });

  // Todos los movimientos de hoy
  const movs = empDB.where('movimientos_caja', m => m.caja_id === caja.id && !m.anulado);

  // — Ventas del día (movimientos automáticos de tipo ingreso con venta_id) —
  const movsVentas = movs.filter(m => m.auto && m.tipo === 'ingreso' && m.venta_id);
  const ventasIds = [...new Set(movsVentas.map(m => m.venta_id))];
  const ventasDia = ventasIds.map(id => empDB.findOne('ventas', id)).filter(Boolean).filter(v => !v.anulada);

  // Desglose por método de pago con cantidad y monto
  const porPago = {};
  ventasDia.forEach(v => {
    const pago = v.pago || 'efectivo';
    if (!porPago[pago]) porPago[pago] = { cantidad: 0, monto: 0 };
    porPago[pago].cantidad++;
    porPago[pago].monto += v.total || 0;
  });
  const totalVentas = ventasDia.reduce((a, v) => a + (v.total || 0), 0);

  // — Gastos con egreso en caja —
  const movsGastos = movs.filter(m => m.auto && m.tipo === 'egreso' && m.gasto_id);
  const gastosItems = movsGastos.map(m => {
    const g = m.gasto_id ? empDB.findOne('gastos', m.gasto_id) : null;
    return { nombre: m.concepto || (g && g.nombre) || '—', categoria: g && g.categoria_nombre, monto: m.monto };
  });
  const totalGastos = gastosItems.reduce((a, g) => a + g.monto, 0);

  // — Movimientos manuales —
  const movsManuales = movs.filter(m => !m.auto);
  const totalManualIng = movsManuales.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
  const totalManualEgr = movsManuales.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0);

  // — Resumen de efectivo —
  const fondo = caja.fondo_inicial || 0;
  const ingEfectivoVentas = movsVentas
    .filter(m => ['efectivo'].includes(m.pago_metodo))
    .reduce((a, m) => a + m.monto, 0);
  const ingManualEfectivo = movsManuales
    .filter(m => m.tipo === 'ingreso' && (!m.pago_metodo || m.pago_metodo === 'efectivo'))
    .reduce((a, m) => a + m.monto, 0);
  const egrEfectivo = movs
    .filter(m => m.tipo === 'egreso' && (!m.pago_metodo || m.pago_metodo === 'efectivo'))
    .reduce((a, m) => a + m.monto, 0);
  const efectivoEsperado = fondo + ingEfectivoVentas + ingManualEfectivo - egrEfectivo;

  res.json({
    caja_id: caja.id,
    ventas: {
      cantidad: ventasDia.length,
      total: totalVentas,
      por_pago: porPago
    },
    gastos: {
      items: gastosItems,
      total: totalGastos
    },
    movimientos_manuales: {
      items: movsManuales.map(m => ({ concepto: m.concepto, pago_metodo: m.pago_metodo, tipo: m.tipo, monto: m.monto })),
      ingresos: totalManualIng,
      egresos: totalManualEgr
    },
    resumen: {
      fondo_inicial: fondo,
      ingresos_efectivo_ventas: ingEfectivoVentas,
      ingresos_manual_efectivo: ingManualEfectivo,
      egresos_efectivo: egrEfectivo,
      efectivo_esperado: efectivoEsperado
    }
  });
});

module.exports = router;
module.exports.getCajaEstado = getCajaEstado;
