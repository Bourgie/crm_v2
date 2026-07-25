// ═══════════════════════════════════════
// FlexCRM App SDK (Backend)
// Objeto `crm` que recibe cada backend.js de app
// ═══════════════════════════════════════

const EventEmitter = require('events');
const express = require('express');
const { authMiddleware, requireRol } = require('../middleware/auth');
const { requireModule } = require('../middleware/tenant');

/**
 * Crea el objeto SDK para una app dentro del contexto de un tenant.
 * @param {object} opts
 * @param {object} opts.db - SQLite DatabaseSync del tenant (ya scoped)
 * @param {string} opts.empresaId - ID de la empresa en master.db
 * @param {string} opts.empresaCodigo - Código de la empresa
 * @param {object} opts.user - req.user (JWT payload o full user, según contexto)
 * @param {string} opts.appSlug - slug de la app
 * @param {object} opts.appManifest - app.json parseado
 * @param {object} [opts.globalBus] - EventEmitter compartido entre todas las apps
 */
function createAppSDK(opts) {
  const { db, empresaId, empresaCodigo, user, appSlug, appManifest, globalBus } = opts;

  const router = express.Router();

  // Aplicar middleware de auth + roles + módulos automáticamente
  router.use(authMiddleware);

  if (appManifest.roles_permitidos && appManifest.roles_permitidos.length > 0) {
    router.use(requireRol(...appManifest.roles_permitidos));
  }

  // Gating de módulos requeridos
  if (appManifest.modulos_requeridos && appManifest.modulos_requeridos.length > 0) {
    appManifest.modulos_requeridos.forEach(mod => {
      router.use(requireModule(mod));
    });
  }

  // Event bus compartido (global) o local si no hay global
  const events = globalBus || new EventEmitter();
  events.setMaxListeners(50);

  // Config scoped a esta app en el tenant
  const config = {
    _prefix: 'app:' + appSlug + ':',
    get(key) {
      try {
        const val = db.getConfig(this._prefix + key);
        return val !== undefined ? val : null;
      } catch (e) { return null; }
    },
    set(key, value) {
      db.setConfig({ [this._prefix + key]: value });
    },
    getAll() {
      try {
        const all = db.getConfig();
        const prefix = this._prefix;
        const result = {};
        Object.keys(all).forEach(k => {
          if (k.startsWith(prefix)) {
            result[k.slice(prefix.length)] = all[k];
          }
        });
        return result;
      } catch (e) { return {}; }
    }
  };

  // Logger que escribe al audit_log del tenant
  const log = {
    _write(level, msg) {
      try {
        db.audit(user, null, 'app:' + appSlug, level, typeof msg === 'string' ? msg : JSON.stringify(msg));
      } catch (e) { /* silent */ }
    },
    info(msg) { this._write('info', msg); },
    warn(msg) { this._write('warn', msg); },
    error(msg) { this._write('error', msg); },
  };

  // Acceso a la DB del tenant
  const appDB = {
    /** Ejecutar SQL raw (solo para tablas de la app) */
    exec(sql) { db._sqlite.exec(sql); },
    /** Prepared statement */
    prepare(sql) { return db._sqlite.prepare(sql); },
    /** SELECT all */
    all(sql, ...params) { return db._sqlite.prepare(sql).all(...params); },
    /** SELECT one */
    get(sql, ...params) { return db._sqlite.prepare(sql).get(...params); },
    /** INSERT/UPDATE/DELETE */
    run(sql, ...params) { return db._sqlite.prepare(sql).run(...params); },
    /** Helper: find all rows from a table */
    findAll(table, where, params) {
      let sql = `SELECT * FROM ${table}`;
      if (where) { sql += ` WHERE ${where}`; }
      return db._sqlite.prepare(sql).all(...(params || []));
    },
    /** Helper: find one row */
    findOne(table, where, params) {
      let sql = `SELECT * FROM ${table} WHERE ${where} LIMIT 1`;
      return db._sqlite.prepare(sql).get(...(params || []));
    },
    /** Helper: insert */
    insert(table, data) {
      const keys = Object.keys(data);
      const vals = Object.values(data);
      const placeholders = keys.map(() => '?').join(',');
      db._sqlite.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`).run(...vals);
    },
    /** Helper: update */
    update(table, data, where, whereParams) {
      const sets = Object.keys(data).map(k => `${k}=?`).join(',');
      const vals = [...Object.values(data), ...(whereParams || [])];
      db._sqlite.prepare(`UPDATE ${table} SET ${sets} WHERE ${where}`).run(...vals);
    },
    /** Helper: delete */
    delete(table, where, params) {
      db._sqlite.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...(params || []));
    },
    /** UUID generator */
    uid() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    },
    /** Generar ID corto (timestamp-based) */
    shortId(prefix) {
      return (prefix || 'id_') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
  };

  // Middlewares pre-armados para usar en el router de la app
  const mid = {
    auth: authMiddleware,
    requireRol: requireRol,
    requireModule: requireModule,
  };

  return {
    db: appDB,
    router,
    empresaId,
    empresaCodigo,
    user,
    appSlug,
    config,
    events,
    log,
    mid,
    manifest: appManifest,
    _rawDb: db,  // acceso directo a la DB del tenant (para casos avanzados)
  };
}

module.exports = { createAppSDK };
