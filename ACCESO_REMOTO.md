# Acceso Remoto con Tailscale — PequeñosCRM Pro

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

## Para que el servidor inicie automáticamente con Windows

1. Crear un acceso directo a iniciar_crm.bat
2. Presionar Win+R, escribir: shell:startup
3. Pegar el acceso directo en esa carpeta

## Dispositivos móviles
Instalar la app Tailscale desde la App Store o Play Store,
iniciar sesión con la misma cuenta y acceder al CRM desde el navegador del celular.

---
Cualquier duda: https://tailscale.com/kb/
