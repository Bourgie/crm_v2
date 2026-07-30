// ═══════════════════════════════════════════
// Integration Center — ArcaProvider (ARCA/AFIP)
// Facturación electrónica argentina
// No es OAuth — usa access_token de env + certificados
// ═══════════════════════════════════════════

const { IntegrationProvider } = require('../IntegrationProvider');
const { ConnectionError, AuthError } = require('../errors');

class ArcaProvider extends IntegrationProvider {
  get name() { return 'arca'; }
  get displayName() { return 'ARCA / AFIP'; }
  get icon() { return '📄'; }
  get category() { return 'fiscal'; }
  get requiredEnvKeys() { return ['ARCA_ACCESS_TOKEN']; }

  // ── Tipos de comprobante ──
  static TIPOS_FACTURA = { 'A': 1, 'B': 6, 'C': 11 };
  static TIPOS_NOTA_CREDITO = { 'A': 3, 'B': 8, 'C': 13 };

  _getAfipConfig(cfg) {
    return {
      CUIT: parseInt(cfg.cuit) || 20409378472,
      access_token: process.env.ARCA_ACCESS_TOKEN || '',
      cert: cfg.cert || '',
      key: cfg.key || '',
    };
  }

  _getDocTipo(dni) {
    if (!dni) return 99;
    const clean = String(dni).replace(/[-\s]/g, '');
    if (clean.length === 11) return 80;
    if (clean.length >= 7) return 96;
    return 99;
  }

  _getIvaId(ivaPct) {
    const map = { 27: 3, 21: 5, 10.5: 4, 0: 2 };
    return map[ivaPct] || 5;
  }

  // ── Lifecycle ──

  async connect(config) {
    // ARCA no usa OAuth — el access_token ya está en env
    // Solo verificamos que esté configurado
    const token = process.env.ARCA_ACCESS_TOKEN;
    if (!token) throw new ConnectionError(this.name, 'ARCA_ACCESS_TOKEN no configurado en variables de entorno');
    return { success: true };
  }

  async callback(params) {
    // ARCA no tiene callback OAuth
    return { success: true };
  }

  async disconnect(tokens) {
    return;
  }

  // ── Health Check ──

  async healthCheck(tokens) {
    const start = Date.now();
    try {
      const Afip = require('@afipsdk/afip.js');
      const afip = new Afip({ CUIT: 20409378472, access_token: process.env.ARCA_ACCESS_TOKEN || '' });
      const status = await afip.ElectronicBilling.getServerStatus();
      return {
        ok: true,
        status: status,
        responseTimeMs: Date.now() - start,
      };
    } catch (e) {
      return {
        ok: false,
        error: e.message,
        responseTimeMs: Date.now() - start,
      };
    }
  }

  async testConnection(tokens) {
    return this.healthCheck(tokens);
  }

  // ── Sync: obtener último comprobante ──

  async sync(entityType, tokens, options) {
    const Afip = require('@afipsdk/afip.js');
    const afip = new Afip({ CUIT: parseInt(options.cuit) || 20409378472, access_token: process.env.ARCA_ACCESS_TOKEN || '' });

    const ptoVta = parseInt(options.puntoVenta) || 1;
    const lastVouchers = {};

    for (const [tipo, cod] of Object.entries(ArcaProvider.TIPOS_FACTURA)) {
      try {
        lastVouchers[tipo] = await afip.ElectronicBilling.getLastVoucher(ptoVta, cod);
      } catch (_) {}
    }

    return { ultimosComprobantes: lastVouchers, puntoVenta: ptoVta };
  }

  // ── Facturar ──

  async emitirFactura(tokens, options) {
    const { tipo, ventaData, clienteData, configEmpresa } = options;
    if (!tipo || !['A', 'B', 'C'].includes(tipo)) throw new Error('Tipo inválido (A, B, C)');

    const Afip = require('@afipsdk/afip.js');
    const afip = new Afip(this._getAfipConfig(configEmpresa));

    const ptoVta = parseInt(configEmpresa.puntoVenta) || 1;
    const cbteTipo = ArcaProvider.TIPOS_FACTURA[tipo];

    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
    const voucherNumber = lastVoucher + 1;

    const docTipo = this._getDocTipo(clienteData?.dni);
    const docNro = docTipo === 99 ? 0 : parseInt(String(clienteData?.dni || '0').replace(/[-\s]/g, '')) || 0;

    const ivaPct = parseFloat(configEmpresa.ivaPct) || 21;
    const impTotal = Math.round(parseFloat(ventaData.total) * 100) / 100;
    const impNeto = Math.round(impTotal / (1 + ivaPct / 100) * 100) / 100;
    const impIVA = Math.round((impTotal - impNeto) * 100) / 100;

    const fecha = new Date(Date.now() - (new Date()).getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const condicionIva = tipo === 'A' ? 1 : (tipo === 'C' ? 6 : 5);

    const data = {
      CantReg: 1, PtoVta: ptoVta, CbteTipo: cbteTipo, Concepto: 1,
      DocTipo: docTipo, DocNro: docNro,
      CbteDesde: voucherNumber, CbteHasta: voucherNumber,
      CbteFch: parseInt(fecha.replace(/-/g, '')),
      ImpTotal: impTotal, ImpTotConc: 0, ImpNeto, ImpOpEx: 0, ImpIVA, ImpTrib: 0,
      MonId: 'PES', MonCotiz: 1,
      CondicionIVAReceptorId: condicionIva,
      Iva: [{ Id: this._getIvaId(ivaPct), BaseImp: impNeto, Importe: impIVA }],
    };

    return await afip.ElectronicBilling.createVoucher(data);
  }

  async emitirNotaCredito(tokens, options) {
    const { tipo, ventaData, configEmpresa, monto, motivo } = options;
    const Afip = require('@afipsdk/afip.js');
    const afip = new Afip(this._getAfipConfig(configEmpresa));

    const ptoVta = parseInt(configEmpresa.puntoVenta) || 1;
    const cbteTipo = ArcaProvider.TIPOS_NOTA_CREDITO[tipo] || 8;

    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
    const voucherNumber = lastVoucher + 1;

    const ivaPct = parseFloat(configEmpresa.ivaPct) || 21;
    const montoTotal = parseFloat(monto || ventaData.total);
    const impTotal = Math.round(montoTotal * 100) / 100;
    const impNeto = Math.round(impTotal / (1 + ivaPct / 100) * 100) / 100;
    const impIVA = Math.round((impTotal - impNeto) * 100) / 100;

    const fecha = new Date(Date.now() - (new Date()).getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const docTipo = ventaData.facturaDocTipo || 99;
    const docNro = ventaData.facturaDocNro || 0;
    const condicionIva = tipo === 'A' ? 1 : 5;

    const data = {
      CantReg: 1, PtoVta: ptoVta, CbteTipo: cbteTipo, Concepto: 1,
      DocTipo: docTipo, DocNro: docNro,
      CbteDesde: voucherNumber, CbteHasta: voucherNumber,
      CbteFch: parseInt(fecha.replace(/-/g, '')),
      ImpTotal: impTotal, ImpTotConc: 0, ImpNeto, ImpOpEx: 0, ImpIVA, ImpTrib: 0,
      MonId: 'PES', MonCotiz: 1,
      CondicionIVAReceptorId: condicionIva,
      Iva: [{ Id: this._getIvaId(ivaPct), BaseImp: impNeto, Importe: impIVA }],
      CbtesAsoc: [{
        Tipo: ArcaProvider.TIPOS_FACTURA[tipo],
        PtoVta: ptoVta,
        Nro: ventaData.facturaNumero,
        Cuit: parseInt(configEmpresa.cuit) || 20409378472,
      }],
    };

    return await afip.ElectronicBilling.createVoucher(data);
  }

  async consultarCae(cae) {
    const Afip = require('@afipsdk/afip.js');
    const afip = new Afip({ CUIT: 20409378472, access_token: process.env.ARCA_ACCESS_TOKEN || '' });
    return await afip.ElectronicBilling.getVoucherInfo(cae);
  }

  // ── Config ──

  getConfigurationSchema() {
    return {
      fields: [
        { key: 'cuit', label: 'CUIT de la empresa', type: 'text', required: true, hint: 'Formato: 20-12345678-9' },
        { key: 'puntoVenta', label: 'Punto de venta', type: 'number', required: true, default: 1 },
        { key: 'ivaPct', label: 'IVA por defecto (%)', type: 'select', options: ['21', '10.5', '27', '0'], default: '21' },
        { key: 'ambiente', label: 'Ambiente', type: 'select', options: ['dev', 'prod'], default: 'dev' },
        { key: 'condicionFiscal', label: 'Condición fiscal', type: 'select', options: ['responsable_inscripto', 'monotributista', 'exento'], default: 'responsable_inscripto' },
      ],
    };
  }
}

module.exports = { ArcaProvider };
