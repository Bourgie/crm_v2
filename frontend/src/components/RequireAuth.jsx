import { Navigate } from 'react-router-dom'
import { useAuth } from '../store'

export function RequireAuth({ children }) {
  const { token, me } = useAuth()
  if (!token || !me) return <Navigate to="/app/login" replace />
  return children
}
