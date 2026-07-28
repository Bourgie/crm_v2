import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { apiFetch } from '../hooks/useApi'
import { useAuth, useOffline } from '../store'

const mockFetch = (status, body) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  })
}

const mockFetchFail = () => {
  global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
}

// ── apiFetch ───────────────────────────────────────────────────
describe('apiFetch', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('makes GET request with correct headers', async () => {
    mockFetch(200, { ok: true })
    await apiFetch('GET', '/test', null, () => {})
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    )
  })

  it('returns parsed JSON on success', async () => {
    mockFetch(200, { items: [1, 2, 3] })
    const result = await apiFetch('GET', '/items', null, () => {})
    expect(result).toEqual({ items: [1, 2, 3] })
  })

  it('sends body for POST requests', async () => {
    mockFetch(200, { id: 'abc' })
    await apiFetch('POST', '/ventas', { total: 500 }, () => {})
    const call = global.fetch.mock.calls[0]
    expect(call[1].body).toBe(JSON.stringify({ total: 500 }))
    expect(call[1].method).toBe('POST')
  })

  it('calls onLogout and throws on 401', async () => {
    mockFetch(401, { error: 'Unauthorized' })
    const onLogout = vi.fn()
    await expect(apiFetch('GET', '/protected', null, onLogout))
      .rejects.toThrow('Sesión expirada')
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('throws with error message on non-ok response', async () => {
    mockFetch(400, { error: 'Datos inválidos' })
    await expect(apiFetch('POST', '/clientes', {}, () => {}))
      .rejects.toThrow('Datos inválidos')
  })

  it('throws generic error when response has no error field', async () => {
    mockFetch(500, {})
    await expect(apiFetch('GET', '/crash', null, () => {}))
      .rejects.toThrow('Error')
  })

  it('propagates network errors', async () => {
    mockFetchFail()
    await expect(apiFetch('GET', '/offline', null, () => {}))
      .rejects.toThrow('Network error')
  })
})

// ── Offline queueing via useApi ────────────────────────────────
describe('offline queueing', () => {
  beforeEach(() => {
    useAuth.setState({ me: { id: 'u1' } })
    useOffline.setState({ online: false, queue: [] })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    useOffline.setState({ online: true, queue: [] })
  })

  it('queues POST /ventas when offline', async () => {
    mockFetchFail()
    const { useApi } = await import('../hooks/useApi')
    const { result } = renderHook(() => useApi())

    let response
    await act(async () => {
      response = await result.current.api('POST', '/ventas', { total: 1000 })
    })

    expect(response.queued).toBe(true)
    expect(response.offline).toBe(true)
    expect(useOffline.getState().queue).toHaveLength(1)
    expect(useOffline.getState().queue[0].endpoint).toBe('/ventas')
  })

  it('throws for non-queueable offline requests', async () => {
    mockFetchFail()
    const { useApi } = await import('../hooks/useApi')
    const { result } = renderHook(() => useApi())

    await act(async () => {
      await expect(result.current.api('POST', '/auth/login', {}))
        .rejects.toThrow()
    })
  })

  it('throws for GET requests when offline', async () => {
    mockFetchFail()
    const { useApi } = await import('../hooks/useApi')
    const { result } = renderHook(() => useApi())

    await act(async () => {
      await expect(result.current.api('GET', '/ventas'))
        .rejects.toThrow('Sin conexión')
    })
  })
})
