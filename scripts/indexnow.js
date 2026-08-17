// Notifica a Bing/Yandex (protocolo IndexNow) para re-indexar al instante.
// Se ejecuta al arrancar el server (ver server.js) y manualmente: npm run indexnow
// Config: INDEXNOW_KEY (opcional), SEO_SITE_URL (default https://flexcrm.com.ar),
//         SKIP_INDEXNOW=1 para desactivar.
const KEY = process.env.INDEXNOW_KEY || 'flexcrm-indexnow-key';
const SITE = (process.env.SEO_SITE_URL || 'https://flexcrm.com.ar').replace(/\/+$/, '');
const HOST = SITE.replace(/^https?:\/\//, '');
const ENDPOINTS = ['https://api.indexnow.org/indexnow', 'https://www.bing.com/indexnow'];

async function ping() {
  if (process.env.SKIP_INDEXNOW === '1' || process.env.NODE_ENV === 'test') return;
  const payload = JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList: [`${SITE}/`],
  });
  for (const ep of ENDPOINTS) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: payload,
      });
      console.log('[IndexNow]', ep, r.status);
    } catch (e) {
      console.log('[IndexNow] falló', ep, '-', e.message);
    }
  }
}

module.exports = { ping, KEY };

if (require.main === module) {
  ping().catch(() => process.exit(0));
}
