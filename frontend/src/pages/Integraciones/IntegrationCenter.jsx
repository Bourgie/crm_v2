import { useState } from 'react'
import { useIntegrations } from './hooks/useIntegrations'
import { IntegrationCard } from './IntegrationCard'
import { PageHeader, Loader } from '../../components/UI'
import { useToast } from '../../store'

export function IntegrationCenter() {
  const { status, available, loading, error, connect, disconnect, sync } = useIntegrations()
  const { toast } = useToast()
  const [syncStatus, setSyncStatus] = useState({})

  if (loading) return <Loader />
  if (error) return <PageHeader title="Integraciones" subtitle={`Error: ${error}`} />

  const integraciones = status?.integraciones || {}
  const totalConectadas = status?.conectadas || 0
  const total = status?.total || 0

  async function handleConnect(provider) {
    try {
      await connect(provider)
      toast(`${provider} conectado exitosamente`, 'ok')
    } catch (e) {
      toast(`Error conectando ${provider}: ${e.message}`, 'err')
    }
  }

  async function handleDisconnect(provider) {
    try {
      await disconnect(provider)
      toast(`${provider} desconectado`, 'ok')
    } catch (e) {
      toast(`Error: ${e.message}`, 'err')
    }
  }

  async function handleSync(provider) {
    try {
      setSyncStatus(s => ({ ...s, [provider]: 'syncing' }))
      await sync(provider)
      setSyncStatus(s => ({ ...s, [provider]: 'done' }))
      toast(`${provider}: sincronización completada`, 'ok')
    } catch (e) {
      setSyncStatus(s => ({ ...s, [provider]: 'error' }))
      toast(`Error: ${e.message}`, 'err')
    }
  }

  return (
    <div>
      <PageHeader
        title="Integraciones"
        subtitle={`${totalConectadas} de ${total} conectadas`}
      />

      {available.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: 'var(--mu)',
          background: 'var(--sf)', borderRadius: 12, border: '1px solid var(--bd)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔌</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Sin integraciones disponibles</div>
          <div style={{ fontSize: 13 }}>Contactá al administrador de la plataforma para habilitar integraciones.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {available.map(provider => (
            <IntegrationCard
              key={provider.name}
              provider={provider.name}
              displayName={provider.displayName}
              icon={provider.icon}
              info={integraciones[provider.name]}
              onConnect={() => handleConnect(provider.name)}
              onDisconnect={() => handleDisconnect(provider.name)}
              onSync={() => handleSync(provider.name)}
            />
          ))}
        </div>
      )}

      {total > 0 && (
        <div style={{
          marginTop: 24, padding: '12px 16px', background: 'var(--sf)',
          borderRadius: 10, border: '1px solid var(--bd)', fontSize: 12, color: 'var(--mu)',
        }}>
          Las integraciones se habilitan desde el panel de SuperAdmin.<br />
          Solo administradores pueden conectar o desconectar integraciones.
        </div>
      )}
    </div>
  )
}
