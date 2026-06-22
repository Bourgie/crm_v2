# FlexCRM — Módulo React

## Setup inicial (una sola vez)

```bash
cd crm_v2
npm run setup
```

## Desarrollo

**Para trabajar en React** (hot reload en puerto 5173, proxy a Express):
```bash
# Terminal 1 — Express API
npm start

# Terminal 2 — Vite React dev server
npm run dev:react
```
Accedé a: http://localhost:5173/app/

**La app vanilla** sigue en: http://localhost:3000/index.html

## Build para producción

```bash
npm run build:react
```
Esto genera `public/app/` que Express sirve en `/app/*`.

## URLs

| URL | Qué sirve |
|-----|-----------|
| `http://localhost:3000/` | Landing page |
| `http://localhost:3000/index.html` | App vanilla (todos los módulos) |
| `http://localhost:3000/app/` | App React (módulos migrados) |
| `http://localhost:3000/superadmin.html` | Panel superadmin |

## Estado de migración

| Módulo | Estado |
|--------|--------|
| Login | ✅ Migrado |
| Dashboard | ✅ Migrado |
| Clientes | 🔜 Próximo |
| Productos | 🔜 |
| Ventas | 🔜 |
| POS | 🔜 |
| Caja | 🔜 |
| Resto | ⏳ Pendiente |

Los módulos no migrados muestran un placeholder con link a la versión vanilla.
