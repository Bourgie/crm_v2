import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Login } from '../pages/Login'
import { useAuth, useApp } from '../store'

// Wrap with router (Login uses useNavigate)
const renderLogin = () => render(<MemoryRouter><Login /></MemoryRouter>)

const mockLoginSuccess = (user = { id: 'u1', nombre: 'Admin', rol: 'admin' }, sucs = [{ id: 's1', nombre: 'Centro' }]) => {
  global.fetch = vi.fn()
    // First call: /api/auth/login
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'tok_abc', user }) })
    // Second call: /api/sucursales
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => sucs })
    // Subsequent calls: /api/config, /api/productos, /api/clientes
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
}

const mockLoginFail = (errorMsg = 'Credenciales inválidas') => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false, status: 401, json: async () => ({ error: errorMsg }),
  })
}

describe('Login page', () => {
  beforeEach(() => {
    useAuth.setState({ token: null, me: null })
    useApp.setState({ allSucs: [], sucSesion: null })
    localStorage.clear()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders login form with all fields', () => {
    renderLogin()
    expect(screen.getByPlaceholderText(/código de empresa/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/tu usuario/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/tu contraseña/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeInTheDocument()
  })

  it('renders FlexCRM branding', () => {
    renderLogin()
    expect(screen.getByText('Flex')).toBeInTheDocument()
    expect(screen.getByText('CRM')).toBeInTheDocument()
  })

  it('shows loading text while submitting', async () => {
    // Make fetch hang so we can inspect the loading state
    let resolveFetch
    global.fetch = vi.fn().mockImplementationOnce(() =>
      new Promise((res) => { resolveFetch = () => res({ ok: true, status: 200, json: async () => ({ token: 'tok', user: { id: 'u1', nombre: 'Admin', rol: 'admin' } }) }) })
    ).mockResolvedValue({ ok: true, status: 200, json: async () => ([]) })

    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/tu usuario/i), 'admin')
    await user.type(screen.getByPlaceholderText(/tu contraseña/i), '123456')

    // Don't await — click and immediately check loading state
    const clickPromise = user.click(screen.getByRole('button', { name: /ingresar/i }))
    await waitFor(() => {
      expect(screen.getByText(/ingresando/i)).toBeInTheDocument()
    })
    resolveFetch()
    await clickPromise
  })

  it('shows error message on failed login', async () => {
    mockLoginFail('Usuario o contraseña incorrectos')
    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/tu usuario/i), 'wrong')
    await user.type(screen.getByPlaceholderText(/tu contraseña/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    await waitFor(() => {
      expect(screen.getByText(/usuario o contraseña incorrectos/i)).toBeInTheDocument()
    })
  })

  it('shows sucursal selector when multiple sucursales', async () => {
    mockLoginSuccess({ id: 'u1', nombre: 'Admin', rol: 'admin' }, [
      { id: 's1', nombre: 'Centro' },
      { id: 's2', nombre: 'Norte' },
    ])
    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/tu usuario/i), 'admin')
    await user.type(screen.getByPlaceholderText(/tu contraseña/i), '123456')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    await waitFor(() => {
      expect(screen.getByText('Centro')).toBeInTheDocument()
      expect(screen.getByText('Norte')).toBeInTheDocument()
      expect(screen.getByText(/seleccioná tu sucursal/i)).toBeInTheDocument()
    })
  })

  it('sets token in auth store on successful login', async () => {
    mockLoginSuccess()
    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/tu usuario/i), 'admin')
    await user.type(screen.getByPlaceholderText(/tu contraseña/i), '123456')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    await waitFor(() => {
      expect(useAuth.getState().token).toBe('tok_abc')
    })
  })

  it('sends empresa code from field', async () => {
    mockLoginSuccess()
    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/código de empresa/i), 'miempresa')
    await user.type(screen.getByPlaceholderText(/tu usuario/i), 'admin')
    await user.type(screen.getByPlaceholderText(/tu contraseña/i), '123456')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    const call = global.fetch.mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.empresa).toBe('miempresa')
  })

  it('defaults empresa to "default" when empty', async () => {
    mockLoginSuccess()
    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/tu usuario/i), 'admin')
    await user.type(screen.getByPlaceholderText(/tu contraseña/i), '123456')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    const call = global.fetch.mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.empresa).toBe('default')
  })

  it('shows error when no sucursales available', async () => {
    mockLoginSuccess({ id: 'u1', nombre: 'Admin', rol: 'cajero', suc_sesiones_permitidas: ['s_nonexistent'] }, [])
    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/tu usuario/i), 'cajero')
    await user.type(screen.getByPlaceholderText(/tu contraseña/i), '123')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    await waitFor(() => {
      expect(screen.getByText(/no tenés sucursales asignadas/i)).toBeInTheDocument()
    })
  })
})
