const PROPULSION_CLASS = Object.freeze({
  DEMONSTRATED: 'demonstrated',
  ENGINEERING_DEVELOPMENT: 'engineering-development',
  HIGHLY_SPECULATIVE: 'highly-speculative',
  FICTIONAL: 'fictional'
});

function immutableRecord(record) {
  return Object.freeze({
    ...record,
    requiredRooms: Object.freeze([...(record.requiredRooms || [])]),
    requiredRoles: Object.freeze([...(record.requiredRoles || [])]),
    supportedPropulsionIds: Object.freeze([...(record.supportedPropulsionIds || [])]),
    systems: Object.freeze([...(record.systems || [])]),
    explanation: Object.freeze({ ...(record.explanation || {}) })
  });
}

const PROPULSION_PROFILES = Object.freeze([
  immutableRecord({
    id: 'nuclear-electric-cruise',
    name: 'Nuclear-electric cruise drive',
    classification: PROPULSION_CLASS.ENGINEERING_DEVELOPMENT,
    crewedInterstellarEligible: false,
    accelerationMps2: 0.00008,
    maxVelocityFractionC: 0.0004,
    propellantKgPerShipYear: 1800,
    powerMWhPerShipDay: 18,
    explanation: {
      basis: 'A fission reactor supplies electric propulsion with efficient, very low thrust.',
      limitation: 'Assigned performance is useful for long Solar System travel, not a practical crewed trip to another star.',
      fiction: 'No fictional performance is assigned.'
    }
  }),
  immutableRecord({
    id: 'fusion-pulse-interstellar',
    name: 'Fusion pulse drive',
    classification: PROPULSION_CLASS.HIGHLY_SPECULATIVE,
    crewedInterstellarEligible: true,
    accelerationMps2: 0.0015,
    maxVelocityFractionC: 0.08,
    propellantKgPerShipYear: 7800,
    powerMWhPerShipDay: 34,
    explanation: {
      basis: 'Pulsed fusion concepts use high-energy fusion products and reaction mass to produce momentum.',
      limitation: 'No crewed interstellar fusion drive has been built; ignition, repetition rate, shielding, mass, and heat rejection remain unresolved.',
      fiction: 'The game assumes a reliable pulse chamber and decades-long component life.'
    }
  }),
  immutableRecord({
    id: 'radiant-plasma-field-drive',
    name: 'Radiant plasma field drive',
    classification: PROPULSION_CLASS.FICTIONAL,
    crewedInterstellarEligible: true,
    accelerationMps2: 0.3,
    maxVelocityFractionC: 0.32,
    propellantKgPerShipYear: 12600,
    powerMWhPerShipDay: 52,
    explanation: {
      basis: 'Externally supplied power energizes reaction mass into a directed plasma exhaust; a field-shaped shield redirects part of the radiation load.',
      limitation: 'The required conversion efficiency, compact field system, shielding, and thermal rejection exceed demonstrated engineering.',
      fiction: 'World Explorer assigns the compact converter and field performance. The drive is fictional and does not exceed light speed.'
    }
  })
]);

const SHIP_PROFILES = Object.freeze([
  immutableRecord({
    id: 'long-range-research-vessel',
    name: 'Long-range research vessel',
    releaseStatus: 'playable-slice',
    dryMassKg: 5_800_000,
    propellantCapacityKg: 1_800_000,
    cargoCapacityKg: 420_000,
    minCrew: 8,
    maxCrew: 18,
    waterRecoveryFraction: 0.98,
    foodProductionFraction: 0.82,
    interiorSeed: 5100821,
    supportedPropulsionIds: ['fusion-pulse-interstellar', 'radiant-plasma-field-drive'],
    requiredRoles: ['command', 'navigation', 'engineering', 'medical', 'life-support', 'science'],
    requiredRooms: ['bridge', 'engineering', 'life-support', 'quarters', 'medical', 'cargo-fabrication', 'science', 'local-craft-bay'],
    systems: ['propulsion', 'power', 'life-support', 'navigation', 'thermal', 'medical', 'fabrication', 'food-production', 'sensors', 'hull']
  }),
  immutableRecord({
    id: 'cryogenic-expedition-vessel',
    name: 'Cryogenic expedition vessel',
    releaseStatus: 'playable-strategic',
    dryMassKg: 8_900_000,
    propellantCapacityKg: 1_400_000,
    cargoCapacityKg: 610_000,
    minCrew: 10,
    maxCrew: 34,
    waterRecoveryFraction: 0.985,
    foodProductionFraction: 0.88,
    interiorSeed: 5100947,
    supportedPropulsionIds: ['fusion-pulse-interstellar', 'radiant-plasma-field-drive'],
    requiredRoles: ['command', 'navigation', 'engineering', 'medical', 'life-support', 'science'],
    requiredRooms: ['bridge', 'engineering', 'life-support', 'quarters', 'medical', 'cargo-fabrication', 'science', 'cryogenic-bay', 'local-craft-bay'],
    systems: ['propulsion', 'power', 'life-support', 'navigation', 'thermal', 'medical', 'fabrication', 'food-production', 'cryogenic', 'sensors', 'hull']
  }),
  immutableRecord({
    id: 'generation-ship',
    name: 'Generation ship',
    releaseStatus: 'playable-strategic',
    dryMassKg: 1_900_000_000,
    propellantCapacityKg: 260_000_000,
    cargoCapacityKg: 420_000_000,
    minCrew: 20000,
    maxCrew: 40000,
    waterRecoveryFraction: 0.995,
    foodProductionFraction: 0.995,
    interiorSeed: 5101103,
    supportedPropulsionIds: ['fusion-pulse-interstellar'],
    requiredRoles: ['command', 'navigation', 'engineering', 'medical', 'life-support', 'science', 'education'],
    requiredRooms: ['bridge', 'engineering', 'life-support', 'habitat', 'medical', 'agriculture', 'fabrication', 'science', 'education', 'local-craft-bay'],
    systems: ['propulsion', 'power', 'life-support', 'navigation', 'thermal', 'medical', 'fabrication', 'food-production', 'education', 'sensors', 'hull']
  })
]);

const DEFAULT_CREW = Object.freeze([
  Object.freeze({ id: 'player', name: 'Explorer', ageYears: 34, experienceYears: 6, health: 1, fatigue: 0.08, assignment: 'expedition-lead', roles: Object.freeze(['command', 'science']), status: 'active' }),
  Object.freeze({ id: 'crew-nav', name: 'Mara Velez', ageYears: 39, experienceYears: 14, health: 0.98, fatigue: 0.11, assignment: 'navigation-watch', roles: Object.freeze(['navigation', 'command']), status: 'active' }),
  Object.freeze({ id: 'crew-eng', name: 'Dev Malik', ageYears: 42, experienceYears: 17, health: 0.97, fatigue: 0.13, assignment: 'engineering-watch', roles: Object.freeze(['engineering', 'fabrication']), status: 'active' }),
  Object.freeze({ id: 'crew-life', name: 'Avery Okafor', ageYears: 36, experienceYears: 11, health: 0.99, fatigue: 0.1, assignment: 'life-support-watch', roles: Object.freeze(['life-support', 'engineering']), status: 'active' }),
  Object.freeze({ id: 'crew-med', name: 'Jules Park', ageYears: 41, experienceYears: 16, health: 0.98, fatigue: 0.09, assignment: 'medical-watch', roles: Object.freeze(['medical', 'life-support']), status: 'active' }),
  Object.freeze({ id: 'crew-science', name: 'Noor Haddad', ageYears: 33, experienceYears: 9, health: 0.99, fatigue: 0.12, assignment: 'science-watch', roles: Object.freeze(['science', 'navigation', 'education']), status: 'active' }),
  Object.freeze({ id: 'crew-flight', name: 'Tessa Morgan', ageYears: 38, experienceYears: 13, health: 0.98, fatigue: 0.1, assignment: 'flight-watch', roles: Object.freeze(['navigation', 'command']), status: 'active' }),
  Object.freeze({ id: 'crew-systems', name: 'Eli Chen', ageYears: 45, experienceYears: 20, health: 0.96, fatigue: 0.14, assignment: 'systems-watch', roles: Object.freeze(['engineering', 'medical']), status: 'active' })
]);

function getShipProfile(id) {
  return SHIP_PROFILES.find((entry) => entry.id === id) || null;
}

function getPropulsionProfile(id) {
  return PROPULSION_PROFILES.find((entry) => entry.id === id) || null;
}

export {
  DEFAULT_CREW,
  getPropulsionProfile,
  getShipProfile,
  PROPULSION_CLASS,
  PROPULSION_PROFILES,
  SHIP_PROFILES
};
