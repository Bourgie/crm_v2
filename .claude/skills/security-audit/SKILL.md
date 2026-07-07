---
name: security-audit
description: Usar cuando se audita, revisa o mejora la seguridad del backend de FlexCRM. Verifica rate limiting, encriptación de secrets, CSP, CORS, CSRF, validación de input, autenticación y dependencies.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# Security Audit — FlexCRM

## Convenciones de seguridad del proyecto

### 1. Secrets en DB — siempre encriptados

Toda API key de tercero (WooCommerce, TiendaNube, MercadoLibre, SMTP, ARCA) se almacena en la tabla `config` **encriptada** con AES-256-GCM.

- Usar `lib/crypto-utils.js` → `encryptValue(plaintext)` / `decryptValue(ciphertext)`
- Clave maestra: `CONFIG_ENCRYPTION_KEY` en `.env` (64 chars hex = 32 bytes)
- NUNCA almacenar secrets en texto plano
- Para leer un secret en routes: `db.getConfig('tienda_woo_key', { decrypt: true })`

### 2. Rate limiting

| Endpoint | Límite | Ventana |
|----------|--------|---------|
| `/api/auth/login` | 20 | 15 min |
| `/api/auth/forgot-password` | 3 | 1 hora |
| `/api/auth/reset-password` | 5 | 15 min |
| `/api/superadmin/login` | 5 | 15 min |
| `/api/webhooks/receptor/:token` | 30 | 1 min |
| `/api/meli-callback/*` | 10 | 1 min |
| `/api/*` (general) | 300 | 1 min |

- Todos los limiters declarados en `server.js` o en el router respectivo
- Usar `express-rate-limit` con `standardHeaders: true, legacyHeaders: false`

### 3. CSP (Content Security Policy)

La política CSP está definida en `server.js` → `helmet({ contentSecurityPolicy: { directives } })`.

Directrices:
- `default-src: 'self'`
- `script-src: 'self'` (sin 'unsafe-inline' — usar nonce si se necesita inline)
- `style-src: 'self' 'unsafe-inline'` (necesario para MUI/Chakra)
- `img-src: 'self' data:`
- `connect-src: 'self' ws: wss:`
- `font-src: 'self' data:`

### 4. CORS

- En producción: solo orígenes listados en `ALLOWED_ORIGINS` (`.env`)
- NUNCA permitir todos los orígenes, ni siquiera en desarrollo
- Credentials: `credentials: true`

### 5. CSRF

- Usar double-submit cookie pattern (stateless)
- Token CSRF generado por endpoint `GET /api/csrf-token`
- Frontend envía token en header `X-CSRF-Token`
- Backend valida contra cookie `csrf-token`
- Middleware en `middleware/csrf.js`

### 6. JWT

- Access token: 24h de expiración
- Refresh token: httpOnly cookie, 7 días, rotativo (se reemplaza en cada refresh)
- Endpoint `POST /api/auth/refresh`
- Payload mínimo: `{ id, rol, empresa, suc_id }`

### 7. Input validation

- Usar `zod` para schemas de validación en `middleware/validate.js`
- Validar en endpoints críticos: login, creación de usuarios, webhooks, config
- Nunca confiar en inputs del cliente

### 8. Login lockout

- Persistente en SQLite (tabla `login_attempts` en DB de empresa)
- 3 intentos fallidos → bloqueo de 15 minutos
- Limpiar intentos al hacer login exitoso

### 9. Password policy

- Mínimo 8 caracteres
- Al menos 1 mayúscula, 1 número, 1 símbolo
- Hasheado con bcrypt (10 rounds)

### 10. HTTPS

- En producción: middleware que redirige a HTTPS si `x-forwarded-proto: http`
- Desarrollo local: HTTP ok

### 11. Dependencies

- `npm audit` antes de cada commit/mr
- Package.json security deps: `zod`, `csrf-csrf`, `hpp`, `express-rate-limit`
- No agregar dependencias sin revisar su necesidad
