# PequeñosCRM Pro — Guía de Instalación y Red Local

## Requisitos
- Node.js v22 o superior (https://nodejs.org)
- Windows 10/11

---

## Instalación en la PC Servidor (primera vez)

1. Descomprimí el archivo `crm_v2.zip` en una carpeta, por ejemplo `C:\CRM\crm_v2`
2. Abrí una terminal (cmd o PowerShell) en esa carpeta
3. Ejecutá:
   ```
   npm install
   npm start
   ```
4. La primera vez va a crear la base de datos automáticamente
5. Va a aparecer algo así:
   ```
   Esta PC:   http://localhost:3000
   Red local: http://192.168.1.100:3000
   ```
6. Abrí el navegador en `http://localhost:3000`

---

## Configurar red local (múltiples PCs)

### En la PC Servidor:

**Paso 1 — Anotá la IP local**
La IP aparece al arrancar el servidor: `http://192.168.1.XXX:3000`
También podés verla con `ipconfig` en cmd (buscar "Dirección IPv4")

**Paso 2 — Abrir el puerto 3000 en el firewall**
1. Buscá "Firewall de Windows" en el menú inicio
2. Clic en "Configuración avanzada"
3. "Reglas de entrada" → "Nueva regla"
4. Tipo: Puerto → TCP → Puerto específico: `3000`
5. Permitir la conexión → Siguiente → Siguiente
6. Nombre: `CRM Puerto 3000` → Finalizar

**Paso 3 — IP fija (recomendado)**
Para que la IP no cambie cada vez que reiniciás:
1. Panel de Control → Centro de redes → tu conexión WiFi/Ethernet
2. Propiedades → Protocolo IPv4
3. Usar la siguiente dirección IP: ponés la IP actual
4. Máscara: 255.255.255.0
5. Puerta de enlace: la IP del router (generalmente 192.168.1.1)

### En cada PC Sucursal:

1. Abrí Chrome o Edge
2. Ingresá: `http://192.168.1.XXX:3000` (la IP del servidor)
3. Iniciá sesión con el usuario asignado a esa sucursal

**No hay nada que instalar en las PCs de las sucursales.** Solo necesitan un navegador.

---

## Arranque automático al iniciar Windows (recomendado)

Para que el servidor arranque solo cuando encendés la PC:

1. Creá un archivo `iniciar_crm.bat` en la carpeta del CRM con este contenido:
   ```batch
   @echo off
   cd /d C:\CRM\crm_v2
   npm start
   ```
2. Copiá ese archivo (o un acceso directo) a:
   `C:\Users\TU_USUARIO\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`

---

## Puerto personalizado

Si el puerto 3000 está ocupado, podés cambiarlo:

1. Creá un archivo `.env` en la carpeta del CRM:
   ```
   PORT=3001
   ```
2. Reiniciá el servidor

---

## Backup de datos

- Los datos están en `data/crm.db`
- Los backups automáticos se guardan en `data/backups/`
- Para restaurar: copiá el archivo `.db` que quieras a `data/crm.db` y reiniciá

---

## Problemas comunes

| Problema | Solución |
|---------|---------|
| "No se puede conectar" desde otra PC | Verificar que el firewall tenga el puerto 3000 abierto |
| La IP cambia cada día | Configurar IP fija (ver arriba) |
| "Puerto en uso" al iniciar | Cambiar PORT en `.env` o cerrar otro proceso que use el 3000 |
| Base de datos corrupta | Restaurar desde `data/backups/` |

