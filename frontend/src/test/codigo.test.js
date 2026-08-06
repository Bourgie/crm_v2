import { describe, it, expect } from 'vitest'
import { findProductByCodigo, normalizarCodigo } from '../utils/codigo'

const prods = [
  { id: 'p1', nombre: 'Remera Azul', sku: 'SA-100', codigo_barras: '779000001', activo: true },
  { id: 'p2', nombre: 'Pantalón', sku: '', codigo_barras: '779000002', activo: true },
  { id: 'p3', nombre: 'Gorra', sku: 'GOR-5', codigo_barras: '', activo: true },
  { id: 'p4', nombre: 'Medias', sku: 'MED-1', codigo_barras: '779000003', activo: false },
]

describe('normalizarCodigo', () => {
  it('recorta y convierte a string', () => {
    expect(normalizarCodigo(' 779000001 ')).toBe('779000001')
    expect(normalizarCodigo(779000001)).toBe('779000001')
    expect(normalizarCodigo(null)).toBe('')
    expect(normalizarCodigo(undefined)).toBe('')
  })
})

describe('findProductByCodigo', () => {
  it('matchea por codigo_barras exacto', () => {
    expect(findProductByCodigo(prods, '779000002')?.id).toBe('p2')
  })

  it('matchea por codigo_barras con espacios extra', () => {
    expect(findProductByCodigo(prods, '  779000001  ')?.id).toBe('p1')
  })

  it('matchea por sku exacto case-insensitive', () => {
    expect(findProductByCodigo(prods, 'sa-100')?.id).toBe('p1')
    expect(findProductByCodigo(prods, 'GOR-5')?.id).toBe('p3')
  })

  it('prioriza codigo_barras si coincide', () => {
    expect(findProductByCodigo(prods, '779000001')?.id).toBe('p1')
  })

  it('excluye productos inactivos', () => {
    expect(findProductByCodigo(prods, '779000003')).toBeNull()
  })

  it('devuelve null con código vacío o no encontrado', () => {
    expect(findProductByCodigo(prods, '')).toBeNull()
    expect(findProductByCodigo(prods, '   ')).toBeNull()
    expect(findProductByCodigo(prods, '999999')).toBeNull()
    expect(findProductByCodigo([], '779000001')).toBeNull()
  })

  it('no matchea por nombre (solo sku/codigo_barras)', () => {
    expect(findProductByCodigo(prods, 'Remera')).toBeNull()
  })
})