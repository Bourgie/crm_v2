export function normalizarCodigo(codigo) {
  return String(codigo ?? '').trim()
}

export function findProductByCodigo(productos, codigo) {
  const q = normalizarCodigo(codigo)
  if (!q) return null
  const qMin = q.toLowerCase()
  return (
    productos.find((p) => {
      if (p.activo === false) return false
      const barras = normalizarCodigo(p.codigo_barras).toLowerCase()
      const sku = normalizarCodigo(p.sku).toLowerCase()
      return (barras && barras === qMin) || (sku && sku === qMin)
    }) || null
  )
}
