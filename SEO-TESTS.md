# Tests SEO y GEO

## Comando principal

```text
npm run test:unfulano
```

Estado actual: 22 tests aprobados.

## Cobertura

- Build aislado de Cloudflare.
- Inventario de archivos generados.
- Sitemap XML y URLs canonicas.
- Exclusión de drafts y privacidad del sitemap.
- Robots y politica de crawlers IA.
- `title`, description, robots, canonical y Open Graph.
- H1 unico por pagina.
- JSON-LD parseable.
- IDs estables de Organization, WebSite, WebPage y Service.
- CollectionPage, ItemList y CreativeWork del portfolio.
- Paridad entre FAQ visible y FAQ JSON-LD.
- Formularios y tracking dentro del contrato de integracion aprobado.
- Labels, main, skip link, focus-visible y aria-live.
- Headers Cloudflare.
- Enlaces internos contra el contrato de rutas.
- IndexNow sin red cuando falta la clave.
- Articulos definidos como drafts revisables.

## Build

```text
npm run build:unfulano
```

## Verificacion manual posterior al deploy

```text
curl -I https://unfulanodev.com.ar/
curl -I https://unfulanodev.com.ar/sitemap.xml
curl -I https://unfulanodev.com.ar/robots.txt
curl -I https://unfulanodev.com.ar/desarrollo-web
curl -I https://unfulanodev.com.ar/portfolio
```

Esperado: `200` en recursos y paginas publicas, `404` en una URL inventada y redireccion de variantes `.html` a la URL limpia.

## Fuera de esta sesion

No se ejecutaron `npm run build` ni la suite completa de FlexCRM para no tocar el frontend/API que se esta trabajando en otra sesion.
