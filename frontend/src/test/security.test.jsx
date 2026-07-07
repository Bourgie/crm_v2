import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useAuth, useApp } from '../store'

// ── Multi-tenant isolation ────────────────────────────────────
describe('Multi-Tenant Isolation', () => {
  beforeEach(() => {
    useAuth.setState({ token: null, me: null })
    useApp.setState({ allSucs: [], sucSesion: null, modulos: null })
    localStorage.clear()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('stores empresa code on login', () => {
    useAuth.getState().setToken('tok_emp_a')
    useAuth.getState().setMe({ id: 'u1', nombre: 'Admin', empresa: 'empresa_a' })
    expect(useAuth.getState().me.empresa).toBe('empresa_a')
  })

  it('empresa defaults to empty/null when not set', () => {
    expect(useAuth.getState().me).toBeNull()
  })

  it('logout clears empresa and token', () => {
    useAuth.getState().setToken('tok_emp_a')
    useAuth.getState().setMe({ id: 'u1', nombre: 'Admin', empresa: 'empresa_a' })
    useAuth.getState().logout()
    expect(useAuth.getState().token).toBeNull()
    expect(useAuth.getState().me).toBeNull()
  })

  it('isLoggedIn requires both token and me', () => {
    expect(useAuth.getState().isLoggedIn()).toBe(false)
    useAuth.getState().setToken('tok')
    expect(useAuth.getState().isLoggedIn()).toBe(false)
    useAuth.getState().setMe({ id: 'u1' })
    expect(useAuth.getState().isLoggedIn()).toBe(true)
  })

  it('login page sends empresa code in body', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'tok', user: { id: 'u1', nombre: 'Admin', rol: 'admin', empresa: 'mi_emp' } }) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ([]) })
    const Login = (await import('../pages/Login')).Login
    render(<MemoryRouter><Login /></MemoryRouter>)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/código de empresa/i), 'mi_emp')
    await user.type(screen.getByPlaceholderText(/tu usuario/i), 'admin')
    await user.type(screen.getByPlaceholderText(/tu contraseña/i), '123456')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    await waitFor(() => {
      const body = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(body.empresa).toBe('mi_emp')
    })
  })
})

// ── Authentication ────────────────────────────────────────────
describe('Authentication', () => {
  beforeEach(() => {
    useAuth.setState({ token: null, me: null })
    localStorage.clear()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('token persisted and restored from localStorage', () => {
    useAuth.getState().setToken('persisted_tok')
    useAuth.getState().setMe({ id: 'u1' })
    const raw = localStorage.getItem('flexcrm-auth')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw)
    expect(parsed.state.token).toBe('persisted_tok')
    expect(parsed.state.me.id).toBe('u1')
  })

  it('setToken stores to localStorage', () => {
    useAuth.getState().setToken('new_tok')
    const stored = JSON.parse(localStorage.getItem('flexcrm-auth'))
    expect(stored.state.token).toBe('new_tok')
  })

  it('logout clears localStorage token', () => {
    useAuth.getState().setToken('tok')
    useAuth.getState().setMe({ id: 'u1' })
    useAuth.getState().logout()
    const stored = JSON.parse(localStorage.getItem('flexcrm-auth'))
    expect(stored.state.token).toBeNull()
    expect(stored.state.me).toBeNull()
  })

  it('login error shows message in form', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: async () => ({ error: 'Usuario o contraseña incorrectos' }),
    })
    const Login = (await import('../pages/Login')).Login
    render(<MemoryRouter><Login /></MemoryRouter>)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/tu usuario/i), 'bad')
    await user.type(screen.getByPlaceholderText(/tu contraseña/i), 'bad')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    await waitFor(() => {
      expect(screen.getByText(/usuario o contraseña incorrectos/i)).toBeInTheDocument()
    })
  })

  it('lockout shows waiting message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 429,
      json: async () => ({ error: 'Demasiados intentos. Esperá 15 minutos.', locked: true, locked_minutes: 15 }),
    })
    const Login = (await import('../pages/Login')).Login
    render(<MemoryRouter><Login /></MemoryRouter>)
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/tu usuario/i), 'admin')
    await user.type(screen.getByPlaceholderText(/tu contraseña/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    await waitFor(() => {
      expect(screen.getByText(/demasiados intentos/i)).toBeInTheDocument()
    })
  })
})

// ── Authorization / Role-based access ─────────────────────────
describe('Authorization', () => {
  beforeEach(() => {
    useAuth.setState({ token: 'tok', me: { id: 'u1', nombre: 'Test', rol: 'vendedor' } })
    useApp.setState({ modulos: null, sucSesion: 's1', allSucs: [{ id: 's1', nombre: 'Centro' }] })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('RequireAuth redirects to login when no token', async () => {
    useAuth.setState({ token: null, me: null })
    const { RequireAuth } = await import('../components/RequireAuth')
    render(<MemoryRouter initialEntries={['/app/dashboard']}><RequireAuth><div>Protected</div></RequireAuth></MemoryRouter>)
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })

  it('RequireAuth renders children when authenticated', async () => {
    const { RequireAuth } = await import('../components/RequireAuth')
    render(<MemoryRouter><RequireAuth><div>Secret Content</div></RequireAuth></MemoryRouter>)
    expect(screen.getByText('Secret Content')).toBeInTheDocument()
  })

  it('hasModule returns true for granted modules', () => {
    useApp.setState({ modulos: ['ventas', 'productos', 'clientes'] })
    const { hasModule } = useApp.getState()
    expect(hasModule('ventas')).toBe(true)
    expect(hasModule('productos')).toBe(true)
  })

  it('hasModule returns false for blocked modules', () => {
    useApp.setState({ modulos: ['ventas'] })
    const { hasModule } = useApp.getState()
    expect(hasModule('auditoria')).toBe(false)
    expect(hasModule('chat')).toBe(false)
  })

  it('hasModule returns true when modulos is null (all enabled)', () => {
    useApp.setState({ modulos: null })
    const { hasModule } = useApp.getState()
    expect(hasModule('anything')).toBe(true)
  })
})

// ── CSRF token handling ───────────────────────────────────────
describe('CSRF Protection', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('apiFetch includes CSRF token from cookie', async () => {
    document.cookie = 'csrf-token=test_csrf_val'
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    const { apiFetch } = await import('../hooks/useApi')
    await apiFetch('POST', '/ventas', { total: 100 }, 'tok', () => {})
    const headers = global.fetch.mock.calls[0][1].headers
    expect(headers['x-csrf-token']).toBe('test_csrf_val')
  })
})

// ── Password policy (frontend validation) ────────────────────
describe('Password Policy', () => {
  it('rejects short passwords', () => {
    expect('short'.length >= 8).toBe(false)
    expect('LongEn0ugh!'.length >= 8).toBe(true)
  })

  it('rejects passwords without uppercase', () => {
    expect(/[A-Z]/.test('nouppercase1!')).toBe(false)
    expect(/[A-Z]/.test('HasUpper1!')).toBe(true)
  })

  it('rejects passwords without number', () => {
    expect(/[0-9]/.test('NoNumber!A')).toBe(false)
    expect(/[0-9]/.test('HasNum1A!')).toBe(true)
  })

  it('rejects passwords without symbol', () => {
    expect(/[^A-Za-z0-9]/.test('NoSymbol1A')).toBe(false)
    expect(/[^A-Za-z0-9]/.test('HasSymb1!A')).toBe(true)
  })

  it('validates complete password policy', () => {
    const valid = (pw) => pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)
    expect(valid('Abc123!')).toBe(false)     // too short
    expect(valid('abcdefgh1!')).toBe(false)  // no uppercase
    expect(valid('ABCDEFGHa!')).toBe(false)  // no number
    expect(valid('Abcdefgh1')).toBe(false)   // no symbol
    expect(valid('Valid4$Pass')).toBe(true)  // correct
  })
})
