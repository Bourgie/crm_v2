// ═══════════════════════════════════════
// FlexCRM App Registry (Frontend)
// Mapea slugs de apps → dynamic imports
// Se regenera al agregar/quitar apps en /apps/
// ═══════════════════════════════════════

const APP_REGISTRY = {
  '_hello-world': () => import('../../apps/_hello-world/frontend.jsx'),
}

export function getAppComponent(slug) {
  return APP_REGISTRY[slug] || null
}

export function getRegisteredAppSlugs() {
  return Object.keys(APP_REGISTRY)
}

export default APP_REGISTRY
