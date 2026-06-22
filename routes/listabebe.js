const express = require('express');
const router = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware } = require('../middleware/auth');
router.use(authMiddleware);

// GET all
router.get('/', (req,res) => {
  const db = _getDB(req);
  const {q, estado, suc_id} = req.query;
  let rows = db.all('lista_bebe').sort((a,b)=>new Date(b.creado||0)-new Date(a.creado||0));
  if(estado) rows = rows.filter(r=>r.estado===estado);
  if(suc_id && !['admin','supervisor'].includes(req.user.rol)) rows = rows.filter(r=>r.suc_id===suc_id);
  if(q) { const ql=q.toLowerCase(); rows=rows.filter(r=>(r.mama||'').toLowerCase().includes(ql)||(r.bebe||'').toLowerCase().includes(ql)||(r.tel||'').includes(q)); }
  // Enrich with items
  rows = rows.map(r => {
    const items = db.where('lista_bebe_items', i=>i.lista_id===r.id);
    const total = items.length;
    const recibidos = items.filter(i=>i.cantidad_recibida>=i.cantidad).length;
    return {...r, n_items: total, items_total:total, items_recibidos:recibidos};
  });
  res.json(rows);
});

// GET one with items
router.get('/:id', (req,res) => {
  const db = _getDB(req);
  const l = db.findOne('lista_bebe', req.params.id);
  if(!l) return res.status(404).json({error:'No encontrado'});
  const items = db.where('lista_bebe_items', i=>i.lista_id===req.params.id);
  res.json({...l, items});
});

// POST create
router.post('/', (req,res) => {
  const db = _getDB(req);
  const {mama,bebe,tel,email,fecha_parto,estado,notas,items,suc_id} = req.body;
  if(!mama) return res.status(400).json({error:'Nombre requerido'});
  const id = 'lb'+uid();
  db.insert('lista_bebe',{id,mama,bebe:bebe||null,tel:tel||null,email:email||null,fecha_parto:fecha_parto||null,estado:estado||'activa',notas:notas||null,suc_id:suc_id||req.user.suc_id||null,creado:new Date().toISOString()});
  if(items&&items.length) items.forEach(it=>db.insert('lista_bebe_items',{id:uid(),lista_id:id,prod_id:it.prod_id||null,nombre:it.nombre||'',cantidad:parseInt(it.cantidad)||1,cantidad_recibida:0}));
  db.audit(req.user, suc_id||null, 'lista_bebe', 'crear', 'Lista de '+mama, id);
  res.json({id,ok:true});
});

// PUT update
router.put('/:id', (req,res) => {
  const db = _getDB(req);
  const {mama,bebe,tel,email,fecha_parto,estado,notas,items} = req.body;
  const l = db.findOne('lista_bebe', req.params.id);
  if(!l) return res.status(404).json({error:'No encontrado'});
  db.update('lista_bebe', req.params.id, {mama,bebe,tel,email,fecha_parto,estado,notas});
  if(items) {
    // Replace items
    db.where('lista_bebe_items',i=>i.lista_id===req.params.id).forEach(i=>db.delete('lista_bebe_items',i.id));
    items.forEach(it=>db.insert('lista_bebe_items',{id:uid(),lista_id:req.params.id,prod_id:it.prod_id||null,nombre:it.nombre||'',cantidad:parseInt(it.cantidad)||1,cantidad_recibida:parseInt(it.cantidad_recibida)||0}));
  }
  res.json({ok:true});
});

// POST /:id/recibir/:item_id
router.post('/:id/recibir/:item_id', (req,res) => {
  const db = _getDB(req);
  const item = db.findOne('lista_regalos_items', req.params.item_id);
  if(!item) return res.status(404).json({error:'Item no encontrado'});
  const nueva_cant = Math.min(item.cantidad, (item.cantidad_recibida||0) + (parseInt(req.body.cantidad)||1));
  db.update('lista_bebe_items', req.params.item_id, {cantidad_recibida: nueva_cant});
  res.json({ok:true, cantidad_recibida: nueva_cant});
});

// DELETE
router.delete('/:id', (req,res) => {
  const db = _getDB(req);
  db.where('lista_bebe_items',i=>i.lista_id===req.params.id).forEach(i=>db.delete('lista_bebe_items',i.id));
  db.delete('lista_bebe', req.params.id);
  res.json({ok:true});
});

module.exports = router;
