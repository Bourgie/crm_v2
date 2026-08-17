# SEO-TESTS.md — Matriz de tests SEO/GEO

## Comandos

```powershell
npm test                # vitest raíz + frontend
npm run test:backend    # backend, seguridad, host SEO y artefacto de marketing
npm run build:react     # build de la app (Fly)
npm run build:marketing # artefacto de marketing (Cloudflare Pages)
npm audit --omit=dev    # auditoría runtime (raíz)
```

## Cobertura actual

### `test/backend.test.js` — bloque "SEO por host"

- `robots.txt` del host app es privado y no publica el sitemap.
- `robots.txt` de `crm-v2.fly.dev` es privado.
- `robots.txt` de marketing permite crawlers IA y referencia el sitemap.
- El sitemap no se sirve en hosts privados (404).
- `crm-v2.fly.dev/` redirige 301 a `https://flexcrm.com.ar/`.
- `/landing.html` no se expone en `fly.dev`.
- Hosts privados envían `X-Robots-Tag: noindex, nofollow`.
- Rutas desconocidas devuelven 404 real.
- Rutas legales públicas siguen funcionando.
- `/:codigo` redirige solo para empresas existentes.

### `test/marketing-output.test.js` — artefacto de marketing

- Home con title, description, canonical, OG, Twitter, un solo H1 y JSON-LD.
- Todas las páginas con title, canonical y JSON-LD únicos (sin duplicados).
- Sitemap: solo URLs públicas del dominio canónico; cada URL resuelve a un archivo; sincronizado con `collectUrls()`.
- `robots.txt` permite crawlers IA y referencia el sitemap.
- No se publican archivos privados (`app/`, `superadmin.html`, `sw.js`, `manifest.json`, `gracias.html`, `offline.html`, `landing.html`, `unfulano-landing.html`).
- `llms.txt`/`llms-full.txt` sincronizados con los precios publicados y sin rutas privadas.
- FAQ visible coincide con el `FAQPage` del JSON-LD.
- `404.html`, assets OG, key IndexNow y `_headers` presentes.

## Qué falta cubrir (roadmap)

- Smoke tests contra los dominios live post-deploy (marketing 200, sitemap 200, app 302 + noindex).
- Validación de JSON-LD con el Rich Results Test de Google (manual).
- Playwright/E2E para el flujo marketing → signup con UTM.
- Axe/Lighthouse en CI para accesibilidad y Core Web Vitals.
- Verificación de que Cloudflare no inyecta reglas administradas que contradigan `dist/marketing/robots.txt`.

## Criterios de aceptación del proyecto

- `npm test` y `npm run test:backend` en verde.
- `build:react` y `build:marketing` sin errores.
- Marketing indexable; app/admin noindex en HTML y headers.
- Sitemap sin URLs privadas.
- Documentación completa (`SEO-*.md`, `AUTHORITY-STRATEGY.md`, `SEARCH-CONSOLE.md`, `BING-WEBMASTER.md`).
