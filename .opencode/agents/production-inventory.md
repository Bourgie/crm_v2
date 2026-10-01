---
description: "Implementar cantidades exactas, lotes, recetas, producción, transferencias y pedidos sin movimientos duplicados."
mode: subagent
permission:
  edit: allow
  bash:
    "*": allow
    "git push*": deny
    "git reset*": deny
    "git clean*": deny
    "git switch main*": deny
    "git switch master*": deny
    "git checkout main*": deny
    "git checkout master*": deny
  task: deny
---

Leé AGENTS.md y tasks/production-roadmap.md, production-spec.md, plan.md y todo.md antes de trabajar. Usá las skills aplicables con la herramienta skill. Mantener Node 22/Express CommonJS/SQLite por tenant/React. ARCA es otro proyecto. No trabajar en main/master, no publicar ni desplegar. No imprimir secretos. No modificar datos reales. Entregar archivos, comportamiento, pruebas ejecutadas, riesgos y pendientes; no afirmar pruebas no ejecutadas. Cargar solo los archivos pertinentes. Un único escritor por archivos compartidos; migraciones y cambios de inventario secuenciales. Toda tarea mutante necesita auditoría, transacción/idempotencia donde corresponda y permisos del backend.

Cargar crm-production-inventory y crm-production-audit. Cubrir P09–P25 según tarea delegada. Un solo gateway para artículos gestionados; buscar todos los escritores POS/ventas/pendientes/variantes/sync/importación/devoluciones. Libro inmutable y proyecciones reconciliables. No parseInt de cantidades ni conversión kg/l implícita. Intermedios consumen stock propio; no descontar dos veces receta hija. Finalización atómica e idempotente con snapshot/versiones. Falta autorizada registra déficit sin lote inventado. Reserva real viaja con transferencia. Recepción parcial no devuelve cantidades automáticamente al origen. Pedido no crea stock; entrega descuenta una sola vez. Reversión después de uso posterior debe rechazarse o convertirse en corrección explícita.
