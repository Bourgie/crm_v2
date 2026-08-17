# SEO-MAINTENANCE.md — Mantenimiento SEO/GEO

## Rutina al publicar contenido

1. Editar `marketing/data.js` o `marketing/data-content.js` (nunca editar `dist/marketing` a mano).
2. `npm run build:marketing` y revisar el diff de `dist/marketing` y de `public/llms*.txt`.
3. `npm run test:backend` (valida sitemap, metadata y sincronización de precios).
4. Commit atómico (`seo: ...`), push y deploy de Cloudflare Pages.
5. Solicitar inspección de la URL nueva en Search Console y disparar IndexNow con la lista de URLs cambiadas.

## Rutina mensual

- Revisar Search Console: cobertura, páginas excluidas, errores de rastreo, mejoras y Core Web Vitals.
- Revisar Bing Webmaster: indexación, site scan y sitemap.
- Cruzar precios/claims de `marketing/data.js` contra los planes reales (`db_master.js` y panel superadmin).
- Revisar enlaces rotos del artefacto (test de sitemap cubre existencia de archivos; sumar rastreo externo si hace falta).
- Actualizar `SITE.updated` en `marketing/data.js` solo cuando cambie contenido (controla `lastmod`).

## Rutina trimestral

- Auditar `robots.txt` real servido por Cloudflare (puede inyectar reglas administradas).
- Verificar que `app.flexcrm.com.ar` y `admin.flexcrm.com.ar` sigan sin aparecer en los índices.
- Revisar la política de bots IA (qué crawlers se permiten) contra la decisión comercial.
- Correr Lighthouse/axe en home, `/precios` y una página de funcionalidad.
- Revisar la matriz de autoridad (`AUTHORITY-STRATEGY.md`) y el pipeline de casos de éxito.

## Rollback

- Contenido: revertir el commit de `marketing/` y redeployar Pages.
- Backend: Fly conserva imágenes anteriores (`fly releases` / `fly deploy` con el commit previo).
- El artefacto de marketing es estático: no hay migraciones de datos que revertir.

## Reglas

- No publicar drafts: si una página no está lista, no se agrega a `BLOG_POSTS` como `published: true` ni se crea su render.
- No modificar `dist/marketing` a mano ni commitearlo.
- No reintroducir Railway ni publicar `public/` completo en Pages.
- No agregar ratings, reviews o métricas sin datos reales autorizados.
