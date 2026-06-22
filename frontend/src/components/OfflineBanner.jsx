import { useOffline } from '../store'

export function OfflineBanner() {
  const { online, queue } = useOffline()

  if (online && queue.length === 0) return null

  return (
    <div className={`offline-banner ${online && queue.length > 0 ? 'syncing' : ''}`}>
      {!online
        ? `📵 Sin conexión${queue.length > 0 ? ` · ${queue.length} operación(es) pendiente(s)` : ''} — se sincronizará al reconectarse`
        : `🔄 Sincronizando ${queue.length} operación(es)...`}
    </div>
  )
}
