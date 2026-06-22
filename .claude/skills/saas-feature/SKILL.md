---
name: saas-feature
description: Usar cuando se agrega una funcionalidad nueva que debe respetar el modelo SaaS multi-tenant de FlexCRM — control de acceso por plan, gate de módulos, configuración por empresa, o cualquier feature que no debería estar disponible para todas las empresas. Activar cuando el usuario dice "esto solo para el plan Pro", "que se pueda habilitar por empresa", "agregar al plan Enterprise", "feature flag para X".
allowed-tools: Read, Write, Edit, Grep, Glob
---

## Checklist de feature SaaS en FlexCRM

Cada feature nueva que tenga control por plan, por empresa, o por módulo debe pasar por estos pasos.

### Paso 1 — Definir el alcance

Responder antes de escribir código:
- ¿En qué plan(es) estará disponible? (`basico` / `pro` / `enterprise`)
- ¿Es configurable por empresa (override del superadmin)?
- ¿Tiene configuración propia en Config del tenant?
- ¿Qué rol mínimo requiere?

### Paso 2 — Agregar el módulo/feature a db_master.js

Leer `db_master.js` para ver cómo se definen los planes actuales. Agregar la nueva feature al array del plan correspondiente:

```js
// En db_master.js — array de módulos por plan
const PLANES = {
  basico:     ['pos','caja','clientes','ventas','productos','ctacte','proveedores','gastos','reportes'],
  pro:        [...basico, 'presupuestos','pendientes','transferencias','chat','auditoria'],
  enterprise: [...pro, 'listabebe', 'nuevo-modulo'],  // ← agregar aquí
};
```

### Paso 3 — Gate en el backend

En la ruta de la feature, verificar que el plan de la empresa incluye el módulo:

```js
// Opción A: usando requireRol (para gates por rol)
router.get('/endpoint', authMiddleware, requireRol('admin'), (req, res) => { ... });

// Opción B: verificando el plan de la empresa (para gates por plan)
router.get('/endpoint', authMiddleware, (req, res) => {
  const config = req.db.getConfig();
  const modulosHabilitados = JSON.parse(config.modulos_habilitados || '[]');
  if (!modulosHabilitados.includes('nombre-modulo')) {
    return res.status(403).json({ error: 'Módulo no disponible en tu plan' });
  }
  // ... lógica normal
});
```

### Paso 4 — Gate en el frontend (Sidebar)

En `frontend/src/components/Sidebar.jsx`, los ítems del menú ya están filtrados por módulos habilitados. Verificar que el nuevo módulo está en el array de ítems y que su `modulo` key coincide exactamente con el nombre en `db_master.js`.

```jsx
// En Sidebar.jsx — verificar que existe una entrada así:
{ label: 'Nombre Feature', path: '/app/ruta', icon: '...', modulo: 'nombre-modulo', roles: ['admin','cajero'] }
```

### Paso 5 — Configuración por empresa (si aplica)

Si la feature es configurable por empresa (ej: umbral de alerta, porcentaje de comisión):

1. Agregar el campo de configuración en `db_sqlite.js` → función `getConfig` / `setConfig`
2. Agregar la UI de configuración en `frontend/src/pages/Config.jsx` → tab correspondiente
3. Leer la config al inicio del módulo: `const config = req.db.getConfig()`

### Paso 6 — Override desde Superadmin

Para features que el superadmin puede habilitar/deshabilitar por empresa (independiente del plan):

Verificar que en `routes/superadmin.js` → endpoint de edición de empresa, hay soporte para `modulos_override`. Si no existe, agregarlo.

### Paso 7 — Documentar en CLAUDE.md

Agregar una línea en `.claude/CLAUDE.md` bajo la lista de módulos indicando en qué plan está disponible la nueva feature.

### Paso 8 — Seed demo

Verificar que `seed_demo.js` habilita la feature para la empresa demo en el plan correspondiente.

---

## Anti-patrones a evitar

**No** hardcodear lógica de planes en los componentes React:
```jsx
// ❌ MAL — hardcodeado en el frontend
if (empresaPlan === 'enterprise') { mostrarFeature(); }

// ✅ BIEN — el backend gate devuelve 403, el frontend maneja el error
// El sidebar ya filtra los módulos según lo que devuelve /api/config
```

**No** duplicar la lista de módulos habilitados — debe vivir en un solo lugar (`db_master.js`).

**No** asumir que si el módulo está en el sidebar, el backend también está protegido — son independientes.
