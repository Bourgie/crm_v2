// ═══════════════════════════════════════════
// ARCA/AFIP — comprobantes electrónicos (WSFEv1)
// Una sola fuente para el payload de `createVoucher`, compartida por
// routes/arca.js y el ArcaProvider del Integration Center, para que la app
// y el Integration Center no puedan divergir.
//
// Fuentes:
//  - Payload y catálogos: https://docs.afipsdk.com/siguientes-pasos/web-services/factura-electronica/factura-a
//  - Catálogo AlicIva (Id del array Iva): 3=0%, 4=10,5%, 5=21%, 6=27%,
//    8=5% y 9=2,5% (Ley 26.982). Ojo: 3 es 0% y 6 es 27%; se invierten fácil.
//  - Catálogo CondicionIVAReceptorId: 1=IVA Responsable Inscripto,
//    4=IVA Sujeto Exento, 5=Consumidor Final, 6=Responsable Monotributo.
//  - AFIP 10048: ImpTotal = ImpTotConc + ImpNeto + ImpOpEx + ImpTrib + ImpIVA.
//  - AFIP 10071: en comprobantes tipo C de monotributo/exento el objeto Iva
//    no debe informarse. El importe va como no gravado en ImpTotConc.
// ═══════════════════════════════════════════

// Tipos de comprobante por letra.
const TIPOS_FACTURA = { A: 1, B: 6, C: 11 };
const TIPOS_NOTA_CREDITO = { A: 3, B: 8, C: 13 };

// Catálogo AlicIva: alícuota en % → Id del ítem de Iva.
const ID_ALICUOTA_IVA = { 0: 3, 10.5: 4, 21: 5, 27: 6, 5: 8, 2.5: 9 };
const IVA_ID_POR_DEFECTO = 5; // 21%
const IVA_POR_DEFECTO_PCT = 21;

// Condición fiscal del receptor según el tipo de comprobante.
const CONDICION_IVA_RECEPTOR = { A: 1, B: 5, C: 6 };
const CONDICION_IVA_ID_POR_DEFECTO = 5; // Consumidor Final

// DocTipo: 80 = CUIT, 96 = DNI, 99 = sin identificar / consumidor final.
const DOC_TIPO_SIN_IDENTIFICAR = 99;
const DOC_TIPO_CUIT = 80;
const DOC_TIPO_DNI = 96;

// Condiciones fiscales que solo pueden emitir tipo C y para las que AFIP
// rechaza el objeto Iva (error 10071).
const CONDICIONES_SIN_OBJETO_IVA = ['monotributista', 'exento'];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Id del catálogo AlicIva para una alícuota en %. */
function idIva(alicuotaPct) {
  const id = ID_ALICUOTA_IVA[parseFloat(alicuotaPct)];
  return id || IVA_ID_POR_DEFECTO;
}

/** Condición frente al IVA del receptor: A=1, C=6, resto=5. */
function condicionIvaReceptor(tipo) {
  return CONDICION_IVA_RECEPTOR[tipo] || CONDICION_IVA_ID_POR_DEFECTO;
}

/**
 * Solo los dígitos del documento, sin guiones, puntos ni espacios.
 * Los DNI se guardan como "12.345.678" y los CUIT como "20-12345678-6";
 * sin esto, DocNro para un DocTipo 96 ("DNI") salía truncado y AFIP
 * rechazaba el comprobante.
 */
function soloDigitos(doc) {
  return doc ? String(doc).replace(/\D/g, '') : '';
}

/** DocTipo a partir del documento del cliente (80 CUIT, 96 DNI, 99 sin doc). */
function docTipo(doc) {
  const clean = soloDigitos(doc);
  if (clean.length === 11) return DOC_TIPO_CUIT;
  if (clean.length >= 7) return DOC_TIPO_DNI;
  return DOC_TIPO_SIN_IDENTIFICAR;
}

/** DocNro a informar: los consumidores finales van con 0. */
function docNro(docTipoId, doc) {
  if (docTipoId === DOC_TIPO_SIN_IDENTIFICAR) return 0;
  return parseInt(soloDigitos(doc), 10) || 0;
}

/** CbteFch en yyyymmdd, usando la fecha local (no UTC). */
function fechaCbte(fecha) {
  const d = fecha ? new Date(fecha) : new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return parseInt(local.toISOString().slice(0, 10).replace(/-/g, ''), 10);
}

/** Verifica si a esta condición fiscal hay que omitir el objeto Iva. */
function sinObjetoIva(condicionFiscal) {
  return CONDICIONES_SIN_OBJETO_IVA.includes(condicionFiscal);
}

/**
 * Alícuota efectiva en %. El 0% es una alícuota legítima (productos exentos
 * de IVA que igual se facturan con neto), así que no puede caer al 21% por
 * defecto: solo cae si el dato viene vacío o no es numérico.
 */
function alicuotaIva(ivaPct) {
  if (ivaPct === 0 || ivaPct === '0') return 0;
  const pct = parseFloat(ivaPct);
  return Number.isFinite(pct) ? pct : IVA_POR_DEFECTO_PCT;
}

/**
 * CbtesAsoc de una nota de crédito: el comprobante que anula.
 * `cuitEmisor` tiene que ser el CUIT que figura como emisor
 * (ver emitterCuit en lib/arca-sdk-config.js).
 */
function cbteAsociado({ tipo, ptoVta, numero, cuitEmisor }) {
  return {
    Tipo: TIPOS_FACTURA[tipo],
    PtoVta: ptoVta,
    Nro: numero,
    Cuit: cuitEmisor,
  };
}

/**
 * Payload de FECAESolicitar. Devuelve un objeto plano, sin dependencias de
 * red ni de base, para poder testearlo aislado.
 *
 * Garantiza por construcción ImpNeto + ImpIVA === ImpTotal (error AFIP 10048):
 * el IVA se calcula como la diferencia contra el neto ya redondeado.
 *
 * @param {object} opts
 * @param {number} opts.cbteTipo            Tipo de comprobante (1/6/11, 3/8/13).
 * @param {number} opts.numero              Número dentro del punto de venta.
 * @param {number} opts.ptoVta              Punto de venta.
 * @param {number} opts.total               Importe total con IVA incluido.
 *                                          Number o string con punto decimal;
 *                                          no se acepta coma (ver round2).
 * @param {number} [opts.ivaPct=21]         Alícuota de IVA configurada.
 * @param {string} [opts.condicionFiscal]   Monotributista / exento omiten Iva.
 * @param {number} [opts.condicionIvaReceptor] Ver condicionIvaReceptor().
 * @param {number} [opts.docTipo]           Ver docTipo().
 * @param {number} [opts.docNro]            Ver docNro().
 * @param {Date|string} [opts.fecha]        Fecha del comprobante.
 * @param {Array}  [opts.cbtesAsoc]         Solo en notas de crédito.
 */
function buildVoucherData(opts = {}) {
  const {
    cbteTipo,
    numero,
    ptoVta,
    total,
    ivaPct = 21,
    condicionFiscal = 'responsable_inscripto',
    condicionIvaReceptor: condicionIva = CONDICION_IVA_ID_POR_DEFECTO,
    docTipo: docTipoId = DOC_TIPO_SIN_IDENTIFICAR,
    docNro: docNroId = 0,
    fecha,
    cbtesAsoc,
  } = opts;

  const impTotal = round2(parseFloat(total) || 0);
  const sinIva = sinObjetoIva(condicionFiscal);
  const pct = sinIva ? 0 : alicuotaIva(ivaPct);
  const impNeto = sinIva ? 0 : round2(impTotal / (1 + pct / 100));
  const impIVA = sinIva ? 0 : round2(impTotal - impNeto);

  const data = {
    CantReg: 1,
    PtoVta: ptoVta,
    CbteTipo: cbteTipo,
    Concepto: 1,
    DocTipo: docTipoId,
    DocNro: docNroId,
    CbteDesde: numero,
    CbteHasta: numero,
    CbteFch: fechaCbte(fecha),
    ImpTotal: impTotal,
    // Monotributo/exento: el importe no está gravado (AFIP 10071).
    ImpTotConc: sinIva ? impTotal : 0,
    ImpNeto: impNeto,
    ImpOpEx: 0,
    ImpIVA: impIVA,
    ImpTrib: 0,
    MonId: 'PES',
    MonCotiz: 1,
    CondicionIVAReceptorId: condicionIva,
  };

  if (!sinIva) {
    data.Iva = [{ Id: idIva(pct), BaseImp: impNeto, Importe: impIVA }];
  }

  if (Array.isArray(cbtesAsoc) && cbtesAsoc.length > 0) {
    data.CbtesAsoc = cbtesAsoc;
  }

  return data;
}

module.exports = {
  TIPOS_FACTURA,
  TIPOS_NOTA_CREDITO,
  ID_ALICUOTA_IVA,
  CONDICION_IVA_RECEPTOR,
  CONDICIONES_SIN_OBJETO_IVA,
  DOC_TIPO_CUIT,
  DOC_TIPO_DNI,
  DOC_TIPO_SIN_IDENTIFICAR,
  round2,
  soloDigitos,
  idIva,
  alicuotaIva,
  condicionIvaReceptor,
  docTipo,
  docNro,
  fechaCbte,
  sinObjetoIva,
  cbteAsociado,
  buildVoucherData,
};
