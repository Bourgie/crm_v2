# Mantenimiento SEO de Un Fulano Dev

## Antes de cada deploy

- Ejecutar `npm run test:unfulano`.
- Ejecutar `npm run build:unfulano`.
- Revisar `git diff` y confirmar que no se incluyeron archivos de FlexCRM.
- Verificar que el sitemap solo contenga paginas publicadas.
- Confirmar que no haya precios o promesas sin validar.
- Probar formulario, WhatsApp, email y `/gracias`.
- Verificar headers y redirects en Cloudflare.

## Flujo editorial

- Escribir el articulo en `seo/unfulanodev/content/articles.js`.
- Mantener `status: 'draft'` durante la revision.
- Revisar exactitud, utilidad, ejemplos, enlaces y CTA.
- Confirmar datos comerciales con el responsable.
- Implementar el renderer de articulo antes de cambiar a `published`.
- Ejecutar tests y revisar el HTML generado.
- Publicar una cantidad sostenible, no todo el backlog de una vez.

## Revision mensual

- Paginas indexadas.
- Impresiones, clics, CTR y posicion.
- Consultas de marca y consultas locales.
- URLs con errores de rastreo.
- Core Web Vitals.
- Enlaces internos rotos.
- Estado del sitemap y robots.
- Demos y enlaces externos.
- Consistencia de nombre, ubicacion, contacto y perfiles.

## Reglas editoriales

- No crear paginas cambiando solo la ciudad.
- No repetir la misma respuesta para varias keywords.
- No inventar clientes, resultados, estadisticas ni reseñas.
- No comprar backlinks ni usar redes artificiales.
- No publicar drafts automaticamente.
