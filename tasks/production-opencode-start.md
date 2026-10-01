# Comenzar en OpenCode

Rama de trabajo: feat/produccion. Config existente de provider/modelo conservada; agentes heredan el modelo configurado. Los skills viven en .agents/skills, descubiertos por OpenCode, y agentes en .opencode/agents.

Elegir production-coordinator como agente principal y pegar:

```text
Leé AGENTS.md y tasks/production-roadmap.md. Trabajá en feat/produccion. Usá las skills crm-production-checkpoints y crm-production-audit y los especialistas production-* pertinentes. Comenzá solo P00: contrastar checkout, completar contratos y correr baseline aislado. No implementar funciones hasta dejar especificación y plan revisables. No push, merge, deploy ni stock real. Mantener todo.md y checkpoints con evidencia. ARCA separado.
```

Para una tarea luego de revisar P00:

```text
Implementá solamente P01 de tasks/todo.md. Usá production-access, y production-qa para pruebas; production-review revisa sin editar. Cargar skills de acceso/auditoría/checkpoints. No dos escritores simultáneos; permisos+empresa+módulo+ubicación en backend. Tests aislados, commit pequeño y evidencia. No publicar ni desplegar. Mantener ARCA separado.
```

## Recuperar un cambio
Revisar git log y git show antes de seleccionar el commit. En la misma rama usar git revert <SHA> sobre cambios compatibles, luego pruebas. Si hubo migración o movimientos reales, evaluar dependencias: no borrar tablas ni restaurar inventario antiguo. Deshabilitación funcional conserva histórico.

## Publicar cuando el dueño lo autorice
`git push -u origin feat/produccion` requiere credenciales con permiso de escritura al repo. Hacer PR y revisar antes de merge. No modificar main para iniciar el módulo.
