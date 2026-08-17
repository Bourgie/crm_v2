# BING-WEBMASTER.md — Bing Webmaster Tools e IndexNow

## 1. Verificación (manual, requiere acceso)

1. Crear propiedad `https://flexcrm.com.ar` en Bing Webmaster Tools.
2. Verificar por DNS (CNAME con el token) en Cloudflare, o importando desde Search Console si ya está verificado.
3. Confirmar propiedad activa antes de enviar el sitemap.

## 2. Sitemap

1. Confirmar que `https://flexcrm.com.ar/sitemap.xml` responde 200.
2. Enviar el sitemap y revisar el conteo (32 URLs) y errores.
3. Revisar "Site scan" y resolver errores de SEO reportados.

## 3. IndexNow

El proyecto ya tiene infraestructura:

- Key file publicado en el artefacto: `https://flexcrm.com.ar/flexcrm-indexnow-key.txt`.
- Script: `scripts/indexnow.js` (`npm run indexnow`), configurable con `INDEXNOW_KEY`, `SEO_SITE_URL` y `SKIP_INDEXNOW`.
- Nota: hoy el script solo envía la home y corre al iniciar el server de Fly. Para el artefacto de Pages, disparar IndexNow con la lista de URLs cambiadas tras cada publicación (manual o CI).

Pasos:

1. Verificar que el contenido del key file coincide con la key usada.
2. Enviar payload de prueba con la home y revisar respuesta 200/202.
3. Agregar las URLs nuevas/actualizadas en cada deploy de contenido.

## 4. IndexNow no garantiza indexación

IndexNow es una notificación, no un ranking ni una garantía. La indexación depende del rastreo normal, sitemap y calidad de contenido.

## 5. Rutina

- Mensual: impresiones/clics/CTR, errores de sitemap y site scan.
- Por cada publicación: IndexNow con las URLs cambiadas.
- Si se indexa `app.` o `admin.`: revisar `X-Robots-Tag` y esperar re-crawl.
