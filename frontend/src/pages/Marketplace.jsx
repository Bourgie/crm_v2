// ═══════════════════════════════════════
// FlexCRM — Tienda de Apps (Marketplace)
// Página donde los tenants browsean e instalan apps
// ═══════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useAuth, useApps } from '../store'

const CATEGORIAS = [
  { key: '', label: 'Todas' },
  { key: 'finanzas', label: '💰 Finanzas' },
  { key: 'ventas', label: '🚀 Ventas' },
  { key: 'reportes', label: '📊 Reportes' },
  { key: 'logistica', label: '📦 Logística' },
  { key: 'rrhh', label: '👥 RRHH' },
  { key: 'integracion', label: '🔌 Integraciones' },
  { key: 'automatizacion', label: '🤖 Automatización' },
  { key: 'industria', label: '🏭 Industria' },
  { key: 'general', label: '📦 General' },
]

function AppCard({ app, isInstalled, onInstall, installing, isAdmin }) {
  const navigate = useNavigate()
  const precio = app.precio_mensual > 0
    ? `$${app.precio_mensual}/mes`
    : app.precio_base > 0
      ? `$${app.precio_base}`
      : 'Gratis'

  const trial = app.trial_dias > 0 ? `${app.trial_dias} días gratis` : null

  return (
    <div
      onClick={() => navigate(`/app/marketplace/${app.slug}`)}
      style={{
        background: 'var(--bg, #fff)',
        border: '1px solid var(--bd, #e5e7eb)',
        borderRadius: 12,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 32 }}>{app.icono || '📦'}</span>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px', color: 'var(--tx, #111827)' }}>
            {app.nombre}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--mu, #6b7280)', lineHeight: 1.4, margin: 0 }}>
            {app.descripcion || 'Sin descripción'}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--ac, #4f46e5)' }}>{precio}</span>
          {trial && (
            <span style={{ fontSize: 12, color: 'var(--green, #16a34a)', marginLeft: 6 }}>({trial})</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {app.tags && Array.isArray(app.tags) && app.tags.map(tag => (
            <span key={tag} style={{
              padding: '2px 8px', fontSize: 11, borderRadius: 10,
              background: 'var(--bga, #f3f4f6)', color: 'var(--mu, #6b7280)'
            }}>{tag}</span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {isInstalled ? (
          <span style={{
            flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 13, fontWeight: 600,
            background: 'var(--bga, #f3f4f6)', color: 'var(--mu, #6b7280)', borderRadius: 8,
          }}>
            ✓ Instalada
          </span>
        ) : isAdmin ? (
          <button
            onClick={e => { e.stopPropagation(); onInstall(app) }}
            disabled={installing === app.slug}
            style={{
              flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8,
              background: installing === app.slug ? 'var(--bga, #e5e7eb)' : 'var(--ac, #4f46e5)',
              color: installing === app.slug ? 'var(--mu, #9ca3af)' : '#fff',
              cursor: installing === app.slug ? 'wait' : 'pointer',
            }}
          >
            {installing === app.slug ? 'Instalando...' : 'Instalar'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function InstalledAppRow({ app, onToggle }) {
  const [toggling, setToggling] = useState(false)

  async function handleToggle() {
    setToggling(true)
    await onToggle(app)
    setToggling(false)
  }

  const tieneUpdate = app.version_disponible && app.version_disponible !== app.version_instalada

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderRadius: 10,
      border: '1px solid var(--bd, #e5e7eb)', background: 'var(--bg, #fff)',
    }}>
      <span style={{ fontSize: 24 }}>{app.icono || '📦'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--tx, #111827)' }}>
          {app.nombre || app.app_slug}
        </div>
        <div style={{ fontSize: 12, color: 'var(--mu, #6b7280)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span>v{app.version_instalada || app.version || '—'}</span>
          {tieneUpdate && (
            <span style={{ color: 'var(--ac, #4f46e5)', fontWeight: 500 }}>
              · disponible v{app.version_disponible}
            </span>
          )}
          <span>· {app.app_slug}</span>
        </div>
      </div>
      {tieneUpdate && (
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 10,
          background: '#eef2ff', color: 'var(--ac, #4f46e5)', whiteSpace: 'nowrap',
        }}>
          Update
        </span>
      )}
      <span className={`badge ${app.activa ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 11 }}>
        {app.activa ? 'Activa' : 'Pausada'}
      </span>
      <button
        onClick={handleToggle}
        disabled={toggling}
        className="btn btn-sm btn-secondary"
        style={{ fontSize: 12, minWidth: 70 }}
        title={app.activa ? 'Pausar app' : 'Activar app'}
      >
        {toggling ? '...' : app.activa ? '⏸️ Pausar' : '▶️ Activar'}
      </button>
    </div>
  )
}

export default function Marketplace() {
  const { api } = useApi()
  const { me } = useAuth()
  const { installed, isInstalled, addInstalled, removeInstalled, setLoading } = useApps()
  const [tab, setTab] = useState('tienda')
  const [apps, setApps] = useState([])
  const [installedApps, setInstalledApps] = useState([])
  const [categoria, setCategoria] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [installingSlug, setInstallingSlug] = useState(null)
  const [error, setError] = useState(null)
  const [loadingInstalled, setLoadingInstalled] = useState(false)

  const isAdmin = me?.rol === 'admin'

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (categoria) params.set('categoria', categoria)
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    const qs = params.toString()
    return '/apps/marketplace' + (qs ? '?' + qs : '')
  }, [categoria, searchQuery])

  const loadMarketplace = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api('GET', buildUrl())
      setApps(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message || 'Error al cargar la tienda')
    } finally {
      setLoading(false)
    }
  }, [buildUrl, api])

  const loadInstalled = useCallback(async () => {
    setLoadingInstalled(true)
    try {
      const data = await api('GET', '/apps/installed')
      setInstalledApps(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Error al cargar apps instaladas:', e)
    } finally {
      setLoadingInstalled(false)
    }
  }, [api])

  useEffect(() => {
    loadMarketplace()
  }, [loadMarketplace])

  useEffect(() => {
    if (tab === 'mis-apps') loadInstalled()
  }, [tab, loadInstalled])

  async function handleInstall(app) {
    if (isInstalled(app.slug)) return
    setInstallingSlug(app.slug)
    try {
      await api('POST', `/apps/installed/${app.slug}`)
      addInstalled({
        slug: app.slug,
        nombre: app.nombre,
        icono: app.icono,
        categoria: app.categoria,
        menu: app.menu || null,
      })
      loadInstalled()
    } catch (e) {
      alert('Error al instalar: ' + (e.message || 'Error desconocido'))
    } finally {
      setInstallingSlug(null)
    }
  }

  async function handleToggleStatus(app) {
    try {
      await api('PUT', `/apps/installed/${app.app_slug}/status`, { activa: app.activa ? 0 : 1 })
      if (app.activa) {
        removeInstalled(app.app_slug)
      } else {
        addInstalled({ slug: app.app_slug, nombre: app.nombre || app.app_slug, icono: app.icono || '📦' })
      }
      loadInstalled()
    } catch (e) {
      alert('Error al cambiar estado: ' + (e.message || 'Error desconocido'))
    }
  }

  const tabs = [
    { key: 'tienda', label: '🛍️ Tienda' },
    { key: 'mis-apps', label: '📦 Mis Apps' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 'min(1000px, 98vw)' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>🛍️ Tienda de Apps</h1>
        <p style={{ fontSize: 14, color: 'var(--mu, #6b7280)' }}>
          Descubrí e instalá apps para potenciar tu negocio. Algunas son gratis, otras tienen costo mensual.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--bd, #e5e7eb)', paddingBottom: 8 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 18px', fontSize: 14, fontWeight: tab === t.key ? 700 : 500,
              border: 'none', borderRadius: '8px 8px 0 0',
              background: tab === t.key ? 'var(--ac, #4f46e5)' : 'transparent',
              color: tab === t.key ? '#fff' : 'var(--tx, #374151)',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tienda' && (
        <>
          {/* Búsqueda + Categorías */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Buscar apps por nombre, descripción o tags..."
              style={{
                flex: 1, padding: '10px 14px', fontSize: 14, borderRadius: 10,
                border: '1px solid var(--bd, #e5e7eb)', background: 'var(--bg, #fff)',
                color: 'var(--tx, #111827)', outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
            {CATEGORIAS.map(cat => (
              <button
                key={cat.key}
                onClick={() => setCategoria(cat.key)}
                style={{
                  padding: '6px 14px', fontSize: 13, borderRadius: 20, border: '1px solid var(--bd, #e5e7eb)',
                  background: categoria === cat.key ? 'var(--ac, #4f46e5)' : 'var(--bg, #fff)',
                  color: categoria === cat.key ? '#fff' : 'var(--tx, #374151)',
                  cursor: 'pointer', fontWeight: 500,
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: 16, background: '#fef2f2', borderRadius: 10, marginBottom: 16, color: '#991b1b', fontSize: 13 }}>
              ⚠️ {error}
              <button onClick={loadMarketplace} style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>Reintentar</button>
            </div>
          )}

          {/* Grid */}
          {apps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--mu, #9ca3af)' }}>
              <span style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>📭</span>
              <p>No hay apps disponibles en esta categoría todavía.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {apps.map(app => (
                <AppCard
                  key={app.slug}
                  app={app}
                  isInstalled={isInstalled(app.slug)}
                  onInstall={handleInstall}
                  installing={installingSlug}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'mis-apps' && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--mu, #6b7280)', marginBottom: 16 }}>
            Administrá las apps instaladas en tu empresa. Podés pausar o activar cada una.
          </p>
          {loadingInstalled ? (
            <div className="p-8 text-center text-gray-400">Cargando apps instaladas...</div>
          ) : installedApps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--mu, #9ca3af)' }}>
              <span style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>📭</span>
              <p>No hay apps instaladas todavía.</p>
              <button onClick={() => setTab('tienda')} style={{
                marginTop: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600,
                border: 'none', borderRadius: 8, background: 'var(--ac, #4f46e5)', color: '#fff', cursor: 'pointer',
              }}>
                Explorar Tienda
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {installedApps.map(app => (
                <InstalledAppRow key={app.id} app={app} onToggle={handleToggleStatus} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
