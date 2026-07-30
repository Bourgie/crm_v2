// ═══════════════════════════════════════════
// Integration Center — MasterRepo
// Operaciones sobre master DB
// ═══════════════════════════════════════════

const {
  getOAuthProviders, getOAuthProvider,
  getEmpresaIntegraciones, getEmpresaIntegracionesHabilitadas,
  setEmpresaIntegracion, setEmpresaIntegracionesBatch,
  saAudit,
} = require('../../db_master');

class MasterRepo {
  /**
   * Obtiene todos los OAuth providers configurados globalmente.
   */
  getProviders() {
    return getOAuthProviders();
  }

  /**
   * Obtiene un provider por su nombre.
   */
  getProvider(name) {
    return getOAuthProvider(name);
  }

  /**
   * Obtiene todas las integraciones de una empresa (habilitadas y no).
   */
  getEmpresaIntegraciones(empresaId) {
    return getEmpresaIntegraciones(empresaId);
  }

  /**
   * Obtiene solo los providers habilitados para una empresa.
   * @returns {string[]} - array de nombres de provider
   */
  getHabilitados(empresaId) {
    return getEmpresaIntegracionesHabilitadas(empresaId);
  }

  /**
   * Habilita o deshabilita un provider para una empresa.
   */
  setHabilitado(empresaId, provider, habilitado, adminId) {
    setEmpresaIntegracion(empresaId, provider, habilitado);
    if (adminId) {
      saAudit(adminId, habilitado ? 'integracion_habilitar' : 'integracion_deshabilitar',
        empresaId, `${habilitado ? 'Habilitada' : 'Deshabilitada'} integración ${provider}`);
    }
  }

  /**
   * Batch update de integraciones habilitadas para una empresa.
   */
  setAllHabilitados(empresaId, providers, adminId) {
    setEmpresaIntegracionesBatch(empresaId, providers);
    if (adminId) {
      saAudit(adminId, 'integracion_batch',
        empresaId, `Integraciones actualizadas: ${JSON.stringify(providers.map(p => `${p.provider}=${p.habilitado ? 'ON' : 'OFF'}`))}`);
    }
  }
}

module.exports = { MasterRepo };
