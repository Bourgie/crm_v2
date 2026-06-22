---
name: pr-checklist
description: Usar antes de hacer merge, push a main, o cuando el usuario dice "está listo para subir?", "revisá antes de mergear", "chequeá que esté todo bien", "pre-merge check". Ejecuta la checklist completa de calidad de FlexCRM.
allowed-tools: Read, Grep, Glob, Bash
---

## Checklist pre-merge FlexCRM

Ejecutar en orden. Reportar cada ítem como ✅ OK, ❌ FALLA, o ⚠️ REVISAR.

### 1. Build de React

```bash
npm run build:react 2>&1 | tail -10
```
- ✅ Si termina sin errores (exit 0)
- ❌ Si hay errores de compilación — no mergear hasta resolver

### 2. Sintaxis JavaScript

```bash
# Chequear todos los archivos JS modificados
git diff main --name-only | grep "\.js$" | xargs -I{} node --check {}
```

### 3. Seguridad multi-tenant (CRÍTICO)

```bash
# Buscar imports directos de DB en routes (debe dar 0 resultados)
grep -rn "require.*db_sqlite\|require.*db_master" routes/ | grep -v "^routes/superadmin"
```
- ✅ Sin resultados = correcto
- ❌ Con resultados = fuga de datos entre tenants

```bash
# Verificar que todas las rutas nuevas tienen authMiddleware
grep -l "router\." routes/*.js | xargs grep -L "authMiddleware"
```
- ✅ Sin resultados = todas las rutas tienen auth
- ❌ Con resultados = rutas sin protección

### 4. stock_suc tratado como objeto

```bash
# Buscar usos incorrectos de stock_suc (como número o string)
grep -rn "stock_suc\b" frontend/src/ | grep -v "\?\.\[" | grep -v "JSON\." | grep -v "//"
```
Revisar manualmente los resultados — el patrón correcto es `stock_suc?.[suc_id]`.

### 5. Console.log olvidados

```bash
git diff main | grep "^\+" | grep -i "console\.log\|console\.error\|console\.warn" | grep -v "//.*console"
```
- ✅ Sin resultados
- ⚠️ Con resultados — remover antes de mergear (son aceptables solo en hooks y scripts de migración)

### 6. Schema y migraciones

```bash
# Verificar si hay cambios en db_sqlite.js (podría requerir migración)
git diff main -- db_sqlite.js | head -30
```
- Si hay tablas nuevas o columnas nuevas: ¿existe el script de migración correspondiente?
- ¿El seed_demo.js fue actualizado para incluir datos de la tabla nueva?

### 7. Variables de entorno nuevas

```bash
# Buscar process.env nuevos en el diff
git diff main | grep "^\+" | grep "process\.env\." | grep -v "//"
```
- Si hay nuevas variables: ¿están documentadas? ¿están en .env.example?
- Variables requeridas en Railway: JWT_SECRET, NODE_ENV, PORT

### 8. Archivos sensibles modificados

```bash
git diff main --name-only | grep -E "db_master|middleware/auth|middleware/tenant"
```
- Si hay cambios en estos archivos: revisión manual obligatoria antes de mergear

### 9. Dependencias nuevas

```bash
git diff main -- package.json | grep "^\+" | grep -v "version\|name\|description"
```
- Nuevas deps en `devDependencies`: verificar que no son necesarias en producción
- Nuevas deps en `dependencies`: verificar que son compatibles con Railway

### 10. Tamaño del bundle

```bash
du -sh public/app/ 2>/dev/null || echo "Correr npm run build:react primero"
```
- ⚠️ Si supera 5MB: investigar qué lo está inflando

---

## Reporte final

```
## Pre-merge checklist — [descripción del cambio]

| Check | Estado | Detalle |
|-------|--------|---------|
| Build React | ✅/❌ | |
| Sintaxis JS | ✅/❌ | |
| Seguridad multi-tenant | ✅/❌ | |
| stock_suc como objeto | ✅/⚠️ | |
| Sin console.log | ✅/⚠️ | |
| Migraciones al día | ✅/❌/N/A | |
| Env vars documentadas | ✅/N/A | |
| Archivos críticos OK | ✅/⚠️ | |

**Veredicto: LISTO PARA MERGEAR / REQUIERE CORRECCIONES**

Correcciones necesarias:
- [lista]
```
