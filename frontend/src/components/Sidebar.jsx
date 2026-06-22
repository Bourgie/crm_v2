import { NavLink, useNavigate } from 'react-router-dom'
import { useApp, useAuth } from '../store'
import { useChatUnread } from '../pages/Chat'
import { usePipelineVencidas, useTareasVencidas, usePipelineActivity } from '../pages/Pipeline'

const NAV = [
  { section: 'Principal' },
  { to: '/app/dashboard', icon: '📊', label: 'Dashboard', mod: null },
  { to: '/app/pos',       icon: '🛒', label: 'Punto de Venta', mod: 'pos' },
  { to: '/app/ventas',    icon: '📋', label: 'Ventas', mod: 'ventas' },
  { section: 'Gestión' },
  { to: '/app/clientes',  icon: '👥', label: 'Clientes', mod: 'clientes' },
  { to: '/app/productos',  icon: '👕', label: 'Productos', mod: 'productos' },
  { to: '/app/caja',      icon: '💰', label: 'Caja', mod: 'caja' },
  { to: '/app/presupuestos', icon: '📄', label: 'Presupuestos', mod: 'presupuestos' },
  { to: '/app/pendientes', icon: '🚚', label: 'Pendientes', mod: 'pendientes' },
  { section: 'Finanzas' },
  { to: '/app/ctacte',    icon: '📒', label: 'Cta. Corriente', mod: 'ctacte' },
  { to: '/app/gastos',    icon: '💸', label: 'Gastos', mod: 'gastos', roles: ['admin','supervisor'] },
  { section: 'Operaciones' },
  { to: '/app/transferencias', icon: '🔄', label: 'Transferencias', mod: 'transferencias', roles: ['admin','supervisor'] },
  { to: '/app/proveedores', icon: '📦', label: 'Proveedores', mod: 'proveedores' },
  { to: '/app/listabebe', icon: '🎁', label: 'Lista de Regalos', mod: 'listabebe', roles: ['admin','supervisor'] },
  { section: 'Sistema' },
  { to: '/app/pipeline',  icon: '📋', label: 'Pipeline', mod: 'pipeline', badge: 'pipeline' },
  { to: '/app/rrhh',      icon: '👥', label: 'RRHH', mod: 'rrhh' },
  { to: '/app/chat',      icon: '💬', label: 'Chat', mod: 'chat', badge: 'chat' },
  { to: '/app/reportes',  icon: '📈', label: 'Reportes', mod: 'reportes', roles: ['admin','supervisor'] },
  { to: '/app/auditoria', icon: '🔍', label: 'Auditoría', mod: 'auditoria', roles: ['admin','supervisor'] },
  { to: '/app/usuarios',  icon: '👤', label: 'Usuarios', mod: null, adminOnly: true },
  { to: '/app/sucursales', icon: '🏪', label: 'Sucursales', mod: null, adminOnly: true },
  { to: '/app/config',    icon: '⚙️', label: 'Configuración', mod: null, roles: ['admin','supervisor'] },
]

export function Sidebar({ mobile, onClose }) {
  const { hasModule, cfg, sucSesion, setSucSesion, allSucs } = useApp()
  const { me, logout } = useAuth()
  const navigate = useNavigate()
  const chatUnread = useChatUnread()
  const pipelineBadge = usePipelineVencidas()
  const tareasBadge = useTareasVencidas()
  const activityBadge = usePipelineActivity()

  function handleLogout() {
    logout()
    navigate('/app/login')
  }

  // Sucursales permitidas para este usuario
  const sucPermitidas = (() => {
    const all = Array.isArray(allSucs) ? allSucs : []
    const userPerm = Array.isArray(me?.suc_sesiones_permitidas) ? me.suc_sesiones_permitidas : []
    if (!userPerm.length) return all
    return all.filter(s => userPerm.includes(s.id))
  })()
  const sucActual = (allSucs || []).find(s => s.id === sucSesion)

  function cambiarSucursal(e) {
    const id = e.target.value
    if (id === sucSesion) return
    setSucSesion(id)
    // Reload to clear cached data tied to old suc
    window.location.reload()
  }

  const items = NAV.filter((item) => {
    if (item.section) return true
    if (item.adminOnly && me?.rol !== 'admin') return false
    if (item.roles && !item.roles.includes(me?.rol)) return false
    if (item.mod && !hasModule(item.mod)) return false
    return true
  })

  return (
    <nav className={`sidebar ${mobile ? 'open' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <span>💼</span>
        <div>Flex<span>CRM</span></div>
      </div>

      {/* Biz name */}
      {cfg?.nombre && (
        <div style={{ padding: '0 16px 6px', fontSize: 11, color: 'rgba(255,255,255,.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
          {cfg.nombre}
        </div>
      )}

      {/* Sucursal actual + selector */}
      {sucPermitidas.length > 0 && (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>📍 Sucursal</div>
          {sucPermitidas.length > 1 ? (
            <select value={sucSesion || ''} onChange={cambiarSucursal}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,.08)', color: '#fff', border: '1px solid rgba(255,255,255,.15)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {sucPermitidas.map(s => <option key={s.id} value={s.id} style={{ color: '#000' }}>{s.nombre}</option>)}
            </select>
          ) : (
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{sucActual?.nombre || '—'}</div>
          )}
        </div>
      )}

      {/* Nav items */}
      <div className="sidebar-nav">
        {items.map((item, i) => {
          if (item.section) {
            return (
              <div key={i} className="nav-section">{item.section}</div>
            )
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={mobile ? onClose : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {(item.badge === 'chat' && chatUnread > 0) && (
                <span style={{ marginLeft: 'auto', background: 'var(--bad, #ef4444)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 7px', minWidth: 18, textAlign: 'center' }}>
                  {chatUnread > 9 ? '9+' : chatUnread}
                </span>
              )}
              {(item.badge === 'pipeline' && (pipelineBadge > 0 || tareasBadge > 0 || activityBadge > 0)) && (
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                  {activityBadge > 0 && (
                    <span style={{ background: 'var(--ac, #6366f1)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 7px', minWidth: 18, textAlign: 'center' }}>
                      {activityBadge > 9 ? '9+' : activityBadge}
                    </span>
                  )}
                  {pipelineBadge > 0 && (
                    <span style={{ background: 'var(--warn, #f59e0b)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 7px', minWidth: 18, textAlign: 'center' }}>
                      {pipelineBadge > 9 ? '9+' : pipelineBadge}
                    </span>
                  )}
                  {tareasBadge > 0 && (
                    <span style={{ background: 'var(--bad, #ef4444)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 7px', minWidth: 18, textAlign: 'center' }}>
                      {tareasBadge > 9 ? '9+' : tareasBadge}
                    </span>
                  )}
                </span>
              )}
            </NavLink>
          )
        })}
      </div>

      {/* User footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--ac)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#fff', flexShrink: 0 }}>
            {me?.nombre?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{me?.nombre}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>{me?.rol}</div>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>
    </nav>
  )
}
