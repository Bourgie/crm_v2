// ═══════════════════════════════════════════
// ARCA/AFIP — payload de comprobante (WSFEv1)
// Usa node:test (nativo, sin dependencias)
// Ejecutar: node --test test/arca-voucher.test.js
// ═══════════════════════════════════════════

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  TIPOS_FACTURA,
  TIPOS_NOTA_CREDITO,
  round2,
  idIva,
  alicuotaIva,
  condicionIvaReceptor,
  docTipo,
  docNro,
  fechaCbte,
  sinObjetoIva,
  cbteAsociado,
  buildVoucherData,
} = require('../lib/arca-voucher');
const { AFIP_TEST_CUIT, emitterCuit } = require('../lib/arca-sdk-config');

const CUIT_PROPIO = '20-12345678-6';
const CERT_PEM = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';
const KEY_PEM = '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----';

const BASE = {
  cbteTipo: TIPOS_FACTURA.B,
  numero: 15,
  ptoVta: 4,
  total: 121,
  ivaPct: 21,
  condicionFiscal: 'responsable_inscripto',
  condicionIvaReceptor: condicionIvaReceptor('B'),
  docTipo: docTipo(null),
  docNro: docNro(99, null),
  fecha: '2026-09-30T12:00:00Z',
};

const voucher = (extra = {}) => buildVoucherData({ ...BASE, ...extra });

// ── Regresión ──
// El payload se armaba con los campos de AFIP en shorthand
// ({ ImpNeto, ImpIVA }), que buscaba variables called ImpNeto/ImpIVA y
// reventaba con ReferenceError antes de llamar a AFIP. La facturación nunca
// funcionó. Estos tests existen para que no vuelva a pasar.
describe('ARCA — regresión del payload', () => {
  it('no debe lanzar al construir el comprobante', () => {
    let data;
    assert.doesNotThrow(() => { data = voucher(); });
    assert.strictEqual(typeof data.ImpNeto, 'number');
    assert.strictEqual(typeof data.ImpIVA, 'number');
  });

  it('los importes no pueden quedar en undefined', () => {
    const data = voucher();
    for (const campo of ['ImpTotal', 'ImpTotConc', 'ImpNeto', 'ImpOpEx', 'ImpIVA', 'ImpTrib']) {
      assert.strictEqual(typeof data[campo], 'number', campo + ' tiene que ser número');
    }
  });
});

describe('ARCA — totales', () => {
  it('ImpNeto + ImpIVA debe ser igual a ImpTotal (AFIP 10048)', () => {
    for (const total of [121, 100, 1, 0.01, 999.99, 12345.67, 33333.33]) {
      const data = voucher({ total });
      assert.strictEqual(
        round2(data.ImpNeto + data.ImpIVA),
        data.ImpTotal,
        'descuadre con total ' + total
      );
    }
  });

  it('ImpTotConc + ImpNeto + ImpOpEx + ImpTrib + ImpIVA debe ser ImpTotal', () => {
    for (const cond of ['responsable_inscripto', 'monotributista', 'exento']) {
      const data = voucher({ condicionFiscal: cond, total: 480.5 });
      const suma = round2(data.ImpTotConc + data.ImpNeto + data.ImpOpEx + data.ImpTrib + data.ImpIVA);
      assert.strictEqual(suma, data.ImpTotal, 'descuadre con ' + cond);
    }
  });

  it('el neto se calcula sobre el total con IVA incluido', () => {
    const data = voucher({ total: 121, ivaPct: 21 });
    assert.strictEqual(data.ImpNeto, 100);
    assert.strictEqual(data.ImpIVA, 21);
  });

  it('el neto se redondea a dos decimales', () => {
    const data = voucher({ total: 100, ivaPct: 21 });
    assert.strictEqual(data.ImpNeto, 82.64);
    assert.strictEqual(data.ImpIVA, 17.36);
  });

  it('acepta el total como string numérico', () => {
    // La base guarda REAL y el body JSON manda número, así que el string
    // con punto es la única forma string que puede aparecer.
    assert.strictEqual(voucher({ total: '121.50' }).ImpTotal, 121.5);
  });
});

describe('ARCA — catálogo de alícuotas (AlicIva)', () => {
  it('mapea alícuota a Id según el catálogo de WSFEv1', () => {
    assert.strictEqual(idIva(0), 3);
    assert.strictEqual(idIva(10.5), 4);
    assert.strictEqual(idIva(21), 5);
    assert.strictEqual(idIva(27), 6);
    assert.strictEqual(idIva(5), 8);
    assert.strictEqual(idIva(2.5), 9);
  });

  it('no confunde 27% con 0% ni 0% con No Sujeto', () => {
    // El código anterior mapeaba 27 → 3 (que es 0%) y 0 → 2 (No Sujeto).
    assert.notStrictEqual(idIva(27), 3);
    assert.notStrictEqual(idIva(0), 2);
  });

  it('el Id de Iva coincide con la alícuota configurada', () => {
    assert.strictEqual(voucher({ ivaPct: 21 }).Iva[0].Id, 5);
    assert.strictEqual(voucher({ ivaPct: 10.5 }).Iva[0].Id, 4);
    assert.strictEqual(voucher({ ivaPct: 27 }).Iva[0].Id, 6);
    assert.strictEqual(voucher({ ivaPct: 0 }).Iva[0].Id, 3);
  });

  it('BaseImp es el neto e Importe es el IVA', () => {
    const data = voucher({ total: 121, ivaPct: 21 });
    assert.strictEqual(data.Iva.length, 1);
    assert.strictEqual(data.Iva[0].BaseImp, data.ImpNeto);
    assert.strictEqual(data.Iva[0].Importe, data.ImpIVA);
  });

  it('al 0% el neto es el total y el IVA es cero', () => {
    const data = voucher({ total: 100, ivaPct: 0 });
    assert.strictEqual(data.ImpNeto, 100);
    assert.strictEqual(data.ImpIVA, 0);
    assert.deepStrictEqual(data.Iva, [{ Id: 3, BaseImp: 100, Importe: 0 }]);
  });

  it('el 0% es una alícuota válida y no cae al 21% por defecto', () => {
    assert.strictEqual(alicuotaIva(0), 0);
    assert.strictEqual(alicuotaIva('0'), 0);
  });

  it('sin dato de alícuota usa 21%', () => {
    assert.strictEqual(alicuotaIva(undefined), 21);
    assert.strictEqual(alicuotaIva(''), 21);
    assert.strictEqual(alicuotaIva(null), 21);
    assert.strictEqual(alicuotaIva('no-numero'), 21);
  });

  it('acepta la alícuota como string', () => {
    assert.strictEqual(alicuotaIva('21'), 21);
    assert.strictEqual(alicuotaIva('10.5'), 10.5);
  });
});

describe('ARCA — monotributista y exento (AFIP 10071)', () => {
  for (const cond of ['monotributista', 'exento']) {
    it(cond + ': no debe informar el objeto Iva', () => {
      const data = voucher({ condicionFiscal: cond, total: 150 });
      assert.strictEqual('Iva' in data, false, 'el objeto Iva no se informa en tipo C');
    });

    it(cond + ': todo el importe va como no gravado', () => {
      const data = voucher({ condicionFiscal: cond, total: 150 });
      assert.strictEqual(data.ImpTotal, 150);
      assert.strictEqual(data.ImpTotConc, 150);
      assert.strictEqual(data.ImpNeto, 0);
      assert.strictEqual(data.ImpIVA, 0);
      assert.strictEqual(data.ImpOpEx, 0);
    });

    it(cond + ': la alícuota configurada se ignora', () => {
      const data = voucher({ condicionFiscal: cond, total: 150, ivaPct: 21 });
      assert.strictEqual(data.ImpNeto, 0);
    });
  }

  it('sinObjetoIva solo es true para esas dos condiciones', () => {
    assert.strictEqual(sinObjetoIva('monotributista'), true);
    assert.strictEqual(sinObjetoIva('exento'), true);
    assert.strictEqual(sinObjetoIva('responsable_inscripto'), false);
    assert.strictEqual(sinObjetoIva(undefined), false);
    assert.strictEqual(sinObjetoIva(''), false);
  });

  it('un responsable inscripto sí manda el objeto Iva', () => {
    assert.strictEqual('Iva' in voucher({ condicionFiscal: 'responsable_inscripto' }), true);
  });
});

describe('ARCA — CondicionIVAReceptorId', () => {
  it('A es Responsable Inscripto, C es Monotributo, B es Consumidor Final', () => {
    assert.strictEqual(condicionIvaReceptor('A'), 1);
    assert.strictEqual(condicionIvaReceptor('B'), 5);
    assert.strictEqual(condicionIvaReceptor('C'), 6);
  });

  it('un tipo desconocido cae en Consumidor Final', () => {
    assert.strictEqual(condicionIvaReceptor('Z'), 5);
    assert.strictEqual(condicionIvaReceptor(undefined), 5);
  });

  it('la nota de crédito usa la misma condición que su factura', () => {
    // La NC mandaba siempre 5, así que la NC de un monotributo salía mal.
    for (const tipo of ['A', 'B', 'C']) {
      const data = voucher({ condicionIvaReceptor: condicionIvaReceptor(tipo) });
      assert.strictEqual(data.CondicionIVAReceptorId, condicionIvaReceptor(tipo));
    }
  });
});

describe('ARCA — DocTipo y DocNro', () => {
  it('11 dígitos es CUIT (80), 7 o 8 es DNI (96), sin documento es 99', () => {
    assert.strictEqual(docTipo('20123456786'), 80);
    assert.strictEqual(docTipo('20-12345678-6'), 80);
    assert.strictEqual(docTipo('12345678'), 96);
    assert.strictEqual(docTipo('1234567'), 96);
    assert.strictEqual(docTipo(null), 99);
    assert.strictEqual(docTipo(''), 99);
    assert.strictEqual(docTipo('123'), 99);
  });

  it('los consumidores finais van con DocNro 0', () => {
    assert.strictEqual(docNro(99, '20123456786'), 0);
    assert.strictEqual(docNro(99, null), 0);
  });

  it('con documento informado manda el número sin guiones', () => {
    assert.strictEqual(docNro(80, '20-12345678-6'), 20123456786);
    assert.strictEqual(docNro(96, '12345678'), 12345678);
  });

  it('saca puntos y espacios del documento', () => {
    // Los DNI se guardan con puntos: sin limpiarlos, DocNro salía truncado.
    assert.strictEqual(docNro(96, '12.345.678'), 12345678);
    assert.strictEqual(docNro(96, '12 345 678'), 12345678);
    assert.strictEqual(docTipo('12.345.678'), 96);
  });
});

describe('ARCA — encabezado del comprobante', () => {
  it('un comprobante por vez', () => {
    const data = voucher();
    assert.strictEqual(data.CantReg, 1);
    assert.strictEqual(data.Concepto, 1);
    assert.strictEqual(data.MonId, 'PES');
    assert.strictEqual(data.MonCotiz, 1);
  });

  it('CbteDesde y CbteHasta son el mismo número', () => {
    const data = voucher({ numero: 742 });
    assert.strictEqual(data.CbteDesde, 742);
    assert.strictEqual(data.CbteHasta, 742);
  });

  it('CbteFch va en yyyymmdd', () => {
    assert.strictEqual(fechaCbte('2026-09-30T12:00:00Z'), 20260930);
    assert.strictEqual(fechaCbte('2026-01-05T12:00:00Z'), 20260105);
    assert.strictEqual(voucher().CbteFch, 20260930);
  });

  it('sin fecha usa la de hoy', () => {
    const hoy = fechaCbte();
    assert.strictEqual(typeof hoy, 'number');
    assert.ok(hoy >= 20000101 && hoy <= 29991231);
  });

  it('PtoVta y CbteTipo vienen del llamador', () => {
    const data = voucher({ ptoVta: 9, cbteTipo: TIPOS_FACTURA.C });
    assert.strictEqual(data.PtoVta, 9);
    assert.strictEqual(data.CbteTipo, 11);
  });

  it('no manda CbtesAsoc en una factura', () => {
    assert.strictEqual('CbtesAsoc' in voucher(), false);
  });
});

describe('ARCA — tipos de comprobante', () => {
  it('facturas A, B y C', () => {
    assert.deepStrictEqual(TIPOS_FACTURA, { A: 1, B: 6, C: 11 });
  });

  it('notas de crédito A, B y C', () => {
    assert.deepStrictEqual(TIPOS_NOTA_CREDITO, { A: 3, B: 8, C: 13 });
  });
});

describe('ARCA — CbtesAsoc de la nota de crédito', () => {
  it('referencia el comprobante que anula', () => {
    const asoc = cbteAsociado({ tipo: 'B', ptoVta: 4, numero: 15, cuitEmisor: AFIP_TEST_CUIT });
    assert.deepStrictEqual(asoc, { Tipo: 6, PtoVta: 4, Nro: 15, Cuit: AFIP_TEST_CUIT });
  });

  it('va embebido en el payload de la nota de crédito', () => {
    const data = voucher({
      cbteTipo: TIPOS_NOTA_CREDITO.B,
      condicionFiscal: 'monotributista',
      condicionIvaReceptor: condicionIvaReceptor('C'),
      cbtesAsoc: [cbteAsociado({ tipo: 'C', ptoVta: 4, numero: 15, cuitEmisor: AFIP_TEST_CUIT })],
    });
    assert.strictEqual(data.CbtesAsoc.length, 1);
    assert.strictEqual(data.CbteTipo, 8);
    assert.strictEqual(data.CbtesAsoc[0].Tipo, 11);
  });

  it('un array vacío no agrega la clave', () => {
    assert.strictEqual('CbtesAsoc' in voucher({ cbtesAsoc: [] }), false);
  });

  it('el CUIT asociado es el del emisor real, no el configurado a secas', () => {
    // En desarrollo sin certificado se emite con el CUIT de prueba de afipsdk.
    assert.strictEqual(emitterCuit({ arca_ambiente: 'dev' }), AFIP_TEST_CUIT);

    // Con certificado propio, el emisor es la empresa.
    const conCert = {
      arca_cuit: CUIT_PROPIO,
      arca_cert: CERT_PEM,
      arca_key: KEY_PEM,
      arca_ambiente: 'dev',
    };
    assert.strictEqual(emitterCuit(conCert), 20123456786);

    const data = voucher({
      cbteTipo: TIPOS_NOTA_CREDITO.B,
      cbtesAsoc: [cbteAsociado({ tipo: 'B', ptoVta: 4, numero: 15, cuitEmisor: emitterCuit(conCert) })],
    });
    assert.strictEqual(data.CbtesAsoc[0].Cuit, 20123456786);
  });
});

describe('ARCA — robustness del builder', () => {
  it('funciona sin argumentos opcionales', () => {
    const data = buildVoucherData({ cbteTipo: 6, numero: 1, ptoVta: 1, total: 100 });
    assert.strictEqual(data.ImpTotal, 100);
    assert.strictEqual(data.DocTipo, 99);
    assert.strictEqual(data.DocNro, 0);
    assert.strictEqual(data.CondicionIVAReceptorId, 5);
  });

  it('no rompe con un total no numérico', () => {
    const data = buildVoucherData({ cbteTipo: 6, numero: 1, ptoVta: 1, total: 'abc' });
    assert.strictEqual(data.ImpTotal, 0);
    assert.strictEqual(data.ImpNeto, 0);
    assert.strictEqual(data.ImpIVA, 0);
  });

  it('no tira por un valor indefinido', () => {
    assert.doesNotThrow(() => buildVoucherData());
  });
});
