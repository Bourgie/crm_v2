# Especificación de Producción — preparación

La especificación funcional completa es tasks/production-roadmap.md, secciones 2–11. Decisiones pendientes de piloto en sección 15. Este archivo no marca P00 terminado: contrastar contratos con checkout y ejecutar baseline antes de construir.

## Objetivo
Recetas/ingredientes por cantidades, preparación con consumo y salida automática, cocinas/depósitos como sucursales, multirol, lotes/costos/merma, pedidos POS y distribución, todo auditado. ARCA separado.

## Stack y estructura
Node 22 compatible con node:sqlite, Express CommonJS, SQLite por empresa, React/Vite. Backend en routes/lib, frontend en frontend/src, tests backend en test y frontend existentes. Nuevos servicios inventario/production según roadmap; no reescribir stack.

## Comandos
Desde checkout de desarrollo: npm ci; frontend: npm ci; npm run test:backend; npm test; npm run build. No ejecutados durante esta preparación de agentes. Verificar lockfiles/variables DB temporales antes de correr. No inventar script lint.

## Estilo
Usar middleware compartido, controladores delgados, servicio transaccional y repositorio tenant. Ejemplo ilustrativo en roadmap sección 10.2. No fórmulas de inventario ni políticas de permiso dentro de React.

## Auditoría obligatoria
Aplicar crm-production-audit a todas las mutaciones y fallos relevantes. Éxito de inventario y audit deben ser atómicos, secreto nunca se registra. Roles/módulos/costos con antes/después saneado y actores explícitos. Auditoría de negocio es distinta de commits.

## Verificación y límites
Test-first por tarea, backend aislado y frontend según cambios. Sin base real, deploy/push/merge ni trabajo en main. Migraciones aditivas dentro del plan; cualquier pérdida de datos/regla comercial fuera del plan requiere decisión expresa. Planificar rollback con dependencia de schema y ledger.

## Éxito
Todos los criterios P00–P26 y journeys del roadmap pasan; disponibilidad y saldo una sola vez en todos los writers; roles/módulos/ubicaciones coherentes. No considerar menu visible como implementación completa.
