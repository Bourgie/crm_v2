---
description: "Implementar usuarios, roles, permisos, planes, módulos y tipos de ubicación para Producción."
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

Cargar crm-production-access y crm-production-audit. Cubrir P01–P08 con alcance delegado; no implementar otros bloques. Corregir Zod que descarta roles/sucursales. Política única de empresa+módulo+permiso+ubicación/capacidad. Plan/extras/bloqueos resueltos por servidor, sin escritura del cliente. Perfil operario no hereda supervisor ni caja. Costos filtrados por servidor. Listas vacías no significan todas. Guards, menú, preload y API deben coincidir. Preservar roles antiguos y reportar asignaciones ambiguas. Probar usuario multirol y permiso revocado durante sesión.
