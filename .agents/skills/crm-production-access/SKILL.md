---
name: crm-production-access
description: Implementar o revisar usuarios, roles, sucursales, capacidades y habilitación por planes de Producción en FlexCRM.
---

1. Leer roadmap secciones 4–6 y tarea P01–P08 actual. Contrastar archivos reales antes de editar.
2. Verificar empresa activa, módulo autoritativo, permiso de acción y acceso/capacidad de ubicación; nunca confiar en suc_id del cliente.
3. Validar roles, grants/revocations, sucursales y landing con catálogo. Lista vacía de no admin = sin operación; migrar ambiguos con reporte.
4. Corregir alta/edición que pierden arrays al validar; actualización parcial no borra asignación por omisión.
5. Resolver plan/extras/bloqueos desde master, invalidar cache al cambiar. Impedir modulos_habilitados editable por tenant. Denegar indeterminación sin abrir todo.
6. Reutilizar sucursales con tipo/capacidad, mantener límites de plan. Acceso a destino de envío no abre sus ventas/costos.
7. Filtrar costos, metadata y grants por backend; menú/guard/preload consumen capabilities. Preservar roles legacy; no usar supervisor como atajo.
8. Probar alta multirol, cambio permisos en sesión, ID otra empresa/sucursal, variante ajuste, módulo bloqueado, URL directa y login ubicación única.
9. Auditar antes/después saneados de usuarios/permisos/planes/asignaciones y fallos de acceso según crm-production-audit. Entregar evidencia y pendientes.
