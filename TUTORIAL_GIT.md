# Tutorial: Flujo Git + GitHub con OpenCode Desktop

## Info del proyecto

- **Repositorio:** https://github.com/Bourgie/crm_v2
- **Rama principal:** `master`
- **Visibilidad:** Privado

---

## Ciclo diario (4 comandos)

Cada vez que quieras hacer un cambio al codigo, usas estos 4 pasos:

```powershell
# 1. Ver que archivos tocaste
git status

# 2. Preparar los cambios para guardar
git add .

# 3. Guardarlos localmente con un mensaje descriptivo
git commit -m "feat: descripcion del cambio"

# 4. Subirlos a GitHub
git push
```

### Ejemplo concreto

Supone que agregaste un boton "Exportar PDF" en el modulo Ventas:

```powershell
git status
# Output: modified: frontend/src/pages/Ventas.jsx

git add .
git commit -m "feat: agregar exportacion PDF en modulo Ventas"
git push
```

---

## Tipos de commit (conventional commits)

Usa estos prefijos para mantener ordenado el historial:

| Prefijo       | Cuando usarlo                        | Ejemplo                                      |
|---------------|--------------------------------------|----------------------------------------------|
| `feat:`       | Funcionalidad nueva                  | `feat: filtro por fecha en Caja`             |
| `fix:`        | Arreglaste un bug                    | `fix: error al calcular vuelto en POS`       |
| `chore:`      | Tareas de mantenimiento              | `chore: actualizar dependencias`             |
| `refactor:`   | Mejoras de codigo sin cambiar nada   | `refactor: simplificar logica de descuentos` |

---

## Flujo visual

```
[Tu PC]                          [GitHub]                    [Cloudflare Pages / Fly.io]
  git add .                          |                                |
  git commit -m "..."                |                                |
  git push ----------------------> repo actualizado -----------> deploy en cada destino
```

---

## Comandos extra utiles

```powershell
# Ver el historial de commits
git log --oneline -10

# Ver que cambios hiciste (antes de commitear)
git diff

# Descartar cambios en un archivo
git restore nombre-del-archivo.js

# Bajar cambios si hay otros colaboradores
git pull
```

---

## Consejos

1. **Commits chicos y frecuentes:** mejor 5 commits chicos que 1 gigante. Si rompes algo, es facil volver atras.
2. **Mensajes claros:** alguien (o vos en 3 meses) deberia entender que hace el commit solo leyendo el mensaje.
3. **Siempre `git status` antes:** para no llevarte sorpresas de archivos que no querias commitear.
4. **No commitees secrets:** nunca subas claves de API, tokens, o contraseñas. El `.env` ya esta en `.gitignore`.
