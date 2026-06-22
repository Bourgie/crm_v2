// Stock per-sucursal — SQLite only, no fallbacks
// db must be the SQLite db from db_sqlite.js

const updateSucStock = function(db, prod_id, suc_id, delta) {
  const result = db.updateStockSuc(prod_id, suc_id, delta);
  if (!result) return null;
  const prod = db.findOne('productos', prod_id);
  return { before: result.before, after: result.after, prod };
};

const getStockSuc = function(db, prod_id, suc_id) {
  return db.getStockSuc(prod_id, suc_id);
};

const getStockSucVariant = function(db, variante_id, suc_id) {
  const row = db.raw?.prepare ? db.raw.prepare("SELECT cantidad FROM variante_stock_suc WHERE variante_id=? AND suc_id=?").get(variante_id, suc_id) : null;
  return row ? row.cantidad : 0;
};

const updateVariantStock = function(db, variante_id, suc_id, delta) {
  const before = getStockSucVariant(db, variante_id, suc_id);
  const after = Math.max(0, before + delta);
  if (db.raw?.prepare) {
    db.raw.prepare("INSERT INTO variante_stock_suc(variante_id,suc_id,cantidad) VALUES(?,?,?) ON CONFLICT(variante_id,suc_id) DO UPDATE SET cantidad=excluded.cantidad")
      .run(variante_id, suc_id, after);
  }
  return { before, after };
};

module.exports = { updateSucStock, getStockSuc, getStockSucVariant, updateVariantStock };
