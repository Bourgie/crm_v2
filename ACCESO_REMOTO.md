# Acceso Remoto con Tailscale — PequeñosCRM Pro

> ⚠️ **NUNCA expongas RDP (3389) ni SSH (22) a internet.** Cloudflare detectó
> "Exposed RDP Servers" el 25-Jul-2026 para `admin.flexcrm.com.ar`. En nuestro
> caso fue falso positivo (Fly.io Anycast responde SYN-ACK en cualquier puerto
> pero el contenedor es Alpine Linux sin RDP). Se mitiga ocultando el origen
> tras Cloudflare proxy naranja + bloqueo de acceso directo por IP en `server.js`.
> Para acceso remoto a la PC on-premise usa **solo** Tailscale/WireGuard, nunca
> port-forward de 3389 en el router.

## ¿Qué es Tailscale?
Crea una red privada entre todas tus computadoras/sucursales sin abrir puertos
ni contratar servidor. Gratis para hasta 20 dispositivos.

## Paso 1: Instalar en la PC que tiene el servidor CRM

1. Ir a https://tailscale.com/download
2. Descargar para Windows e instalar
3. Iniciar sesión con Google o email
4. La PC aparece en el panel como dispositivo conectado

## Paso 2: Instalar en cada sucursal / dispositivo remoto

Mismos pasos — descargar, instalar, iniciar sesión con LA MISMA CUENTA

## Paso 3: Obtener la IP de Tailscale del servidor

En la PC servidor:
- Abrir el ícono de Tailscale en la barra de tareas
- Ver la IP asignada (ejemplo: 100.64.0.1)
- Anotar esa IP

## Paso 4: Acceder desde cualquier sucursal

Desde cualquier dispositivo en la red Tailscale, abrir el navegador y poner:
    http://100.64.0.1:3000
    (reemplazar 100.64.0.1 con la IP de Tailscale del servidor)

El servidor CRM debe estar corriendo (npm start).

## Configurar el PORT (opcional)

Para usar un puerto diferente, editar el archivo .env o crear uno:
    PORT=3000

## Seguridad
- Solo dispositivos de TU cuenta Tailscale pueden acceder
- La conexión es cifrada (WireGuard)
- No se expone ningún puerto a internet
- Verificá que RDP esté deshabilitado o solo en red privada: `services.msc` → Remote Desktop → deshabilitado, y firewall bloquea 3389 TCP inbound desde internet. Nunca hagas port-forward 3389 en el router.

## Infra Cloud (Fly.io + Cloudflare)

- `flexcrm.com.ar` (landing) está detrás de Cloudflare proxy naranja → IP oculta.
- `app.flexcrm.com.ar` y `admin.flexcrm.com.ar` deben estar también en **nube naranja (Proxied)** en Cloudflare DNS, no en gris (DNS-only). Esto oculta `66.241.125.246` y evita el falso positivo de RDP.
- En Fly `fly.toml` solo se exponen 80 y 443 → 3000. No añadas `[[services.ports]]` extra.
- El origen rechaza acceso directo por IP: `server.js` devuelve 421/redirige si `Host` es IP o `*.fly.dev`. Para bloqueo estricto, setea `ENFORCE_CLOUDFLARE_ORIGIN=1` en Fly secrets: `fly secrets set ENFORCE_CLOUDFLARE_ORIGIN=1`.
- Verificación: `npm run check:ports` → debe dar `OPEN sin banner (OK - Fly Anycast falso positivo)` y nunca `EXPOSED!`.

## Para que el servidor inicie automáticamente con Windows

1. Crear un acceso directo a iniciar_crm.bat
2. Presionar Win+R, escribir: shell:startup
3. Pegar el acceso directo en esa carpeta

## Dispositivos móviles
Instalar la app Tailscale desde la App Store o Play Store,
iniciar sesión con la misma cuenta y acceder al CRM desde el navegador del celular.

---
Cualquier duda: https://tailscale.com/kb/
