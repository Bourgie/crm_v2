import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const APPS_DIR = path.resolve(__dirname, '..', 'apps')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@apps': APPS_DIR,
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, '..'), APPS_DIR],
    },
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    }
  },
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
  },
  base: '/app/',
  // Vitest config
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
})
