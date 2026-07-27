import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../store'

export function RequireAuth({ children }) {
  const { token, me, setToken, setMe } = useAuth()
  const [booting, setBooting] = useState(!token && !me)

  useEffect(() => {
    if (token && me) { setBooting(false); return }
    // Try to restore session via httpOnly cookie (auto-sent with credentials: 'include')
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.token && data.user) {
          setToken(data.token)
          setMe(data.user)
        }
      })
      .catch(() => {})
      .finally(() => setBooting(false))
  }, [])

  if (booting) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:14,color:'var(--mu)' }}>Verificando sesión...</div>
  if (!token || !me) return <Navigate to="/app/login" replace />
  return children
}
