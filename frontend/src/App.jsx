import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { Login }        from './pages/Login'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { Dashboard }    from './pages/Dashboard'
import { Clientes }     from './pages/Clientes'
import { Gastos }       from './pages/Gastos'
import { Productos }    from './pages/Productos'
import { Ventas }       from './pages/Ventas'
import { Caja }         from './pages/Caja'
import { POS }          from './pages/POS'
import { Presupuestos } from './pages/Presupuestos'
import { Pendientes, CtaCte } from './pages/PendientesCtaCte'
import { Transferencias } from './pages/Transferencias'
import { ListaRegalos, Auditoria, Reportes } from './pages/ListaRegalosAuditoriaReportes'
import { Proveedores } from './pages/Proveedores'
import { Chat }         from './pages/Chat'
import { Pipeline }     from './pages/Pipeline'
import { Usuarios, Config } from './pages/UsuariosConfig'
import { Sucursales } from './pages/Sucursales'
import RRHH from './pages/RRHH'
import Superadmin from './pages/Superadmin'

export default function App() {
  return (
    <Routes>
      <Route path="/app/superadmin" element={<Superadmin />} />
      <Route path="/app/login" element={<Login />} />
      <Route path="/app/forgot-password" element={<ForgotPassword />} />
      <Route path="/app/reset-password" element={<ResetPassword />} />
      <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        {/* ✅ All modules migrated */}
        <Route path="dashboard"      element={<Dashboard />} />
        <Route path="clientes"       element={<Clientes />} />
        <Route path="gastos"         element={<Gastos />} />
        <Route path="productos"      element={<Productos />} />
        <Route path="ventas"         element={<Ventas />} />
        <Route path="caja"           element={<Caja />} />
        <Route path="pos"            element={<POS />} />
        <Route path="presupuestos"   element={<Presupuestos />} />
        <Route path="pendientes"     element={<Pendientes />} />
        <Route path="ctacte"         element={<CtaCte />} />
        <Route path="transferencias" element={<Transferencias />} />
        <Route path="listabebe"      element={<ListaRegalos />} />
        <Route path="reportes"       element={<Reportes />} />
        <Route path="auditoria"      element={<Auditoria />} />
        <Route path="pipeline"       element={<Pipeline />} />
        <Route path="chat"           element={<Chat />} />
        <Route path="usuarios"       element={<Usuarios />} />
        <Route path="sucursales"     element={<Sucursales />} />
        <Route path="config"         element={<Config />} />
        <Route path="proveedores" element={<Proveedores />} />
        <Route path="rrhh" element={<RRHH />} />
      </Route>
      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  )
}
