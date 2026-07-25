---
name: api-hardening
description: Endurecer la API de FlexCRM — tuning de rate limits, verificacion de encabezados de seguridad, Content-Type enforcement, validacion de ownership en cada endpoint, hardening de respuestas.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# API Hardening — FlexCRM

Guia de endurecimiento de API. Activar cuando:
- Se agrega un endpoint nuevo y se quiere verificar que es seguro
- Se hace tuning de rate limits
- Se audita la API completa
- Antes de un deploy a produccion
- Despues de una auditoria de seguridad que encontro gaps

## 1. Rate limit tuning

### Limites actuales (server.js)

| Endpoint | Limite | Ventana | Variable |
|----------|--------|---------|----------|
| `/api/auth/login` | 20 | 15 min | `loginLimiter` |
| `/api/auth/forgot-password` | 3 | 1 hora | `forgotPasswordLimiter` |
| `/api/auth/reset-password` | 5 | 15 min | `resetPasswordLimiter` |
| `/api/webhooks/receptor/:token` | 30 | 1 min | `webhookReceptorLimiter` |
| `/api/meli-callback/*` | 10 | 1 min | `meliCallbackLimiter` |
| `/api/*` (global) | 300 | 1 min | `apiLimiter` |
| `/api/superadmin/login` | 5 | 15 min | en `routes/superadmin.js` |

### Como tunear

```js
// Analisis de uso real para ajustar limites
// Checkear logs de rate-limit:
grep -rn "Too Many Requests\|429" data/ logs/ 2>&1

// Si hay muchos falsos positivos en prod, subir limite
// Si hay abuso, bajar limite o agregar ventana mas larga
```

### Endpoints sin rate limit especifico (deberian tenerlo)

- [ ] `/api/auth/2fa/verify-login` — deberia tener limite (ataques de fuerza bruta a 2FA)
- [ ] `/api/config` — cambios de configuracion sensibles
- [ ] `/api/caja/abrir` y `/api/caja/cerrar` — operaciones financieras
- [ ] Endpoints de export/import (SheetJS) — pueden consumir mucha memoria

### Template para nuevo rate limiter

```js
const customLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 30,                     // maximo de requests
  message: { error: 'Demasiadas solicitudes. Intentá más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Usar IP + tenant para limites por empresa
    return req.ip + (req.user?.empresa || '');
  },
});
```

---

## 2. Encabezados de seguridad por respuesta

Verificar que cada endpoint devuelve los headers correctos:

```bash
# Test rapido con curl
curl -I http://localhost:3000/api/health 2>&1
```

Headers esperados en TODAS las respuestas:

| Header | Valor esperado | Implementado por |
|--------|---------------|-----------------|
| `Content-Security-Policy` | `default-src 'self'; ...` | Helmet |
| `X-Content-Type-Options` | `nosniff` | Helmet |
| `X-Frame-Options` | `DENY` | Helmet |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Helmet (prod) |
| `X-DNS-Prefetch-Control` | `off` | Helmet |
| `X-Permitted-Cross-Domain-Policies` | `none` | Helmet |
| `Referrer-Policy` | `no-referrer` | Helmet |
| `X-RateLimit-Limit` | segun endpoint | express-rate-limit |
| `X-RateLimit-Remaining` | decreciente | express-rate-limit |

### CSP hardening

```js
// server.js:33-48 — directivas actuales
// Verificar que no haya necesidad de 'unsafe-inline' para scripts
// Si React/Chakra necesita 'unsafe-inline' para styles, documentar por que
```

---

## 3. Content-Type enforcement

Express parsea solo `application/json` por defecto. Verificar:

```js
// server.js:149 — OK, solo JSON
app.use(express.json({ limit: '2mb' }));

// server.js:150 — OK, urlencoded tambien
app.use(express.urlencoded({ extended: true }));
```

Puntos a verificar:
- [ ] `extended: true` permite objetos anidados — es necesario?
- [ ] `limit: '2mb'` es suficiente para imports Excel pero no permite ataques de memoria
- [ ] Webhooks deberian validar `Content-Type: application/json` explicitamente
- [ ] Endpoints de archivos (backup restore) deberian validar content-type del upload

---

## 4. Validacion de ownership por endpoint

Verificar que cada endpoint que recibe un ID valida que pertenece al tenant/usuario:

```bash
# Encontrar endpoints con params de ID
grep -rn "req\.params\.\w+" routes/ --include="*.js" | grep -v "auth\|middleware\|validate"
```

### Ownership check template

```js
// Para recursos de empresa (productos, clientes, ventas)
const recurso = empDB.findOne('tabla', req.params.id);
if (!recurso || recurso.empresa_id !== req.user.empresa) {
  return res.status(404).json({ error: 'No encontrado' });
}

// Para recursos de sucursal
const venta = empDB.findOne('ventas', req.params.id);
if (!venta || venta.suc_id !== req.user.suc_id) {
  return res.status(404).json({ error: 'No encontrada' });
}

// Para recursos de usuario (solo admin o el propio usuario)
if (req.params.id !== req.user.id && req.user.rol !== 'admin') {
  return res.status(403).json({ error: 'Sin permisos' });
}
```

---

## 5. Hardening de respuestas

### Informacion que NUNCA debe filtrarse

```js
// MAL — expone datos sensibles
res.json(usuario);  // incluye password hash, tokens, etc.

// BIEN — sanitiza la respuesta
const { password, refresh_token, ...safe } = usuario;
res.json(safe);
```

### Stack traces

```js
// server.js:318 — BIEN en produccion
res.status(500).json({ error: 'Error interno del servidor' });

// server.js:314 — OK solo en development
if (process.env.NODE_ENV === 'development') console.error(err.stack);
```

### Headers de respuesta

```bash
# Verificar que no se filtra info del servidor
grep -rn "X-Powered-By\|Server:" server.js
```

Express agrega `X-Powered-By: Express` por defecto. Helmet lo deshabilita. Verificar.

---

## 6. Webhook security hardening

El endpoint `/api/webhooks/receptor/:token` debe:

```js
// 1. Validar Content-Type
if (req.headers['content-type'] !== 'application/json') {
  return res.status(415).json({ error: 'Content-Type debe ser application/json' });
}

// 2. Verificar firma HMAC (si el proveedor la envia)
const signature = req.headers['x-webhook-signature'];
const expected = crypto.createHmac('sha256', webhookSecret)
  .update(JSON.stringify(req.body))
  .digest('hex');
if (signature !== expected) {
  return res.status(401).json({ error: 'Firma inválida' });
}

// 3. Validar timestamp para prevenir replay attacks
const ts = req.headers['x-webhook-timestamp'];
if (Math.abs(Date.now() - parseInt(ts)) > 300000) { // 5 minutos
  return res.status(401).json({ error: 'Timestamp fuera de rango' });
}
```

---

## 7. Checklist de hardening por endpoint nuevo

Al crear un endpoint nuevo, verificar:

- [ ] `authMiddleware` aplicado (o ruta publica explicita)
- [ ] `requireRol()` con el rol minimo necesario
- [ ] `validate(schema)` con Zod si recibe body
- [ ] `req.db` (no DB importada directamente)
- [ ] Parametros de ruta validados contra ownership
- [ ] Respuesta no incluye campos sensibles (password, tokens)
- [ ] Rate limit aplicado si es endpoint publico o critico
- [ ] Content-Type verificado si recibe body
- [ ] Sanitizacion de input (ya cubierta por middleware global)
- [ ] Audit log para operaciones sensibles (cambios de config, borrados)

---

## Reglas

1. Nunca bajar rate limits sin monitorear primero en produccion
2. Siempre usar `standardHeaders: true` y `legacyHeaders: false` en rate limiters
3. Content-Type validation es critica en webhooks — sin ella, el parseo puede fallar silenciosamente
4. Las respuestas 404 y 403 deben ser identicas para prevenir enumeracion de recursos
5. No exponer IDs internos en URLs publicas — usar UUIDs o slugs
6. Siempre verificar que Helmet esta antes de las rutas en server.js
