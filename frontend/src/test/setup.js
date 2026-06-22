import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock window.fetch globally
global.fetch = vi.fn()

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = String(val) }),
    removeItem: vi.fn((key) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', { get: () => true, configurable: true })

// Silence React act() warnings in tests
global.IS_REACT_ACT_ENVIRONMENT = true

// Mock ResizeObserver (used by Recharts' ResponsiveContainer)
global.ResizeObserver = class ResizeObserver {
  constructor(cb) { this.cb = cb }
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
