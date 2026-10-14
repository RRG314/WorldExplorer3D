// Pure habitat authoring helpers. The existing interior runtime owns all
// animation, model leases and disposal; viewing floors never create populations.
export function habitatPopulation(record) {
  const members = [];
  for (const species of record.species) {
    if (!Number.isInteger(species.population) || species.population < 1 ||
        species.population > 8 || members.length + species.population > 32) {
      throw Error('Aquarium population exceeds its authoring bounds.');
    }
    const route = species.route;
    if (!species.modelId || !species.scientificName || !species.sourceId || !route ||
        ![route.u, route.v, route.radiusU, route.radiusV, route.speed,
          route.depth, route.phase, route.radiusStep ?? 0, route.radiusVStep ?? 0,
          route.speedStep ?? 0, route.depthStep ?? 0].every(Number.isFinite) ||
        route.radiusU <= 0 || route.radiusV <= 0 || route.depth <= 0 || route.speed <= 0) {
      throw Error('Aquarium species requires evidence and a finite swimming route.');
    }
    for (let ordinal = 0; ordinal < species.population; ordinal++) {
      members.push({index: members.length, ordinal, species});
    }
  }
  return members;
}

export function habitatSwimPose(plan, member, time) {
  const {route} = member.species, n = member.ordinal;
  const t = time * (route.speed + n * (route.speedStep || 0)) + route.phase + n * 1.73;
  const ru = route.radiusU + n * (route.radiusStep || 0);
  const rv = route.radiusV + n * (route.radiusVStep || 0);
  const u = route.u + Math.cos(t) * ru, v = route.v + Math.sin(t) * rv;
  const p = plan.local(u, v);
  const next = plan.local(u - Math.sin(t) * ru, v + Math.cos(t) * rv);
  return {...p, y: plan.habitat.floor + (route.depth + n * (route.depthStep || 0)) / plan.metersPerUnit,
    yaw: Math.atan2(next.x - p.x, next.z - p.z)};
}

export function aquariumHabitatQuality(tier) {
  // Keep every educational species at all tiers. Only decorative residency and
  // optical resolution change; geometry, collision, exits and saves do not.
  return tier === 'low' ? {corals: 9, waterTargetSize: 256} :
    {corals: 18, waterTargetSize: tier === 'high' ? 768 : 512};
}

export function habitatCoralPlacement(record, index) {
  const {decoration: d} = record, side = index % 2 ? -1 : 1;
  return {modelId: d.models[index % d.models.length],
    u: d.u + side * (d.offset + (index % 3) * .6),
    v: d.v + Math.floor(index / 2) * d.spacing,
    scale: .75 + (index % 4) * .15, yaw: index * 2.39};
}
