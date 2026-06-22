# PequeñosCRM Pro — v2.47.0

Sistema CRM/ERP SaaS multiempresa y multisucursal para diferentes rubros.  
Backend Node.js + Frontend React con arquitectura multi-tenant sobre SQLite.

---

## Arquitectura

- **Superadmin** → gestiona empresas, planes y módulos (`master.db`)
- **Empresa CRM** → cada empresa tiene su propia base (`empresa_{id}.db`) con datos aislados
- **Frontend** SPA React con Vite + modo oscuro, responsive y PWA

## Stack

| Capa       | Tecnología                    |
|------------|-------------------------------|
| Backend    | Node.js + Express             |
| Base datos | SQLite (multi-tenant)         |
| Auth       | JWT + bcryptjs                |
| Frontend   | React + Vite                  |
| PWAs       | Service Worker + Manifest     |
| Reportes   | PDFKit (PDF), ExcelJS (.xlsx) |
| Email      | Nodemailer                    |
| AFIP       | @afipsdk/afip.js              |

## 🚀 Instalación

**Requisito:** Node.js 18+ (https://nodejs.org — versión LTS)

### Windows
```bash
doble clic en iniciar.bat
```

### Mac / Linux
```bash
chmod +x iniciar.sh && ./iniciar.sh
```

### Manual
```bash
npm install
cd frontend && npm install && cd ..
node server.js
```

Abrí → **http://localhost:3000**

### Desarrollo con React (hot reload)
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

## 📦 Módulos

| Módulo               | Descripción                                              |
|----------------------|----------------------------------------------------------|
| Dashboard            | KPIs, filtros, alertas en tiempo real                    |
| POS                  | Punto de venta con listas de precio (L1/L2/L3)           |
| Productos            | ABM, 3 listas de precio, ajustes de stock                |
| Clientes             | ABM, score automático, clasificación (VIP/Frecuente/Ocasional/Inactivo) |
| Ventas               | Historial, anulación con restitución de stock            |
| Caja                 | Apertura/cierre por sucursal, arqueo                     |
| Cuenta Corriente     | Vencimientos, recargos, interés por mora                 |
| Pendientes           | Stock reservado, señas, entrega con descuento            |
| Presupuestos         | Creación, exportación a PDF con logo                     |
| Transferencias       | Entre sucursales                                         |
| Gastos               | Registro y control                                       |
| Proveedores          | Gestión de proveedores                                   |
| Pipeline             | Seguimiento de oportunidades                             |
| Lista Bebé / Regalos | Lista de regalos y auditoría                             |
| Chat                 | Comunicación interna                                     |
| Configuración        | Usuarios, sucursales, roles, permisos                    |
| Auditoría            | Log de cambios                                           |
| Superadmin           | Gestión de empresas, planes y módulos                    |

## Funcionalidades transversales

- Login con JWT, roles y permisos (Admin / Supervisor / Vendedor / Cajero)
- Búsqueda global (Ctrl+K) y atajos de teclado (Alt+1/2/3)
- Modo oscuro, responsive, PWA instalable
- Reportes exportables a Excel (.xlsx)
- Presupuestos exportables a PDF con logo
- Sin dependencias nativas — funciona en cualquier Windows

## 💾 Datos

Las bases se guardan en `data/`:
- `master.db` — empresas, planes y módulos
- `empresa_{id}.db` — datos aislados por empresa

Hacé backup periódico de toda la carpeta `data/`.

## 🔧 Variables de entorno

Copiá `.env.example` a `.env`:

```env
PORT=3000
JWT_SECRET=tu_secreto
EMAIL_HOST=...
EMAIL_USER=...
EMAIL_PASS=...
```

## 🔧 Cambiar puerto

```bash
PORT=8080 node server.js
```
