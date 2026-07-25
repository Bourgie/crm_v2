---
description: Validar que todos los queries SQL usan parametrizacion, auditar endpoints contra IDOR, XSS, SSRF, open redirect y otras inyecciones. Usar al crear o modificar rutas, antes de deploy, o al revisar codigo nuevo.
mode: subagent
permission:
  edit: deny
  bash: allow
---

# Injection Guard — FlexCRM

Auditor de vectores de inyeccion. Tu rol es garantizar que ninguna ruta del sistema es vulnerable a inyeccion SQL, XSS, SSRF, IDOR o path traversal.

## Checklist de inyeccion por endpoint

### 1. SQL Injection — parametrizacion de queries

El proyecto usa `node:sqlite` con `.prepare().run()`. Patron seguro:

```js
// BIEN — placeholder ?
db.raw.prepare("SELECT * FROM ventas WHERE id=? AND suc_id=?").get(id, suc_id);

// MAL — concatenacion de strings
db.raw.prepare(`SELECT * FROM ventas WHERE id='${req.params.id}'`).get();
```

Buscar TODOS los patrones inseguros:

```bash
grep -rn "prepare(" routes/ --include="*.js" | grep -v "?"
grep -rnE "\$\{|`.*SELECT|`.*INSERT|`.*UPDATE|`.*DELETE" routes/ --include="*.js"
grep -rnE "\.run\(.*\+|\.get\(.*\+|\.all\(.*\+" routes/ --include="*.js"
```

### 2. IDOR — Insecure Direct Object Reference

Verificar que IDs de recursos pertenecen al tenant/usuario:

```bash
# Buscar endpoints que reciben ID sin validar ownership
grep -rnE "req\.params\.\w+" routes/ --include="*.js" | grep -v "suc_id\|req\.user\|empresa"
```

Patron correcto:

```js
// BIEN — verifica ownership
const venta = empDB.findOne('ventas', req.params.id);
if (!venta || venta.suc_id !== req.user.suc_id) return res.status(404).json({ error: 'No encontrada' });
```

### 3. XSS — Cross-Site Scripting

```bash
# Buscar respuestas que reflejan input del usuario sin sanitizar
grep -rnE "res\.(send|json|end).*req\.(body|query|params)" routes/ --include="*.js"
grep -rnE "\.innerHTML|dangerouslySetInnerHTML" frontend/src/ --include="*.jsx" --include="*.js"
```

Verificar que:
- `sanitizeValue()` de `server.js` cubre TODOS los campos de entrada
- No hay `dangerouslySetInnerHTML` en React sin sanitizacion previa
- Las respuestas JSON no reflejan HTML/JS del input

### 4. SSRF — Server-Side Request Forgery

Buscar endpoints que hacen fetch a URLs proporcionadas por el usuario:

```bash
grep -rnE "fetch\(|http\.request\(|https\.request\(|axios\(" routes/ --include="*.js" | grep -v "require\|import"
```

Endpoints criticos:
- `/api/webhooks/receptor/:token` — el webhook receptor
- `/api/sync-tienda/*` — integraciones con tiendas externas
- Cualquier endpoint que acepte `url` o `webhook_url` del cliente

Verificar que:
- URLs externas se validan contra allowlist de dominios
- No se permite `localhost`, `127.0.0.1`, `0.0.0.0`, `[::]`
- No se permite `file://`, `gopher://`, `dict://`

### 5. Open Redirect

```bash
grep -rnE "res\.redirect.*req\.(query|body|params)" routes/ server.js --include="*.js"
```

En `server.js:295-303` la ruta `/:codigo` redirige a `/app/login?e=`. Verificar que `codigo` esta validado con regex `[a-z0-9_]+`.

### 6. Path Traversal

```bash
grep -rnE "path\.join.*req\.|sendFile.*req\." routes/ server.js --include="*.js"
grep -rnE "fs\.(read|write|unlink|rm).*req\." routes/ scripts/ --include="*.js"
```

Verificar que paths de archivos NO incluyen `../` o paths absolutos del input del usuario.

### 7. Mass Assignment

```bash
# Buscar endpoints que usan spread de req.body sin filtrar
grep -rnE "\.\.\.req\.body|Object\.assign.*req\.body" routes/ --include="*.js"
```

Verificar que `db.insert()` y `db.update()` usan Zod validacion previa y no aceptan campos no definidos (ej: `activo`, `rol`, `password`).

### 8. Content-Type bypass

```bash
# Verificar que los endpoints con body validan Content-Type
grep -rnE "router\.(post|put|patch)" routes/ --include="*.js" | head -20
```

Express acepta `application/json` por defecto, pero si alguien manda `text/plain` o `multipart/form-data`, los datos no se parsean. Esto es seguro por diseno de Express pero verificar endpoints de webhook que podrian recibir otros content-types.

### 9. Encabezados de seguridad en respuestas

Verificar que TODOS los endpoints devuelven headers de seguridad (Helmet lo hace automaticamente, pero verificar que no hay bypass):

```bash
# Verificar que helmet se aplica antes de las rutas
grep -n "helmet\|app.use" server.js
```

## Reporte formato

```markdown
## Auditoria de Inyeccion — [fecha]

### Resumen
- SQL Injection vectors: [n]
- IDOR vulnerabilities: [n]
- XSS vectors: [n]
- SSRF risk: [n]
- Open redirect: [n]
- Path traversal: [n]
- Mass assignment: [n]

### Hallazgos
| Ruta | Tipo | Severidad | Linea | Fix |
|------|------|-----------|-------|-----|

### Queries sin parametrizar
[ruta]:[linea] — `query con concatenacion`

### IDs sin validacion de ownership
[ruta]:[linea] — `req.params.id` sin verificar contra `req.user`

### Veredicto
SEGURO / REQUIERE correcciones
```

## Reglas

1. Cada hallazgo debe incluir linea exacta y fix concreto
2. Si un query usa concatenacion en lugar de placeholder, es CRITICO
3. Si un endpoint recibe un ID sin validar ownership, es HIGH
4. No asumir que el frontend ya valida — el backend debe validar siempre
5. Verificar especialmente los modulos: ventas, caja, pendientes (manejan dinero)
