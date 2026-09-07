import {
  TRANSPORT_DURABILITY_POLICIES,
  defineTransportCatalogEntry
} from './catalog-contract.js?v=1';

const REFERENCE_EVIDENCE = 'docs/reference-art/aviation-fleet-and-damage-2026-08-29.png';

const definitions = [
  {
    id: 'personal-prop', label: 'Explorer aerobatic jet', aircraftKind: 'fixed-wing', role: 'aerobatic',
    directModeOnly: true,
    width: 1.48, height: 2.35, length: 9.4, wingspan: 7.8, massKg: 3650,
    topSpeedMph: 310, performance: { topSpeed: 310, topSpeedUnit: 'knots-ias', accelerationScale: 1.42, steeringScale: 1.34, gripScale: 1, brakeScale: 1.16, turningRadius: 7.2 },
    seatCount: 2, boardingPoints: ['left', 'right'], resistance: 135,
    durabilityPolicy: TRANSPORT_DURABILITY_POLICIES.EXPLORATION_UNLIMITED,
    damageZones: ['nose', 'fuselage', 'left-wing', 'right-wing', 'tail', 'landing-gear'],
    visualRecipeId: 'aviation:explorer-aerobatic-jet'
  },
  {
    id: 'expedition-prop', label: 'Expedition plane', aircraftKind: 'fixed-wing', role: 'bush',
    width: 1.65, height: 2.2, length: 7.9, wingspan: 10.9, massKg: 1280,
    topSpeedMph: 145, performance: { topSpeed: 145, topSpeedUnit: 'knots-ias', accelerationScale: 1.05, steeringScale: 1.08, gripScale: 1, brakeScale: 1.05, turningRadius: 7.5 },
    seatCount: 4, boardingPoints: ['front-left', 'front-right'], resistance: 150,
    damageZones: ['nose', 'fuselage', 'left-wing', 'right-wing', 'tail', 'landing-gear'],
    visualRecipeId: 'aviation:expedition-prop'
  },
  {
    id: 'business-jet', label: 'Business jet', aircraftKind: 'fixed-wing', role: 'business',
    width: 2.1, height: 3.8, length: 15.2, wingspan: 14.1, massKg: 8450,
    topSpeedMph: 430, performance: { topSpeed: 430, topSpeedUnit: 'knots-ias', accelerationScale: 1.22, steeringScale: .86, gripScale: 1.08, brakeScale: 1.12, turningRadius: 14 },
    seatCount: 9, boardingPoints: ['front-left'], resistance: 290,
    damageZones: ['nose', 'fuselage', 'left-wing', 'right-wing', 'tail', 'landing-gear', 'engines'],
    visualRecipeId: 'aviation:business-jet'
  },
  {
    id: 'regional-jet', label: 'Regional jet', aircraftKind: 'fixed-wing', role: 'regional',
    width: 2.7, height: 6.8, length: 28.5, wingspan: 26.2, massKg: 26000,
    topSpeedMph: 455, performance: { topSpeed: 455, topSpeedUnit: 'knots-ias', accelerationScale: .92, steeringScale: .69, gripScale: 1.12, brakeScale: 1.15, turningRadius: 24 },
    seatCount: 76, boardingPoints: ['front-left', 'rear-left'], resistance: 420,
    damageZones: ['nose', 'fuselage', 'left-wing', 'right-wing', 'tail', 'landing-gear', 'engines'],
    visualRecipeId: 'aviation:regional-jet'
  },
  {
    id: 'long-range-airliner', label: 'Long-range airliner', aircraftKind: 'fixed-wing', role: 'airliner',
    width: 6.2, height: 19.2, length: 70.4, wingspan: 64.4, massKg: 184000,
    topSpeedMph: 510, performance: { topSpeed: 510, topSpeedUnit: 'knots-ias', accelerationScale: .62, steeringScale: .48, gripScale: 1.18, brakeScale: 1.2, turningRadius: 48 },
    seatCount: 410, boardingPoints: ['front-left', 'mid-left', 'rear-left'],
    durabilityPolicy: TRANSPORT_DURABILITY_POLICIES.HEAVY_DUTY, resistance: 780,
    damageZones: ['nose', 'fuselage', 'left-wing', 'right-wing', 'tail', 'landing-gear', 'engines'],
    visualRecipeId: 'aviation:long-range-airliner'
  },
  {
    id: 'utility-helicopter', label: 'Utility helicopter', aircraftKind: 'rotorcraft', role: 'utility',
    width: 2.3, height: 3.3, length: 12.4, rotorDiameter: 10.8, massKg: 2250,
    topSpeedMph: 145, performance: { topSpeed: 145, topSpeedUnit: 'knots-ias', accelerationScale: 1.08, steeringScale: 1.18, gripScale: 1, brakeScale: 1.1, turningRadius: 3.5 },
    seatCount: 6, boardingPoints: ['front-left', 'front-right', 'cabin-left', 'cabin-right'], resistance: 190,
    damageZones: ['nose', 'cabin', 'tail-boom', 'main-rotor', 'tail-rotor', 'skids'],
    visualRecipeId: 'aviation:utility-helicopter'
  }
];

const AVIATION_CATALOG = Object.freeze(definitions.map((definition) => defineTransportCatalogEntry({
  ...definition,
  domain: 'aviation',
  playable: true,
  enterable: true,
  companionAboard: true,
  recovery: 'nearest-mapped-aviation-facility',
  visual: {
    recipeId: definition.visualRecipeId,
    lods: ['promoted', 'parked', 'distant'],
    mobileBudget: 'one-promoted-four-parked',
    referenceEvidence: REFERENCE_EVIDENCE
  },
  rights: {
    kind: 'original-generic-design',
    brand: 'unbranded',
    attribution: 'World Explorer original vehicle design'
  }
})));

const byId = new Map(AVIATION_CATALOG.map((entry) => [entry.id, entry]));
const AVIATION_FLEET_CATALOG = Object.freeze(AVIATION_CATALOG.filter((entry) => entry.directModeOnly !== true));

function getAviationCatalogEntry(id) {
  return byId.get(String(id || '')) || byId.get('personal-prop');
}

export {
  AVIATION_CATALOG,
  AVIATION_FLEET_CATALOG,
  REFERENCE_EVIDENCE as AVIATION_REFERENCE_EVIDENCE,
  getAviationCatalogEntry
};
