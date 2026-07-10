import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { OfflineBanner } from './OfflineBanner'
import { useOfflineManager } from '../hooks/useOfflineManager'
import { useIdleTimer } from '../hooks/useIdleTimer'
import { useApi } from '../hooks/useApi'
import { useApp, useAuth } from '../store'
import { chatUnread } from '../pages/Chat'
import { pipelineVencidas, tareasVencidas, pipelineActivity } from '../pages/Pipeline'

const TITLES = {
  '/app/dashboard': '📊 Dashboard',
  '/app/pos': '🛒 Punto de Venta',
  '/app/ventas': '📋 Ventas',
  '/app/clientes': '👥 Clientes',
  '/app/productos': '👕 Productos',
  '/app/caja': '💰 Caja',
  '/app/presupuestos': '📄 Presupuestos',
  '/app/pendientes': '🚚 Pendientes',
  '/app/ctacte': '📒 Cuenta Corriente',
  '/app/gastos': '💸 Gastos',
  '/app/transferencias': '🔄 Transferencias',
  '/app/proveedores': '📦 Proveedores',
  '/app/listabebe': '🎁 Lista de Regalos',
  '/app/chat': '💬 Chat sucursales',
  '/app/pipeline': '📋 Pipeline Comercial',
  '/app/reportes': '📈 Reportes',
  '/app/auditoria': '🔍 Auditoría',
  '/app/usuarios': '👤 Usuarios',
  '/app/config': '⚙️ Configuración',
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  useOfflineManager()
  const { api } = useApi()
  const { sucSesion, allSucs, setSucs, cfg } = useApp()
  const { logout } = useAuth()
  const pollRef = useRef(null)

  const inactivityMinutes = parseInt(cfg?.inactividad_minutos) || 15
  const { showWarning, countdown, stayAlive } = useIdleTimer(inactivityMinutes, () => {
    api('POST', '/auth/logout').catch(() => {})
    logout()
  })

  // Load sucursales on mount if not loaded (e.g. after page reload bypassing Login)
  useEffect(() => {
    if (allSucs.length === 0) {
      api('GET', '/sucursales').then(data => {
        const list = Array.isArray(data) ? data : []
        if (list.length > 0) setSucs(list)
      }).catch(() => {})
    }
  }, [])

  // Global chat + pipeline unread polling (badge in sidebar)
  useEffect(() => {
    const check = async () => {
      if (location.pathname !== '/app/chat') {
        try {
          const r = await api('GET', `/chat/unread?suc_id=${sucSesion || ''}`)
          const n = r?.n || 0
          chatUnread.count = n
          chatUnread.listeners.forEach(l => l(n))
        } catch { /* offline */ }
      }
      try {
        const r = await api('GET', '/pipeline/vencidas')
        const n = r?.n || 0
        pipelineVencidas.count = n
        pipelineVencidas.listeners.forEach(l => l(n))
      } catch { /* offline */ }
      try {
        const r = await api('GET', '/tareas/vencidas')
        const n = r?.n || 0
        tareasVencidas.count = n
        tareasVencidas.listeners.forEach(l => l(n))
      } catch { /* offline */ }
      try {
        const r = await api('GET', '/pipeline/activity')
        const n = r?.n || 0
        pipelineActivity.count = n
        pipelineActivity.data = r?.ultimos || []
        pipelineActivity.listeners.forEach(l => l(n))
      } catch { /* offline */ }
    }
    check()
    pollRef.current = setInterval(check, 30000)
    return () => clearInterval(pollRef.current)
  }, [sucSesion, location.pathname])

  const title = TITLES[location.pathname] || 'FlexCRM'

  return (
    <div className="layout">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 39 }}
        />
      )}
      <Sidebar mobile={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="main-content">
        <OfflineBanner />

        {/* Topbar */}
        <div className="topbar">
          <buttontype="button" 
            type="button" className="btn btn-icon hamburger"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div className="topbar-title">{title}</div>
        </div>

        {/* Page content */}
        <div className="page-content">
          <Outlet />
        </div>
      </div>

      {/* Inactivity warning modal */}
      {showWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg)', borderRadius: 16, padding: '28px 32px', maxWidth: 400, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.3)', border: '1px solid var(--bd)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏰</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>¿Seguís ahí?</h3>
            <p style={{ fontSize: 13, color: 'var(--mu)', marginBottom: 16 }}>
              Tu sesión se cerrará por inactividad en <strong style={{ color: 'var(--bad)' }}>{countdown}s</strong>.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={stayAlive}>Sí, seguir usando FlexCRM</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


