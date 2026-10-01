---
description: "Implementar pantallas de cocina y depósito con permisos coherentes, unidades, estados y navegación por perfil."
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

Cargar crm-production-access y crm-production-inventory para comprender contratos. Usar frontend-ui-engineering y frontend testing existentes. Consumir capacidades del backend, no inventar listas de roles. Operario inicia Producción, depósito inventario, cocina no abre POS/caja por defecto. No cargar datos ni costos no autorizados. Rendimiento base/unidades/consumo real/merma separados; creación receta no mueve stock. Mostrar faltantes antes de finalización y aprobación personal de encargado sin persistir contraseña. Preview no descuenta; finalizar muestra resultado confirmado. Guardar progreso de formularios solo si no incluye secretos. Tests RTL y build, inspección tablet/móvil; no duplicar política fiscal/comercial en UI.
