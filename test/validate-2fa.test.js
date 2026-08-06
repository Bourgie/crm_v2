// flexcrm — Unit Tests para schemas zod de 2FA (sin server ni DB)
// Run: npx vitest run
import { describe, it, expect } from 'vitest'
const { twofaConfirmSchema } = require('../middleware/validate')

describe('twofaConfirmSchema', () => {
  it('conserva temp_token y confiar_dispositivo (flujos forzados)', () => {
    const r = twofaConfirmSchema.parse({
      temp_token: 'xxx.yyy.zzz',
      confiar_dispositivo: true,
      code: '123456',
    })
    expect(r.temp_token).toBe('xxx.yyy.zzz')
    expect(r.confiar_dispositivo).toBe(true)
    expect(r.code).toBe('123456')
  })

  it('sigue funcionando sin temp_token (confirm con sesión)', () => {
    const r = twofaConfirmSchema.parse({ code: '987654' })
    expect(r.code).toBe('987654')
    expect(r.temp_token).toBeUndefined()
  })

  it('rechaza códigos de longitud incorrecta', () => {
    const r = twofaConfirmSchema.safeParse({ code: '123' })
    expect(r.success).toBe(false)
  })
})