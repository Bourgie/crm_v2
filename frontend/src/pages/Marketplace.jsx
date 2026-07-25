// ═══════════════════════════════════════
// FlexCRM — Tienda de Apps (Marketplace)
// Página donde los tenants browsean e instalan apps
// ═══════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useApps, useApp } from '../store'

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

function AppCard({ app, isInstalled, onInstall, installing }) {
  const precio = app.precio_mensual > 0
    ? `$${app.precio_mensual}/mes`
    : app.precio_base > 0
      ? `$${app.precio_base}`
      : 'Gratis'

  const trial = app.trial_dias > 0 ? `${app.trial_dias} días gratis` : null

  return (
    <div style={{
      background: 'var(--bg, #fff)',
      border: '1px solid var(--bd, #e5e7eb)',
      borderRadius: 12,
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
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
          {app.tags && JSON.parse(app.tags || '[]').map(tag => (
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
        ) : (
          <button
            onClick={() => onInstall(app)}
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
        )}
      </div>
    </div>
  )
}

export default function Marketplace() {
  const { api } = useApi()
  const { installed, isInstalled, addInstalled, setLoading } = useApps()
  const [apps, setApps] = useState([])
  const [categoria, setCategoria] = useState('')
  const [installingSlug, setInstallingSlug] = useState(null)
  const [error, setError] = useState(null)

  const loadMarketplace = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = '/api/apps/marketplace' + (categoria ? `?categoria=${encodeURIComponent(categoria)}` : '')
      const data = await api('GET', url)
      setApps(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message || 'Error al cargar la tienda')
    } finally {
      setLoading(false)
    }
  }, [categoria, api])

  useEffect(() => {
    loadMarketplace()
  }, [loadMarketplace])

  async function handleInstall(app) {
    if (isInstalled(app.slug)) return
    setInstallingSlug(app.slug)
    try {
      await api('POST', `/api/apps/installed/${app.slug}`)
      addInstalled({
        slug: app.slug,
        nombre: app.nombre,
        icono: app.icono,
        categoria: app.categoria,
        menu: app.menu || null,
      })
    } catch (e) {
      alert('Error al instalar: ' + (e.message || 'Error desconocido'))
    } finally {
      setInstallingSlug(null)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>🛍️ Tienda de Apps</h1>
        <p style={{ fontSize: 14, color: 'var(--mu, #6b7280)' }}>
          Descubrí e instalá apps para potenciar tu negocio. Algunas son gratis, otras tienen costo mensual.
        </p>
      </div>

      {/* Categorías */}
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
