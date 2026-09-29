import { useState } from 'react'

const STATUS_CONFIG = {
  connected:    { badge: '🟢 Conectado', color: 'var(--ok)', btnLabel: 'Sincronizar', btnClass: 'btn-primary' },
  disconnected: { badge: '⚪ Desconectado', color: 'var(--mu)', btnLabel: 'Conectar', btnClass: 'btn-accent' },
  error:        { badge: '🔴 Error', color: 'var(--bad)', btnLabel: 'Reconectar', btnClass: 'btn-accent' },
  connecting:   { badge: '🟡 Conectando…', color: 'var(--warn)', btnLabel: '…', btnClass: 'btn-secondary' },
}

export function IntegrationCard({ provider, info, icon, displayName, configBased, onConnect, onDisconnect, onSync }) {
  const [busy, setBusy] = useState(false)
  const state = info || {}
  const status = state.status || 'disconnected'
  const baseConfig = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected
  // Para integraciones configuradas por empresa (ARCA), "Conectar" valida la
  // configuración cargada en Configuración → ARCA.
  const config = (configBased && status === 'disconnected')
    ? { ...baseConfig, btnLabel: 'Verificar configuración' }
    : baseConfig

  // El backend devuelve camelCase; dejamos fallback a snake_case.
  const externalAccountId = state.externalAccountId || state.external_account_id
  const lastSync = state.lastSync || state.last_sync
  const lastError = state.lastError || state.last_error
  const healthStatus = state.healthStatus || state.health_status

  async function handleAction() {
    if (busy) return
    setBusy(true)
    try {
      if (status === 'disconnected' || status === 'error') {
        await onConnect()
      } else if (status === 'connected') {
        await onSync()
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar ' + displayName + '?')) return
    setBusy(true)
    try { await onDisconnect() } finally { setBusy(false) }
  }

  return (
    <div style={{
      background: 'var(--sf)', borderRadius: 12, border: '1px solid var(--bd)',
      padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
      minWidth: 280, maxWidth: 320, flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>{icon || '🔌'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{displayName || provider}</div>
          <span style={{
            fontSize: 12, fontWeight: 600, color: config.color,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            {config.badge}
          </span>
        </div>
      </div>

      {state.connected && externalAccountId && (
        <div style={{ fontSize: 12, color: 'var(--mu)' }}>
          Cuenta: {externalAccountId}
        </div>
      )}

      {lastSync && (
        <div style={{ fontSize: 11, color: 'var(--mu)' }}>
          Última sync: {new Date(lastSync).toLocaleString('es-AR')}
        </div>
      )}

      {configBased && state.configPendiente && (
        <div style={{ fontSize: 11, color: 'var(--warn)', padding: '6px 8px', background: 'rgba(234,179,8,.10)', borderRadius: 6 }}>
          Falta {state.configPendiente === 'cuit' ? 'el CUIT' : 'el Access Token'}.
          Cargalo en Configuración → ARCA.
        </div>
      )}

      {lastError && state.connected === false && (
        <div style={{ fontSize: 11, color: 'var(--bad)', padding: '6px 8px', background: 'rgba(239,68,68,.08)', borderRadius: 6 }}>
          {String(lastError).substring(0, 100)}
        </div>
      )}

      {healthStatus && healthStatus !== 'unknown' && (
        <div style={{ fontSize: 11, color: healthStatus === 'healthy' ? 'var(--ok)' : 'var(--bad)' }}>
          API: {healthStatus === 'healthy' ? '✅ Operativa' : '❌ Caída'}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          className={`btn btn-sm ${config.btnClass}`}
          onClick={handleAction}
          disabled={busy}
          style={{ flex: 1 }}
        >
          {busy ? '⏳' : config.btnLabel}
        </button>
        {status === 'connected' && !configBased && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleDisconnect}
            disabled={busy}
            title="Desconectar"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
