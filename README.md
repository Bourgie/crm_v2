# FlexCRM — v2.48.0

Sistema CRM/ERP SaaS multiempresa y multisucursal con aislamiento multi-tenant sobre SQLite.  
Backend Node.js + Frontend React (Vite). Deploy en fly.io.

---

## Stack

| Capa       | Tecnología                    |
|------------|-------------------------------|
| Backend    | Node.js + Express             |
| Base datos | SQLite (multi-tenant)         |
| Auth       | JWT + httpOnly cookies        |
| Frontend   | React + Vite + Zustand        |
| Reportes   | PDFKit (PDF), ExcelJS (.xlsx) |
| Email      | Nodemailer (SMTP)             |
| AFIP/ARCA  | @afipsdk/afip.js              |
| Deploy     | fly.io + Docker               |

## Arquitectura

- **Superadmin** (`/admin`) → gestiona empresas, planes, módulos, roles y configuración global (`master.db`)
- **Empresa CRM** → cada empresa tiene su propia base (`empresa_{codigo}.db`) con datos aislados
- **Frontend SPA** → React con lazy loading, modo oscuro, responsive, PWA instalable

## 🚀 Instalación local

**Requisito:** Node.js 18+

```bash
npm install
cd frontend && npm install && cd ..
node server.js
```

Abrí → **http://localhost:3000**

### Desarrollo con hot reload
```bash
npm run dev:react
```

## 👤 Usuarios de prueba

| Usuario | Contraseña | Rol         |
|---------|------------|-------------|
| admin   | admin123   | Admin       |
| laura   | admin123   | Supervisor  |
| marcos  | vend123    | Vendedor    |
| carlos  | vend123    | Cajero      |

## 📦 Módulos del sistema

| Módulo               | Descripción                                              | Roles de acceso                               |
|----------------------|----------------------------------------------------------|-----------------------------------------------|
| Dashboard            | KPIs, filtros, alertas en tiempo real                    | todos                                         |
| POS                  | Punto de venta con listas de precio                      | Admin, Supervisor, Vendedor, Cajero           |
| Caja                 | Apertura/cierre por sucursal, arqueo                     | Admin, Supervisor, Cajero                     |
| Clientes             | ABM, score automático, clasificación VIP                 | Admin, Supervisor, Vendedor, Cajero, Readonly |
| Ventas               | Historial, anulación con restitución de stock            | Admin, Supervisor, Vendedor, Cajero, Readonly |
| Productos/Stock      | ABM, listas de precio, ajustes de stock                  | Admin, Supervisor, Vendedor, Cajero, Readonly |
| Cta Corriente        | Vencimientos, recargos, interés por mora                 | Admin, Supervisor                             |
| Presupuestos         | Creación, exportación a PDF con logo                     | Admin, Supervisor, Vendedor                   |
| Pendientes           | Stock reservado, señas, entrega parcial                  | Admin, Supervisor, Vendedor, Cajero           |
| Gastos               | Registro y control                                       | Admin, Supervisor                             |
| Transferencias       | Entre sucursales                                         | Admin, Supervisor                             |
| Proveedores          | Gestión de proveedores y órdenes de compra               | Admin, Supervisor                             |
| Reportes             | Exportación Excel                                        | Admin, Supervisor, Readonly                   |
| Auditoría            | Log de cambios                                           | Admin, Supervisor                             |
| Chat                 | Comunicación interna entre sucursales                    | Admin, Supervisor, Vendedor, Cajero           |
| Pipeline             | Seguimiento de oportunidades                             | Admin, Supervisor                             |
| ARCA Facturación     | Facturación electrónica AFIP                             | Admin, Supervisor                             |
| Tienda               | Sincronización con tienda online                         | Admin, Supervisor                             |
| Webhooks             | Integraciones externas                                   | Admin, Supervisor                             |
| RRHH                 | Recursos humanos, ausencias, asistencias                 | Admin, Supervisor                             |
| Lista de Regalos     | Lista de regalos y auditoría                             | Admin, Supervisor                             |

## 🛡️ Seguridad multi-tenant

- **Bases de datos separadas** por empresa: los datos de cada tenant están aislados
- **JWT en cookie httpOnly**: el token de acceso no es accesible desde JavaScript (mitiga XSS)
- **Refresh token rotativo**: cada refresh invalida el token anterior
- **Validación de sucursal**: los endpoints de caja y ventas verifican que el usuario tenga acceso a la sucursal
- **Rate limiting**: login, forgot-password y signup tienen límite de intentos con bloqueo progresivo
- **Lockout de cuenta**: después de N intentos fallidos, la cuenta se bloquea temporalmente
- **CSRF protegido**: cookies httpOnly + token CSRF
- **CSP + Helmet**: encabezados de seguridad HTTP

## 👤 Roles del sistema

| Rol        | Acceso                                               |
|------------|------------------------------------------------------|
| Admin      | Todos los módulos y configuración                    |
| Supervisor | Gestión operativa sin acceso a configuración         |
| Vendedor   | POS, clientes, productos, presupuestos, pendientes   |
| Cajero     | POS, caja, clientes, productos, pendientes           |
| Readonly   | Dashboard básico, consulta de ventas/clientes/prods  |

## 💾 Datos

Las bases se guardan en `data/`:
- `master.db` — empresas, planes, módulos, roles
- `empresa_{codigo}.db` — datos aislados por empresa

Hacé backup periódico de toda la carpeta `data/`.

## 🔧 Variables de entorno

```env
PORT=3000
JWT_SECRET=tu_secreto_fuerte
NODE_ENV=production
```

**Importante:** `JWT_SECRET` es obligatorio. Sin él, el servidor no arranca.

## Dominios

- `flexcrm.com.ar` → Landing page (Cloudflare Pages)
- `app.flexcrm.com.ar` → CRM app (fly.io)
- `admin.flexcrm.com.ar` → Superadmin (fly.io)
- `unfulanodev.com.ar` → Portfolio personal (Cloudflare Pages)

## Deploy

```bash
fly deploy --remote-only
```
