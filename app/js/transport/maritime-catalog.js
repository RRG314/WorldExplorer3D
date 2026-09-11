import {
  TRANSPORT_DURABILITY_POLICIES,
  defineTransportCatalogEntry
} from './catalog-contract.js?v=1';

const REFERENCE_EVIDENCE = 'docs/reference-art/maritime-fleet-and-damage-2026-08-29.png';

const definitions = [
  {
    id: 'marina-runabout', label: 'Marina runabout', vesselKind: 'power', role: 'runabout',
    width: 2.6, height: 2.4, length: 7.4, draft: .55, massKg: 2100,
    topSpeedMph: 38, performance: { topSpeed: 38, topSpeedUnit: 'knots', accelerationScale: 1.3, steeringScale: 1.35, gripScale: 1.08, brakeScale: 1.2, turningRadius: 6.5 },
    seatCount: 7, boardingPoints: ['port-aft', 'starboard-aft'], resistance: 135,
    damageZones: ['bow', 'hull', 'cockpit', 'stern', 'propulsion']
  },
  {
    id: 'cruising-sailboat', label: 'Cruising sailboat', vesselKind: 'sail', role: 'sailboat',
    width: 3.6, height: 15.5, length: 11.8, draft: 1.85, massKg: 7200,
    topSpeedMph: 10, performance: { topSpeed: 10, topSpeedUnit: 'knots', accelerationScale: .48, steeringScale: .92, gripScale: 1.18, brakeScale: .72, turningRadius: 10 },
    seatCount: 8, boardingPoints: ['port-mid', 'starboard-mid'], resistance: 210,
    damageZones: ['bow', 'hull', 'mast', 'rigging', 'rudder']
  },
  {
    id: 'coastal-workboat', label: 'Coastal workboat', vesselKind: 'power', role: 'workboat',
    width: 5.2, height: 5.1, length: 16.5, draft: 1.45, massKg: 28000,
    topSpeedMph: 20, performance: { topSpeed: 20, topSpeedUnit: 'knots', accelerationScale: .86, steeringScale: .92, gripScale: 1.2, brakeScale: 1.08, turningRadius: 15 },
    seatCount: 10, boardingPoints: ['port-aft', 'starboard-aft'], resistance: 320,
    damageZones: ['bow', 'hull', 'wheelhouse', 'working-deck', 'propulsion']
  },
  {
    id: 'harbor-tug', label: 'Harbor tug', vesselKind: 'power', role: 'tug',
    width: 9.5, height: 12, length: 28, draft: 4.1, massKg: 410000,
    topSpeedMph: 14, performance: { topSpeed: 14, topSpeedUnit: 'knots', accelerationScale: .78, steeringScale: 1.22, gripScale: 1.35, brakeScale: 1.3, turningRadius: 18 },
    seatCount: 12, boardingPoints: ['port-mid', 'starboard-mid'],
    durabilityPolicy: TRANSPORT_DURABILITY_POLICIES.HEAVY_DUTY, resistance: 620,
    damageZones: ['bow-fenders', 'hull', 'wheelhouse', 'tow-deck', 'propulsion']
  },
  {
    id: 'passenger-ferry', label: 'Passenger ferry', vesselKind: 'power', role: 'ferry',
    width: 18, height: 24, length: 85, draft: 4.2, massKg: 6800000,
    topSpeedMph: 23, performance: { topSpeed: 23, topSpeedUnit: 'knots', accelerationScale: .48, steeringScale: .6, gripScale: 1.4, brakeScale: 1.22, turningRadius: 62 },
    seatCount: 420, boardingPoints: ['port-mid', 'starboard-mid', 'stern-ramp'],
    durabilityPolicy: TRANSPORT_DURABILITY_POLICIES.HEAVY_DUTY, resistance: 980,
    damageZones: ['bow', 'hull', 'passenger-decks', 'bridge', 'propulsion']
  },
  {
    id: 'ocean-research-vessel', label: 'Ocean research vessel', vesselKind: 'power', role: 'research',
    width: 16, height: 25, length: 78, draft: 5.6, massKg: 5200000,
    topSpeedMph: 18, performance: { topSpeed: 18, topSpeedUnit: 'knots', accelerationScale: .52, steeringScale: .66, gripScale: 1.42, brakeScale: 1.15, turningRadius: 56 },
    seatCount: 64, boardingPoints: ['port-mid', 'starboard-mid', 'aft-working-deck'],
    durabilityPolicy: TRANSPORT_DURABILITY_POLICIES.HEAVY_DUTY, resistance: 900,
    damageZones: ['bow', 'hull', 'laboratories', 'working-deck', 'bridge', 'propulsion']
  },
  {
    id: 'container-cargo-ship', label: 'Container cargo ship', vesselKind: 'power', role: 'cargo',
    width: 32, height: 48, length: 210, draft: 12, massKg: 42000000,
    topSpeedMph: 21, performance: { topSpeed: 21, topSpeedUnit: 'knots', accelerationScale: .24, steeringScale: .3, gripScale: 1.65, brakeScale: .7, turningRadius: 170 },
    seatCount: 28, boardingPoints: ['port-accommodation', 'starboard-accommodation'],
    durabilityPolicy: TRANSPORT_DURABILITY_POLICIES.HEAVY_DUTY, resistance: 1800,
    damageZones: ['bow', 'hull', 'cargo-deck', 'bridge', 'rudder', 'propulsion']
  }
];

const MARITIME_CATALOG = Object.freeze(definitions.map((definition) => defineTransportCatalogEntry({
  ...definition,
  domain: 'maritime',
  playable: true,
  enterable: true,
  companionAboard: true,
  recovery: 'nearest-mapped-maritime-facility',
  visualRecipeId: `maritime:${definition.id}`,
  visual: {
    recipeId: `maritime:${definition.id}`,
    lods: ['promoted', 'berthed', 'distant'],
    mobileBudget: definition.role === 'cargo' || definition.role === 'ferry' ? 'one-promoted-two-large-berthed' : 'one-promoted-six-berthed',
    referenceEvidence: REFERENCE_EVIDENCE
  },
  rights: {
    kind: 'original-generic-design',
    brand: 'unbranded',
    attribution: 'World Explorer original vessel design'
  }
})));

const byId = new Map(MARITIME_CATALOG.map((entry) => [entry.id, entry]));

function getMaritimeCatalogEntry(id) {
  return byId.get(String(id || '')) || byId.get('marina-runabout');
}

export { MARITIME_CATALOG, REFERENCE_EVIDENCE as MARITIME_REFERENCE_EVIDENCE, getMaritimeCatalogEntry };
