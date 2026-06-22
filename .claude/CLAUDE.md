# FlexCRM — Contexto del proyecto

## Descripción
SaaS multi-tenant para retail argentino. Surgió como sistema para Entremimos (ropa infantil)
y evolucionó a producto comercial multi-rubro. Una DB SQLite por empresa, separación total entre tenants.

## Stack técnico
- **Backend**: Node.js + Express + SQLite (node:sqlite nativo — NO better-sqlite3, NO sequelize)
- **Frontend**: React 18 + Vite + Zustand + React Router v6 — build en `/public/app/`
- **Auth**: JWT (payload: id, empresa, rol, suc_id) + bcrypt
- **Seguridad**: Helmet + express-rate-limit
- **Email**: Nodemailer / SMTP (opcional, para reset de contraseña)
- **Deploy**: Railway
- **Export/Import**: SheetJS (xlsx) — en todos los módulos principales

## Estructura de directorios clave
```
crm_v2/
  server.js              — Entry point, monta todas las rutas
  db_master.js           — DB maestra: empresas, planes, superadmin
  db_sqlite.js           — Clase DB por empresa: CRUD genérico + helpers
  seed_demo.js           — Datos demo para testing
  middleware/
    auth.js              — JWT verify, tenant resolution, requireRol()
    tenant.js            — Inyecta req.db según header X-Empresa
  routes/                — Un archivo por módulo
  frontend/src/
    pages/               — Componentes React por módulo
    store/index.js       — Zustand: auth, datos globales, toasts
    hooks/useApi.js      — fetch wrapper con token + empresa header
```

## Startup estándar
```bash
npm run setup          # instala deps Express + React
npm run build:react    # compila frontend
node seed_demo.js      # carga datos demo
npm start              # servidor en :3000
```

## Credenciales demo
- empresa: `demo` | usuario: `admin` | contraseña: `demo123` | sucursal: `Centro`
- App: http://localhost:3000/app/
- Superadmin: http://localhost:3000/superadmin.html

## REGLAS CRÍTICAS — leer antes de tocar cualquier archivo

### Multi-tenant
- `req.db` SIEMPRE viene del middleware `tenant.js`. NUNCA importar ni instanciar la DB directo en una ruta.
- NUNCA mezclar datos de dos empresas en el mismo query.
- La DB maestra (`db_master.js`) solo conoce qué empresas existen. Los datos operativos están en la DB de cada empresa.
- El header `X-Empresa` resuelve el tenant en cada request.

### Stock
- `stock_suc` es un **objeto JSON** `{suc_id: cantidad}`, NUNCA un número escalar.
- En el frontend: acceder como `stock_suc[suc_id]`, NUNCA renderizar el objeto directo.
- React error #31 = estás pasando un objeto como children de un elemento React. Verificar `stock_suc`.

### localStorage y suc_id
- Si hay un 403 inesperado después de re-seedear, el problema es `suc_id` viejo en localStorage.
- Fix: limpiar localStorage antes del primer login tras un reset.

### str_replace
- Falla silenciosamente si el string a reemplazar no matchea exacto (incluyendo espacios y saltos de línea).
- Siempre verificar el match antes de aplicar el reemplazo.

### Roles disponibles
- `superadmin` — panel maestro (superadmin.html), no ve datos de empresas
- `admin` — todos los módulos de la empresa
- `cajero` — POS, Caja, Ventas, Clientes (lectura)
- `vendedor` — solo POS y Clientes
- `deposito` — Productos, Stock, Transferencias

### Planes comerciales
- `basico` — módulos core sin Presupuestos, Pendientes, Transferencias, Chat, Auditoría
- `pro` — agrega Presupuestos, Pendientes, Transferencias, Chat, Auditoría
- `enterprise` — agrega Lista Bebé, Backup/Restore, sucursales ilimitadas

### Archivos NUNCA tocar sin aviso explícito
- `db_master.js` — romper esto baja todos los tenants
- `middleware/auth.js` — romper esto bloquea todos los logins
- `middleware/tenant.js` — romper esto mezcla datos entre empresas
- `.env` — credenciales y JWT_SECRET

## Patrones de código establecidos

### Backend — ruta típica
```js
const empDB = req.db; // SIEMPRE desde req, nunca importar directo
router.get('/ruta', authMiddleware, requireRol('cajero'), (req, res) => {
  const items = empDB.all('tabla');
  res.json(items);
});
```

### Frontend — llamada a la API
```js
// hooks/useApi.js maneja el token y el header X-Empresa automáticamente
const { data, error } = await api('/endpoint', { method: 'POST', body: payload });
```

### Estado global (Zustand)
```js
// store/index.js — usar el store para: auth, sucursales, toasts, badges
const { user, sucActual, toastOk, toastErr } = useStore();
```

## Módulos del sistema (18 en total)
Dashboard, POS, Caja, Clientes, Productos, Ventas, Gastos, Presupuestos,
Pendientes, CtaCte, Transferencias, Reportes, Auditoría, Chat,
Usuarios, Config, Superadmin, Lista Bebé

## Flujo Pendientes (el más complejo)
POS sin stock → stock negativo + pendiente automático
Caja pedido → comprobante sin cobrar → pendiente creado
Estados: En preparación → Listo → Entrega parcial → Entregado / Cancelado
Cobros (seña/saldo) siempre pasan por Caja, no por el módulo Pendientes directamente
