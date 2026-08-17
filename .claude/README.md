# FlexCRM — Agentes Claude Code

Agentes especializados para el desarrollo de FlexCRM con Claude Code.

## Instalación

Copiar la carpeta `.claude/` a la raíz de tu proyecto `crm_v2/`:

```
crm_v2/
  .claude/
    CLAUDE.md          ← contexto siempre activo
    agents/
      code-reviewer.md
      migration-planner.md
      caja-debugger.md
      pendientes-flow.md
      excel-importer.md
      seed-builder.md
      deploy-checker.md
      tenant-auditor.md
```

## Uso en Claude Code

Los agentes se activan automáticamente cuando el contexto lo requiere.
También podés invocarlos explícitamente:

```
# Invocar un agente específico
"Usá el code-reviewer para revisar routes/caja.js"
"Quiero que el tenant-auditor audite el módulo nuevo"
"Corré el deploy-checker antes de desplegar en Fly.io y Cloudflare Pages"

# O dejar que Claude Code elija el agente correcto
"Hay un bug en el módulo Caja, el cobro no se registra"
"Necesito agregar una columna nueva a la tabla clientes"
"El seed falla cuando corro node seed_demo.js"
```

## Agentes disponibles

| Agente | Modelo | Cuándo lo usa Claude Code |
|--------|--------|---------------------------|
| `code-reviewer` | Sonnet 4.6 | Después de escribir o modificar código |
| `migration-planner` | Haiku 4.5 | Al agregar columnas o tablas SQLite |
| `caja-debugger` | Sonnet 4.6 | Bugs en el módulo Caja |
| `pendientes-flow` | Sonnet 4.6 | Bugs en el módulo Pendientes |
| `excel-importer` | Haiku 4.5 | Problemas con import/export Excel |
| `seed-builder` | Haiku 4.5 | Actualizar o reparar seed_demo.js |
| `deploy-checker` | Haiku 4.5 | Antes de desplegar en Fly.io y Cloudflare Pages |
| `tenant-auditor` | Sonnet 4.6 | Auditoría de seguridad multi-tenant |

## Paralelismo recomendado

Podés correr hasta 3-4 agentes en paralelo para tareas independientes:

```
"Mientras el code-reviewer revisa routes/caja.js,
 que el tenant-auditor audite routes/productos.js"
```

## Tips

- El `CLAUDE.md` se carga automáticamente en cada sesión — no hace falta mencionarlo.
- Si un agente no se activa solo, invocar explícitamente por nombre.
- Los agentes de solo lectura (code-reviewer, tenant-auditor) son seguros de correr en paralelo.
- El deploy-checker conviene correrlo siempre en foreground (bloqueante) antes del push.
