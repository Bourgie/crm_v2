# Deploy en Railway — PequeñosCRM Pro

## Pasos (10 minutos)

### 1. Subir código a GitHub
- Crear repositorio en github.com (puede ser privado)
- `git init && git add . && git commit -m "PequeñosCRM Pro"`
- `git push origin main`

### 2. Crear proyecto en Railway
- Ir a https://railway.app
- "New Project" → "Deploy from GitHub"
- Seleccionar el repositorio

### 3. Configurar volumen persistente
- En Railway, ir a tu servicio → "Volumes"
- Agregar volumen: Mount Path = `/app/data`
- Esto guarda la base de datos entre deploys

### 4. Variables de entorno (OBLIGATORIAS)

En Railway → Variables:

```
NODE_ENV=production
JWT_SECRET=<random de 64+ chars>
SA_SECRET=<random de 64+ chars>
CONFIG_ENCRYPTION_KEY=<64 caracteres hex (32 bytes)>
SEED_SUPERADMIN_PASSWORD=<password fuerte>
SEED_ADMIN_PASSWORD=<password fuerte>
PORT=3000  (Railway lo setea automáticamente)
```

> ⚠️ En producción, el servidor **no arranca** sin `SEED_SUPERADMIN_PASSWORD` y
> `SEED_ADMIN_PASSWORD` si la base se crea de cero (fail-fast, ya no se siembran
> claves por defecto tipo `superadmin123`/`admin123`).
> Generar valores: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
> Para `CONFIG_ENCRYPTION_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 5. Dominio
- Railway asigna automáticamente: `tuapp.up.railway.app`
- Para dominio propio: Settings → Custom Domain

## Acceso multi-empresa
Una vez deployado en Railway:
- Crear empresas desde: `tuapp.up.railway.app/superadmin.html`
- Usuario: superadmin — la contraseña inicial es `SEED_SUPERADMIN_PASSWORD`
- **El primer login obliga a cambiarla** (`must_change_password=1`).

## Rotación de passwords (eliminar claves de prueba/default)

Si la DB ya existía con claves de prueba (`superadmin123`, `123456`, `admin123`, etc.):

1. Subir el código actual (incluye `scripts/rotate_passwords.js`).
2. En Railway → Shell del servicio (o localmente apuntando a la DB):
   ```bash
   node scripts/rotate_passwords.js --solo-audit   # ver qué cuentas están afectadas
   node scripts/rotate_passwords.js                # rota superadmin + usuarios de '1234567'
   node scripts/rotate_passwords.js --empresa <codigo>  # rota otra empresa
   ```
3. El script imprime las passwords temporales UNA sola vez (entregarlas por canal seguro);
   cada cuenta quedará con `must_change_password=1` y las sesiones del superadmin se invalidan.
4. Usuarios de prueba conocidos (`majo`, `marita`, `bourgie` en `entre mimos`) se desactivan automáticamente.

## Costo estimado
- Plan Hobby: ~$5/mes (suficiente para empezar)
- Plan Pro: ~$20/mes (para más empresas y tráfico)
