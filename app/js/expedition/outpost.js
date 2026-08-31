const OUTPOST_CONSTRUCTION_COST = Object.freeze({
  maintenanceKg: 90,
  feedstockKg: 120,
  powerMWh: 4,
  foodKg: 30,
  waterKg: 20
});

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function surfaceAddressKey(contactId) {
  const systemId = String(contactId || '').trim().toLowerCase();
  const bodyId = `${systemId}-i`;
  const regionId = `${bodyId}-survey-site`;
  return ['we3d-world', 'v1', systemId, bodyId, `${bodyId}-fixed`, regionId, 'expedition'].join(':');
}

function buildOutpostBlueprint() {
  const blocks = [];
  const add = (gx, gy, gz, shape, materialIndex, rotation = 0, moduleId = 'habitat') => {
    blocks.push(Object.freeze({ gx, gy, gz, shape, materialIndex, rotation, moduleId }));
  };
  for (let x = -5; x <= 5; x += 1) for (let z = -3; z <= 3; z += 1) {
    if (Math.abs(x) <= 1 && z === 3) continue;
    add(x, 0, z, 'floor', 7, 0, 'foundation');
    if ((Math.abs(x) === 5 || Math.abs(z) === 3) && !(z === 3 && Math.abs(x) <= 1)) {
      const shape = z === -3 && x === 0 ? 'door' : (x + z) % 3 === 0 ? 'window' : 'wall';
      add(x, 1, z, shape, shape === 'window' ? 2 : 6, Math.abs(x) === 5 ? 1 : 0, 'habitat');
      add(x, 2, z, shape === 'door' ? 'wall' : shape, shape === 'window' ? 2 : 6, Math.abs(x) === 5 ? 1 : 0, 'habitat');
    }
    add(x, 3, z, 'roof', 7, 0, 'habitat');
  }
  for (let x = 8; x <= 11; x += 1) for (let z = -2; z <= 1; z += 1) {
    add(x, 0, z, 'floor', 7, 0, 'power');
    if ((x + z) % 2 === 0) add(x, 0.5, z, 'slab', 1, 0, 'power');
  }
  for (let x = -10; x <= -7; x += 1) for (let z = -2; z <= 1; z += 1) {
    add(x, 0, z, 'floor', 7, 0, 'storage');
    if (x === -10 || x === -7 || z === -2 || z === 1) add(x, 1, z, 'wall', 4, Math.abs(x) >= 7 ? 1 : 0, 'storage');
  }
  for (let x = -2; x <= 2; x += 1) for (let z = 6; z <= 10; z += 1) add(x, 0, z, 'floor', 6, 0, 'landing-pad');
  add(0, 0.5, 8, 'sign', 1, 0, 'landing-pad');
  return Object.freeze(blocks);
}

const OUTPOST_BLUEPRINT = buildOutpostBlueprint();

function createOutpostSite(expedition, contactId, nowMs = Date.now()) {
  const contact = (expedition?.routeContacts || []).find((entry) => entry.id === contactId);
  if (!contact || !['returned', 'surveyed'].includes(contact.localOperationState) && contact.status !== 'surveyed') {
    return Object.freeze({ expedition, changed: false, message: 'Complete and return from the local survey before establishing an outpost.' });
  }
  if ((expedition.outposts || []).some((entry) => entry.contactId === contactId)) {
    return Object.freeze({ expedition, changed: false, message: 'This survey site already has an outpost record.' });
  }
  const outpost = Object.freeze({
    type: 'ExpeditionOutpost',
    schemaVersion: 1,
    id: `${expedition.id}:outpost:${contactId}`,
    contactId,
    bodyId: `${contactId}-i`,
    worldAddressKey: surfaceAddressKey(contactId),
    name: `${contact.designation} Field Station`,
    state: 'planned',
    revision: 1,
    ownerAuthority: 'interstellar-expedition',
    structureAuthority: 'block-builder-shape-catalog',
    blueprint: OUTPOST_BLUEPRINT,
    installedMaterialKg: 0,
    power: Object.freeze({ storedMWh: 0, capacityMWh: 12, generationMW: 0.18, condition: 1 }),
    lifeSupport: Object.freeze({ condition: 1, crewCapacity: 4, occupied: 0 }),
    stores: Object.freeze({ foodKg: 0, waterKg: 0, maintenanceKg: 0 }),
    assignedCrewIds: Object.freeze([]),
    condition: 1,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    log: Object.freeze([{ atMissionS: Number(expedition.strategicElapsedS || 0), message: 'The returned survey site was reserved for a field station.' }])
  });
  return Object.freeze({
    expedition: Object.freeze({ ...expedition, outposts: Object.freeze([...(expedition.outposts || []), outpost]) }),
    outpost,
    changed: true,
    message: `${outpost.name} site recorded at the existing survey-world address.`
  });
}

function constructionAvailability(expedition, outpost) {
  if (!outpost || outpost.state !== 'planned') return Object.freeze({ enabled: false, reason: 'The outpost is not awaiting construction.' });
  for (const [key, cost] of Object.entries(OUTPOST_CONSTRUCTION_COST)) {
    if (Number(expedition?.resources?.[key] || 0) < cost) return Object.freeze({ enabled: false, reason: `Requires ${cost} ${key.replaceAll(/([A-Z])/g, ' $1').toLowerCase()}.` });
  }
  const crew = (expedition.crew || []).filter((member) => member.status !== 'dead');
  if (crew.length < 2) return Object.freeze({ enabled: false, reason: 'Two active crew members are required.' });
  return Object.freeze({ enabled: true, reason: '' });
}

function constructOutpost(expedition, outpostId, nowMs = Date.now()) {
  const index = (expedition?.outposts || []).findIndex((entry) => entry.id === outpostId);
  const outpost = expedition?.outposts?.[index];
  const availability = constructionAvailability(expedition, outpost);
  if (!availability.enabled) return Object.freeze({ expedition, changed: false, message: availability.reason });
  const resources = clone(expedition.resources);
  for (const [key, cost] of Object.entries(OUTPOST_CONSTRUCTION_COST)) resources[key] -= cost;
  const assignedCrew = (expedition.crew || []).filter((member) => member.status !== 'dead').slice(0, 2).map((member) => member.id);
  const nextOutpost = Object.freeze({
    ...outpost,
    state: 'operational',
    revision: outpost.revision + 1,
    installedMaterialKg: OUTPOST_CONSTRUCTION_COST.maintenanceKg + OUTPOST_CONSTRUCTION_COST.feedstockKg,
    power: Object.freeze({ ...outpost.power, storedMWh: OUTPOST_CONSTRUCTION_COST.powerMWh }),
    lifeSupport: Object.freeze({ ...outpost.lifeSupport, occupied: assignedCrew.length }),
    stores: Object.freeze({ foodKg: OUTPOST_CONSTRUCTION_COST.foodKg, waterKg: OUTPOST_CONSTRUCTION_COST.waterKg, maintenanceKg: 0 }),
    assignedCrewIds: Object.freeze(assignedCrew),
    updatedAtMs: nowMs,
    log: Object.freeze([...(outpost.log || []), { atMissionS: Number(expedition.strategicElapsedS || 0), message: 'Habitat, power, life support, storage, workshop, airlock, and landing pad commissioned.' }])
  });
  const outposts = expedition.outposts.map((entry, outpostIndex) => outpostIndex === index ? nextOutpost : entry);
  return Object.freeze({
    expedition: Object.freeze({ ...expedition, resources: Object.freeze(resources), outposts: Object.freeze(outposts) }),
    outpost: nextOutpost,
    changed: true,
    message: `${nextOutpost.name} is operational. Two crew and all transferred stores remain on its ledger.`
  });
}

function serviceOutpost(expedition, outpostId, nowMs = Date.now()) {
  const index = (expedition?.outposts || []).findIndex((entry) => entry.id === outpostId);
  const outpost = expedition?.outposts?.[index];
  if (!outpost || outpost.state !== 'operational') return Object.freeze({ expedition, changed: false, message: 'No operational outpost is selected.' });
  if (Number(expedition.resources?.maintenanceKg || 0) < 8 || Number(expedition.resources?.powerMWh || 0) < 0.4) {
    return Object.freeze({ expedition, changed: false, message: 'Servicing requires 8 kg maintenance material and 0.4 MWh.' });
  }
  const resources = clone(expedition.resources);
  resources.maintenanceKg -= 8;
  resources.powerMWh -= 0.4;
  const nextOutpost = Object.freeze({
    ...outpost,
    revision: outpost.revision + 1,
    installedMaterialKg: Number(outpost.installedMaterialKg || 0) + 8,
    condition: Math.min(1, Number(outpost.condition || 0) + 0.12),
    power: Object.freeze({ ...outpost.power, condition: Math.min(1, Number(outpost.power?.condition || 0) + 0.08) }),
    lifeSupport: Object.freeze({ ...outpost.lifeSupport, condition: Math.min(1, Number(outpost.lifeSupport?.condition || 0) + 0.08) }),
    updatedAtMs: nowMs,
    log: Object.freeze([...(outpost.log || []), { atMissionS: Number(expedition.strategicElapsedS || 0), message: 'Crew serviced power, seals, and environmental controls.' }])
  });
  return Object.freeze({
    expedition: Object.freeze({
      ...expedition,
      resources: Object.freeze(resources),
      outposts: Object.freeze(expedition.outposts.map((entry, outpostIndex) => outpostIndex === index ? nextOutpost : entry))
    }),
    outpost: nextOutpost,
    changed: true,
    message: `${nextOutpost.name} servicing completed and 8 kg is recorded as installed material.`
  });
}

export {
  constructOutpost,
  constructionAvailability,
  createOutpostSite,
  OUTPOST_BLUEPRINT,
  OUTPOST_CONSTRUCTION_COST,
  serviceOutpost,
  surfaceAddressKey
};
