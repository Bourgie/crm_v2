const express = require('express');
const router = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol } = require('../middleware/auth');
router.use(authMiddleware);
router.use(requireRol('admin','supervisor'));

router.get('/', (req,res) => {
  const db = _getDB(req);
  const {modulo, usuario_id, suc_id, desde, hasta, limit=200} = req.query;
  let rows = db.all('audit_log');
  if(modulo) rows = rows.filter(r=>r.modulo===modulo);
  if(usuario_id) rows = rows.filter(r=>r.usuario_id===usuario_id);
  if(suc_id) rows = rows.filter(r=>r.suc_id===suc_id);
  if(desde) rows = rows.filter(r=>r.fecha>=desde);
  if(hasta) rows = rows.filter(r=>r.fecha<=hasta+'T23:59:59');
  rows = rows.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0, parseInt(limit));
  res.json(rows);
});

module.exports = router;
