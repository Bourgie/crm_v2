const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // Archivos con node:test (corren con `npm run test:backend` vía node --test)
    exclude: [
      'test/backend.test.js',
      'test/treasury.test.js',
      'test/security-tenant.test.js',
      'test/integration-center/**',
      'node_modules/**',
    ],
  },
})
