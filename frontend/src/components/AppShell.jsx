// ═══════════════════════════════════════
// FlexCRM AppShell
// Wrapper que carga y renderiza el frontend de una app
// ═══════════════════════════════════════

import { useState, useEffect, Suspense, lazy, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApps } from '../store'
import { getAppComponent } from '../apps-registry'
import { createFrontendSDK } from '../lib/app-sdk'

function Spinner() {
  return <div className="p-8 text-center text-gray-400">Cargando app...</div>
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-4xl mb-3">⚠️</span>
      <h3 className="text-lg font-medium text-gray-700 mb-2">Error al cargar la app</h3>
      <p className="text-sm text-gray-400 mb-4 max-w-xs">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}

function NotInstalled({ slug }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-4xl mb-3">📦</span>
      <h3 className="text-lg font-medium text-gray-700 mb-2">App no encontrada</h3>
      <p className="text-sm text-gray-400 mb-4">
        La app <strong>"{slug}"</strong> no está instalada o no existe.
      </p>
      <button
        onClick={() => navigate('/app/marketplace')}
        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
      >
        Ir a la Tienda de Apps
      </button>
    </div>
  )
}

export default function AppShell() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { installed, isInstalled } = useApps()
  const [AppComponent, setAppComponent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!slug) return

    if (installed.length > 0 && !isInstalled(slug)) {
      setLoading(false)
      return
    }

    const loader = getAppComponent(slug)
    if (!loader) {
      setError(`No hay componente registrado para "${slug}".`)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    loader()
      .then(mod => {
        setAppComponent(() => mod.default || mod)
        setLoading(false)
      })
      .catch(err => {
        console.error(`[AppShell] Error cargando app "${slug}":`, err)
        setError(err.message || 'Error al cargar el módulo de la app.')
        setLoading(false)
      })
  }, [slug, retryKey, installed])

  const sdk = useMemo(() => {
    if (!slug) return null
    return createFrontendSDK(slug, { navigate })
  }, [slug])

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={() => { setRetryKey(k => k + 1); setLoading(true); }} />
  if (!AppComponent && !loading) return <NotInstalled slug={slug} />
  if (!AppComponent) return <Spinner />

  return (
    <Suspense fallback={<Spinner />}>
      <AppComponent crm={sdk} />
    </Suspense>
  )
}
