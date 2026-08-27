import { useEffect, useCallback } from 'react'
import { useAuth, useOffline, useToast } from '../store'
import { apiFetch } from './useApi'

export function useOfflineManager() {
  const { me, logout } = useAuth()
  const { online, queue, setOnline, removeOps, requeueFailed } = useOffline()
  const { toast } = useToast()

  const syncQueue = useCallback(async () => {
    if (!online || queue.length === 0) return
    const batch = queue.slice(0, 20)
    removeOps(batch.map((op) => op.id))

    try {
      const r = await apiFetch('POST', '/sync/push', { ops: batch }, logout)
      const failed = (r.results || []).filter((res) => !res.ok)

      if (failed.length > 0) {
        const failedOps = batch.filter((op) => failed.some((f) => f.id === op.id) && (op.intentos || 0) < 3)
        if (failedOps.length) requeueFailed(failedOps)
      }

      const ok = batch.length - failed.length
      if (ok > 0) toast(`✅ ${ok} operación(es) sincronizada(s)`, 'ok')
    } catch {
      requeueFailed(batch)
    }
  }, [online, queue, logout])

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      toast('✅ Conexión restaurada', 'ok')
      syncQueue()
    }
    const handleOffline = () => {
      setOnline(false)
      toast('📵 Sin conexión — las ventas se guardan localmente', '')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [syncQueue])

  // Periodic sync every 30s + ping every 15s
  useEffect(() => {
    if (!me) return

    const syncTimer = setInterval(() => {
      if (online && queue.length > 0) syncQueue()
    }, 30_000)

    const pingTimer = setInterval(async () => {
      try {
        await apiFetch('GET', '/sync/status', null, logout)
        if (!online) { setOnline(true); toast('✅ Conexión restaurada', 'ok'); syncQueue() }
      } catch {
        if (online) setOnline(false)
      }
    }, 15_000)

    return () => { clearInterval(syncTimer); clearInterval(pingTimer) }
  }, [me, online, queue, syncQueue, logout])

  return { online, pendingCount: queue.length, syncQueue }
}
