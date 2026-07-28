import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'

function formatTime(fecha) {
  const diff = Date.now() - new Date(fecha).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `hace ${days}d`
}

export function NotifBell() {
  const { api } = useApi()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const ref = useRef(null)

  const fetchUnread = useCallback(async () => {
    try {
      const r = await api('GET', '/notificaciones/unread-count')
      setUnread(r?.n ?? r?.count ?? 0)
    } catch { /* offline */ }
  }, [api])

  const fetchNotifs = useCallback(async () => {
    try {
      const data = await api('GET', '/notificaciones')
      setNotifs(Array.isArray(data) ? data : (Array.isArray(data?.notificaciones) ? data.notificaciones : []))
    } catch { /* offline */ }
  }, [api])

  useEffect(() => {
    fetchUnread()
    const iv = setInterval(fetchUnread, 60000)
    return () => clearInterval(iv)
  }, [fetchUnread])

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  function handleBellClick() {
    if (open) {
      setOpen(false)
      return
    }
    fetchNotifs().then(() => {
      setOpen(true)
    })
    if (unread > 0) {
      api('PATCH', '/notificaciones/leer-todas').catch(() => {})
      setUnread(0)
    }
  }

  async function handleNotifClick(notif) {
    if (!notif.leida) {
      try {
        await api('PATCH', `/notificaciones/${notif.id}/leer`)
        setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, leida: true } : n))
        setUnread(u => Math.max(0, u - 1))
      } catch { /* offline */ }
    }
    if (notif.data) {
      let parsed
      try {
        parsed = typeof notif.data === 'string' ? JSON.parse(notif.data) : notif.data
      } catch { parsed = null }
      if (parsed?.accion) {
        navigate(parsed.accion)
        setOpen(false)
      }
    }
  }

  function handleMarkAllRead(e) {
    e.stopPropagation()
    api('PATCH', '/notificaciones/leer-todas').catch(() => {})
    setNotifs(prev => prev.map(n => ({ ...n, leida: true })))
    setUnread(0)
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={handleBellClick}
        style={{
          position: 'relative',
          padding: 6,
          cursor: 'pointer',
          fontSize: 18,
          background: 'transparent',
          border: 'none',
          color: 'var(--mu)',
          lineHeight: 1,
        }}
        aria-label="Notificaciones"
      >
        &#128276;
        {unread > 0 && (
          <span style={{
            position: 'absolute',
            top: -2,
            right: -6,
            background: 'var(--bad)',
            color: 'white',
            borderRadius: '50%',
            fontSize: 10,
            width: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            lineHeight: 1,
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          width: 360,
          maxHeight: 400,
          zIndex: 100,
          background: 'var(--bg)',
          borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,.2)',
          border: '1px solid var(--bd)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--bd)',
            fontWeight: 700,
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span>&#128234; Notificaciones</span>
            <span
              onClick={handleMarkAllRead}
              style={{ fontSize: 11, color: 'var(--ac)', cursor: 'pointer' }}
            >
              Leer todas
            </span>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifs.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--mu)', fontSize: 13 }}>
                No hay notificaciones
              </div>
            ) : (
              notifs.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--bd)',
                    cursor: 'pointer',
                    borderLeft: n.leida ? '3px solid transparent' : '3px solid var(--ac)',
                    background: n.leida ? 'transparent' : 'rgba(99,102,241,0.04)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--sf)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = n.leida ? 'transparent' : 'rgba(99,102,241,0.04)' }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{n.titulo}</div>
                  {n.mensaje && (
                    <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 2 }}>{n.mensaje}</div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--mu)', marginTop: 4 }}>
                    {formatTime(n.created_at || n.fecha)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
