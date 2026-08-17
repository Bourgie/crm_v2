---
name: incident-response
description: Playbook de respuesta a incidentes de seguridad en FlexCRM — fuga de API keys, breach entre tenants, fuerza bruta masiva, credenciales comprometidas, accesos no autorizados.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# Incident Response — FlexCRM

Playbook de respuesta a incidentes. Activar cuando:
- Se detecta una API key expuesta en GitHub o logs
- Un cliente reporta que ve datos de otra empresa (breach multi-tenant)
- Hay un pico de intentos de login fallidos (fuerza bruta)
- Se sospecha que una cuenta fue comprometida
- Aparecen registros de auditoria sospechosos
- Fly.io, Cloudflare o el proveedor de hosting reporta actividad inusual

## Niveles de severidad

| Nivel | Definicion | Ejemplos | Tiempo de respuesta |
|-------|-----------|----------|-------------------|
| **P0 — Critico** | Datos de multiples tenants expuestos, breach activo | Fuga entre tenants, DB expuesta publicamente | Inmediato (15 min) |
| **P1 — Alto** | Un tenant comprometido, API key expuesta | Cuenta admin vulnerada, credencial SMTP filtrada | < 1 hora |
| **P2 — Medio** | Intento de ataque bloqueado, vulnerabilidad sin explotar | Fuerza bruta mitigada, CVE en dependencia sin fix | < 24 horas |
| **P3 — Bajo** | Riesgo teorico, hardening recomendado | Configuracion suboptima, falta de encabezado | Proximo sprint |

---

## P0 — Breach multi-tenant (fuga de datos entre empresas)

### Sintomas
- Cliente reporta que ve datos de otra empresa
- `req.db` sin filtrar por tenant en alguna ruta
- DB de empresa A cargada para request de empresa B

### Respuesta inmediata

1. **AISLAR**: Detener el servidor o poner en modo mantenimiento
2. **IDENTIFICAR**: Revisar logs de auditoria de los ultimos 30 minutos
   ```bash
   grep -rn "audit_log\|auditoria" data/ --include="*.db" 2>&1 | head -50
   ```
3. **CONTENER**: Identificar la ruta vulnerable:
   ```bash
   grep -rn "require.*db_sqlite" routes/ --include="*.js" | grep -v "_getDB\|req\.db"
   ```
4. **ERRADICAR**: Aplicar el fix (inyectar `req.db` via middleware, validar tenant)
5. **RECUPERAR**: Verificar que el fix funciona, reactivar servidor
6. **APRENDER**: Documentar en `ADRs/` la causa raiz y como prevenirla

### Verificacion post-mortem
- [ ] La ruta vulnerable usa `req.db` en lugar de DB importada directamente
- [ ] `authMiddleware` y `validateTenant` estan en todas las rutas
- [ ] No hay `require('../db_sqlite')` en rutas nuevas
- [ ] Test de regresion agregado

---

## P1 — API key o secret expuesto

### Sintomas
- GitHub Advanced Security o `git-secrets` detecta un secret commiteado
- API key de MercadoLibre/WooCommerce/TiendaNube aparece en logs
- `.env` commiteado accidentalmente
- `CONFIG_ENCRYPTION_KEY` comprometida

### Respuesta

1. **ROTAR INMEDIATAMENTE** la clave comprometida en el servicio externo (Meli, Woo, etc.)
2. **LIMPIAR** el historial de git si se commiteo:
   ```bash
   git filter-repo --path .env --invert-paths
   ```
   O si es una linea especifica en un archivo:
   ```bash
   git filter-repo --replace-text <(echo "clave-expuesta==>CLAVE_ROTADA")
   ```
3. **ACTUALIZAR** `.env` con la nueva clave
4. **VERIFICAR** que el servicio externo sigue funcionando
5. **INVALIDAR** todos los tokens existentes y forzar re-login de usuarios

### Si CONFIG_ENCRYPTION_KEY fue comprometida:
1. Generar nueva clave: `openssl rand -hex 32`
2. Ejecutar `node scripts/rotate-encryption-key.js` para re-encriptar todos los secrets en DB
3. Actualizar `.env` en todos los entornos (local, staging, Fly.io)
4. Forzar re-deploy

---

## P1 — Cuenta comprometida (admin o superadmin)

### Sintomas
- Actividad inusual en `audit_log` con ese `user_id`
- Cambios de configuracion no autorizados
- Login desde IP o ubicacion desconocida

### Respuesta

1. **BLOQUEAR** la cuenta: `db.update('usuarios', userId, { activo: false })`
2. **INVALIDAR** todos los refresh tokens:
   ```sql
   UPDATE password_reset_tokens SET usado=1 WHERE usuario_id=? AND id LIKE 'rt_%'
   ```
3. **ROTAR** JWT_SECRET para invalidar todos los tokens activos
4. **AUDITAR** que cambios hizo la cuenta comprometida (ventas, config, usuarios)
5. **NOTIFICAR** al cliente si hay datos expuestos
6. **RESTAURAR** desde backup si se hicieron cambios destructivos

---

## P2 — Fuerza bruta / ataque DDoS

### Sintomas
- Muchos intentos de login fallidos en poco tiempo
- Rate limiter disparandose
- CPU/memoria del servidor al limite

### Respuesta

1. **VERIFICAR** que los rate limiters estan activos:
   ```bash
   grep -rn "rateLimit\|limiter" server.js routes/
   ```
2. **BLOQUEAR** IPs sospechosas temporalmente mediante los controles del proveedor activo (Fly.io/Cloudflare) o nginx
3. **AUMENTAR** rate limits si es necesario (pero mantener proteccion)
4. **ANALIZAR** patron: `.isSuspicious()` en `lib/suspicious-activity.js` ya detecta esto
5. **REVISAR** si el ataque es dirigido (una empresa especifica) o generico

---

## P2 — Vulnerabilidad CVE en dependencia

### Sintomas
- `npm audit` reporta critical/high
- GitHub Dependabot alert
- Aviso de seguridad en la comunidad de la dependencia

### Respuesta

1. **IDENTIFICAR** si el CVE afecta el uso real de la dependencia en FlexCRM
2. **ACTUALIZAR** si hay fix disponible: `npm update <paquete>`
3. **MITIGAR** si no hay fix: deshabilitar la funcionalidad afectada o usar un wrapper
4. **BUSCAR ALTERNATIVA** si la dependencia esta abandonada
5. **TESTEAR** que todo funcione despues del cambio

---

## P3 — Actividad sospechosa en webhooks

### Sintomas
- Webhooks recibiendo payloads malformados
- Timestamps fuera de rango
- Firma HMAC no coincide

### Respuesta

1. **VERIFICAR** que el webhook tiene validacion de firma (HMAC)
2. **LOGEAR** payloads sospechosos para analisis (NUNCA loguear el secret)
3. **ROTAR** el webhook secret si se sospecha compromiso
4. **RATE LIMIT** ya esta en `server.js:124-129` — verificar que funciona

---

## Registro post-incidente

Despues de cada incidente, documentar en `.ai/incidents/YYYY-MM-DD-brief.md`:

```markdown
# Incidente: [titulo] — [fecha]

- **Severidad**: P0/P1/P2/P3
- **Duracion**: [inicio] — [fin]
- **Impacto**: [tenants afectados, datos expuestos, tiempo offline]
- **Causa raiz**: [que fallo]
- **Deteccion**: [como nos enteramos]
- **Respuesta**: [pasos tomados]
- **Prevencion**: [que cambiamos para que no vuelva a pasar]
- **Lecciones**: [que aprendimos]
```

## Reglas

1. NUNCA asumir que "ya esta arreglado" sin verificar
2. Siempre rotar credenciales ANTES de limpiar el repo (el orden importa)
3. No notificar a clientes sin confirmacion de que hubo breach real
4. Documentar TODO incidente, aunque sea menor
5. Si hay breach multi-tenant, prioridad absoluta sobre cualquier feature
6. Nunca borrar logs de auditoria durante un incidente — son la evidencia
