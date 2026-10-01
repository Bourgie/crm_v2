---
name: crm-production-delivery
description: Verificar pruebas, migración, backup, restauración y piloto del módulo Producción sin afectar ARCA ni datos reales.
---

1. Leer aceptación de tarea y roadmap secciones 12–15. Ejecutar pruebas específicas; ampliar regresión cuando el cambio lo amerite.
2. Usar DB sintéticas y temporales con MASTER_PATH y TENANT_DATA_DIR. Nunca apuntar tests a bases reales. Serializar pruebas que compartan DB.
3. Cubrir empresas/sucursales/roles/módulos, unidades exactas, FEFO/vencidos/reservas, intermedios y ciclos, merma/rendimiento cero, producción parcial, aprobación cambio/replay/expiry.
4. Inyectar fallos en transacción tras consumir primer ingrediente y antes de salida/audit; comprobar rollback completo. Competir dos conexiones SQLite por lote escaso.
5. Recorrer POS→pedido→cocina→producción→reserva→tránsito→recepción→entrega, verificar saldo por ubicación y cobro único; cancelaciones y legacy.
6. Auditar writers de variantes/devoluciones/importación/sync; tests de frontend con API denegada/pendiente/error sin costos no autorizados.
7. Migración repetida y restore aislado preservan saldos/históricos/reservas/aprobaciones consumidas. No arreglar discrepancias con ajustes automáticos silenciosos.
8. Registrar comando exacto, resultado y limitación. Build existente y backend/frontend suites; no inventar lint o resultados. Sin OpenCode instalado, indicar validación estructural y dejar discovery runtime pendiente.
9. Piloto y deploy requieren instrucción específica. No revertir a versión que ignora lotes/reservas tras operación real. Aplicar recuperación funcional, no restaurar backup antiguo a ciegas.
