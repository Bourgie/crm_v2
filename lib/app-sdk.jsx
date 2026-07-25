// ═══════════════════════════════════════
// FlexCRM App SDK (Frontend Bridge)
// Objeto `crm` que recibe cada frontend.jsx de app
// ═══════════════════════════════════════

import { useAuth, useApp, useToast } from '../store/index';
import * as UI from './ui-kit';

const API_BASE = '/api/apps';

/**
 * Cliente HTTP con manejo automático de token y CSRF.
 */
function createApiClient(appSlug) {
  async function request(method, url, body) {
    const token = useAuth.getState().token;
    const csrfToken = document.cookie.replace(/(?:(?:^|.*;\s*)csrf-token\s*=\s*([^;]*).*$)|^.*$/, '$1');

    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      credentials: 'include',
    };

    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }

    const fullUrl = url.startsWith('http') ? url : `${API_BASE}/${appSlug}${url}`;
    const res = await fetch(fullUrl, opts);
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const err = new Error(data?.error || `Error ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    put: (url, body) => request('PUT', url, body),
    del: (url) => request('DELETE', url),
  };
}

/**
 * Acceso scoped a config de la app (via API).
 */
function createConfigClient(appSlug) {
  return {
    async get(key) {
      const api = createApiClient(appSlug);
      const data = await api.get('/config' + (key ? `?key=${encodeURIComponent(key)}` : ''));
      return key ? data?.value : data;
    },
    async set(key, value) {
      const api = createApiClient(appSlug);
      return api.put('/config', { key, value });
    },
    async getAll() {
      const api = createApiClient(appSlug);
      return api.get('/config');
    },
  };
}

/**
 * Crea el objeto crm para el frontend de una app.
 * @param {string} appSlug
 * @param {object} [opts]
 */
export function createFrontendSDK(appSlug, opts = {}) {
  const api = createApiClient(appSlug);
  const config = createConfigClient(appSlug);

  return {
    appSlug,
    api,
    config,
    store: {
      useAuth,
      useApp,
      useToast,
    },
    ui: UI,
    navigate: (to) => {
      // Accede al router de React via el objeto window (seteado en AppShell)
      if (opts.navigate) {
        opts.navigate(to);
      } else {
        window.location.href = to;
      }
    },
    events: {
      // Event bus local via custom events del DOM
      on(event, handler) {
        window.addEventListener(`flexcrm:app:${appSlug}:${event}`, handler);
      },
      off(event, handler) {
        window.removeEventListener(`flexcrm:app:${appSlug}:${event}`, handler);
      },
      emit(event, detail) {
        window.dispatchEvent(new CustomEvent(`flexcrm:app:${appSlug}:${event}`, { detail }));
      },
    },
  };
}

export default createFrontendSDK;
