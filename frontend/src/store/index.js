import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Auth store (persisted) ────────────────────────────────────
export const useAuth = create(
  persist(
    (set, get) => ({
      token: null,
      me: null,
      isBooting: false,

      setToken: (token) => set({ token }),
      setMe: (me) => set({ me }),
      setBooting: (v) => set({ isBooting: v }),

      logout: () => {
        set({ token: null, me: null })
        localStorage.removeItem('crm_suc')
      },

      isLoggedIn: () => !!get().token && !!get().me,
    }),
    {
      name: 'flexcrm-auth',
      partialize: (s) => ({ token: s.token, me: s.me }),
    }
  )
)

// ── App data store ────────────────────────────────────────────
export const useApp = create((set, get) => ({
  allSucs:  [],
  allProds: [],
  allClis:  [],
  allUsers: [],
  sucSesion: localStorage.getItem('crm_suc') || null,
  modulos:  null,   // null = all enabled
  rubro:    'general',
  cfg:      {},
  theme:    'light',

  setSucs:      (v) => set({ allSucs: v }),
  setProds:     (v) => set({ allProds: v }),
  setClis:      (v) => set({ allClis: v }),
  setUsers:     (v) => set({ allUsers: v }),
  setSucSesion: (id) => { localStorage.setItem('crm_suc', id); set({ sucSesion: id }); },
  setModulos:   (v) => set({ modulos: v }),
  setRubro:     (v) => set({ rubro: v }),
  setCfg:       (v) => {
    set({ cfg: v })
    // Sincronizar apps instaladas desde cfg._apps
    if (v._apps && Array.isArray(v._apps)) {
      useApps.getState().setInstalled(v._apps)
    }
  },
  setTheme:     (v) => { document.documentElement.setAttribute('data-theme', v); set({ theme: v }); },

  hasModule: (mod) => {
    const mods = get().modulos
    if (!mods) return true
    return Array.isArray(mods) ? mods.includes(mod) : true
  },
}))

// ── Apps store (ecosistema) ───────────────────────────────────
export const useApps = create((set, get) => ({
  installed: [],       // apps instaladas para este tenant [{slug, nombre, icono, categoria, menu, ...}]
  marketplace: [],     // catálogo de apps disponibles
  loading: false,

  setInstalled: (apps) => set({ installed: apps || [] }),
  setMarketplace: (apps) => set({ marketplace: apps || [] }),
  setLoading: (v) => set({ loading: v }),

  isInstalled: (slug) => get().installed.some(a => a.slug === slug),
  getInstalled: (slug) => get().installed.find(a => a.slug === slug),

  /** Agregar/quitar localmente (optimistic update) */
  addInstalled: (app) => set(s => ({ installed: [...s.installed, app] })),
  removeInstalled: (slug) => set(s => ({ installed: s.installed.filter(a => a.slug !== slug) })),
}))

// ── Toast store ───────────────────────────────────────────────
export const useToast = create((set, get) => ({
  toasts: [],

  toast: (msg, type = '') => {
    const id = `${Date.now()}_${crypto.randomUUID().substring(0, 8)}`
    set((s) => ({ toasts: [...s.toasts, { id, msg, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3000)
  },
}))

// ── Offline queue store ───────────────────────────────────────
export const useOffline = create(
  persist(
    (set, get) => ({
      online: navigator.onLine,
      queue: [],

      setOnline: (v) => set({ online: v }),

      enqueue: (method, endpoint, body) => {
        const op = {
          id: `op_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`,
          method, endpoint, body: body || {},
          ts: new Date().toISOString(),
          intentos: 0,
        }
        set((s) => ({ queue: [...s.queue, op] }))
        return op
      },

      removeOps: (ids) => {
        set((s) => ({ queue: s.queue.filter((op) => !ids.includes(op.id)) }))
      },

      requeueFailed: (ops) => {
        set((s) => ({
          queue: [
            ...ops.map((op) => ({ ...op, intentos: (op.intentos || 0) + 1 })),
            ...s.queue,
          ],
        }))
      },
    }),
    {
      name: 'flexcrm-offline-queue',
      partialize: (s) => ({ queue: s.queue }),
    }
  )
)
