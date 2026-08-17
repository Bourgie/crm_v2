# Bing Webmaster Tools

## Alta

- Registrar `unfulanodev.com.ar`.
- Verificar por DNS o importar la verificacion de Search Console.
- Enviar `https://unfulanodev.com.ar/sitemap.xml`.
- Revisar inspeccion de URL y errores de rastreo.

## IndexNow

La integracion local esta separada de FlexCRM:

```text
UNFULANO_INDEXNOW_KEY=<clave generada para este host>
npm run build:unfulano
npm run indexnow:unfulano
```

El build crea `/indexnow-key.txt` solo con la variable configurada. La clave debe ser exclusiva de `unfulanodev.com.ar` y no debe reutilizar la de otro host.

IndexNow solo notifica cambios; no garantiza indexacion ni reemplaza sitemap, contenido, enlaces o Search Console.
