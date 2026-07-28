const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol, permiteSucursal } = require('../middleware/auth');
router.use(authMiddleware);

function enrichPres(p, db) {
  const sucs=db.all('sucursales'),clis=db.all('clientes'),vends=db.all('vendedores');
  const c=clis.find(x=>x.id===p.cliente_id);
  const vd=vends.find(x=>x.id===p.vend_id);
  return {...p,
    suc_nombre:(sucs.find(s=>s.id===p.suc_id)||{}).nombre||'—',
    cli_nombre:c?c.nombre+' '+c.apellido:'Consumidor final',
    cli_tel:c?.tel||'',
    cli_dni:c?.dni||'',
    cli_dir:c?.dir||'',
    vend_nombre:vd?vd.nombre+' '+vd.apellido:'—',
  };
}

function renderPDFContent(doc, p, cfg) {
  const left = 50, right = 545, pageW = 545;
  const clr = { primary: '#1e3a5f', accent: '#2563eb', text: '#1f2937', muted: '#6b7280', light: '#f3f4f6', border: '#e5e7eb' };
  const items = p.items || [];

  doc.rect(left, 50, pageW, 100).fill(clr.primary);
  doc.fill('#fff').fontSize(22).font('Helvetica-Bold').text(cfg.nombre || 'FlexCRM', left + 20, 65);
  doc.fontSize(9).font('Helvetica');
  let hx = left + 20, hy = 95;
  if (cfg.cuit) { doc.text('CUIT: ' + cfg.cuit, hx, hy); hy += 14; }
  if (cfg.dir) { doc.text(cfg.dir, hx, hy); hy += 14; }
  if (cfg.tel) { doc.text('Tel: ' + cfg.tel, hx, hy); hy += 14; }
  if (cfg.email) { doc.text(cfg.email, hx, hy); }
  doc.fontSize(28).font('Helvetica-Bold').text('PRESUPUESTO', right - 180, 68, { width: 180, align: 'right' });
  doc.fontSize(11).font('Helvetica').fill('#cbd5e1').text('N° ' + (p.numero || p.id.substr(-6)), right - 180, 100, { align: 'right' });

  let y = 175;
  doc.fill(clr.text).fontSize(9).font('Helvetica');
  doc.font('Helvetica-Bold', 10).text('CLIENTE', left, y);
  doc.moveTo(left, y + 14).lineTo(left + 240, y + 14).stroke(clr.border);
  let cy = y + 22;
  doc.font('Helvetica', 9).text(p.cli_nombre || 'Consumidor final', left, cy); cy += 14;
  if (p.cli_dni) { doc.text('DNI: ' + p.cli_dni, left, cy); cy += 14; }
  if (p.cli_dir) { doc.text(p.cli_dir, left, cy); cy += 14; }
  if (p.cli_tel) { doc.text(p.cli_tel, left, cy); }

  doc.font('Helvetica-Bold', 10).text('DETALLES', right - 240, y);
  doc.moveTo(right - 240, y + 14).lineTo(right, y + 14).stroke(clr.border);
  let dy = y + 22;
  doc.font('Helvetica', 9);
  doc.text('Fecha: ' + (p.fecha ? new Date(p.fecha).toLocaleDateString('es-AR') : '—'), right - 240, dy); dy += 14;
  doc.text('Válido hasta: ' + (p.fecha_vto ? new Date(p.fecha_vto).toLocaleDateString('es-AR') : (p.dias_validez ? p.dias_validez + ' días' : '—')), right - 240, dy); dy += 14;
  doc.text('Vendedor: ' + (p.vend_nombre || '—'), right - 240, dy); dy += 14;
  doc.text('Estado: ' + (p.estado || 'borrador'), right - 240, dy);

  y = Math.max(cy, dy) + 30;
  const cols = [
    { x: left, w: 245, label: 'Descripción', align: 'left' },
    { x: left + 245, w: 60, label: 'Cant.', align: 'center' },
    { x: left + 305, w: 110, label: 'Precio unit.', align: 'right' },
    { x: left + 415, w: 130, label: 'Subtotal', align: 'right' },
  ];
  doc.rect(left, y, pageW, 22).fill(clr.light);
  doc.fill(clr.text).font('Helvetica-Bold', 9);
  cols.forEach(c => doc.text(c.label, c.x, y + 5, { width: c.w, align: c.align }));
  y += 22;

  let total = 0;
  items.forEach((it) => {
    if (y > 720) { doc.addPage(); y = 50; }
    const subtotal = (it.precio || 0) * (it.cantidad || 1);
    total += subtotal;
    doc.fill(clr.text).font('Helvetica', 9);
    const vals = [
      { v: it.nombre || '—', align: 'left' },
      { v: String(it.cantidad || 1), align: 'center' },
      { v: '$' + Number(it.precio || 0).toLocaleString('es-AR'), align: 'right' },
      { v: '$' + Number(subtotal).toLocaleString('es-AR'), align: 'right' },
    ];
    cols.forEach((c, ci) => doc.text(vals[ci].v, c.x, y + 2, { width: c.w, align: vals[ci].align }));
    doc.moveTo(left, y + 16).lineTo(right, y + 16).stroke(clr.border);
    y += 22;
  });

  y += 8;
  if (y > 710) { doc.addPage(); y = 50; }
  doc.rect(left, y, pageW, 30).fill(clr.primary);
  doc.fill('#fff').font('Helvetica-Bold', 14);
  doc.text('TOTAL:', left + 20, y + 7);
  doc.text('$' + Number(p.total || total).toLocaleString('es-AR'), right - 140, y + 7, { width: 120, align: 'right' });

  y += 50;
  const notes = p.notas || p.observaciones || '';
  if (notes && y < 700) {
    doc.fill(clr.text).font('Helvetica-Bold', 9).text('OBSERVACIONES', left, y);
    doc.moveTo(left, y + 14).lineTo(left + 200, y + 14).stroke(clr.border);
    doc.font('Helvetica', 9).text(notes, left, y + 22);
    y += doc.heightOfString(notes) + 40;
  }

  if (y > 740) { doc.addPage(); y = 50; }
  doc.fontSize(8).font('Helvetica').fill(clr.muted);
  doc.text('Documento generado por FlexCRM — Sin validez fiscal', left, 780, { align: 'center', width: pageW });
  doc.text('Fecha de emisión: ' + new Date().toLocaleString('es-AR'), left, 793, { align: 'center', width: pageW });
}

function buildPDF(p, cfg, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="presupuesto_${p.numero || p.id.substr(-6)}.pdf"`);
  doc.pipe(res);
  renderPDFContent(doc, p, cfg);
  doc.end();
}

function pdfBuffer(p, cfg) {
  return new Promise(resolve => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    renderPDFContent(doc, p, cfg);
    doc.end();
  });
}

router.get('/', (req,res) => {
  const db = _getDB(req);
  const {estado,cli_id,desde,hasta,suc_id,vend_id} = req.query;
  let rows = db.all('presupuestos');
  if(suc_id) rows=rows.filter(p=>p.suc_id===suc_id);
  if(vend_id) rows=rows.filter(p=>p.vend_id===vend_id);
  if(estado) rows=rows.filter(p=>p.estado===estado);
  if(cli_id) rows=rows.filter(p=>p.cliente_id===cli_id);
  if(desde) rows=rows.filter(p=>p.fecha.substr(0,10)>=desde);
  if(hasta) rows=rows.filter(p=>p.fecha.substr(0,10)<=hasta);
  res.json(rows.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).map(p => enrichPres(p, db)));
});

// ── PDF ──
router.get('/:id/pdf', (req, res) => {
  const db = _getDB(req);
  const p = db.findOne('presupuestos', req.params.id);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  const items = db.where('presupuesto_items', i => i.presupuesto_id === req.params.id);
  const cfg = db.getConfig();
  buildPDF({ ...enrichPres(p, db), items }, cfg, res);
});

router.get('/:id', (req,res) => {
  const db = _getDB(req);
  const p=db.findOne('presupuestos',req.params.id);
  if(!p) return res.status(404).json({error:'No encontrado'});
  const items=db.where('presupuesto_items',i=>i.presupuesto_id===req.params.id);
  res.json({...enrichPres(p, db),items});
});

router.post('/', (req,res) => {
  const db = _getDB(req);
  const {suc_id,vend_id,cliente_id,items,subtotal,descuento,total,notas,dias_validez} = req.body;
  if(!items?.length) return res.status(400).json({error:'Sin items'});
  const presups=db.all('presupuestos');
  const numero=(presups.length?Math.max(...presups.map(p=>p.numero||0)):0)+1;
  const id='pres'+uid(); const fecha=new Date().toISOString();
  const vto=new Date(fecha); vto.setDate(vto.getDate()+(parseInt(dias_validez)||15));
  db.insert('presupuestos',{id,numero,fecha,fecha_vto:vto.toISOString().substr(0,10),suc_id,vend_id:vend_id||req.user.id,cliente_id:cliente_id||null,subtotal:parseFloat(subtotal)||0,descuento:parseFloat(descuento)||0,total:parseFloat(total)||0,estado:'borrador',notas:notas||''});
  items.forEach(it=>db.insert('presupuesto_items',{id:uid(),presupuesto_id:id,...it}));
  res.json({id,numero});
});

router.put('/:id', (req,res) => {
  const db = _getDB(req);
  const {estado,notas,items,...rest} = req.body;
  const upd={...rest};
  if(estado) upd.estado=estado;
  if(notas!==undefined) upd.notas=notas;
  db.update('presupuestos',req.params.id,upd);
  if(items){
    db.where('presupuesto_items',i=>i.presupuesto_id===req.params.id).forEach(i=>db.delete('presupuesto_items',i.id));
    items.forEach(it=>db.insert('presupuesto_items',{id:uid(),presupuesto_id:req.params.id,...it}));
  }
  res.json({ok:true});
});

// Convertir presupuesto en venta
router.post('/:id/convertir-venta', (req,res) => {
  const db = _getDB(req);
  const p=db.findOne('presupuestos',req.params.id);
  if(!p) return res.status(404).json({error:'No encontrado'});
  const items=db.where('presupuesto_items',i=>i.presupuesto_id===req.params.id);
  db.update('presupuestos',req.params.id,{estado:'aprobado',convertido_venta:true});
  res.json({presupuesto:p,items,listo:true});
});

// Convertir en pendiente de entrega
router.post('/:id/convertir-pendiente', (req,res) => {
  const db = _getDB(req);
  const p=db.findOne('presupuestos',req.params.id);
  if(!p) return res.status(404).json({error:'No encontrado'});
  const items=db.where('presupuesto_items',i=>i.presupuesto_id===req.params.id);
  db.update('presupuestos',req.params.id,{estado:'aprobado'});
  res.json({presupuesto:p,items,listo:true});
});

router.delete('/:id', requireRol('admin','supervisor'), (req,res) => {
  const db = _getDB(req);
  db.where('presupuesto_items',i=>i.presupuesto_id===req.params.id).forEach(i=>db.delete('presupuesto_items',i.id));
  db.delete('presupuestos',req.params.id);
  res.json({ok:true});
});

// ── Cambiar estado ──
router.post('/:id/estado', authMiddleware, (req,res) => {
  const db = _getDB(req);
  const pres = db.findOne('presupuestos', req.params.id);
  if(!pres) return res.status(404).json({error:'No encontrado'});
  const {estado, nota} = req.body;
  const estadosValidos = ['borrador','pendiente','aprobado','rechazado','vencido'];
  if(!estadosValidos.includes(estado)) return res.status(400).json({error:'Estado inválido'});
  db.update('presupuestos', req.params.id, {estado});
  // Register in seguimiento
  db.insert('seguimiento', {
    id:'sg'+uid(), entidad_tipo:'presupuesto', entidad_id:req.params.id,
    fecha:new Date().toISOString(),
    usuario_id:req.user.id, usuario_nombre:req.user.nombre,
    suc_id:pres.suc_id,
    accion:'cambio_estado',
    nota:nota||'',
    estado_anterior:pres.estado||'borrador',
    estado_nuevo:estado
  });
  db.audit(req.user, pres.suc_id||null, 'presupuestos', 'estado_'+estado, 'Presupuesto #'+pres.numero+' → '+estado, req.params.id);
  res.json({ok:true});
});

// ── Agregar seguimiento ──
router.post('/:id/seguimiento', authMiddleware, (req,res) => {
  const db = _getDB(req);
  const pres = db.findOne('presupuestos', req.params.id);
  if(!pres) return res.status(404).json({error:'No encontrado'});
  const {nota, accion} = req.body;
  const id = 'sg'+uid();
  db.insert('seguimiento', {
    id, entidad_tipo:'presupuesto', entidad_id:req.params.id,
    fecha:new Date().toISOString(),
    usuario_id:req.user.id, usuario_nombre:req.user.nombre,
    suc_id:pres.suc_id,
    accion:accion||'contacto',
    nota:nota||'',
    estado_anterior:pres.estado, estado_nuevo:pres.estado
  });
  res.json({id, ok:true});
});

// ── Get seguimiento ──
router.get('/:id/seguimiento', authMiddleware, (req,res) => {
  const db = _getDB(req);
  const rows = db.where('seguimiento', s=>s.entidad_tipo==='presupuesto'&&s.entidad_id===req.params.id)
    .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  res.json(rows);
});

// ── Convertir en venta real ──
router.post('/:id/convertir', authMiddleware, requireRol('admin','supervisor','vendedor'), (req,res) => {
  const db = _getDB(req);
  const pres = db.findOne('presupuestos', req.params.id);
  if(!pres) return res.status(404).json({error:'No encontrado'});
  if(!permiteSucursal(req.user, pres.suc_id)) return res.status(403).json({error:'No tenés acceso a esta sucursal'});
  if(pres.estado !== 'aceptado') return res.status(400).json({error:'Solo presupuestos aceptados pueden convertirse en venta'});
  const items = db.where('presupuesto_items', i=>i.presupuesto_id===req.params.id);
  if(!items.length) return res.status(400).json({error:'Sin items'});

  // Validate caja is open
  const hoy = new Date().toISOString().substr(0,10);
  const cajaHoy = db.where('cajas', c => c.suc_id === pres.suc_id && c.fecha.substr(0,10) === hoy && c.estado === 'abierta')[0];
  if(!cajaHoy) return res.status(400).json({error:'La caja de esta sucursal está cerrada. Abrila primero en Caja.'});

  // Create venta (same logic as POST /ventas)
  const ventas = db.all('ventas');
  const numero = (ventas.length ? Math.max(...ventas.map(v => v.numero || 0)) : 999) + 1;
  const id = 'v' + uid();
  const fecha = new Date().toISOString();
  const totalFinal = parseFloat(pres.total) || items.reduce((s, i) => s + (parseFloat(i.precio) || 0) * (parseInt(i.cantidad) || 0), 0);

  db.insert('ventas', {
    id, numero, fecha, suc_id: pres.suc_id,
    vend_nombre_fallback: pres.vend_nombre || '',
    vend_id: pres.vend_id || req.user.id,
    cliente_id: pres.cliente_id || null,
    subtotal: totalFinal, descuento: 0, total: totalFinal,
    pago: 'pendiente_cobro', comprobante: 'ticket',
    anulada: false, cobrada: false, es_ctacte: false,
    recargo_pago: 0, envio_monto: 0, envio_detalle: ''
  });

  const { updateSucStock, updateVariantStock } = require('./stock_helpers');
  items.forEach(it => {
    db.insert('venta_items', {
      id: uid(), venta_id: id, prod_id: it.prod_id || null,
      variante_id: it.variante_id || null,
      nombre: it.nombre, talle: it.talle || '',
      precio: parseFloat(it.precio) || 0, cantidad: parseInt(it.cantidad) || 1,
      subtotal: (parseFloat(it.precio) || 0) * (parseInt(it.cantidad) || 1), costo: 0
    });
    if (it.variante_id) {
      const vRes = updateVariantStock(db, it.variante_id, pres.suc_id, -parseInt(it.cantidad));
      if (vRes) {
        db.insert('stock_movimientos', {
          id: uid(), prod_id: it.prod_id, nombre_prod: it.nombre,
          tipo: 'salida', cantidad: -parseInt(it.cantidad),
          stock_antes: vRes.before, stock_despues: vRes.after,
          motivo: 'Venta #' + numero + ' (desde presupuesto, variante)',
          usuario_id: req.user.id, usuario: req.user.nombre, fecha, suc_id: pres.suc_id
        });
      }
    } else if (it.prod_id) {
      const p = db.findOne('productos', it.prod_id);
      if (p) {
        const sucRes = updateSucStock(db, it.prod_id, pres.suc_id, -parseInt(it.cantidad));
        if (sucRes) {
          db.insert('stock_movimientos', {
            id: uid(), prod_id: it.prod_id, nombre_prod: p.nombre,
            tipo: 'salida', cantidad: -parseInt(it.cantidad),
            stock_antes: sucRes.before, stock_despues: sucRes.after,
            motivo: 'Venta #' + numero + ' (desde presupuesto)',
            usuario_id: req.user.id, usuario: req.user.nombre, fecha, suc_id: pres.suc_id
          });
        }
      }
    }
  });

  // Mark presupuesto as convertido
  db.update('presupuestos', req.params.id, { estado: 'convertido' });
  db.insert('seguimiento', {
    id: 'sg' + uid(), entidad_tipo: 'presupuesto', entidad_id: req.params.id,
    fecha: new Date().toISOString(), usuario_id: req.user.id,
    usuario_nombre: req.user.nombre, suc_id: pres.suc_id,
    accion: 'convertido', nota: 'Convertido a Venta #' + numero,
    estado_anterior: 'aceptado', estado_nuevo: 'convertido'
  });
  db.audit(req.user, pres.suc_id, 'presupuestos', 'convertir', 'Presupuesto #' + pres.numero + ' → Venta #' + numero, req.params.id);

  res.json({ ok: true, venta_id: id, numero });
});

// ── Enviar PDF por email ──
router.post('/:id/enviar-email', authMiddleware, async (req, res) => {
  const db = _getDB(req);
  const p = db.findOne('presupuestos', req.params.id);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  const { para, mensaje, agregarPipeline, pipelineEtapaId } = req.body;
  if (!para) return res.status(400).json({ error: 'Email del destinatario requerido' });

  try {
    const items = db.where('presupuesto_items', i => i.presupuesto_id === req.params.id);
    const cfg = db.getConfig();
    const pdfBuf = await pdfBuffer({ ...enrichPres(p, db), items }, cfg);

    // Check SMTP config
    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass) {
      return res.status(400).json({ error: 'SMTP no configurado. Configurá los datos de email en Ajustes.' });
    }

    let nodemailer;
    try { nodemailer = require('nodemailer'); }
    catch (e) { return res.status(500).json({ error: 'nodemailer no instalado' }); }

    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host, port: parseInt(cfg.smtp_port) || 465,
      secure: (parseInt(cfg.smtp_port) || 465) === 465,
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    });

    const from = cfg.smtp_from || 'noreply@flexcrm.com';
    const subject = 'Presupuesto N° ' + (p.numero || p.id.substr(-6)) + ' — ' + (cfg.nombre || 'FlexCRM');
    const html = `
      <p>Hola,</p>
      <p>Adjuntamos el presupuesto <strong>N° ${p.numero || p.id.substr(-6)}</strong>.</p>
      ${mensaje ? '<p><em>' + mensaje.replace(/\n/g, '<br>') + '</em></p>' : ''}
      <p>Podés descargar el PDF adjunto para ver los detalles.</p>
      <p style="color:#6b7280;font-size:12px">— ${cfg.nombre || 'FlexCRM'}</p>`;

    await transporter.sendMail({
      from, to: para, subject,
      html,
      attachments: [{
        filename: 'presupuesto_' + (p.numero || p.id.substr(-6)) + '.pdf',
        content: pdfBuf,
      }],
    });

    // Update estado to enviado and register in seguimiento
    db.update('presupuestos', req.params.id, { estado: 'enviado' });
    db.insert('seguimiento', {
      id: 'sg' + uid(), entidad_tipo: 'presupuesto', entidad_id: req.params.id,
      fecha: new Date().toISOString(), usuario_id: req.user.id,
      usuario_nombre: req.user.nombre, suc_id: p.suc_id,
      accion: 'email_enviado', nota: 'Enviado a ' + para,
      estado_anterior: p.estado || 'borrador', estado_nuevo: 'enviado'
    });

    // Optionally add to pipeline (defaults to "En negociación")
    if (agregarPipeline) {
      const etapaId = pipelineEtapaId || (() => {
        const etapa = db.where('pipeline_etapas', e => e.nombre === 'En negociación' && e.activo !== false)[0];
        return etapa ? etapa.id : null;
      })();
      if (etapaId) {
        const cli = db.all('clientes').find(c => c.id === p.cliente_id);
        const oppNombre = 'Presupuesto: ' + (p.cli_nombre_manual || (cli ? cli.nombre + ' ' + (cli.apellido || '') : p.id.substr(-6)));
        db.insert('pipeline_oportunidades', {
          id: uid(), nombre: oppNombre, etapa_id: etapaId,
          cliente_id: p.cliente_id || null,
          cli_nombre: p.cli_nombre_manual || (cli ? cli.nombre + ' ' + (cli.apellido || '') : ''),
          valor_estimado: p.total || 0, probabilidad: 50,
          fecha_creacion: new Date().toISOString(),
          fecha_cierre_estimada: p.fecha_vto || null,
          usuario_id: req.user.id, usuario_nombre: req.user.nombre,
          suc_id: p.suc_id, notas: 'Desde presupuesto N° ' + (p.numero || p.id.substr(-6)),
          venta_id: null, estado: 'activo', activo: 1
        });
        db.audit(req.user, p.suc_id, 'pipeline', 'crear_desde_presupuesto', oppNombre, p.id);
      }
    }

    res.json({ ok: true, mensaje: 'Email enviado a ' + para });
  } catch (e) {
    console.error('[Presupuesto Email]', e.message);
    res.status(500).json({ error: 'Error al enviar email: ' + e.message });
  }
});

// ── Enviar al pipeline ──
router.post('/:id/enviar-pipeline', authMiddleware, (req, res) => {
  const db = _getDB(req);
  const p = db.findOne('presupuestos', req.params.id);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  const { etapa_id, valor_estimado, probabilidad } = req.body;
  const finalEtapaId = etapa_id || (() => {
    const etapa = db.where('pipeline_etapas', e => e.nombre === 'En negociación' && e.activo !== false)[0];
    return etapa ? etapa.id : null;
  })();
  if (!finalEtapaId) return res.status(400).json({ error: 'Etapa del pipeline requerida' });

  const cli = db.all('clientes').find(c => c.id === p.cliente_id);
  const nombre = 'Presupuesto: ' + (p.cli_nombre_manual || (cli ? cli.nombre + ' ' + (cli.apellido || '') : p.id.substr(-6)));
  const r = db.insert('pipeline_oportunidades', {
    id: uid(), nombre, etapa_id: finalEtapaId,
    cliente_id: p.cliente_id || null,
    cli_nombre: p.cli_nombre_manual || (cli ? cli.nombre + ' ' + (cli.apellido || '') : ''),
    valor_estimado: parseFloat(valor_estimado) || (p.total || 0),
    probabilidad: parseInt(probabilidad) || 50,
    fecha_creacion: new Date().toISOString(),
    fecha_cierre_estimada: p.fecha_vto || null,
    usuario_id: req.user.id, usuario_nombre: req.user.nombre,
    suc_id: p.suc_id, notas: 'Desde presupuesto N° ' + (p.numero || p.id.substr(-6)),
    venta_id: null, estado: 'activo', activo: 1
  });
  db.audit(req.user, p.suc_id, 'pipeline', 'crear_desde_presupuesto', nombre, p.id);
  res.json({ ok: true, id: r.id });
});

module.exports = router;
