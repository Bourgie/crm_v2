---
name: bug-report
description: Usar cuando el usuario reporta un bug, dice "no funciona", "hay un error", "esto falla", "tengo un problema con X" o comparte un mensaje de error. Estructura el diagnóstico antes de proponer cualquier fix.
allowed-tools: Read, Grep, Glob, Bash
---

## Protocolo de diagnóstico de bugs en FlexCRM

Antes de proponer cualquier solución, completar esta estructura de diagnóstico.

### Paso 1 — Recopilar síntomas

Si el usuario no los proporcionó, preguntar:
1. ¿Qué acción estaba haciendo cuando ocurrió el error?
2. ¿Cuál es el mensaje de error exacto (consola del navegador o terminal)?
3. ¿En qué módulo / pantalla aparece?
4. ¿Es reproducible siempre o intermitente?
5. ¿Pasó después de algún cambio reciente?

### Paso 2 — Clasificar el bug por tipo

**Frontend (React):**
- Error #31: objeto renderizado como children → buscar `stock_suc` siendo mostrado directo
- Variables undefined: `selStyle`, `filtroLista`, `sortBy` no definidas → `str_replace` que falló
- Fetch falla: revisar que `useApi` envía header `X-Empresa` y token

**Backend (Express/SQLite):**
- 403 Forbidden: suc_id en localStorage desactualizado → limpiar localStorage
- 500 Internal Server Error: revisar `req.db` — ¿viene del middleware o fue importado directo?
- Datos de otra empresa: tenant middleware no aplicado a la ruta

**Multi-tenant:**
- DB equivocada: alguna ruta usa `db` importado en lugar de `req.db`
- suc_id inválido: sucursal no pertenece a la empresa del JWT

### Paso 3 — Localizar el origen

```bash
# Buscar el endpoint que falla
grep -n "router\.\(get\|post\|put\|delete\).*[ruta]" routes/[modulo].js

# Buscar el componente que hace la llamada
grep -rn "api('\/[endpoint]'" frontend/src/

# Verificar que el middleware está aplicado
grep -n "authMiddleware\|requireRol\|tenantMiddleware" routes/[modulo].js | head -20
```

### Paso 4 — Diagnóstico estructurado

Reportar siempre en este formato antes de proponer cualquier fix:

```
## Diagnóstico — [descripción del bug]

**Síntoma:** [lo que el usuario ve]
**Causa raíz:** [por qué ocurre]
**Archivo y línea:** routes/modulo.js:42 / frontend/src/pages/Modulo.jsx:87
**Tipo:** Frontend React / Backend Express / Multi-tenant / Data

**Evidencia:**
[snippet del código problemático]

**Fix propuesto:**
[código exacto del cambio]

**Cómo verificar que está resuelto:**
[pasos concretos]

**Efectos secundarios posibles:**
[qué más podría verse afectado]
```

### Paso 5 — Aplicar el fix

Solo después de presentar el diagnóstico y que el usuario confirme, aplicar el cambio.

### Bugs conocidos y sus causas (referencia rápida)

| Síntoma | Causa | Fix |
|---------|-------|-----|
| 403 en todos los endpoints | suc_id viejo en localStorage | Limpiar localStorage y re-loguear |
| React error #31 | `stock_suc` renderizado como object | Acceder con `stock_suc[suc_id]` |
| Variable undefined (selStyle, etc.) | str_replace no matcheó | Buscar y definir la variable faltante |
| Recargo de tarjeta duplicado | Cálculo sobre input en lugar de base fija | Calcular recargo sobre `total` fijo, no sobre lo que escribe el cajero |
| Datos de empresa A en empresa B | Route sin tenantMiddleware | Agregar middleware al router |
| Modal no cierra | Estado no se resetea al cerrar | `setEditando(null)` al cerrar |
