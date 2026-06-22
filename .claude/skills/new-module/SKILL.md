---
name: new-module
description: Usar cuando el usuario quiere crear un módulo nuevo en FlexCRM, "agregar un módulo de X", "necesito un nuevo módulo para Y", "crear la sección de Z". Guía el proceso completo de creación siguiendo las convenciones del proyecto.
allowed-tools: Read, Write, Edit, Bash, Glob
---

Cuando se crea un módulo nuevo en FlexCRM, seguir estos pasos en orden. No saltear ninguno.

## Paso 1 — Definir el módulo

Antes de escribir código, confirmar con el usuario:
- ¿Nombre del módulo? (ej: `proveedores`)
- ¿En qué plan estará disponible? (`basico` / `pro` / `enterprise`)
- ¿Qué roles tienen acceso? (`admin` / `cajero` / `vendedor` / `deposito`)
- ¿Necesita sucursal? (¿los datos son por sucursal o por empresa?)

## Paso 2 — Backend: ruta Express

Crear `routes/[modulo].js` con esta estructura base:

```js
const express = require('express');
const router = express.Router();
const { authMiddleware, requireRol } = require('../middleware/auth');
router.use(authMiddleware);

// GET /api/[modulo] — lista con filtros
router.get('/', requireRol('cajero'), (req, res) => {
  const empDB = req.db; // SIEMPRE desde req, nunca importar directo
  const items = empDB.all('[tabla]');
  res.json(items);
});

// POST /api/[modulo] — crear
router.post('/', requireRol('admin'), (req, res) => {
  const empDB = req.db;
  const item = empDB.insert('[tabla]', { ...req.body });
  res.json(item);
});

// PUT /api/[modulo]/:id — editar
router.put('/:id', requireRol('admin'), (req, res) => {
  const empDB = req.db;
  empDB.update('[tabla]', req.params.id, req.body);
  res.json({ ok: true });
});

// DELETE /api/[modulo]/:id — eliminar (soft delete si aplica)
router.delete('/:id', requireRol('admin'), (req, res) => {
  const empDB = req.db;
  empDB.delete('[tabla]', req.params.id);
  res.json({ ok: true });
});

module.exports = router;
```

## Paso 3 — Montar la ruta en server.js

Leer `server.js` y agregar:
```js
const [modulo]Router = require('./routes/[modulo]');
app.use('/api/[modulo]', tenantMiddleware, [modulo]Router);
```
Verificar que `tenantMiddleware` ya está importado y aplicado en los otros módulos.

## Paso 4 — Schema en db_sqlite.js

Leer `db_sqlite.js` para entender cómo se define el schema. Agregar la nueva tabla en la función de inicialización:
```js
db.exec(`
  CREATE TABLE IF NOT EXISTS [tabla] (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    -- campos del módulo --
    suc_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);
```

## Paso 5 — Componente React

Crear `frontend/src/pages/[Modulo].jsx` con esta estructura base:

```jsx
import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useApi } from '../hooks/useApi';

export default function [Modulo]() {
  const { user, sucActual, toastOk, toastErr } = useStore();
  const { api } = useApi();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [sucActual]);

  async function load() {
    setLoading(true);
    const data = await api('/[modulo]');
    setItems(data || []);
    setLoading(false);
  }

  // ... CRUD handlers

  return (
    <div className="page">
      <div className="page-header">
        <h1>[Nombre del Módulo]</h1>
      </div>
      {loading ? <div className="loading">Cargando...</div> : (
        // ... tabla/lista de items
      )}
    </div>
  );
}
```

**Reglas React del proyecto:**
- Estado global → `useStore()` (Zustand), no useState para datos de negocio
- Llamadas API → siempre `useApi()`, nunca `fetch()` directo
- Notificaciones → `toastOk('mensaje')` y `toastErr('mensaje')` del store
- No pasar `stock_suc` como children directo — es un objeto JSON

## Paso 6 — Registrar en App.jsx y Sidebar

1. Agregar la ruta en `frontend/src/App.jsx`:
```jsx
import [Modulo] from './pages/[Modulo]';
// dentro de Routes:
<Route path="[modulo]" element={<[Modulo] />} />
```

2. Agregar el ítem en `frontend/src/components/Sidebar.jsx` con el ícono y el rol correcto.

## Paso 7 — Gate de plan/módulo

Verificar en `db_master.js` cómo se definen los módulos por plan y agregar `[modulo]` al plan correspondiente.

## Paso 8 — Actualizar seed_demo.js

Agregar datos de prueba para el nuevo módulo. Mínimo 3 registros con situaciones distintas.

## Paso 9 — Actualizar CLAUDE.md

Agregar el nuevo módulo a la lista de módulos en `.claude/CLAUDE.md`.

## Verificación final

```bash
npm run build:react 2>&1 | tail -5
node --check routes/[modulo].js
```

Si el build pasa y el syntax check pasa, el módulo está listo para testear.
