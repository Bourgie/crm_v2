const DB_NAME = 'flexcrm-offline';
const DB_VERSION = 1;

let db = null;

function openDB() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('api-cache')) {
        d.createObjectStore('api-cache', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(new Error('IndexedDB no disponible'));
  });
}

// Save an API response to cache
export async function cacheResponse(key, data) {
  try {
    const d = await openDB();
    const tx = d.transaction('api-cache', 'readwrite');
    const store = tx.objectStore('api-cache');
    store.put({ key, data, ts: Date.now(), expires: Date.now() + 3600000 }); // 1h expiry
    return new Promise(resolve => { tx.oncomplete = resolve; tx.onerror = () => resolve(); });
  } catch { /* ignore */ }
}

// Get cached API response
export async function getCachedResponse(key) {
  try {
    const d = await openDB();
    return new Promise((resolve) => {
      const tx = d.transaction('api-cache', 'readonly');
      const store = tx.objectStore('api-cache');
      const req = store.get(key);
      req.onsuccess = () => {
        const r = req.result;
        if (r && r.expires > Date.now()) return resolve(r.data);
        resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

// Clear all cached data
export async function clearCache() {
  try {
    const d = await openDB();
    const tx = d.transaction('api-cache', 'readwrite');
    const store = tx.objectStore('api-cache');
    store.clear();
    return new Promise(resolve => { tx.oncomplete = resolve; });
  } catch { /* ignore */ }
}

// Smart fetch: tries network first, falls back to cache
export async function fetchWithCache(key, fetchFn) {
  const online = navigator.onLine;
  if (online) {
    try {
      const data = await fetchFn();
      await cacheResponse(key, data);
      return data;
    } catch (e) {
      const cached = await getCachedResponse(key);
      if (cached) return cached;
      throw e;
    }
  } else {
    const cached = await getCachedResponse(key);
    if (cached) return cached;
    throw new Error('Sin conexión y sin datos en caché');
  }
}

// Get cache timestamp for a key
export async function getCacheTimestamp(key) {
  const data = await getCachedResponse(key);
  return data ? new Date(Date.now()) : null;
}
