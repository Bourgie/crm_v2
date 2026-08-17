# SEO-IMPLEMENTATION.md — Implementación SEO/GEO/Autoridad

Rama: `feature/seo-geo` · Fecha: 2026-08-17

## Arquitectura

### Fuente de verdad única

Todo el contenido público nace de dos archivos:

- `marketing/data.js` — marca, planes, FAQ general y respuestas GEO.
- `marketing/data-content.js` — funcionalidades, soluciones, comparativas, blog y documentación.

El generador `scripts/build-marketing.js` produce, a partir de esos datos:

- HTML estático (home + 31 páginas, navegación, breadcrumbs, FAQ y CTA compartidos);
- JSON-LD con `@graph` y `@id` estables (`#org`, `#brand`, `#software`, `#website`, `#offer-*`, `#catalog`, `#webpage`, `#faq`, `#article`);
- `sitemap.xml` (solo URLs publicadas);
- `robots.txt` (marketing, con crawlers IA permitidos);
- `llms.txt` y `llms-full.txt` (también sincroniza las copias de `public/`);
- `404.html`, `_headers` y assets (`fc-og.png`, `fc-og.svg`, `flexcrm-indexnow-key.txt`).

### Salida y deploy

```text
Cloudflare Pages
  Build command: npm run build:marketing
  Output directory: dist/marketing
```

`dist/marketing/` está en `.gitignore` (artefacto, no fuente). El backend (Fly) mantiene la landing legada en `public/landing.html` solo para desarrollo local; el hostname `crm-v2.fly.dev` redirige 301 al dominio canónico.

### Índice por host (server.js)

- `X-Robots-Tag: noindex, nofollow` para `app.*`, `admin.*` y `*.fly.dev`.
- `robots.txt` específico: marketing (crawlers IA permitidos + sitemap) vs privado (sin sitemap, `/api/` bloqueado, `/app/` rastreable para que se vea el noindex).
- `/sitemap.xml` se sirve solo en hosts de marketing/desarrollo; 404 en hosts privados.
- Catch-all devuelve 404 real; las rutas legales (`/terminos-y-condiciones`, `/politica-de-privacidad`, `/politica-de-cookies`) siguen sirviendo el shell React.
- `/:codigo` mantiene el redirect de tenant solo para empresas existentes.

## Páginas publicadas (32 URLs)

- Home, `/funcionalidades` + 8 páginas, `/soluciones` + 4 páginas, `/precios`, `/comparativas` + 6 páginas, `/casos-de-exito`, `/documentacion`, `/sobre-flexcrm`, `/contacto`, `/demo`, `/blog` + 3 artículos.

## Schema

`Organization`, `Brand`, `SoftwareApplication`, `WebSite`, `WebPage`, `BreadcrumbList`, `FAQPage` (solo FAQ visible), `OfferCatalog`/`Offer` (solo en home y `/precios`, con precios aprobados en código), `Article` en posts publicados. Sin ratings, reviews, premios ni métricas inventadas.

## GEO

- Respuestas directas a "¿qué es?", "¿para quién?", "¿cuánto cuesta?", "¿tiene POS/stock/caja/multi-sucursal/ARCA/API/webhooks?" en HTML y en `llms-full.txt`.
- `llms.txt` complementario; la indexación depende del HTML + sitemap.

## Workflow editorial

1. Editar `marketing/data*.js` (o agregar contenido nuevo).
2. `npm run build:marketing` y revisar `dist/marketing`.
3. `npm run test:backend` (incluye `test/marketing-output.test.js`).
4. Commit y deploy de Pages.
5. Verificar en Search Console la URL nueva.

Los posts del blog no publicados figuran como "Próximos artículos" en el hub, sin URL ni sitemap.

## Decisiones registradas

- Marketing estático generado, no React, para no exponer el shell privado ni depender de CSR.
- No publicar `public/` completo en Pages (contiene app, admin, service worker y assets privados).
- Los precios publicados son los defaults del código (`db_master.js`); cualquier cambio comercial se refleja primero en `marketing/data.js`.
- Webhooks se menciona en FAQ; no se promete API pública (no existe contrato público versionado).
