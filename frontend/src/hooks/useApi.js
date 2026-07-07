import { useAuth, useOffline, useToast } from '../store'

// Endpoints that can be queued when offline
const QUEUEABLE = [
  { method: 'POST', pattern: /^\/ventas$/ },
  { method: 'POST', pattern: /^\/caja\/movimiento$/ },
  { method: 'POST', pattern: /^\/clientes$/ },
  { method: 'PUT',  pattern: /^\/clientes\// },
  { method: 'POST', pattern: /^\/pendientes$/ },
  { method: 'POST', pattern: /^\/productos\/[^/]+\/stock$/ },
]

function canQueue(method, path) {
  return QUEUEABLE.some(
    (r) => r.method === method.toUpperCase() && r.pattern.test(path)
  )
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'))
  return m ? m[1] : null
}

// Core fetch — used by the hook and standalone
export async function apiFetch(method, path, body, token, onLogout) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + token,
  }
  if (method.toUpperCase() !== 'GET') {
    const csrf = getCookie('csrf-token')
    if (csrf) headers['x-csrf-token'] = csrf
  }
  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)

  const r = await fetch('/api' + path, opts)

  if (r.status === 401 || r.status === 403) {
    if (onLogout) onLogout()
    const msg = r.status === 403 ? 'Sin permisos — volvé a iniciar sesión' : 'Sesión expirada'
    throw new Error(msg)
  }
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: 'Error del servidor' }))
    throw new Error(e.error || 'Error')
  }
  return r.json()
}

// React hook — use inside components
export function useApi() {
  const { token, logout } = useAuth()
  const { online, enqueue } = useOffline()
  const { toast } = useToast()

  async function api(method, path, body) {
    // GET: always needs network
    if (method.toUpperCase() === 'GET') {
      if (!online) throw new Error('Sin conexión')
      return apiFetch(method, path, body, token, logout)
    }

    // Writes: try network, queue if offline
    try {
      return await apiFetch(method, path, body, token, logout)
    } catch (err) {
      if (canQueue(method, path) && !online) {
        const op = enqueue(method, path, body)
        toast(`📵 Sin conexión — operación encolada`, '')
        return { ok: true, id: op.id, offline: true, queued: true }
      }
      throw err
    }
  }

  return { api }
}

// Standalone (non-hook) version for use outside components
export function createApi(token, logout, online, enqueue) {
  return async function api(method, path, body) {
    if (method.toUpperCase() === 'GET') {
      if (!online) throw new Error('Sin conexión')
      return apiFetch(method, path, body, token, logout)
    }
    try {
      return await apiFetch(method, path, body, token, logout)
    } catch (err) {
      if (canQueue(method, path) && !online) {
        enqueue(method, path, body)
        throw new Error('offline-queued')
      }
      throw err
    }
  }
}
