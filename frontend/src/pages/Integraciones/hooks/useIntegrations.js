import { useState, useEffect, useCallback } from 'react'
import { useApi } from '../../../hooks/useApi'

export function useIntegrations() {
  const { api } = useApi()
  const [status, setStatus] = useState(null)
  const [available, setAvailable] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        api('GET', '/integration-center/status'),
        api('GET', '/integration-center/available'),
      ])
      setStatus(s)
      setAvailable(Array.isArray(a) ? a : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const connect = useCallback(async (provider) => {
    try {
      const res = await api('GET', `/integration-center/${provider}/auth-url`)
      if (res.url) {
        const w = window.open(res.url, 'oauth', 'width=600,height=700')
        return new Promise((resolve, reject) => {
          const handler = (e) => {
            if (e.data?.type === 'oauth-callback' && e.data?.provider === provider) {
              window.removeEventListener('message', handler)
              if (e.data.ok) {
                load()
                resolve(true)
              } else {
                reject(new Error(e.data.error || 'Error de conexión'))
              }
            }
          }
          window.addEventListener('message', handler)
          const checkClosed = setInterval(() => {
            if (w && w.closed) {
              clearInterval(checkClosed)
              window.removeEventListener('message', handler)
              load()
              resolve(w.closed)
            }
          }, 1000)
        })
      }
    } catch (e) {
      throw e
    }
  }, [api, load])

  const disconnect = useCallback(async (provider) => {
    await api('POST', `/integration-center/${provider}/disconnect`)
    await load()
  }, [api, load])

  const sync = useCallback(async (provider, entityType = 'productos', options = {}) => {
    const r = await api('POST', `/integration-center/${provider}/sync`, { entityType, options })
    await load()
    return r
  }, [api, load])

  const getHealth = useCallback(async (provider) => {
    return api('GET', `/integration-center/${provider}/health`)
  }, [api])

  const getLogs = useCallback(async (filters = {}) => {
    const qs = new URLSearchParams(filters).toString()
    return api('GET', `/integration-center/logs${qs ? '?' + qs : ''}`)
  }, [api])

  return {
    status, available, loading, error,
    connect, disconnect, sync, getHealth, getLogs,
    load,
  }
}
