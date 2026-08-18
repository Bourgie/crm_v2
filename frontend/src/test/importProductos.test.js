import { describe, it, expect } from 'vitest'
import { rowsToProductos, analizarImport, normalizePrice, primerNivelCategoria } from '../utils/importProductos'
import { normalizeKey } from '../utils/excel'

describe('normalizeKey', () => {
  it('minúsculas, sin acentos y sin espacios extra', () => {
    expect(normalizeKey('Categoría ')).toBe('categoria')
    expect(normalizeKey('  PRECIO  VENTA ')).toBe('precio venta')
    expect(normalizeKey('Precio L1')).toBe('precio l1')
    expect(normalizeKey('Nombre atributo 1')).toBe('nombre atributo 1')
  })
  it('headers reservados se mantienen detectables (se ignoran en importExcel)', () => {
    expect(normalizeKey('__proto__')).toBe('__proto__')
  })
})

describe('normalizePrice', () => {
  it('formato AR con coma decimal y puntos de miles', () => {
    expect(normalizePrice('14.231,5')).toBe(14231.5)
    expect(normalizePrice('1.234,56')).toBe(1234.56)
  })
  it('formato US con punto decimal', () => {
    expect(normalizePrice('26.55')).toBe(26.55)
  })
  it('puntos de miles sin decimales', () => {
    expect(normalizePrice('1.234')).toBe(1234)
  })
  it('números planos', () => {
    expect(normalizePrice('1234')).toBe(1234)
    expect(normalizePrice(3575.66)).toBe(3575.66)
    expect(normalizePrice(92800)).toBe(92800)
  })
  it('símbolos de moneda y espacios', () => {
    expect(normalizePrice('$ 12.300')).toBe(12300)
    expect(normalizePrice('€ 3,5')).toBe(3.5)
  })
  it('vacío o inválido devuelve 0', () => {
    expect(normalizePrice('')).toBe(0)
    expect(normalizePrice(null)).toBe(0)
    expect(normalizePrice(undefined)).toBe(0)
    expect(normalizePrice('abc')).toBe(0)
  })
})

describe('primerNivelCategoria', () => {
  it('toma el primer nivel de un path', () => {
    expect(primerNivelCategoria('Indumentaria > Ajuares')).toBe('Indumentaria')
    expect(primerNivelCategoria('A / B / C')).toBe('A')
    expect(primerNivelCategoria('A | B')).toBe('A')
  })
  it('categoría simple queda igual', () => {
    expect(primerNivelCategoria('Remera')).toBe('Remera')
    expect(primerNivelCategoria('')).toBe('')
  })
})

describe('rowsToProductos — export TiendaNube', () => {
  // Simula el formato del export: IDProduct repetido por variante, atributos, precios con coma
  const rows = [
    { nombre: 'Remera Básica', stock: '10', sku: '', precio: '14.231,5', 'precio oferta': '', 'nombre atributo 1': 'Color', 'valor atributo 1': 'Blanco', 'nombre atributo 2': 'Talle', 'valor atributo 2': 'M', categorias: 'Indumentaria > Ajuares', 'mostrar en tienda': 'Sí', idproduct: '1001', idstock: '1' },
    { nombre: 'Remera Básica', stock: '5', sku: '', precio: '14.231,5', 'precio oferta': '', 'nombre atributo 1': 'Color', 'valor atributo 1': 'Blanco', 'nombre atributo 2': 'Talle', 'valor atributo 2': 'L', categorias: 'Indumentaria > Ajuares', 'mostrar en tienda': 'Sí', idproduct: '1001', idstock: '2' },
    { nombre: 'Jean Skinny', stock: '3', sku: '', precio: '28.400', 'precio oferta': '25.000', 'nombre atributo 1': 'Talle', 'valor atributo 1': '36', categorias: 'Pantalones > Jeans', 'mostrar en tienda': 'No', idproduct: '1002', idstock: '3' },
    { nombre: 'Jean Skinny', stock: '7', sku: '', precio: '28.400', 'precio oferta': '25.000', 'nombre atributo 1': 'Talle', 'valor atributo 1': '38', categorias: 'Pantalones > Jeans', 'mostrar en tienda': 'No', idproduct: '1002', idstock: '4' },
  ]

  it('agrupa variantes por IDProduct: 2 productos', () => {
    const prods = rowsToProductos(rows)
    expect(prods.length).toBe(2)
  })

  it('precio con coma decimal normalizado', () => {
    const prods = rowsToProductos(rows)
    const remera = prods.find(p => p.sku === '1001')
    expect(remera.precio_l1).toBe(14231.5)
  })

  it('precio oferta va a precio_l2', () => {
    const prods = rowsToProductos(rows)
    const jean = prods.find(p => p.sku === '1002')
    expect(jean.precio_l2).toBe(25000)
  })

  it('categoría path → primer nivel', () => {
    const prods = rowsToProductos(rows)
    expect(prods.every(p => p.categoria === 'Indumentaria' || p.categoria === 'Pantalones')).toBe(true)
    expect(prods.find(p => p.sku === '1001').categoria).toBe('Indumentaria')
  })

  it('talle/color detectados desde Nombre atributo / Valor atributo', () => {
    const prods = rowsToProductos(rows)
    const remera = prods.find(p => p.sku === '1001')
    expect(remera.talle).toBe('M')
    expect(remera.color).toBe('Blanco')
  })

  it('Mostrar en tienda = No → activo false (si alguna variante lo está)', () => {
    const prods = rowsToProductos(rows)
    expect(prods.find(p => p.sku === '1001').activo).toBe(true)
    expect(prods.find(p => p.sku === '1002').activo).toBe(false)
  })

  it('SKU vacío → fallback a IDProduct', () => {
    const prods = rowsToProductos(rows)
    expect(prods[0].sku).toBe('1001')
    expect(prods[1].sku).toBe('1002')
  })
})

describe('rowsToProductos — formatos sin IDProduct', () => {
  it('1 fila = 1 producto', () => {
    const rows = [
      { nombre: 'Remera', sku: 'R-1', precio: '15000', categoria: 'Remera', talle: 'M', color: 'Blanco', activo: 'Si' },
      { nombre: 'Pantalón', sku: 'P-1', precio: '20000', categoria: 'Pantalón', talle: '38', activo: 'No' },
    ]
    const prods = rowsToProductos(rows)
    expect(prods.length).toBe(2)
    expect(prods[0].talle).toBe('M')
    expect(prods[0].color).toBe('Blanco')
    expect(prods[1].activo).toBe(false)
  })

  it('nombres iguales sin IDProduct no se fusionan (los detecta el aviso previo)', () => {
    const rows = [
      { nombre: 'Gorra', sku: 'G-1', precio: '5000' },
      { nombre: 'Gorra', sku: 'G-2', precio: '6000' },
    ]
    expect(rowsToProductos(rows).length).toBe(2)
  })

  it('headers con mayúsculas y acentos (ya normalizados por importExcel)', () => {
    const rows = [
      { nombre: 'Vestido', 'precio l1': '30000', categoria: 'Vestido', 'stock min': '3' },
    ]
    const prods = rowsToProductos(rows)
    expect(prods[0].precio_l1).toBe(30000)
    expect(prods[0].stock_min).toBe(3)
  })

  it('sin nombre → fila descartada; sin precio → queda para el aviso previo como error', () => {
    const rows = [
      { nombre: '', precio: '100' },
      { nombre: 'Sin Precio', precio: '' },
      { nombre: 'Válido', precio: '100' },
    ]
    const prods = rowsToProductos(rows)
    expect(prods.length).toBe(2)
    const r = analizarImport(prods, [])
    expect(r.crear.length).toBe(1)
    expect(r.errores.length).toBe(1)
    expect(r.errores[0].nombre).toBe('Sin Precio')
  })
})

describe('analizarImport', () => {
  const existentes = [
    { id: 'p1', nombre: 'Remera Existente', sku: 'REM-1', codigo_barras: '', activo: true },
    { id: 'p2', nombre: 'Jean Existente', sku: '', codigo_barras: '779000001', activo: true },
    { id: 'p3', nombre: 'Gorra Existente', sku: 'GOR-1', codigo_barras: '', activo: true },
  ]

  it('mismo SKU → actualizar', () => {
    const r = analizarImport([{ nombre: 'Remera Nueva', sku: 'REM-1', precio_l1: 100 }], existentes)
    expect(r.actualizar.length).toBe(1)
    expect(r.actualizar[0]._match.id).toBe('p1')
    expect(r.crear.length).toBe(0)
  })

  it('mismo código de barras → actualizar', () => {
    const r = analizarImport([{ nombre: 'Jean Nuevo', sku: '', codigo_barras: '779000001', precio_l1: 100 }], existentes)
    expect(r.actualizar.length).toBe(1)
    expect(r.actualizar[0]._match.id).toBe('p2')
  })

  it('mismo nombre sin SKU → posible duplicado', () => {
    const r = analizarImport([{ nombre: 'Gorra Existente', sku: '', precio_l1: 100 }], existentes)
    expect(r.duplicados.length).toBe(1)
    expect(r.duplicados[0]._motivo).toContain('Ya existe')
  })

  it('nombre repetido dentro del archivo → duplicado', () => {
    const r = analizarImport([
      { nombre: 'Nuevo Producto', sku: '', precio_l1: 100 },
      { nombre: 'Nuevo Producto', sku: '', precio_l1: 200 },
    ], existentes)
    expect(r.crear.length).toBe(1)
    expect(r.duplicados.length).toBe(1)
    expect(r.duplicados[0]._motivo).toContain('Repetido')
  })

  it('nuevo → crear; faltantes → errores', () => {
    const r = analizarImport([
      { nombre: 'Producto Nuevo', precio_l1: 500 },
      { nombre: '', precio_l1: 100 },
      { nombre: 'Sin Precio', precio_l1: 0 },
    ], existentes)
    expect(r.crear.length).toBe(1)
    expect(r.errores.length).toBe(2)
  })

  it('productos inactivos existentes no se toman como match', () => {
    const r = analizarImport([{ nombre: 'Medias', sku: 'MED-1', precio_l1: 100 }], [{ id: 'p9', nombre: 'Medias', sku: 'MED-1', activo: false }])
    expect(r.crear.length).toBe(1)
  })
})