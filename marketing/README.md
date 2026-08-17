# Marketing FlexCRM

Fuente de verdad del sitio público de marketing (`flexcrm.com.ar`).

## Estructura

- `data.js` — marca, planes, FAQ general, respuestas GEO.
- `data-content.js` — funcionalidades, soluciones, comparativas, blog y documentación.
- `../scripts/build-marketing.js` — generador estático (HTML, JSON-LD, sitemap, robots, llms).

## Comandos

```powershell
npm run build:marketing   # genera dist/marketing
npm run test:backend      # valida el artefacto y el comportamiento SEO por host
```

## Deploy

Cloudflare Pages:

- Build command: `npm run build:marketing`
- Output directory: `dist/marketing`

## Reglas editoriales

1. No inventar claims: cada página debe reflejar una capacidad real del producto.
2. Drafts no se publican: un post de blog solo se renderiza si `published: true`.
3. Precios y módulos se validan contra `db_master.js` y el plan comercial aprobado.
4. No editar `dist/marketing` a mano; editar los archivos de datos y regenerar.
