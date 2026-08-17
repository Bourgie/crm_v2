# SEARCH-CONSOLE.md — Google Search Console

## 1. Verificación (manual, requiere acceso)

1. Crear/abrir propiedad de dominio: `flexcrm.com.ar`.
2. Elegir verificación por DNS: agregar el registro TXT en Cloudflare (DNS de `flexcrm.com.ar`).
3. Confirmar en Search Console. La propiedad de dominio cubre `www` y subpaths; `app.` y `admin.` pertenecen a otra propiedad o se dejan sin verificar (son noindex).

## 2. Sitemap

1. Confirmar que Pages publica `dist/marketing` y que `https://flexcrm.com.ar/sitemap.xml` responde 200 con XML.
2. En Search Console → Sitemaps: enviar `https://flexcrm.com.ar/sitemap.xml`.
3. Verificar estado "Correcto" y que el conteo de URLs coincide con las 32 páginas del build.

## 3. Inspección de URLs

Inspeccionar y solicitar indexación de:

- `https://flexcrm.com.ar/`
- `/funcionalidades/`, `/soluciones/`, `/precios/`
- 1 página por tipo: `/funcionalidades/punto-de-venta/`, `/soluciones/indumentaria/`, `/comparativas/flexcrm-vs-excel/`, `/blog/que-es-un-sistema-de-gestion/`, `/documentacion/`

Verificar en cada una: canonical, indexabilidad y que no aparezca contenido de `app.` o `admin.`.

## 4. Cobertura e indexación

- Revisar "Páginas": indexadas vs excluidas (soft-404, canonical, rastreo).
- Confirmar que no hay URLs de `app.flexcrm.com.ar` o `crm-v2.fly.dev` indexadas.
- Si aparecen, validar la directiva `X-Robots-Tag` y esperar re-crawl; usar "Quitar URLs" solo para contenido sensible.

## 5. Core Web Vitals y mejoras

- Revisar CWV en móvil y desktop para las páginas de marketing.
- Revisar "Mejoras" (breadcrumbs, FAQ): el FAQ rico solo es válido si el FAQ es visible (nuestro build lo garantiza).

## 6. Consultas y rendimiento

- Consultas marca vs no marca (segmentar por regex "flexcrm").
- CTR y posición media por página.
- Exportar mensualmente para `SEO-MONITORING.md`.

## 7. Notas

- Search Console no necesita GA4.
- Las alertas de seguridad/manual actions se revisan en cada ciclo mensual.
- Si Cloudflare mantiene reglas administradas de robots, la cobertura de bots IA no depende de Search Console sino de la configuración de Cloudflare.
