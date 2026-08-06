import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Modal } from './Modal'

const ELEMENT_ID = 'pos-camera-scanner'

function mensajeError(e) {
  const msg = (e && (e.message || String(e))) || ''
  if (/NotAllowed|Permission|denied|denegado/i.test(msg)) return 'Permiso de cámara denegado. Habilitá la cámara para este sitio en la configuración del navegador.'
  if (/NotFound|no camera|No camera/i.test(msg)) return 'No se encontró ninguna cámara en este dispositivo.'
  return msg || 'No se pudo iniciar la cámara.'
}

const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

const stepper = {
  width: 36, height: 36, borderRadius: 10, border: '2px solid var(--bd)',
  background: 'var(--sf)', cursor: 'pointer', fontWeight: 700, fontSize: 18,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

export function ScannerModal({ open, onClose, onResolveProducto, onAgregar }) {
  const [fase, setFase] = useState('scan') // scan | producto | no-encontrado | error-camara
  const [errorMsg, setErrorMsg] = useState('')
  const [res, setRes] = useState(null)       // { prod, precio, stock }
  const [codigo, setCodigo] = useState('')
  const [cantidad, setCantidad] = useState(1)

  const scannerRef = useRef(null)
  const stopChainRef = useRef(Promise.resolve())
  const activoRef = useRef(false)

  useEffect(() => {
    if (open) {
      setFase('scan')
      setErrorMsg('')
      setRes(null)
      setCodigo('')
      setCantidad(1)
    }
  }, [open])

  useEffect(() => {
    if (!open || fase !== 'scan') return
    activoRef.current = true

    const stop = () => {
      const sc = scannerRef.current
      scannerRef.current = null
      stopChainRef.current = stopChainRef.current.then(async () => {
        if (!sc) return
        try { await sc.stop() } catch {}
        try { await sc.clear() } catch {}
      })
      return stopChainRef.current
    }

    const start = async () => {
      try {
        await stopChainRef.current
        if (!activoRef.current) return
        const scanner = new Html5Qrcode(ELEMENT_ID)
        scannerRef.current = scanner
        let resuelto = false
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 },
          (decodedText) => {
            if (!activoRef.current || resuelto) return
            resuelto = true
            stop()
            const q = String(decodedText || '').trim()
            setCodigo(q)
            const r = onResolveProducto(q)
            if (r) {
              setRes(r)
              setCantidad(1)
              setFase('producto')
            } else {
              setFase('no-encontrado')
            }
          },
          () => {}
        )
        if (!activoRef.current) stop()
      } catch (e) {
        if (!activoRef.current) return
        setErrorMsg(mensajeError(e))
        setFase('error-camara')
        stop()
      }
    }

    start()
    return () => {
      activoRef.current = false
      stop()
    }
  }, [open, fase, onResolveProducto])

  const reintentar = () => {
    setFase('scan')
    setErrorMsg('')
    setRes(null)
    setCodigo('')
    setCantidad(1)
  }

  const stock = res?.stock ?? 0
  const superaStock = cantidad > stock && stock > 0

  return (
    <Modal open={open} onClose={onClose} title="📷 Escanear código" size="sm">
      <div style={{ textAlign: 'center' }}>
        {fase === 'scan' && (
          <>
            <div id={ELEMENT_ID} style={{ width: '100%', borderRadius: 10, overflow: 'hidden', background: 'var(--sf)' }} />
            <p style={{ fontSize: 12, color: 'var(--mu)', marginTop: 10 }}>Apuntá la cámara al código de barras o QR</p>
          </>
        )}

        {fase === 'producto' && res && (
          <div>
            <div style={{ background: 'var(--sf)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{res.prod.nombre}</div>
              {res.prod.talle && <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 2 }}>Talle: {res.prod.talle}{res.prod.color ? ` · ${res.prod.color}` : ''}</div>}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 8, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 800, fontSize: 22, color: 'var(--ac)' }}>{fmt(res.precio)}</span>
                <span style={{ fontSize: 11, color: stock > 0 ? 'var(--mu)' : 'var(--bad)' }}>
                  {stock > 0 ? `Stock: ${stock}` : 'Sin stock'}
                </span>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 6 }}>Cantidad</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                <button type="button" onClick={() => setCantidad((c) => Math.max(1, c - 1))} style={stepper}>−</button>
                <span style={{ fontSize: 24, fontWeight: 800, minWidth: 42, textAlign: 'center' }}>{cantidad}</span>
                <button type="button" onClick={() => setCantidad((c) => c + 1)} style={stepper}>+</button>
              </div>
              {superaStock && (
                <div style={{ fontSize: 11, color: 'var(--bad)', marginTop: 6 }}>Pediste {cantidad}, hay {stock}. Se generará pedido por la diferencia.</div>
              )}
              {stock <= 0 && (
                <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 6 }}>Sin stock — se generará pedido pendiente.</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { onAgregar(res.prod, cantidad); onClose() }}
                style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: 'var(--ok)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                ✔ Agregar
              </button>
              <button type="button" onClick={reintentar}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: '1.5px solid var(--bd)', background: 'var(--bg)', color: 'var(--tx)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Otro
              </button>
            </div>
            <button type="button" onClick={onClose}
              style={{ width: '100%', marginTop: 6, padding: 8, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--mu)', fontSize: 12, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
        )}

        {fase === 'no-encontrado' && (
          <div>
            <div style={{ fontSize: 40, marginBottom: 8 }}>❓</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Código no encontrado</div>
            <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 14, wordBreak: 'break-all' }}>«{codigo}»</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={reintentar}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: 'var(--ac)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                🔄 Reintentar
              </button>
              <button type="button" onClick={onClose}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: '1.5px solid var(--bd)', background: 'var(--bg)', color: 'var(--tx)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Cerrar
              </button>
            </div>
          </div>
        )}

        {fase === 'error-camara' && (
          <div>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🚫</div>
            <div style={{ fontSize: 13, color: 'var(--bad)', marginBottom: 14 }}>{errorMsg}</div>
            <button type="button" onClick={onClose}
              style={{ padding: '10px 24px', borderRadius: 10, border: '1.5px solid var(--bd)', background: 'var(--bg)', color: 'var(--tx)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
