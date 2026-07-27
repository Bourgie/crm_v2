import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useAuth, useApps } from '../store'

export default function AppDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { api } = useApi()
  const { me } = useAuth()
  const { installed, isInstalled, getInstalled, addInstalled } = useApps()
  const [app, setApp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState(null)

  const isAdmin = me?.rol === 'admin'

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    setError(null)
    api('GET', `/apps/marketplace/${encodeURIComponent(slug)}`)
      .then(data => setApp(data))
      .catch(e => setError(e.message || 'Error al cargar la app'))
      .finally(() => setLoading(false))
  }, [slug, api])

  async function handleInstall() {
    if (!app || isInstalled(app.slug)) return
    setInstalling(true)
    try {
      await api('POST', `/apps/installed/${app.slug}`)
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
      setInstalling(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>
  if (error) return (
    <div style={{ padding: 24 }}>
      <button onClick={() => navigate('/app/marketplace')} style={{ background: 'none', border: 'none', color: 'var(--ac, #4f46e5)', cursor: 'pointer', fontSize: 14, marginBottom: 16 }}>
        ← Volver a la Tienda
      </button>
      <div style={{ padding: 16, background: '#fef2f2', borderRadius: 10, color: '#991b1b', fontSize: 13 }}>
        ⚠️ {error}
      </div>
    </div>
  )
  if (!app) return (
    <div style={{ padding: 24 }}>
      <button onClick={() => navigate('/app/marketplace')} style={{ background: 'none', border: 'none', color: 'var(--ac, #4f46e5)', cursor: 'pointer', fontSize: 14, marginBottom: 16 }}>
        ← Volver a la Tienda
      </button>
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--mu, #9ca3af)' }}>
        <span style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>📭</span>
        <p>App no encontrada.</p>
      </div>
    </div>
  )

  const instalada = isInstalled(app.slug)
  const instaladaInfo = getInstalled(app.slug)
  const precio = app.precio_mensual > 0
    ? `$${app.precio_mensual}/mes`
    : app.precio_base > 0
      ? `$${app.precio_base}`
      : 'Gratis'

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <button
        onClick={() => navigate('/app/marketplace')}
        style={{ background: 'none', border: 'none', color: 'var(--ac, #4f46e5)', cursor: 'pointer', fontSize: 14, marginBottom: 16, padding: 0 }}
      >
        ← Volver a la Tienda
      </button>

      <div style={{
        background: 'var(--bg, #fff)',
        border: '1px solid var(--bd, #e5e7eb)',
        borderRadius: 16,
        padding: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
          <span style={{ fontSize: 48 }}>{app.icono || '📦'}</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--tx, #111827)' }}>
              {app.nombre}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--mu, #6b7280)', margin: '4px 0 0' }}>
              {app.categoria} · v{app.version}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--ac, #4f46e5)' }}>{precio}</div>
            {app.trial_dias > 0 && (
              <div style={{ fontSize: 12, color: 'var(--green, #16a34a)', marginTop: 2 }}>
                {app.trial_dias} días gratis
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {app.tags && Array.isArray(app.tags) && app.tags.map(tag => (
            <span key={tag} style={{
              padding: '3px 10px', fontSize: 12, borderRadius: 12,
              background: 'var(--bga, #f3f4f6)', color: 'var(--mu, #6b7280)'
            }}>{tag}</span>
          ))}
        </div>

        <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--tx, #374151)', marginBottom: 24 }}>
          {app.descripcion_larga || app.descripcion || 'Sin descripción.'}
        </div>

        {app.screenshots && Array.isArray(app.screenshots) && app.screenshots.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: 'var(--tx, #111827)' }}>Capturas</h3>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {app.screenshots.map((s, i) => (
                <img key={i} src={s} alt={`Screenshot ${i + 1}`} style={{
                  height: 200, borderRadius: 10, border: '1px solid var(--bd, #e5e7eb)',
                  objectFit: 'cover',
                }} />
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 16, borderTop: '1px solid var(--bd, #e5e7eb)' }}>
          {instalada ? (
            <div>
              <span style={{
                padding: '10px 24px', fontSize: 14, fontWeight: 600, borderRadius: 10,
                background: 'var(--bga, #f3f4f6)', color: 'var(--mu, #6b7280)',
                display: 'inline-block',
              }}>
                ✓ Ya instalada (v{instaladaInfo?.version_instalada || '—'})
              </span>
              {instaladaInfo?.version_instalada && instaladaInfo.version_instalada !== app.version && (
                <span style={{ fontSize: 12, color: 'var(--ac, #4f46e5)', marginLeft: 8 }}>
                  disponible v{app.version}
                </span>
              )}
            </div>
          ) : isAdmin ? (
            <button
              onClick={handleInstall}
              disabled={installing}
              style={{
                padding: '10px 24px', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 10,
                background: installing ? 'var(--bga, #e5e7eb)' : 'var(--ac, #4f46e5)',
                color: installing ? 'var(--mu, #9ca3af)' : '#fff',
                cursor: installing ? 'wait' : 'pointer',
              }}
            >
              {installing ? 'Instalando...' : 'Instalar app'}
            </button>
          ) : null}
          {app.autor && (
            <span style={{ fontSize: 13, color: 'var(--mu, #9ca3af)' }}>por {app.autor}</span>
          )}
        </div>
      </div>
    </div>
  )
}
