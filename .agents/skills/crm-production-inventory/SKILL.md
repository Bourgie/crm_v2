---
name: crm-production-inventory
description: Implementar o revisar recetas, ingredientes, producción, stock preciso, lotes, transferencias y pedidos POS de FlexCRM.
---

1. Leer roadmap secciones 7–10 y la tarea P09–P23 pertinente. Mapear TODOS los escritores antes de activar artículos gestionados.
2. Reutilizar productos/sucursales con flags y unidades por artículo. Cantidades enteras escaladas, factores de bolsa/caja propios; validar precisión y límites. Nunca parseInt ni kg→l implícito.
3. Mantener ledger como fuente y stock_suc como proyección exclusiva del gateway; no dos saldos independientes. Transacciones cortas e idempotencia por operación/intención.
4. Lotear entradas/salidas; FEFO utilizable, vencer/bloquear/reservar excluye disponible. No lotes físicos negativos o inventados. Migrar saldo inicial desconocido identificado como tal.
5. Publicar recetas/versiones; impedir ciclos; preparación usa snapshot. Intermedio consume stock ya producido, no vuelve a consumir sus materias primas.
6. Preview no mueve. Finalizar revalida permisos/stock dentro transacción y registra consumo, merma, rendimiento bueno, lote salida, reservas, aprobación y auditoría. Parciales tienen ejecuciones propias.
7. Falta autorizada registra déficit no asignado, trazabilidad/costo provisional. Regularizar con evidencia sin consumir dos veces ni adjudicar falsamente un lote posterior.
8. Transferir lote/costo/vencimiento/reserva por estados, separar tránsito. Recepción parcial deja diferencia explícita; regreso al origen requiere devolución física registrada.
9. Pedido a fabricar no suma/resta terminado inexistente. Reserva solo stock real, produce y asigna, entrega una vez. Cancelar deja terminado existente disponible o merma explícita. Conservar política legacy.
10. Reversión compensatoria, no borrar historial; bloquear si salida ya usada. Costos históricos por lote, rendimiento cero sin división. Documentar pruebas de concurrencia/corte/retry y límites.
