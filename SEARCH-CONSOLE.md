# Google Search Console

## Alta inicial

- Crear una propiedad de dominio para `unfulanodev.com.ar`.
- Verificar por DNS en el proveedor que administra el dominio.
- Confirmar que el dominio canonico sea el apex sin barra final.
- Configurar la redireccion de `www` solamente si el alias existe y esta controlado.

## Sitemap

Enviar:

```text
https://unfulanodev.com.ar/sitemap.xml
```

El sitemap debe responder `200`, ser XML valido y contener solo las 15 URLs indexables actuales.

## Inspeccion de URLs

- Inspeccionar la home.
- Inspeccionar una pagina de servicio.
- Inspeccionar una pagina local.
- Inspeccionar `/portfolio`.
- Confirmar canonical elegida por Google.
- Solicitar indexacion solo despues de verificar el deploy.

## Seguimiento

- Cobertura y paginas excluidas.
- Consultas de marca y Catamarca.
- CTR de titles y descriptions.
- Posicion de servicios y portfolio.
- Core Web Vitals.
- Errores de sitemap y rastreo.
