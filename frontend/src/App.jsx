import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { Dashboard } from './pages/Dashboard'

const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })))
const Signup = lazy(() => import('./pages/Signup').then(m => ({ default: m.Signup })))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then(m => ({ default: m.ForgotPassword })))
const ResetPassword = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })))
const Clientes = lazy(() => import('./pages/Clientes').then(m => ({ default: m.Clientes })))
const Gastos = lazy(() => import('./pages/Gastos').then(m => ({ default: m.Gastos })))
const Productos = lazy(() => import('./pages/Productos').then(m => ({ default: m.Productos })))
const Ventas = lazy(() => import('./pages/Ventas').then(m => ({ default: m.Ventas })))
const Caja = lazy(() => import('./pages/Caja').then(m => ({ default: m.Caja })))
const POS = lazy(() => import('./pages/POS').then(m => ({ default: m.POS })))
const Presupuestos = lazy(() => import('./pages/Presupuestos').then(m => ({ default: m.Presupuestos })))
const Pendientes = lazy(() => import('./pages/PendientesCtaCte').then(m => ({ default: m.Pendientes })))
const CtaCte = lazy(() => import('./pages/PendientesCtaCte').then(m => ({ default: m.CtaCte })))
const Transferencias = lazy(() => import('./pages/Transferencias').then(m => ({ default: m.Transferencias })))
const ListaRegalos = lazy(() => import('./pages/ListaRegalosAuditoriaReportes').then(m => ({ default: m.ListaRegalos })))
const Auditoria = lazy(() => import('./pages/ListaRegalosAuditoriaReportes').then(m => ({ default: m.Auditoria })))
const Reportes = lazy(() => import('./pages/ListaRegalosAuditoriaReportes').then(m => ({ default: m.Reportes })))
const Proveedores = lazy(() => import('./pages/Proveedores').then(m => ({ default: m.Proveedores })))
const Chat = lazy(() => import('./pages/Chat').then(m => ({ default: m.Chat })))
const Pipeline = lazy(() => import('./pages/Pipeline').then(m => ({ default: m.Pipeline })))
const Usuarios = lazy(() => import('./pages/UsuariosConfig').then(m => ({ default: m.Usuarios })))
const Config = lazy(() => import('./pages/UsuariosConfig').then(m => ({ default: m.Config })))
const Setup2FA = lazy(() => import('./pages/Setup2FA').then(m => ({ default: m.Setup2FA })))
const Sucursales = lazy(() => import('./pages/Sucursales').then(m => ({ default: m.Sucursales })))
const RRHH = lazy(() => import('./pages/RRHH'))
const Superadmin = lazy(() => import('./pages/Superadmin'))

// App ecosystem
const AppShell = lazy(() => import('./components/AppShell'))
const Marketplace = lazy(() => import('./pages/Marketplace'))

function L({ children }) {
  return <Suspense fallback={<div className="p-8 text-center text-gray-400">Cargando...</div>}>{children}</Suspense>
}

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<L><Superadmin /></L>} />
      <Route path="/app/superadmin" element={<Navigate to="/admin" replace />} />
      <Route path="/app/login" element={<L><Login /></L>} />
      <Route path="/app/signup" element={<L><Signup /></L>} />
      <Route path="/app/forgot-password" element={<L><ForgotPassword /></L>} />
      <Route path="/app/reset-password" element={<L><ResetPassword /></L>} />
      <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard"      element={<Dashboard />} />
        <Route path="clientes"       element={<L><Clientes /></L>} />
        <Route path="gastos"         element={<L><Gastos /></L>} />
        <Route path="productos"      element={<L><Productos /></L>} />
        <Route path="ventas"         element={<L><Ventas /></L>} />
        <Route path="caja"           element={<L><Caja /></L>} />
        <Route path="pos"            element={<L><POS /></L>} />
        <Route path="presupuestos"   element={<L><Presupuestos /></L>} />
        <Route path="pendientes"     element={<L><Pendientes /></L>} />
        <Route path="ctacte"         element={<L><CtaCte /></L>} />
        <Route path="transferencias" element={<L><Transferencias /></L>} />
        <Route path="listabebe"      element={<L><ListaRegalos /></L>} />
        <Route path="reportes"       element={<L><Reportes /></L>} />
        <Route path="auditoria"      element={<L><Auditoria /></L>} />
        <Route path="pipeline"       element={<L><Pipeline /></L>} />
        <Route path="chat"           element={<L><Chat /></L>} />
        <Route path="usuarios"       element={<L><Usuarios /></L>} />
        <Route path="sucursales"     element={<L><Sucursales /></L>} />
        <Route path="config"         element={<L><Config /></L>} />
        <Route path="2fa"            element={<L><Setup2FA /></L>} />
        <Route path="proveedores"    element={<L><Proveedores /></L>} />
        <Route path="rrhh"           element={<L><RRHH /></L>} />
        {/* App ecosystem routes */}
        <Route path="apps/:slug"     element={<L><AppShell /></L>} />
        <Route path="marketplace"    element={<L><Marketplace /></L>} />
      </Route>
      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  )
}
