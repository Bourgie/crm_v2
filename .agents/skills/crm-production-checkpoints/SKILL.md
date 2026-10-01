---
name: crm-production-checkpoints
description: Trabajar Producción en rama separada, commits pequeños y recuperación revisable sin borrar cambios de otras etapas.
---

1. Antes de escribir ejecutar python3 scripts/production/check_branch.py; verificar git status y rama feat/produccion. No mutar main/master. Si checkout está sucio, distinguir trabajo propio de usuario y no sobrescribir.
2. Cargar tasks/production-spec.md, plan.md y todo.md. Seleccionar una tarea con dependencias verificadas; P13/P18/P20 se subdividen. Mantener ARCA separado.
3. Registrar SHA inicial, alcance y archivos. Solo un escritor por grupo compartido; ningún agente paralelo edita migraciones, gateway o checklist simultáneamente.
4. Agregar pruebas de aceptación, implementar, revisar diff, ejecutar checks adecuados y revisión independiente de accesos/inventario/audit.
5. Commit pequeño por tarea/subtarea con título concreto y evidencia de checks en cuerpo o checkpoint. Stage explícito; nunca git add . sobre checkout ajeno. No incluir secretos/DB/node_modules.
6. Agregar fila en tasks/production-checkpoints.md: tarea, SHA, comportamiento, pruebas y riesgos. Marcar todo terminado solo con evidencia; registrar fallos previos y pendientes.
7. No push/merge/deploy automáticamente. Preparar resultado revisable y publicar solo con autorización específica. No force push, reset --hard o clean destructivo.
8. Para recuperar código: inspeccionar git show del commit; generar git revert en la misma rama y verificar. Si hay dependencias/migraciones, proponer reversión coherente; preservar schema/data, no DROP automático.
9. Tras movimientos reales usar flag/deshabilitación funcional compatible con gateway, no código que ignora ledger. Branch y revert no revierten datos reales ni efectos externos.
10. Dejar resumen de continuación por tarea. El plan tiene aceptación técnica, la auditoría de negocio y el historial Git son distintos y ambos se requieren.
