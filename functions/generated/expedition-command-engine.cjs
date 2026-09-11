'use strict';
// Generated from the browser's Expedition rules. Run npm run build:shared-expedition-engine after changing those rules.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// app/js/expedition/command-authority.js
var command_authority_exports = {};
__export(command_authority_exports, {
  COMMAND_TYPES: () => COMMAND_TYPES,
  createAuthorizedExpeditionPlan: () => createAuthorizedExpeditionPlan,
  executeExpeditionCommand: () => executeExpeditionCommand,
  normalizeExpeditionCommand: () => normalizeExpeditionCommand
});
module.exports = __toCommonJS(command_authority_exports);

// app/js/expedition/outpost.js?v=1
var OUTPOST_CONSTRUCTION_COST = Object.freeze({
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
  const systemId = String(contactId || "").trim().toLowerCase();
  const bodyId = `${systemId}-i`;
  const regionId = `${bodyId}-survey-site`;
  return ["we3d-world", "v1", systemId, bodyId, `${bodyId}-fixed`, regionId, "expedition"].join(":");
}
function buildOutpostBlueprint() {
  const blocks = [];
  const add = (gx, gy, gz, shape, materialIndex, rotation = 0, moduleId = "habitat") => {
    blocks.push(Object.freeze({ gx, gy, gz, shape, materialIndex, rotation, moduleId }));
  };
  for (let x = -5; x <= 5; x += 1) for (let z = -3; z <= 3; z += 1) {
    if (Math.abs(x) <= 1 && z === 3) continue;
    add(x, 0, z, "floor", 7, 0, "foundation");
    if ((Math.abs(x) === 5 || Math.abs(z) === 3) && !(z === 3 && Math.abs(x) <= 1)) {
      const shape = z === -3 && x === 0 ? "door" : (x + z) % 3 === 0 ? "window" : "wall";
      add(x, 1, z, shape, shape === "window" ? 2 : 6, Math.abs(x) === 5 ? 1 : 0, "habitat");
      add(x, 2, z, shape === "door" ? "wall" : shape, shape === "window" ? 2 : 6, Math.abs(x) === 5 ? 1 : 0, "habitat");
    }
    add(x, 3, z, "roof", 7, 0, "habitat");
  }
  for (let x = 8; x <= 11; x += 1) for (let z = -2; z <= 1; z += 1) {
    add(x, 0, z, "floor", 7, 0, "power");
    if ((x + z) % 2 === 0) add(x, 0.5, z, "slab", 1, 0, "power");
  }
  for (let x = -10; x <= -7; x += 1) for (let z = -2; z <= 1; z += 1) {
    add(x, 0, z, "floor", 7, 0, "storage");
    if (x === -10 || x === -7 || z === -2 || z === 1) add(x, 1, z, "wall", 4, Math.abs(x) >= 7 ? 1 : 0, "storage");
  }
  for (let x = -2; x <= 2; x += 1) for (let z = 6; z <= 10; z += 1) add(x, 0, z, "floor", 6, 0, "landing-pad");
  add(0, 0.5, 8, "sign", 1, 0, "landing-pad");
  return Object.freeze(blocks);
}
var OUTPOST_BLUEPRINT = buildOutpostBlueprint();
function createOutpostSite(expedition, contactId, nowMs = Date.now()) {
  const contact = (expedition?.routeContacts || []).find((entry) => entry.id === contactId);
  if (!contact || !["returned", "surveyed"].includes(contact.localOperationState) && contact.status !== "surveyed") {
    return Object.freeze({ expedition, changed: false, message: "Complete and return from the local survey before establishing an outpost." });
  }
  if ((expedition.outposts || []).some((entry) => entry.contactId === contactId)) {
    return Object.freeze({ expedition, changed: false, message: "This survey site already has an outpost record." });
  }
  const outpost = Object.freeze({
    type: "ExpeditionOutpost",
    schemaVersion: 1,
    id: `${expedition.id}:outpost:${contactId}`,
    contactId,
    bodyId: `${contactId}-i`,
    worldAddressKey: surfaceAddressKey(contactId),
    name: `${contact.designation} Field Station`,
    state: "planned",
    operationsStatus: "planned",
    revision: 1,
    ownerAuthority: "interstellar-expedition",
    structureAuthority: "block-builder-shape-catalog",
    blueprint: OUTPOST_BLUEPRINT,
    installedMaterialKg: 0,
    power: Object.freeze({ storedMWh: 0, capacityMWh: 12, generationMW: 0.18, condition: 1 }),
    lifeSupport: Object.freeze({ condition: 1, crewCapacity: 4, occupied: 0 }),
    stores: Object.freeze({ foodKg: 0, waterKg: 0, maintenanceKg: 0 }),
    assignedCrewIds: Object.freeze([]),
    condition: 1,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    lastAdvancedMissionS: Number(expedition.strategicElapsedS || 0),
    log: Object.freeze([{ atMissionS: Number(expedition.strategicElapsedS || 0), message: "The returned survey site was reserved for a field station." }])
  });
  return Object.freeze({
    expedition: Object.freeze({ ...expedition, outposts: Object.freeze([...expedition.outposts || [], outpost]) }),
    outpost,
    changed: true,
    message: `${outpost.name} site recorded at the existing survey-world address.`
  });
}
function constructionAvailability(expedition, outpost) {
  if (!outpost || outpost.state !== "planned") return Object.freeze({ enabled: false, reason: "The outpost is not awaiting construction." });
  for (const [key, cost] of Object.entries(OUTPOST_CONSTRUCTION_COST)) {
    if (Number(expedition?.resources?.[key] || 0) < cost) return Object.freeze({ enabled: false, reason: `Requires ${cost} ${key.replaceAll(/([A-Z])/g, " $1").toLowerCase()}.` });
  }
  const crew = (expedition.crew || []).filter((member) => member.status !== "dead");
  if (crew.length < 2) return Object.freeze({ enabled: false, reason: "Two active crew members are required." });
  return Object.freeze({ enabled: true, reason: "" });
}
function constructOutpost(expedition, outpostId, nowMs = Date.now()) {
  const index = (expedition?.outposts || []).findIndex((entry) => entry.id === outpostId);
  const outpost = expedition?.outposts?.[index];
  const availability = constructionAvailability(expedition, outpost);
  if (!availability.enabled) return Object.freeze({ expedition, changed: false, message: availability.reason });
  const resources = clone(expedition.resources);
  for (const [key, cost] of Object.entries(OUTPOST_CONSTRUCTION_COST)) resources[key] -= cost;
  const assignedCrew = (expedition.crew || []).filter((member) => member.status !== "dead").slice(0, 2).map((member) => member.id);
  const nextOutpost = Object.freeze({
    ...outpost,
    state: "operational",
    operationsStatus: "operational",
    revision: outpost.revision + 1,
    installedMaterialKg: OUTPOST_CONSTRUCTION_COST.maintenanceKg + OUTPOST_CONSTRUCTION_COST.feedstockKg,
    power: Object.freeze({ ...outpost.power, storedMWh: OUTPOST_CONSTRUCTION_COST.powerMWh }),
    lifeSupport: Object.freeze({ ...outpost.lifeSupport, occupied: assignedCrew.length }),
    stores: Object.freeze({ foodKg: OUTPOST_CONSTRUCTION_COST.foodKg, waterKg: OUTPOST_CONSTRUCTION_COST.waterKg, maintenanceKg: 0 }),
    assignedCrewIds: Object.freeze(assignedCrew),
    updatedAtMs: nowMs,
    lastAdvancedMissionS: Number(expedition.strategicElapsedS || 0),
    log: Object.freeze([...outpost.log || [], { atMissionS: Number(expedition.strategicElapsedS || 0), message: "Habitat, power, life support, storage, workshop, airlock, and landing pad commissioned." }])
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
  if (!outpost || outpost.state !== "operational") return Object.freeze({ expedition, changed: false, message: "No operational outpost is selected." });
  if (Number(expedition.resources?.maintenanceKg || 0) < 8 || Number(expedition.resources?.powerMWh || 0) < 0.4) {
    return Object.freeze({ expedition, changed: false, message: "Servicing requires 8 kg maintenance material and 0.4 MWh." });
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
    operationsStatus: Number(outpost.stores?.foodKg || 0) > 0 && Number(outpost.stores?.waterKg || 0) > 0 ? "operational" : "emergency",
    updatedAtMs: nowMs,
    log: Object.freeze([...outpost.log || [], { atMissionS: Number(expedition.strategicElapsedS || 0), message: "Crew serviced power, seals, and environmental controls." }])
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
function advanceOutpostState(outpost, missionS) {
  if (outpost?.state !== "operational") return outpost;
  const fromS = Math.max(0, Number(outpost.lastAdvancedMissionS || 0));
  const toS = Math.max(fromS, Number(missionS || 0));
  const days = (toS - fromS) / 86400;
  if (days < 0.01) return outpost;
  const occupied = Math.max(0, Number(outpost.lifeSupport?.occupied || outpost.assignedCrewIds?.length || 0));
  const powerCondition = Math.max(0, Math.min(1, Number(outpost.power?.condition ?? 1)));
  const lifeSupportCondition = Math.max(0, Math.min(1, Number(outpost.lifeSupport?.condition ?? 1)));
  const generatedMWh = Number(outpost.power?.generationMW || 0) * 24 * days * powerCondition;
  const requiredMWh = occupied * 0.04 * days;
  const storedMWh = Math.max(0, Math.min(Number(outpost.power?.capacityMWh || 0), Number(outpost.power?.storedMWh || 0) + generatedMWh - requiredMWh));
  const foodKg = Math.max(0, Number(outpost.stores?.foodKg || 0) - occupied * 0.02 * days);
  const waterKg = Math.max(0, Number(outpost.stores?.waterKg || 0) - occupied * 6e-3 * days);
  const condition = Math.max(0.12, Number(outpost.condition || 0) - days * (3e-5 + occupied * 2e-6));
  const nextPowerCondition = Math.max(0.12, powerCondition - days * 18e-6);
  const nextLifeSupportCondition = Math.max(0.12, lifeSupportCondition - days * 24e-6);
  const operationsStatus = foodKg <= 0.01 || waterKg <= 0.01 || storedMWh <= 0.1 || condition < 0.3 || nextLifeSupportCondition < 0.3 ? "emergency" : condition < 0.55 || nextLifeSupportCondition < 0.55 ? "maintenance" : "operational";
  const statusChanged = operationsStatus !== outpost.operationsStatus;
  const log = statusChanged ? Object.freeze([...outpost.log || [], Object.freeze({
    atMissionS: toS,
    message: operationsStatus === "emergency" ? "The field station entered emergency conservation after its stores or systems fell below a safe operating margin." : operationsStatus === "maintenance" ? "The field station reported a maintenance watch as systems aged." : "The field station returned to normal operations."
  })]) : outpost.log;
  return Object.freeze({
    ...outpost,
    revision: Number(outpost.revision || 0) + 1,
    operationsStatus,
    condition,
    power: Object.freeze({ ...outpost.power, storedMWh, condition: nextPowerCondition }),
    lifeSupport: Object.freeze({ ...outpost.lifeSupport, condition: nextLifeSupportCondition }),
    stores: Object.freeze({ ...outpost.stores, foodKg, waterKg }),
    lastAdvancedMissionS: toS,
    log
  });
}
function advanceOutposts(expedition, missionS) {
  const outposts = (expedition?.outposts || []).map((outpost) => advanceOutpostState(outpost, missionS));
  if (!outposts.some((outpost, index) => outpost !== expedition.outposts[index])) return expedition?.outposts || Object.freeze([]);
  return Object.freeze(outposts);
}

// app/js/expedition/catalog.js?v=2
var PROPULSION_CLASS = Object.freeze({
  DEMONSTRATED: "demonstrated",
  ENGINEERING_DEVELOPMENT: "engineering-development",
  HIGHLY_SPECULATIVE: "highly-speculative",
  FICTIONAL: "fictional"
});
function immutableRecord(record) {
  return Object.freeze({
    ...record,
    requiredRooms: Object.freeze([...record.requiredRooms || []]),
    requiredRoles: Object.freeze([...record.requiredRoles || []]),
    supportedPropulsionIds: Object.freeze([...record.supportedPropulsionIds || []]),
    systems: Object.freeze([...record.systems || []]),
    explanation: Object.freeze({ ...record.explanation || {} })
  });
}
var PROPULSION_PROFILES = Object.freeze([
  immutableRecord({
    id: "nuclear-electric-cruise",
    name: "Nuclear-electric cruise drive",
    classification: PROPULSION_CLASS.ENGINEERING_DEVELOPMENT,
    crewedInterstellarEligible: false,
    accelerationMps2: 8e-5,
    maxVelocityFractionC: 4e-4,
    propellantKgPerShipYear: 1800,
    powerMWhPerShipDay: 18,
    explanation: {
      basis: "A fission reactor supplies electric propulsion with efficient, very low thrust.",
      limitation: "Assigned performance is useful for long Solar System travel, not a practical crewed trip to another star.",
      fiction: "No fictional performance is assigned."
    }
  }),
  immutableRecord({
    id: "fusion-pulse-interstellar",
    name: "Fusion pulse drive",
    classification: PROPULSION_CLASS.HIGHLY_SPECULATIVE,
    crewedInterstellarEligible: true,
    accelerationMps2: 15e-4,
    maxVelocityFractionC: 0.08,
    propellantKgPerShipYear: 7800,
    powerMWhPerShipDay: 34,
    explanation: {
      basis: "Pulsed fusion concepts use high-energy fusion products and reaction mass to produce momentum.",
      limitation: "No crewed interstellar fusion drive has been built; ignition, repetition rate, shielding, mass, and heat rejection remain unresolved.",
      fiction: "The game assumes a reliable pulse chamber and decades-long component life."
    }
  }),
  immutableRecord({
    id: "radiant-plasma-field-drive",
    name: "Radiant plasma field drive",
    classification: PROPULSION_CLASS.FICTIONAL,
    crewedInterstellarEligible: true,
    accelerationMps2: 0.3,
    maxVelocityFractionC: 0.32,
    propellantKgPerShipYear: 12600,
    powerMWhPerShipDay: 52,
    explanation: {
      basis: "Externally supplied power energizes reaction mass into a directed plasma exhaust; a field-shaped shield redirects part of the radiation load.",
      limitation: "The required conversion efficiency, compact field system, shielding, and thermal rejection exceed demonstrated engineering.",
      fiction: "World Explorer assigns the compact converter and field performance. The drive is fictional and does not exceed light speed."
    }
  })
]);
var SHIP_PROFILES = Object.freeze([
  immutableRecord({
    id: "long-range-research-vessel",
    name: "Long-range research vessel",
    releaseStatus: "playable-slice",
    dryMassKg: 58e5,
    propellantCapacityKg: 18e5,
    cargoCapacityKg: 42e4,
    minCrew: 8,
    maxCrew: 18,
    waterRecoveryFraction: 0.98,
    foodProductionFraction: 0.82,
    interiorSeed: 5100821,
    supportedPropulsionIds: ["fusion-pulse-interstellar", "radiant-plasma-field-drive"],
    requiredRoles: ["command", "flight", "navigation", "engineering", "medical", "life-support", "science"],
    requiredRooms: ["bridge", "engineering", "life-support", "quarters", "medical", "cargo-fabrication", "science", "local-craft-bay"],
    systems: ["propulsion", "power", "life-support", "navigation", "thermal", "medical", "fabrication", "food-production", "sensors", "hull"]
  }),
  immutableRecord({
    id: "cryogenic-expedition-vessel",
    name: "Cryogenic expedition vessel",
    releaseStatus: "playable-strategic",
    dryMassKg: 89e5,
    propellantCapacityKg: 14e5,
    cargoCapacityKg: 61e4,
    minCrew: 10,
    maxCrew: 34,
    waterRecoveryFraction: 0.985,
    foodProductionFraction: 0.88,
    interiorSeed: 5100947,
    supportedPropulsionIds: ["fusion-pulse-interstellar", "radiant-plasma-field-drive"],
    requiredRoles: ["command", "flight", "navigation", "engineering", "medical", "life-support", "science"],
    requiredRooms: ["bridge", "engineering", "life-support", "quarters", "medical", "cargo-fabrication", "science", "cryogenic-bay", "local-craft-bay"],
    systems: ["propulsion", "power", "life-support", "navigation", "thermal", "medical", "fabrication", "food-production", "cryogenic", "sensors", "hull"]
  }),
  immutableRecord({
    id: "generation-ship",
    name: "Generation ship",
    releaseStatus: "playable-strategic",
    dryMassKg: 19e8,
    propellantCapacityKg: 26e7,
    cargoCapacityKg: 42e7,
    minCrew: 2e4,
    maxCrew: 4e4,
    waterRecoveryFraction: 0.995,
    foodProductionFraction: 0.995,
    interiorSeed: 5101103,
    supportedPropulsionIds: ["fusion-pulse-interstellar"],
    requiredRoles: ["command", "flight", "navigation", "engineering", "medical", "life-support", "science", "education"],
    requiredRooms: ["bridge", "engineering", "life-support", "habitat", "medical", "agriculture", "fabrication", "science", "education", "local-craft-bay"],
    systems: ["propulsion", "power", "life-support", "navigation", "thermal", "medical", "fabrication", "food-production", "education", "sensors", "hull"]
  })
]);
var DEFAULT_CREW = Object.freeze([
  Object.freeze({ id: "player", name: "Explorer", ageYears: 34, experienceYears: 6, health: 1, fatigue: 0.08, assignment: "expedition-lead", roles: Object.freeze(["command", "science", "flight"]), status: "active" }),
  Object.freeze({ id: "crew-nav", name: "Mara Velez", ageYears: 39, experienceYears: 14, health: 0.98, fatigue: 0.11, assignment: "navigation-watch", roles: Object.freeze(["navigation", "command"]), status: "active" }),
  Object.freeze({ id: "crew-eng", name: "Dev Malik", ageYears: 42, experienceYears: 17, health: 0.97, fatigue: 0.13, assignment: "engineering-watch", roles: Object.freeze(["engineering", "fabrication"]), status: "active" }),
  Object.freeze({ id: "crew-life", name: "Avery Okafor", ageYears: 36, experienceYears: 11, health: 0.99, fatigue: 0.1, assignment: "life-support-watch", roles: Object.freeze(["life-support", "engineering"]), status: "active" }),
  Object.freeze({ id: "crew-med", name: "Jules Park", ageYears: 41, experienceYears: 16, health: 0.98, fatigue: 0.09, assignment: "medical-watch", roles: Object.freeze(["medical", "life-support"]), status: "active" }),
  Object.freeze({ id: "crew-science", name: "Noor Haddad", ageYears: 33, experienceYears: 9, health: 0.99, fatigue: 0.12, assignment: "science-watch", roles: Object.freeze(["science", "navigation", "education"]), status: "active" }),
  Object.freeze({ id: "crew-flight", name: "Tessa Morgan", ageYears: 38, experienceYears: 13, health: 0.98, fatigue: 0.1, assignment: "flight-watch", roles: Object.freeze(["flight", "navigation", "command"]), status: "active" }),
  Object.freeze({ id: "crew-systems", name: "Eli Chen", ageYears: 45, experienceYears: 20, health: 0.96, fatigue: 0.14, assignment: "systems-watch", roles: Object.freeze(["engineering", "medical"]), status: "active" })
]);
function getShipProfile(id) {
  return SHIP_PROFILES.find((entry) => entry.id === id) || null;
}
function getPropulsionProfile(id) {
  return PROPULSION_PROFILES.find((entry) => entry.id === id) || null;
}

// app/js/universe/catalog.js?v=11
var PC_TO_LY = 3.26156;
var SOURCES = Object.freeze({
  gaia: Object.freeze({
    id: "esa-gaia-dr3",
    label: "ESA Gaia DR3 / Gaia Catalogue of Nearby Stars",
    url: "https://gea.esac.esa.int/archive/",
    epoch: "J2016.0"
  }),
  exoplanets: Object.freeze({
    id: "nasa-exoplanet-archive-pscomppars",
    label: "NASA Exoplanet Archive PSCompPars",
    url: "https://exoplanetarchive.ipac.caltech.edu/",
    retrieved: "2026-07-14"
  }),
  nasaBlackHoles: Object.freeze({
    id: "nasa-black-hole-catalog-context",
    label: "NASA Black Hole Science",
    url: "https://science.nasa.gov/universe/black-holes/"
  }),
  eht: Object.freeze({
    id: "event-horizon-telescope",
    label: "Event Horizon Telescope",
    url: "https://eventhorizontelescope.org/"
  }),
  ned: Object.freeze({
    id: "nasa-ipac-ned",
    label: "NASA/IPAC Extragalactic Database",
    url: "https://ned.ipac.caltech.edu/"
  }),
  nasaOrion: Object.freeze({
    id: "esa-nasa-hubble-orion-mosaic",
    label: "ESA / NASA Hubble Orion mosaic",
    url: "https://sci.esa.int/web/hubble/-/38599-hubble-s-sharpest-view-of-the-orion-nebula"
  }),
  nasaCarina: Object.freeze({
    id: "nasa-webb-carina-cosmic-cliffs",
    label: "NASA Webb NIRCam / MIRI Carina Cosmic Cliffs composite",
    url: "https://science.nasa.gov/asset/webb/cosmic-cliffs-in-the-carina-nebula-nircam-and-miri-composite-image/"
  }),
  nasaCrab: Object.freeze({
    id: "nasa-webb-crab-nebula",
    label: "NASA Webb NIRCam / MIRI Crab Nebula composite",
    url: "https://science.nasa.gov/asset/webb/crab-nebula-nircam-and-miri-image/"
  }),
  nasaAndromeda: Object.freeze({
    id: "nasa-galex-spitzer-andromeda",
    label: "NASA GALEX / Spitzer Andromeda composite",
    url: "https://science.nasa.gov/photojournal/amazing-andromeda-galaxy/"
  }),
  nasaMilkyWay: Object.freeze({
    id: "nasa-spitzer-milky-way-plane",
    label: "NASA Spitzer Galactic Legacy Infrared Mid-Plane Survey Extraordinaire",
    url: "https://science.nasa.gov/photojournal/a-glimpse-of-the-milky-way/"
  })
});
function freezeChildren(children = []) {
  return Object.freeze(children.map((child) => Object.freeze({ ...child })));
}
function defaultGeneratedFlags(definition) {
  if (definition.id === "sol") return [];
  if (definition.objectClass === "planetary_system") return ["display-scale", "planet-appearance"];
  if (definition.objectClass === "galaxy") return ["resolved-star-field", "display-scaled-rotation"];
  if (definition.objectClass === "galaxy_cluster") return ["unresolved-member-field", "display-scale"];
  if (definition.objectClass === "black_hole") return ["real-time-lensing-approximation", "display-scale"];
  return [];
}
function entity(definition) {
  const generatedFlags = /* @__PURE__ */ new Set([
    ...defaultGeneratedFlags(definition),
    ...definition.generatedFlags || []
  ]);
  return Object.freeze({
    ...definition,
    aliases: Object.freeze(definition.aliases || []),
    children: freezeChildren(definition.children),
    generatedFlags: Object.freeze([...generatedFlags]),
    uncertainty: Object.freeze(definition.uncertainty || {}),
    provenance: Object.freeze(definition.provenance || [])
  });
}
var CATALOG = [
  entity({
    id: "universe",
    name: "Observable Universe",
    objectClass: "universe",
    parentId: null,
    address: "universe",
    accuracy: "observed panorama / model-derived exterior",
    visualProfile: { kind: "cosmic-web", seed: 1447 },
    provenance: [SOURCES.ned]
  }),
  entity({
    id: "local-group",
    name: "Local Group",
    objectClass: "galaxy_group",
    parentId: "universe",
    address: "universe/local-group",
    accuracy: "catalog-derived",
    canonicalPosition: { frame: "supergalactic", xMpc: 0, yMpc: 0, zMpc: 0 },
    physical: { radiusLy: 5e6 },
    visualProfile: { kind: "galaxy-group", seed: 31031 },
    provenance: [SOURCES.ned]
  }),
  entity({
    id: "milky-way",
    name: "Milky Way",
    objectClass: "galaxy",
    parentId: "local-group",
    address: "universe/local-group/milky-way",
    accuracy: "model-derived",
    canonicalPosition: { frame: "galactocentric", xLy: 0, yLy: 0, zLy: 0 },
    physical: { radiusLy: 5e4, thicknessLy: 1e3 },
    visualProfile: {
      kind: "barred-spiral",
      arms: 4,
      seed: 271828,
      image: "assets/textures/universe/milky-way-spitzer.jpg",
      imageAspect: 4.511,
      imageCredit: "NASA/JPL-Caltech/University of Wisconsin",
      imageSourceUrl: SOURCES.nasaMilkyWay.url,
      imageRole: "inside-galaxy-observed-plane",
      displayWidth: 15e3
    },
    generatedFlags: ["observational-sky-projection"],
    provenance: [SOURCES.gaia, SOURCES.nasaMilkyWay]
  }),
  entity({
    id: "sol",
    name: "Solar System",
    objectClass: "planetary_system",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/sol",
    accuracy: "observed",
    canonicalPosition: { frame: "galactocentric", radiusLy: 26670, zLy: 65 },
    physical: { hostMassSolar: 1, hostTemperatureK: 5772 },
    visualProfile: { kind: "g-star", color: 16773826 },
    provenance: [SOURCES.gaia]
  }),
  entity({
    id: "proxima-centauri",
    name: "Proxima Centauri",
    objectClass: "planetary_system",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/proxima-centauri",
    aliases: ["Proxima Cen", "Alpha Centauri C"],
    accuracy: "catalog-derived",
    canonicalPosition: { frame: "ICRS", raDeg: 217.3934657, decDeg: -62.6761821, distancePc: 1.30119, epoch: "J2000" },
    physical: { hostMassSolar: 0.1221, hostTemperatureK: 2900 },
    visualProfile: { kind: "red-dwarf", color: 16747618, seed: 11037 },
    children: [
      { id: "proxima-centauri-b", name: "Proxima Centauri b", objectClass: "exoplanet", radiusEarth: 1.02, massEarth: 1.055, orbitDays: 11.18465, semiMajorAxisAu: 0.04848, accuracy: "catalog-derived" },
      { id: "proxima-centauri-d", name: "Proxima Centauri d", objectClass: "exoplanet", radiusEarth: 0.692, massEarth: 0.26, orbitDays: 5.12338, semiMajorAxisAu: 0.02881, accuracy: "catalog-derived" }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: "tau-ceti",
    name: "Tau Ceti",
    objectClass: "planetary_system",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/tau-ceti",
    aliases: ["tau Cet"],
    accuracy: "catalog-derived",
    canonicalPosition: { frame: "ICRS", raDeg: 26.0093029, decDeg: -15.9337987, distancePc: 3.60304, epoch: "J2000" },
    physical: { hostMassSolar: 0.783, hostTemperatureK: 5310 },
    visualProfile: { kind: "g-star", color: 16769709, seed: 20517 },
    children: [
      { id: "tau-ceti-g", name: "Tau Ceti g", objectClass: "exoplanet", radiusEarth: 1.18, massEarth: 1.75, orbitDays: 20, semiMajorAxisAu: 0.133, accuracy: "catalog-derived" },
      { id: "tau-ceti-h", name: "Tau Ceti h", objectClass: "exoplanet", radiusEarth: 1.19, massEarth: 1.83, orbitDays: 49.41, semiMajorAxisAu: 0.243, accuracy: "catalog-derived" },
      { id: "tau-ceti-f", name: "Tau Ceti f", objectClass: "exoplanet", radiusEarth: 1.81, massEarth: 3.93, orbitDays: 636.13, semiMajorAxisAu: 1.334, accuracy: "catalog-derived" }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: "trappist-1",
    name: "TRAPPIST-1",
    objectClass: "planetary_system",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/trappist-1",
    accuracy: "catalog-derived",
    canonicalPosition: { frame: "ICRS", raDeg: 346.6263919, decDeg: -5.0434618, distancePc: 12.42988881, epoch: "J2000" },
    physical: { hostMassSolar: 0.0898, hostTemperatureK: 2566 },
    visualProfile: { kind: "ultracool-red-dwarf", color: 16740943, seed: 70917 },
    children: [
      { id: "trappist-1-b", name: "TRAPPIST-1 b", objectClass: "exoplanet", radiusEarth: 1.116, massEarth: 1.374, orbitDays: 1.510826, semiMajorAxisAu: 0.01154, accuracy: "catalog-derived" },
      { id: "trappist-1-c", name: "TRAPPIST-1 c", objectClass: "exoplanet", radiusEarth: 1.097, massEarth: 1.308, orbitDays: 2.421937, semiMajorAxisAu: 0.0158, accuracy: "catalog-derived" },
      { id: "trappist-1-d", name: "TRAPPIST-1 d", objectClass: "exoplanet", radiusEarth: 0.788, massEarth: 0.388, orbitDays: 4.049219, semiMajorAxisAu: 0.02227, accuracy: "catalog-derived" },
      { id: "trappist-1-e", name: "TRAPPIST-1 e", objectClass: "exoplanet", radiusEarth: 0.92, massEarth: 0.692, orbitDays: 6.101013, semiMajorAxisAu: 0.02925, accuracy: "catalog-derived" },
      { id: "trappist-1-f", name: "TRAPPIST-1 f", objectClass: "exoplanet", radiusEarth: 1.045, massEarth: 1.039, orbitDays: 9.20754, semiMajorAxisAu: 0.03849, accuracy: "catalog-derived" },
      { id: "trappist-1-g", name: "TRAPPIST-1 g", objectClass: "exoplanet", radiusEarth: 1.129, massEarth: 1.321, orbitDays: 12.352446, semiMajorAxisAu: 0.04683, accuracy: "catalog-derived" },
      { id: "trappist-1-h", name: "TRAPPIST-1 h", objectClass: "exoplanet", radiusEarth: 0.755, massEarth: 0.326, orbitDays: 18.772866, semiMajorAxisAu: 0.06189, accuracy: "catalog-derived" }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: "kepler-186",
    name: "Kepler-186",
    objectClass: "planetary_system",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/kepler-186",
    accuracy: "catalog-derived",
    canonicalPosition: { frame: "ICRS", raDeg: 298.652736, decDeg: 43.9549884, distancePc: 177.594, epoch: "J2000" },
    physical: { hostMassSolar: 0.544, hostTemperatureK: 3755 },
    visualProfile: { kind: "red-dwarf", color: 16751986, seed: 18605 },
    children: [
      { id: "kepler-186-b", name: "Kepler-186 b", objectClass: "exoplanet", radiusEarth: 1.07, massEarth: 1.24, orbitDays: 3.88679, semiMajorAxisAu: 0.0343, accuracy: "catalog-derived" },
      { id: "kepler-186-c", name: "Kepler-186 c", objectClass: "exoplanet", radiusEarth: 1.25, massEarth: 2.1, orbitDays: 7.267302, semiMajorAxisAu: 0.0451, accuracy: "catalog-derived" },
      { id: "kepler-186-d", name: "Kepler-186 d", objectClass: "exoplanet", radiusEarth: 1.4, massEarth: 2.54, orbitDays: 13.342996, semiMajorAxisAu: 0.0781, accuracy: "catalog-derived" },
      { id: "kepler-186-e", name: "Kepler-186 e", objectClass: "exoplanet", radiusEarth: 1.27, massEarth: 2.15, orbitDays: 22.407704, semiMajorAxisAu: 0.11, accuracy: "catalog-derived" },
      { id: "kepler-186-f", name: "Kepler-186 f", objectClass: "exoplanet", radiusEarth: 1.17, massEarth: 1.71, orbitDays: 129.9441, semiMajorAxisAu: 0.432, accuracy: "catalog-derived" }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: "55-cancri",
    name: "55 Cancri",
    objectClass: "planetary_system",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/55-cancri",
    aliases: ["55 Cnc", "Copernicus"],
    accuracy: "catalog-derived",
    canonicalPosition: { frame: "ICRS", raDeg: 133.1468373, decDeg: 28.3298154, distancePc: 12.5855, epoch: "J2000" },
    physical: { hostMassSolar: 1.015, hostTemperatureK: 5198 },
    visualProfile: { kind: "g-star", color: 16768940, seed: 55005 },
    children: [
      { id: "55-cancri-e", name: "55 Cancri e", objectClass: "exoplanet", radiusEarth: 1.875, massEarth: 7.99, orbitDays: 0.7365474, semiMajorAxisAu: 0.01544, accuracy: "catalog-derived" },
      { id: "55-cancri-b", name: "55 Cancri b", objectClass: "exoplanet", radiusEarth: 13.9, massEarth: 263.9785, orbitDays: 14.651552, semiMajorAxisAu: 0.118, accuracy: "catalog-derived" },
      { id: "55-cancri-c", name: "55 Cancri c", objectClass: "exoplanet", radiusEarth: 8.51, massEarth: 54.4738, orbitDays: 44.3936, semiMajorAxisAu: 0.247, accuracy: "catalog-derived" },
      { id: "55-cancri-f", name: "55 Cancri f", objectClass: "exoplanet", radiusEarth: 7.59, massEarth: 44.812, orbitDays: 260.58, semiMajorAxisAu: 0.802, accuracy: "catalog-derived" },
      { id: "55-cancri-d", name: "55 Cancri d", objectClass: "exoplanet", radiusEarth: 13, massEarth: 1232.493, orbitDays: 4799, semiMajorAxisAu: 5.6, accuracy: "catalog-derived" }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: "hd-219134",
    name: "HD 219134",
    objectClass: "planetary_system",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/hd-219134",
    accuracy: "catalog-derived",
    canonicalPosition: { frame: "ICRS", raDeg: 348.3372026, decDeg: 57.1696255, distancePc: 6.53127, epoch: "J2000" },
    physical: { hostMassSolar: 0.81, hostTemperatureK: 4699 },
    visualProfile: { kind: "k-star", color: 16761478, seed: 219134 },
    children: [
      { id: "hd-219134-b", name: "HD 219134 b", objectClass: "exoplanet", radiusEarth: 1.602, massEarth: 4.74, orbitDays: 3.092926, semiMajorAxisAu: 0.03876, accuracy: "catalog-derived" },
      { id: "hd-219134-c", name: "HD 219134 c", objectClass: "exoplanet", radiusEarth: 1.511, massEarth: 4.36, orbitDays: 6.76458, semiMajorAxisAu: 0.0653, accuracy: "catalog-derived" },
      { id: "hd-219134-f", name: "HD 219134 f", objectClass: "exoplanet", radiusEarth: 1.31, massEarth: 7.3, orbitDays: 22.717, semiMajorAxisAu: 0.1463, accuracy: "catalog-derived" },
      { id: "hd-219134-d", name: "HD 219134 d", objectClass: "exoplanet", radiusEarth: 1.61, massEarth: 16.17, orbitDays: 46.859, semiMajorAxisAu: 0.237, accuracy: "catalog-derived" },
      { id: "hd-219134-g", name: "HD 219134 g", objectClass: "exoplanet", radiusEarth: 3.28, massEarth: 10.80622, orbitDays: 94.2, semiMajorAxisAu: 0.3753, accuracy: "catalog-derived" },
      { id: "hd-219134-h", name: "HD 219134 h", objectClass: "exoplanet", radiusEarth: 12.7, massEarth: 108.0622, orbitDays: 2247, semiMajorAxisAu: 3.11, accuracy: "catalog-derived" }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: "lhs-1140",
    name: "LHS 1140",
    objectClass: "planetary_system",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/lhs-1140",
    accuracy: "catalog-derived",
    canonicalPosition: { frame: "ICRS", raDeg: 11.248632, decDeg: -15.2741085, distancePc: 14.9861, epoch: "J2000" },
    physical: { hostMassSolar: 0.1844, hostTemperatureK: 3096 },
    visualProfile: { kind: "red-dwarf", color: 16746335, seed: 1140 },
    children: [
      { id: "lhs-1140-c", name: "LHS 1140 c", objectClass: "exoplanet", radiusEarth: 1.272, massEarth: 1.91, orbitDays: 3.77794, semiMajorAxisAu: 0.027, accuracy: "catalog-derived" },
      { id: "lhs-1140-b", name: "LHS 1140 b", objectClass: "exoplanet", radiusEarth: 1.73, massEarth: 5.6, orbitDays: 24.73723, semiMajorAxisAu: 0.0946, accuracy: "catalog-derived" }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: "toi-700",
    name: "TOI-700",
    objectClass: "planetary_system",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/toi-700",
    accuracy: "catalog-derived",
    canonicalPosition: { frame: "ICRS", raDeg: 97.0957165, decDeg: -65.5786149, distancePc: 31.1265, epoch: "J2000" },
    physical: { hostMassSolar: 0.415, hostTemperatureK: 3459 },
    visualProfile: { kind: "red-dwarf", color: 16749931, seed: 70004 },
    children: [
      { id: "toi-700-b", name: "TOI-700 b", objectClass: "exoplanet", radiusEarth: 0.914, massEarth: 0.704, orbitDays: 9.977219, semiMajorAxisAu: 0.0677, accuracy: "catalog-derived" },
      { id: "toi-700-c", name: "TOI-700 c", objectClass: "exoplanet", radiusEarth: 2.6, massEarth: 7.27, orbitDays: 16.051137, semiMajorAxisAu: 0.0929, accuracy: "catalog-derived" },
      { id: "toi-700-e", name: "TOI-700 e", objectClass: "exoplanet", radiusEarth: 0.953, massEarth: 0.818, orbitDays: 27.80978, semiMajorAxisAu: 0.134, accuracy: "catalog-derived" },
      { id: "toi-700-d", name: "TOI-700 d", objectClass: "exoplanet", radiusEarth: 1.073, massEarth: 1.25, orbitDays: 37.42396, semiMajorAxisAu: 0.1633, accuracy: "catalog-derived" }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: "sagittarius-a-star",
    name: "Sagittarius A*",
    objectClass: "black_hole",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/sagittarius-a-star",
    aliases: ["Sgr A*"],
    accuracy: "observed",
    canonicalPosition: { frame: "ICRS", raDeg: 266.41683, decDeg: -29.00781, distanceLy: 26670, epoch: "J2000" },
    physical: { massSolar: 4e6, schwarzschildRadiusKm: 118e5, spinEstimate: null },
    visualProfile: { kind: "black-hole", diskInclinationDeg: 50, diskColor: 16757867, seed: 4e6 },
    uncertainty: { mass: "approximately 4 million solar masses" },
    provenance: [SOURCES.nasaBlackHoles, SOURCES.eht]
  }),
  entity({
    id: "orion-nebula",
    name: "Orion Nebula",
    objectClass: "nebula",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/orion-nebula",
    aliases: ["M42", "NGC 1976"],
    accuracy: "observed imagery / catalog-derived position",
    canonicalPosition: { frame: "ICRS", raDeg: 83.8221, decDeg: -5.3911, distanceLy: 1344, epoch: "J2000" },
    physical: { radiusLy: 12 },
    visualProfile: {
      kind: "observational-nebula",
      image: "assets/textures/universe/orion-nebula-nasa.jpg?v=3",
      imageAspect: 2.0833,
      displayWidth: 24e3,
      imageCredit: "NASA, ESA, M. Robberto (STScI/ESA), Hubble Orion Treasury Project Team",
      seed: 1976,
      tint: 9021439,
      navigationRadiusScene: 9e3
    },
    generatedFlags: ["observational-image-projection"],
    uncertainty: { distance: "Published estimates vary by method and sub-region." },
    provenance: [SOURCES.nasaOrion]
  }),
  entity({
    id: "carina-nebula",
    name: "Carina Nebula",
    objectClass: "nebula",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/carina-nebula",
    aliases: ["NGC 3372"],
    accuracy: "observed imagery / catalog-derived position",
    canonicalPosition: { frame: "ICRS", raDeg: 161.0792, decDeg: -59.8892, distanceLy: 7500, epoch: "J2000" },
    physical: { radiusLy: 115 },
    visualProfile: {
      kind: "observational-nebula",
      image: "assets/textures/universe/carina-nebula-webb.jpg?v=1",
      imageAspect: 2.8902,
      displayWidth: 32e3,
      imageCredit: "NASA, ESA, CSA, STScI",
      seed: 3372,
      tint: 16751219,
      navigationRadiusScene: 9e3
    },
    generatedFlags: ["observational-image-projection"],
    uncertainty: { distance: "Representative distance to the Carina star-forming complex." },
    provenance: [SOURCES.nasaCarina]
  }),
  entity({
    id: "crab-nebula",
    name: "Crab Nebula",
    objectClass: "nebula",
    parentId: "milky-way",
    address: "universe/local-group/milky-way/crab-nebula",
    aliases: ["M1", "NGC 1952"],
    accuracy: "observed imagery / catalog-derived position",
    canonicalPosition: { frame: "ICRS", raDeg: 83.6331, decDeg: 22.0145, distanceLy: 6500, epoch: "J2000" },
    physical: { radiusLy: 5.5 },
    visualProfile: {
      kind: "observational-nebula",
      image: "assets/textures/universe/crab-nebula-webb.jpg?v=1",
      imageAspect: 1.1488,
      displayWidth: 2e4,
      imageCredit: "NASA, ESA, CSA, STScI, Tea Temim (Princeton University); Image Processing: Joseph DePasquale (STScI)",
      seed: 1952,
      tint: 8315063,
      navigationRadiusScene: 9e3
    },
    generatedFlags: ["observational-image-projection"],
    provenance: [SOURCES.nasaCrab]
  }),
  entity({
    id: "andromeda",
    name: "Andromeda Galaxy",
    objectClass: "galaxy",
    parentId: "local-group",
    address: "universe/local-group/andromeda",
    aliases: ["M31", "NGC 224"],
    accuracy: "catalog-derived",
    canonicalPosition: { frame: "ICRS", raDeg: 10.6847, decDeg: 41.269, distanceLy: 254e4, epoch: "J2000" },
    physical: { radiusLy: 76e3 },
    visualProfile: {
      kind: "spiral",
      arms: 2,
      inclinationDeg: 77.5,
      seed: 31,
      image: "assets/textures/universe/andromeda-galex-spitzer.jpg",
      imageAspect: 3.083,
      imageCredit: "NASA/JPL-Caltech",
      imageSourceUrl: SOURCES.nasaAndromeda.url
    },
    provenance: [SOURCES.ned, SOURCES.nasaAndromeda]
  }),
  entity({
    id: "andromeda-inner-disk",
    name: "Andromeda Inner Disk",
    objectClass: "stellar_region",
    parentId: "andromeda",
    address: "universe/local-group/andromeda/inner-disk",
    accuracy: "model-derived",
    canonicalPosition: { frame: "ICRS", raDeg: 10.6847, decDeg: 41.269, distanceLy: 254e4, epoch: "J2000" },
    physical: { radiusLy: 9e3 },
    visualProfile: { kind: "stellar-region", galaxyKind: "spiral", seed: 31001, tint: 11388927, navigationRadiusScene: 15e3 },
    generatedFlags: ["individual-stars", "planetary-systems", "minor-body-encounters"],
    uncertainty: { contents: "Resolved systems are deterministic exploration models, not observed M31 exoplanets." },
    provenance: [SOURCES.ned]
  }),
  entity({
    id: "andromeda-explorer-a",
    name: "M31 Explorer System A",
    objectClass: "planetary_system",
    parentId: "andromeda-inner-disk",
    address: "universe/local-group/andromeda/inner-disk/explorer-a",
    accuracy: "procedurally generated",
    canonicalPosition: { frame: "ICRS", raDeg: 10.6849, decDeg: 41.2692, distanceLy: 254e4, epoch: "J2000" },
    physical: { hostMassSolar: 0.94, hostTemperatureK: 5520 },
    visualProfile: { kind: "generated-g-star", color: 16769968, seed: 31011 },
    generatedFlags: ["host-star-parameters", "planetary-orbits", "planet-appearance"],
    children: [
      { id: "andromeda-explorer-a-b", name: "Explorer A b", objectClass: "exoplanet", radiusEarth: 0.82, massEarth: 0.64, orbitDays: 41, semiMajorAxisAu: 0.23, accuracy: "procedurally generated" },
      { id: "andromeda-explorer-a-c", name: "Explorer A c", objectClass: "exoplanet", radiusEarth: 1.26, massEarth: 2.04, orbitDays: 188, semiMajorAxisAu: 0.69, accuracy: "procedurally generated" },
      { id: "andromeda-explorer-a-d", name: "Explorer A d", objectClass: "exoplanet", radiusEarth: 6.8, massEarth: 81, orbitDays: 980, semiMajorAxisAu: 2.1, accuracy: "procedurally generated" }
    ],
    provenance: [SOURCES.ned]
  }),
  entity({
    id: "triangulum",
    name: "Triangulum Galaxy",
    objectClass: "galaxy",
    parentId: "local-group",
    address: "universe/local-group/triangulum",
    aliases: ["M33", "NGC 598"],
    accuracy: "catalog-derived",
    canonicalPosition: { frame: "ICRS", raDeg: 23.4621, decDeg: 30.6599, distanceLy: 273e4, epoch: "J2000" },
    physical: { radiusLy: 3e4 },
    visualProfile: { kind: "spiral", arms: 2, inclinationDeg: 54, seed: 33 },
    provenance: [SOURCES.ned]
  }),
  entity({
    id: "triangulum-ngc604-region",
    name: "Triangulum NGC 604 Region",
    objectClass: "stellar_region",
    parentId: "triangulum",
    address: "universe/local-group/triangulum/ngc-604-region",
    accuracy: "catalog-anchored / model-derived interior",
    canonicalPosition: { frame: "ICRS", raDeg: 23.4621, decDeg: 30.6599, distanceLy: 273e4, epoch: "J2000" },
    physical: { radiusLy: 760 },
    visualProfile: { kind: "stellar-region", galaxyKind: "star-forming", seed: 60433, tint: 9492479, navigationRadiusScene: 15e3 },
    generatedFlags: ["individual-stars", "planetary-systems", "minor-body-encounters"],
    uncertainty: { contents: "The region anchor is observed; individual explorable systems are generated." },
    provenance: [SOURCES.ned]
  }),
  entity({
    id: "triangulum-explorer-a",
    name: "M33 Explorer System A",
    objectClass: "planetary_system",
    parentId: "triangulum-ngc604-region",
    address: "universe/local-group/triangulum/ngc-604-region/explorer-a",
    accuracy: "procedurally generated",
    canonicalPosition: { frame: "ICRS", raDeg: 23.4623, decDeg: 30.6601, distanceLy: 273e4, epoch: "J2000" },
    physical: { hostMassSolar: 1.31, hostTemperatureK: 6410 },
    visualProfile: { kind: "generated-f-star", color: 15135231, seed: 60443 },
    generatedFlags: ["host-star-parameters", "planetary-orbits", "planet-appearance"],
    children: [
      { id: "triangulum-explorer-a-b", name: "Explorer A b", objectClass: "exoplanet", radiusEarth: 1.53, massEarth: 3.4, orbitDays: 72, semiMajorAxisAu: 0.38, accuracy: "procedurally generated" },
      { id: "triangulum-explorer-a-c", name: "Explorer A c", objectClass: "exoplanet", radiusEarth: 4.2, massEarth: 19, orbitDays: 430, semiMajorAxisAu: 1.34, accuracy: "procedurally generated" }
    ],
    provenance: [SOURCES.ned]
  }),
  entity({
    id: "virgo-cluster",
    name: "Virgo Cluster",
    objectClass: "galaxy_cluster",
    parentId: "universe",
    address: "universe/virgo-cluster",
    accuracy: "catalog-derived",
    canonicalPosition: { frame: "ICRS", raDeg: 186.75, decDeg: 12.717, distanceLy: 538e5, epoch: "J2000" },
    physical: { radiusLy: 49e5, memberEstimate: 1300 },
    visualProfile: { kind: "galaxy-cluster", seed: 1300 },
    provenance: [SOURCES.ned]
  }),
  entity({
    id: "m87-star",
    name: "M87*",
    objectClass: "black_hole",
    parentId: "virgo-cluster",
    address: "universe/virgo-cluster/m87-star",
    accuracy: "observed",
    canonicalPosition: { frame: "ICRS", raDeg: 187.70593, decDeg: 12.39112, distanceLy: 535e5, epoch: "J2000" },
    physical: { massSolar: 65e8, schwarzschildRadiusKm: 192e8, spinEstimate: null },
    visualProfile: { kind: "black-hole", diskInclinationDeg: 17, diskColor: 16751965, seed: 65e8 },
    uncertainty: { mass: "approximately 6.5 billion solar masses" },
    provenance: [SOURCES.eht, SOURCES.ned]
  })
];
function makeChildDestination(parent, child) {
  return Object.freeze({
    ...child,
    parentId: parent.id,
    parentFrameId: parent.id,
    hostName: parent.name,
    address: `${parent.address}/planets/${child.id}`,
    canonicalPosition: parent.canonicalPosition,
    provenance: parent.provenance,
    aliases: Object.freeze(child.aliases || []),
    children: Object.freeze([]),
    generatedFlags: Object.freeze([
      ...child.generatedFlags || [],
      "display-scale",
      "model-derived-appearance"
    ]),
    uncertainty: Object.freeze({
      ...child.uncertainty || {},
      appearance: "Surface, atmosphere, cloud, and ring details are model-derived unless explicitly stated otherwise."
    })
  });
}
var CHILD_DESTINATIONS = Object.freeze(CATALOG.flatMap(
  (parent) => parent.objectClass === "planetary_system" ? parent.children.map((child) => makeChildDestination(parent, child)) : []
));
var ALL_DESTINATIONS = Object.freeze([...CATALOG, ...CHILD_DESTINATIONS]);
var BY_ID = new Map(ALL_DESTINATIONS.map((item) => [item.id, item]));
var BY_ADDRESS = new Map(ALL_DESTINATIONS.map((item) => [item.address, item]));
function distanceLightYears(item) {
  const canonical = item?.canonicalPosition || {};
  if (Number.isFinite(canonical.distanceLy)) return canonical.distanceLy;
  if (Number.isFinite(canonical.distancePc)) return canonical.distancePc * PC_TO_LY;
  return 0;
}
function icrsToCartesian(item, scale = 1) {
  const position = item?.canonicalPosition || {};
  const radius = distanceLightYears(item) * scale;
  const ra = Number(position.raDeg || 0) * Math.PI / 180;
  const dec = Number(position.decDeg || 0) * Math.PI / 180;
  return {
    x: radius * Math.cos(dec) * Math.cos(ra),
    y: radius * Math.sin(dec),
    z: radius * Math.cos(dec) * Math.sin(ra)
  };
}
function resolveUniverseAddress(addressOrId) {
  const value = String(addressOrId || "").trim().replace(/^\/+|\/+$/g, "");
  return BY_ID.get(value) || BY_ADDRESS.get(value) || null;
}

// app/js/expedition/travel-calculator.js?v=2
var LIGHT_SPEED_MPS = 299792458;
var LIGHT_YEAR_M = 9460730472580800;
var JULIAN_YEAR_S = 31557600;
var DAY_S = 86400;
function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${label} must be positive.`);
  return number;
}
function routeDistanceLy(originOrId, destinationOrId) {
  const origin = typeof originOrId === "string" ? resolveUniverseAddress(originOrId) : originOrId;
  const destination = typeof destinationOrId === "string" ? resolveUniverseAddress(destinationOrId) : destinationOrId;
  if (!destination) throw new TypeError("The Expedition destination is unavailable.");
  if (!origin || origin.id === "sol") return finitePositive(distanceLightYears(destination), "route distance");
  if (destination.id === "sol") return finitePositive(distanceLightYears(origin), "route distance");
  const a = icrsToCartesian(origin, 1);
  const b = icrsToCartesian(destination, 1);
  return finitePositive(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), "route distance");
}
function relativisticLeg(distanceM, accelerationMps2, maxVelocityFractionC) {
  const distance = finitePositive(distanceM, "distance");
  const acceleration = finitePositive(accelerationMps2, "acceleration");
  const betaCap = Math.min(0.999999, finitePositive(maxVelocityFractionC, "maximum velocity fraction"));
  const gammaCap = 1 / Math.sqrt(1 - betaCap ** 2);
  const capAccelerationDistanceM = LIGHT_SPEED_MPS ** 2 / acceleration * (gammaCap - 1);
  const reachesCruise = capAccelerationDistanceM * 2 < distance;
  let accelerationDistanceM;
  let betaPeak;
  let gammaPeak;
  if (reachesCruise) {
    accelerationDistanceM = capAccelerationDistanceM;
    betaPeak = betaCap;
    gammaPeak = gammaCap;
  } else {
    accelerationDistanceM = distance / 2;
    gammaPeak = 1 + acceleration * accelerationDistanceM / LIGHT_SPEED_MPS ** 2;
    betaPeak = Math.sqrt(1 - 1 / gammaPeak ** 2);
  }
  const rapidity = Math.acosh(gammaPeak);
  const accelerationExternalS = LIGHT_SPEED_MPS / acceleration * Math.sinh(rapidity);
  const accelerationProperS = LIGHT_SPEED_MPS / acceleration * rapidity;
  const cruiseDistanceM = Math.max(0, distance - accelerationDistanceM * 2);
  const cruiseExternalS = cruiseDistanceM > 0 ? cruiseDistanceM / (betaPeak * LIGHT_SPEED_MPS) : 0;
  const cruiseProperS = cruiseExternalS / gammaPeak;
  return Object.freeze({
    accelerationDistanceM,
    cruiseDistanceM,
    peakVelocityFractionC: betaPeak,
    peakVelocityMps: betaPeak * LIGHT_SPEED_MPS,
    peakLorentzFactor: gammaPeak,
    reachesCruise,
    externalElapsedS: accelerationExternalS * 2 + cruiseExternalS,
    properElapsedS: accelerationProperS * 2 + cruiseProperS
  });
}
function expectedResourceUse({ durationDays, crewCount, ship, propulsion }) {
  const crewDays = durationDays * crewCount;
  const waterUseBeforeRecoveryKg = crewDays * 3.2;
  return Object.freeze({
    foodKg: crewDays * 0.75 * Math.max(0.02, 1 - ship.foodProductionFraction),
    waterKg: waterUseBeforeRecoveryKg * Math.max(1e-3, 1 - ship.waterRecoveryFraction),
    powerMWh: durationDays * propulsion.powerMWhPerShipDay + crewDays * 0.018,
    propellantKg: durationDays / 365.25 * propulsion.propellantKgPerShipYear,
    medicalUnits: crewDays * 2e-3,
    maintenanceKg: durationDays * (0.35 + crewCount * 0.025),
    feedstockKg: durationDays * 0.14,
    scienceCargoKg: Math.max(1200, crewCount * 180)
  });
}
function calculateExpeditionTravel({
  originId = "sol",
  destinationId,
  ship,
  propulsion,
  crewCount,
  expectedPlayerMinutes = 24
}) {
  if (!ship || !propulsion) throw new TypeError("A ship and propulsion profile are required.");
  const crew = Math.max(1, Math.round(finitePositive(crewCount, "crew count")));
  const distanceLy = routeDistanceLy(originId, destinationId);
  const distanceM = distanceLy * LIGHT_YEAR_M;
  const leg = relativisticLeg(distanceM, propulsion.accelerationMps2, propulsion.maxVelocityFractionC);
  const externalYears = leg.externalElapsedS / JULIAN_YEAR_S;
  const properYears = leg.properElapsedS / JULIAN_YEAR_S;
  const durationDays = leg.properElapsedS / DAY_S;
  const resources = expectedResourceUse({ durationDays, crewCount: crew, ship, propulsion });
  const playerSeconds = Math.max(60, Number(expectedPlayerMinutes) * 60 || 1440);
  const strategicCompression = leg.properElapsedS / playerSeconds;
  return Object.freeze({
    type: "ExpeditionTravelCalculation",
    schemaVersion: 1,
    originId,
    destinationId,
    distanceLy,
    distanceM,
    externalElapsedS: leg.externalElapsedS,
    properElapsedS: leg.properElapsedS,
    externalYears,
    properYears,
    expectedPlayerMinutes: playerSeconds / 60,
    strategicCompression,
    peakVelocityFractionC: leg.peakVelocityFractionC,
    peakLorentzFactor: leg.peakLorentzFactor,
    reachesCruise: leg.reachesCruise,
    accelerationDistanceM: leg.accelerationDistanceM,
    cruiseDistanceM: leg.cruiseDistanceM,
    expectedResources: resources,
    crewCount: crew,
    classification: propulsion.classification
  });
}

// app/js/expedition/voyage-events.js?v=3
function response(id, label, effects, results) {
  return Object.freeze({ id, label, effects: Object.freeze(effects || {}), results: Object.freeze(results) });
}
function event(id, category, title, evidence, roomId, roles, choices, options = {}) {
  return Object.freeze({
    id,
    category,
    title,
    evidence,
    roomId,
    roles: Object.freeze(roles),
    choices: Object.freeze(choices),
    weight: options.weight || 1,
    cooldownSteps: options.cooldownSteps || 4,
    incompatibleTags: Object.freeze(options.incompatibleTags || []),
    requiresTags: Object.freeze(options.requiresTags || [])
  });
}
var VOYAGE_EVENT_FAMILIES = Object.freeze([
  event("departure-handoff", "navigation", "Departure watch handoff", "The cruise crew is ready to take the ship, but the departure watch has two unresolved navigation notes.", "bridge", ["command", "navigation"], [
    response("full-handoff", "Review both notes with the incoming watch", { roles: ["navigation"], repair: { navigation: 0.035 }, fatigue: 8e-3, tags: ["watch-handoff-verified"] }, ["The two watches reconcile the notes and transfer a clean course picture.", "The handoff takes longer than planned, but the incoming watch understands the remaining uncertainty.", "A missed discrepancy forces navigation to repeat part of the departure solution."]),
    response("captain-brief", "Give the incoming watch a short captain\u2019s brief", { roles: ["command"], fatigue: -5e-3, tags: ["watch-handoff-brief"] }, ["The short brief focuses the watch on the route\u2019s real margins.", "The watch understands the priorities, though one technical note remains open.", "The brief is too compressed and the incoming watch inherits an avoidable question."])
  ], { weight: 2 }),
  event("course-margin-review", "navigation", "Course margin review", "Navigation finds that the current arrival margin is narrower than the plan assumed.", "navigation-cartography", ["navigation", "command"], [
    response("refine-course", "Rebuild the course solution", { roles: ["navigation"], cost: { powerMWh: 0.18 }, repair: { navigation: 0.045 }, tags: ["course-margin-restored"] }, ["The rebuilt solution restores a comfortable arrival margin.", "The new solution improves the margin but retains a small correction later.", "The recalculation exposes a larger uncertainty and adds work to the next watch."]),
    response("protect-reserves", "Keep the route and protect reserves", { tags: ["narrow-course-margin"], deferred: [{ afterSteps: 3, systemId: "navigation", delta: -0.035, unlessTag: "course-margin-restored", message: "The narrow arrival margin requires an additional correction." }] }, ["The ship holds course and preserves its reserves.", "The route remains safe, though the next correction window becomes important.", "Small errors accumulate and the crew must recover them later."])
  ]),
  event("sensor-navigation-disagreement", "navigation", "Sensors and navigation disagree", "The star tracker and inertial solution place the ship on slightly different lines.", "sensor-control", ["navigation", "science"], [
    response("cross-calibrate", "Cross-calibrate both systems", { roles: ["navigation", "science"], cost: { powerMWh: 0.25 }, repair: { navigation: 0.04, sensors: 0.04 }, tags: ["frames-cross-calibrated"] }, ["The two frames converge and the course solution stabilizes.", "Most of the disagreement is removed, with a small residual left for later.", "The calibration run fails to isolate the source of the disagreement."]),
    response("trust-inertial", "Continue on the inertial solution", { tags: ["sensor-disagreement-deferred"], deferred: [{ afterSteps: 2, systemId: "sensors", delta: -0.04, message: "The unresolved frame disagreement complicates a later observation." }] }, ["The inertial solution remains steady through the next leg.", "The ship stays on course, but science loses some pointing confidence.", "The unresolved error grows enough to cost a later correction."])
  ]),
  event("avoidance-maneuver", "navigation", "Micrometeoroid avoidance", "Forward tracking resolves a compact particle stream crossing the ship\u2019s path.", "bridge", ["flight", "navigation"], [
    response("thread-gap", "Fly through the measured gap", { roles: ["flight", "navigation"], cost: { propellantKg: 18 }, tags: ["precise-avoidance"] }, ["The ship crosses the stream without a strike.", "A few grains hit the outer shield, but the pressure hull remains untouched.", "The timing error exposes the forward shield to a glancing impact."]),
    response("wide-diversion", "Take the wider diversion", { cost: { propellantKg: 48, foodKg: 2, waterKg: 1.5 }, tags: ["conservative-diversion"] }, ["The diversion clears the stream with room to spare.", "The route is safe but costs more time than expected.", "A late burn spends extra propellant before the ship clears the stream."])
  ]),
  event("local-system-insertion", "navigation", "Local-system insertion", "The destination star\u2019s motion is now measurable and the crew must choose an insertion profile.", "bridge", ["flight", "navigation"], [
    response("survey-insertion", "Enter on a broad survey arc", { roles: ["navigation", "science"], cost: { propellantKg: 32 }, tags: ["survey-insertion"] }, ["The arc gives sensors a clean first look at the system.", "The ship enters safely, though the first survey pass is shorter than planned.", "The entry geometry obscures part of the system and requires a second pass."]),
    response("direct-insertion", "Enter on the shortest safe line", { roles: ["flight"], cost: { propellantKg: 18 }, tags: ["direct-insertion"] }, ["The flight crew completes a precise direct insertion.", "The ship enters safely with little margin for a course correction.", "The direct line requires a hard correction near the end of the burn."])
  ]),
  event("final-approach", "navigation", "Final approach calibration", "The destination frame is resolving into local stars, bodies, and safe navigation boundaries.", "bridge", ["navigation", "science", "flight"], [
    response("calibrate-arrival", "Calibrate the local frame", { roles: ["navigation", "science"], cost: { powerMWh: 0.2 }, repair: { navigation: 0.08, sensors: 0.04 }, tags: ["arrival-calibrated"] }, ["The local frame resolves cleanly and the ship is ready for manual flight.", "The frame is usable, with one low-confidence region marked for caution.", "The calibration needs a manual flight correction before local operations begin."]),
    response("manual-approach", "Keep the approach under manual control", { roles: ["flight"], repair: { navigation: 0.02 }, tags: ["manual-arrival"] }, ["The flight crew carries the ship smoothly into local space.", "The approach succeeds with a wider safety boundary.", "The crew recovers a late alignment error before entering the local frame."])
  ], { weight: 2 }),
  event("coolant-pump-wear", "engineering", "Coolant pump wear", "A primary thermal-loop pump is losing efficiency under cruise load.", "thermal-control", ["engineering"], [
    response("replace-pump", "Replace the pump", { roles: ["engineering"], requires: { resources: { maintenanceKg: 120 } }, cost: { maintenanceKg: 120 }, repair: { thermal: 0.26 }, tags: ["pump-replaced"] }, ["Engineering installs and tests the spare pump.", "The replacement works, though vibration remains above baseline.", "The new pump needs a second shutdown after a poor first alignment."]),
    response("reduce-reactor-load", "Reduce reactor load and service the bearings", { roles: ["engineering"], cost: { powerMWh: 0.45 }, repair: { thermal: 0.12 }, tags: ["reduced-thermal-load"], deferred: [{ afterSteps: 3, resourceKey: "foodKg", delta: -3, message: "The reduced reactor load lengthens the leg and consumes additional provisions." }] }, ["The bearings stabilize at the lower load.", "The loop holds, but cruise performance remains limited.", "The pump continues to shed efficiency and must be watched closely."])
  ]),
  event("power-converter-loss", "engineering", "Power conversion loss", "A converter bank is shedding useful energy as heat.", "power-control", ["engineering"], [
    response("service-converter", "Service the converter bank", { roles: ["engineering"], requires: { resources: { maintenanceKg: 30 } }, cost: { maintenanceKg: 30 }, repair: { power: 0.2, thermal: 0.03 }, tags: ["converter-serviced"] }, ["The bank returns to its expected conversion range.", "Efficiency improves, though one module remains below baseline.", "The first repair uncovers damage in a neighboring module."]),
    response("shed-load", "Shed nonessential loads", { cost: { powerMWh: 0.3 }, tags: ["nonessential-loads-off"], deferred: [{ afterSteps: 2, systemId: "medical", delta: -0.025, message: "Deferred medical and exercise loads reduce the crew\u2019s recovery margin." }] }, ["Essential systems retain a stable power margin.", "The load shed works, with a growing backlog of deferred work.", "The crew must cut deeper than expected to protect life support."])
  ]),
  event("injector-imbalance", "engineering", "Propulsion injector imbalance", "The drive\u2019s thrust trace shows a repeating imbalance across one injector group.", "engineering", ["engineering", "flight"], [
    response("hot-balance", "Balance the injectors under load", { roles: ["engineering", "flight"], requires: { systems: { propulsion: 0.45 } }, cost: { propellantKg: 22 }, repair: { propulsion: 0.18 }, tags: ["injectors-balanced"] }, ["The thrust trace settles without interrupting the leg.", "The balance improves, but the crew schedules a later inspection.", "The under-load adjustment worsens one injector before the crew stabilizes it."]),
    response("shutdown-inspection", "Pause thrust for a full inspection", { roles: ["engineering"], cost: { foodKg: 2.5, waterKg: 1.5 }, repair: { propulsion: 0.24 }, tags: ["injectors-inspected"] }, ["The crew finds the worn component and restores the injector group.", "The inspection removes the worst imbalance but lengthens the leg.", "The shutdown reveals that the available replacement needs fabrication."])
  ]),
  event("radiator-obstruction", "engineering", "Radiator flow obstruction", "One heat-rejection panel is running hotter than its neighboring sections.", "thermal-control", ["engineering"], [
    response("flush-loop", "Flush the affected loop", { roles: ["engineering"], cost: { waterKg: 4, maintenanceKg: 12 }, repair: { thermal: 0.17 }, tags: ["radiator-flushed"] }, ["The obstruction clears and panel temperatures equalize.", "Flow improves, but the panel stays slightly above baseline.", "The flush moves debris deeper into the loop and creates more work."]),
    response("isolate-panel", "Isolate the panel and lower output", { cost: { powerMWh: 0.55 }, tags: ["radiator-panel-isolated"], deferred: [{ afterSteps: 2, systemId: "thermal", delta: -0.03, unlessTag: "radiator-flushed", message: "The isolated radiator panel narrows the thermal margin." }] }, ["The remaining panels carry the reduced load.", "Temperatures stabilize near the top of the safe range.", "The reduced array struggles during the next high-load operation."])
  ]),
  event("attitude-control-wear", "engineering", "Attitude-control degradation", "A control cluster responds slowly during fine pointing.", "engineering", ["engineering", "flight"], [
    response("replace-valves", "Replace the worn control valves", { roles: ["engineering"], requires: { resources: { maintenanceKg: 20 } }, cost: { maintenanceKg: 20 }, repair: { propulsion: 0.08, navigation: 0.04 }, tags: ["attitude-valves-replaced"] }, ["Fine pointing returns to normal.", "Response improves enough for routine navigation.", "One replacement valve sticks during the functional check."]),
    response("software-compensation", "Compensate in the flight solution", { roles: ["flight", "navigation"], cost: { powerMWh: 0.12 }, tags: ["attitude-software-compensation"] }, ["The revised control law masks the slow cluster.", "The compensation works except during the fastest slews.", "The control law creates an oscillation that demands manual damping."])
  ]),
  event("pressure-zone-leak", "engineering", "Pressure-zone leak", "Atmosphere monitors find a slow pressure loss near a service penetration.", "life-support", ["engineering", "life-support"], [
    response("trace-and-seal", "Trace and seal the leak", { roles: ["engineering", "life-support"], requires: { resources: { maintenanceKg: 16 } }, cost: { maintenanceKg: 16 }, repair: { hull: 0.13, "life-support": 0.06 }, tags: ["pressure-leak-sealed"] }, ["The crew finds the cracked seal and verifies the repair.", "Pressure holds, though the repair remains on the inspection list.", "The first seal fails and the zone loses more air before isolation."]),
    response("isolate-pressure-zone", "Isolate the affected zone", { tags: ["zone-isolated"], deferred: [{ afterSteps: 3, crewFatigue: 0.025, message: "The isolated zone forces longer routes and adds work to every watch." }] }, ["The doors hold and atmosphere loss stops.", "Isolation controls the leak but restricts access to the room.", "A delayed door closure costs additional atmosphere before the zone seals."])
  ]),
  event("fabrication-defect", "engineering", "Fabrication defect", "Inspection finds voids in a newly fabricated batch of maintenance parts.", "cargo-fabrication", ["engineering"], [
    response("recycle-batch", "Recycle and rebuild the batch", { roles: ["engineering"], requires: { resources: { feedstockKg: 20, powerMWh: 0.3 } }, cost: { feedstockKg: 20, powerMWh: 0.3 }, repair: { fabrication: 0.08 }, tags: ["fabrication-batch-rebuilt"] }, ["The rebuilt parts pass inspection.", "Most of the batch is recovered, with a smaller usable yield.", "The second run exposes a calibration problem in the fabricator."]),
    response("reserve-good-parts", "Keep only the parts that pass inspection", { cost: { maintenanceKg: 10 }, tags: ["maintenance-stock-reduced"] }, ["The crew identifies a small set of trustworthy parts.", "The inspection protects quality but cuts the maintenance reserve.", "A hidden defect slips through and threatens a later repair."])
  ]),
  event("load-shed-recovery", "engineering", "Cascading load-shed recovery", "A transient fault trips several secondary buses and leaves systems restarting out of order.", "power-control", ["engineering", "life-support"], [
    response("staged-restart", "Restart each bus in a controlled sequence", { roles: ["engineering", "life-support"], repair: { power: 0.14, "life-support": 0.04 }, tags: ["staged-power-recovery"] }, ["Each bus returns without another trip.", "Most systems return, but one laboratory bus remains offline.", "An early restart retriggers the protection system and extends the outage."]),
    response("protect-critical-loads", "Hold critical loads and defer the rest", { tags: ["secondary-buses-deferred"], deferred: [{ afterSteps: 2, systemId: "fabrication", delta: -0.04, message: "The deferred fabrication bus develops a calibration drift before restart." }] }, ["Life support, navigation, and medical remain stable.", "Critical systems hold while the deferred-work list grows.", "A supposedly noncritical load proves necessary to another recovery task."])
  ]),
  event("crew-fatigue", "crew", "Accumulated fatigue", "Medical reports slower reaction times and rising errors across the active watch.", "medical", ["medical", "command"], [
    response("rotate-watch", "Stand down the tired watch", { roles: ["command"], fatigue: -0.07, tags: ["watch-rotation-protected"] }, ["The rested watch takes over cleanly.", "The rotation helps, though coverage is thin for several hours.", "The handoff is rushed and one task loses continuity."]),
    response("medical-support", "Use medical support and shorten the watch", { roles: ["medical"], requires: { resources: { medicalUnits: 2 } }, cost: { medicalUnits: 2 }, fatigue: -0.05, tags: ["fatigue-medically-supported"] }, ["The crew recovers without losing critical coverage.", "Symptoms improve, but the next rest period remains mandatory.", "Support masks the worst symptoms without fixing the workload."])
  ]),
  event("minor-injury", "crew", "Minor crew injury", "A crew member strains a shoulder while securing equipment after a maneuver.", "medical", ["medical"], [
    response("treat-and-rest", "Treat the injury and assign rest", { roles: ["medical"], requires: { resources: { medicalUnits: 1 } }, cost: { medicalUnits: 1 }, fatigue: -0.025, tags: ["injury-treated"] }, ["Treatment works and the crew member returns on a limited schedule.", "The injury improves but restricts heavy work for the next watch.", "Pain persists and another crew member must cover the assignment."]),
    response("restricted-duty", "Move the crew member to restricted duty", { fatigue: 0.01, tags: ["restricted-duty"], deferred: [{ afterSteps: 2, crewFatigue: 0.02, message: "Restricted duty leaves the remaining watch carrying extra work." }] }, ["The new assignment protects the injury without losing coverage.", "The watch adapts, but several tasks take longer.", "Thin coverage pushes another crew member toward exhaustion."])
  ]),
  event("exercise-deconditioning", "crew", "Deconditioning warning", "Exercise records show that two crew members are falling below the mission target.", "exercise-bay", ["medical"], [
    response("restore-schedule", "Restore the full exercise schedule", { roles: ["medical"], cost: { powerMWh: 0.16, waterKg: 1 }, fatigue: -0.025, tags: ["exercise-schedule-restored"] }, ["The crew completes the missed sessions and recovery improves.", "The schedule returns with a modest cost to other work.", "A crowded schedule adds fatigue before the benefit appears."]),
    response("short-resistance-blocks", "Use shorter resistance blocks during watches", { fatigue: -0.012, tags: ["exercise-blocks-adopted"] }, ["Short sessions fit the watch schedule and stop the decline.", "The compromise slows the decline but does not fully reverse it.", "Inconsistent sessions fail to correct the problem."])
  ]),
  event("watch-coverage-gap", "crew", "Watch coverage gap", "A repair, a medical restriction, and scheduled rest leave one watch without full role coverage.", "briefing", ["command"], [
    response("cross-assign-crew", "Cross-assign qualified crew", { roles: ["command"], fatigue: 0.018, tags: ["watch-cross-assigned"] }, ["The revised roster restores coverage with manageable fatigue.", "Coverage returns, but the next watch inherits unfinished work.", "The reassignment solves one gap and creates another."]),
    response("defer-routine-work", "Defer routine work until the next watch", { tags: ["routine-work-deferred"], deferred: [{ afterSteps: 2, systemId: "hull", delta: -0.025, message: "Deferred inspection work allows minor wear to go unnoticed." }] }, ["Critical work continues and the backlog stays controlled.", "The backlog grows but remains visible to the next watch.", "A deferred check hides a developing fault."])
  ]),
  event("water-contamination", "crew", "Water-recovery contamination", "The recovery loop detects an organic load above its normal treatment range.", "hygiene-waste", ["life-support", "medical"], [
    response("sterilize-loop", "Sterilize and flush the loop", { roles: ["life-support"], cost: { waterKg: 12, powerMWh: 0.22 }, repair: { "life-support": 0.12 }, tags: ["water-loop-sterilized"] }, ["The flush clears the contamination and the reserve remains safe.", "The loop returns to service with a reduced water margin.", "The first sterilization cycle fails and consumes extra water."]),
    response("isolate-and-ration", "Isolate the loop and ration clean water", { cost: { waterKg: 4 }, fatigue: 0.02, tags: ["water-rationing"], deferred: [{ afterSteps: 2, crewFatigue: 0.025, message: "Water rationing increases fatigue and lowers morale." }] }, ["Rationing protects the clean reserve until service is possible.", "The reserve holds, though hygiene and exercise are reduced.", "The isolation is incomplete and part of the reserve must be discarded."])
  ]),
  event("crop-cycle-problem", "crew", "Crop-cycle problem", "Hydroponics shows uneven growth and falling nutrient uptake in one crop rack.", "hydroponics", ["life-support", "science"], [
    response("rebalance-crop", "Rebalance light, water, and nutrients", { roles: ["life-support", "science"], cost: { waterKg: 3, powerMWh: 0.12 }, repair: { "food-production": 0.12 }, tags: ["crop-cycle-rebalanced"] }, ["The crop rack resumes steady growth.", "Most plants recover, but the harvest will be smaller.", "The adjustment arrives too late for part of the crop."]),
    response("harvest-early", "Harvest the viable plants early", { cost: { foodKg: 5 }, tags: ["crop-harvested-early"] }, ["The crew saves a useful portion of the crop.", "The early harvest prevents a total loss but reduces future variety.", "More of the crop is lost during processing than expected."])
  ]),
  event("morale-strain", "crew", "Isolation and morale strain", "The crew briefing reveals frayed communication and growing withdrawal between watches.", "galley-wardroom", ["command", "medical"], [
    response("shared-meal", "Hold a shared meal and open briefing", { requires: { resources: { foodKg: 8, waterKg: 3 } }, cost: { foodKg: 8, waterKg: 3 }, fatigue: -0.035, tags: ["crew-cohesion-restored"] }, ["The crew resolves two tensions and leaves with a common plan.", "The meal helps, though one disagreement remains unsettled.", "The discussion exposes deeper strain and needs follow-up."]),
    response("private-check-ins", "Schedule private check-ins by watch", { roles: ["medical", "command"], fatigue: -0.018, tags: ["crew-check-ins"] }, ["The check-ins surface problems before they become conflicts.", "Several crew members respond well while others remain guarded.", "The schedule feels formal and fails to reach the most isolated crew member."])
  ]),
  event("faint-system-contact", "science", "Faint system contact", "Long-range sensors separate a dim star and several orbiting bodies from the background.", "sensor-control", ["science", "navigation"], [
    response("wide-survey", "Run a wide survey", { roles: ["science"], cost: { powerMWh: 0.5 }, contact: "survey", tags: ["contact-wide-survey"] }, ["The survey fixes the system\u2019s motion and identifies a solid inner world.", "The system is confirmed, though several bodies remain unresolved.", "Interference leaves the contact real but poorly constrained."]),
    response("record-contact", "Record the contact and stay on course", { contact: "detect", tags: ["contact-recorded"] }, ["The contact receives a stable route designation.", "The route record preserves the signal with broad uncertainty.", "The abbreviated record leaves the contact difficult to reacquire."])
  ]),
  event("unusual-spectrum", "science", "Unusual spectrum", "A nearby object shows absorption features that do not fit the first classification.", "analysis-data", ["science"], [
    response("repeat-spectrum", "Repeat the spectrum at higher resolution", { roles: ["science"], cost: { powerMWh: 0.32 }, tags: ["spectrum-resolved"] }, ["The second observation separates mineral, ice, and instrument features.", "The new data narrows the possibilities without a single answer.", "Thermal noise compromises the repeat and the classification stays open."]),
    response("compare-archives", "Compare the signal with the ship archive", { roles: ["science"], tags: ["spectrum-archive-compared"] }, ["The archive reveals a close physical analogue.", "The comparison rules out several explanations.", "No archive match is close enough to resolve the signal."])
  ]),
  event("minor-body-field", "science", "Minor-body field", "The route crosses a loose family of dark minor bodies with varied surface composition.", "sensor-control", ["science", "navigation"], [
    response("map-field", "Map a safe line through the field", { roles: ["science", "navigation"], cost: { powerMWh: 0.28 }, tags: ["minor-field-mapped"] }, ["The map finds a safe line and several worthwhile observations.", "The ship clears the field with a conservative safety margin.", "A poorly constrained object forces an abrupt late correction."]),
    response("sample-one-body", "Divert the local craft to one small body", { roles: ["flight", "science"], cost: { propellantKg: 26 }, contact: "survey", tags: ["minor-body-stop-offered"] }, ["The body becomes a well-constrained local-operation candidate.", "The pass confirms useful material but not a safe landing area.", "The body\u2019s rotation prevents a close approach."])
  ]),
  event("transient-source", "science", "Transient radiation source", "A brief high-energy signal appears off the route and is already fading.", "science", ["science"], [
    response("track-transient", "Give the transient full sensor time", { roles: ["science"], cost: { powerMWh: 0.38 }, tags: ["transient-tracked"] }, ["The ship records the source\u2019s rise, decay, and direction.", "The observation captures the decay but misses the first peak.", "Pointing delay leaves only a weak tail in the record."]),
    response("protect-operations", "Keep sensors on navigation and ship safety", { tags: ["transient-passed"] }, ["The ship protects its current operations while logging the brief signal.", "A low-resolution trace remains useful for the mission archive.", "The source fades before science can establish a reliable direction."])
  ]),
  event("resource-signature", "science", "Geological resource signature", "A surveyed solid world shows mineral signatures relevant to fabrication and repair.", "analysis-data", ["science", "engineering"], [
    response("characterize-deposit", "Characterize the deposit and landing uncertainty", { roles: ["science", "engineering"], cost: { powerMWh: 0.35 }, contact: "offer-stop", tags: ["resource-deposit-characterized"] }, ["The crew identifies a bounded landing region and a credible material estimate.", "The world remains a useful stop, but the best deposit is not fully constrained.", "The signal proves patchy and the stop carries significant uncertainty."]),
    response("retain-estimate", "Keep the preliminary estimate", { contact: "detect", tags: ["resource-estimate-preliminary"] }, ["The estimate remains in the route record for later use.", "The contact is preserved with a wide resource range.", "The weak estimate may not be enough to justify a later diversion."])
  ]),
  event("conflicting-observation", "science", "Conflicting observation", "Two instruments report different sizes and compositions for the same body.", "analysis-data", ["science"], [
    response("independent-follow-up", "Run an independent follow-up", { roles: ["science"], cost: { powerMWh: 0.26 }, tags: ["observation-reconciled"] }, ["The follow-up identifies a calibration bias and reconciles the data.", "The disagreement narrows to one unresolved property.", "A new inconsistency leaves the object less certain than before."]),
    response("preserve-uncertainty", "Preserve both results and move on", { tags: ["observation-unresolved"], deferred: [{ afterSteps: 2, systemId: "sensors", delta: -0.02, message: "The unresolved observation complicates a later targeting solution." }] }, ["The archive clearly records both results and their uncertainty.", "The record is honest but offers little help to later planning.", "The unresolved discrepancy is mistaken for a targeting error later."])
  ]),
  event("particle-strike", "hazard", "High-velocity particle strike", "A small particle hits the forward shielding. Pressure is stable, but the impact site is hot.", "engineering", ["engineering"], [
    response("inspect-and-patch", "Inspect and patch the shielding", { roles: ["engineering"], requires: { resources: { maintenanceKg: 24 } }, cost: { maintenanceKg: 24 }, repair: { hull: 0.15 }, tags: ["shield-patched"] }, ["The crew finds a shallow crater and restores the outer layers.", "The patch protects the pressure hull but needs later inspection.", "Hidden delamination makes the repair larger than the first scan suggested."]),
    response("isolate-and-monitor", "Isolate the nearby zone and monitor it", { tags: ["impact-zone-isolated"], deferred: [{ afterSteps: 2, systemId: "hull", delta: -0.04, unlessTag: "shield-patched", message: "The unpatched impact site begins to shed material under thermal cycling." }] }, ["Isolation contains the risk until a safer work period.", "The zone remains stable but unavailable.", "Thermal cycling worsens the damaged outer layer."])
  ]),
  event("radiation-front", "hazard", "Radiation front", "Particle monitors detect an approaching radiation front along the current route.", "storm-shelter", ["navigation", "medical"], [
    response("take-shelter", "Secure the ship and take shelter", { fatigue: 0.012, tags: ["radiation-shelter-used"] }, ["The water-lined shelter keeps crew exposure low.", "The crew remains safe, though the long shelter period adds fatigue.", "A rushed shutdown leaves several systems needing recovery afterward."]),
    response("alter-course", "Burn around the strongest region", { roles: ["navigation", "flight"], requires: { resources: { propellantKg: 36 } }, cost: { propellantKg: 36 }, tags: ["radiation-diversion"] }, ["The diversion avoids the strongest particle flux.", "The ship skirts the front with a narrow margin.", "The front expands during the maneuver and the crew still shelters briefly."])
  ]),
  event("debris-region", "hazard", "Dust and debris region", "The route ahead contains fine dust and intermittent larger echoes.", "bridge", ["navigation", "science"], [
    response("slow-and-scan", "Reduce speed and scan a path", { roles: ["navigation", "science"], cost: { powerMWh: 0.24, foodKg: 1.5, waterKg: 1 }, tags: ["debris-path-mapped"] }, ["The ship crosses on a well-mapped path.", "The slower crossing avoids major impacts but adds time.", "Several false returns force repeated course corrections."]),
    response("shielded-crossing", "Cross behind the forward shield", { damage: { hull: 0.045 }, tags: ["shielded-debris-crossing"] }, ["The shield takes only superficial dust erosion.", "Repeated small impacts reduce the shield margin.", "A larger fragment strikes near an earlier repair."])
  ]),
  event("charged-interference", "hazard", "Charged-particle interference", "A changing plasma environment disrupts communications, sensors, and fine control.", "communications", ["science", "navigation"], [
    response("retune-arrays", "Retune communications and sensors", { roles: ["science", "navigation"], cost: { powerMWh: 0.2 }, repair: { sensors: 0.08, navigation: 0.03 }, tags: ["arrays-retuned"] }, ["The arrays regain stable tracking through the interference.", "Tracking returns with reduced range.", "The retune trades one interference band for another."]),
    response("inertial-watch", "Hold an inertial watch until it passes", { tags: ["inertial-watch"], deferred: [{ afterSteps: 1, systemId: "navigation", delta: -0.02, message: "The inertial-only interval adds uncertainty to the route solution." }] }, ["The ship holds steady until normal sensors return.", "The watch preserves safety with a small navigation uncertainty.", "The interference lasts longer than forecast and strains the inertial solution."])
  ]),
  event("close-star-thermal-stress", "hazard", "Close-star thermal stress", "A planned stellar pass is heating the forward hull and radiator loop faster than expected.", "thermal-control", ["engineering", "navigation"], [
    response("widen-pass", "Widen the stellar pass", { roles: ["navigation"], cost: { propellantKg: 28 }, tags: ["stellar-pass-widened"] }, ["The wider line restores comfortable thermal margin.", "Temperatures fall slowly but remain controlled.", "The correction begins late and the hull absorbs extra heat."]),
    response("maximize-cooling", "Hold course and maximize cooling", { roles: ["engineering"], cost: { powerMWh: 0.42 }, repair: { thermal: 0.04 }, damage: { hull: 0.025 }, tags: ["maximum-cooling-used"] }, ["The thermal loop carries the peak without exceeding limits.", "The ship holds course with little remaining thermal margin.", "One radiator section saturates and heats the forward structure."])
  ]),
  event("resource-world-diversion", "stop", "Optional resource-world diversion", "A surveyed world can supply repair feedstock, but the diversion will cost time and propellant.", "briefing", ["command", "navigation", "science"], [
    response("mark-resource-stop", "Add the world as a local-operation stop", { requires: { tags: ["resource-deposit-characterized"] }, contact: "mark-stop", cost: { propellantKg: 20 }, tags: ["resource-stop-authorized"] }, ["Navigation adds a bounded approach and the craft team begins planning.", "The stop is added with a conservative landing uncertainty.", "The approach remains possible, but the resource estimate is weaker than hoped."]),
    response("remain-on-course", "Remain on the primary route", { tags: ["resource-stop-declined"] }, ["The ship protects its arrival margin and retains the contact.", "The contact remains available for a future Expedition.", "The decision preserves the route but leaves maintenance reserves tight."])
  ], { requiresTags: ["resource-deposit-characterized"], weight: 1.5 }),
  event("emergency-repair-landing", "stop", "Emergency repair landing", "A degrading ship system needs material or a stable work period that the current leg cannot provide.", "briefing", ["command", "engineering", "science"], [
    response("prepare-repair-landing", "Prepare the local craft and landing plan", { contact: "mark-stop", cost: { propellantKg: 24 }, tags: ["emergency-landing-authorized"] }, ["The crew identifies a solid body and prepares a bounded landing operation.", "A viable site is found with strict weather and terrain limits.", "The first site is rejected and the approach must remain on hold."]),
    response("attempt-shipboard-repair", "Attempt another shipboard repair", { roles: ["engineering"], requires: { resources: { maintenanceKg: 18 } }, cost: { maintenanceKg: 18 }, repair: { thermal: 0.06, power: 0.04, hull: 0.03 }, tags: ["shipboard-repair-extended"] }, ["The repair buys enough margin to continue.", "The temporary repair holds but remains a later risk.", "The repair consumes parts without removing the underlying fault."])
  ], { requiresTags: ["maintenance-stock-reduced"] }),
  event("modeled-salvage", "stop", "Unidentified debris cluster", "Sensors resolve an old modeled object and a loose debris field outside the primary route.", "sensor-control", ["science", "engineering"], [
    response("remote-inspection", "Inspect it remotely before approaching", { roles: ["science"], cost: { powerMWh: 0.24 }, contact: "survey", tags: ["salvage-remotely-inspected"] }, ["The inspection identifies stable debris and several unsafe fragments.", "The object remains unidentified but its motion is well constrained.", "Interference hides the most important part of the debris field."]),
    response("close-salvage-pass", "Make a close salvage pass", { roles: ["flight", "engineering"], cost: { propellantKg: 16 }, damage: { hull: 0.02 }, tags: ["salvage-pass-made"] }, ["The crew recovers a small amount of usable feedstock without contact.", "The pass recovers little but records the object in detail.", "A fragment strikes the shield during withdrawal."])
  ]),
  event("distress-contact", "stop", "Distress contact", "A bounded signal reports a disabled craft with failing power and uncertain position.", "communications", ["command", "navigation", "engineering"], [
    response("assist-contact", "Divert to assist", { roles: ["navigation", "engineering"], cost: { propellantKg: 34, powerMWh: 0.3, maintenanceKg: 12 }, tags: ["distress-assist"] }, ["Solis Reach reaches the craft and stabilizes its power system.", "The crew provides supplies and a safe navigation solution from a distance.", "The contact\u2019s position error turns the rescue into a costly search."]),
    response("remote-guidance", "Send remote repair and navigation guidance", { roles: ["engineering", "navigation"], cost: { powerMWh: 0.12 }, tags: ["distress-guidance"] }, ["The remote procedure restores enough power for the craft to reach safety.", "The contact regains partial control and continues at reduced capability.", "Signal loss interrupts the repair before power is stable."]),
    response("record-and-decline", "Record the contact and continue", { tags: ["distress-declined"], fatigue: 0.01 }, ["The captain records the decision and preserves the primary mission.", "The crew accepts the decision, though morale is unsettled.", "The unresolved contact weighs on the crew through the next watch."])
  ])
]);
var VOYAGE_EVENT_BY_ID = Object.freeze(Object.fromEntries(VOYAGE_EVENT_FAMILIES.map((entry) => [entry.id, entry])));
var VOYAGE_EVENT_COUNTS = Object.freeze(VOYAGE_EVENT_FAMILIES.reduce((counts, entry) => ({ ...counts, [entry.category]: (counts[entry.category] || 0) + 1 }), {}));

// app/js/expedition/voyage-director.js?v=2
var VOYAGE_SLOTS = Object.freeze([
  Object.freeze({ id: "departure", progress: 0.04, category: "navigation", forceEventId: "departure-handoff", phase: "departure-watch" }),
  Object.freeze({ id: "early-crew", progress: 0.1, category: "crew", phase: "early-cruise" }),
  Object.freeze({ id: "early-engineering", progress: 0.17, category: "engineering", phase: "early-cruise" }),
  Object.freeze({ id: "first-science", progress: 0.25, category: "science", phase: "survey-watch" }),
  Object.freeze({ id: "first-hazard", progress: 0.33, category: "hazard", phase: "deep-cruise" }),
  Object.freeze({ id: "course-development", progress: 0.41, category: "navigation", phase: "deep-cruise" }),
  Object.freeze({ id: "systems-development", progress: 0.49, category: "engineering", phase: "systems-watch" }),
  Object.freeze({ id: "long-watch", progress: 0.57, category: "crew", phase: "long-watch" }),
  Object.freeze({ id: "route-discovery", progress: 0.65, category: "science", phase: "survey-leg" }),
  Object.freeze({ id: "route-change", progress: 0.73, category: "stop", phase: "route-decision" }),
  Object.freeze({ id: "late-hazard", progress: 0.81, category: "hazard", phase: "late-cruise" }),
  Object.freeze({ id: "late-systems", progress: 0.87, category: "engineering", phase: "late-cruise" }),
  Object.freeze({ id: "arrival-science", progress: 0.92, category: "science", phase: "approach-survey" }),
  Object.freeze({ id: "final-approach", progress: 0.96, category: "navigation", forceEventId: "final-approach", phase: "approach" })
]);
var FORCED_EVENT_IDS = Object.freeze(new Set(VOYAGE_SLOTS.map((slot) => slot.forceEventId).filter(Boolean)));
var EVENT_ONSET = Object.freeze({
  "coolant-pump-wear": Object.freeze({ thermal: -0.18 }),
  "power-converter-loss": Object.freeze({ power: -0.14, thermal: -0.03 }),
  "injector-imbalance": Object.freeze({ propulsion: -0.14 }),
  "radiator-obstruction": Object.freeze({ thermal: -0.13 }),
  "attitude-control-wear": Object.freeze({ propulsion: -0.07, navigation: -0.04 }),
  "pressure-zone-leak": Object.freeze({ hull: -0.1, "life-support": -0.08 }),
  "fabrication-defect": Object.freeze({ fabrication: -0.08 }),
  "load-shed-recovery": Object.freeze({ power: -0.12 }),
  "water-contamination": Object.freeze({ "life-support": -0.12 }),
  "crop-cycle-problem": Object.freeze({ "food-production": -0.14 }),
  "particle-strike": Object.freeze({ hull: -0.15 }),
  "debris-region": Object.freeze({ hull: -0.05 }),
  "charged-interference": Object.freeze({ sensors: -0.08, navigation: -0.04 }),
  "close-star-thermal-stress": Object.freeze({ thermal: -0.12, hull: -0.04 })
});
function clone2(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function hashText(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash >>> 0;
}
function conditionStatus(condition) {
  const value = Math.max(0, Math.min(1, Number(condition) || 0));
  return value < 0.25 ? "critical" : value < 0.55 ? "degraded" : value < 0.85 ? "operational" : "optimal";
}
function createVoyageDirector(expeditionIdentity = {}) {
  const seed = hashText(`${expeditionIdentity.id || "expedition"}:${expeditionIdentity.destinationId || "unknown"}:${expeditionIdentity.createdAtMs || 0}`);
  return Object.freeze({
    version: 1,
    seed,
    step: 0,
    nextSlotIndex: 0,
    encounteredIds: Object.freeze([]),
    cooldowns: Object.freeze({}),
    tags: Object.freeze({}),
    history: Object.freeze([]),
    deferredConsequences: Object.freeze([])
  });
}
function normalizeVoyageDirector(expedition) {
  const defaults = createVoyageDirector(expedition);
  const source = expedition?.voyageDirector || {};
  return Object.freeze({
    ...defaults,
    ...source,
    seed: Number.isInteger(source.seed) ? source.seed : defaults.seed,
    step: Math.max(0, Number(source.step) || 0),
    nextSlotIndex: Math.max(0, Number(source.nextSlotIndex) || 0),
    encounteredIds: Object.freeze([...source.encounteredIds || []]),
    cooldowns: Object.freeze({ ...source.cooldowns || {} }),
    tags: Object.freeze({ ...source.tags || {} }),
    history: Object.freeze([...source.history || []]),
    deferredConsequences: Object.freeze([...source.deferredConsequences || []])
  });
}
function hasRoles(expedition, roles = []) {
  if (!roles.length) return true;
  const available = new Set((expedition?.crew || []).filter((member) => member.status !== "dead").flatMap((member) => member.roles || []));
  return roles.every((role) => available.has(role));
}
function availabilityForResponse(expedition, eventDefinition, option) {
  const requires = option.effects?.requires || {};
  const director = normalizeVoyageDirector(expedition);
  const missingRoles = (requires.roles || option.effects?.roles || []).filter((role) => !hasRoles(expedition, [role]));
  if (missingRoles.length) return Object.freeze({ enabled: false, reason: `Requires crew coverage: ${missingRoles.join(", ")}.` });
  for (const [key, minimum] of Object.entries(requires.resources || {})) {
    if (Number(expedition?.resources?.[key] || 0) < Number(minimum)) return Object.freeze({ enabled: false, reason: `Requires ${minimum} ${key.replaceAll(/([A-Z])/g, " $1").toLowerCase()}.` });
  }
  for (const [key, minimum] of Object.entries(requires.systems || {})) {
    if (Number(expedition?.systems?.[key]?.condition || 0) < Number(minimum)) return Object.freeze({ enabled: false, reason: `${key.replaceAll("-", " ")} is not stable enough.` });
  }
  for (const tag of requires.tags || []) {
    if (!director.tags[tag]) return Object.freeze({ enabled: false, reason: "The required earlier survey or decision is not in the voyage record." });
  }
  return Object.freeze({ enabled: true, reason: "" });
}
function eventIsEligible(expedition, definition) {
  const director = normalizeVoyageDirector(expedition);
  if (director.encounteredIds.includes(definition.id)) return false;
  if (Number(director.cooldowns[definition.id] || 0) > director.step) return false;
  if (definition.incompatibleTags.some((tag) => director.tags[tag])) return false;
  if (definition.requiresTags.some((tag) => !director.tags[tag])) return false;
  return definition.choices.some((choice) => availabilityForResponse(expedition, definition, choice).enabled);
}
function selectWeighted(expedition, candidates, slot) {
  const director = normalizeVoyageDirector(expedition);
  const totalWeight = candidates.reduce((sum, entry) => sum + Number(entry.weight || 1), 0);
  let cursor = hashText(`${director.seed}:${slot.id}:${director.step}:${director.history.length}`) / 4294967295 * totalWeight;
  for (const candidate of candidates) {
    cursor -= Number(candidate.weight || 1);
    if (cursor <= 0) return candidate;
  }
  return candidates.at(-1) || null;
}
function selectVoyageEvent(expedition, slot) {
  if (slot.forceEventId && eventIsEligible(expedition, VOYAGE_EVENT_BY_ID[slot.forceEventId])) return VOYAGE_EVENT_BY_ID[slot.forceEventId];
  if (slot.category === "stop" && !(expedition.routeContacts || []).some((contact) => ["available", "returned"].includes(contact.localOperationState))) {
    const surveyStop = VOYAGE_EVENT_BY_ID["modeled-salvage"];
    if (eventIsEligible(expedition, surveyStop)) return surveyStop;
  }
  const eligible = VOYAGE_EVENT_FAMILIES.filter((entry) => !FORCED_EVENT_IDS.has(entry.id) && eventIsEligible(expedition, entry));
  const preferred = eligible.filter((entry) => entry.category === slot.category);
  return selectWeighted(expedition, preferred.length ? preferred : eligible, slot);
}
function stableContact(expedition, familyId) {
  const seed = hashText(`${expedition.id}:${expedition.destinationId}:${familyId}`);
  const suffix = String(seed % 997).padStart(3, "0");
  const profiles = [
    { spectralClass: "M dwarf", worldClass: "cold rocky world", resource: "silicate and metal-bearing regolith" },
    { spectralClass: "K dwarf", worldClass: "dry highland world", resource: "hydrated minerals and metal oxides" },
    { spectralClass: "dim red dwarf", worldClass: "tidally influenced rocky world", resource: "basaltic feedstock and volatile-bearing deposits" },
    { spectralClass: "faint binary", worldClass: "airless fractured moon", resource: "nickel-iron and ceramic feedstock" }
  ];
  const profile = profiles[seed % profiles.length];
  return Object.freeze({
    id: `${expedition.id}-contact-${suffix}`,
    designation: `Survey Contact ${suffix}`,
    truthClass: "modeled-uncharted-system",
    stableSeed: seed,
    spectralClass: profile.spectralClass,
    worldClass: profile.worldClass,
    resourceSignature: profile.resource,
    status: "detected",
    localOperationState: "unvisited"
  });
}
function createDirectedEvent(expedition, slot) {
  const definition = selectVoyageEvent(expedition, slot);
  if (!definition) return null;
  const director = normalizeVoyageDirector(expedition);
  const systems = clone2(expedition.systems || {});
  for (const [systemId, delta] of Object.entries(EVENT_ONSET[definition.id] || {})) {
    if (!systems[systemId]) continue;
    systems[systemId].condition = Math.max(0, Math.min(1, Number(systems[systemId].condition || 0) + Number(delta)));
    systems[systemId].status = conditionStatus(systems[systemId].condition);
  }
  const options = definition.choices.map((choice) => Object.freeze({
    id: choice.id,
    label: choice.label,
    ...availabilityForResponse({ ...expedition, systems, voyageDirector: director }, definition, choice)
  }));
  const enabledChoices = options.filter((option) => option.enabled).map((option) => option.id);
  const nextDirector = Object.freeze({ ...director, nextSlotIndex: director.nextSlotIndex + 1 });
  return Object.freeze({
    systems: Object.freeze(systems),
    voyageDirector: nextDirector,
    voyagePhase: slot.phase,
    pendingEvent: Object.freeze({
      id: `${expedition.id}:${definition.id}:${director.step}`,
      familyId: definition.id,
      slotId: slot.id,
      kind: definition.category,
      title: definition.title,
      message: definition.evidence,
      roomId: definition.roomId,
      responsibleRoles: definition.roles,
      choices: Object.freeze(enabledChoices),
      options: Object.freeze(options)
    }),
    eventFlags: Object.freeze({ ...expedition.eventFlags || {}, [definition.id]: true }),
    logEntry: Object.freeze({ atMissionS: expedition.strategicElapsedS, kind: definition.category, message: definition.title })
  });
}
function crewCapability(expedition, roles) {
  const relevant = (expedition.crew || []).filter((member) => member.status !== "dead" && (roles || []).some((role) => member.roles?.includes(role)));
  if (!relevant.length) return 0.3;
  return relevant.reduce((sum, member) => {
    const health = Number(member.health ?? 1);
    const fatigue = Number(member.fatigue || 0);
    const experience = Math.min(0.12, Number(member.experienceYears || 0) / 100);
    return sum + Math.max(0.12, health * (1 - fatigue * 0.65) + experience);
  }, 0) / relevant.length;
}
function systemCapability(expedition, definition) {
  const onsetSystems = Object.keys(EVENT_ONSET[definition.id] || {});
  const ids = onsetSystems.length ? onsetSystems : Object.keys(expedition.systems || {});
  if (!ids.length) return 0.7;
  return ids.reduce((sum, id) => sum + Number(expedition.systems?.[id]?.condition ?? 0.7), 0) / ids.length;
}
function resolveBand(expedition, definition, option) {
  const director = normalizeVoyageDirector(expedition);
  const roll = hashText(`${director.seed}:${definition.id}:${option.id}:${director.step}`) / 4294967295;
  const roles = option.effects?.roles?.length ? option.effects.roles : definition.roles;
  const score = crewCapability(expedition, roles) * 0.5 + systemCapability(expedition, definition) * 0.32 + roll * 0.18 - (expedition.survival === "severe" ? 0.07 : 0);
  return score >= 0.72 ? "success" : score >= 0.48 ? "partial" : "setback";
}
function applyContactEffect(expedition, contacts, definition, effect) {
  if (!effect) return;
  let contact = [...contacts].reverse().find((entry) => entry.localOperationState !== "completed");
  if (!contact) {
    contact = clone2(stableContact(expedition, definition.id));
    contacts.push(contact);
  }
  if (effect === "survey") {
    contact.status = "surveyed";
    contact.localOperationState = "available";
  }
  if (effect === "offer-stop") {
    contact.status = "surveyed";
    contact.localOperationState = "available";
  }
  if (effect === "mark-stop") {
    contact.status = "route-stop";
    contact.localOperationState = "available";
  }
}
function resolveDirectedEvent(expedition, choiceId) {
  const pending = expedition?.pendingEvent;
  const definition = VOYAGE_EVENT_BY_ID[pending?.familyId];
  const option = definition?.choices.find((entry) => entry.id === choiceId);
  if (!pending || !definition || !option || !pending.choices.includes(choiceId)) return null;
  const availability = availabilityForResponse(expedition, definition, option);
  if (!availability.enabled) return null;
  const band = resolveBand(expedition, definition, option);
  const effects = option.effects || {};
  const resources = clone2(expedition.resources || {});
  const systems = clone2(expedition.systems || {});
  const crew = clone2(expedition.crew || []);
  const contacts = clone2(expedition.routeContacts || []);
  const director = normalizeVoyageDirector(expedition);
  const tags = { ...director.tags };
  const factor = band === "success" ? 1 : band === "partial" ? 0.55 : 0.2;
  const damageFactor = band === "success" ? 0.18 : band === "partial" ? 0.55 : 1;
  for (const [key, amount] of Object.entries(effects.cost || {})) resources[key] = Math.max(0, Number(resources[key] || 0) - Number(amount));
  for (const [systemId, amount] of Object.entries(effects.repair || {})) {
    if (!systems[systemId]) continue;
    systems[systemId].condition = Math.min(1, Number(systems[systemId].condition || 0) + Number(amount) * factor);
  }
  for (const [systemId, amount] of Object.entries(effects.damage || {})) {
    if (!systems[systemId]) continue;
    systems[systemId].condition = Math.max(0, Number(systems[systemId].condition || 0) - Number(amount) * damageFactor);
  }
  if (band === "setback") {
    const fallbackSystem = Object.keys(EVENT_ONSET[definition.id] || {})[0];
    if (fallbackSystem && systems[fallbackSystem]) systems[fallbackSystem].condition = Math.max(0, Number(systems[fallbackSystem].condition || 0) - 0.035);
  }
  Object.values(systems).forEach((system) => {
    system.status = conditionStatus(system.condition);
  });
  crew.forEach((member) => {
    member.fatigue = Math.max(0, Math.min(1, Number(member.fatigue || 0) + Number(effects.fatigue || 0) * (band === "setback" ? 1.35 : 1)));
    if ((effects.roles || definition.roles).some((role) => member.roles?.includes(role))) member.experienceYears = Number(member.experienceYears || 0) + (band === "success" ? 0.02 : 0.01);
  });
  for (const tag of effects.tags || []) tags[tag] = true;
  applyContactEffect(expedition, contacts, definition, effects.contact);
  const deferred = [...director.deferredConsequences, ...(effects.deferred || []).map((entry) => Object.freeze({ ...entry, sourceEventId: definition.id, dueStep: director.step + Number(entry.afterSteps || 1) }))];
  const message = option.results[band === "success" ? 0 : band === "partial" ? 1 : 2];
  const historyEntry = Object.freeze({
    eventId: pending.id,
    familyId: definition.id,
    slotId: pending.slotId,
    choiceId,
    outcome: band,
    atMissionS: expedition.strategicElapsedS,
    tagsAdded: Object.freeze([...effects.tags || []])
  });
  const nextDirector = Object.freeze({
    ...director,
    step: director.step + 1,
    encounteredIds: Object.freeze([...director.encounteredIds, definition.id]),
    cooldowns: Object.freeze({ ...director.cooldowns, [definition.id]: director.step + Number(definition.cooldownSteps || 4) }),
    tags: Object.freeze(tags),
    history: Object.freeze([...director.history, historyEntry]),
    deferredConsequences: Object.freeze(deferred)
  });
  return Object.freeze({
    pendingEvent: null,
    resources: Object.freeze(resources),
    systems: Object.freeze(systems),
    crew: Object.freeze(crew.map((member) => Object.freeze(member))),
    routeContacts: Object.freeze(contacts.map((contact) => Object.freeze(contact))),
    voyageDirector: nextDirector,
    outcome: band,
    logEntry: Object.freeze({ atMissionS: expedition.strategicElapsedS, kind: definition.category, message })
  });
}
function applyDueConsequences(expedition) {
  const director = normalizeVoyageDirector(expedition);
  const due = director.deferredConsequences.filter((entry) => Number(entry.dueStep) <= director.step && (!entry.unlessTag || !director.tags[entry.unlessTag]));
  if (!due.length) return null;
  const resources = clone2(expedition.resources || {});
  const systems = clone2(expedition.systems || {});
  const crew = clone2(expedition.crew || []);
  for (const entry of due) {
    if (entry.systemId && systems[entry.systemId]) {
      systems[entry.systemId].condition = Math.max(0, Math.min(1, Number(systems[entry.systemId].condition || 0) + Number(entry.delta || 0)));
      systems[entry.systemId].status = conditionStatus(systems[entry.systemId].condition);
    }
    if (entry.resourceKey) resources[entry.resourceKey] = Math.max(0, Number(resources[entry.resourceKey] || 0) + Number(entry.delta || 0));
    if (entry.crewFatigue) crew.forEach((member) => {
      member.fatigue = Math.min(1, Number(member.fatigue || 0) + Number(entry.crewFatigue));
    });
  }
  const dueSet = new Set(due);
  return Object.freeze({
    resources: Object.freeze(resources),
    systems: Object.freeze(systems),
    crew: Object.freeze(crew.map((member) => Object.freeze(member))),
    voyageDirector: Object.freeze({ ...director, deferredConsequences: Object.freeze(director.deferredConsequences.filter((entry) => !dueSet.has(entry))) }),
    logEntries: Object.freeze(due.map((entry) => Object.freeze({ atMissionS: expedition.strategicElapsedS, kind: "consequence", message: entry.message })))
  });
}
function nextVoyageSlot(expedition) {
  return VOYAGE_SLOTS[normalizeVoyageDirector(expedition).nextSlotIndex] || null;
}

// app/js/expedition/long-duration.js?v=1
var CRYOGENIC_RESERVE = Object.freeze([
  Object.freeze({ id: "reserve-engineer", name: "Samira Holt", ageYears: 37, experienceYears: 12, health: 0.97, fatigue: 0, assignment: "cryogenic-reserve", roles: Object.freeze(["engineering", "fabrication"]), status: "cryogenic" }),
  Object.freeze({ id: "reserve-medical", name: "Leon Ibarra", ageYears: 40, experienceYears: 15, health: 0.98, fatigue: 0, assignment: "cryogenic-reserve", roles: Object.freeze(["medical", "life-support"]), status: "cryogenic" }),
  Object.freeze({ id: "reserve-navigation", name: "Rin Okoye", ageYears: 35, experienceYears: 10, health: 0.99, fatigue: 0, assignment: "cryogenic-reserve", roles: Object.freeze(["navigation", "command"]), status: "cryogenic" })
]);
function clone3(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function createLongDurationState(shipProfileId) {
  if (shipProfileId === "cryogenic-expedition-vessel") return Object.freeze({
    kind: "cryogenic",
    truthClass: "speculative-human-torpor",
    reserveCrew: CRYOGENIC_RESERVE,
    wakeCost: Object.freeze({ medicalUnits: 3, powerMWh: 2, recoveryDays: 3 }),
    wakeHistory: Object.freeze([]),
    suspendedMetabolicFraction: 0.18
  });
  if (shipProfileId === "generation-ship") return Object.freeze({
    kind: "generation",
    truthClass: "bounded-generation-voyage-model",
    population: 4e4,
    capacity: 4e4,
    foundingPopulation: 4e4,
    generationIndex: 0,
    cohortYears: 25,
    originalCrewStatus: "active",
    roleContinuity: 1,
    knowledgePreservation: 1,
    trainingReserve: 1,
    transitions: Object.freeze([]),
    uncertainty: "Population viability estimates vary widely; this game model uses a large safety population and does not store individual genetic data."
  });
  return Object.freeze({ kind: "standard", truthClass: "crew-voyage-model" });
}
function crewPopulationForShip(shipProfileId, activeCrewCount) {
  if (shipProfileId === "generation-ship") return 4e4;
  if (shipProfileId === "cryogenic-expedition-vessel") return Math.max(1, Number(activeCrewCount) || 0) + CRYOGENIC_RESERVE.length;
  return Math.max(1, Number(activeCrewCount) || 0);
}
function successorCrew(generationIndex, previousCrew = []) {
  return Object.freeze((previousCrew || []).map((member, index) => Object.freeze({
    ...member,
    id: `successor-g${generationIndex}-${index + 1}`,
    name: `Generation ${generationIndex} ${String(member.roles?.[0] || "crew").replaceAll("-", " ")}`,
    ageYears: 28 + index % 12,
    experienceYears: 8 + index % 9,
    health: 0.96,
    fatigue: Math.min(0.18, Number(member.fatigue || 0.08)),
    assignment: member.assignment || `${member.roles?.[0] || "general"}-watch`,
    status: "active",
    predecessorId: member.id
  })));
}
function advanceLongDurationState(expedition, deltaS) {
  const state = expedition?.longDuration;
  if (!state || state.kind === "standard") return Object.freeze({
    longDuration: state || createLongDurationState(expedition?.ship?.profileId),
    crew: expedition?.crew || [],
    resources: expedition?.resources || {},
    logEntries: Object.freeze([])
  });
  const years = Math.max(0, Number(deltaS) || 0) / JULIAN_YEAR_S;
  const resources = clone3(expedition.resources || {});
  const logEntries = [];
  if (state.kind === "cryogenic") {
    const next2 = clone3(state);
    next2.reserveCrew = next2.reserveCrew.map((member) => member.status === "cryogenic" ? { ...member, ageYears: Number(member.ageYears || 0) + years * 0.04 } : member);
    return Object.freeze({ longDuration: Object.freeze(next2), crew: expedition.crew, resources: Object.freeze(resources), logEntries: Object.freeze(logEntries) });
  }
  const next = clone3(state);
  const totalYears = Math.max(0, Number(expedition.strategicElapsedS || 0));
  const generationIndex = Math.floor(totalYears / JULIAN_YEAR_S / next.cohortYears);
  const educationCondition = Math.max(0, Math.min(1, Number(expedition.systems?.education?.condition ?? 1)));
  const lifeSupportCondition = Math.max(0, Math.min(1, Number(expedition.systems?.["life-support"]?.condition ?? 1)));
  next.knowledgePreservation = Math.max(0, Math.min(1, Number(next.knowledgePreservation || 0) - years * (1 - educationCondition) * 6e-3));
  next.roleContinuity = Math.max(0, Math.min(1, next.knowledgePreservation * educationCondition));
  next.population = Math.max(0, Math.min(next.capacity, Math.round(Number(next.population || 0) * (1 - years * Math.max(0, 0.96 - lifeSupportCondition) * 8e-4))));
  let crew = expedition.crew;
  if (generationIndex > Number(next.generationIndex || 0)) {
    for (let index = Number(next.generationIndex || 0) + 1; index <= generationIndex; index += 1) {
      next.transitions.push({ generationIndex: index, atMissionS: Number(expedition.strategicElapsedS) || 0, population: next.population, knowledgePreservation: next.knowledgePreservation });
    }
    next.generationIndex = generationIndex;
    if (generationIndex >= 2 && next.originalCrewStatus === "active") {
      next.originalCrewStatus = "retired";
      crew = successorCrew(generationIndex, expedition.crew);
      logEntries.push(Object.freeze({ atMissionS: Number(expedition.strategicElapsedS) || 0, kind: "crew-succession", message: `Generation ${generationIndex} assumed the active ship watches with ${Math.round(next.roleContinuity * 100)}% role continuity.` }));
    } else if (generationIndex >= 2) {
      crew = successorCrew(generationIndex, expedition.crew);
      logEntries.push(Object.freeze({ atMissionS: Number(expedition.strategicElapsedS) || 0, kind: "crew-succession", message: `Generation ${generationIndex} completed the scheduled watch transition.` }));
    }
  }
  return Object.freeze({ longDuration: Object.freeze(next), crew, resources: Object.freeze(resources), logEntries: Object.freeze(logEntries) });
}
function wakeReserveSpecialist(expedition, reserveId = null) {
  const state = expedition?.longDuration;
  if (state?.kind !== "cryogenic") return Object.freeze({ expedition, changed: false, message: "This ship has no cryogenic reserve crew." });
  const resources = clone3(expedition.resources || {});
  const cryogenicCondition = Number(expedition.systems?.cryogenic?.condition ?? 0);
  if (cryogenicCondition < 0.25) return Object.freeze({ expedition, changed: false, message: "Cryogenic support is not stable enough for a controlled wake cycle." });
  if (Number(resources.medicalUnits || 0) < state.wakeCost.medicalUnits || Number(resources.powerMWh || 0) < state.wakeCost.powerMWh) {
    return Object.freeze({ expedition, changed: false, message: `Wake cycle requires ${state.wakeCost.medicalUnits} medical units and ${state.wakeCost.powerMWh} MWh.` });
  }
  const missingRoles = /* @__PURE__ */ new Set();
  const activeRoles = new Set((expedition.crew || []).filter((member) => member.status !== "dead").flatMap((member) => member.roles || []));
  ["engineering", "medical", "life-support", "navigation", "command"].forEach((role) => {
    if (!activeRoles.has(role)) missingRoles.add(role);
  });
  const reserve = state.reserveCrew.find((member) => member.status === "cryogenic" && (reserveId ? member.id === reserveId : (member.roles || []).some((role) => missingRoles.has(role)))) || state.reserveCrew.find((member) => member.status === "cryogenic" && (!reserveId || member.id === reserveId));
  if (!reserve) return Object.freeze({ expedition, changed: false, message: "No matching reserve specialist remains in cryogenic suspension." });
  resources.medicalUnits -= state.wakeCost.medicalUnits;
  resources.powerMWh -= state.wakeCost.powerMWh;
  const awakened = Object.freeze({ ...reserve, status: "active", assignment: `${reserve.roles[0]}-recovery`, fatigue: 0.3, health: Math.max(0.75, Number(reserve.health || 1) - 0.04) });
  const nextState = Object.freeze({
    ...state,
    reserveCrew: Object.freeze(state.reserveCrew.map((member) => Object.freeze(member.id === reserve.id ? { ...member, status: "awakened" } : { ...member }))),
    wakeHistory: Object.freeze([...state.wakeHistory || [], Object.freeze({ crewId: reserve.id, atMissionS: Number(expedition.strategicElapsedS) || 0, medicalUnits: state.wakeCost.medicalUnits, powerMWh: state.wakeCost.powerMWh })])
  });
  const message = `${reserve.name} completed a controlled wake cycle and joined the ${reserve.roles[0].replaceAll("-", " ")} watch.`;
  return Object.freeze({
    expedition: Object.freeze({
      ...expedition,
      crew: Object.freeze([...expedition.crew || [], awakened]),
      resources: Object.freeze(resources),
      longDuration: nextState,
      log: Object.freeze([...expedition.log || [], Object.freeze({ atMissionS: Number(expedition.strategicElapsedS) || 0, kind: "cryogenic-wake", message })])
    }),
    changed: true,
    message
  });
}
function reinforceGenerationTraining(expedition) {
  const state = expedition?.longDuration;
  if (state?.kind !== "generation") return Object.freeze({ expedition, changed: false, message: "This is not a generation voyage." });
  if (Number(expedition.resources?.powerMWh || 0) < 0.4) return Object.freeze({ expedition, changed: false, message: "Training archive session requires 0.4 MWh." });
  const resources = Object.freeze({ ...expedition.resources, powerMWh: Number(expedition.resources.powerMWh) - 0.4 });
  const longDuration = Object.freeze({ ...state, knowledgePreservation: Math.min(1, Number(state.knowledgePreservation || 0) + 0.025), trainingReserve: Math.min(1, Number(state.trainingReserve || 0) + 0.015) });
  const message = "The next watch completed a cross-role training and archive validation session.";
  return Object.freeze({ expedition: Object.freeze({ ...expedition, resources, longDuration, log: Object.freeze([...expedition.log || [], Object.freeze({ atMissionS: Number(expedition.strategicElapsedS) || 0, kind: "crew-training", message })]) }), changed: true, message });
}

// app/js/space/craft-identity.js?v=1
var SPACE_CRAFT_IDENTITY = Object.freeze({
  starship: Object.freeze({
    id: "solis-reach",
    name: "Solis Reach",
    role: "Long-range exploration starship"
  }),
  pod: Object.freeze({
    id: "pathfinder-pod",
    name: "Pathfinder",
    role: "Surface and orbital transfer pod"
  }),
  navigation: Object.freeze({
    id: "wayfinder-navigation",
    name: "Wayfinder",
    role: "Course planning and flight guidance"
  })
});

// app/js/expedition/model.js?v=12
var EXPEDITION_SCHEMA_VERSION = 1;
var RESOURCE_KEYS = Object.freeze([
  "foodKg",
  "waterKg",
  "powerMWh",
  "propellantKg",
  "medicalUnits",
  "maintenanceKg",
  "feedstockKg",
  "scienceCargoKg",
  "processingResidueKg"
]);
function clone4(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function crewRoleCoverage(crew = []) {
  const coverage = /* @__PURE__ */ new Map();
  for (const member of crew) {
    if (!member || member.status === "dead") continue;
    for (const role of member.roles || []) coverage.set(role, (coverage.get(role) || 0) + 1);
  }
  return coverage;
}
function recommendedResources(expected, margin = 0.2) {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Number(expected[key] || 0) * (1 + margin)]));
}
function totalCargoMass(resources) {
  return RESOURCE_KEYS.reduce((sum, key) => {
    if (key === "powerMWh" || key === "medicalUnits" || key === "propellantKg") return sum;
    return sum + Math.max(0, Number(resources?.[key]) || 0);
  }, 0);
}
function assessExpeditionReadiness({ ship, propulsion, crew, crewPopulation = null, resources, calculation }) {
  const failures = [];
  const warnings = [];
  if (!ship || !String(ship.releaseStatus || "").startsWith("playable-")) failures.push("This ship is not available in the current Expedition slice.");
  if (!propulsion?.crewedInterstellarEligible) failures.push("This propulsion system cannot support a crewed interstellar route.");
  if (ship && propulsion && !ship.supportedPropulsionIds.includes(propulsion.id)) failures.push("The selected propulsion system does not fit this ship.");
  const population = Number.isFinite(Number(crewPopulation)) ? Number(crewPopulation) : crew?.length || 0;
  if (population < Number(ship?.minCrew || 1)) failures.push(`At least ${ship?.minCrew || 1} crew members are required.`);
  if (population > Number(ship?.maxCrew || 0)) failures.push(`This ship supports no more than ${ship?.maxCrew || 0} crew members.`);
  const coverage = crewRoleCoverage(crew);
  for (const role of ship?.requiredRoles || []) {
    if (!coverage.has(role)) failures.push(`Crew coverage is missing: ${role}.`);
    else if (coverage.get(role) === 1) warnings.push(`Only one crew member covers ${role}.`);
  }
  for (const key of RESOURCE_KEYS) {
    const available = Math.max(0, Number(resources?.[key]) || 0);
    const expected = Math.max(0, Number(calculation?.expectedResources?.[key]) || 0);
    if (available + 1e-9 < expected) failures.push(`${key} is below the route forecast.`);
    else if (available < expected * 1.15) warnings.push(`${key} has less than a 15% reserve.`);
  }
  if (ship && totalCargoMass(resources) > ship.cargoCapacityKg) failures.push("Provisioned cargo exceeds ship capacity.");
  if (ship && Number(resources?.propellantKg || 0) > ship.propellantCapacityKg) failures.push("Propulsion resource exceeds the ship tank capacity.");
  return Object.freeze({
    status: failures.length ? "insufficient" : warnings.length ? "marginal" : "ready",
    failures: Object.freeze(failures),
    warnings: Object.freeze(warnings),
    roleCoverage: Object.freeze(Object.fromEntries(coverage))
  });
}
function createExpeditionPlan({
  destinationId,
  shipId = "long-range-research-vessel",
  propulsionId = "radiant-plasma-field-drive",
  crew = [],
  resources = null,
  reserveMargin = null,
  realism = "science-inspired",
  survival = "forgiving",
  createdAtMs = Date.now(),
  id = `expedition-${createdAtMs}`
}) {
  const ship = getShipProfile(shipId);
  const propulsion = getPropulsionProfile(propulsionId);
  const crewPopulation = crewPopulationForShip(shipId, crew.length);
  const calculation = calculateExpeditionTravel({ destinationId, ship, propulsion, crewCount: crewPopulation });
  const selectedReserveMargin = Math.max(0, Math.min(0.4, reserveMargin != null && Number.isFinite(Number(reserveMargin)) ? Number(reserveMargin) : survival === "severe" ? 0.08 : 0.15));
  const provisioned = resources ? clone4(resources) : recommendedResources(calculation.expectedResources, selectedReserveMargin);
  if (!resources && ship) {
    provisioned.propellantKg = Math.min(Number(provisioned.propellantKg || 0), Number(ship.propellantCapacityKg || 0));
  }
  const readiness = assessExpeditionReadiness({ ship, propulsion, crew, crewPopulation, resources: provisioned, calculation });
  const systems = Object.fromEntries((ship?.systems || []).map((systemId) => [systemId, { condition: 1, status: "optimal" }]));
  return Object.freeze({
    type: "InterstellarExpedition",
    schemaVersion: EXPEDITION_SCHEMA_VERSION,
    id,
    createdAtMs,
    updatedAtMs: createdAtMs,
    originId: "sol",
    destinationId,
    realism,
    survival,
    reserveMargin: selectedReserveMargin,
    state: "planned",
    ship: Object.freeze({
      id: `${id}-ship`,
      profileId: shipId,
      name: shipId === "generation-ship" ? "Continuance" : shipId === "cryogenic-expedition-vessel" ? "Vigil" : SPACE_CRAFT_IDENTITY.starship.name,
      interiorSeed: ship?.interiorSeed || 0
    }),
    propulsionId,
    crewPopulation,
    crew: Object.freeze(clone4(crew)),
    longDuration: createLongDurationState(shipId),
    resources: Object.freeze(provisioned),
    systems: Object.freeze(systems),
    calculation,
    readiness,
    strategicElapsedS: 0,
    progress: 0,
    pendingEvent: null,
    voyagePhase: "departure",
    voyageDirector: createVoyageDirector({ id, destinationId, createdAtMs }),
    eventFlags: Object.freeze({}),
    activeEncounter: null,
    encounterHistory: Object.freeze([]),
    operationFlags: Object.freeze({}),
    routeContacts: Object.freeze([]),
    activeLocalContactId: null,
    localOperation: null,
    podJourney: null,
    scienceSamples: Object.freeze([]),
    materialLedger: Object.freeze({ installedRepairKg: 0 }),
    outposts: Object.freeze([]),
    discoveries: Object.freeze([]),
    log: Object.freeze([{ atMissionS: 0, kind: "planned", message: `Expedition planned for ${destinationId}.` }]),
    failureChain: Object.freeze([]),
    failureReport: null
  });
}
function withExpeditionChanges(expedition, changes) {
  return Object.freeze({ ...expedition, ...changes, updatedAtMs: Number(changes.updatedAtMs) || Date.now() });
}

// app/js/expedition/failure-authority.js?v=3
var ESSENTIAL_SYSTEMS = Object.freeze(["life-support", "power", "propulsion"]);
var THRESHOLDS = Object.freeze([
  Object.freeze({ id: "degraded", condition: 0.55 }),
  Object.freeze({ id: "critical", condition: 0.25 }),
  Object.freeze({ id: "offline", condition: 1e-3 })
]);
function freezeChain(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}
function appendSystemTransitions(chain = [], beforeSystems = {}, afterSystems = {}, atMissionS = 0) {
  const next = chain.map((entry) => ({ ...entry }));
  for (const [systemId, current] of Object.entries(afterSystems || {})) {
    const before = Number(beforeSystems?.[systemId]?.condition ?? 1);
    const after = Math.max(0, Number(current?.condition ?? 0));
    for (const threshold of THRESHOLDS) {
      if (before > threshold.condition && after <= threshold.condition) {
        const id = `${systemId}:${threshold.id}:${Math.round(Number(atMissionS) || 0)}`;
        next.push({
          id,
          systemId,
          stage: threshold.id,
          status: "active",
          atMissionS: Number(atMissionS) || 0,
          causeId: next.filter((entry) => entry.systemId === systemId && entry.status === "active").at(-1)?.id || null,
          message: `${systemId.replaceAll("-", " ")} became ${threshold.id}.`
        });
      }
    }
  }
  return freezeChain(next);
}
function resolveSystemFailure(chain = [], systemId, condition, atMissionS = 0, message = "") {
  const thresholdByStage = Object.fromEntries(THRESHOLDS.map((entry) => [entry.id, entry.condition]));
  const next = chain.map((entry) => entry.systemId === systemId && entry.status === "active" && Number(condition) > Number(thresholdByStage[entry.stage] ?? 1) ? { ...entry, status: "resolved", resolvedAtMissionS: Number(atMissionS) || 0 } : { ...entry });
  next.push({
    id: `${systemId}:recovered:${Math.round(Number(atMissionS) || 0)}:${next.length}`,
    systemId,
    stage: "recovered",
    status: "resolved",
    atMissionS: Number(atMissionS) || 0,
    condition: Number(condition) || 0,
    causeId: next.filter((entry) => entry.systemId === systemId).at(-1)?.id || null,
    message: message || `${systemId.replaceAll("-", " ")} recovered to ${Math.round((Number(condition) || 0) * 100)}%.`
  });
  return freezeChain(next);
}
function repairCapacity(expedition) {
  const resources = expedition?.resources || {};
  const systems = expedition?.systems || {};
  const engineeringCrew = (expedition?.crew || []).some((member) => member.status !== "dead" && (member.roles || []).includes("engineering"));
  const directParts = Number(resources.maintenanceKg || 0) >= 12;
  const fabricatable = Number(resources.feedstockKg || 0) >= 25 && Number(resources.powerMWh || 0) >= 0.35 && Number(systems.fabrication?.condition ?? 1) >= 0.25;
  return Object.freeze({ engineeringCrew, directParts, fabricatable, available: engineeringCrew && (directParts || fabricatable) });
}
function assessCausalFailure(expedition) {
  const offline = ESSENTIAL_SYSTEMS.find((id) => Number(expedition?.systems?.[id]?.condition ?? 1) <= 1e-3);
  if (!offline) return null;
  const capacity = repairCapacity(expedition);
  const causes = (expedition?.failureChain || []).filter((entry) => entry.systemId === offline && entry.status === "active");
  if (causes.length < 3 || capacity.available) return null;
  const report = [
    ...causes.map((entry) => entry.message),
    capacity.engineeringCrew ? "No carried or fabricatable repair material remained." : "No active crew member retained engineering coverage.",
    `${offline.replaceAll("-", " ")} could not be recovered.`
  ];
  return Object.freeze({
    systemId: offline,
    atMissionS: Number(expedition?.strategicElapsedS) || 0,
    causes: Object.freeze(report),
    summary: `Solis Reach was lost after ${offline.replaceAll("-", " ")} became unrecoverable.`
  });
}

// app/js/expedition/ship-operations.js?v=7
var STATION_VIEWS = Object.freeze({
  "bridge-flight": Object.freeze({ title: "Flight Controls", systemId: "navigation", summary: "Review heading, velocity, and the margins on the active route." }),
  "bridge-log": Object.freeze({ title: "Captain's Log", systemId: "navigation", summary: "Review the decisions, discoveries, repairs, and milestones recorded for this voyage." }),
  "navigation-course": Object.freeze({ title: "Navigation & Cartography", systemId: "navigation", summary: "Compare the active course with fuel, power, and arrival margins.", actions: ["verify-course"] }),
  "communications-status": Object.freeze({ title: "Mission Communications", systemId: "navigation", summary: "Review outbound reports and the increasing signal delay to home." }),
  "science-survey": Object.freeze({ title: "Physical Sciences", systemId: "sensors", summary: "Record a bounded stellar baseline from the ship\u2019s current position.", actions: ["record-baseline"] }),
  "sensor-scan": Object.freeze({ title: "Sensor Control", systemId: "sensors", summary: "Run a calibrated local scan. Results are observations in the game world, not claims that a real object is present.", actions: ["run-sensor-scan"] }),
  "analysis-review": Object.freeze({ title: "Analysis & Data", systemId: "sensors", summary: "Review collected evidence, provenance, uncertainty, and unresolved observations.", actions: ["approve-processed-sample"] }),
  "briefing-status": Object.freeze({ title: "Crew Briefing", systemId: "navigation", summary: "Review the current watch, resting crew, and the ship\u2019s most urgent system." }),
  "generation-continuity": Object.freeze({ title: "Generation Continuity", systemId: "education", summary: "Review population, role succession, training coverage, and the knowledge archive.", actions: ["train-successors"] }),
  "observation-view": Object.freeze({ title: "Observation Gallery", systemId: "sensors", summary: "Observe local space without changing the ship\u2019s course." }),
  "galley-meal": Object.freeze({ title: "Galley & Wardroom", systemId: "food-production", summary: "Serve a measured crew meal and give the active watch a short recovery period.", actions: ["serve-crew-meal"] }),
  "medical-status": Object.freeze({ title: "Medical Bay", systemId: "medical", summary: "Review crew health, fatigue, and treatment reserves." }),
  "medical-treatment": Object.freeze({ title: "Treatment Station", systemId: "medical", summary: "Treat the crew member with the greatest current need.", actions: ["treat-crew"] }),
  "cryogenic-status": Object.freeze({ title: "Cryogenic Reserve", systemId: "cryogenic", summary: "Review speculative human suspension, reserve specialists, wake risk, and medical support.", actions: ["wake-reserve-specialist"] }),
  "exercise-session": Object.freeze({ title: "Exercise Bay", systemId: "medical", summary: "Complete the crew\u2019s scheduled resistance and cardiovascular session.", actions: ["complete-exercise"] }),
  "quarters-status": Object.freeze({ title: "Crew Quarters", systemId: "life-support", summary: "Review the player\u2019s berth, current assignment, and rest status." }),
  "hygiene-status": Object.freeze({ title: "Water Recovery", systemId: "life-support", summary: "Inspect hygiene loads, stored water, and recovery-loop condition.", actions: ["service-water-loop"] }),
  "life-support-status": Object.freeze({ title: "Life-Support Control", systemId: "life-support", summary: "Review atmosphere, water recovery, and environmental reserves.", actions: ["stabilize-life-support"] }),
  "hydroponics-tend": Object.freeze({ title: "Hydroponics", systemId: "food-production", summary: "Tend the existing crop cycle. This protects food production; it does not create supplies from nothing.", actions: ["tend-crops"] }),
  "storm-shelter-status": Object.freeze({ title: "Storm Shelter", systemId: "hull", summary: "Verify that crew capacity, dosimeters, water, food, and medical stores are positioned for a radiation alert.", actions: ["verify-storm-shelter"] }),
  "engineering-status": Object.freeze({ title: "Main Engineering", systemId: "propulsion", summary: "Review propulsion, power, thermal control, and current maintenance demand." }),
  "engineering-repair": Object.freeze({ title: "Engineering Workbench", systemId: "thermal", summary: "Use maintenance material to repair the ship\u2019s most degraded repairable system.", actions: ["repair-priority-system"] }),
  "power-status": Object.freeze({ title: "Power Control", systemId: "power", summary: "Review generation, storage, and distribution margins.", actions: ["balance-power"] }),
  "thermal-status": Object.freeze({ title: "Thermal Control", systemId: "thermal", summary: "Inspect coolant loops and heat-rejection margins.", actions: ["service-thermal-loop"] }),
  "fabricator-status": Object.freeze({ title: "Fabrication Shop", systemId: "fabrication", summary: "Convert carried feedstock into a bounded batch of maintenance parts.", actions: ["fabricate-parts"] }),
  "cargo-status": Object.freeze({ title: "Cargo Hold", systemId: "hull", summary: "Review carried food, water, feedstock, maintenance parts, and science cargo.", actions: ["load-backpack-materials", "transfer-approved-sample"] }),
  "resource-processor-status": Object.freeze({ title: "Resource Processing", systemId: "fabrication", summary: "Inspect and process samples transferred from a supported surface operation.", actions: ["process-resource-sample"] }),
  "airlock-status": Object.freeze({ title: "EVA Airlock", systemId: "hull", summary: "Inspect suits and airlock readiness. EVA requires a supported local destination operation.", actions: ["verify-eva"] }),
  "craft-bay-status": Object.freeze({ title: "Pod Launch Bay", systemId: "hull", summary: "Choose a surface-capable destination, board the pod, and launch into manual local flight.", actions: ["verify-local-craft"] })
});
var ACTION_LABELS = Object.freeze({
  "verify-course": "Verify course",
  "record-baseline": "Record baseline",
  "run-sensor-scan": "Run local scan",
  "serve-crew-meal": "Serve meal",
  "treat-crew": "Treat crew member",
  "wake-reserve-specialist": "Wake needed specialist",
  "train-successors": "Train next watch",
  "complete-exercise": "Complete session",
  "service-water-loop": "Service recovery loop",
  "stabilize-life-support": "Stabilize life support",
  "tend-crops": "Tend crop cycle",
  "verify-storm-shelter": "Verify shelter",
  "repair-priority-system": "Repair priority system",
  "balance-power": "Balance distribution",
  "service-thermal-loop": "Service thermal loop",
  "fabricate-parts": "Fabricate parts",
  "load-backpack-materials": "Load Backpack materials",
  "approve-processed-sample": "Approve sealed sample",
  "transfer-approved-sample": "Move approved sample to Backpack",
  "process-resource-sample": "Process loaded sample",
  "verify-eva": "Verify EVA readiness",
  "verify-local-craft": "Verify craft readiness"
});
function clone5(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function operationCycle(expedition) {
  return `${expedition?.state || "planned"}:${Math.floor((Number(expedition?.progress) || 0) * 20)}`;
}
function operationKey(expedition, actionId) {
  if (actionId === "process-resource-sample") {
    const sample = (expedition?.scienceSamples || []).find((entry) => entry.processed !== true);
    return `${actionId}:${sample?.id || "none"}`;
  }
  if (actionId === "approve-processed-sample") {
    const sample = (expedition?.scienceSamples || []).find((entry) => entry.processed === true && !entry.recoveryRequirement && entry.analysisApproved !== true && entry.exported !== true);
    return `${actionId}:${sample?.id || "none"}`;
  }
  return `${actionId}:${operationCycle(expedition)}`;
}
function lowestSystem(expedition, allowed = null) {
  const entries = Object.entries(expedition?.systems || {}).filter(([id]) => !allowed || allowed.includes(id));
  entries.sort((a, b) => Number(a[1]?.condition ?? 1) - Number(b[1]?.condition ?? 1));
  return entries[0] || null;
}
function conditionStatus2(condition) {
  const value = Math.max(0, Math.min(1, Number(condition) || 0));
  return value < 0.25 ? "critical" : value < 0.55 ? "degraded" : value < 0.85 ? "operational" : "optimal";
}
function actionAvailability(expedition, actionId) {
  const resources = expedition?.resources || {};
  const used = expedition?.operationFlags?.[operationKey(expedition, actionId)] === true;
  if (actionId === "load-backpack-materials") return Object.freeze({ enabled: true, reason: "Compatible material bundles transfer from the shared Backpack with exact mass." });
  if (actionId === "transfer-approved-sample") {
    const sample = (expedition?.scienceSamples || []).find((entry) => entry.processed === true && entry.analysisApproved === true && !entry.recoveryRequirement && entry.exported !== true);
    return Object.freeze({ enabled: !!sample, reason: sample ? "Transfers one conserved approved lot to the shared Backpack." : "Process and approve a science sample first." });
  }
  if (used) return Object.freeze({ enabled: false, reason: "Completed during this voyage segment." });
  if (actionId === "fabricate-parts" && (Number(resources.feedstockKg) < 25 || Number(resources.powerMWh) < 0.35)) return Object.freeze({ enabled: false, reason: "Requires 25 kg feedstock and 0.35 MWh." });
  if (actionId === "serve-crew-meal" && (Number(resources.foodKg) < 8 || Number(resources.waterKg) < 3)) return Object.freeze({ enabled: false, reason: "Requires 8 kg food and 3 kg water." });
  if (actionId === "treat-crew" && Number(resources.medicalUnits) < 1) return Object.freeze({ enabled: false, reason: "No treatment unit is available." });
  if (actionId === "wake-reserve-specialist") {
    if (expedition?.longDuration?.kind !== "cryogenic") return Object.freeze({ enabled: false, reason: "Available only on a cryogenic mission." });
    if (!(expedition.longDuration.reserveCrew || []).some((member) => member.status === "cryogenic")) return Object.freeze({ enabled: false, reason: "No reserve specialist remains asleep." });
    if (Number(resources.medicalUnits || 0) < 3 || Number(resources.powerMWh || 0) < 2) return Object.freeze({ enabled: false, reason: "Requires 3 medical units and 2 MWh." });
  }
  if (actionId === "train-successors" && expedition?.longDuration?.kind !== "generation") return Object.freeze({ enabled: false, reason: "Available only on a generation voyage." });
  const maintenanceCost = {
    "repair-priority-system": 12,
    "service-water-loop": 5,
    "stabilize-life-support": 8,
    "service-thermal-loop": 8
  }[actionId];
  if (maintenanceCost && Number(resources.maintenanceKg) < maintenanceCost) return Object.freeze({ enabled: false, reason: `Requires ${maintenanceCost} kg of maintenance parts.` });
  if (actionId === "process-resource-sample" && !(expedition?.scienceSamples || []).some((sample) => sample.processed !== true)) {
    return Object.freeze({ enabled: false, reason: "Acquire and transfer a sample from a supported local operation first." });
  }
  if (actionId === "approve-processed-sample" && !(expedition?.scienceSamples || []).some((sample) => sample.processed === true && !sample.recoveryRequirement && sample.analysisApproved !== true && sample.exported !== true)) {
    const approved = (expedition?.scienceSamples || []).some((sample) => sample.processed === true && sample.analysisApproved === true && !sample.recoveryRequirement && sample.exported !== true);
    return Object.freeze({
      enabled: false,
      reason: approved ? "The sealed sample is approved and ready for transfer from the Cargo Hold." : "No processed science sample is awaiting review."
    });
  }
  if (actionId === "verify-local-craft" && expedition?.state !== "arrived") return Object.freeze({ enabled: false, reason: "The craft remains secured during interstellar cruise." });
  return Object.freeze({ enabled: true, reason: "" });
}
function applyShipOperation(expedition, actionId) {
  const availability = actionAvailability(expedition, actionId);
  if (!availability.enabled) return Object.freeze({ expedition, changed: false, message: availability.reason });
  if (actionId === "wake-reserve-specialist" || actionId === "train-successors") {
    const result = actionId === "wake-reserve-specialist" ? wakeReserveSpecialist(expedition) : reinforceGenerationTraining(expedition);
    if (!result.changed) return result;
    return Object.freeze({
      ...result,
      expedition: withExpeditionChanges(result.expedition, {
        operationFlags: Object.freeze({ ...result.expedition.operationFlags || {}, [operationKey(expedition, actionId)]: true })
      })
    });
  }
  const resources = clone5(expedition.resources || {});
  const systems = clone5(expedition.systems || {});
  const crew = clone5(expedition.crew || []);
  const materialLedger = clone5(expedition.materialLedger || { installedRepairKg: 0 });
  const recoveredSystems = [];
  const flags = { ...expedition.operationFlags || {}, [operationKey(expedition, actionId)]: true };
  let message = ACTION_LABELS[actionId] || actionId;
  let kind = "ship-operation";
  const improveSystem = (id, amount, cost = 0) => {
    if (!systems[id]) return;
    const before = Number(systems[id].condition || 0);
    resources.maintenanceKg = Math.max(0, Number(resources.maintenanceKg || 0) - cost);
    materialLedger.installedRepairKg = Math.max(0, Number(materialLedger.installedRepairKg || 0)) + Math.max(0, cost);
    systems[id].condition = Math.min(1, Number(systems[id].condition || 0) + amount);
    systems[id].status = conditionStatus2(systems[id].condition);
    if (systems[id].condition > before) recoveredSystems.push(id);
  };
  if (actionId === "fabricate-parts") {
    resources.feedstockKg -= 25;
    resources.powerMWh -= 0.35;
    resources.maintenanceKg += 18;
    resources.processingResidueKg = Number(resources.processingResidueKg || 0) + 7;
    message = "Fabrication converted 25 kg of feedstock into 18 kg of inspected maintenance parts and retained 7 kg of process residue.";
  } else if (actionId === "serve-crew-meal") {
    resources.foodKg -= 8;
    resources.waterKg -= 3;
    crew.forEach((member) => {
      member.fatigue = Math.max(0, Number(member.fatigue || 0) - 0.035);
    });
    message = "The crew shared a measured meal and the active watch recovered.";
  } else if (actionId === "complete-exercise") {
    crew.forEach((member) => {
      member.fatigue = Math.max(0, Number(member.fatigue || 0) - 0.02);
    });
    message = "The scheduled exercise session was completed.";
  } else if (actionId === "treat-crew") {
    const patient = [...crew].sort((a, b) => Number(a.health ?? 1) - Number(b.health ?? 1) || Number(b.fatigue || 0) - Number(a.fatigue || 0))[0];
    resources.medicalUnits -= 1;
    patient.health = Math.min(1, Number(patient.health ?? 1) + 0.04);
    patient.fatigue = Math.max(0, Number(patient.fatigue || 0) - 0.04);
    message = `${patient.name} received a scheduled treatment.`;
    kind = "medical";
  } else if (actionId === "repair-priority-system") {
    const target = lowestSystem(expedition, ["propulsion", "power", "life-support", "thermal", "medical", "fabrication", "sensors", "hull"]);
    if (target) improveSystem(target[0], 0.08, 12);
    message = target ? `Engineering repaired ${target[0].replaceAll("-", " ")} and verified the work.` : "No repairable system was found.";
    kind = "repair";
  } else if (actionId === "service-water-loop") {
    improveSystem("life-support", 0.035, 5);
    message = "The water-recovery loop was cleaned, resealed, and returned to service.";
  } else if (actionId === "stabilize-life-support") {
    improveSystem("life-support", 0.05, 8);
    resources.powerMWh = Math.max(0, Number(resources.powerMWh || 0) - 0.2);
    message = "Life-support loads were balanced and the environmental loop stabilized.";
  } else if (actionId === "service-thermal-loop") {
    improveSystem("thermal", 0.05, 8);
    message = "The crew serviced the thermal loop and verified coolant flow.";
  } else if (actionId === "balance-power") {
    improveSystem("power", 0.025, 0);
    message = "Nonessential loads were shifted and the power margin was rebalanced.";
  } else if (actionId === "tend-crops") {
    improveSystem("food-production", 0.03, 0);
    resources.waterKg = Math.max(0, Number(resources.waterKg || 0) - 1.5);
    message = "The crew tended the active crop cycle and used 1.5 kg from the water reserve.";
  } else if (actionId === "run-sensor-scan") {
    resources.powerMWh = Math.max(0, Number(resources.powerMWh || 0) - 0.1);
    message = "A calibrated local scan was recorded for later analysis.";
    kind = "science";
  } else if (actionId === "verify-course") {
    improveSystem("navigation", 0.015, 0);
    message = "Navigation verified the active course and arrival margins.";
  } else if (actionId === "verify-storm-shelter") {
    message = "The storm shelter was checked for crew capacity, dosimetry, water, food, and medical access.";
  } else if (actionId === "verify-eva") {
    message = "Suit pressure, oxygen, communications, and airlock seals were verified.";
  } else if (actionId === "verify-local-craft") {
    message = "The local survey craft passed its readiness inspection.";
  } else if (actionId === "record-baseline") {
    message = "A stellar baseline was recorded with the current mission position and instrument state.";
    kind = "science";
  } else if (actionId === "process-resource-sample") {
    const samples = clone5(expedition.scienceSamples || []);
    const sample = samples.find((entry) => entry.processed !== true);
    sample.processed = true;
    sample.processedAtMissionS = Number(expedition.strategicElapsedS) || 0;
    const recovery = sample.recoveryRequirement;
    if (recovery?.kind === "repair-feedstock") {
      const feedstockKg = Math.max(0, Number(recovery.recoveredFeedstockKg || 0));
      const residueKg = Math.max(0, Number(recovery.processingResidueKg || 0));
      if (Math.abs(feedstockKg + residueKg - Number(sample.massKg || 0)) > 1e-9) {
        return Object.freeze({ expedition, changed: false, message: "The sample manifest does not conserve mass." });
      }
      resources.scienceCargoKg = Math.max(0, Number(resources.scienceCargoKg || 0) - Number(sample.massKg || 0));
      resources.feedstockKg = Number(resources.feedstockKg || 0) + feedstockKg;
      resources.processingResidueKg = Number(resources.processingResidueKg || 0) + residueKg;
      sample.outputs = Object.freeze({ feedstockKg, processingResidueKg: residueKg });
      message = `${sample.label} yielded ${feedstockKg} kg of fabrication feedstock and ${residueKg} kg of retained process residue.`;
      kind = "resupply";
    } else {
      message = `${sample.label} was documented, separated, and sealed. Its ${Number(sample.massKg || 0)} kg remains in science cargo.`;
      kind = "science";
    }
    const log2 = Object.freeze([...expedition.log || [], Object.freeze({
      atMissionS: Number(expedition.strategicElapsedS) || 0,
      kind,
      message
    })]);
    const next2 = withExpeditionChanges(expedition, {
      scienceSamples: Object.freeze(samples.map((entry) => Object.freeze(entry))),
      resources: Object.freeze(resources),
      operationFlags: Object.freeze(flags),
      log: log2
    });
    return Object.freeze({ expedition: next2, changed: true, message });
  } else if (actionId === "approve-processed-sample") {
    const samples = clone5(expedition.scienceSamples || []);
    const sample = samples.find((entry) => entry.processed === true && !entry.recoveryRequirement && entry.analysisApproved !== true && entry.exported !== true);
    sample.analysisApproved = true;
    sample.analysisApprovedAtMissionS = Number(expedition.strategicElapsedS) || 0;
    sample.tradeClassification = "approved-game-world-research-sample";
    message = `${sample.label} passed provenance, containment, and science review as an approved game-world research sample.`;
    kind = "science";
    const log2 = Object.freeze([...expedition.log || [], Object.freeze({
      atMissionS: Number(expedition.strategicElapsedS) || 0,
      kind,
      message
    })]);
    const next2 = withExpeditionChanges(expedition, {
      scienceSamples: Object.freeze(samples.map((entry) => Object.freeze(entry))),
      operationFlags: Object.freeze(flags),
      log: log2
    });
    return Object.freeze({ expedition: next2, changed: true, message });
  }
  const log = Object.freeze([...expedition.log || [], Object.freeze({
    atMissionS: Number(expedition.strategicElapsedS) || 0,
    kind,
    message
  })]);
  let failureChain = expedition.failureChain || [];
  recoveredSystems.forEach((systemId) => {
    if (failureChain.some((entry) => entry.systemId === systemId && entry.status === "active")) {
      failureChain = resolveSystemFailure(failureChain, systemId, systems[systemId].condition, expedition.strategicElapsedS, message);
    }
  });
  const next = withExpeditionChanges(expedition, {
    resources: Object.freeze(resources),
    systems: Object.freeze(systems),
    crew: Object.freeze(crew.map((member) => Object.freeze(member))),
    materialLedger: Object.freeze(materialLedger),
    failureChain,
    operationFlags: Object.freeze(flags),
    log
  });
  return Object.freeze({ expedition: next, changed: true, message });
}

// app/js/expedition/hostile-interception.js?v=1
var HOSTILE_ENCOUNTER_TYPE = "HOSTILE_INTERCEPTION";
var PIRATE_INTERCEPTION_ID = "pirate-boarding-interception";
var PIRATE_TRIGGER_SLOT_ID = "long-watch";
var INTERCEPTION_PHASE = Object.freeze({
  INACTIVE: "INACTIVE",
  CONTACT_DETECTED: "CONTACT_DETECTED",
  HOSTILITY_CONFIRMED: "HOSTILITY_CONFIRMED",
  DEFENSE_PREPARATION: "DEFENSE_PREPARATION",
  COMBAT_ACTIVE: "COMBAT_ACTIVE",
  BOARDING_THREAT: "BOARDING_THREAT",
  COMBAT_RESOLVING: "COMBAT_RESOLVING",
  AFTERMATH: "AFTERMATH",
  COMPLETE: "COMPLETE"
});
function clone6(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
function hashText2(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash >>> 0;
}
function conditionStatus3(condition) {
  const value = clamp01(condition);
  return value < 0.25 ? "critical" : value < 0.55 ? "degraded" : value < 0.85 ? "operational" : "optimal";
}
function encounterDifficulty(expedition) {
  const severe = expedition?.survival === "severe";
  const seed = hashText2(`${expedition?.id}:${PIRATE_INTERCEPTION_ID}`);
  return Object.freeze({
    enemyCount: severe ? 6 : 4 + seed % 2,
    boardingDurationS: severe ? 22 : 34,
    enemyAccuracy: severe ? 0.72 : 0.48,
    enemyDamage: severe ? 1.35 : 0.78,
    aimAssist: severe ? 0.42 : 0.72
  });
}
function pirateInterceptionEligible(expedition, slot = null) {
  if (!expedition || expedition.state !== "traveling") return false;
  if (slot && slot.id !== PIRATE_TRIGGER_SLOT_ID) return false;
  if (expedition.pendingEvent || expedition.activeLocalContactId || expedition.failureReport) return false;
  if (expedition.eventFlags?.[PIRATE_INTERCEPTION_ID]) return false;
  if (expedition.activeEncounter && expedition.activeEncounter.phase !== INTERCEPTION_PHASE.COMPLETE) return false;
  if (Number(expedition.progress || 0) < 0.45 || Number(expedition.progress || 0) > 0.78) return false;
  const survivable = ["hull", "power", "propulsion"].every((id) => Number(expedition.systems?.[id]?.condition ?? 1) >= 0.32);
  return survivable && !["departure", "arrival", "approach", "surface", "docking", "mission-loss"].includes(expedition.voyagePhase);
}
function createPirateInterception(expedition, slot) {
  if (!pirateInterceptionEligible(expedition, slot)) return null;
  const director = expedition.voyageDirector || {};
  const seed = hashText2(`${director.seed || expedition.id}:${PIRATE_INTERCEPTION_ID}:${director.step || 0}`);
  const encounter = Object.freeze({
    id: `${expedition.id}:${PIRATE_INTERCEPTION_ID}`,
    type: HOSTILE_ENCOUNTER_TYPE,
    scenarioId: PIRATE_INTERCEPTION_ID,
    phase: INTERCEPTION_PHASE.CONTACT_DETECTED,
    slotId: slot.id,
    seed,
    attempt: 0,
    checkpointPolicy: "restart-combat-from-precombat-state",
    startedAtMissionS: Number(expedition.strategicElapsedS || 0),
    difficulty: encounterDifficulty(expedition),
    objective: "Repel the attackers and stop the boarding craft from reaching Solis Reach.",
    phaseHistory: Object.freeze([INTERCEPTION_PHASE.CONTACT_DETECTED]),
    result: null
  });
  return withExpeditionChanges(expedition, {
    activeEncounter: encounter,
    eventFlags: Object.freeze({ ...expedition.eventFlags || {}, [PIRATE_INTERCEPTION_ID]: true }),
    voyagePhase: "hostile-interception",
    voyageDirector: Object.freeze({
      ...director,
      nextSlotIndex: Number(director.nextSlotIndex || 0) + 1
    }),
    log: Object.freeze([...expedition.log || [], Object.freeze({
      atMissionS: Number(expedition.strategicElapsedS || 0),
      kind: "contact",
      message: "Long-range sensors detected unidentified craft altering course toward Solis Reach."
    })])
  });
}
function transitionPirateInterception(expedition, event2) {
  const encounter = expedition?.activeEncounter;
  if (!encounter || encounter.type !== HOSTILE_ENCOUNTER_TYPE || encounter.phase === INTERCEPTION_PHASE.COMPLETE) return expedition;
  const transitions = {
    confirm_hostility: [INTERCEPTION_PHASE.CONTACT_DETECTED, INTERCEPTION_PHASE.HOSTILITY_CONFIRMED],
    prepare_defense: [INTERCEPTION_PHASE.HOSTILITY_CONFIRMED, INTERCEPTION_PHASE.DEFENSE_PREPARATION],
    begin_combat: [INTERCEPTION_PHASE.DEFENSE_PREPARATION, INTERCEPTION_PHASE.COMBAT_ACTIVE],
    boarding_threat: [INTERCEPTION_PHASE.COMBAT_ACTIVE, INTERCEPTION_PHASE.BOARDING_THREAT]
  };
  const [from, to] = transitions[event2] || [];
  if (encounter.phase !== from || !to) return expedition;
  return withExpeditionChanges(expedition, {
    activeEncounter: Object.freeze({
      ...encounter,
      phase: to,
      attempt: to === INTERCEPTION_PHASE.COMBAT_ACTIVE ? Number(encounter.attempt || 0) + 1 : encounter.attempt,
      phaseHistory: Object.freeze([...encounter.phaseHistory || [], to])
    })
  });
}
function normalizedCombatResult(result = {}) {
  const outcome = ["repelled", "boarded", "defensive-craft-disabled"].includes(result.outcome) ? result.outcome : "defensive-craft-disabled";
  return Object.freeze({
    outcome,
    enemiesRepelled: Math.max(0, Math.min(6, Math.round(Number(result.enemiesRepelled) || 0))),
    enemiesDestroyed: Math.max(0, Math.min(6, Math.round(Number(result.enemiesDestroyed) || 0))),
    boardingPrevented: result.boardingPrevented === true,
    boardingProgress: clamp01(result.boardingProgress),
    pathfinderCondition: clamp01(result.pathfinderCondition),
    solisReachHitCount: Math.max(0, Math.min(30, Math.round(Number(result.solisReachHitCount) || 0))),
    elapsedS: Math.max(1, Math.min(600, Number(result.elapsedS) || 1))
  });
}
function resolvePirateInterception(expedition, input = {}) {
  const encounter = expedition?.activeEncounter;
  if (!encounter || ![INTERCEPTION_PHASE.COMBAT_ACTIVE, INTERCEPTION_PHASE.BOARDING_THREAT].includes(encounter.phase)) return expedition;
  const result = normalizedCombatResult(input);
  const boarded = result.outcome === "boarded" || result.boardingPrevented === false;
  const disabled = result.outcome === "defensive-craft-disabled";
  const severe = expedition.survival === "severe";
  const hitPressure = Math.min(1, result.solisReachHitCount / (severe ? 9 : 13));
  const consequence = boarded ? 1 : disabled ? 0.72 : 0.32 + hitPressure * 0.32;
  const systems = clone6(expedition.systems || {});
  const damage = {
    hull: 0.035 + consequence * 0.12,
    power: 0.018 + consequence * 0.07,
    sensors: 0.025 + consequence * 0.08,
    propulsion: boarded ? 0.095 : consequence * 0.035
  };
  for (const [id, amount] of Object.entries(damage)) {
    if (!systems[id]) continue;
    systems[id].condition = clamp01(Number(systems[id].condition ?? 1) - amount * (severe ? 1.18 : 1));
    systems[id].status = conditionStatus3(systems[id].condition);
  }
  const resources = clone6(expedition.resources || {});
  resources.powerMWh = Math.max(0, Number(resources.powerMWh || 0) - (boarded ? 1.1 : 0.45 + hitPressure * 0.35));
  resources.maintenanceKg = Math.max(0, Number(resources.maintenanceKg || 0) - (boarded ? 34 : disabled ? 22 : 8 + hitPressure * 12));
  resources.medicalUnits = Math.max(0, Number(resources.medicalUnits || 0) - (boarded ? 3 : disabled ? 1 : 0));
  const crew = clone6(expedition.crew || []).map((member, index) => {
    const affected = boarded ? index > 0 && index <= 2 : disabled ? index === 6 : false;
    return Object.freeze({
      ...member,
      health: clamp01(Number(member.health ?? 1) - (affected ? severe ? 0.12 : 0.07 : 0)),
      fatigue: clamp01(Number(member.fatigue || 0) + (boarded ? 0.08 : 0.035)),
      status: affected ? "injured" : member.status
    });
  });
  const summary = boarded ? "Pirates breached an outer service lock before ship security contained the boarding party." : disabled ? "Pathfinder was disabled; Solis Reach security forced the attackers to disengage after taking damage." : "Pathfinder broke the attack formation and forced the surviving pirate craft to retreat.";
  let next = withExpeditionChanges(expedition, {
    systems: Object.freeze(systems),
    resources: Object.freeze(resources),
    crew: Object.freeze(crew),
    failureChain: appendSystemTransitions(expedition.failureChain, expedition.systems, systems, expedition.strategicElapsedS),
    voyagePhase: "combat-aftermath",
    activeEncounter: Object.freeze({
      ...encounter,
      phase: INTERCEPTION_PHASE.AFTERMATH,
      phaseHistory: Object.freeze([...encounter.phaseHistory || [], INTERCEPTION_PHASE.COMBAT_RESOLVING, INTERCEPTION_PHASE.AFTERMATH]),
      result: Object.freeze({ ...result, summary, boarded, systemsDamaged: Object.freeze(Object.keys(damage)) })
    }),
    log: Object.freeze([...expedition.log || [], Object.freeze({
      atMissionS: Number(expedition.strategicElapsedS || 0),
      kind: "hostile-interception",
      message: `${summary} ${result.enemiesDestroyed} hostile craft destroyed; ${result.enemiesRepelled} total repelled.`
    })])
  });
  const failure = assessCausalFailure(next);
  if (failure) next = withExpeditionChanges(next, {
    state: "failed",
    voyagePhase: "mission-loss",
    failureReport: failure,
    log: Object.freeze([...next.log || [], Object.freeze({ atMissionS: next.strategicElapsedS, kind: "mission-loss", message: failure.summary })])
  });
  return next;
}
function completePirateAftermath(expedition) {
  const encounter = expedition?.activeEncounter;
  if (!encounter || encounter.phase !== INTERCEPTION_PHASE.AFTERMATH) return expedition;
  const director = expedition.voyageDirector || {};
  const historyEntry = Object.freeze({
    eventId: encounter.id,
    familyId: encounter.scenarioId,
    slotId: encounter.slotId,
    choiceId: "direct-defense",
    outcome: encounter.result?.outcome || "resolved",
    atMissionS: Number(expedition.strategicElapsedS || 0),
    tagsAdded: Object.freeze(["hostile-interception-resolved"])
  });
  return withExpeditionChanges(expedition, {
    activeEncounter: Object.freeze({
      ...encounter,
      phase: INTERCEPTION_PHASE.COMPLETE,
      completedAtMissionS: Number(expedition.strategicElapsedS || 0),
      phaseHistory: Object.freeze([...encounter.phaseHistory || [], INTERCEPTION_PHASE.COMPLETE])
    }),
    encounterHistory: Object.freeze([...expedition.encounterHistory || [], Object.freeze({
      id: encounter.id,
      scenarioId: encounter.scenarioId,
      type: encounter.type,
      result: encounter.result,
      completedAtMissionS: Number(expedition.strategicElapsedS || 0)
    })]),
    voyageDirector: Object.freeze({
      ...director,
      step: Number(director.step || 0) + 1,
      encounteredIds: Object.freeze([.../* @__PURE__ */ new Set([...director.encounteredIds || [], encounter.scenarioId])]),
      tags: Object.freeze({ ...director.tags || {}, hostileInterceptionResolved: true }),
      history: Object.freeze([...director.history || [], historyEntry])
    }),
    voyagePhase: expedition.state === "failed" ? "mission-loss" : "long-watch-recovery",
    log: Object.freeze([...expedition.log || [], Object.freeze({
      atMissionS: Number(expedition.strategicElapsedS || 0),
      kind: "course-restored",
      message: expedition.state === "failed" ? "The hostile-interception record was sealed in the Captain\u2019s Log." : "Damage control stabilized Solis Reach and the Expedition resumed its original course."
    })])
  });
}

// app/js/expedition/simulation.js?v=9
function clone7(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function appendLog(log, entry) {
  return Object.freeze([...log || [], Object.freeze(entry)]);
}
function appendLogs(log, entries) {
  return Object.freeze([...log || [], ...(entries || []).map((entry) => Object.freeze(entry))]);
}
function startExpedition(expedition, atMs = Date.now()) {
  if (!expedition || expedition.state !== "planned") return expedition;
  if (expedition.readiness.status === "insufficient") throw new Error("The Expedition is not ready to depart.");
  return withExpeditionChanges(expedition, {
    state: "traveling",
    voyagePhase: "departure",
    departedAtMs: atMs,
    updatedAtMs: atMs,
    log: appendLog(expedition.log, { atMissionS: 0, kind: "departure", message: `${expedition.ship?.name || "Solis Reach"} departed the Solar System.` })
  });
}
function resourceDemandMultipliers(expedition) {
  const systems = expedition?.systems || {};
  const crew = expedition?.crew || [];
  const condition = (id) => Math.max(0.05, Math.min(1, Number(systems[id]?.condition ?? 1)));
  const averageFatigue = crew.length ? crew.reduce((sum, member) => sum + Number(member.fatigue || 0), 0) / crew.length : 0;
  const averageHealth = crew.length ? crew.reduce((sum, member) => sum + Number(member.health ?? 1), 0) / crew.length : 1;
  const survivalPressure = expedition?.survival === "severe" ? 1.1 : 1;
  const wearPressure = Object.values(systems).length ? 1 + Object.values(systems).reduce((sum, system) => sum + Math.max(0, 1 - Number(system?.condition ?? 1)), 0) / Object.values(systems).length * 0.6 : 1;
  return Object.freeze({
    foodKg: survivalPressure * (1 + averageFatigue * 0.08 + (1 - condition("food-production")) * 0.28),
    waterKg: survivalPressure * (1 + (1 - condition("life-support")) * 0.42),
    powerMWh: 1 + (1 - condition("power")) * 0.24 + (1 - condition("thermal")) * 0.16,
    propellantKg: 1 + (1 - condition("propulsion")) * 0.32 + (1 - condition("navigation")) * 0.12,
    medicalUnits: 1 + Math.max(0, 1 - averageHealth) * 0.8 + averageFatigue * 0.12,
    maintenanceKg: wearPressure,
    feedstockKg: 1 + (wearPressure - 1) * 0.45,
    processingResidueKg: 1
  });
}
function consumeResources(expedition, deltaS, totalS) {
  const resources = expedition.resources;
  const expectedResources = expedition.calculation.expectedResources;
  const next = clone7(resources);
  const fraction = totalS > 0 ? deltaS / totalS : 0;
  const multipliers = resourceDemandMultipliers(expedition);
  for (const key of RESOURCE_KEYS) {
    if (key === "scienceCargoKg") continue;
    next[key] = Math.max(0, Number(next[key] || 0) - Number(expectedResources?.[key] || 0) * fraction * Number(multipliers[key] || 1));
  }
  return Object.freeze(next);
}
function conditionStatus4(condition) {
  const value = Math.max(0, Math.min(1, Number(condition) || 0));
  return value < 0.25 ? "critical" : value < 0.55 ? "degraded" : value < 0.85 ? "operational" : "optimal";
}
function degradeSystems(systems, deltaS, totalS) {
  const next = clone7(systems);
  const fraction = totalS > 0 ? deltaS / totalS : 0;
  for (const [id, system] of Object.entries(next)) {
    const wearRate = id === "hull" ? 0.08 : id === "life-support" ? 0.12 : 0.1;
    system.condition = Math.max(0, Number(system.condition || 0) - wearRate * fraction);
    system.status = conditionStatus4(system.condition);
  }
  return Object.freeze(next);
}
function advanceCrew(crew, deltaS, systems = {}) {
  const years = Math.max(0, Number(deltaS) || 0) / JULIAN_YEAR_S;
  const lifeSupportCondition = Math.max(0, Math.min(1, Number(systems["life-support"]?.condition ?? 1)));
  const medicalCondition = Math.max(0, Math.min(1, Number(systems.medical?.condition ?? 1)));
  return Object.freeze((crew || []).map((member) => Object.freeze({
    ...member,
    ageYears: Number(member.ageYears || 0) + years,
    experienceYears: Number(member.experienceYears || 0) + years,
    health: Math.max(0, Math.min(1, Number(member.health ?? 1) - years * (1 - lifeSupportCondition) * 4e-3 - years * (1 - medicalCondition) * 2e-3)),
    fatigue: Math.min(1, Math.max(0, Number(member.fatigue || 0)) + Math.min(0.08, years * 3e-3 + (1 - lifeSupportCondition) * 0.025))
  })));
}
function incorporateDueConsequences(expedition) {
  const due = applyDueConsequences(expedition);
  if (!due) return expedition;
  return withExpeditionChanges(expedition, {
    resources: due.resources,
    systems: due.systems,
    crew: due.crew,
    voyageDirector: due.voyageDirector,
    log: appendLogs(expedition.log, due.logEntries)
  });
}
function advanceExpedition(expedition, requestedDeltaS) {
  if (!expedition || expedition.state !== "traveling" || expedition.pendingEvent || expedition.activeEncounter && expedition.activeEncounter.phase !== INTERCEPTION_PHASE.COMPLETE) return expedition;
  const prepared = incorporateDueConsequences(expedition);
  const totalS = prepared.calculation.properElapsedS;
  const remainingS = Math.max(0, totalS - prepared.strategicElapsedS);
  let deltaS = Math.max(0, Math.min(Number(requestedDeltaS) || 0, remainingS));
  const slot = nextVoyageSlot(prepared);
  if (slot && prepared.strategicElapsedS < totalS * slot.progress) deltaS = Math.min(deltaS, totalS * slot.progress - prepared.strategicElapsedS);
  const elapsed = prepared.strategicElapsedS + deltaS;
  let next = withExpeditionChanges(prepared, {
    strategicElapsedS: elapsed,
    progress: totalS > 0 ? Math.min(1, elapsed / totalS) : 0,
    resources: consumeResources(prepared, deltaS, totalS),
    systems: degradeSystems(prepared.systems, deltaS, totalS),
    crew: advanceCrew(prepared.crew, deltaS, prepared.systems),
    outposts: advanceOutposts(prepared, elapsed)
  });
  next = withExpeditionChanges(next, {
    failureChain: appendSystemTransitions(prepared.failureChain, prepared.systems, next.systems, elapsed)
  });
  const longDuration = advanceLongDurationState(next, deltaS);
  next = withExpeditionChanges(next, {
    longDuration: longDuration.longDuration,
    crew: longDuration.crew,
    resources: longDuration.resources,
    log: appendLogs(next.log, longDuration.logEntries)
  });
  const failure = assessCausalFailure(next);
  if (failure) return withExpeditionChanges(next, {
    state: "failed",
    voyagePhase: "mission-loss",
    pendingEvent: null,
    failureReport: failure,
    log: appendLog(next.log, { atMissionS: elapsed, kind: "mission-loss", message: failure.summary })
  });
  if (slot && elapsed + 1 >= totalS * slot.progress) {
    const interception = createPirateInterception(next, slot);
    if (interception) return interception;
    const event2 = createDirectedEvent(next, slot);
    if (event2) return withExpeditionChanges(next, {
      systems: event2.systems,
      voyageDirector: event2.voyageDirector,
      voyagePhase: event2.voyagePhase,
      pendingEvent: event2.pendingEvent,
      eventFlags: event2.eventFlags,
      log: appendLog(next.log, event2.logEntry)
    });
  }
  if (elapsed + 1 >= totalS) return withExpeditionChanges(next, {
    state: "arrived",
    voyagePhase: "arrival",
    progress: 1,
    log: appendLog(next.log, { atMissionS: totalS, kind: "arrival", message: `${next.ship?.name || "Solis Reach"} arrived at ${next.destinationId}.` })
  });
  return next;
}
function advanceToNextMilestone(expedition) {
  if (!expedition || expedition.state !== "traveling" || expedition.pendingEvent || expedition.activeEncounter && expedition.activeEncounter.phase !== INTERCEPTION_PHASE.COMPLETE) return expedition;
  return advanceExpedition(expedition, expedition.calculation.properElapsedS);
}
function resolveExpeditionEvent(expedition, choice) {
  const result = resolveDirectedEvent(expedition, choice);
  if (!result) return expedition;
  let next = withExpeditionChanges(expedition, {
    pendingEvent: null,
    systems: result.systems,
    resources: result.resources,
    crew: result.crew,
    routeContacts: result.routeContacts,
    voyageDirector: result.voyageDirector,
    failureChain: appendSystemTransitions(expedition.failureChain, expedition.systems, result.systems, expedition.strategicElapsedS),
    log: appendLog(expedition.log, result.logEntry)
  });
  const failure = assessCausalFailure(next);
  if (failure) next = withExpeditionChanges(next, {
    state: "failed",
    voyagePhase: "mission-loss",
    failureReport: failure,
    log: appendLog(next.log, { atMissionS: next.strategicElapsedS, kind: "mission-loss", message: failure.summary })
  });
  if (!failure && expedition.pendingEvent?.slotId === "final-approach") {
    next = advanceExpedition(next, next.calculation.properElapsedS);
  }
  return next;
}

// app/js/expedition/command-authority.js
var COMMAND_TYPES = Object.freeze([
  "start",
  "advance",
  "event-response",
  "ship-operation",
  "outpost-plan",
  "outpost-build",
  "outpost-service",
  "encounter-transition",
  "encounter-resolve",
  "encounter-complete"
]);
function cleanText(value, max = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}
function normalizeExpeditionCommand(input = {}) {
  const type = cleanText(input.type, 40).toLowerCase();
  if (!COMMAND_TYPES.includes(type)) throw new Error("invalid_expedition_command");
  return Object.freeze({
    type,
    choiceId: cleanText(input.choiceId, 120),
    operationId: cleanText(input.operationId, 120),
    contactId: cleanText(input.contactId, 180),
    outpostId: cleanText(input.outpostId, 220),
    encounterEvent: cleanText(input.encounterEvent, 80),
    encounterResult: input.encounterResult && typeof input.encounterResult === "object" ? Object.freeze({ ...input.encounterResult }) : null
  });
}
function createAuthorizedExpeditionPlan(input = {}, options = {}) {
  const destinationId = cleanText(input.destinationId, 160).toLowerCase();
  const shipId = cleanText(input.shipId, 80).toLowerCase();
  const propulsionId = cleanText(input.propulsionId, 80).toLowerCase();
  const realism = cleanText(input.realism, 40).toLowerCase();
  const survival = cleanText(input.survival, 40).toLowerCase();
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  if (!destinationId || !getShipProfile(shipId) || !getPropulsionProfile(propulsionId)) {
    throw new Error("invalid_expedition_configuration");
  }
  if (!["science-inspired", "custom"].includes(realism) || !["forgiving", "severe"].includes(survival)) {
    throw new Error("invalid_expedition_configuration");
  }
  return createExpeditionPlan({
    destinationId,
    shipId,
    propulsionId,
    realism,
    survival,
    crew: DEFAULT_CREW,
    createdAtMs: nowMs,
    id: `expedition-${nowMs}`
  });
}
function executeExpeditionCommand(expedition, input = {}, options = {}) {
  if (!expedition || expedition.type !== "InterstellarExpedition") {
    throw new Error("invalid_expedition_plan");
  }
  const command = normalizeExpeditionCommand(input);
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  let result = null;
  if (command.type === "start") {
    result = { expedition: startExpedition(expedition, nowMs), message: "The Expedition departed." };
  } else if (command.type === "advance") {
    result = { expedition: advanceToNextMilestone(expedition), message: "The next voyage chapter is ready." };
  } else if (command.type === "event-response") {
    result = { expedition: resolveExpeditionEvent(expedition, command.choiceId), message: "The crew completed the response." };
  } else if (command.type === "ship-operation") {
    result = applyShipOperation(expedition, command.operationId);
  } else if (command.type === "outpost-plan") {
    result = createOutpostSite(expedition, command.contactId, nowMs);
  } else if (command.type === "outpost-build") {
    result = constructOutpost(expedition, command.outpostId, nowMs);
  } else if (command.type === "outpost-service") {
    result = serviceOutpost(expedition, command.outpostId, nowMs);
  } else if (command.type === "encounter-transition") {
    result = { expedition: transitionPirateInterception(expedition, command.encounterEvent), message: "Hostile interception advanced." };
  } else if (command.type === "encounter-resolve") {
    result = { expedition: resolvePirateInterception(expedition, command.encounterResult), message: "Hostile interception resolved." };
  } else if (command.type === "encounter-complete") {
    result = { expedition: completePirateAftermath(expedition), message: "The Expedition resumed course." };
  }
  const next = result?.expedition;
  if (!next || next === expedition || result?.changed === false) {
    throw new Error("expedition_command_not_available");
  }
  return Object.freeze({
    command,
    expedition: next,
    message: cleanText(result?.message || "The Expedition was updated.", 240)
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  COMMAND_TYPES,
  createAuthorizedExpeditionPlan,
  executeExpeditionCommand,
  normalizeExpeditionCommand
});
