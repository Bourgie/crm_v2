import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Dashboard } from '../pages/Dashboard'
import { useAuth, useApp } from '../store'

// ── Helpers ────────────────────────────────────────────────────
const withAuth = (component) => (
  <MemoryRouter initialEntries={['/app/dashboard']}>
    {component}
  </MemoryRouter>
)

const mockDashboard = (overrides = {}) => {
  const defaults = {
    kpis: {
      ventas_hoy: 45200, n_ventas_hoy: 8, ventas_mes: 312000,
      clientes_nuevos_mes: 12, pendientes_sin_despachar: 3, ctacte_vencidas: 1,
    },
    ventas_mes: [
      { fecha: '2025-06-01', total: 12000 },
      { fecha: '2025-06-02', total: 18500 },
      { fecha: '2025-06-03', total: 9800 },
    ],
    top_productos: [
      { nombre: 'Remera Básica M', cantidad: 24, total: 28800 },
      { nombre: 'Jean Slim 38', cantidad: 18, total: 43200 },
    ],
    top_clientes: [
      { nombre: 'María García', n_compras: 8, total: 45600 },
    ],
  }
  global.fetch = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ ...defaults, ...overrides }),
  })
}

// ── Dashboard tests ────────────────────────────────────────────
describe('Dashboard', () => {
  beforeEach(() => {
    useAuth.setState({ token: 'tok_123', me: { id: 'u1', nombre: 'Carlos', rol: 'admin' } })
    useApp.setState({ sucSesion: 's1', allSucs: [{ id: 's1', nombre: 'Centro' }] })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('shows loading spinner initially', () => {
    mockDashboard()
    render(withAuth(<Dashboard />))
    expect(document.querySelector('.spinner')).toBeInTheDocument()
  })

  it('shows greeting with user name', async () => {
    mockDashboard()
    render(withAuth(<Dashboard />))
    await waitFor(() => {
      expect(screen.getByText(/Carlos/i)).toBeInTheDocument()
    })
  })

  it('renders KPI cards with data', async () => {
    mockDashboard()
    render(withAuth(<Dashboard />))
    await waitFor(() => {
      expect(screen.getByText('$45.200')).toBeInTheDocument()
      expect(screen.getByText('8 transacciones')).toBeInTheDocument()
    })
  })

  it('shows pending orders count', async () => {
    mockDashboard()
    render(withAuth(<Dashboard />))
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument() // pendientes
    })
  })

  it('shows top productos', async () => {
    mockDashboard()
    render(withAuth(<Dashboard />))
    await waitFor(() => {
      expect(screen.getByText('Remera Básica M')).toBeInTheDocument()
      expect(screen.getByText('Jean Slim 38')).toBeInTheDocument()
    })
  })

  it('renders quick action buttons', async () => {
    mockDashboard()
    render(withAuth(<Dashboard />))
    await waitFor(() => {
      expect(screen.getByText(/nueva venta/i)).toBeInTheDocument()
      expect(screen.getByText(/ver caja/i)).toBeInTheDocument()
    })
  })

  it('shows empty state when no top productos', async () => {
    mockDashboard({ top_productos: [], ventas_mes: [] })
    render(withAuth(<Dashboard />))
    await waitFor(() => {
      expect(screen.getByText('Sin datos aún')).toBeInTheDocument()
    })
  })

  it('handles API error gracefully without crashing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    // Should not throw — Dashboard catches errors
    expect(() => render(withAuth(<Dashboard />))).not.toThrow()
  })
})

// ── Integration: auth flow ─────────────────────────────────────
describe('Auth integration', () => {
  beforeEach(() => {
    useAuth.setState({ token: null, me: null })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('isLoggedIn false → true after setting me', () => {
    expect(useAuth.getState().isLoggedIn()).toBe(false)
    useAuth.getState().setMe({ id: 'u1', nombre: 'Ana' })
    expect(useAuth.getState().isLoggedIn()).toBe(true)
  })

  it('isLoggedIn becomes false after logout', () => {
    useAuth.getState().setMe({ id: 'u1', nombre: 'Ana' })
    expect(useAuth.getState().isLoggedIn()).toBe(true)
    useAuth.getState().logout()
    expect(useAuth.getState().isLoggedIn()).toBe(false)
  })
})

// ── Integration: module access control ────────────────────────
describe('Module access control', () => {
  it('hasModule(x) true when modulos is null (all enabled)', () => {
    useApp.setState({ modulos: null })
    const { hasModule } = useApp.getState()
    expect(hasModule('ventas')).toBe(true)
    expect(hasModule('chat')).toBe(true)
    expect(hasModule('listabebe')).toBe(true)
  })

  it('hasModule blocks modules not in plan', () => {
    useApp.setState({ modulos: ['ventas', 'caja', 'clientes', 'productos'] })
    const { hasModule } = useApp.getState()
    expect(hasModule('ventas')).toBe(true)
    expect(hasModule('chat')).toBe(false)
    expect(hasModule('listabebe')).toBe(false)
    expect(hasModule('auditoria')).toBe(false)
  })

  it('switching plan updates module access', () => {
    useApp.setState({ modulos: ['ventas'] })
    expect(useApp.getState().hasModule('chat')).toBe(false)
    useApp.setState({ modulos: ['ventas', 'chat', 'auditoria'] })
    expect(useApp.getState().hasModule('chat')).toBe(true)
    expect(useApp.getState().hasModule('auditoria')).toBe(true)
  })
})

// ── Integration: offline queue + sync ─────────────────────────
import { useOffline } from '../store'

describe('Offline queue integration', () => {
  beforeEach(() => {
    useOffline.setState({ online: true, queue: [] })
  })

  it('queue accumulates multiple offline ops', () => {
    const { enqueue } = useOffline.getState()
    enqueue('POST', '/ventas', { total: 500 })
    enqueue('POST', '/ventas', { total: 1200 })
    enqueue('POST', '/clientes', { nombre: 'Juan' })
    expect(useOffline.getState().queue).toHaveLength(3)
  })

  it('removeOps clears specific entries', () => {
    const { enqueue, removeOps } = useOffline.getState()
    const op1 = enqueue('POST', '/ventas', { total: 500 })
    const op2 = enqueue('POST', '/clientes', { nombre: 'Ana' })
    removeOps([op1.id])
    expect(useOffline.getState().queue).toHaveLength(1)
    expect(useOffline.getState().queue[0].id).toBe(op2.id)
  })

  it('ops beyond 3 intentos should be discarded on requeue', () => {
    const { enqueue, removeOps, requeueFailed } = useOffline.getState()
    const op = enqueue('POST', '/ventas', { total: 100 })
    // Simulate 3 failed retries
    let current = { ...op, intentos: 2 }
    removeOps([op.id])
    requeueFailed([current])
    // intentos is now 3 — at limit
    expect(useOffline.getState().queue[0].intentos).toBe(3)
  })
})
