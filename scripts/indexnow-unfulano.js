const { SITE_URL, routes } = require('../seo/unfulanodev/routes');

const ENDPOINTS = ['https://api.indexnow.org/indexnow', 'https://www.bing.com/indexnow'];

function indexableUrls() {
  return routes
    .filter((route) => route.status === 'published' && route.indexable !== false)
    .map((route) => route.path === '/' ? SITE_URL : `${SITE_URL}${route.path}`);
}

function buildPayload(key) {
  if (!key) throw new Error('UNFULANO_INDEXNOW_KEY is required to build an IndexNow payload');
  const siteKey = String(key).trim();
  return {
    host: new URL(SITE_URL).host,
    key: siteKey,
    keyLocation: `${SITE_URL}/${siteKey}.txt`,
    urlList: indexableUrls(),
  };
}

async function ping({ key = process.env.UNFULANO_INDEXNOW_KEY, fetchImpl = globalThis.fetch, endpoints = ENDPOINTS } = {}) {
  if (process.env.SKIP_UNFULANO_INDEXNOW === '1' || process.env.NODE_ENV === 'test' || !key) {
    return { skipped: true, reason: !key ? 'missing-key' : 'disabled' };
  }
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');

  const payload = buildPayload(key);
  const body = JSON.stringify(payload);
  const results = [];
  for (const endpoint of endpoints) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
    });
    results.push({ endpoint, status: response.status });
  }
  return { skipped: false, results, urlCount: payload.urlList.length };
}

if (require.main === module) {
  ping()
    .then((result) => console.log(`[IndexNow Un Fulano] ${result.skipped ? `skipped: ${result.reason}` : `submitted ${result.urlCount} URLs`}`))
    .catch((error) => {
      console.error('[IndexNow Un Fulano] failed:', error.message);
      process.exitCode = 1;
    });
}

module.exports = { buildPayload, indexableUrls, ping };
