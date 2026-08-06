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

export function ScannerModal({ open, onClose, onScan }) {
  const [error, setError] = useState('')
  const [ultimo, setUltimo] = useState(null)
  const scannerRef = useRef(null)
  const ultimoCodigoRef = useRef(null)
  const onScanRef = useRef(onScan)
  const stopChainRef = useRef(Promise.resolve())
  onScanRef.current = onScan

  useEffect(() => {
    if (!open) return
    let activo = true
    setError('')
    setUltimo(null)

    // Serializa stop/clear: evita que el re-montado de StrictMode arranque
    // la cámara antes de que el clear() anterior haya liberado el DOM
    const stop = () => {
      const sc = scannerRef.current
      scannerRef.current = null
      stopChainRef.current = stopChainRef.current.then(async () => {
        if (!sc) return
        try { await sc.stop() } catch { /* nunca arrancó o ya paró */ }
        try { await sc.clear() } catch { /* nada que limpiar */ }
      })
      return stopChainRef.current
    }

    const start = async () => {
      try {
        await stopChainRef.current
        const scanner = new Html5Qrcode(ELEMENT_ID)
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 230, height: 230 },
            aspectRatio: 1,
          },
          (decodedText) => {
            if (!activo) return
            if (ultimoCodigoRef.current === decodedText) return
            ultimoCodigoRef.current = decodedText
            const prod = onScanRef.current(decodedText)
            setUltimo(prod ? { nombre: prod.nombre } : null)
          },
          () => { ultimoCodigoRef.current = null }
        )
        if (!activo) stop()
      } catch (e) {
        if (!activo) return
        setError(mensajeError(e))
        stop()
      }
    }

    start()
    return () => {
      activo = false
      ultimoCodigoRef.current = null
      stop()
    }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="📷 Escanear código" size="sm">
      <div style={{ textAlign: 'center' }}>
        <div id={ELEMENT_ID} style={{ width: '100%', borderRadius: 10, overflow: 'hidden', background: 'var(--sf)' }} />
        {error ? (
          <div style={{ fontSize: 12, color: 'var(--bad)', marginTop: 10 }}>{error}</div>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--mu)', marginTop: 10 }}>Apuntá la cámara al código de barras o QR del producto. Escaneá varios seguidos.</p>
        )}
        {ultimo && (
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ok)', marginTop: 8 }}>✔ {ultimo.nombre} agregado</div>
        )}
      </div>
    </Modal>
  )
}
