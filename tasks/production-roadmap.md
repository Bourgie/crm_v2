# FlexCRM — Producción, cocinas y depósitos

## 1. Entrega y base de análisis

Plan integral de producto, arquitectura, implementación, migración, pruebas y prompts para OpenCode. Preparado el 30/09/2026, Argentina.

Repositorio: https://github.com/Bourgie/crm_v2
Commit leído: `7177fbfd5955508546bbe72d2902c2bf403dc1d9`.

Se revisaron usuarios/login, roles, permisos, sucursales, módulos/planes, stock, transferencias, POS, ventas, pendientes, sincronización offline y estructura de pruebas. Los hallazgos son de revisión estática; no se ejecutó el CRM ni sus pruebas y no se modificó el repositorio. Los nombres de tablas, archivos y endpoints nuevos de este documento son propuestas. Antes de implementar se debe contrastar el checkout actual.

La integración ARCA se mantiene como proyecto separado. No mezclar sus migraciones ni facturación fiscal con esta entrega.

## 2. Objetivo aprobado por el usuario

Una empresa configura una sucursal de tipo Producción, Depósito, Comercial o Mixta. Asigna usuarios a ubicaciones y perfiles. Un operario entra directamente a su cocina y registra preparaciones. El sistema consume materias primas, registra productos terminados o intermedios, lotes, merma y costos. La cocina abastece varias sucursales mediante transferencias; también prepara pedidos ingresados por POS.

Requisitos confirmados:

- Nombre genérico del módulo: **Producción**, código `produccion`.
- Cocina/depósito como ubicación dentro del modelo existente de sucursales.
- Producto terminado queda en el stock de la ubicación que prepara, hasta transferirlo o entregarlo.
- Una empresa tiene cuatro sucursales comerciales; una o dos pueden tener cocina. También se admite cocina central independiente.
- Abastecimiento por compras directas y transferencias.
- Recetas con rendimiento base, escalables por unidad o lote.
- Conversiones kg/g, l/ml y unidades; presentaciones de compra por bolsa/caja.
- Preparaciones intermedias: masa, crema, relleno, etc., con stock propio consumible por otras recetas.
- Faltante: bloquear normalmente, permitir finalización con autorización puntual de encargado y motivo.
- Registrar consumo real, merma y rendimiento real.
- Costos de ingredientes por receta/lote/unidad; mano de obra y costos indirectos quedan para una ampliación posterior.
- Lotes, vencimientos y trazabilidad desde el inicio.
- Pedidos por encargo se originan en el POS existente.
- Perfiles nuevos combinables: Operario de producción, Encargado de producción y Responsable de depósito.
- Producción administrable por SuperAdmin: planes, extras, bloqueos y habilitación por empresa. Deshabilitar conserva todos los datos.

Decisiones propuestas para poder implementar sin una ronda adicional de preguntas:

- Roles con permisos predefinidos y ajustes explícitos por usuario, limitados a un catálogo. No construir un diseñador ilimitado de roles en esta versión.
- Todas las ubicaciones cuentan inicialmente para `sucursales_max`, tal como hoy. Mostrarlo claramente al crear cocina central. Separar cupos comerciales/depósitos sería una decisión de precios posterior.
- Producción incluye su inventario operativo, recetas, órdenes y transferencias de sus materiales. No exige contratar pantallas financieras de Proveedores para registrar una recepción física.
- Recetas de toda la empresa, restringibles a ubicaciones habilitadas; stock y órdenes siempre localizados.
- Finalización atómica online. Se pueden guardar borradores, pero no consumir, entregar ni autorizar faltantes offline.
- Admin tiene permisos funcionales amplios pero sigue sujeto a empresa, módulo y capacidades de ubicación. Encargado no obtiene permiso de caja por su perfil.
- Aprobación con usuario/contraseña personales del encargado; no contraseña compartida de cocina.
- Perfiles antiguos se conservan; no conceder nuevos permisos de producción automáticamente a todos los supervisores.
- Para una ubicación Mixta se conserva un único saldo por artículo/ubicación en esta versión. Si requieren separar físicamente mostrador y cocina, crear ubicaciones distintas; no duplicar saldos invisibles.

## 3. Cómo lo usa el cliente

### 3.1 Alta inicial

SuperAdmin agrega Producción al plan o a la empresa. El dueño crea “Cocina central”, tipo Producción, o habilita producción en una sucursal Mixta. Crea usuarios, elige perfiles, sucursales permitidas y ubicación predeterminada. Un usuario con una sola ubicación ingresa allí sin selector.

Para cocinero la pantalla inicial es **Producción / Hoy**; para depósito es **Inventario / Recepciones**; para perfiles comerciales se conserva su entrada actual salvo elección válida del admin. Si tiene varios perfiles, se puede elegir pantalla inicial entre las permitidas. Sin ubicación habilitada no se entra a otra por defecto.

### 3.2 Preparar stock

Ejemplo de receta “Tarta de frutas”, rendimiento 1 tarta:

| Ingrediente | Cantidad base |
|---|---:|
| Harina | 300 g |
| Frutas | 500 g |
| Crema preparada | 200 g |

Registrar 10 tartas propone 3 kg de harina, 5 kg de frutas y 2 kg de crema. El operario revisa lotes y registra consumos reales, 9 tartas buenas y 1 descartada. Al finalizar se registran de una vez los consumos, la merma y el lote de 9 productos vendibles. No descontar otra vez los ingredientes de la crema: ya se consumieron al producirla.

La merma de ingredientes y el desperdicio de producto terminado se registran por separado. El costo del lote refleja todos los ingredientes realmente consumidos, incluyendo desperdicio; el costo por unidad vendible se divide por 9. No crear stock negativo de producto terminado para expresar merma.

### 3.3 Abastecer locales

Cocina central produce 40 tartas; quedan allí. Prepara transferencia de 15 a local 2 y 10 a local 3. Se distingue disponible, reservado y en tránsito. La recepción suma solamente cantidades efectivamente recibidas y conserva lotes/vencimientos/reservas.

Una diferencia no regresa mágicamente al origen. Se registra como pendiente de recepción, devolución física o merma de transporte, según lo confirmado. El flujo actual que devuelve automáticamente al origen lo no recibido debe adaptarse para artículos gestionados por lotes.

### 3.4 Torta por encargo

POS del local 3 registra el pedido y entrega prometida. Se elige cocina responsable y receta. La cocina ve especificaciones, cantidades y fecha; no necesita ver toda la cuenta corriente del cliente. El producto terminado queda reservado para ese pedido. Si se entrega en local 3, la reserva acompaña la transferencia. La entrega libera la reserva y descuenta existencia una sola vez; no vuelve a consumir materias primas.

## 4. Base real del CRM y correcciones previas

| Área/archivo existente | Hallazgo | Acción |
|---|---|---|
| `middleware/auth.js` | `PERMISOS`, multirol, `requireRol`, `requirePermiso`, `permiteSucursal` | Usar catálogo central; nueva autorización por acción, empresa y ubicación |
| `middleware/validate.js` + `routes/auth.js` | Alta valida esquema sin `roles` ni `suc_sesiones_permitidas`; reemplaza `req.body` con datos parseados | Incluir y validar esos campos; pruebas de alta y edición |
| `UsuariosConfig.jsx` | Dice que cero sucursales seleccionadas significa todas | Cambiar a regla inequívoca y migrar asignaciones con reporte |
| `Login.jsx`, `Sidebar.jsx` | Lista vacía muestra todas; backend usa `suc_id`; login termina en Dashboard | Normalizar misma política en servidor y UI, inicio según permisos |
| `frontend/src/App.jsx`, `RequireAuth.jsx` | Guard general de autenticación; sin protección común por acción/módulo en cada ruta | Guard específico alimentado por capacidades reales del backend |
| `db_master.js`, `routes/superadmin.js` | Módulos en plan/extras/bloqueos; copia efectiva a config tenant | Resolución central y actualización tras cambios, invalidación de cache |
| `routes/config.js` | Admin tenant puede enviar configuración libre, incluido `modulos_habilitados` | Impedir escritura de derechos comerciales por tenant |
| `middleware/tenant.js` | Falta/config errónea de módulos y excepciones permiten continuar | En producción nueva denegar ante autorización indeterminada |
| `Sidebar.jsx`, `Superadmin.jsx` | Catálogos de roles por módulo diferentes del backend | UI consume metadata/capacidades centrales; no duplicar política |
| `routes/entidades.js`, `Sucursales.jsx` | Sucursal sin tipo/capacidades, límites por plan existentes | Tipos, capacidades y acceso; preservar límites actuales |
| `db_sqlite.js`, `routes/stock_helpers.js` | Stock por sucursal; variantes limitan negativo a cero | Gateway de inventario; nada de truncar consumos autorizados |
| `productos.js` | Ajuste variante sin control de sucursal equivalente al ajuste normal | Control de recurso/sucursal y validadores compartidos |
| `transferencias.js` | Envío/recepción por sucursal; controles incompletos en lectura/alta/edición | Verificar acceso a cada operación y detalle; permitir escoger destinos sin abrir sus datos |
| `transferencias.js`, `ventas.js`, `pendientes_ctacte.js` | `parseInt` de cantidades, movimientos repartidos | Cantidades precisas y gateway común para artículos gestionados |
| `pendientes_ctacte.js` | Al crear pendiente vuelve a sumar stock; luego descuenta en entrega/cancelación | Separar política legacy de nuevo pedido a fabricar; no sumar producto inexistente |
| `routes/sync.js` | Aplica operaciones offline en funciones independientes | Evitar bypass de permisos, stock o reservas; rechazar nuevas operaciones online-only |
| `test/security-tenant.test.js` | Tests de empresa y sucursal con DB aisladas | Extender pruebas al nuevo módulo y fallos detectados |

Estos problemas se corrigen en bloques separados del módulo; no rehacer de una vez todo el CRM. La revisión debe cubrir también caminos de borrado, anulación, importación, sincronización, devoluciones y ajustes que escriben el stock.

## 5. Autorización: una política común

Cada operación requiere las cuatro condiciones:

1. Empresa activa y sesión válida.
2. Módulo que habilita la operación disponible por plan y excepciones de SuperAdmin.
3. Permiso de la acción para ese usuario.
4. Ubicación/recurso dentro de sus asignaciones y con capacidad necesaria.

Modificar `suc_id` en query/body o localStorage no concede acceso. El backend valida origen del recurso persistido. Seleccionar una sucursal de destino para enviar no implica permiso de ver sus inventarios, ventas o costos. Recepción solo por usuario autorizado en destino.

### 5.1 Módulos y planes

Resolución efectiva propuesta:

`módulos efectivos = (módulos del plan ∪ extras) − bloqueados`, intersectados con catálogo activo.

Fuente autoritativa: master DB. La copia tenant solo se admite como cache versionada o compatibilidad, nunca como fuente editable por el cliente. Ante fallo de resolución no asumir todos habilitados. No eliminar recetas/stock al desactivar el módulo; cerrar acceso operativo. Restablecer acceso recupera datos.

Implementar política de transición para empresas legacy sin configuración: migrar módulos efectivos a partir de plan/excepciones, no convertir silenciosamente todas las empresas a acceso ilimitado ni bloquear indiscriminadamente las existentes.

Producción incluye endpoints limitados de recepción/transferencia de artículos bajo su inventario. Reutilizan los servicios de inventario y transferencias pero no abren las pantallas completas de finanzas/proveedores a un operario. El módulo Transferencias puede autorizar operaciones generales con su propio permiso. El servicio verifica el alcance de cada llamada; no hacer una condición amplia “produccion OR transferencias” que permita todo a cualquiera.

### 5.2 Permisos propuestos

| Permiso | Operario | Encargado | Depósito |
|---|---:|---:|---:|
| `produccion.ver` | Sí | Sí | Opcional |
| `recetas.ver` | Sí, sin costos | Sí | Opcional |
| `recetas.editar` | No | Sí | No |
| `produccion.crear` | Sí | Sí | No |
| `produccion.finalizar` | Sí | Sí | No |
| `produccion.revertir` | No | Sí | No |
| `produccion.merma` | Sí, en sus órdenes | Sí | No |
| `produccion.autorizar_faltante` | No | Sí | No |
| `costos.produccion.ver` | No | Sí | No por defecto |
| `inventario.ver` | Sí, ubicación autorizada | Sí | Sí |
| `inventario.recibir` | No | Opcional | Sí |
| `inventario.ajustar` | No | Opcional | Sí |
| `inventario.merma` | No, fuera de su orden | Sí | Sí |
| `transferencias.crear` | No | Opcional | Sí |
| `transferencias.enviar` | Opcional | Sí | Sí |
| `transferencias.recibir` | Opcional | Sí | Sí |
| `pedidos.produccion.ver` | Sí, proyección operativa | Sí | Solo despacho autorizado |
| `pedidos.produccion.asignar` | No | Sí | No |

Admin mantiene gestión de usuarios/sucursales; no dar esos permisos al encargado. Costos se filtran de respuestas API, exports e impresiones, no solo de columnas React. El catálogo no permite que un usuario se conceda permisos a sí mismo.

Perfil asigna permisos base; admin puede conceder o revocar permisos del catálogo por usuario. Prioridad propuesta: revocación explícita domina unión de roles, salvo privilegios estructurales del admin; documentar y probar. No permitir quitar al último admin activo su rol de administración sin sustituto. Los roles heredados no se rediseñan por accidente al centralizar.

### 5.3 Autorización de encargado

Ante faltante, mostrar artículo, requerido, disponible, diferencia y motivo. Solicitar usuario y contraseña del encargado con permiso y acceso a esa ubicación. Validar en backend contra empresa actual, usuario activo, intentos limitados y credencial protegida; no mostrar/guardar contraseña en logs ni estado persistido.

Crear autorización breve, de un solo uso, vinculada a usuario ejecutor, orden, ubicación, versión de receta, consumos y faltantes concretos. Guardar hash de intención. Cambiar datos invalida autorización. Consumir autorización y finalizar en la misma transacción. Dos clics no pueden usarla dos veces. Auditoría registra operario y encargado separadamente. No cambiar la sesión del operario por la del encargado.

La autorización permite déficit registrado, no inventar lotes ni omitir consumo. No autoriza usar lotes vencidos. Reversión/merma/ajuste son acciones distintas con permisos propios.

## 6. Ubicaciones y experiencia de usuario

Conservar `sucursales` e IDs actuales; agregar `tipo` y capacidades `vende`, `produce`, `almacena`. El tipo es un preset fácil de entender; backend valida capacidades combinables. Las sucursales existentes migran a Comercial con almacenamiento. No activarlas todas como cocina.

Usuario: sucursales permitidas, sucursal predeterminada, permisos y pantalla inicial. Predeterminada debe pertenecer a su lista y estar activa. `suc_id` mantiene compatibilidad; distinguir asignación de ubicación de selección de sesión. LocalStorage debe incluir empresa/usuario o invalidarse al cambiar identidad. Admin no necesita cambiar su sucursal de trabajo para consultar, pero una escritura siempre exige ubicación explícita válida.

En ubicación Producción/Depósito, no ofrecer POS/caja salvo capacidad comercial y permiso. Rechazar también sus operaciones API. En Mixta, ofrecer menús conforme a ambos permisos. Cambiar tipo con stock/pedidos/órdenes activos requiere validación y no elimina movimientos.

Panel operativo de Producción:

- **Hoy:** órdenes, pedidos por fecha, faltantes y vencimientos.
- **Recetas:** buscador, rendimiento y detalles; costos solo con permiso.
- **Preparar:** cantidad, ingredientes previstos, lotes propuestos, consumo real, rendimiento/merma.
- **Inventario:** materias primas, intermedios y terminados; disponible/reservado/faltantes.
- **Ingresos:** recepción con presentación, proveedor, lote y vencimiento.
- **Distribución:** envío, en tránsito, recepción y diferencias.
- **Historial:** preparaciones, consumos, correcciones y responsables.

Esconder secciones no autorizadas y proteger URLs directas. Pantallas de producción deben usarse en tablet, con botones claros y sin obligar a recorrer Ajustes para cada preparación.

## 7. Inventario preciso y lotes

### 7.1 Catálogo y unidades

Reutilizar `productos` como catálogo de artículos con clase: comercial, materia prima, intermedio o terminado; puede ser vendible y consumible a la vez si está permitido explícitamente. Flags propuestos: `gestion_produccion`, `vendible`, `consumible`, unidad base, precisión y requerimiento de lote/vencimiento. El POS excluye artículos no vendibles.

No cambiar todo el stock existente de una vez: activar inventario con lotes por artículo/empresa mediante migración explícita. A partir de activación, todos los escritores de ese artículo usan el mismo gateway. No permitir saldo legacy y saldo por lotes independientes.

Representación precisa propuesta: cantidades como enteros escalados en unidad base; masa en mg, volumen en µl, conteo en unidades escaladas según precisión configurada. Mostrar g/kg, ml/l y unidades. Validar límites de entero seguro y precision; conversiones exactas donde sea posible. Documentar redondeo al escalar recetas. No `parseInt` ni sumas repetidas con floats.

La bolsa de 25 kg es una presentación del artículo Harina, no una nueva harina ni una conversión universal de bolsa. Caja de 12 huevos define 12 unidades. No convertir kg a litros sin una relación específica y justificada por artículo. Cantidades de venta fraccionarias se habilitan únicamente en artículos configurados; no cambiar por defecto el comportamiento de ropa u otros rubros.

### 7.2 Saldo y trazabilidad

Libro de movimientos inmutable para artículos gestionados, con cantidad exacta, lote, ubicación, usuario, operación y causa. Tablas de saldos son proyecciones reconciliables del libro. `stock_suc` puede conservarse como proyección compatible, escrita solo por el gateway. Registrar unicidad por operación/linea para idempotencia.

Disponibilidad comercial: existencia utilizable menos reserva firme. Vencido, bloqueado y en tránsito no están disponibles. La demanda sin existencia es demanda pendiente, no reserva de un lote ficticio. Separar reserva para pedido terminado de reserva de ingredientes para orden; el MVP reserva producto terminado y la orden revalida insumos al finalizar.

Lotes: proveedor/recepción o producción origen, fechas, vencimiento, estado, costo y balances por ubicación. Selección FEFO: primero el que vence antes; si no vence, FIFO. Permitir elegir otro lote utilizable con motivo, sin exceder su disponible. Vencimientos por fecha se interpretan en zona horaria Argentina. Productos con vencimiento obligatorio no se reciben sin fecha válida.

Intermedio y terminado tienen lote de producción y referencias a los lotes efectivamente consumidos. Lote transferido conserva identidad/origen/costo/vencimiento, con saldos por ubicación. Una política de duración de receta sugiere vencimiento; advertir si supera límites de ingredientes usados y pedir revisión conforme a configuración del negocio. El sistema no determina por sí solo una vida útil sanitaria.

### 7.3 Consumo con faltante autorizado

Los lotes físicos no bajan de cero. Consumir disponible real y registrar diferencia como consumo no asignado a lote/faltante de inventario, ligado a autorización. El saldo total reconciliado puede ser negativo por ese déficit. Mostrar trazabilidad incompleta y costo provisional; nunca crear un lote de compra ficticio.

Regularización posterior mediante documento explícito: recepción omitida del lote realmente usado, corrección de consumo o ajuste de inventario verificado. No atribuir automáticamente un lote recibido después a una producción anterior como si hubiera sido su ingrediente. La regularización resuelve cantidad/costo pendientes sin descontar dos veces; conserva historial. Si no se identifica el lote real, la excepción de trazabilidad permanece visible.

### 7.4 Integridad

Finalizar preparación consume insumos, registra mermas, crea lote de salida, reserva pedido si corresponde, consume autorización y audita en una transacción corta SQLite. Dos órdenes concurrentes que intentan consumir lo mismo revalidan dentro de transacción. Una falla revierte todo; doble clic devuelve resultado ya confirmado.

Inventario y transferencias también requieren transacciones, idempotencia y control de versión. No eliminar movimientos de una preparación finalizada. Reversión compensatoria solo si los productos no se consumieron/vendieron/trasladaron; si hubo uso posterior, registrar corrección contextual, no rebobinar saldos arbitrariamente.

## 8. Recetas, órdenes y costos

Receta: nombre, artículo de salida, rendimiento base/unidad, ingredientes con cantidades/unidades, instrucciones, tiempo orientativo, duración de lote y ubicaciones habilitadas. Versiones publicadas inmutables; edición genera versión nueva. Preparación conserva snapshot de versión/consumos/resultado. No borrar recetas utilizadas, archivar.

Recetas intermedias forman un grafo sin ciclos: no admitir A usa B usa A. Una receta consume stock de intermedio existente; si falta, sugerir orden de producción del intermedio, no consumir implícitamente sus ingredientes sin una preparación registrada.

Orden: ubicación preparadora, receta/version, rendimiento previsto, destino de stock/pedido, fechas, usuario y estado. Estados propuestos: borrador, pendiente, en preparación, finalizada, cancelada. Producción parcial se registra mediante ejecuciones/lotes contra la misma orden con idempotencia propia; avance no duplica cierre anterior. Se permite pedido de 1 torta o tandas de 100.

Costo real de lote = suma de consumo real × costo conservado de cada lote + ajustes explícitos. Intermedio usa costo de su lote. Transferencia conserva costo; recepción física y compra financiera no deben duplicar inventario ni deuda. No agregar automáticamente mano de obra ni IVA financiero no definido.

Costo por unidad vendible = costo real / rendimiento bueno. Si rendimiento bueno es cero, registrar producción fallida y pérdida sin dividir por cero. Estimación de receta usa costo de referencia documentado y se etiqueta como estimado; no reemplaza el costo histórico. Faltante sin costo definitivo deja costo provisional. Ajuste posterior registra nueva valoración con evidencia, no edita silenciosamente costo reportado.

Desvío de ingredientes por operario puede registrarse dentro de tolerancias configuradas. Cambios relevantes respecto a receta requieren encargado y motivo; no permitir que “consumo real” se convierta en un ajuste libre de inventario.

## 9. Pedidos del POS y movimientos comerciales

Reutilizar `pendientes` y su vínculo con `ventas` para la parte comercial donde corresponda; agregar vínculos a órdenes por línea, sin una segunda cuenta corriente o un segundo cobro. Antes de implementar mapear exactamente el flujo de pedido actual.

Agregar explícitamente modalidad por línea: venta inmediata o por encargo/a fabricar. Pedido guarda sucursal comercial, cocina asignada, sucursal de entrega, fecha comprometida y especificaciones. Carrito mixto puede separar ambas modalidades sin duplicar total, seña ni deuda.

Para nuevo pedido a fabricar:

1. Registrar demanda; no descontar ni volver a sumar producto que aún no existe.
2. Reservar solo stock terminado real si se decide usarlo; diferencia queda como producción pendiente.
3. Asignar cocina/orden; producir genera saldo real y reserva vinculada.
4. Despachar mantiene reserva durante traslado.
5. Recepción confirma saldo reservado en destino.
6. Entrega parcial/final descuenta cantidad real una sola vez y actualiza reserva/estado.
7. Cancelación libera reservas y cancela órdenes no ejecutadas; producto ya preparado permanece en stock o se registra merma, no desaparece.

Compatibilidad: pedidos legacy conservan su política identificada/versionada. No volver a sumar o restar sus saldos por adoptar reglas nuevas. Backfill clasifica vínculos y reporta inconsistencias. Para artículos gestionados, venta inmediata y devolución usan lotes/gateway; no basta modificar solo la pantalla POS. Pedido financiero no debe activar otra factura ni cobro al terminar producción.

## 10. Datos propuestos y servicios

### 10.1 Tablas nuevas por empresa

| Tabla propuesta | Propósito |
|---|---|
| `production_recipes` | Identidad, salida, estado y publicación |
| `production_recipe_versions` | Rendimiento/instrucciones/configuración inmutable |
| `production_recipe_ingredients` | Cantidades normalizadas y artículos intermedios |
| `production_orders` | Planificación, ubicación, pedido y versión |
| `production_runs` | Ejecución parcial/final, consumos/resultados y costo |
| `production_consumptions` | Lotificación de insumos reales y faltantes |
| `inventory_presentations` | Bolsa/caja y factor por artículo |
| `inventory_lots` | Identidad/origen/vencimiento/costo |
| `inventory_movements` | Libro inmutable con operación única |
| `inventory_balances` | Proyección por artículo/lote/ubicación |
| `inventory_reservations` | Producto real asignado a pedido/línea |
| `inventory_deficits` | Consumo no asignado, autorización y regularización |
| `inventory_transfer_allocations` | Cantidades/lotes/reservas enviadas y recibidas |
| `operation_approvals` | Autorización breve, hash intención, autor y consumo único |
| `operation_idempotency` | Resultado por clave de operación y hash |

Campos nuevos en existentes: sucursales tipo/capacidades; usuarios ubicación predeterminada, pantalla inicial, permisos concedidos/revocados; productos gestión/clase/unidades/precisión; pendientes/items modalidad/vínculo producción; transferencias versión de política y asignaciones de lotes. Mantener IDs y archivos SQLite por empresa.

Definir claves únicas, foreign keys, índices por ubicación/estado/fecha/vencimiento, y migraciones idempotentes en `createDB`. Revisar arrays de columnas, serialización `data`, exports/imports y backup. No asumir que agregar SQL basta para que la capa genérica persista un campo.

### 10.2 Servicios propuestos

- `lib/access-policy.js`: permisos/capacidades/metadata y helpers centrales, con compatibilidad de roles existentes.
- `lib/module-entitlements.js`: resolución autoritativa desde master y revisiones de acceso.
- `lib/inventory/`: cantidades, lotes, movimientos, reservas, déficits y gateway.
- `lib/production/`: recetas, ordenes, ejecución, costos, aprobación y trazabilidad.
- `routes/production/`: controladores Express delgados, validación y serializers.
- `frontend/src/pages/Produccion/`: componentes por función, API/hook y wizard inicial.
- Tests nativos en `test/production/`, frontend siguiendo Vitest/Testing Library existentes.

Ejemplo de estilo esperado (propuesta, no código ya implementado):

```js
router.post('/orders/:id/finish', requirePermiso('produccion.finalizar'), async (req, res) => {
  const result = productionService.finish({
    db: req.db,
    actor: req.user,
    orderId: req.params.id,
    input: req.body,
    idempotencyKey: req.get('Idempotency-Key'),
  });
  res.json(result);
});
```

Ese ejemplo supone autenticación/módulo previos y validación de ubicación/estado dentro del servicio. No usarlo como permiso suficiente por sí solo.

## 11. Contratos API propuestos

| Ruta propuesta | Operación |
|---|---|
| `GET /api/auth/capabilities` | Roles, permisos efectivos, ubicaciones, inicio y módulos públicos |
| `GET /api/production/overview?suc_id=...` | Hoy, faltantes y alertas autorizadas |
| `GET/POST /api/production/recipes` | Listar/crear recetas |
| `POST /api/production/recipes/:id/versions` | Crear nueva versión |
| `POST /api/production/recipes/:id/publish` | Validar/publicar versión |
| `GET/POST /api/production/orders` | Planificar/listar órdenes |
| `POST /api/production/orders/:id/start` | Iniciar preparación |
| `POST /api/production/orders/:id/preview` | Ingredientes/lotes/faltantes previstos, sin mover stock |
| `POST /api/production/approvals` | Autorización puntual, sin cambio de sesión |
| `POST /api/production/orders/:id/finish` | Ejecución atómica parcial/final |
| `POST /api/production/runs/:id/reverse` | Reversión compensatoria autorizada |
| `GET /api/production/inventory` | Existencias operativas de ubicación permitida |
| `POST /api/production/receipts` | Recepción física con proveedor/presentación/lote |
| `POST /api/production/inventory-adjustments` | Ajuste explicado y auditado |
| `POST /api/production/deficits/:id/settle` | Regularización trazable |
| `GET /api/production/lots/:id/trace` | Consumos/producciones/transferencias/entregas relacionados |
| `GET /api/production/costs` | Reporte solo con permiso |

Reutilizar rutas de usuarios/sucursales/transferencias/pedidos cuando no colisione contrato. Las rutas de producción no conceden permisos generales sobre módulos financieros.

Mutaciones tienen Idempotency-Key y hash de contenido; mismo contenido devuelve mismo resultado, clave reutilizada con contenido distinto devuelve 409. Estados obsoletos/control de versión devuelven 409. Cantidades/CUIT no relacionados aquí se validan según contexto; errores no exponen SQL ni secretos. Lecturas paginadas con límites; filtros por sucursal no sustituyen autorización. Autorización vencida/devuelta no sirve para nueva orden.

## 12. Plan de implementación por tareas

Todas las tareas son propuestas, pendientes de implementación. Tamaño objetivo M: 3–5 archivos principales por sesión, más pruebas; dividir si supera ese alcance. Cada sesión deja sistema usable y registra evidencia. Los archivos nuevos mencionados son orientativos. Checkpoint significa revisar resultados y contratos antes de avanzar, no emitir cambios de producción.

### Fase A — Accesos y derechos comerciales

**P00 — Especificación y línea base.** Dependencia: ninguna. Archivos: `tasks/production-spec.md`, `tasks/plan.md`, `tasks/todo.md`.
- [ ] Contrastar SHA y hechos del roadmap con checkout, mantener requisitos confirmados.
- [ ] Documentar API, reglas de stock, permisos y migración antes de construir.
- [ ] Ejecutar línea base aislada o registrar bloqueos concretos sin inventar resultados.
Verificar: revisión de documentos; `npm run test:backend`, `npm test`, `npm run build` cuando dependencias estén instaladas. M.

**P01 — Alta/edición de usuario correcta.** Dep: P00. Archivos: `middleware/validate.js`, `routes/auth.js`, `UsuariosConfig.jsx`, pruebas.
- [ ] Alta guarda multirol y sucursales; enum/lista de roles e IDs válidos de misma empresa.
- [ ] Edición normaliza rol principal/lista y conserva campos no enviados; no acceso implícito a todas.
- [ ] Migración/report de usuarios sin asignación y último admin protegido.
Verificar: API create/update, roles combinados, arrays vacíos, ID otra empresa y update parcial. M.

**P02 — Catálogo de permisos y respuesta de capacidades.** Dep: P01. Archivos: `lib/access-policy.js`, `middleware/auth.js`, `routes/auth.js`, pruebas.
- [ ] Roles antiguos conservan permisos y nuevos roles se definen por acciones, sin supervisor comercial implícito.
- [ ] Grants/revocations validados y combinación determinista; capacidades públicas sin costos/secretos.
- [ ] API recarga usuario vigente, cambios de permiso afectan siguientes operaciones.
Verificar: tabla de perfiles, usuario desactivado, grant/revoke y admin último. M.

Checkpoint A1: crear usuario Operario con Cocina central funciona, sin permisos comerciales adicionales; actualizar no pierde sucursales.

**P03 — Derechos de módulos autoritativos.** Dep: P02. Archivos: `lib/module-entitlements.js`, `middleware/tenant.js`, `routes/config.js`, pruebas.
- [ ] Plan/extras/bloqueos/catalogo determinan permisos comerciales; tenant no escribe habilitación.
- [ ] Config faltante/corrupta no habilita todo; legacy migrado con reporte.
- [ ] Cache versionada/invalida y error de master produce denegación/503 controlada.
Verificar: plan sin módulo, extra, bloqueo dominante, fallo de config/master y escritura prohibida. M.

**P04 — Cambios de plan y registro Producción.** Dep: P03. Archivos: `db_master.js`, `routes/superadmin.js`, `Superadmin.jsx`, pruebas.
- [ ] Módulo se agrega a catálogo/planes/extras/bloqueos; no se habilita a todas empresas automáticamente.
- [ ] Editar plan o empresa recalcula acceso manteniendo excepciones y límites definidos.
- [ ] Deshabilitar conserva datos; admin tenant no puede reactivar fuera del plan.
Verificar: alta/cambio/baja de plan y reactivación en dos empresas. M.

Checkpoint A2: módulo deshabilitado devuelve 403 aun con URL/API directa; SuperAdmin puede volver a habilitar sin perder datos.

### Fase B — Ubicaciones e ingreso

**P05 — Tipos/capacidades de sucursal.** Dep: P04. Archivos: `db_sqlite.js`, `routes/entidades.js`, `Sucursales.jsx`, pruebas.
- [ ] Crear Comercial/Producción/Depósito/Mixta; migrar antiguas a Comercial.
- [ ] Validar capacidades/cambio de tipo/activo y mantener límites del plan.
- [ ] Ubicación sin venta no exige caja ni vendedor; ubicación produce solo si habilitada.
Verificar: alta y reinicio DB vieja/nueva, limite sucursales y update inválido. M.

**P06 — Asignación e inicio de sesión.** Dep: P05. Archivos: `routes/auth.js`, `Login.jsx`, `UsuariosConfig.jsx`, helper de inicio, pruebas.
- [ ] Predeterminada/landing dentro de ubicaciones y permisos, única ubicación entra directa.
- [ ] Multiples perfiles permiten inicio configurado; sin asignaciones muestra error específico.
- [ ] Cambio de empresa/usuario limpia ubicación anterior y datos de sesión.
Verificar: login operario/depósito/mixto y usuario sin sucursal. M.

**P07 — Menús, guards y cargas autorizadas.** Dep: P06. Archivos: `Sidebar.jsx`, `App.jsx`, guard de acceso, `Layout.jsx`, pruebas.
- [ ] Menú y URLs consumen capacidades, con carga pendiente sin mostrar todo.
- [ ] No precargar clientes/costos/ventas a un operario sin permiso; pollings condicionados.
- [ ] Ocultar POS/caja por capacidad y perfil; cambios de acceso refrescan estado.
Verificar: URL directa, reload, móvil y sesión con datos locales antiguos; build frontend. M.

Checkpoint B: dueño crea usuario, asigna cocina y perfil; entra en página operativa autorizada. Puerta de Producción puede mostrar estado vacío hasta implementar operaciones.

### Fase C — Inventario y lotes

**P08 — Endurecer accesos de stock/transferencias.** Dep: P07. Archivos: `productos.js`, `transferencias.js`, política de recursos y pruebas.
- [ ] Lectura por ID/filtro, ajuste normal/variante, alta/edición/cancelación verifican ubicaciones.
- [ ] Enviar exige origen; recibir exige destino; selección destino usa metadata mínima.
- [ ] Roles nuevos usan permisos puntuales, sin conceder finanzas o inventarios ajenos.
Verificar: origen propio/destino ajeno, ID de otra sucursal/empresa, filtro manipulado y ajuste variante. M.

**P09 — Artículos y cantidades exactas.** Dep: P08. Archivos: `lib/inventory/quantities.js`, `db_sqlite.js`, validadores, UI producto/presentación y pruebas. Dividir catálogo API/UI si supera 5 archivos.
- [ ] Clase/flags/unidad/precisión y presentaciones por artículo, POS solo vendibles.
- [ ] Conversions exactas y limites; rechazo kg/l sin factor específico y fracciones prohibidas.
- [ ] Producto legacy conserva operaciones; no cambios de escala de saldos existentes sin migración.
Verificar: 25 kg, 0.125 kg, caja 12, 0.5 l, valores extremos y redondeos. M por subtarea.

**P10 — Libro, lotes y migración de stock.** Dep: P09. Archivos: `db_sqlite.js`, repositorio inventory, script migración, pruebas.
- [ ] Movimientos y saldos por lotes, claves de idempotencia y reservas, índices/fk.
- [ ] Activación explícita convierte saldo inicial sin duplicar stock; lote inicial desconocido identificado.
- [ ] Proyección `stock_suc` y libro coinciden; artículos con vencimiento exigido necesitan inventario inicial completo.
Verificar: migrar dos veces, DB antigua/nueva, balance inicial y reconciliación. M.

Checkpoint C1: un artículo gestionado tiene un único saldo reproducible y acepta cantidades precisas; no simular trazabilidad histórica desconocida.

**P11 — Recepción física de materiales.** Dep: P10. Archivos: servicio receipts, rutas production inventory, pantalla Ingresos, pruebas.
- [ ] Recibir bolsa/caja normaliza cantidad, crea lote/costo/vencimiento y movimiento.
- [ ] Compra directa/transfers no duplican recepción al repetir; vinculo proveedor/compra cuando disponible.
- [ ] API retorna costos solo a autorizados; responsable depósito puede recibir sin caja.
Verificar: proveedor, vencimiento requerido, idempotencia y dos ubicaciones. M.

**P12 — Inventario, FEFO y ajustes.** Dep: P11. Archivos: servicio lot selection/adjustments, rutas, pantalla Inventario, pruebas.
- [ ] Separar disponible/reservado/vencido/bloqueado y seleccionar FEFO.
- [ ] Ajuste/merma con permiso/motivo, conserva historial; nunca saldo lote negativo.
- [ ] Lista por ubicación/paginación y alertas de vencimiento correctas.
Verificar: vencido, reserva, frontera de fecha, ajuste negativo y rol denegado. M.

**P13 — Gateway y todos los escritores de stock.** Dep: P12. Archivos por subtarea: `routes/stock_helpers.js`, `productos.js`, `ventas.js`, `pendientes_ctacte.js`, `sync.js`, import/export pertinentes.
- [ ] Artículos gestionados pasan por gateway también en anulación/devolución/variantes/importación.
- [ ] Operaciones legacy siguen funcionando; no doble escritura ni cantidades truncadas.
- [ ] Caminos offline no pueden saltar permisos/lotificación; rechazan operaciones nuevas online-only.
Verificar: búsqueda exhaustiva de writers y suite por canal; crear mapa de cobertura y cerrar cada ruta. **Dividir obligatoriamente P13a ajustes/productos, P13b ventas/devoluciones, P13c pedidos legacy, P13d sync/importación**; M cada una.

Checkpoint C2: saldo consistente tras operaciones por todos los canales. No habilitar artículos gestionados a usuarios finales antes de completar P13.

### Fase D — Recetas y preparación

**P14 — Recetas versionadas.** Dep: P13. Archivos: DB/recipe repository, rutas, pantalla Recetas, pruebas.
- [ ] Publicación con rendimiento/ingredientes/unidades; edición genera versión.
- [ ] Solo encargado/admin edita; operario consulta sin costo.
- [ ] Archivado conserva historial y ubicaciones admitidas.
Verificar: receta de 1 torta/24 medialunas, versión vieja accesible y permiso de costos. M.

**P15 — Intermedios y preview.** Dep: P14. Archivos: recipe validator, preview service, wizard Preparar, pruebas.
- [ ] Receta consume intermedio real; ciclos A/B rechazados.
- [ ] Escalar cantidad/lote calcula consumos, lotes FEFO y faltantes sin escribir stock.
- [ ] Receta no disponible en ubicación no se prepara; suborden de intermedio explícita.
Verificar: crema en torta, cero stock intermedio, ciclos y redondeo de consumo. M.

**P16 — Órdenes e inicio.** Dep: P15. Archivos: orders repository/service, rutas, pantalla Hoy/órdenes, pruebas.
- [ ] Borrador/pendiente/en preparación/finalizada/cancelada, ubicación y receta snapshot.
- [ ] Iniciar/cancelar no modifica insumos; planning por cantidad/fecha y pedido opcional.
- [ ] Operario solo ve órdenes permitidas; no modifica receta publicada.
Verificar: estados inválidos, orden otra cocina, receta editada tras crear orden. M.

Checkpoint D1: cargar receta y comenzar preparación con preview; stock no cambia antes de registrar ejecución.

**P17 — Finalización atómica sin faltantes.** Dep: P16. Archivos: production execution service, inventory gateway, rutas finish, pantalla preparación, pruebas.
- [ ] Consumir insumos, crear lote salida/merma/snapshot y auditar en una transacción.
- [ ] Doble clic/reintento no duplica; dos órdenes compiten por stock con revalidación.
- [ ] Preparación parcial guarda ejecución propia; fallo devuelve todo al estado previo.
Verificar: error tras primer ingrediente, lotes agotados simultáneamente, retries y partial. M; separar UI si necesario.

**P18 — Autorización y déficits.** Dep: P17. Archivos: approval service, deficit service, rutas, diálogo autorización y pruebas. Dividir P18a autorización y P18b registro/regularización.
- [ ] Encargado valida propia credencial/sucursal/permiso y autoriza intención exacta con vencimiento/uso único.
- [ ] Faltante se registra sin lote inventado; costo/traza provisional y saldo déficit visible.
- [ ] Regularizar no descuenta dos veces ni asigna retroactivamente origen falso; no reutilizar aprobación.
Verificar: contraseña errónea, cambio consumo, aprobación otra cocina, replay, doble uso y regularización. M por subtarea.

**P19 — Costos, rendimiento y correcciones.** Dep: P18. Archivos: costing service, serializers/reports, pantalla historial, pruebas.
- [ ] Costo real conserva lotes/intermedio y merma; rendimiento cero sin división inválida.
- [ ] Datos de costos ocultos por API/export a operario; estimados/provisionales etiquetados.
- [ ] Reversión compensatoria solo si no hay uso posterior, y requiere permiso/motivo.
Verificar: 24→22, producción fallida, cambio de precio, saldo faltante y salida ya vendida. M.

Checkpoint D2: harina+fruta+crema producen lote de tartas, con consumo preciso/costo/merma/autorización y trazabilidad. Producto queda en cocina.

### Fase E — Distribución y pedidos

**P20 — Transferencias de lotes y reservas.** Dep: P19. Archivos: transfer service/adaptador, `transferencias.js`, allocations DB, pantalla y pruebas. Dividir envío y recepción/diferencias en dos sesiones.
- [ ] Despacho mueve lote real a tránsito y conserva costo/vencimiento/reserva.
- [ ] Recepción parcial mueve solo recibido; diferencia pendiente/devolución/merma explícita.
- [ ] Origen/destino/permisos y idempotencia; transferencia legacy identificada sin reescribir historia.
Verificar: parcial, perdida, retorno físico, replay y stock en destino antes/después. M por subtarea.

**P21 — Pedido a fabricar desde POS.** Dep: P20. Archivos: POS, `pendientes_ctacte.js`, pedido service/DB, pruebas. Dividir contrato backend y UI si necesario.
- [ ] Línea inmediata/encargo y datos de cocina/entrega/fecha, carrito mixto soportado.
- [ ] Crear encargo no descuenta/suma producto inexistente; una sola seña/deuda/venta comercial.
- [ ] Pedido nuevo versionado y legacy conserva política; demanda pendiente no es reserva ficticia.
Verificar: 1 torta sin stock, pedido con reserva parcial y cobro mixto sin duplicación. M por subtarea.

**P22 — Asignación y reserva de producto terminado.** Dep: P21. Archivos: pedido-production service, execution reservation hook, panel pedidos, pruebas.
- [ ] Pedido genera orden(s) por línea en cocina elegida, sin duplicar por retry.
- [ ] Producción parcial reserva producto real para pedido y muestra faltante restante.
- [ ] Transferencia preserva reserva hasta sucursal de entrega; operario ve datos operativos mínimos.
Verificar: pedido varias recetas, cambio de cocina pendiente, producción parcial y reserva ajena. M.

**P23 — Entrega y cancelación seguras.** Dep: P22. Archivos: delivery/cancel service, pendientes rutas/pantalla, stock gateway, pruebas.
- [ ] Entrega parcial/final consume lote reservado una vez; pago y producción independientes.
- [ ] Cancelar libera reservas/cancela lo pendiente; producto fabricado queda disponible o merma explícita.
- [ ] Pedidos legacy sin doble movimiento y ventas inmediatas conservan comportamiento.
Verificar: doble entrega, cancelación antes/después de producir/transferir, diferencia destino y devolución. M.

Checkpoint E: POS local 3 → cocina 1 → producción → envío → recepción local 3 → entrega, sin duplicar movimientos ni cobro.

### Fase F — Operación y entrega

**P24 — Trazabilidad, reportes y alertas.** Dep: P23. Archivos: trace service/rutas, historial/reportes UI, alerta vencimiento, pruebas.
- [ ] Desde lote materia prima se identifican ejecuciones, productos, transferencias y entregas.
- [ ] Alertas de vencimiento/faltantes/atrasos por ubicación y perfil.
- [ ] Desvíos/mermas/costos con filtros y acceso correcto, sin afectar reportes de otros rubros.
Verificar: lote usado en varias recetas y varios locales, costos denegados y paginación. M.

**P25 — Migraciones, backup y datos iniciales.** Dep: P24. Archivos: migration/diagnostic scripts, db registry/export, backup/restore integración, doc y pruebas.
- [ ] DB vieja/nueva y migración repetida conservan usuarios/stock/historial.
- [ ] Backup restaurado incluye todos los datos nuevos; no inventar vencimientos de saldo inicial.
- [ ] Diagnóstico reconcilia libro/proyección/reservas/tránsito/déficits sin autoajustes silenciosos.
Verificar: restore aislado y fixture de empresa comercial sin Producción. M; separar backup de migración si necesario.

**P26 — Pruebas integrales y piloto.** Dep: P25. Archivos: tests por journey, onboarding/manual, rollout checklist.
- [ ] Criterios de aceptación integrales y regresión backend/frontend/build completos.
- [ ] Piloto de una empresa con inventario real validado, perfiles/ubicaciones y recetas representativas.
- [ ] Flag, rollback compatible y capacitación; ningún deploy automático ni escritura de stock real por el agente.
Verificar: recorridos de sección 13 y acta de piloto. M.

Orden resumido: P00–P08 accesos/ubicaciones → P09–P13 inventario → P14–P19 producción → P20–P23 distribución/pedidos → P24–P26 operación. Las fases previas son parte de la entrega, no mejoras opcionales que se puedan omitir.

## 13. Pruebas y comandos

Runtime Node 22+ con minor compatible con `node:sqlite`. Backend CommonJS, frontend React 18/Vite, SQLite por empresa. No migrar a otro stack.

Comandos existentes para línea base, desde checkout de desarrollo:

```bash
git status --short
git rev-parse HEAD
node --version
npm ci
cd frontend
npm ci
cd ..
npm run test:backend
npm test
npm run build
```

Si frontend no tiene lockfile compatible, seguir instalación existente y registrar diferencia. No inventar comando lint si no existe script. La build actual puede instalar dependencias; no ejecutar en servidor real.

Pruebas nuevas, una vez creadas:

```bash
node --test --test-force-exit --test-concurrency=1 test/production/*.test.js
```

Agregar a script backend solo cuando existen pruebas; conservar suites anteriores. Tests con DB temporales: el test de seguridad usa `MASTER_PATH` y `TENANT_DATA_DIR`; reutilizar nombres reales, no asumir `MASTER_DB_PATH`. Clock inyectable para vencimiento/autorizaciones y datos sintéticos.

Recorridos obligatorios:

1. Crear usuario con dos roles y sucursal elegida: persistencia tras logout/relogin.
2. Operario asignado a cocina solo ve producción; URL POS y API otra sucursal denegados.
3. Quitar módulo o cambiar plan con sesión abierta: acceso operativo revocado, datos intactos.
4. Admin tenant intenta escribir módulos/grants fuera del catálogo: denegado.
5. Compra bolsa 25 kg; preparar 0.3 kg por tarta; cantidades exactas después de 100 ejecuciones.
6. Crema tiene producción/lote propio y torta consume crema sin doble consumo de leche.
7. Receta con ciclo rechazada; cambio receta no cambia costo/consumo histórico.
8. Dos preparaciones compiten por mismo lote, una falla sin saldo parcial.
9. Corte/retry/doble clic no duplica consumo/salida/reserva/transferencia/entrega.
10. Falta harina: encargado autoriza solo esa orden; replay/cambio ingrediente expirado rechazados.
11. Merma de insumo y 24→22 terminado reflejan saldo/costo; cero rendimiento no falla.
12. Lote vencido o reservado a otro pedido no se consume/vende; permisos no filtran costo en API.
13. Envío de 10 y recepción de 8 mantiene 2 en tránsito/diferencia, no vuelve automáticamente al origen.
14. Pedido por POS de 1 torta sin stock: no crea saldo ficticio; luego producir, transferir y entregar una vez.
15. Cancelar después de producir conserva el producto; después de entregar requiere devolución explícita.
16. Venta inmediata, devolución, ajuste variante, importación y sync mantienen un único inventario.
17. Migrar DB comercial sin módulo no cambia sus saldos/roles ni abre permisos nuevos.
18. Backup/restore reproduce saldos, recetas, aprobaciones consumidas y reservas.

Pruebas visuales: tablet/móvil, lista de recetas extensa, wizard con 20 ingredientes, mensajes de autorización, lotes con distintas unidades, permiso denegado y acceso a costos. No basta con tests que repitan fórmulas del código.

## 14. Migración y rollout

1. Backup de prueba y revisión de estructura actual, incluidos campos `data`.
2. Migraciones aditivas por empresa, compatibles con usuarios/roles y productos existentes.
3. Corregir alta y derechos comerciales con tests; no desplazar stock en este paso.
4. Registrar Producción pero dejarla sin habilitación masiva.
5. Configurar ubicaciones/perfiles y revisar asignaciones ambiguas mediante reporte.
6. Cargar catálogo/unidades/presentaciones, recetas e inventario inicial con lotes reales o identificados como desconocidos.
7. Migrar artículos seleccionados al gateway y bloquear activación si quedan writers que lo evaden.
8. Piloto en una cocina y un local, inicialmente sin pedidos legacy mezclados.
9. Validar escenarios de producción/distribución/pedido y capacitar encargado/depósito/operario.
10. Habilitar a más sucursales/empresas tras reconciliación.

Rollback funcional: deshabilitar módulo/flag y detener nuevas preparaciones conservando libro/histórico. No volver a una versión que ignora lotes/reservas tras movimientos reales. Si hay saldos gestionados, el gateway sigue protegiendo ventas/entregas hasta transición controlada. Restaurar backup viejo no es rollback seguro de operaciones ya hechas.

## 15. Límites y decisiones pendientes para el piloto

No bloquean el plan, pero deben confirmarse antes de usar stock real:

- Nombres de ubicaciones y cuáles cocinan; central separada o mixtas.
- Topología de despliegue SQLite, número de procesos y volumen; verificar concurrencia/locks sobre el archivo compartido real.
- Reglas de duración y vencimiento por producto definidas por el negocio.
- Escalas de cantidad admitidas y productos vendibles por peso.
- Qué datos del pedido necesita ver cocina: texto, diseño, alergias/notas si el cliente las registra, fecha y cantidades; no inventar registros clínicos.
- Política comercial de cupos: mantener todas ubicaciones contadas o separar depósitos en una versión de planes posterior.
- Compras existentes: distinguir recepción física de registro financiero y evitar duplicación de deuda.
- Materiales que hoy existen como productos/variantes y lotes iniciales no documentados.

Fuera de primera entrega: cálculo de mano de obra, gastos indirectos, maquinaria, planificación avanzada de capacidad, sensores/balanzas, fabricación offline, diseñador libre de roles, regímenes sanitarios automatizados. La estructura no impide agregarlos luego.

## 16. Prompts para OpenCode

### Uso

Guardar este documento en el checkout como `tasks/production-roadmap.md`. La primera sesión adapta la especificación al código actual y crea `tasks/production-spec.md`, `tasks/plan.md`, `tasks/todo.md`. Si ya existen planes de ARCA, conservarlos y mantener referencias separadas; nunca sobrescribirlos sin incorporar su contenido. `tasks/plan.md` puede actuar como índice de proyectos.

Trabajar una tarea por sesión. Tareas subdivididas como P13a–d se implementan por separado. No pedir “todo el módulo en una sola respuesta”. Para implementar se usa el plan revisado; este documento no autoriza deployment ni cambios en stock real.

### Prompt 1 — Inicial: analizar y concretar especificación

```text
Estamos agregando al CRM Bourgie/crm_v2 un módulo genérico Producción para una panadería, reutilizable por otros rubros. Leé tasks/production-roadmap.md completo, AGENTS.md y las skills aplicables del proyecto: spec-driven-development y planning-and-task-breakdown. No implementes en esta sesión.

Contrastá el checkout actual con la revisión SHA 7177fbfd5955508546bbe72d2902c2bf403dc1d9. Revisá middleware/auth.js, middleware/tenant.js, middleware/validate.js, db_sqlite.js, db_master.js, server.js, routes/auth.js, config.js, entidades.js, productos.js, stock_helpers.js, transferencias.js, ventas.js, pendientes_ctacte.js, sync.js, backup/restore, frontend Login/UsuariosConfig/Sucursales/Sidebar/App/Layout/POS/Superadmin y tests. No leas ni imprimas secretos de .env.

Objetivo confirmado: sucursales Comercial/Producción/Depósito/Mixta, usuarios multirol con ubicaciones permitidas y entrada directa; recetas versionadas, unidades exactas, materias primas, intermedios y terminados con stock/lotes; consumo y salida atómicos al preparar; merma/rendimiento/costo real; autorización personal de encargado para faltantes; transferencia a varias sucursales; pedidos desde POS con cocina y entrega, reserva real y cero duplicación de movimientos. Módulo por planes/extras/bloqueos y datos preservados al deshabilitar.

Conservá Express CommonJS, Node 22, SQLite por tenant, React/Vite y servicios existentes. El modelo de ubicaciones reutiliza sucursales. Los perfiles nuevos no obtienen supervisor comercial. No reconstruyas todo el CRM ni mezcles el trabajo ARCA.

Confirmá bugs detectados: validación de alta descarta roles/sucursales, arrays vacíos interpretados distinto, menú y API desalineados, acceso de módulos no generalizado, tenant puede escribir modulos_habilitados, copias de plan desactualizadas, endpoints de stock/transferencias sin controles de ubicación, cantidades parseInt, pedidos suman stock al crearse y writers offline independientes.

Creá tasks/production-spec.md, tasks/plan.md e índice/checklist tasks/todo.md sin sobrescribir planes de otros proyectos. Definí catálogo de permisos, API, modelo de datos, ledger/gateway, idempotencia, permisos costos, regularización de déficit, compatibilidad pedidos legacy, backup/restore y rollout. Subdividí tareas P00–P26 para 3–5 archivos principales por sesión. Cada tarea tiene dependencia, aceptación y verificación concreta.

Ejecutá baseline tests/build con datos aislados si el entorno lo permite. Distinguí hallazgos confirmados por código, pruebas ejecutadas y pendientes. Entregá la especificación y primera tarea implementable para revisión; no cambies código funcional ni despliegues.
```

### Prompt 2 — Implementar una tarea

```text
Implementá únicamente [PXX o subtarea] del plan Producción revisado. Leé AGENTS.md, las skills aplicables, tasks/production-spec.md, tasks/plan.md y tasks/todo.md. Verificá dependencias completadas y git status; no sobrescribas trabajo existente. Las migraciones aditivas y ajustes de dependencias necesarios dentro del plan forman parte del alcance local autorizado. No publiques, despliegues ni modifiques datos reales.

Aplicá incremental-implementation, test-driven-development y security-and-hardening según la tarea. Conservá patrones del proyecto y separá lógica de negocio de rutas/UI. No inventes carpetas Prisma/Postgres/TypeScript. Si supera una sesión, dividí la tarea y dejá sistema consistente.

Invariantes: empresa+módulo+permiso+ubicación/capacidad en backend; no fallback DB default para operaciones nuevas; costos saneados por API; cero clave compartida de encargado; aprobación ligada a intención exacta y uso único; cantidades precisas; único gateway para stock gestionado; consumos/salidas/reservas en transacción; retries idempotentes; ningún lote ficticio ni producto creado por registrar un pedido; recetas y ejecuciones históricas inmutables; reservas viajan en transferencias; diferencias de recepción explícitas. No extender fabricación online-only a la cola offline.

Primero agregá pruebas que detecten el comportamiento o regresión, usando DB temporales y usuarios sintéticos. Corré pruebas específicas y regresión pertinente; si hay UI, frontend tests y build. No quites tests ni relajes controles para hacerlos pasar.

Actualizá tasks/todo.md con archivos, resultados reales, pendientes y próxima dependencia. No marques hecho si faltan aceptación/pruebas. Cerrá con comportamiento cambiado, validación ejecutada y limitaciones. No avances a otras tareas sin terminar esta.
```

### Prompt 3 — Instrucciones adicionales por fase

| Fase | Texto para agregar al prompt de implementación |
|---|---|
| A — P01–P04 | Priorizar persistencia de roles/ubicaciones y derechos autoritativos. Preservar roles legacy, no asignar Producción a todas empresas. Probar cambio de plan en sesión abierta y tenant intentando modificar módulos. |
| B — P05–P07 | Reutilizar sucursales y agregar tipo/capacidades. Operario entra a cocina y Producción; depósito a inventario. Menú, URLs, preload y API deben coincidir. No abrir caja por defecto. |
| C — P08–P13 | Crear cantidades exactas/lotes/ledger y cubrir TODOS los writers de artículos gestionados, incluidos variantes/devoluciones/sync/importación. Una proyección no es otra fuente de stock. No activar productos gestionados antes de cerrar cobertura. |
| D — P14–P19 | Recetas/versiones/intermedios sin ciclos. Finalización y producción parcial transaccionales e idempotentes. Autorización personal, déficit sin lote inventado, costo provisional. Merma y rendimiento cero correctos. |
| E — P20–P23 | Transferencia conserva lotes/reservas, recepción parcial no devuelve diferencias automáticamente. Pedido POS no crea producto inexistente ni duplica seña/deuda. Entrega consume una vez. Compatibilidad legacy separada y probada. |
| F — P24–P26 | Trazabilidad, reportes por permiso, backup/restore, fixtures legacy y rollout. No declarar listo si falta reconciliación de escritores o pruebas de concurrencia. Ninguna prueba contra stock real. |

### Prompt 4 — Reanudar

```text
Retomá Producción leyendo AGENTS.md, tasks/production-spec.md, tasks/plan.md y tasks/todo.md. Revisá git status y resultados ya registrados. Identificá la siguiente tarea con dependencias realmente verificadas; no rehagas las completadas ni confundas documentación con implementación.

Continuá solo esa tarea siguiendo Prompt 2. Mantener tests, pruebas reales y pendientes en checklist. Si existe trabajo ARCA, conservarlo sin mezclar APIs ni migraciones. No desplegar ni escribir stock de clientes.
```

### Prompt 5 — Revisión de seguridad/integridad final

```text
Revisá el cambio de Producción contra tasks/production-spec.md y roadmap. Usá code-review-and-quality y security-and-hardening. Reportá hallazgos por severidad con archivo/ruta y escenario concreto; no implementes funciones nuevas ni despliegues.

Buscá: alta que pierde roles/sucursales por Zod; lista vacía abre todo; rol supervisor asignado a operario; módulos controlados solo por menú; config tenant habilita su propio plan; cache desactualizada; costos filtrados solo en UI; acceso por suc_id manipulable; productos/transferencias por ID sin control; POS permitido en cocina sin venta; grant arbitrario; autorización de encargado compartida, reutilizable, otra empresa o no ligada a intención.

Inventario: parseInt/floats, kg↔litros implícito, dual saldo ledger/stock_suc, writers de sync/import/ajustes que evaden gateway, recetas cíclicas, consumo doble de intermedio, lote vencido/reservado, lotes negativos ficticios, recepción posterior atribuida falsamente a producción, doble clic/corte consumiendo dos veces, producción parcial sumada doble, rollback incompleto, costo real calculado con precio actual, 0 unidades divide por cero.

Pedidos/transferencias: alta suma producto inexistente, descuentos en venta y entrega, seña/deuda duplicada, reserva perdida al transferir, diferencia de recepción vuelve al origen sin devolución física, cancelación elimina producto fabricado o resta nuevamente histórico, reversión después de uso posterior.

Corré suites pertinentes y build, revisá migración repetida y restore aislado. Distinguí tests ejecutados, pruebas manuales y pendientes. Cerrá con blockers y condiciones concretas para piloto; no afirmar listo si falta protección o cobertura de writers.
```

### Prompt 6 — Guía y piloto para el dueño

```text
Prepará una guía simple para el dueño y tres guías cortas para Operario, Encargado y Depósito basadas en la implementación real de Producción. Incluí alta de cocina/sucursal mixta, asignación de usuarios/perfiles/ubicaciones, carga de unidades y recetas, inventario inicial por lote, preparación, autorización de faltante, distribución y pedido POS.

Usá nombres reales de pantallas; no describas funciones sin implementar. Prepará checklist de piloto con datos ficticios: crema intermedia, tarta para stock, torta de cumpleaños, recepción parcial, merma y vencimiento. Mostrar resultados esperados por ubicación y costos según perfil. No tocar datos reales, no desplegar y no incluir credenciales.
```

## 17. Criterio de entrega completa

El trabajo está terminado cuando el dueño puede habilitar Producción por plan/empresa, crear cocina y usuarios, cargar materias primas/recetas, registrar producción con consumo real y lotes, autorizar un faltante auditado, distribuir a locales y cumplir un pedido del POS con stock correcto. Todas las operaciones respetan ubicación/permisos y pueden recuperarse de retries sin duplicación. Históricos/backup funcionan y empresas sin el módulo conservan su funcionamiento comercial.

Que aparezca el menú Producción o que se descuenten ingredientes en un ejemplo no alcanza para marcar la entrega terminada.
