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

### 4. Variables de entorno (opcionales)
En Railway → Variables:
```
NODE_ENV=production
PORT=3000  (Railway lo setea automáticamente)
```

### 5. Dominio
- Railway asigna automáticamente: `tuapp.up.railway.app`
- Para dominio propio: Settings → Custom Domain

## Acceso multi-empresa
Una vez deployado en Railway:
- Crear empresas desde: `tuapp.up.railway.app/superadmin.html`
- Usuario: superadmin / Contraseña: superadmin123
- **¡Cambiar la contraseña del superadmin inmediatamente!**

## Costo estimado
- Plan Hobby: ~$5/mes (suficiente para empezar)
- Plan Pro: ~$20/mes (para más empresas y tráfico)
