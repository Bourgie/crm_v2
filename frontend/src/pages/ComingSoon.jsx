// Placeholder shown while a module is being migrated to React
export function ComingSoon({ title, icon }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: 300, gap: 16, color: 'var(--mu)'
    }}>
      <div style={{ fontSize: 48 }}>{icon || '🚧'}</div>
      <h2 style={{ color: 'var(--tx)' }}>{title || 'Módulo en construcción'}</h2>
      <p style={{ fontSize: 14, textAlign: 'center', maxWidth: 360 }}>
        Este módulo estará disponible próximamente en la nueva interfaz.
      </p>
    </div>
  )
}
