# DASHBOARD — Contexto de Integración

KPIs, alertas, métricas y reportes del sistema. Consume datos de TODOS los módulos.

## Endpoints actuales

### `GET /dashboard`
Query params: `suc_id`, `vend_id`, `cli_id`, `fecha`
Return:
- `kpis`: ventas_hoy, ventas_mes, ticket_promedio, margen_mes, clientes, stock_critico, pendientes_sin_despachar, ctacte_vencidas, ctacte_monto_vencido
- `pipeline_tareas`, `postventas_pendientes`, `contactos_pendientes`
- `cumpleanos`
- `objetivo` (monto, ventas_mes, porcentaje, falta, mismo_mes_anio_anterior)
- `dias7`: últimos 7 días de ventas
- `por_hora`: ventas por hora hoy (array 24)
- `ultimas_ventas`: últimas 10
- `stock_critico`: productos con stock <= stock_min
- `pendientes_alerta`: pendientes demorados
- `ctacte_proximas`: deudas a vencer próximas 7 días

### `GET /dashboard/reporte`
Query params: `dias`, `suc_id`, `vend_id`
Return: KPIs generales + by_sucursal, by_vendedor, by_pago, top_productos, top_rentables

### `GET /dashboard/reporte-sucs`
Query params: `dias`
Return: Comparativo entre sucursales (ventas, margen, ticket prom.)

## Datos disponibles por módulo (para integrar)

### Gastos (`gastos` table)
- `gastos.monto`, `gastos.fecha`, `gastos.categoria_id`, `gastos.estado` (pendiente/pagado)
- Dashboard: Gastos del mes / acumulado año / vs mes anterior / top categorías

### Presupuestos (`presupuestos` table)
- `presupuestos.total`, `presupuestos.estado` (borrador/enviado/aprobado/rechazado/convertido)
- Dashboard: Presupuestos pendientes, conversion rate (convertidos/total), monto en presupuestos

### Caja (`cajas` + `movimientos_caja` tables)
- `cajas.estado` (abierta/cerrada), `cajas.fondo_inicial`, `cajas.saldo_esperado_efectivo`
- `movimientos_caja.tipo` (ingreso/egreso), `movimientos_caja.monto`
- Dashboard: Estado caja actual, saldo, ingresos/egresos del día

### Transferencias (`transferencias` table)
- `transferencias.estado` (borrador/enviada/recibida), `transferencia_items`
- Dashboard: Transferencias en tránsito pendientes de recibir

### Stock / Productos
- `productos.precio_l1`, `stock_suc.cantidad`
- Dashboard: Valor de inventario (suma precio_l1 * stock_total), productos sin rotación (sin ventas en X días), productos más rentables

### Clientes
- `clientes.creado`, `clientes.activo`
- Dashboard: Clientes nuevos este mes, clientes recurrentes (compraron este mes y también antes), top clientes por gasto

### Ventas (por vendedor / método de pago)
- `ventas.vend_id`, `ventas.pago`
- Dashboard: Top vendedores del mes, distribución por método de pago

## Estructura frontend existente

`frontend/src/pages/Dashboard.jsx`:
- Componentes: `KpiCard`, gráfico `BarChart` (recharts), tabla ventas
- Store: `useAuth` (me), `useApp` (sucSesion)
- Hook: `useApi` para llamadas REST
- Dependencias: recharts, date-fns

## Reglas de integración

1. No romper compatibilidad — agregar nuevos campos al JSON existente
2. Cachear en el frontend con useMemo / useState
3. KPIs deben ser calculables rápido (SQLite queries acotadas)
4. Respetar filtro por suc_id del usuario
5. Respetar permisos por rol (admin ve todo, vendedor ve lo suyo)
6. Auditoría no necesaria (dashboard es solo lectura)

## Próximos pasos sugeridos

1. Backend: agregar gastos_mes, presupuestos_pendientes, estado_caja, valor_inventario, top_vendedores al endpoint GET /dashboard
2. Frontend: nuevas secciones en Dashboard.jsx:
   - Fila de KPIs adicionales (gastos, presupuestos, inventario)
   - Card de "Estado de Caja"
   - Card de "Presupuestos pendientes"
   - Card de "Top Vendedores"
   - Gráfico de "Gastos vs Ventas del mes"
