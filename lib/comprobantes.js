// FlexCRM — Comprobantes de transferencia (unicidad cross-sucursal)
const { uid } = require('../db_sqlite');

function normalizar(nro) {
  if (!nro) return '';
  return nro.toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-zA-Z0-9]/g, '')                       // remove non-alphanumeric
    .toUpperCase()
    .replace(/^0+/, '');                                 // strip leading zeros
}

function buscarDuplicado(db, nro, excludeId) {
  const n = normalizar(nro);
  if (!n) return null;
  let rows = db.raw.prepare("SELECT * FROM comprobantes_transferencia WHERE nro_normalizado = ? AND anulado = 0").all(n);
  if (excludeId) rows = rows.filter(r => r.id !== excludeId);
  return rows.length ? rows : null;
}

function duplicadoInfo(db, rows) {
  if (!rows || !rows.length) return [];
  return rows.map(r => {
    let info = { nro: r.nro, fecha: r.fecha, monto: r.monto, suc_nombre: '—' };
    if (r.venta_id) {
      const v = db.findOne('ventas', r.venta_id);
      if (v) {
        info.venta_id = v.id;
        info.venta_numero = v.numero;
        info.fecha = v.fecha;
        info.monto = v.total;
        info.cli_nombre = v.cli_nombre || 'Consumidor final';
        const sucs = db.all('sucursales');
        info.suc_nombre = (sucs.find(s => s.id === v.suc_id) || {}).nombre || v.suc_id || '—';
      }
    }
    return info;
  });
}

function registrar(db, { nro, venta_id, ctacte_mov_id, cliente_id, suc_id, monto, usuario, usuario_id }) {
  const n = normalizar(nro);
  if (!n) return null;
  const id = 'cpt' + uid();
  const fecha = new Date().toISOString();
  db.insert('comprobantes_transferencia', {
    id, nro: nro, nro_normalizado: n,
    venta_id: venta_id || null,
    ctacte_mov_id: ctacte_mov_id || null,
    cliente_id: cliente_id || null,
    suc_id: suc_id || null,
    monto: monto || 0,
    fecha,
    usuario: usuario || '',
    usuario_id: usuario_id || '',
    anulado: 0
  });
  return id;
}

function liberarVenta(db, venta_id) {
  if (!venta_id) return;
  db.raw.prepare("UPDATE comprobantes_transferencia SET anulado = 1 WHERE venta_id = ? AND anulado = 0").run(venta_id);
}

module.exports = { normalizar, buscarDuplicado, duplicadoInfo, registrar, liberarVenta };
