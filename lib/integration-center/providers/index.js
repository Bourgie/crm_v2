// ═══════════════════════════════════════════
// Integration Center — Provider Registry
// Registro central de todos los providers
// ═══════════════════════════════════════════

const { ProviderNotFoundError } = require('../errors');

const _registry = new Map();

function registerProvider(ProviderClass) {
  const instance = new ProviderClass();
  if (!instance.name) throw new Error('Provider debe tener un name definido');
  _registry.set(instance.name, ProviderClass);
}

function getProvider(name) {
  const Cls = _registry.get(name);
  if (!Cls) throw new ProviderNotFoundError(name);
  return new Cls();
}

function getAllProvidersMeta() {
  return Array.from(_registry.entries()).map(([name, Cls]) => {
    const instance = new Cls();
    return {
      name: instance.name,
      displayName: instance.displayName,
      icon: instance.icon,
      category: instance.category,
      requiredEnvKeys: instance.requiredEnvKeys,
    };
  });
}

function hasProvider(name) {
  return _registry.has(name);
}

// ── Registrar providers integrados ──
const { ArcaProvider } = require('./ArcaProvider');
const { MercadoLibreProvider } = require('./MercadoLibreProvider');
const { TiendanubeProvider } = require('./TiendanubeProvider');

registerProvider(ArcaProvider);
registerProvider(MercadoLibreProvider);
registerProvider(TiendanubeProvider);

module.exports = { registerProvider, getProvider, getAllProvidersMeta, hasProvider };
