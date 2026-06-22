const express = require('express');
const router = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, requireRol } = require('../middleware/auth');
router.use(authMiddleware);

const TIPOS_FACTURA = { 'A': 1, 'B': 6, 'C': 11 };

function getAfipConfig(cfg) {
  const opts = {
    CUIT: parseInt(cfg.arca_cuit) || 20409378472,
    access_token: cfg.arca_access_token || '',
  };
  if (cfg.arca_ambiente === 'prod' && cfg.arca_cert && cfg.arca_key) {
    opts.cert = cfg.arca_cert;
    opts.key = cfg.arca_key;
  }
  return opts;
}

function getDocTipo(cliente) {
  if (!cliente || !cliente.dni) return 99;
  const dni = String(cliente.dni).replace(/[-\s]/g, '');
  if (dni.length === 11) return 80;
  if (dni.length >= 7) return 96;
  return 99;
}

function getCondicionIVA(tipo) {
  if (tipo === 'A') return 1;
  if (tipo === 'C') return 6;
  return 5;
}

function getIvaId(cfg) {
  const pct = parseFloat(cfg.arca_iva_pct) || 21;
  const map = { 27: 3, 21: 5, 10.5: 4, 0: 2 };
  return map[pct] || 5;
}

router.get('/status', async (req, res) => {
  try {
    const cfg = _getDB(req).getConfig();
    if (!cfg.arca_access_token) return res.json({ ok: false, error: 'Access Token no configurado' });
    const Afip = require('@afipsdk/afip.js');
    const afip = new Afip(getAfipConfig(cfg));
    const status = await afip.ElectronicBilling.getServerStatus();
    res.json({ ok: true, status });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

router.post('/ventas/:id/facturar', requireRol('admin', 'supervisor', 'cajero'), async (req, res) => {
  const db = _getDB(req);
  const { tipo } = req.body;
  if (!tipo || !['A', 'B', 'C'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido (A, B o C)' });

  const venta = db.findOne('ventas', req.params.id);
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
  if (!venta.cobrada) return res.status(400).json({ error: 'La venta debe estar cobrada' });
  if (venta.facturada) return res.status(400).json({ error: 'Ya facturada' });

  const cfg = db.getConfig();
  if (!cfg.arca_access_token) return res.status(400).json({ error: 'Configurá ARCA en Ajustes' });

  try {
    const Afip = require('@afipsdk/afip.js');
    const afip = new Afip(getAfipConfig(cfg));
    const ptoVta = parseInt(cfg.arca_punto_venta) || 1;
    const cbteTipo = TIPOS_FACTURA[tipo];

    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
    const voucherNumber = lastVoucher + 1;

    const cliente = venta.cliente_id ? db.findOne('clientes', venta.cliente_id) : null;
    const docTipo = getDocTipo(cliente);
    const docNro = docTipo === 99 ? 0 : parseInt(String(cliente?.dni || '0').replace(/[-\s]/g, '')) || 0;
    const condicionIva = getCondicionIVA(tipo);
    const ivaPct = parseFloat(cfg.arca_iva_pct) || 21;
    const impTotal = Math.round(parseFloat(venta.total) * 100) / 100;
    const impNeto = Math.round(impTotal / (1 + ivaPct / 100) * 100) / 100;
    const impIVA = Math.round((impTotal - impNeto) * 100) / 100;

    const fecha = new Date(Date.now() - (new Date()).getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const data = {
      CantReg: 1, PtoVta: ptoVta, CbteTipo: cbteTipo, Concepto: 1,
      DocTipo: docTipo, DocNro: docNro,
      CbteDesde: voucherNumber, CbteHasta: voucherNumber,
      CbteFch: parseInt(fecha.replace(/-/g, '')),
      ImpTotal: impTotal, ImpTotConc: 0, ImpNeto, ImpOpEx: 0, ImpIVA, ImpTrib: 0,
      MonId: 'PES', MonCotiz: 1,
      CondicionIVAReceptorId: condicionIva,
      Iva: [{ Id: getIvaId(cfg), BaseImp: impNeto, Importe: impIVA }],
    };

    const resp = await afip.ElectronicBilling.createVoucher(data);

    db.update('ventas', req.params.id, {
      facturada: true, factura_cae: resp.CAE, factura_numero: voucherNumber,
      factura_tipo: tipo, factura_fecha_vto: resp.CAEFchVto,
      factura_doc_tipo: docTipo, factura_doc_nro: docNro,
    });

    db.audit(req.user, venta.suc_id, 'ventas', 'facturar',
      'Factura ' + tipo + ' #' + voucherNumber + ' — CAE: ' + resp.CAE, req.params.id);

    res.json({ ok: true, cae: resp.CAE, vencimiento: resp.CAEFchVto, numero: voucherNumber, tipo });
  } catch (e) {
    console.error('[ARCA] Error:', e.message);
    res.status(500).json({ error: 'Error al facturar: ' + e.message });
  }
});

module.exports = router;
