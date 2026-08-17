const SITE_URL = 'https://unfulanodev.com.ar';
const { PAGES } = require('./pages');

const routes = [
  {
    path: '/',
    source: 'seo/unfulanodev/templates/home.html',
    status: 'published',
    lastmod: '2026-08-17',
  },
  ...PAGES.map((page) => ({
    path: page.path,
    status: page.status,
    lastmod: page.lastmod,
    kind: page.kind,
  })),
];

module.exports = { SITE_URL, routes };
