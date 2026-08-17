# Implementacion SEO de Un Fulano Dev

## Arquitectura

La landing original se conserva como template en:

```text
seo/unfulanodev/templates/home.html
```

El contenido estructurado vive en:

```text
seo/unfulanodev/pages.js
seo/unfulanodev/schema.js
seo/unfulanodev/content/articles.js
```

El build se ejecuta con:

```text
npm run build:unfulano
```

La salida es:

```text
dist/unfulanodev
```

## Configuracion Cloudflare Pages

- Repository: este repositorio.
- Build command: `npm run build:unfulano`.
- Output directory: `dist/unfulanodev`.
- Dominio: `https://unfulanodev.com.ar`.
- No publicar `public/` directamente.
- No ejecutar `server.js` para este sitio.

## URLs indexables actuales

- `/`
- `/desarrollo-web`
- `/tiendas-online`
- `/sistemas-a-medida`
- `/crm`
- `/desarrollo-web-catamarca`
- `/tiendas-online-catamarca`
- `/sobre-nosotros`
- `/contacto`
- `/portfolio`
- `/portfolio/entremimos`
- `/portfolio/vertice-propiedades`
- `/portfolio/trama-indumentaria`
- `/portfolio/el-fogon-del-valle`
- `/portfolio/crm-retail`

`/privacidad` se publica con `noindex` y no entra al sitemap.

## Recursos generados

- `robots.txt`
- `sitemap.xml`
- `llms.txt`
- `manifest.webmanifest`
- `favicon.svg`
- `og.svg`
- `_headers`
- `_redirects`
- `404.html`
- `gracias.html`

## Integracion comercial

El formulario de Un Fulano envia JSON a `https://app.flexcrm.com.ar/api/landing/lead`. La API existente no se modifica. El build permite esta integracion mediante CSP y el frontend redirige el resultado exitoso a `/gracias` dentro de Cloudflare.

## IndexNow

La integracion aislada se ejecuta con:

```text
npm run indexnow:unfulano
```

Requiere `UNFULANO_INDEXNOW_KEY`. El build genera `/<clave>.txt` solamente cuando la variable esta configurada. Nunca se debe subir una clave de otro sitio.
