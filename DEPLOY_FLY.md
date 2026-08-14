# Deploy en Fly.io — PequeñosCRM Pro

App: `crm-v2` · Región: `dfw` · Volumen persistente `crm_data` → `/app/data` · `NODE_ENV=production` (fijado en `fly.toml`)

## Secrets obligatorios

```bash
fly secrets set \
  SEED_SUPERADMIN_PASSWORD=<password fuerte> \
  SEED_ADMIN_PASSWORD=<otra password fuerte>
```

Generar passwords fuertes con: `node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"`

> ⚠️ En producción el servidor **no arranca** si la DB se crea de cero sin estas dos variables
> (fail-fast — ya no se siembran claves por defecto tipo `superadmin123`/`admin123`).

**No tocar si ya existen:**
- `JWT_SECRET` y `SA_SECRET`: sin ellos el server no arranca; rotarlos desloguea a todos los usuarios e invalida los códigos de respaldo 2FA.
- `CONFIG_ENCRYPTION_KEY`: los secretos guardados (ARCA, tienda, SMTP) se desencriptan con ella. Si no existía, generá una nueva con
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — los próximos secretos se guardarán encriptados.

## Deploy

```bash
fly deploy
```

## Rotación de passwords (eliminar claves de prueba/default)

Si la DB ya existía con claves de prueba (`superadmin123`, `123456`, `admin123`, etc.):

```bash
# 1. Auditar (no modifica nada)
fly ssh console -C "node scripts/rotate_passwords.js --solo-audit"

# 2. Rotar superadmin + usuarios de 'entre mimos' (1234567)
fly ssh console -C "node scripts/rotate_passwords.js"

# 3. Otra empresa
fly ssh console -C "node scripts/rotate_passwords.js --empresa <codigo>"
```

- El script escribe sobre el volumen persistente `/app/data`.
- Imprime las passwords temporales **una sola vez** — copiarlas y entregarlas por canal seguro.
- Cada cuenta rotada queda con `must_change_password=1` (obliga cambio en el próximo login) y las sesiones del superadmin se invalidan (`token_version`).
- Los usuarios de prueba conocidos (`majo`, `marita`, `bourgie` en `entre mimos`) se desactivan automáticamente.

## Primer login post-rotación

1. `https://crm-v2.fly.dev/superadmin.html` con la password temporal → el sistema obliga a cambiarla.
2. Lo mismo en el login normal para el admin de "entre mimos".

## Verificación

```bash
fly ssh console -C "node scripts/rotate_passwords.js --solo-audit"
```

Resultado esperado: `✅ sin match` en todas las líneas.
