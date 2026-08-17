# SEO-MONITORING.md — Monitoreo SEO/GEO/Conversiones

## Fuentes de datos

| Fuente | Qué mide | Estado |
|---|---|---|
| Google Search Console | impresiones, clics, CTR, posición, cobertura, CWV | ver `SEARCH-CONSOLE.md` |
| Bing Webmaster Tools | impresiones, clics, indexación, site scan, IndexNow | ver `BING-WEBMASTER.md` |
| Superadmin → Landing | visitas, leads, orígenes (UTM/referrer) | implementado (`/api/landing/*`, panel superadmin) |
| Signup del producto | registros, verificaciones, trial creado | datos en `master.db` (empresas + plan_trial) |
| Cloudflare/Fly | uptime, errores, latencia | dashboards del proveedor |

## KPIs y cadencia

| KPI | Fórmula | Cadencia |
|---|---|---|
| Marca | impresiones/clics de queries con "flexcrm" | semanal |
| Keywords no brand | impresiones/clics excluyendo marca | semanal |
| CTR orgánico | clics / impresiones | semanal |
| Posición media | Search Console (marca vs no marca) | semanal |
| Tráfico orgánico | sesiones desde buscadores | mensual |
| Leads | `landing_leads` nuevos por fuente | semanal |
| Demos/registros | signups con `plan_trial` | semanal |
| Activaciones | usuarios con email verificado que entran al panel | mensual |
| Clientes | empresas con plan pago activo | mensual |
| Backlinks/menciones | dominios referentes + menciones detectadas | trimestral |

## Umbrales de alerta

- Caída >30% de impresiones no brand semana contra semana: revisar cobertura/robots.
- Aumento de páginas "Excluidas" sin motivo: revisar canonical/noindex.
- CWV en rojo en Search Console: revisar `performance` del artefacto.
- Leads con fuente desconocida >50%: revisar UTM y formulario.

## Reporte trimestral

Consolidar en `SEO-FINAL-REPORT.md` (o documento equivalente por trimestre): estado inicial, cambios, URLs nuevas, resultados, riesgos y plan de los próximos 90 días.

## Privacidad

El pixel first-party actual guarda IP y user-agent y dispara antes del consentimiento; la política de cookies no lo describe bien. Antes de ampliar medición (GA4/Ads/Meta), alinear consentimiento, política y retención. Los KPIs de negocio (leads, registros, clientes) deben trabajarse con datos agregados, sin exponer PII.
