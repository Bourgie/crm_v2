---
name: secrets-management
description: Usar cuando se agrega una integración externa nueva con credenciales (API keys, tokens, secrets), se rota una clave, o se migran secrets entre entornos. Guía el ciclo de vida completo de secrets en FlexCRM.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# Secrets Management — FlexCRM

## Arquitectura de secrets

```
┌─────────────────────────────┐
│  .env (nunca en git)        │  ← Claves maestras
│  CONFIG_ENCRYPTION_KEY      │
│  JWT_SECRET                 │
│  SA_SECRET                  │
│  ALLOWED_ORIGINS            │
├─────────────────────────────┤
│  DB config table (encriptado)│  ← API keys de terceros
│  tienda_woo_key             │     encriptadas con AES-256-GCM
│  tienda_woo_secret          │     usando CONFIG_ENCRYPTION_KEY
│  tienda_tn_access_token     │
│  tienda_meli_app_id         │
│  tienda_meli_client_secret  │
│  tienda_meli_access_token   │
│  tienda_meli_refresh_token  │
│  smtp_host / smtp_user      │
│  smtp_pass                  │
│  arca_access_token          │
│  arca_cert / arca_key       │
└─────────────────────────────┘
```

## Cómo agregar una nueva integración externa con credenciales

1. Definir la clave en `lib/crypto-utils.js` → `SENSITIVE_KEYS` si tiene nombre distinto
2. Almacenar: `db.setConfig({ mi_servicio_token: encryptValue(token) })`
3. Leer: `const token = decryptValue(db.getConfig('mi_servicio_token'))`
4. La integración route nunca debe loguear el token ni exponerlo en respuestas

## Cómo rotar claves

1. Generar nueva clave en `.env`
2. Ejecutar `node scripts/migrate-secrets.js`
3. Verificar que todos los servicios externos sigan funcionando
4. Hacer rollback solo si hay fallos — los secrets viejos se pierden al sobreescribir

## Dónde van las claves maestras

| Variable | Dónde se usa | Cómo generarla |
|----------|-------------|----------------|
| `JWT_SECRET` | Firma de JWT de usuarios | `openssl rand -hex 64` |
| `SA_SECRET` | Firma de JWT de superadmin | `openssl rand -hex 64` |
| `CONFIG_ENCRYPTION_KEY` | AES-256-GCM para secrets en DB | `openssl rand -hex 32` |

Todas van en `.env` (producción: Railway variables de entorno).

## Scripts

- `node scripts/migrate-secrets.js` — migra secrets de texto plano a encriptado
- `node scripts/rotate-encryption-key.js` — rota la CONFIG_ENCRYPTION_KEY (re-encripta todos los secrets)

## Reglas

- NUNCA hardcodear secrets en el código
- NUNCA loguear secrets (ni siquiera en desarrollo)
- NUNCA devolver secrets en respuestas API
- Siempre usar `lib/crypto-utils.js` para leer/escribir secrets en DB
- Al agregar un campo nuevo de secret a `config`, agregarlo a `SENSITIVE_KEYS` en `lib/crypto-utils.js`
