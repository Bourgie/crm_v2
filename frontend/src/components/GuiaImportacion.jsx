// Modal de guía universal de importación/exportación de productos.
// Funciona para cualquier export de tienda (TiendaNube, MercadoLibre, WooCommerce...):
// headers en cualquier orden/idioma, con o sin acentos.
export function GuiaImportacion({ onClose, onDescargarPlantilla }) {
  const colStyle = { padding: '6px 10px', borderBottom: '1px solid var(--bd)', fontSize: 12, verticalAlign: 'top' }
  const thStyle = { ...colStyle, fontWeight: 700, background: 'var(--sf)', color: 'var(--mu)', textAlign: 'left' }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3>❓ Guía de importación / exportación</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--mu)' }}>×</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <div style={{ background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 14 }}>
            La importación funciona con <strong>cualquier export de tienda</strong> (TiendaNube, MercadoLibre, WooCommerce, Shopify...).
            No hace falta adaptar el archivo: las columnas se reconocen en cualquier orden, en español o inglés, con o sin acentos
            (ej: <em>Nombre</em>, <em>Name</em>, <em>Categorías</em>, <em>Category</em>, <em>Precio</em>, <em>Price</em>).
          </div>

          <h4 style={{ margin: '14px 0 8px', fontSize: 14 }}>📄 Cómo preparar el archivo</h4>
          <ul style={{ fontSize: 12.5, margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li><strong>Primera fila = nombres de columnas</strong>. Una fila por producto (o variante).</li>
            <li><strong>Nombre y Precio son obligatorios</strong>. El resto es opcional.</li>
            <li><strong>SKU opcional</strong>: si el SKU (o código de barras) ya existe, se <strong>actualiza</strong> en vez de duplicar. Si el archivo trae <em>IDProduct</em> (export de TiendaNube), las variantes se agrupan en un solo producto y ese ID se usa como SKU de referencia.</li>
            <li><strong>Precios</strong> con coma o punto: <em>14.231,5</em> y <em>26.55</em> se entienden igual.</li>
            <li><strong>Categorías</strong> en formato "Indumentaria &gt; Ajuares": se toma el primer nivel (<em>Indumentaria</em>).</li>
            <li><strong>El stock no se importa</strong>: se maneja por sucursal desde el botón de stock de cada producto.</li>
            <li><strong>Variantes</strong> (Talle/Color): se reconocen columnas propias (<em>Talle</em>, <em>Color</em>, <em>Talla</em>, <em>Size</em>) o pares de atributos genéricos (<em>Nombre atributo 1</em> / <em>Valor atributo 1</em>).</li>
            <li><strong>Productos ocultos</strong>: columnas <em>Mostrar en tienda</em>, <em>Publicado</em>, <em>Visible</em> o <em>Activo</em> con valor "No"/"False"/"0" importan el producto como <strong>inactivo</strong>.</li>
            <li>Máximo <strong>10.000 productos</strong> por archivo y <strong>10 MB</strong> de tamaño.</li>
          </ul>

          <h4 style={{ margin: '16px 0 8px', fontSize: 14 }}>🔁 Duplicados (cómo se decide)</h4>
          <ul style={{ fontSize: 12.5, margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Antes de importar se muestra un <strong>aviso previo</strong> con el detalle: cuántos se crearán, cuántos se actualizarán y cuáles parecen duplicados.</li>
            <li><strong>Mismo SKU o código de barras</strong> → se actualiza el existente.</li>
            <li><strong>Mismo nombre</strong> (sin SKU) → se marca como posible duplicado: podés <strong>saltarlo</strong> o importarlo igual.</li>
            <li>Marcando <strong>"Actualizar por nombre exacto"</strong>, los que coincidan por nombre se actualizan en vez de crear.</li>
          </ul>

          <h4 style={{ margin: '16px 0 8px', fontSize: 14 }}>🧩 Columnas reconocidas</h4>
          <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
            <table>
              <thead><tr>
                <th style={thStyle}>Campo FlexCRM</th>
                <th style={thStyle}>Nombres aceptados (ejemplos)</th>
              </tr></thead>
              <tbody>
                <tr><td style={colStyle}><strong>Nombre</strong> *</td><td style={colStyle}>Nombre · Name · Nombre del producto · Título</td></tr>
                <tr><td style={colStyle}><strong>Precio</strong> *</td><td style={colStyle}>Precio · Price · Precio venta · Precio lista 1</td></tr>
                <tr><td style={colStyle}>Precio oferta</td><td style={colStyle}>Precio oferta · Precio promocional · Sale price</td></tr>
                <tr><td style={colStyle}>Precio mayorista</td><td style={colStyle}>Precio lista 3 · Precio mayorista</td></tr>
                <tr><td style={colStyle}>SKU</td><td style={colStyle}>SKU · Código · Code · IDProduct (TiendaNube)</td></tr>
                <tr><td style={colStyle}>Código de barras</td><td style={colStyle}>Código de barras · Barcode · EAN · UPC</td></tr>
                <tr><td style={colStyle}>Categoría</td><td style={colStyle}>Categoría(s) · Category · Rubro</td></tr>
                <tr><td style={colStyle}>Talle</td><td style={colStyle}>Talle · Talla · Size · "Nombre atributo 1" (con Talle)</td></tr>
                <tr><td style={colStyle}>Color</td><td style={colStyle}>Color · Colour · "Nombre atributo 1" (con Color)</td></tr>
                <tr><td style={colStyle}>Costo</td><td style={colStyle}>Costo · Cost · Precio costo</td></tr>
                <tr><td style={colStyle}>Stock mínimo</td><td style={colStyle}>Stock mín · Stock mínimo</td></tr>
                <tr><td style={colStyle}>Activo</td><td style={colStyle}>Activo · Mostrar en tienda · Publicado · Visible · Estado</td></tr>
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--mu)', marginTop: 6 }}>* Obligatorios. Las demás columnas del archivo se ignoran.</div>

          <h4 style={{ margin: '16px 0 8px', fontSize: 14 }}>🛍️ ¿Exportaste desde TiendaNube?</h4>
          <div style={{ fontSize: 12.5, background: 'var(--sf)', borderRadius: 8, padding: '10px 14px', lineHeight: 1.7 }}>
            Tu archivo funciona tal cual. Equivalencias automáticas:
            <table style={{ marginTop: 8 }}>
              <tbody>
                <tr><td style={colStyle}>Precio</td><td style={colStyle}>→</td><td style={colStyle}>Precio L1 (con coma decimal: "14.231,5" → 14231.5)</td></tr>
                <tr><td style={colStyle}>Precio oferta</td><td style={colStyle}>→</td><td style={colStyle}>Precio L2</td></tr>
                <tr><td style={colStyle}>Categorías "A &gt; B"</td><td style={colStyle}>→</td><td style={colStyle}>Primer nivel ("A")</td></tr>
                <tr><td style={colStyle}>Nombre atributo 1 / Valor atributo 1</td><td style={colStyle}>→</td><td style={colStyle}>Talle o Color según el nombre del atributo</td></tr>
                <tr><td style={colStyle}>Mostrar en tienda = No</td><td style={colStyle}>→</td><td style={colStyle}>Producto inactivo</td></tr>
                <tr><td style={colStyle}>IDProduct</td><td style={colStyle}>→</td><td style={colStyle}>Agrupa las variantes en un producto y se usa como SKU de referencia (re-importar no duplica)</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          <button type="button" className="btn btn-primary" onClick={onDescargarPlantilla}>📥 Descargar plantilla</button>
        </div>
      </div>
    </div>
  )
}