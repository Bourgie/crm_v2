# SEO-AUDIT.md — Auditoría SEO/GEO de FlexCRM

Fecha: 2026-08-17 · Rama: `feature/seo-geo` · Estado: auditoría inicial completada, correcciones aplicadas en esta rama.

## Topología objetivo

| Host | Rol | Indexación |
|---|---|---|
| `flexcrm.com.ar` | Marketing (Cloudflare Pages, artefacto `dist/marketing`) | indexable |
| `app.flexcrm.com.ar` | App privada (Fly.io) | `noindex, nofollow` (meta + `X-Robots-Tag`) |
| `admin.flexcrm.com.ar` | Superadmin (Fly.io) | `noindex, nofollow` |
| `crm-v2.fly.dev` | Hostname operativo de Fly | redirige a `https://flexcrm.com.ar/` |

Railway no forma parte del despliegue. Configuración histórica eliminada en `036dac6` / `8586b6f`.

## Stack y renderizado

- Backend: Node.js + Express + SQLite multi-tenant (`server.js`).
- App: React 18 + Vite + React Router. CSR puro, sin SSR/SSG. Shell en `public/app/index.html` con `noindex`.
- Marketing: HTML estático generado por `scripts/build-marketing.js` a partir de `marketing/data.js` + `marketing/data-content.js`. Sin framework adicional.

## Estado encontrado (antes de esta rama)

| Hallazgo | Severidad | Resuelto en esta rama |
|---|---|---|
| `flexcrm.com.ar/sitemap.xml` respondía 404 en producción | Blocker | Sí (artefacto estático; requiere publicar Pages) |
| Cloudflare servía robots administrado que bloquea crawlers IA | Alta | Parcial (robots propio en artefacto; requiere revisar Cloudflare) |
| El HTML live de Cloudflare no coincidía con `public/landing.html` | Alta | Parcial (requiere reconectar Pages a este repo) |
| `app.flexcrm.com.ar` compartía robots y sitemap del marketing | Alta | Sí (robots por host, sitemap restringido) |
| `crm-v2.fly.dev` exponía copia indexable de la landing | Alta | Sí (301 al dominio canónico) |
| Catch-all devolvía 200 con el shell de la app (soft-404) | Alta | Sí (404 real; rutas legales explícitas) |
| `gracias.html`, `offline.html`, `superadmin.html` sin noindex | Media | Sí |
| Links legales relativos que rompían en Pages | Media | Sí (absolutos a la app) |
| Sitemap dinámico con solo la home y `lastmod` diario | Media | Sí (sitemap estático con 32 URLs) |
| `llms.txt`/`llms-full.txt` duplicados a mano y sin fuente única | Media | Sí (generados desde `marketing/data.js`) |
| `lastmod` igual a la fecha del día en cada request | Baja | Sí (fecha fija de actualización de contenido) |
| Índice del knowledge graph desactualizado | Info | Re-indexar al cerrar la rama |

## Contradicciones comerciales detectadas (requieren aprobación del dueño)

1. La demo publicitaba "todos los módulos"; el plan trial del código habilita 8 módulos. Se corrigió a la lista real.
2. Enterprise publicitaba "Webhooks + API" y "ilimitados"; el código no tiene módulo `api` en el plan y usa límites 999. Se corrigió a "escala de empresa" y se dejó webhooks en FAQ.
3. Los planes Pro del entorno local (`data/master.db`) diferían de los defaults del código. La página de precios usa los defaults del código; verificar con el dueño antes de publicar.
4. Identidad legal: FlexCRM es la marca; el proveedor es Un Fulano Dev. El Schema usa `Organization` FlexCRM con `publisher` y links a Un Fulano Dev.

## Reglas del proyecto (no negociables)

- No inventar clientes, reviews, métricas, premios ni integraciones.
- Sitemap solo con URLs públicas, canónicas y publicadas.
- No indexar áreas privadas de la app.
- `robots.txt` no es control de seguridad.
- No páginas geográficas artificiales ni keyword stuffing.
- Drafts fuera del sitemap hasta revisión humana.

## Pendientes que requieren acción manual

1. Reconectar Cloudflare Pages al build `npm run build:marketing` con output `dist/marketing` (hoy el live no refleja este repo).
2. Revisar en Cloudflare el bloqueo administrado de bots IA (`ClaudeBot`, `GPTBot`, `PerplexityBot`, etc.) según la política comercial.
3. Verificar Search Console y Bing (ver `SEARCH-CONSOLE.md` y `BING-WEBMASTER.md`).
4. Aprobar matriz comercial de planes antes de amplificar `/precios`.
