import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useApp, useToast } from '../store'
import { ScannerModal } from '../components/ScannerModal'
import { findProductByCodigo, normalizarCodigo } from '../utils/codigo'

const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

function precioLista(prod, lista = 1) {
  if (lista === 2 && prod.precio_l2) return prod.precio_l2
  if (lista === 3 && prod.precio_l3) return prod.precio_l3
  return prod.precio_l1 || 0
}
function getStock(p) {
  if (typeof p.stock_actual === 'number') return p.stock_actual
  if (typeof p.stock === 'number') return p.stock
  return p.stock_total ?? 0
}

function ProdTile({ prod, lista, onClick }) {
  const precio = precioLista(prod, lista)
  const stock = getStock(prod)
  const sinStock = stock <= 0
  return (
    <div onClick={() => onClick(prod)} className="pos-tile"
      style={{ border: `1.5px solid ${sinStock ? 'var(--warn)' : 'var(--bd)'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', background: 'var(--bg)', transition: 'border-color .12s', display: 'flex', flexDirection: 'column', gap: 2 }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = sinStock ? 'var(--bad)' : 'var(--ac)'; e.currentTarget.style.background = sinStock ? 'rgba(239,68,68,.04)' : 'rgba(249,115,22,.04)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = sinStock ? 'var(--warn)' : 'var(--bd)'; e.currentTarget.style.background = 'var(--bg)' }}
    >
      <div className="pos-tile-name" style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod.favorito ? '⭐ ' : ''}{prod.nombre}</div>
      <div style={{ fontSize: 11, color: 'var(--mu)' }}>{prod.talle ? `T: ${prod.talle}` : ''}{prod.color ? ` · ${prod.color}` : ''}</div>
      <div className="pos-tile-price" style={{ fontWeight: 800, color: 'var(--ac)', fontSize: 15, marginTop: 2 }}>{fmt(precio)}</div>
      <div className="pos-tile-stock" style={{ fontSize: 10, color: sinStock ? 'var(--warn)' : 'var(--mu)', marginTop: 1 }}>
        {sinStock ? '⚠️ Sin stock — genera pedido' : `Stock: ${stock}`}{lista > 1 ? ` · L${lista}` : ''}
      </div>
    </div>
  )
}

function CartItem({ item, onQty, onRemove }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 0', borderBottom: '1px solid var(--bd)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nombre}</div>
        <div style={{ fontSize: 11, color: 'var(--mu)' }}>{item.talle ? `T: ${item.talle}` : ''} {fmt(item.precio)} c/u{item.lista > 1 ? ` · L${item.lista}` : ''}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <button type="button" className="pos-btn-qty" onClick={() => onQty(item.prod_id, item.talle, -1)} style={btnQty}>−</button>
        <span style={{ minWidth: 26, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{item.cantidad}</span>
        <button type="button" className="pos-btn-qty" onClick={() => onQty(item.prod_id, item.talle, +1)} style={btnQty}>+</button>
      </div>
      <div style={{ width: 68, textAlign: 'right', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{fmt(item.precio * item.cantidad)}</div>
      <button type="button" onClick={() => onRemove(item.prod_id, item.talle)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mu)', fontSize: 16, padding: '0 2px' }}>✕</button>
    </div>
  )
}

const btnQty = { width: 26, height: 26, borderRadius: 6, border: '1.5px solid var(--bd)', background: 'var(--sf)', cursor: 'pointer', fontWeight: 700, fontSize: 15 }
const LISTA_LABELS = { 1: 'Lista 1', 2: 'Lista 2', 3: 'Lista 3' }

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) return true
  return /MacIntel/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1
}

export function POS() {
  const { api } = useApi()
  const { toast } = useToast()
  const { sucSesion, allProds, allClis, setProds, setClis } = useApp()
  const navigate = useNavigate()

  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [cliente, setCliente] = useState(null)
  const [buscadorCli, setBuscadorCli] = useState('')
  const [showCliResults, setShowCliResults] = useState(false)
  const [conEnvio, setConEnvio] = useState(false)
  const [envioMonto, setEnvioMonto] = useState('')
  const [envioDesc, setEnvioDesc] = useState('')
  const [obs, setObs] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [escaneando, setEscaneando] = useState(false)

  const searchRef = useRef(null)

  const esMovil = isMobileDevice()

  useEffect(() => {
    if (!sucSesion) return
    api('GET', `/productos?viewer_suc=${sucSesion}`).then((d) => { if (Array.isArray(d)) setProds(d) }).catch(() => {})
    api('GET', '/clientes').then((d) => { if (Array.isArray(d)) setClis(d) }).catch(() => {})
  }, [sucSesion])

  useEffect(() => { if (!esMovil) searchRef.current?.focus() }, [])

  const lista = cliente?.lista || 1

  const prodsFiltrados = allProds
    .filter((p) => {
      if (p.activo === false) return false
      if (esMovil && p.favorito) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (p.nombre + ' ' + (p.sku || '') + ' ' + (p.talle || '') + ' ' + (p.categoria || '')).toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (!esMovil) {
        if (a.favorito && !b.favorito) return -1
        if (!a.favorito && b.favorito) return 1
      }
      return (a.nombre || '').localeCompare(b.nombre || '')
    })
    .slice(0, 60)

  const cliResults = buscadorCli.length >= 2
    ? allClis.filter((c) => (c.nombre + ' ' + (c.apellido || '') + ' ' + (c.tel || '')).toLowerCase().includes(buscadorCli.toLowerCase())).slice(0, 7)
    : []

  function addToCart(prod, cant = 1) {
    const precio = precioLista(prod, lista)
    const stock = getStock(prod)
    if (stock <= 0) {
      toast('⚠️ Sin stock — se generará pedido pendiente al registrar', '')
    } else if (cant > stock) {
      toast(`⚠️ Pediste ${cant}, hay ${stock}. Se generará pedido por la diferencia.`, '')
    } else if (stock < 3) {
      toast(`⚠️ Stock bajo: ${stock} unidades disponibles`, '')
    }
    setCart((prev) => {
      const ex = prev.find((i) => i.prod_id === prod.id && i.talle === prod.talle)
      if (ex) {
        const newQty = ex.cantidad + cant
        if (newQty > stock && stock > 0) toast('⚠️ Cantidad supera el stock — se generará pedido', '')
        return prev.map((i) => i.prod_id === prod.id && i.talle === prod.talle ? { ...i, cantidad: newQty } : i)
      }
      return [...prev, { prod_id: prod.id, nombre: prod.nombre, talle: prod.talle, precio, costo: prod.costo || 0, cantidad: cant, lista, sinStock: stock <= 0 }]
    })
    if (!esMovil) { setSearch(''); searchRef.current?.focus() }
  }

  function updateQty(prod_id, talle, delta) {
    setCart((prev) => prev.map((i) => i.prod_id === prod_id && i.talle === talle ? { ...i, cantidad: i.cantidad + delta } : i).filter((i) => i.cantidad > 0))
  }
  function removeItem(prod_id, talle) { setCart((prev) => prev.filter((i) => !(i.prod_id === prod_id && i.talle === talle))) }

  function limpiar() {
    setCart([]); setCliente(null); setBuscadorCli('')
    setConEnvio(false); setEnvioMonto(''); setEnvioDesc(''); setObs('')
  }

  function handleSearch(val) {
    setSearch(val)
    const exact = findProductByCodigo(allProds, val)
    if (exact) addToCart(exact)
  }

  function cargarPorCodigo(codigo) {
    const prod = findProductByCodigo(allProds, codigo)
    if (!prod) {
      const q = normalizarCodigo(codigo)
      if (q) toast(`Código "${q}" no encontrado`, 'err')
      if (!esMovil) { setSearch(''); searchRef.current?.focus() }
      return
    }
    addToCart(prod)
  }

  function handleKeyDown(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (search) cargarPorCodigo(search)
  }

  const subtotal = cart.reduce((a, i) => a + i.precio * i.cantidad, 0)
  const envioVal = conEnvio ? (parseFloat(envioMonto) || 0) : 0
  const total = subtotal + envioVal

  async function pasarACaja() {
    if (cart.length === 0) { toast('El carrito está vacío', 'err'); return }
    setProcesando(true)
    try {
      const items = cart.map((i) => ({ prod_id: i.prod_id, nombre: i.nombre, talle: i.talle, precio: i.precio, cantidad: i.cantidad, subtotal: i.precio * i.cantidad, costo: i.costo || 0 }))
      const r = await api('POST', '/ventas', { suc_id: sucSesion, cliente_id: cliente?.id || null, items, subtotal, descuento: 0, total, pago: 'pendiente_cobro', comprobante: 'pendiente', es_ctacte: false, recargo_pago: 0, envio_monto: envioVal, envio_detalle: envioDesc || '', observacion: obs || '' })
      toast(`✅ Venta #${r.numero || ''} registrada — pasá a Caja para cobrar`, 'ok')
      limpiar()
      api('GET', `/productos?viewer_suc=${sucSesion}`).then((d) => { if (Array.isArray(d)) setProds(d) }).catch(() => {})
    } catch (e) {
      if (e.message === 'offline-queued') { toast('📵 Venta guardada offline', ''); limpiar() }
      else toast(e.message, 'err')
    } finally { setProcesando(false) }
  }

  async function registrarCtacte() {
    if (!cliente?.es_ctacte) { toast('Este cliente no tiene cuenta corriente habilitada', 'err'); return }
    if (cart.length === 0) { toast('El carrito está vacío', 'err'); return }
    setProcesando(true)
    try {
      const items = cart.map((i) => ({ prod_id: i.prod_id, nombre: i.nombre, talle: i.talle, precio: i.precio, cantidad: i.cantidad, subtotal: i.precio * i.cantidad, costo: i.costo || 0 }))
      const r = await api('POST', '/ventas', { suc_id: sucSesion, cliente_id: cliente.id, items, subtotal, descuento: 0, total, pago: 'ctacte', comprobante: 'pendiente', es_ctacte: true, recargo_pago: 0, envio_monto: 0, envio_detalle: '' })
      toast(`✅ Venta #${r.numero || ''} en cuenta corriente — pasá a Caja`, 'ok')
      limpiar()
      api('GET', `/productos?viewer_suc=${sucSesion}`).then((d) => { if (Array.isArray(d)) setProds(d) }).catch(() => {})
    } catch (e) { toast(e.message, 'err') }
    finally { setProcesando(false) }
  }

  return (
    <>
    <div className="pos-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 12, height: 'calc(100vh - 92px)' }}>
      {/* ── Izquierda: búsqueda + grilla ── */}
      <div className="pos-products" style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--mu)' }}>🔍</span>
            <input ref={searchRef} value={search} onChange={(e) => handleSearch(e.target.value)} onKeyDown={handleKeyDown} placeholder="Buscar producto..." autoComplete="off" className="pos-search" style={{ paddingLeft: 38, fontSize: 14, fontWeight: 500, width: '100%' }} />
          </div>
          {esMovil && (
            <button type="button" onClick={() => setEscaneando(true)} aria-label="Escanear con la cámara"
              style={{ flexShrink: 0, padding: '0 14px', borderRadius: 10, border: '1.5px solid var(--ac)', background: 'transparent', color: 'var(--ac)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              📷 Escanear
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {prodsFiltrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--mu)' }}><div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div><div>{search ? `Sin resultados para "${search}"` : 'Sin productos cargados'}</div></div>
          ) : (
            <div className="pos-product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 8 }}>
              {prodsFiltrados.map((p) => <ProdTile key={p.id + (p.talle || '')} prod={p} lista={lista} onClick={addToCart} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── Derecha: carrito ── */}
      {esMovil && cart.length === 0 ? (
        <div style={{ order: 2, position: 'sticky', bottom: 0, zIndex: 20, background: 'var(--bg)', borderTop: '1px solid var(--bd)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--mu)' }}>🛒 Tocá un producto para agregar</span>
          <button type="button" onClick={() => navigate('/app/caja')}
            style={{ padding: '5px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', background: 'transparent', color: 'var(--mu)', fontSize: 11, cursor: 'pointer' }}>
            💰 Caja
          </button>
        </div>
      ) : (
        <div className="pos-cart" style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Cliente */}
        <div className="pos-cart-header" style={{ padding: '10px 14px', borderBottom: '1px solid var(--bd)', background: 'var(--sf)', position: 'relative' }}>
          {cliente ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{cliente.nombre} {cliente.apellido || ''}</div>
                <div style={{ fontSize: 11, color: 'var(--mu)' }}>{cliente.tel || ''}{cliente.lista > 1 ? ` · ${LISTA_LABELS[cliente.lista]}` : ''}{cliente.es_ctacte ? ' · 📒 Cta. Cte.' : ''}{cliente.saldo_ctacte > 0 ? ` · Debe ${fmt(cliente.saldo_ctacte)}` : ''}</div>
              </div>
              <button type="button" onClick={() => { setCliente(null); setBuscadorCli('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mu)', fontSize: 18 }}>✕</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input value={buscadorCli} onChange={(e) => { setBuscadorCli(e.target.value); setShowCliResults(true) }} onFocus={() => setShowCliResults(true)} placeholder="👤 Buscar cliente (opcional)..." style={{ fontSize: 12 }} />
              {showCliResults && cliResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 50, maxHeight: 200, overflowY: 'auto' }}>
                  {cliResults.map((c) => (
                    <div key={c.id} onClick={() => { setCliente(c); setBuscadorCli(''); setShowCliResults(false) }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--bd)', fontSize: 12 }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--sf)'} onMouseLeave={(e) => e.currentTarget.style.background = ''}>
                      <div style={{ fontWeight: 700 }}>{c.nombre} {c.apellido || ''}</div>
                      <div style={{ fontSize: 10, color: 'var(--mu)' }}>{c.tel || ''}{c.lista > 1 ? ` · ${LISTA_LABELS[c.lista]}` : ''}{c.es_ctacte ? ' · 📒' : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Items */}
          <div className="pos-cart-items" style={{ flex: 1, overflowY: 'auto', padding: '0 14px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 28, color: 'var(--mu)', fontSize: 13 }}><div style={{ fontSize: 26, marginBottom: 6 }}>🛒</div>Tocá un producto para agregar</div>
          ) : cart.map((item) => <CartItem key={item.prod_id + item.talle} item={item} onQty={updateQty} onRemove={removeItem} />)}
        </div>

        {/* Pie */}
        <div style={{ borderTop: '2px solid var(--bd)', padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: 'var(--mu)' }}>Subtotal</span><span style={{ fontWeight: 600 }}>{fmt(subtotal)}</span>
          </div>

          {/* Envío */}
          <div style={{ marginBottom: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: conEnvio ? 6 : 0 }}>
              <input type="checkbox" checked={conEnvio} onChange={(e) => setConEnvio(e.target.checked)} style={{ width: 15, height: 15 }} />
              📦 Incluir envío
            </label>
            {conEnvio && (
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={envioMonto} onChange={(e) => setEnvioMonto(e.target.value)} type="number" min="0" placeholder="Monto ($)" style={{ flex: 1, padding: '6px 10px', fontSize: 12 }} />
                <input value={envioDesc} onChange={(e) => setEnvioDesc(e.target.value)} placeholder="Descripción" style={{ flex: 2, padding: '6px 10px', fontSize: 12 }} />
              </div>
            )}
          </div>

          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observaciones..." style={{ width: '100%', marginBottom: 8, padding: '6px 10px', fontSize: 12 }} />

          {/* TOTAL */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 20, marginBottom: 10 }}>
            <span>TOTAL</span>
            <span style={{ color: cart.length > 0 ? 'var(--ac)' : 'var(--mu)' }}>{fmt(total)}</span>
          </div>

          {/* Botón registrar venta */}
          <button type="button" onClick={pasarACaja} disabled={cart.length === 0 || procesando}
            style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: cart.length > 0 ? 'var(--ac)' : 'var(--bd)', color: cart.length > 0 ? '#fff' : 'var(--mu)', fontWeight: 800, fontSize: 15, cursor: cart.length > 0 ? 'pointer' : 'not-allowed', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {procesando ? <><span className="spinner" style={{ width: 16, height: 16, borderTopColor: '#fff' }} /> Registrando...</> : <><span>🧾</span> Registrar venta</>}
          </button>

          {/* Cuenta corriente */}
          {cliente?.es_ctacte && (
            <button type="button" onClick={registrarCtacte} disabled={cart.length === 0 || procesando}
              style={{ width: '100%', padding: '9px', borderRadius: 10, border: '1.5px solid var(--ac2)', background: 'transparent', color: 'var(--ac2)', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 6 }}>
              📒 Cargar en cuenta corriente
            </button>
          )}

          {/* Ir a caja */}
          <button type="button" onClick={() => navigate('/app/caja')}
            style={{ width: '100%', padding: '7px', borderRadius: 8, border: '1.5px solid var(--bd)', background: 'transparent', color: 'var(--mu)', fontSize: 12, cursor: 'pointer', marginBottom: 4 }}>
            💰 Ir a Caja
          </button>

          {/* Limpiar */}
          {cart.length > 0 && (
            <button type="button" onClick={limpiar} style={{ width: '100%', padding: '6px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--mu)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
              🗑 Limpiar
            </button>
          )}
        </div>
      </div>
      )}

    </div>

    <ScannerModal open={escaneando} onClose={() => setEscaneando(false)} onResolveProducto={(codigo) => {
      const prod = findProductByCodigo(allProds, codigo)
      if (!prod) return null
      return { prod, precio: precioLista(prod, lista), stock: getStock(prod) }
    }} onAgregar={(prod, cant) => addToCart(prod, cant)} />
    </>
  )
}
