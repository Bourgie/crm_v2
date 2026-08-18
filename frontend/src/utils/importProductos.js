// ── Mapeo universal de filas Excel → productos FlexCRM ─────────
// Entiende exports de cualquier tienda (TiendaNube, MercadoLibre, WooCommerce...):
// headers normalizados (minúsculas, sin acentos), aliases en español/inglés,
// precios con coma o punto, variantes agrupadas por IDProduct.

const ID_PRODUCTO_KEYS = ['idproduct', 'id producto', 'producto id', 'idproducto', 'product id']
const ACTIVO_NO = new Set(['no', 'n', 'false', '0', 'off', 'inactivo', 'oculto', 'oculta', 'sin stock'])

const ALIASES = {
  nombre: ['nombre', 'name', 'nombre del producto', 'producto', 'titulo', 'title', 'descripcion', 'item'],
  sku: ['sku', 'codigo', 'code', 'codigo producto', 'sku del producto'],
  codigo_barras: ['codigo de barras', 'barcode', 'ean', 'upc'],
  precio_l1: ['precio', 'price', 'precio venta', 'precio lista 1', 'precio l1', 'precio publico', 'precio normal', 'list price', 'precio sin impuestos'],
  precio_l2: ['precio oferta', 'precio promocion', 'precio promocional', 'precio lista 2', 'precio l2', 'oferta', 'sale price', 'precio especial'],
  precio_l3: ['precio lista 3', 'precio l3', 'precio mayorista', 'precio costo sugerido'],
  costo: ['costo', 'cost', 'precio costo', 'costo sin impuestos'],
  categoria: ['categoria', 'categorias', 'category', 'categories', 'rubro'],
  talle: ['talle', 'talla', 'size', 'tamanio'],
  color: ['color', 'colour'],
  stock: ['stock', 'cantidad', 'quantity', 'qty', 'disponible', 'unidades', 'existencia', 'inventory', 'stock disponible', 'stock total'],
  stock_min: ['stock minimo', 'stock min', 'stock minimo sugerido', 'min stock'],
  activo: ['activo', 'active', 'mostrar en tienda', 'publicado', 'published', 'visible', 'habilitado', 'enabled', 'estado', 'status'],
}

const NOMBRE_ATTR_RE = /^nombre.*atributo\s*(\d+)$/
const VALOR_ATTR_RE = /^valor.*atributo\s*(\d+)$/
const SEP_CATEGORIA = /[>\/|]/
const TALLE_WORDS = ['talle', 'talla', 'size', 'tamanio', 'medida']
const COLOR_WORDS = ['color', 'colour']

function first(keys, row) {
  for (const k of keys) {
    const v = row[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

// "14.231,5" → 14231.5 · "26.55" → 26.55 · "1.234" → 1234 · "1234" → 1234
export function normalizePrice(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let s = String(v).trim().replace(/[$€£]/g, '').replace(/\s+/g, '')
  if (!s) return 0
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // Formato AR: coma decimal, puntos de miles → 14.231,5
    const lastComma = s.lastIndexOf(',')
    if (s.length - lastComma - 1 <= 2) s = s.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length <= 2) s = s.replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasDot) {
    const parts = s.split('.')
    if (parts.length !== 2 || parts[1].length > 2) s = s.replace(/\./g, '')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function esInactivo(v) {
  if (v == null || String(v).trim() === '') return null
  return ACTIVO_NO.has(String(v).trim().toLowerCase())
}

// "Indumentaria > Ajuares" → "Indumentaria" (primer nivel)
export function primerNivelCategoria(cat) {
  const c = String(cat || '').trim()
  if (!c) return ''
  return c.split(SEP_CATEGORIA)[0].trim()
}

// Convierte una fila cruda (headers normalizados) a un producto plano
function rowToProduct(row) {
  const nombre = first(ALIASES.nombre, row)
  if (!nombre) return null

  const sku = first(ALIASES.sku, row)
  const codigo_barras = first(ALIASES.codigo_barras, row)
  const idProducto = first(ID_PRODUCTO_KEYS, row)

  // Atributos genéricos: "Nombre atributo 1" / "Valor atributo 1" (TiendaNube/ML)
  let talle = first(ALIASES.talle, row)
  let color = first(ALIASES.color, row)
  const attrs = []
  for (const [key, value] of Object.entries(row)) {
    const mName = key.match(NOMBRE_ATTR_RE)
    if (mName) attrs.push({ idx: Number(mName[1]), nombre: String(value).trim() })
  }
  for (const [key, value] of Object.entries(row)) {
    const mVal = key.match(VALOR_ATTR_RE)
    if (!mVal) continue
    const idx = Number(mVal[1])
    const attr = attrs.find(a => a.idx === idx)
    const val = String(value || '').trim()
    if (!attr || !val) continue
    const an = attr.nombre.toLowerCase()
    if (!talle && TALLE_WORDS.some(w => an.includes(w))) talle = val
    if (!color && COLOR_WORDS.some(w => an.includes(w))) color = val
  }

  const precio_l1 = normalizePrice(first(ALIASES.precio_l1, row))
  const precio_l2 = normalizePrice(first(ALIASES.precio_l2, row))
  const precio_l3 = normalizePrice(first(ALIASES.precio_l3, row))
  const costo = normalizePrice(first(ALIASES.costo, row))
  const activo = esInactivo(first(ALIASES.activo, row))

  return {
    nombre,
    sku: sku || idProducto,
    codigo_barras,
    categoria: primerNivelCategoria(first(ALIASES.categoria, row)),
    talle,
    color,
    costo,
    precio_l1,
    precio_l2: precio_l2 || precio_l1,
    precio_l3: precio_l3 || precio_l1,
    stock_min: parseInt(first(ALIASES.stock_min, row), 10) || 0,
    activo: activo === null ? true : !activo,
    _idProducto: idProducto,
  }
}

// Filas → productos: agrupa variantes por IDProduct cuando el archivo lo trae
// (1 producto por IDProduct, talle/color de las variantes en campos del producto).
// Sin IDProduct: 1 fila = 1 producto.
export function rowsToProductos(rows) {
  if (!Array.isArray(rows)) return []
  const usaIdProducto = rows.some(r => first(ID_PRODUCTO_KEYS, r) !== '')
  const groups = new Map()

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const prod = rowToProduct(row)
    if (!prod) continue

    if (!usaIdProducto || !prod._idProducto) {
      groups.set('fila_' + groups.size, prod)
      continue
    }

    const key = String(prod._idProducto).trim()
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, prod)
      continue
    }
    // Merge de variantes: completar campos vacíos y sumar estado
    if (!existing.sku) existing.sku = prod.sku
    if (!existing.codigo_barras) existing.codigo_barras = prod.codigo_barras
    if (!existing.categoria) existing.categoria = prod.categoria
    if (!existing.talle && prod.talle) existing.talle = prod.talle
    if (!existing.color && prod.color) existing.color = prod.color
    if (!existing.precio_l1 && prod.precio_l1) existing.precio_l1 = prod.precio_l1
    if (prod.activo === false) existing.activo = false
  }

  const result = [...groups.values()]
  for (const p of result) delete p._idProducto
  return result
}

// Clasifica los productos del archivo contra los existentes en la DB,
// para el aviso previo a importar.
export function analizarImport(productos, existentes) {
  const lista = Array.isArray(existentes) ? existentes : []
  const bySku = new Map()
  const byCodigo = new Map()
  const byNombre = new Map()
  for (const p of lista) {
    if (p.activo === false) continue
    if (p.sku) {
      const k = String(p.sku).trim().toLowerCase()
      if (!bySku.has(k)) bySku.set(k, p)
    }
    if (p.codigo_barras) {
      const k = String(p.codigo_barras).trim().toLowerCase()
      if (!byCodigo.has(k)) byCodigo.set(k, p)
    }
    const n = String(p.nombre || '').trim().toLowerCase()
    if (n && !byNombre.has(n)) byNombre.set(n, p)
  }

  const result = { crear: [], actualizar: [], duplicados: [], errores: [] }
  const vistos = new Set()

  for (const prod of productos) {
    if (!prod || !prod.nombre) { result.errores.push({ ...prod, _motivo: 'Falta el nombre' }); continue }
    if (!(prod.precio_l1 > 0)) { result.errores.push({ ...prod, _motivo: 'Falta el precio' }); continue }

    const skuKey = prod.sku ? String(prod.sku).trim().toLowerCase() : ''
    const codKey = prod.codigo_barras ? String(prod.codigo_barras).trim().toLowerCase() : ''
    const nombreKey = String(prod.nombre).trim().toLowerCase()
    const match = (skuKey && bySku.get(skuKey)) || (codKey && byCodigo.get(codKey))

    if (match) {
      result.actualizar.push({ ...prod, _match: match })
    } else if (byNombre.has(nombreKey)) {
      result.duplicados.push({ ...prod, _match: byNombre.get(nombreKey), _motivo: 'Ya existe un producto con ese nombre' })
    } else if (vistos.has(nombreKey)) {
      result.duplicados.push({ ...prod, _match: null, _motivo: 'Repetido dentro del archivo' })
    } else {
      result.crear.push(prod)
    }
    vistos.add(nombreKey)
  }
  return result
}