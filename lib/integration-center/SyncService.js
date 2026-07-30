// ═══════════════════════════════════════════
// Integration Center — SyncService
// Motor de sincronización simple (sin queue externa)
// ═══════════════════════════════════════════

const RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30000;

class SyncService {
  constructor() {
    this._activeJobs = new Map(); // jobId → { status, startedAt, provider }
  }

  /**
   * Sincroniza inmediatamente (bloquea respuesta HTTP).
   */
  async syncNow(tenantRepo, providerInstance, tokens, entityType, options = {}) {
    const start = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this._withTimeout(
          providerInstance.sync(entityType, tokens, options),
          TIMEOUT_MS
        );
        const responseTime = Date.now() - start;

        tenantRepo.updateLastSync(providerInstance.name, 'success');
        tenantRepo.log({
          provider: providerInstance.name,
          tipo: 'sync',
          status: 'success',
          mensaje: `Sync ${entityType} completado: ${JSON.stringify(result)}`,
          respuesta_ms: responseTime,
        });

        return { ok: true, result, responseTimeMs: responseTime, attempts: attempt + 1 };
      } catch (e) {
        lastError = e;
        if (attempt < MAX_RETRIES) {
          await this._sleep(RETRY_DELAYS[attempt]);
        }
      }
    }

    const responseTime = Date.now() - start;
    tenantRepo.updateLastSync(providerInstance.name, 'error', lastError.message);
    tenantRepo.log({
      provider: providerInstance.name,
      tipo: 'sync',
      status: 'error',
      mensaje: `Sync ${entityType} falló después de ${MAX_RETRIES + 1} intentos: ${lastError.message}`,
      respuesta_ms: responseTime,
    });

    throw lastError;
  }

  /**
   * Sincroniza en segundo plano — no bloquea la respuesta HTTP.
   * Retorna un jobId para consultar estado.
   */
  syncAsync(tenantRepo, providerInstance, tokens, entityType, options = {}) {
    const jobId = `sync_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;

    this._activeJobs.set(jobId, {
      status: 'running',
      startedAt: new Date().toISOString(),
      provider: providerInstance.name,
      entityType,
    });

    // Non-blocking execution
    setImmediate(async () => {
      try {
        await this.syncNow(tenantRepo, providerInstance, tokens, entityType, options);
        this._activeJobs.set(jobId, { ...this._activeJobs.get(jobId), status: 'completed' });
      } catch (e) {
        this._activeJobs.set(jobId, { ...this._activeJobs.get(jobId), status: 'failed', error: e.message });
      }
    });

    return { queued: true, jobId, message: 'Sincronización iniciada en segundo plano' };
  }

  /**
   * Consulta el estado de un job.
   */
  getJobStatus(jobId) {
    return this._activeJobs.get(jobId) || null;
  }

  /**
   * Limpia jobs completados más antiguos que N minutos.
   */
  cleanupJobs(olderThanMinutes = 30) {
    const cutoff = Date.now() - olderThanMinutes * 60 * 1000;
    for (const [id, job] of this._activeJobs) {
      if (job.status !== 'running' && new Date(job.startedAt).getTime() < cutoff) {
        this._activeJobs.delete(id);
      }
    }
  }

  // ── Private ──

  _withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout después de ${ms}ms`)), ms)
      ),
    ]);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { SyncService };
