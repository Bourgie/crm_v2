# Auditoria SEO, GEO y autoridad

Fecha de auditoria: 2026-08-17

## Alcance

Esta auditoria cubre exclusivamente Un Fulano Dev y su entrega estatica para `unfulanodev.com.ar`. FlexCRM, Fly.io y la API de formularios se consideran dependencias externas y no se modifican en esta sesion.

## Estado inicial

- `public/unfulano-landing.html` era una landing estatica de 833 lineas con CSS y JavaScript inline.
- El dominio publico estaba servido desde Cloudflare, separado del servidor Express.
- La home respondia `200`, pero las rutas de servicios y portfolio no existian.
- `/sitemap.xml` solo contenia la home.
- Los enlaces `/demos/...` del portfolio respondian `404`.
- La landing tenia title, description, canonical, Open Graph, Twitter Cards, Organization y FAQ schema parcial.
- Faltaban `WebSite`, `WebPage`, `Service`, `BreadcrumbList` y un grafo de entidad coherente.
- El template dentro de `public/` podia quedar expuesto por el hosting de FlexCRM.
- El formulario usaba una redireccion cross-origin dificil de seguir desde `fetch`.
- El pixel `noscript` podia registrar una visita sin consentimiento.
- Los campos del formulario no tenian labels asociados y el skip link no apuntaba al contenido principal.

## Decisiones

- La fuente de Un Fulano se separa del `public/` compartido de FlexCRM.
- Cloudflare Pages publica `dist/unfulanodev`, nunca el directorio `public/` completo.
- Las URLs canonicas no llevan barra final.
- Los demos no se presentan como clientes, resultados, reseñas ni casos de exito.
- Los articulos permanecen como borradores hasta una revision humana.
- La politica de crawlers permite busqueda y referencia IA, pero separa el acceso de entrenamiento.

## Riesgos pendientes

- El build aun debe configurarse en el proyecto Cloudflare Pages correcto.
- La politica gestionada de Cloudflare debe revisarse para que no contradiga el `robots.txt` propio.
- El archivo OG es SVG; conviene validar previews de redes y bots y rasterizarlo si alguna plataforma lo requiere.
- Telefono, email, precios y promesas comerciales deben ser validados por el responsable antes de ampliar su uso en contenidos.
- La pagina de privacidad es preliminar y requiere revision legal.
