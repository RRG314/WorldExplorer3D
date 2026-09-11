function impactAtDistance(equipment = {}, distance = 0) {
  const range = Math.max(.1, Number(equipment.range) || .1);
  const safeDistance = Math.max(0, Number(distance) || 0);
  if (safeDistance > range) return Object.freeze({ accepted: false, reason: 'out_of_range', force: 0 });
  const blastRadius = Math.max(0, Number(equipment.blastRadius) || 0);
  const falloff = blastRadius > 0 ? Math.max(.18, 1 - safeDistance / Math.max(.1, blastRadius)) : 1;
  return Object.freeze({ accepted: true, reason: '', force: Math.max(0, Number(equipment.force) || 0) * falloff, blastRadius });
}

function applyConditionImpact(target = {}, force = 0) {
  const before = Math.max(0, Math.min(1, Number(target.condition ?? 1)));
  const resistance = Math.max(.1, Number(target.resistance) || 100);
  const after = Math.max(0, before - Math.max(0, Number(force) || 0) / resistance);
  return Object.freeze({ before, after, destroyed: after <= 0, delta: before - after });
}

function blastTargets(origin = {}, targets = [], equipment = {}) {
  const radius = Math.max(0, Number(equipment.blastRadius) || 0);
  if (radius <= 0) return Object.freeze([]);
  return Object.freeze(targets.map((target) => {
    const distance = Math.hypot(Number(target.x || 0) - Number(origin.x || 0), Number(target.z || 0) - Number(origin.z || 0));
    const impact = impactAtDistance({ ...equipment, range: radius }, distance);
    return impact.accepted ? Object.freeze({ target, distance, force: impact.force }) : null;
  }).filter(Boolean));
}

export { applyConditionImpact, blastTargets, impactAtDistance };
