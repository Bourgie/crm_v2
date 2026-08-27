// ═══════════════════════════════════════════════════════════════
// check-api-parity.js — Guarda anti-drift frontend ↔ backend
//
// 1) Extrae todas las llamadas API del frontend (api(...), saApi(...),
//    fetch('/api/...'), fetch(API + '...')) y verifica que exista un
//    endpoint equivalente registrado en backend (montajes de server.js
//    + rutas de routes/*.js). Falla si alguna no existe → previene 404s.
// 2) Detecta el patrón roto "Authorization: Bearer + token de useAuth"
//    (useAuth ya no guarda token; la auth es por cookie httpOnly).
//
// Uso: node scripts/check-api-parity.js
// Exit code 1 = hay violaciones.
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend', 'src');
const ROUTES_DIR = path.join(ROOT, 'routes');

// Excepciones: rutas frontend que no son endpoints de backend reales
// (rutas del router de React, assets, etc.)
const EXEMPT_PATHS = [];

let violations = [];

// ── 1. Backend: extraer rutas registradas ─────────────────────
function extractBackendRoutes() {
  const routes = []; // { method, path }
  const addRoute = (method, p) => {
    if (!p.startsWith('/api')) return;
    routes.push({ method: method.toUpperCase(), path: p.replace(/\/+/g, '/') });
  };

  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

  // Mapeo variable → archivo de rutas: const X = require('...') / const { a: X } = require('...')
  const varToFile = {};
  const directRe = /(?:const|let|var)\s+([\w$]+)\s*=\s*require\(\s*(['"])([^'"]+)\2\s*\)/g;
  let m;
  while ((m = directRe.exec(serverSrc))) varToFile[m[1]] = m[3];
  const destrRe = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(\s*(['"])([^'"]+)\2\s*\)/g;
  while ((m = destrRe.exec(serverSrc))) {
    for (const part of m[1].split(',')) {
      const name = part.split(':').pop().trim();
      if (/^[\w$]+$/.test(name)) varToFile[name] = m[3];
    }
  }

  // Montajes: app.use('/api/xyz', ...) → asociar prefijo con archivo
  const mounts = [];
  const mountRe = /app\.use\(\s*(['"])([^'"]+)\1\s*,/g;
  while ((m = mountRe.exec(serverSrc))) {
    const prefix = m[2];
    const rest = serverSrc.slice(m.index + m[0].length);
    const lineRest = rest.slice(0, rest.indexOf('\n') === -1 ? rest.length : rest.indexOf('\n'));
    const reqFile = /require\(\s*(['"])([^'"]+)\1\s*\)/.exec(lineRest);
    if (reqFile) { mounts.push({ prefix, file: reqFile[2] }); continue; }
    const lastArg = /([\w$]+(\.[\w$]+)?)\s*\)\s*;?\s*$/.exec(lineRest.trim());
    if (lastArg && varToFile[lastArg[1].split('.')[0]]) {
      mounts.push({ prefix, file: varToFile[lastArg[1].split('.')[0]] });
    }
  }

  // Rutas inline en server.js (app.get('/api/...') etc.)
  const inlineRe = /app\.(get|post|put|delete|patch)\s*\(\s*(['"])([^'"]+)\2/g;
  while ((m = inlineRe.exec(serverSrc))) addRoute(m[1], m[3]);

  // Rutas de cada archivo montado
  for (const { prefix, file } of mounts) {
    let fp = file.startsWith('.') ? path.resolve(ROOT, file) : file;
    if (!fp.endsWith('.js')) fp += '.js';
    if (!fs.existsSync(fp)) continue;
    const src = fs.readFileSync(fp, 'utf8');
    const routeRe = /\b\w*[Rr]outer\.(get|post|put|delete|patch)\s*\(\s*(['"])([^'"]+)\2/g;
    while ((m = routeRe.exec(src))) addRoute(m[1], prefix + '/' + m[3].replace(/^\//, ''));
  }

  return routes;
}

// ── 2. Frontend: extraer llamadas API ─────────────────────────
function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'build', '.vite'].includes(entry.name)) continue;
      walkFiles(fp, out);
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      out.push(fp);
    }
  }
  return out;
}

function extractFrontendCalls() {
  const calls = []; // { method, path, file, line }
  const authViolations = [];

  for (const file of walkFiles(FRONTEND_DIR)) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const lineOf = (idx) => src.slice(0, idx).split('\n').length;

    // Base de API constante del archivo (Superadmin.jsx → API = '/api/superadmin')
    const apiConst = /const\s+API\s*=\s*(['"])([^'"]+)\1/.exec(src);

    // api('METHOD', '/path') — helper de useApi (base /api)
    const apiRe = /\bapi\(\s*(['"])(GET|POST|PUT|DELETE|PATCH)\1\s*,\s*(['"])([^'"]*)\3/g;
    while ((m = apiRe.exec(src))) {
      const p = (m[4] || '').split('?')[0];
      if (!p || p === '/') continue;
      calls.push({ method: m[2].toUpperCase(), path: '/api' + p, file: rel, line: lineOf(m.index) });
    }

    // saApi('METHOD', '/path') — base /api/superadmin
    const saRe = /\bsaApi\(\s*(['"])(GET|POST|PUT|DELETE|PATCH)\1\s*,\s*(['"])([^'"]*)\3/g;
    while ((m = saRe.exec(src))) {
      const p = (m[4] || '').split('?')[0];
      if (!p || p === '/') continue;
      calls.push({ method: m[2].toUpperCase(), path: '/api/superadmin' + p, file: rel, line: lineOf(m.index) });
    }

    // fetch('/api/...') literal
    const fetchLitRe = /\bfetch\(\s*(['"])([^'"]+)\1/g;
    while ((m = fetchLitRe.exec(src))) {
      const p = m[2];
      if (!p.startsWith('/api') || p === '/api') continue;
      const method = detectFetchMethod(src, m.index);
      calls.push({ method, path: p.split('?')[0], file: rel, line: lineOf(m.index) });
    }

    // fetch(API + '/...') — con constante API del archivo
    if (apiConst) {
      const fetchApiRe = /\bfetch\(\s*API\s*\+\s*(['"])([^'"]*)\1/g;
      while ((m = fetchApiRe.exec(src))) {
        if (!m[2]) continue;
        const method = detectFetchMethod(src, m.index);
        calls.push({ method, path: apiConst[2] + m[2], file: rel, line: lineOf(m.index) });
      }
    }

    // ── Guardas de auth ──
    // 1. Destructuring de `token` desde useAuth (el campo ya no existe)
    const useAuthTokenRe = /\bconst\s*\{[^}]*\btoken\b[^}]*\}\s*=\s*useAuth\(\)/g;
    while ((m = useAuthTokenRe.exec(src))) {
      authViolations.push(`useAuth() ya no guarda 'token' (auth por cookie httpOnly) — ${rel}:${lineOf(m.index)}`);
    }
    // 2. Authorization con token inexistente (excepto login-as con token de URL,
    //    que es un flujo legítimo de superadmin/verificación)
    const bearerRe = /Authorization\s*:\s*(['"]Bearer\s*\1)\s*\+\s*token\b|Authorization\s*:\s*`Bearer\s*\$\{\s*token\s*\}`/g;
    while ((m = bearerRe.exec(src))) {
      const ctx = src.slice(Math.max(0, m.index - 200), m.index);
      if (/searchParams\.get\(['"]token['"]\)|params\.get\(['"]token['"]\)/.test(ctx)) continue;
      authViolations.push(`Header Authorization con 'token' inexistente — ${rel}:${lineOf(m.index)}`);
    }
  }

  return { calls, authViolations };
}

function detectFetchMethod(src, fetchIdx) {
  const windowSrc = src.slice(fetchIdx, fetchIdx + 400);
  const mm = /method\s*:\s*(['"])([A-Z]+)\1/i.exec(windowSrc);
  return mm ? mm[2].toUpperCase() : 'GET';
}

// ── 3. Matching ───────────────────────────────────────────────
function segments(p) { return p.split('/').filter(s => s !== ''); }

function routeMatches(call, route) {
  if (route.method !== call.method) return false;
  const f = segments(call.path);
  const b = segments(route.path);
  if (f.length > b.length) return false;
  for (let i = 0; i < f.length; i++) {
    const bs = b[i];
    if (bs.startsWith(':') || bs === '*') continue;
    if (f[i] !== bs) return false;
  }
  return true;
}

// ── 4. Main ───────────────────────────────────────────────────
function main() {
  const backendRoutes = extractBackendRoutes();
  const { calls, authViolations } = extractFrontendCalls();

  for (const call of calls) {
    if (EXEMPT_PATHS.includes(call.method + ' ' + call.path)) continue;
    if (!backendRoutes.some(r => routeMatches(call, r))) {
      violations.push(`${call.method} ${call.path}  ← ${call.file}:${call.line}`);
    }
  }
  violations.push(...authViolations);

  console.log(`Backend: ${backendRoutes.length} rutas registradas`);
  console.log(`Frontend: ${calls.length} llamadas API analizadas`);
  console.log('');

  if (violations.length === 0) {
    console.log('✓ Todas las rutas del frontend tienen endpoint en backend (y sin patrones de auth rotos).');
    process.exit(0);
  }

  console.log('✗ Violaciones encontradas:');
  for (const v of violations) console.log('  ' + v);
  process.exit(1);
}

main();
