# Plan de Seguridad y Estabilización — FlexCRM

## Resumen de Hallazgos

| Área | Diagnóstico | Severidad |
|------|------------|-----------|
| Aislamiento multi-tenant DB | ✅ Excelente — DB por empresa + master.db | — |
| Superadmin DB propia | ✅ master.db separado + SA_SECRET propio | — |
| Bugs multi-tenant en helpers | ❌ 3 helpers usan DB default en vez de req.db | **CRÍTICO** |
| CSP `'unsafe-inline'` en scripts | ⚠️ Reduce protección XSS | ALTA |
| Sanitización XSS superficial | ⚠️ Solo objetos planos, regex básico | ALTA |
| `/api/config/public` DB incorrecta | ⚠️ Siempre lee crm.db | MEDIA |
| npm audit (4 vulns) | ⚠️ 1 moderate, 3 high | MEDIA |
| Bundle 1.5MB sin code-split | ⚠️ Grande pero aceptable | BAJA |
| `middleware/empresa.js` código muerto | 🗑️ No importado | BAJA |

---

## Fase 1 — Bugs Multi-Tenant (CRÍTICO) ✅ COMPLETADO

Objetivo: Corregir fuga de contexto entre empresas.

### Tareas

- [x] 1.1 Fix `routes/clientes.js:calcScore()` — recibir `db` como parámetro
- [x] 1.2 Fix `routes/presupuestos.js:enrichPres()` — recibir `db` como parámetro
- [x] 1.3 Fix `routes/pendientes_ctacte.js:enrichPend()` — recibir `db` como parámetro
- [x] 1.4 Verificar que ningún otro helper a nivel módulo use `db` directamente (backup.js es scheduler sin request scope — OK)

**Impacto:** Datos de enriquecimiento (nombres de sucursal, cliente, vendedor) incorrectos para tenants no-default.  
**Esfuerzo:** ~15 min.

---

## Fase 2 — Endurecimiento Seguridad (ALTA) ✅ COMPLETADO

### Tareas

- [x] 2.1 CSP: eliminar `'unsafe-inline'` de `scriptSrc` y `scriptSrcAttr`
  - React build usa `<script type="module" crossorigin src="...">` — no necesita unsafe-inline
  - Se mantiene `'unsafe-inline'` en `styleSrc` (necesario para MUI)
  - `frameAncestors: ["'none'"]` previene clickjacking

- [x] 2.2 Sanitización XSS robusta (recursiva)
  - Implementada función `sanitizeValue()` que recorre objetos anidados
  - Elimina `<script>` tags, event handlers (`onclick=`, `onerror=`, etc.) y `javascript:` URIs

- [x] 2.3 Fix `/api/config/public` — ahora acepta `?empresa=X` para leer branding correcto
  - Compatible hacia atrás (default: `'default'`)

- [x] 2.4 npm audit — 0 vulnerabilidades
  - Se actualizó nodemailer de ^6.9.9 a ^9.0.3 (breaking change)
  - Verificado: API básica (`createTransport` + `sendMail`) sigue siendo compatible

- [x] 2.5 Rate limiting: verificado
  - superadmin login: 5/15min ✅ (ya existía en routes/superadmin.js)
  - login: 20/15min, forgot-password: 3/hora, reset-password: 5/15min, webhooks: 30/min, general API: 300/min

**Impacto:** Protección contra XSS, CSRF avanzado, y ataques de fuerza bruta.  
**Esfuerzo:** ~2-3 h.

---

## Fase 3 — Mejoras Multi-Tenant y Auditoría (MEDIA) ⏳ PARCIAL

### Tareas

- [x] 3.1 Audit trail de `login-as` (superadmin impersonación)
  - Ahora registra en `audit_log` de la empresa destino: `"Superadmin X accedió como admin"`
  - Ya se registraba en `sa_audit_log` del master DB

- [ ] 3.2 Loguear actividad sospechosa
  - Pendiente: múltiples intentos de login a distintas empresas desde misma IP
  - Pendiente: cambios de contraseña seguidos
  - Pendiente: accesos desde IPs no habituales

- [x] 3.3 Limpiar código muerto
  - `middleware/empresa.js` eliminado (no se importaba en ningún lado)

- [ ] 3.4 Documentar arquitectura de seguridad en `.ai/`
  - Pendiente: actualizar `ARCHITECTURE.md` con diagrama de flujo multi-tenant

**Impacto:** Trazabilidad completa de acciones administrativas.  
**Esfuerzo:** ~2 h.

---

## Fase 4 — Performance y Bundle (BAJA)

### Tareas

- [ ] 4.1 Code-splitting del bundle React
  - Usar `React.lazy()` + `Suspense` para rutas pesadas
  - Separar recharts, xlsx, dnd-kit en chunks dinámicos

- [ ] 4.2 Compresión Brotli/Gzip para assets estáticos
  - Agregar middleware `compression` en Express
  - O configurar a nivel Railway/reverse-proxy

**Impacto:** Mejora UX y performance de carga.  
**Esfuerzo:** ~1 h.

---

## Fase 5 — Testing Automatizado (MEDIA)

### Tareas

- [ ] 5.1 Tests de seguridad multi-tenant
  - Probar que usuario de Empresa A no puede acceder a datos de Empresa B
  - Probar que superadmin puede acceder a todas las empresas
  - Probar que token de una empresa no funciona en otra

- [ ] 5.2 Tests de autenticación
  - Login exitoso / fallido / lockout
  - Refresh token rotation
  - 2FA setup + verify + disable
  - Password reset flow
  - Password history enforcement

- [ ] 5.3 Tests de rate limiting
  - Verificar límites en login, forgot-password, reset-password
  - Verificar headers `RateLimit-*` presentes

**Impacto:** Garantía de regresión en seguridad.  
**Esfuerzo:** ~3 h.

---

## Final Test Checklist

Ejecutar en orden antes de considerar el sistema listo para producción:

### A. Build y Dependencias
- [ ] `npm run build:react` → exit 0
- [ ] `npm audit` → 0 vulnerabilidades altas/críticas
- [ ] Bundle < 2MB (o justificado)
- [ ] Sin errores de sintaxis JS

### B. Aislamiento Multi-Tenant
- [ ] Empresa A solo ve su DB → login con empresa A, verificar datos
- [ ] Empresa B solo ve su DB → login con empresa B, verificar datos
- [ ] Token de empresa A rechazado en endpoints de empresa B
- [ ] Superadmin no puede loguear como empresa normal (usa SA_SECRET)
- [ ] Superadmin puede hacer login-as y acceder correctamente
- [ ] Helpers `calcScore`, `enrichPres`, `enrichPend` usan DB correcta

### C. Autenticación y Sesiones
- [ ] Login con credenciales correctas → 200 + JWT
- [ ] Login con credenciales incorrectas → 401
- [ ] 3 intentos fallidos → lockout 15 min (429)
- [ ] Refresh token rotación funcional
- [ ] Refresh token inválido → 401 + cookie limpiada
- [ ] 2FA setup/confirm/verify/disable funcional
- [ ] Password reset: token válido 1h, one-time use
- [ ] Password history: última 5 no reusables
- [ ] Cambio de password invalida refresh tokens

### D. Autorización y Roles
- [ ] Usuario sin token → 401
- [ ] Token inválido/expirado → 401
- [ ] vendedor no puede acceder a rutas de admin
- [ ] admin tiene acceso a todo (`['*']`)
- [ ] Roles array soportado (multi-rol)
- [ ] Módulos no habilitados devuelven 403

### E. Seguridad de API
- [ ] CSP headers presentes en todas las respuestas
- [ ] CORS solo orígenes permitidos
- [ ] CSRF token requerido en POST/PUT/DELETE
- [ ] Rate limiting activo (verificar headers)
- [ ] XSS sanitization funciona (intentar `<script>` injection)
- [ ] HPP protection activo
- [ ] HTTPS redirect en producción
- [ ] Error handler no muestra stack trace en producción

### F. Encriptación y Secrets
- [ ] API keys de WooCommerce/TiendaNube/MELI encriptadas en DB
- [ ] SMTP credentials encriptadas en DB
- [ ] `CONFIG_ENCRYPTION_KEY` configurada en producción
- [ ] `JWT_SECRET` y `SA_SECRET` diferentes
- [ ] `.env` no commiteado

### G. Datos y Backup
- [ ] Backup programado funcional
- [ ] Backup manual descargable desde superadmin
- [ ] Restore desde backup funcional
- [ ] WAL mode activo en SQLite

### H. Frontend
- [ ] React build sin errores
- [ ] Login page funcional
- [ ] Superadmin panel funcional
- [ ] Todas las rutas protegidas redirigen a login
- [ ] Service worker legacy desregistrado

---

## Criterios de Aceptación

**LISTO PARA PRODUCCIÓN** = Todos los items del Final Test Checklist en ✅

**BLOQUEANTE** = Cualquier item en ❌ en las secciones B, C, D, E, F
