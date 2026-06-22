# Manual de Usuario — PequeñosCRM Pro

Sistema CRM/ERP para retail de ropa infantil.  
Versión 2.47.0 — Arquitectura multiempresa y multisucursal.

---

## Índice

1. [Introducción](#1-introducción)
2. [Primeros pasos](#2-primeros-pasos)
3. [Dashboard](#3-dashboard)
4. [POS — Punto de Venta](#4-pos--punto-de-venta)
5. [Productos](#5-productos)
6. [Clientes](#6-clientes)
7. [Ventas](#7-ventas)
8. [Caja](#8-caja)
9. [Cuenta Corriente](#9-cuenta-corriente)
10. [Pendientes](#10-pendientes)
11. [Presupuestos](#11-presupuestos)
12. [Transferencias](#12-transferencias)
13. [Gastos](#13-gastos)
14. [Proveedores](#14-proveedores)
15. [Pipeline](#15-pipeline)
16. [Lista Bebé / Regalos](#16-lista-bebé--regalos)
17. [Chat](#17-chat)
18. [Configuración](#18-configuración)
19. [Auditoría](#19-auditoría)
20. [Superadmin](#20-superadmin)
21. [Atajos de teclado](#21-atajos-de-teclado)

---

## 1. Introducción

**PequeñosCRM Pro** es un sistema de gestión integral diseñado para comercios de ropa infantil. Soporta múltiples empresas (arquitectura multi-tenant) y múltiples sucursales por empresa.

### ¿Qué significa multi-tenant?

Cada empresa tiene sus propios datos aislados en una base de datos independiente. Un panel **Superadmin** permite gestionar las empresas, sus planes y módulos habilitados.

---

## 2. Primeros pasos

### 2.1 Acceso

1. Abrí el navegador y entrá a la URL del sistema (ej: `http://localhost:3000`)
2. Ingresá con tu usuario y contraseña

### 2.2 Roles del sistema

| Rol         | Descripción |
|-------------|-------------|
| **Admin**   | Acceso completo a todos los módulos y configuración |
| **Supervisor** | Puede ver reportes, gestionar clientes y supervisar operaciones |
| **Vendedor** | POS, clientes, presupuestos, pendientes |
| **Cajero**  | POS, caja, consulta de ventas |

### 2.3 Pantalla principal

Una vez dentro del sistema ves:

- **Sidebar** (barra lateral izquierda): acceso a todos los módulos
- **Encabezado**: usuario activo, búsqueda global (Ctrl+K), modo oscuro
- **Contenido central**: varía según el módulo seleccionado

### 2.4 Modo oscuro

Usá el botón de luna/sol en el encabezado para alternar entre modo claro y oscuro.

---

## 3. Dashboard

El Dashboard es la pantalla de inicio con los indicadores clave del negocio.

### 3.1 KPIs principales

- **Ventas del día** / **Semana** / **Mes**
- **Cantidad de ventas**
- **Ticket promedio**
- **Clientes nuevos**
- **Productos más vendidos**

### 3.2 Filtros

Usá los filtros superiores para acotar por:

- Sucursal
- Período de fechas
- Tipo de operación

### 3.3 Alertas en tiempo real

El dashboard muestra alertas cuando:

- Stock bajo de productos
- Cuentas corrientes próximas a vencer
- Pendientes sin entregar

---

## 4. POS — Punto de Venta

El POS es el módulo de venta rápida.

### 4.1 Realizar una venta

1. Seleccioná el **cliente** (o crealo rápido si es nuevo)
2. Agregá **productos** por código de barras o búsqueda
3. Elegí la **lista de precio** (L1, L2 o L3):
   - **L1**: precio público
   - **L2**: precio mayorista
   - **L3**: precio promocional
4. Ajustá cantidades desde el teclado numérico
5. Aplicá **recargos** si corresponde (ej: recargo por cuota)
6. Indicá **monto con que paga** — el sistema calcula el **vuelto**
7. Seleccioná **método de pago** (efectivo, tarjeta, cuenta corriente, mixto)
8. Confirmá la venta

### 4.2 Vuelto

El sistema calcula automáticamente el vuelto cuando ingresás el monto con que paga el cliente.

### 4.3 Anular desde POS

Si cometés un error, podés anular la venta desde el mismo POS (requiere permisos).

---

## 5. Productos

### 5.1 Listado

El módulo Productos muestra el catálogo completo. Podés:

- Buscar por nombre, código de barras o SKU
- Filtrar por categoría, sucursal (stock)
- Ver stock actual por sucursal

### 5.2 Alta de producto

1. Hacé click en **Nuevo producto**
2. Completá: nombre, código de barras, SKU, categoría, talle
3. Definí los **3 precios**:
   - Precio L1 (público)
   - Precio L2 (mayorista)
   - Precio L3 (promocional)
4. Ingresá el **stock inicial** por sucursal
5. Guardá

### 5.3 Editar producto

Hacé click en un producto para editarlo. Podés modificar precios, datos y stock.

### 5.4 Ajuste de stock

Usá la opción **Ajustar stock** para:

- Ingresar mercadería
- Egresar por rotura / vencimiento
- Corregir diferencias de inventario

Cada ajuste queda registrado en Auditoría.

---

## 6. Clientes

### 6.1 Listado

El módulo Clientes muestra todos los clientes con:

- Nombre, teléfono, email
- Score automático
- Clasificación
- Saldo de cuenta corriente

### 6.2 Score automático y clasificación

El sistema asigna automáticamente un puntaje y clasifica al cliente:

| Clasificación  | Criterio |
|----------------|----------|
| **VIP**        | Alto volumen de compra y frecuencia |
| **Frecuente**  | Compras regulares |
| **Ocasional**  | Compras esporádicas |
| **Inactivo**   | Sin compras en los últimos meses |

### 6.3 Alta / Edición

1. Hacé click en **Nuevo cliente** o seleccioná uno existente
2. Completá datos personales, teléfono, email, dirección
3. Asigná **lista de precio** por defecto (L1/L2/L3)
4. Opcional: límite de crédito para cuenta corriente
5. Guardá

---

## 7. Ventas

### 7.1 Historial

El módulo Ventas lista todas las ventas realizadas. Podés:

- Filtrar por fecha, sucursal, cliente, vendedor
- Ver detalle de cada venta (productos, montos, pagos)
- Exportar a Excel (.xlsx)

### 7.2 Anular una venta

1. Buscá la venta en el listado
2. Hacé click en **Anular**
3. Confirmá la anulación

El sistema **restituye automáticamente el stock** de los productos.

---

## 8. Caja

### 8.1 Apertura de caja

Al comenzar el día:

1. Andá al módulo **Caja**
2. Seleccioná la sucursal
3. Hacé click en **Abrir caja**
4. Ingresá el **monto inicial** (efectivo en caja)
5. Confirmá

### 8.2 Arqueo

Durante el día podés hacer arqueos parciales para controlar el efectivo.

### 8.3 Cierre de caja

Al finalizar el día:

1. Hacé click en **Cerrar caja**
2. El sistema calcula el **total debería haber** vs **total declarado**
3. Se registra la diferencia si la hay
4. Queda en Auditoría

---

## 9. Cuenta Corriente

Gestioná las cuentas corrientes de los clientes.

### 9.1 Visualizar saldo

En el módulo **Cuenta Corriente** ves:

- Cliente
- Saldo actual
- Límite de crédito
- Próximo vencimiento

### 9.2 Registrar pago

1. Seleccioná el cliente
2. Hacé click en **Registrar pago**
3. Ingresá el monto y método de pago
4. Confirmá

### 9.3 Recargos e interés por mora

El sistema aplica automáticamente:

- **Recargo** por pago fuera de término
- **Interés por mora** según días de atraso

### 9.4 Vencimientos

Podés ver un calendario de vencimientos próximos y enviar recordatorios.

---

## 10. Pendientes

Registrá ventas con **stock reservado** y **entrega diferida**.

### 10.1 Crear un pendiente

1. Andá a **Pendientes**
2. Hacé click en **Nuevo pendiente**
3. Seleccioná el cliente
4. Agregá los productos (el stock queda **reservado**)
5. Opcional: ingresá una **seña** (anticipo)
6. Definí fecha de entrega estimada
7. Guardá

### 10.2 Entregar un pendiente

1. Buscá el pendiente en el listado
2. Hacé click en **Entregar**
3. El sistema descuenta el stock y genera la venta final
4. Si hay seña, se descuenta del total

---

## 11. Presupuestos

### 11.1 Crear presupuesto

1. Andá a **Presupuestos**
2. Hacé click en **Nuevo presupuesto**
3. Seleccioná el cliente
4. Agregá productos con cantidades
5. Se calculan automáticamente los totales
6. Guardá

### 11.2 Exportar a PDF

1. Seleccioná el presupuesto
2. Hacé click en **Exportar PDF**
3. El sistema genera un PDF con:
   - Logo de la empresa
   - Datos del cliente
   - Detalle de productos y precios
   - Totales
   - Fecha de vencimiento del presupuesto

### 11.3 Convertir a venta

Un presupuesto puede convertirse directamente en una venta desde el mismo módulo.

---

## 12. Transferencias

Gestioná el traslado de stock entre sucursales.

### 12.1 Crear transferencia

1. Andá a **Transferencias**
2. Hacé click en **Nueva transferencia**
3. Seleccioná **origen** (sucursal que envía)
4. Seleccioná **destino** (sucursal que recibe)
5. Agregá productos y cantidades
6. Guardá

### 12.2 Recibir transferencia

1. Buscá la transferencia pendiente
2. Hacé click en **Recibir**
3. El stock se descuenta del origen y se suma al destino

---

## 13. Gastos

Registrá y controlá los gastos operativos.

### 13.1 Registrar gasto

1. Andá a **Gastos**
2. Hacé click en **Nuevo gasto**
3. Seleccioná: sucursal, categoría, proveedor (opcional)
4. Ingresá monto, descripción y fecha
5. Adjuntá comprobante si es necesario
6. Guardá

### 13.2 Reportes

El módulo permite filtrar por período, sucursal y categoría para analizar gastos.

---

## 14. Proveedores

### 14.1 ABM de proveedores

- **Alta**: nombre, contacto, teléfono, email, dirección, CUIT
- **Baja**: desactivar proveedor
- **Modificación**: editar datos

### 14.2 Historial

Cada proveedor muestra el historial de compras y gastos asociados.

---

## 15. Pipeline

Seguimiento de oportunidades comerciales y procesos de venta.

### 15.1 Etapas

El pipeline organiza las oportunidades en etapas:

1. Contacto inicial
2. Negociación
3. Cierre
4. Ganada / Perdida

### 15.2 Agregar oportunidad

1. Andá a **Pipeline**
2. Hacé click en **Nueva oportunidad**
3. Seleccioná cliente, producto/servicio, monto estimado
4. Asigná responsable y fecha estimada de cierre
5. Guardá

---

## 16. Lista Bebé / Regalos

Módulo para gestionar **listas de regalos** (ej: para bebés, cumpleaños, eventos).

### 16.1 Crear lista

1. Andá a **Lista Bebé / Regalos**
2. Hacé click en **Nueva lista**
3. Asigná un nombre, evento y fecha
4. Agregá productos deseados
5. Compartí el link con los invitados

### 16.2 Comprar de una lista

1. Buscá la lista por nombre o código
2. Seleccioná el producto a regalar
3. Completá la compra
4. El producto se marca como **comprado** en la lista

---

## 17. Chat

Sistema de mensajería interna entre usuarios.

### 17.1 Enviar mensaje

1. Andá a **Chat**
2. Seleccioná el destinatario (usuario o grupo)
3. Escribí el mensaje
4. Enter para enviar

### 17.2 Notificaciones

Los mensajes nuevos aparecen como notificaciones en el encabezado.

---

## 18. Configuración

### 18.1 Usuarios

Admin puede:

- Crear usuarios (nombre, email, contraseña)
- Asignar rol (Admin, Supervisor, Vendedor, Cajero)
- Activar / desactivar usuarios
- Resetear contraseñas

### 18.2 Sucursales

Gestioná las sucursales:

- Nombre, dirección, teléfono
- Activar / desactivar

### 18.3 Roles y permisos

Cada rol tiene permisos predefinidos sobre los módulos. Solo Admin puede modificar usuarios y configuraciones.

---

## 19. Auditoría

Todas las acciones importantes quedan registradas:

- Inicio/cierre de sesión
- Altas, bajas y modificaciones de productos, clientes, ventas
- Apertura/cierre de caja
- Ajustes de stock
- Cambios en configuración

El log muestra: **fecha**, **usuario**, **acción**, **detalle**.

---

## 20. Superadmin

Panel exclusivo para gestionar la plataforma completa.

### 20.1 Acceso

Ingresá a `/superadmin.html` con credenciales de superadmin.

### 20.2 Funciones

- **Empresas**: alta, baja, modificación de empresas clientes
- **Planes**: definir planes (cantidad de usuarios, módulos habilitados, storage)
- **Módulos**: habilitar/deshabilitar módulos por empresa
- **Monitoreo**: ver uso de cada empresa

---

## 21. Atajos de teclado

| Atajo      | Acción                |
|------------|-----------------------|
| **Ctrl+K** | Búsqueda global       |
| **Alt+1**  | Ir a Dashboard        |
| **Alt+2**  | Ir a POS              |
| **Alt+3**  | Ir a Clientes         |
| **Escape** | Cerrar modal / menú   |

---

*Documento generado para PequeñosCRM Pro v2.47.0*
