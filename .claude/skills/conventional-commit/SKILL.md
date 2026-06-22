---
name: conventional-commit
description: Usar cuando el usuario pide hacer un commit, "commiteame esto", "guardame los cambios", "haceme un commit", "mensaje de commit para esto", o cualquier variante de querer registrar cambios en git.
allowed-tools: Bash
---

Cuando el usuario pide un commit:

1. Correr `git diff HEAD --stat` para ver qué archivos cambiaron.
2. Correr `git diff HEAD` para leer los cambios en detalle (máximo relevante).
3. Escribir el mensaje en formato Conventional Commits:

```
tipo(scope): descripcion corta en imperativo, sin punto final, max 72 chars

[cuerpo opcional: explicar el POR QUÉ del cambio, no el qué]
```

**Tipos válidos:**
- `feat` — funcionalidad nueva
- `fix` — corrección de bug
- `chore` — mantenimiento, deps, configuración
- `docs` — solo documentación
- `refactor` — cambio de código sin cambiar comportamiento
- `style` — formato, sin cambio de lógica
- `test` — agregar o corregir tests

**Scopes para FlexCRM:**
`caja` | `pos` | `pendientes` | `clientes` | `productos` | `ventas` | `ctacte` | `transferencias` | `gastos` | `presupuestos` | `reportes` | `chat` | `usuarios` | `config` | `superadmin` | `auth` | `db` | `react` | `seed`

**Ejemplos correctos:**
```
feat(caja): agregar cobro multi-método en modal de pago
fix(pendientes): revertir stock al cancelar pedido sin venta asociada
chore(db): agregar índice en caja_movimientos.suc_id
refactor(react): mover lógica de cobro a hook useCobro
docs: actualizar CLAUDE.md con regla de stock_suc
```

**No hacer:**
- No empezar con mayúscula después de los dos puntos
- No poner punto al final del subject
- No usar "update", "change", "modify" como verbo principal — ser específico sobre qué cambió
- No agrupar cambios no relacionados en un solo commit

Después de armar el mensaje, ejecutar:
```bash
git add -A && git commit -m "mensaje"
```

Si el diff toca múltiples módulos sin relación, proponer separarlo en dos commits antes de ejecutar.
