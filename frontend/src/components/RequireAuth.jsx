import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../store'

export function RequireAuth({ children }) {
  const { me, setMe } = useAuth()
  const [booting, setBooting] = useState(!me)

  useEffect(() => {
    if (me) { setBooting(false); return }
    // Restore session via httpOnly cookie (auto-sent with credentials: 'include')
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.user) {
          setMe(data.user)
        }
      })
      .catch(() => {})
      .finally(() => setBooting(false))
  }, [])

  if (booting) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:14,color:'var(--mu)' }}>Verificando sesión...</div>
  if (!me) return <Navigate to="/app/login" replace />
  return children
}
