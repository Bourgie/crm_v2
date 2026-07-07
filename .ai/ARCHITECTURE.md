# Arquitectura — FlexCRM

## Capas

```
Superadmin (master.db)
  └── Gestión de empresas, planes, módulos
      └── Empresa A (empresa_A.db)
      └── Empresa B (empresa_B.db)
      └── Empresa C (empresa_C.db)
```

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js 22+ / Express 4 |
| Frontend | React 18 / Vite / Zustand |
| DB Superadmin | SQLite (master.db) |
| DB por empresa | SQLite (empresa_{codigo}.db) |
| Cache | En memoria (no Redis) |

## Flujo Multi-Tenant

```
Cliente → HTTPS → Express
  ├── helmet (CSP, security headers)
  ├── hpp (parameter pollution)
  ├── cookie-parser
  ├── compression (gzip)
  ├── rate-limit (login, API, webhooks)
  │
  ├── Middleware JWT (server.js inline)
  │   └── Decodifica token → extrae empresa → req.db = getEmpresaDB(empresa)
  │
  ├── validateTenant
  │   ├── ¿Empresa existe y activa?
  │   ├── ¿Suscripción vigente?
  │   └── ¿Módulo habilitado? (requireModule)
  │
  ├── CSRF protection (POST/PUT/DELETE)
  │
  └── Route → handler usa _getDB(req) = req.db || db
```

## Seguridad

### Aislamiento de datos
- **Físico**: Cada empresa tiene su propio archivo `.db` separado
- **Superadmin**: Base `master.db` independiente con su propio JWT secret (`SA_SECRET`)
- **Inyección DB**: `server.js` middleware decodifica JWT y asigna `req.db` antes de llegar a rutas
- **Helpers**: Todos reciben `db` como parámetro (ninguno usa variable global/module-level)

### Autenticación
- JWT access token (24h) + Refresh token httpOnly (7d, rotating)
- 2FA TOTP (otplib) con backup codes
- Login lockout: 3 intentos → 15 min bloqueo
- Password history: últimas 5 no reusables
- bcrypt (10 rounds)

### Endpoints públicos (sin JWT)
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/refresh`
- `POST /api/superadmin/login`
- `GET /api/config/public?empresa=X`
- `GET /api/health`
- `GET /api/version`
- Webhooks receptor/:token
- MercadoLibre callback

### Rate Limiting
| Endpoint | Máx | Ventana |
|----------|-----|---------|
| `/api/auth/login` | 20 | 15 min |
| `/api/auth/forgot-password` | 3 | 1 hora |
| `/api/auth/reset-password` | 5 | 15 min |
| `/api/superadmin/login` | 5 | 15 min |
| `/api/webhooks/receptor/:token` | 30 | 1 min |
| `/api/meli-callback/*` | 10 | 1 min |
| `/api/*` (general) | 300 | 1 min |

### Encriptación
- API keys de integraciones: AES-256-GCM (`lib/crypto-utils.js`)
- Clave maestra: `CONFIG_ENCRYPTION_KEY` (64 chars hex en .env)
- Passwords: bcrypt

### Headers de seguridad
- CSP: `default-src 'self'`, scripts solo `'self'`, styles `'self' 'unsafe-inline'`
- `X-Frame-Options: DENY` (via helmet)
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (en producción)

## Módulos del Frontend (React)

### Componentes principales
```
App.jsx                     ← Routes + React.lazy code-splitting
├── Layout.jsx              ← Shell con sidebar + header
│   ├── Sidebar.jsx         ← Navegación
│   ├── RequireAuth.jsx     ← Auth guard
│   └── OfflineBanner.jsx   ← Conexión
├── pages/                  ← 20+ páginas lazy-loaded
├── components/             ← UI reutilizable
├── hooks/
│   ├── useApi.js           ← Fetch wrapper + cola offline
│   └── useOfflineManager.js
├── store/index.js          ← Zustand stores
└── utils/excel.js          ← Exportación Excel
```

## CI/CD
- Build: `npm run build:react` → Vite genera chunks en `public/app/`
- Deploy: Railway (ver `railway.json`)
- Pre-merge: ejecutar checklist en `.ai/PLAN_SEGURIDAD.md`
