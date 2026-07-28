import { describe, it, expect, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import { useAuth, useApp, useToast, useOffline } from '../store'

// Helper to get fresh store state
function getAuth() { return useAuth.getState() }
function getApp() { return useApp.getState() }
function getToast() { return useToast.getState() }
function getOffline() { return useOffline.getState() }

// ── Auth store ─────────────────────────────────────────────────
describe('useAuth store', () => {
  beforeEach(() => {
    useAuth.setState({ token: null, me: null, isBooting: false })
  })

  it('starts with no user', () => {
    expect(getAuth().me).toBeNull()
  })

  it('sets me correctly', () => {
    act(() => {
      getAuth().setMe({ id: 'u1', nombre: 'Admin', rol: 'admin' })
    })
    expect(getAuth().me.nombre).toBe('Admin')
  })

  it('isLoggedIn returns true when me is set', () => {
    act(() => {
      getAuth().setMe({ id: 'u1', nombre: 'Admin' })
    })
    expect(getAuth().isLoggedIn()).toBe(true)
  })

  it('isLoggedIn returns false when me is null', () => {
    expect(getAuth().isLoggedIn()).toBe(false)
  })

  it('logout clears me', () => {
    act(() => {
      getAuth().setMe({ id: 'u1', nombre: 'Admin' })
      getAuth().logout()
    })
    expect(getAuth().me).toBeNull()
  })

  it('setBooting updates isBooting', () => {
    act(() => { getAuth().setBooting(true) })
    expect(getAuth().isBooting).toBe(true)
    act(() => { getAuth().setBooting(false) })
    expect(getAuth().isBooting).toBe(false)
  })
})

// ── App store ──────────────────────────────────────────────────
describe('useApp store', () => {
  beforeEach(() => {
    useApp.setState({ allSucs: [], allProds: [], allClis: [], modulos: null, sucSesion: null })
  })

  it('starts with empty arrays', () => {
    expect(getApp().allSucs).toEqual([])
    expect(getApp().allProds).toEqual([])
  })

  it('setSucs updates allSucs', () => {
    const sucs = [{ id: 's1', nombre: 'Centro' }, { id: 's2', nombre: 'Norte' }]
    act(() => { getApp().setSucs(sucs) })
    expect(getApp().allSucs).toHaveLength(2)
    expect(getApp().allSucs[0].nombre).toBe('Centro')
  })

  it('hasModule returns true when modulos is null (all enabled)', () => {
    act(() => { useApp.setState({ modulos: null }) })
    expect(getApp().hasModule('ventas')).toBe(true)
    expect(getApp().hasModule('chat')).toBe(true)
    expect(getApp().hasModule('anything')).toBe(true)
  })

  it('hasModule returns true for included module', () => {
    act(() => { useApp.setState({ modulos: ['ventas', 'caja', 'clientes'] }) })
    expect(getApp().hasModule('ventas')).toBe(true)
    expect(getApp().hasModule('caja')).toBe(true)
  })

  it('hasModule returns false for excluded module', () => {
    act(() => { useApp.setState({ modulos: ['ventas', 'caja'] }) })
    expect(getApp().hasModule('chat')).toBe(false)
    expect(getApp().hasModule('listabebe')).toBe(false)
  })

  it('setSucSesion updates sucSesion and localStorage', () => {
    act(() => { getApp().setSucSesion('s123') })
    expect(getApp().sucSesion).toBe('s123')
    expect(localStorage.setItem).toHaveBeenCalledWith('crm_suc', 's123')
  })
})

// ── Toast store ────────────────────────────────────────────────
describe('useToast store', () => {
  beforeEach(() => {
    useToast.setState({ toasts: [] })
  })

  it('starts with empty toasts', () => {
    expect(getToast().toasts).toHaveLength(0)
  })

  it('adds toast when toast() called', () => {
    act(() => { getToast().toast('Guardado correctamente', 'ok') })
    expect(getToast().toasts).toHaveLength(1)
    expect(getToast().toasts[0].msg).toBe('Guardado correctamente')
    expect(getToast().toasts[0].type).toBe('ok')
  })

  it('assigns unique id to each toast', () => {
    act(() => {
      getToast().toast('Mensaje 1')
      getToast().toast('Mensaje 2')
    })
    const ids = getToast().toasts.map((t) => t.id)
    expect(ids[0]).not.toBe(ids[1])
  })
})

// ── Offline store ──────────────────────────────────────────────
describe('useOffline store', () => {
  beforeEach(() => {
    useOffline.setState({ online: true, queue: [] })
  })

  it('starts online with empty queue', () => {
    expect(getOffline().online).toBe(true)
    expect(getOffline().queue).toHaveLength(0)
  })

  it('enqueue adds operation to queue', () => {
    act(() => {
      getOffline().enqueue('POST', '/ventas', { total: 1000 })
    })
    expect(getOffline().queue).toHaveLength(1)
    expect(getOffline().queue[0].method).toBe('POST')
    expect(getOffline().queue[0].endpoint).toBe('/ventas')
    expect(getOffline().queue[0].body.total).toBe(1000)
  })

  it('enqueue returns the op with id', () => {
    let op
    act(() => {
      op = getOffline().enqueue('POST', '/clientes', { nombre: 'Juan' })
    })
    expect(op.id).toBeTruthy()
    expect(op.ts).toBeTruthy()
  })

  it('removeOps removes by id', () => {
    act(() => {
      getOffline().enqueue('POST', '/ventas', {})
      getOffline().enqueue('POST', '/clientes', {})
    })
    const id = getOffline().queue[0].id
    act(() => { getOffline().removeOps([id]) })
    expect(getOffline().queue).toHaveLength(1)
  })

  it('requeueFailed increments intentos', () => {
    act(() => {
      getOffline().enqueue('POST', '/ventas', { total: 500 })
    })
    const op = getOffline().queue[0]
    act(() => { getOffline().removeOps([op.id]) })
    act(() => { getOffline().requeueFailed([op]) })
    expect(getOffline().queue[0].intentos).toBe(1)
  })

  it('setOnline updates online state', () => {
    act(() => { getOffline().setOnline(false) })
    expect(getOffline().online).toBe(false)
    act(() => { getOffline().setOnline(true) })
    expect(getOffline().online).toBe(true)
  })
})
