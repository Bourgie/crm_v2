const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || require('../db_sqlite').db;
const { authMiddleware, requireRol } = require('../middleware/auth');

// Helper: enrich empleado list with linked user data
function enrichEmpleados(db, list) {
  const users = db.all('usuarios');
  return list.map(e => {
    const u = e.usuario_id ? users.find(u => u.id === e.usuario_id) : null;
    return { ...e, usuario_nombre: u ? u.nombre : null, usuario_email: u ? u.email : null, usuario_rol: u ? u.rol : null, usuario_activo: u ? u.activo : null };
  });
}

// ── Empleados ──────────────────────────────────────────────
router.get('/empleados', authMiddleware, requireRol('admin','supervisor','cajero'), (req, res) => {
  const db = _getDB(req);
  let list = db.all('empleados').sort((a, b) => (a.nombre||'').localeCompare(b.nombre||''));
  if (req.query.activo !== undefined) list = list.filter(e => e.activo === (req.query.activo === '1' || req.query.activo === 'true'));
  if (req.query.suc_id) list = list.filter(e => e.suc_id === req.query.suc_id);
  res.json(enrichEmpleados(db, list));
});

router.get('/empleados/:id', authMiddleware, requireRol('admin','supervisor','cajero'), (req, res) => {
  const db = _getDB(req);
  const e = db.findOne('empleados', req.params.id);
  if (!e) return res.status(404).json({ error: 'Empleado no encontrado' });
  const ausencias = db.where('ausencias', a => a.empleado_id === req.params.id).sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
  const historial = db.where('historial_salarios', h => h.empleado_id === req.params.id).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const enriched = enrichEmpleados(db, [e])[0];
  res.json({ ...enriched, ausencias, historial_salarios: historial });
});

router.post('/empleados', authMiddleware, requireRol('admin','supervisor'), async (req, res) => {
  const db = _getDB(req);
  const { nombre, apellido, dni, cuil, tel, email, direccion, fecha_ingreso, puesto, salario, obra_social, suc_id, notas } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const empleadoId = uid();
  const r = db.insert('empleados', {
    id: empleadoId, nombre, apellido: apellido || null, dni: dni || null, cuil: cuil || null,
    tel: tel || null, email: email || null, direccion: direccion || null,
    fecha_ingreso: fecha_ingreso || null, puesto: puesto || null,
    salario: parseFloat(salario) || 0, obra_social: obra_social || null,
    suc_id: suc_id || null, activo: 1, notas: notas || null,
    usuario_id: req.body.vincular_usuario_id || null, creado: new Date().toISOString(),
  });
  db.audit(req.user, suc_id, 'rrhh', 'crear_empleado', `Empleado creado: ${nombre}`, empleadoId);
  res.json(r);
});

router.put('/empleados/:id', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const existing = db.findOne('empleados', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Empleado no encontrado' });
  const allowed = {};
  for (const k of ['nombre','apellido','dni','cuil','tel','email','direccion','fecha_ingreso','puesto','salario','obra_social','suc_id','activo','notas','usuario_id','vincular_usuario_id']) {
    if (req.body[k] !== undefined) allowed[k] = k === 'activo' ? (req.body[k] ? 1 : 0) : req.body[k];
  }
  // Map vincular_usuario_id to usuario_id
  if ('vincular_usuario_id' in allowed) {
    allowed.usuario_id = allowed.vincular_usuario_id || null;
    delete allowed.vincular_usuario_id;
  }
  const prevSalario = parseFloat(existing.salario) || 0;
  const newSalario = 'salario' in allowed ? parseFloat(allowed.salario) || 0 : prevSalario;
  if ('salario' in allowed && newSalario !== prevSalario) {
    db.insert('historial_salarios', {
      id: uid(), empleado_id: req.params.id,
      salario_anterior: prevSalario, salario_nuevo: newSalario,
      fecha: new Date().toISOString(), motivo: allowed.motivo_salario || null,
      modificado_por: req.user ? req.user.nombre : null
    });
  }
  const r = db.update('empleados', req.params.id, allowed);
  db.audit(req.user, allowed.suc_id || existing.suc_id, 'rrhh', 'editar_empleado', `Empleado editado: ${r.nombre}`, req.params.id, { cambios: Object.keys(allowed).join(',') });
  res.json(r);
});

router.delete('/empleados/:id', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  db.softDel('empleados', req.params.id);
  res.json({ ok: true });
});

// ── Ausencias ──────────────────────────────────────────────
router.get('/ausencias', authMiddleware, requireRol('admin','supervisor','cajero'), (req, res) => {
  const db = _getDB(req);
  let list = db.all('ausencias').sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
  if (req.query.empleado_id) list = list.filter(a => a.empleado_id === req.query.empleado_id);
  if (req.query.desde) list = list.filter(a => a.fecha_inicio >= req.query.desde);
  if (req.query.hasta) list = list.filter(a => a.fecha_inicio <= req.query.hasta);
  // Enrich with empleado name
  const emps = db.all('empleados');
  list = list.map(a => ({ ...a, emp_nombre: (emps.find(e => e.id === a.empleado_id) || {}).nombre || '—' }));
  res.json(list);
});

router.post('/ausencias', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const { empleado_id, tipo, fecha_inicio, fecha_fin, motivo, certificado } = req.body;
  if (!empleado_id || !fecha_inicio) return res.status(400).json({ error: 'Empleado y fecha inicio requeridos' });
  const r = db.insert('ausencias', {
    id: uid(), empleado_id, tipo: tipo || 'otro',
    fecha_inicio, fecha_fin: fecha_fin || null,
    motivo: motivo || null, certificado: certificado ? 1 : 0,
    aprobado_por: req.user ? req.user.nombre : null,
    creado: new Date().toISOString(),
  });
  res.json(r);
});

router.put('/ausencias/:id', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const existing = db.findOne('ausencias', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Ausencia no encontrada' });
  const allowed = {};
  for (const k of ['tipo','fecha_inicio','fecha_fin','motivo','certificado']) {
    if (req.body[k] !== undefined) allowed[k] = k === 'certificado' ? (req.body[k] ? 1 : 0) : req.body[k];
  }
  const r = db.update('ausencias', req.params.id, allowed);
  res.json(r);
});

router.delete('/ausencias/:id', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  db.delete('ausencias', req.params.id);
  res.json({ ok: true });
});

// ── Reporte del mes ─────────────────────────────────────────
router.get('/reporte', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const hoy = new Date();
  const mes = req.query.mes !== undefined ? parseInt(req.query.mes) : hoy.getMonth() + 1;
  const anio = req.query.anio !== undefined ? parseInt(req.query.anio) : hoy.getFullYear();
  const inicioMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const finMes = new Date(anio, mes, 0).toISOString().substr(0, 10);
  const empleados = db.all('empleados').filter(e => e.activo !== false);
  const ausencias = db.where('ausencias', a =>
    a.fecha_inicio >= inicioMes && a.fecha_inicio <= finMes
  );
  const porTipo = {};
  ausencias.forEach(a => { porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1; });
  res.json({
    total_empleados: empleados.length,
    total_ausencias: ausencias.length,
    ausencias_por_tipo: porTipo,
    empleados_con_ausencias: [...new Set(ausencias.map(a => a.empleado_id))].length,
  });
});

// ── Asistencias (control horario) ─────────────────────────
router.post('/asistencias', authMiddleware, requireRol('admin','supervisor','cajero'), (req, res) => {
  const db = _getDB(req);
  const { empleado_id, tipo, suc_id, notas } = req.body;
  if (!empleado_id) return res.status(400).json({ error: 'Empleado requerido' });
  const r = db.insert('asistencias', {
    id: uid(), empleado_id, tipo: tipo || 'entrada',
    fecha_hora: new Date().toISOString(), suc_id: suc_id || null,
    notas: notas || null, creado: new Date().toISOString()
  });
  res.json(r);
});

router.get('/asistencias', authMiddleware, requireRol('admin','supervisor','cajero'), (req, res) => {
  const db = _getDB(req);
  let list = db.all('asistencias').sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
  if (req.query.empleado_id) list = list.filter(a => a.empleado_id === req.query.empleado_id);
  if (req.query.desde) list = list.filter(a => a.fecha_hora >= req.query.desde);
  if (req.query.hasta) list = list.filter(a => a.fecha_hora <= (req.query.hasta + 'T23:59:59'));
  const emps = db.all('empleados');
  list = list.map(a => ({ ...a, emp_nombre: (emps.find(e => e.id === a.empleado_id) || {}).nombre || '—' }));
  res.json(list);
});

// ── Sueldos: pago dentro del framework de dinero ────────────
// Crea un gasto (categoría "Sueldos") y registra el egreso en la fuente elegida
router.get('/sueldos/pagos', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const pagos = db.all('sueldo_pagos').filter(p => !p.anulado).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const emps = db.all('empleados');
  res.json(pagos.map(p => ({ ...p, emp_nombre: (emps.find(e => e.id === p.empleado_id) || {}).nombre || '—' })));
});

router.post('/sueldos/pagar', authMiddleware, requireRol('admin','supervisor'), (req, res) => {
  const db = _getDB(req);
  const { empleado_id, monto, fecha, fuente, cuenta_id, suc_id, metodo, medio, concepto } = req.body;
  const emp = db.findOne('empleados', empleado_id);
  if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });
  const m = Math.round((parseFloat(monto) || 0) * 100) / 100;
  if (m <= 0) return res.status(400).json({ error: 'Monto inválido' });
  if (fuente === 'cajon' && !suc_id) return res.status(400).json({ error: 'suc_id requerido para pagar desde caja' });

  // Categoría "Sueldos" (se crea si no existe)
  let cat = db.where('gastos_categorias', c => c.nombre && c.nombre.toLowerCase() === 'sueldos')[0];
  if (!cat) {
    cat = db.insert('gastos_categorias', { id: 'gc' + uid(), nombre: 'Sueldos', icono: '👥', activo: true });
  }

  const idGasto = 'g' + uid();
  const idPago = 'sp_' + uid();
  const { pagar } = require('../lib/treasury');
  const r = pagar(db, {
    monto: m,
    concepto: concepto || `Sueldo ${emp.nombre} ${emp.apellido || ''}`.trim(),
    categoria: 'Sueldos',
    metodo_pago: metodo || 'transferencia',
    medio: medio || 'transferencia',
    suc_id: suc_id || null,
    cuenta_id,
    usuario: req.user,
    ref_tipo: 'sueldo_pago', ref_id: idPago,
    fuente: fuente || 'tesoreria',
  });
  if (!r.ok) return res.status(400).json({ error: r.error });

  db.insert('gastos', {
    id: idGasto,
    nombre: `Sueldo ${emp.nombre} ${emp.apellido || ''}`.trim(),
    categoria_id: cat.id,
    categoria_nombre: 'Sueldos',
    monto: m,
    fecha: fecha || new Date().toISOString().substr(0, 10),
    fecha_vencimiento: null,
    estado: 'pagado',
    metodo_pago: metodo || 'transferencia',
    suc_id: suc_id || null,
    recurrente_id: null,
    nro_comprobante: '',
    notas: 'Pago de sueldo — RRHH',
    registrado_por: req.user.nombre,
    pagado_por: req.user.nombre,
    genera_egreso_caja: fuente === 'cajon' ? 1 : 0,
    caja_movimiento_id: fuente === 'cajon' ? r.id : null,
  });
  db.insert('sueldo_pagos', {
    id: idPago, empleado_id, monto: m,
    fecha: new Date().toISOString(),
    concepto: concepto || 'Pago de sueldo',
    gasto_id: idGasto,
    fuente: fuente || 'tesoreria',
    creado_por: req.user.nombre,
    anulado: 0,
  });
  db.audit(req.user, suc_id || null, 'rrhh', 'pagar_sueldo', `Sueldo ${emp.nombre} — $${m}`, idPago);
  res.json({ id: idPago, gasto_id: idGasto, ok: true });
});

module.exports = router;
