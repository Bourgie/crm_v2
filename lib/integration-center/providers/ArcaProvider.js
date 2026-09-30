// ═══════════════════════════════════════════
// Integration Center — ArcaProvider (ARCA/AFIP)
// Facturación electrónica argentina.
// No es OAuth: las credenciales (Access Token, CUIT, certificados)
// son POR EMPRESA y viven en la tabla config de su DB
// (Configuración → ARCA). Nunca se leen de env global.
// ═══════════════════════════════════════════

const { IntegrationProvider } = require('../IntegrationProvider');
const { ConnectionError } = require('../errors');
const { AFIP_TEST_CUIT, mapConfig, buildSdkOptions, emitterCuit, missingConfig, mensajeConfigPendiente, afipErrorDetail } = require('../../arca-sdk-config');
const { TIPOS_FACTURA, TIPOS_NOTA_CREDITO, condicionIvaReceptor, docTipo, docNro, cbteAsociado, buildVoucherData } = require('../../arca-voucher');

class ArcaProvider extends IntegrationProvider {
  get name() { return 'arca'; }
  get displayName() { return 'ARCA / AFIP'; }
  get icon() { return '📄'; }
  get category() { return 'fiscal'; }
  get requiredEnvKeys() { return []; }
  // Las credenciales se resuelven por empresa (tabla config), no por env.
  get usesTenantCredentials() { return true; }
  // La sincronización consulta AFIP: conviene bloquear y devolver el resultado real.
  get syncBlocking() { return true; }

  // ── Tipos de comprobante (compartidos con routes/arca.js) ──
  static TIPOS_FACTURA = TIPOS_FACTURA;
  static TIPOS_NOTA_CREDITO = TIPOS_NOTA_CREDITO;
  static AFIP_TEST_CUIT = AFIP_TEST_CUIT;

  /**
   * Normaliza la config de la empresa al shape del provider.
   * Acepta tanto las claves canónicas (cuit, access_token, …) como las
   * claves de la tabla config (arca_cuit, arca_access_token, …).
   */
  static mapTenantConfig(src = {}) {
    const base = mapConfig(src);
    const c = (src && typeof src === 'object' && src.config) ? src.config : (src || {});
    const pick = (canonica, tenant) => {
      const a = c[canonica];
      if (a !== undefined && a !== null && a !== '') return a;
      const b = c[tenant];
      return (b !== undefined && b !== null) ? b : '';
    };
    return {
      cuit: base.cuit,
      access_token: base.access_token,
      cert: base.cert,
      key: base.key,
      ambiente: base.ambiente,
      puntoVenta: parseInt(pick('puntoVenta', 'arca_punto_venta'), 10) || 1,
      ivaPct: parseFloat(pick('ivaPct', 'arca_iva_pct')) || 21,
      condicionFiscal: pick('condicionFiscal', 'arca_condicion_fiscal') || 'responsable_inscripto',
    };
  }

  /**
   * Opciones para el SDK de afipsdk. La lógica vive en lib/arca-sdk-config.js
   * para que la app y el Integration Center hablen con AFIP exactamente igual.
   */
  _getAfipConfig(src = {}) {
    return buildSdkOptions(ArcaProvider.mapTenantConfig(src));
  }

  // ── Lifecycle ──

  async connect(config = {}) {
    const c = ArcaProvider.mapTenantConfig(config);
    const falta = missingConfig(c);
    if (falta) {
      throw new ConnectionError(this.name, mensajeConfigPendiente(falta));
    }
    return {
      success: true,
      connected: true,
      provider: this.name,
      cuit: c.cuit,
      cuit_emisor: emitterCuit(c),
      ambiente: c.ambiente,
    };
  }

  async callback(params) {
    // ARCA no tiene callback OAuth
    return { success: true };
  }

  async disconnect(tokens) {
    return;
  }

  // ── Health Check ──

  async healthCheck(tokens = {}) {
    const start = Date.now();
    try {
      const Afip = require('@afipsdk/afip.js');
      const afip = new Afip(this._getAfipConfig(tokens));
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
        detalle: afipErrorDetail(e),
        responseTimeMs: Date.now() - start,
      };
    }
  }

  async testConnection(tokens) {
    return this.healthCheck(tokens);
  }

  // ── Sync: consulta el estado del servidor AFIP y el último comprobante ──

  async sync(entityType, tokens = {}, options = {}) {
    const c = ArcaProvider.mapTenantConfig(tokens);
    const Afip = require('@afipsdk/afip.js');
    const afip = new Afip(this._getAfipConfig(c));

    const ptoVta = c.puntoVenta;
    const server = await afip.ElectronicBilling.getServerStatus();

    const lastVouchers = {};
    for (const [tipo, cod] of Object.entries(ArcaProvider.TIPOS_FACTURA)) {
      try {
        lastVouchers[tipo] = await afip.ElectronicBilling.getLastVoucher(ptoVta, cod);
      } catch (e) {
        lastVouchers[tipo] = { error: e.message };
      }
    }

    return {
      ambiente: c.ambiente,
      cuit: c.cuit,
      puntoVenta: ptoVta,
      server,
      ultimosComprobantes: lastVouchers,
    };
  }

  // ── Facturar ──

  async emitirFactura(tokens, options) {
    const { tipo, ventaData, clienteData } = options;
    if (!tipo || !['A', 'B', 'C'].includes(tipo)) throw new Error('Tipo inválido (A, B, C)');

    const c = ArcaProvider.mapTenantConfig(options.configEmpresa || tokens);
    const Afip = require('@afipsdk/afip.js');
    const afip = new Afip(this._getAfipConfig(c));

    const ptoVta = c.puntoVenta;
    const cbteTipo = ArcaProvider.TIPOS_FACTURA[tipo];

    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
    const voucherNumber = lastVoucher + 1;

    const docTipoId = docTipo(clienteData && clienteData.dni);

    const data = buildVoucherData({
      cbteTipo,
      numero: voucherNumber,
      ptoVta,
      total: ventaData.total,
      ivaPct: c.ivaPct,
      condicionFiscal: c.condicionFiscal,
      condicionIvaReceptor: condicionIvaReceptor(tipo),
      docTipo: docTipoId,
      docNro: docNro(docTipoId, clienteData && clienteData.dni),
    });

    return await afip.ElectronicBilling.createVoucher(data);
  }

  async emitirNotaCredito(tokens, options) {
    const { tipo, ventaData, monto } = options;
    const c = ArcaProvider.mapTenantConfig(options.configEmpresa || tokens);
    const Afip = require('@afipsdk/afip.js');
    const afip = new Afip(this._getAfipConfig(c));

    const ptoVta = c.puntoVenta;
    const cbteTipo = ArcaProvider.TIPOS_NOTA_CREDITO[tipo] || 8;

    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
    const voucherNumber = lastVoucher + 1;

    const data = buildVoucherData({
      cbteTipo,
      numero: voucherNumber,
      ptoVta,
      total: monto || ventaData.total,
      ivaPct: c.ivaPct,
      condicionFiscal: c.condicionFiscal,
      condicionIvaReceptor: condicionIvaReceptor(tipo),
      docTipo: ventaData.facturaDocTipo || 99,
      docNro: ventaData.facturaDocNro || 0,
      cbtesAsoc: [cbteAsociado({
        tipo,
        ptoVta,
        numero: ventaData.facturaNumero,
        cuitEmisor: emitterCuit(c),
      })],
    });

    return await afip.ElectronicBilling.createVoucher(data);
  }

  async consultarCae(cae, tokens = {}) {
    const Afip = require('@afipsdk/afip.js');
    const afip = new Afip(this._getAfipConfig(tokens));
    return await afip.ElectronicBilling.getVoucherInfo(cae);
  }

  // ── Config ──

  getConfigurationSchema() {
    return {
      // La config sensible y la fuente de verdad viven en Configuración → ARCA.
      // Este schema describe los campos no sensibles que la UI puede mostrar.
      fields: [
        { key: 'cuit', label: 'CUIT de la empresa', type: 'text', required: true, hint: '11 dígitos, con o sin guiones' },
        { key: 'puntoVenta', label: 'Punto de venta', type: 'number', required: true, default: 1 },
        { key: 'ivaPct', label: 'IVA por defecto (%)', type: 'select', options: ['21', '10.5', '27', '0'], default: '21' },
        { key: 'ambiente', label: 'Ambiente', type: 'select', options: ['dev', 'prod'], default: 'dev' },
        { key: 'condicionFiscal', label: 'Condición fiscal', type: 'select', options: ['responsable_inscripto', 'monotributista', 'exento'], default: 'responsable_inscripto' },
      ],
    };
  }
}

module.exports = { ArcaProvider };
