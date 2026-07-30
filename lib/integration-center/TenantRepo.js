// ═══════════════════════════════════════════
// Integration Center — TenantRepo
// Operaciones sobre la DB por empresa
// ═══════════════════════════════════════════

const { getEmpresaDB } = require('../../db_sqlite');
const { encryptValue, decryptValue, isEncrypted } = require('../crypto-utils');

const SENSITIVE_FIELDS = ['access_token', 'refresh_token'];

class TenantRepo {
  constructor(empresaCodigo) {
    this.empresaCodigo = empresaCodigo;
    this.db = getEmpresaDB(empresaCodigo);
  }

  // ── company_integrations ──

  /**
   * Obtiene todas las integraciones de esta empresa.
   * Desencripta tokens automáticamente.
   * @returns {Array}
   */
  getAll() {
    const rows = this.db.raw.prepare(
      "SELECT * FROM company_integrations ORDER BY provider"
    ).all();
    return rows.map(r => this._decryptTokens(r));
  }

  /**
   * Obtiene una integración por provider.
   * @returns {object|null}
   */
  getByProvider(provider) {
    const row = this.db.raw.prepare(
      "SELECT * FROM company_integrations WHERE provider = ?"
    ).get(provider);
    return row ? this._decryptTokens(row) : null;
  }

  /**
   * Crea o actualiza una integración.
   * Cifra tokens automáticamente.
   */
  upsert(provider, data) {
    const now = new Date().toISOString();
    const existing = this.getByProvider(provider);

    if (existing) {
      const sets = [];
      const params = [];

      for (const [k, v] of Object.entries(data)) {
        if (k === 'provider' || k === 'id') continue;
        if (v === undefined) continue;
        sets.push(`${k} = ?`);
        let val = v;
        if (SENSITIVE_FIELDS.includes(k) && val && !isEncrypted(String(val))) {
          val = encryptValue(String(val));
        }
        params.push(val);
      }

      sets.push('updated_at = ?');
      params.push(now);
      params.push(existing.id);

      this.db.raw.prepare(`UPDATE company_integrations SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      return this.getByProvider(provider);
    } else {
      const id = 'ci_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
      const row = {
        id,
        provider,
        status: 'disconnected',
        created_at: now,
        updated_at: now,
        ...data,
      };

      // Cifrar tokens
      for (const k of SENSITIVE_FIELDS) {
        if (row[k] && !isEncrypted(String(row[k]))) {
          row[k] = encryptValue(String(row[k]));
        }
      }

      const keys = Object.keys(row);
      const vals = Object.values(row);
      const placeholders = keys.map(() => '?').join(',');
      this.db.raw.prepare(`INSERT INTO company_integrations (${keys.join(',')}) VALUES (${placeholders})`).run(...vals);
      return this.getByProvider(provider);
    }
  }

  /**
   * Elimina una integración.
   */
  delete(provider) {
    this.db.raw.prepare("DELETE FROM company_integrations WHERE provider = ?").run(provider);
  }

  /**
   * Actualiza el estado de conexión.
   */
  updateStatus(provider, status, error = null) {
    const now = new Date().toISOString();
    this.db.raw.prepare(
      "UPDATE company_integrations SET status = ?, last_error = ?, updated_at = ? WHERE provider = ?"
    ).run(status, error || null, now, provider);
  }

  /**
   * Actualiza tokens (después de refresh).
   */
  updateTokens(provider, accessToken, refreshToken, expiresAt) {
    const now = new Date().toISOString();
    const encAccess = accessToken && !isEncrypted(String(accessToken)) ? encryptValue(String(accessToken)) : accessToken;
    const encRefresh = refreshToken && !isEncrypted(String(refreshToken)) ? encryptValue(String(refreshToken)) : refreshToken;

    this.db.raw.prepare(
      "UPDATE company_integrations SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = ? WHERE provider = ?"
    ).run(encAccess, encRefresh, expiresAt || null, now, provider);
  }

  /**
   * Actualiza metadata post-sync.
   */
  updateLastSync(provider, status, error = null) {
    const now = new Date().toISOString();
    this.db.raw.prepare(
      "UPDATE company_integrations SET last_sync = ?, last_error = ?, updated_at = ? WHERE provider = ?"
    ).run(now, error || null, now, provider);
  }

  /**
   * Actualiza health check.
   */
  updateHealth(provider, healthStatus, error = null) {
    const now = new Date().toISOString();
    this.db.raw.prepare(
      "UPDATE company_integrations SET last_health_check = ?, health_status = ?, last_error = ?, updated_at = ? WHERE provider = ?"
    ).run(now, healthStatus, error || null, now, provider);
  }

  // ── integration_logs ──

  /**
   * Registra un evento de integración.
   */
  log(entry) {
    try {
      const id = 'il_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
      this.db.raw.prepare(
        `INSERT INTO integration_logs (id, provider, tipo, status, mensaje, usuario_id, usuario_nombre, ip, respuesta_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        entry.provider || 'unknown',
        entry.tipo || 'info',
        entry.status || 'success',
        entry.mensaje || null,
        entry.usuario_id || null,
        entry.usuario_nombre || null,
        entry.ip || null,
        entry.respuesta_ms || null,
        entry.created_at || new Date().toISOString()
      );
      return id;
    } catch (e) {
      console.error('[TenantRepo] Error logging:', e.message);
      return null;
    }
  }

  /**
   * Obtiene logs de integraciones con filtros opcionales.
   */
  getLogs(filters = {}) {
    let sql = "SELECT * FROM integration_logs WHERE 1=1";
    const params = [];

    if (filters.provider) {
      sql += " AND provider = ?";
      params.push(filters.provider);
    }
    if (filters.tipo) {
      sql += " AND tipo = ?";
      params.push(filters.tipo);
    }
    if (filters.status) {
      sql += " AND status = ?";
      params.push(filters.status);
    }
    if (filters.desde) {
      sql += " AND created_at >= ?";
      params.push(filters.desde);
    }
    if (filters.hasta) {
      sql += " AND created_at <= ?";
      params.push(filters.hasta);
    }

    const limit = filters.limit || 200;
    const offset = filters.offset || 0;
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    return this.db.raw.prepare(sql).all(...params);
  }

  /**
   * Purga logs antiguos.
   */
  purgeLogs(days = 90) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.raw.prepare("DELETE FROM integration_logs WHERE created_at < ?").run(cutoff);
    return result.changes || 0;
  }

  // ── Config helpers ──

  getConfig(key) {
    return this.db.getConfig(key);
  }

  setConfig(key, value) {
    this.db.setConfig({ [key]: value });
  }

  // ── Private helpers ──

  _decryptTokens(row) {
    if (!row) return null;
    const r = { ...row };
    for (const k of SENSITIVE_FIELDS) {
      if (r[k] && isEncrypted(String(r[k]))) {
        try { r[k] = decryptValue(String(r[k])); } catch { /* keep as is */ }
      }
    }
    return r;
  }
}

module.exports = { TenantRepo };
