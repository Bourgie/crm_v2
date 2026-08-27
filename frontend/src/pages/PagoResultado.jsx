import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'

function StatusPoll({ externalRef }) {
  const [estado, setEstado] = useState(null)
  const [info, setInfo] = useState(null)

  useEffect(() => {
    if (!externalRef) return
    let cancelled = false
    async function poll() {
      try {
        const r = await fetch('/api/billing/mp/status/' + encodeURIComponent(externalRef))
        const d = await r.json()
        if (!r.ok) { if (!cancelled) setEstado('error'); return }
        if (!cancelled) { setEstado(d.estado); setInfo(d) }
        if (d.estado === 'approved' || d.estado === 'rejected' || d.estado === 'cancelled') return
        setTimeout(poll, 3000)
      } catch { if (!cancelled) setEstado('error') }
    }
    poll()
    return () => { cancelled = true }
  }, [externalRef])

  if (!externalRef) return null
  if (estado === 'approved') {
    return (
      <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '14px 16px', marginTop: 12, fontSize: 13 }}>
        ✅ Pago confirmado{info?.plan ? ' — ' + info.plan : ''}. {info?.comprobante_num ? 'Comprobante: ' + info.comprobante_num : ''}
        {info?.empresa?.codigo && <div style={{ marginTop: 8, color: 'var(--mu)' }}>Tu empresa <strong>{info.empresa.nombre || info.empresa.codigo}</strong> fue creada. Revisá tu email para verificar la cuenta e ingresar.</div>}
      </div>
    )
  }
  if (estado === 'pending') return <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 10, padding: '14px 16px', marginTop: 12, fontSize: 13 }}>⏳ Pago pendiente de confirmación. Te avisaremos por email en cuanto se acredite.</div>
  if (estado === 'rejected' || estado === 'cancelled') return <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '14px 16px', marginTop: 12, fontSize: 13 }}>❌ El pago fue {estado === 'rejected' ? 'rechazado' : 'cancelado'}. Podés intentar nuevamente.</div>
  if (estado === 'error') return <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 10, padding: '14px 16px', marginTop: 12, fontSize: 13, color: 'var(--mu)' }}>No pudimos verificar el estado del pago. Si el débito aparece en tu cuenta, contactanos.</div>
  return <div style={{ color: 'var(--mu)', fontSize: 12, marginTop: 12 }}>⏳ Verificando pago...</div>
}

export function PagoExitoso() {
  const [params] = useSearchParams()
  const ref = params.get('external_reference') || params.get('collection_id') || params.get('ref') || params.get('payment_id') || ''
  // MP en checkout pro devuelve external_reference o collection_id. Si no viene, buscamos pref?
  // Como fallback mostramos mensaje genérico.
  return (
    <div style={{ maxWidth: 'min(520px, 94vw)', margin: '60px auto', textAlign: 'center', padding: '0 12px' }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>¡Pago recibido!</h2>
      <p style={{ color: 'var(--mu)', fontSize: 13, lineHeight: 1.6 }}>
        Estamos confirmando tu pago con MercadoPago. Esto puede demorar unos segundos.
      </p>
      <StatusPoll externalRef={ref} />
      <p style={{ marginTop: 24 }}>
        <Link to="/app/login" className="btn btn-primary" style={{ padding: '10px 24px' }}>Ir al inicio de sesión</Link>
      </p>
      <p style={{ marginTop: 12, fontSize: 12, color: 'var(--mu)' }}>
        Te enviamos el comprobante por email. Si tenés dudas, contactanos.
      </p>
    </div>
  )
}

export function PagoPendiente() {
  const [params] = useSearchParams()
  const ref = params.get('external_reference') || params.get('ref') || ''
  return (
    <div style={{ maxWidth: 'min(520px, 94vw)', margin: '60px auto', textAlign: 'center', padding: '0 12px' }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>⏳</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Pago pendiente</h2>
      <p style={{ color: 'var(--mu)', fontSize: 13, lineHeight: 1.6 }}>
        Tu pago está siendo procesado. Te avisaremos por email cuando se acredite.
      </p>
      <StatusPoll externalRef={ref} />
      <p style={{ marginTop: 24 }}>
        <Link to="/app/login" className="btn btn-secondary" style={{ padding: '10px 24px' }}>Ir al inicio de sesión</Link>
      </p>
    </div>
  )
}

export function PagoError() {
  return (
    <div style={{ maxWidth: 'min(520px, 94vw)', margin: '60px auto', textAlign: 'center', padding: '0 12px' }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>❌</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Pago no completado</h2>
      <p style={{ color: 'var(--mu)', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
        No pudimos confirmar tu pago. No se realizó ningún cargo definitivo.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to="/app/signup" className="btn btn-primary" style={{ padding: '10px 24px' }}>Intentar nuevamente</Link>
        <Link to="/app/login" className="btn btn-secondary" style={{ padding: '10px 24px' }}>Ir al inicio de sesión</Link>
      </div>
    </div>
  )
}
