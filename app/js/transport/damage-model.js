import { TRANSPORT_DURABILITY_POLICIES } from './catalog-contract.js?v=1';

const TRANSPORT_DAMAGE_BANDS = Object.freeze([
  Object.freeze({ id: 'disabled', maximum: .05, label: 'Disabled' }),
  Object.freeze({ id: 'critical', maximum: .25, label: 'Critical' }),
  Object.freeze({ id: 'damaged', maximum: .55, label: 'Damaged' }),
  Object.freeze({ id: 'worn', maximum: .82, label: 'Worn' }),
  Object.freeze({ id: 'healthy', maximum: 1, label: 'Healthy' })
]);

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function transportDamageBand(condition = 1) {
  const normalized = clamp01(condition);
  return TRANSPORT_DAMAGE_BANDS.find((band) => normalized <= band.maximum) || TRANSPORT_DAMAGE_BANDS.at(-1);
}

function transportDamagePresentation(condition = 1) {
  const normalized = clamp01(condition);
  const band = transportDamageBand(normalized);
  return Object.freeze({
    condition: normalized,
    band: band.id,
    label: band.label,
    dirt: clamp01((1 - normalized) * 1.2),
    panelDisplacement: band.id === 'healthy' ? 0 : band.id === 'worn' ? .015 : band.id === 'damaged' ? .055 : band.id === 'critical' ? .11 : .16,
    glassDamage: ['damaged', 'critical', 'disabled'].includes(band.id),
    lampFailure: ['critical', 'disabled'].includes(band.id),
    wheelDamage: ['critical', 'disabled'].includes(band.id),
    smoke: ['critical', 'disabled'].includes(band.id),
    operable: band.id !== 'disabled'
  });
}

function applyTransportDamage(target = {}, force = 0, options = {}) {
  const before = clamp01(target.condition ?? 1);
  const resistance = Math.max(.1, Number(options.resistance ?? target.resistance) || 160);
  const policy = String(options.durabilityPolicy || target.durabilityPolicy || TRANSPORT_DURABILITY_POLICIES.STANDARD);
  const normalizedForce = Math.max(0, Number(force) || 0);
  const cosmeticSeverity = clamp01(normalizedForce / Math.max(1, resistance));
  if (policy === TRANSPORT_DURABILITY_POLICIES.EXPLORATION_UNLIMITED) {
    target.condition = 1;
    target.cosmeticImpact = Math.max(Number(target.cosmeticImpact || 0), cosmeticSeverity);
    return Object.freeze({
      before,
      after: 1,
      delta: 0,
      destroyed: false,
      disabled: false,
      durabilityPolicy: policy,
      cosmeticSeverity,
      band: 'healthy'
    });
  }
  const resistanceScale = policy === TRANSPORT_DURABILITY_POLICIES.HEAVY_DUTY ? 1.45 : 1;
  const after = clamp01(before - normalizedForce / (resistance * resistanceScale));
  target.condition = after;
  const presentation = transportDamagePresentation(after);
  return Object.freeze({
    before,
    after,
    delta: before - after,
    destroyed: after <= 0,
    disabled: !presentation.operable,
    durabilityPolicy: policy,
    cosmeticSeverity,
    band: presentation.band
  });
}

export {
  TRANSPORT_DAMAGE_BANDS,
  applyTransportDamage,
  transportDamageBand,
  transportDamagePresentation
};
