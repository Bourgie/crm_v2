<!-- agent-skills:start -->
# Agent Skills (addyosmani/agent-skills)

Este proyecto usa el pack de 24 skills de ingeniería de addyosmani/agent-skills.

## Skill Discovery
Los skills residen en `.agents/skills/<skill-name>/SKILL.md`. El agente debe:

1. **Detectar** qué skill aplica según la intención del usuario
2. **Invocar** el tool `skill` con el nombre correspondiente
3. **Seguir** el skill al pie de la letra (no saltarse pasos)

## Lifecycle Mapping
- DEFINE → `spec-driven-development`, `interview-me`, `idea-refine`
- PLAN → `planning-and-task-breakdown`
- BUILD → `incremental-implementation`, `test-driven-development`, `frontend-ui-engineering`, `api-and-interface-design`, `context-engineering`, `source-driven-development`, `doubt-driven-development`
- VERIFY → `debugging-and-error-recovery`, `browser-testing-with-devtools`
- REVIEW → `code-review-and-quality`, `code-simplification`, `security-and-hardening`, `performance-optimization`
- SHIP → `shipping-and-launch`, `git-workflow-and-versioning`, `ci-cd-and-automation`, `deprecation-and-migration`, `documentation-and-adrs`, `observability-and-instrumentation`

## Reglas
- Siempre verificar si un skill aplica antes de actuar
- Si aplica, DEBE usarse
- No saltar workflows requeridos (spec → plan → build → test → review)
- No ir directamente a implementación sin spec/plan

## Referencias
Las checklists de referencia están en `.agents/references/`:
- `definition-of-done.md`
- `testing-patterns.md`
- `security-checklist.md`
- `performance-checklist.md`
- `accessibility-checklist.md`
- `observability-checklist.md`
- `orchestration-patterns.md`
<!-- agent-skills:end -->
