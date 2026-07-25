// frontend.jsx — Hello World test app
// Recibe `crm` como prop del AppShell
import React, { useState, useEffect } from 'react'

export default function HelloWorldApp({ crm }) {
  const [ping, setPing] = useState(null)
  const [config, setConfig] = useState({})
  const [logs, setLogs] = useState([])
  const [newConfigKey, setNewConfigKey] = useState('')
  const [newConfigVal, setNewConfigVal] = useState('')
  const [newLogMsg, setNewLogMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (crm) loadData()
  }, [crm])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [pingRes, configRes, logsRes] = await Promise.all([
        crm.api.get('/ping'),
        crm.api.get('/config'),
        crm.api.get('/logs'),
      ])
      setPing(pingRes)
      setConfig(configRes)
      setLogs(logsRes)
    } catch (err) {
      setError(err.message || 'Error cargando datos')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetConfig() {
    if (!newConfigKey) return
    try {
      await crm.api.put('/config', { key: newConfigKey, value: newConfigVal })
      setNewConfigKey('')
      setNewConfigVal('')
      loadData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAddLog() {
    if (!newLogMsg) return
    try {
      await crm.api.post('/log', { mensaje: newLogMsg })
      setNewLogMsg('')
      loadData()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!crm) return null
  if (loading) return <div className="p-8 text-center text-gray-400">Cargando app...</div>
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          👋 Hello World App
        </h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>
          App de prueba — verifica que el ecosistema de apps funciona.
        </p>
      </div>

      {ping && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
          padding: 16, marginBottom: 16
        }}>
          <strong style={{ color: '#166534' }}>✓ Backend responde</strong>
          <pre style={{ fontSize: 12, marginTop: 8, color: '#374151' }}>
            {JSON.stringify(ping, null, 2)}
          </pre>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>⚙️ Config (scoped)</h3>
          <pre style={{ fontSize: 12, color: '#374151', marginBottom: 12, maxHeight: 120, overflow: 'auto' }}>
            {JSON.stringify(config, null, 2)}
          </pre>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newConfigKey}
              onChange={e => setNewConfigKey(e.target.value)}
              placeholder="Key"
              style={{ flex: 1, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
            />
            <input
              value={newConfigVal}
              onChange={e => setNewConfigVal(e.target.value)}
              placeholder="Value"
              style={{ flex: 1, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
            />
            <button
              onClick={handleSetConfig}
              style={{ padding: '6px 14px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              Guardar
            </button>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📝 Logs (DB de app)</h3>
          <div style={{ maxHeight: 120, overflow: 'auto', marginBottom: 12 }}>
            {logs.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9ca3af' }}>Sin logs aún.</p>
            ) : (
              logs.map(l => (
                <div key={l.id} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <span style={{ color: '#9ca3af' }}>{new Date(l.fecha).toLocaleTimeString()}</span>
                  {' '}{l.mensaje}
                </div>
              ))
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newLogMsg}
              onChange={e => setNewLogMsg(e.target.value)}
              placeholder="Mensaje..."
              style={{ flex: 1, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
              onKeyDown={e => e.key === 'Enter' && handleAddLog()}
            />
            <button
              onClick={handleAddLog}
              style={{ padding: '6px 14px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              Agregar
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>🔌 SDK Disponible</h3>
        <pre style={{ fontSize: 12, color: '#475569' }}>
{`crm.api.get('/ping')
crm.api.get('/config')
crm.api.post('/log', { mensaje: 'test' })
crm.config.get(key)
crm.config.set(key, value)
crm.store.useAuth   → Zustand store
crm.store.useApp    → Zustand store
crm.navigate(path)  → Navegar
crm.events.on(event, handler)`}
        </pre>
      </div>
    </div>
  )
}
