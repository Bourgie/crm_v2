---
name: crm-production-audit
description: Aplicar auditoría integral en cambios de usuarios, permisos, stock, recetas, preparación, autorizaciones, transferencias y pedidos.
---

1. Para cada endpoint/tarea listar evento, actor ejecutor, autorizador si corresponde, empresa, ubicación, recurso, resultado, timestamp servidor, correlation/idempotency ID, motivo y antes/después saneados.
2. Reutilizar db.audit donde satisfaga el contrato; añadir eventos estructurados si el texto no alcanza. Redactar contraseña, hash password, tokens, claves, secreto y datos personales no necesarios.
3. En operaciones de negocio exitosas persistir movimiento y auditoría en la misma transacción: fallo de auditoría revierte operación, no stock sin rastro.
4. Registrar denegación/error con resultado explícito fuera de transacción revertida, sin afirmar que produjo stock. Evitar que el registro del rechazo enmascare el error original; evidencia de fallo del sink requiere alerta operativa.
5. Versionar recetas y snapshots. No editar/borrar movimientos finales. Correcciones compensatorias conservan identidad original y causa.
6. Aprobación de encargado requiere identidad personal activa de la empresa, permiso/ubicación, intención exacta, expiración/uso único; consumir junto a operación. No reemplazar sesión operario.
7. Idempotencia conserva un evento de negocio por operación; retries pueden auditarse como intentos correlacionados sin repetir consumo. Evitar doble aprobación.
8. Filtrar consulta/export de auditoría por empresa/ubicación y permiso. No ofrecer una API de edición de audit. Admin no puede limpiar rastro desde UI.
9. Cubrir usuarios/roles/grants/sucursales/módulos/planes, recetas/versiones, compras físicas/stock/lotes/mermas, ejecución/costos, distribución/diferencias, pedidos/reservas/entregas/cancelaciones y fallos/autorizar.
10. Probar antes/después, ambos actores, rollback audit failure, retry, export sin secreto y acceso denegado. Distinguir audit operacional append-only de protección criptográfica contra administrador de DB: no prometer inviolabilidad absoluta.
