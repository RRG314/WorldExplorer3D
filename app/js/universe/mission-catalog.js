import { SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS } from '../astronomy/body-catalog.js?v=3';
import { getUniverseDestinations, resolveUniverseAddress } from './catalog.js?v=11';
import { assessPlanetHabitability } from './habitability.js?v=1';

const DESTINATION_MISSION_CATALOG_VERSION = 1;

const SYSTEM_MISSIONS = Object.freeze({
  sol: ['Our Living Star', 'Build a complete solar-weather baseline and trace how the Sun shapes every reachable world.', 'stellar-survey'],
  'proxima-centauri': ['The Flare Watch', 'Measure Proxima Centauri’s changing activity before committing a crewed survey to its close-orbiting worlds.', 'stellar-survey'],
  'tau-ceti': ['The Quiet Star Question', 'Separate Tau Ceti’s steady stellar signal from the debris environment surrounding its planetary system.', 'debris-and-stellar-survey'],
  'trappist-1': ['Seven Shadows', 'Use repeated transits to compare seven tightly packed worlds under one ultracool star.', 'transit-network-survey'],
  'kepler-186': ['The Long Transit', 'Reconstruct the architecture of a distant compact system and prepare a focused investigation of its outer world.', 'transit-network-survey'],
  '55-cancri': ['Fire and Distance', 'Map the sharp environmental contrast between a scorched inner world and the system’s distant giants.', 'comparative-system-survey'],
  'hd-219134': ['The Nearby Laboratory', 'Calibrate a six-world comparative survey around a nearby K star without confusing modeled appearance with observation.', 'comparative-system-survey'],
  'lhs-1140': ['The Deep Red Watch', 'Characterize the radiation and energy environment surrounding two very different rocky-world candidates.', 'stellar-survey'],
  'toi-700': ['Two Temperate Orbits', 'Establish the host-star baseline needed to compare TOI-700 d and e as temperate-zone candidates.', 'comparative-system-survey'],
  'andromeda-explorer-a': ['First Light in Andromeda', 'Survey a stable fictional frontier system and establish its first complete navigation and science record.', 'frontier-system-survey'],
  'triangulum-explorer-a': ['Triangulum Field Station', 'Resolve the star and two modeled worlds of a distant fictional survey system.', 'frontier-system-survey']
});

const PLANET_MISSIONS = Object.freeze({
  'proxima-centauri-b': ['Under a Restless Sun', 'Survey atmospheric retention, surface radiation, and any chemistry that could justify a later search for life.', 'surface-biosignature-survey'],
  'proxima-centauri-d': ['The Inner Furnace', 'Measure heat redistribution and determine whether the small inner world retains any meaningful atmosphere.', 'thermal-orbital-survey'],
  'tau-ceti-g': ['Close Ember', 'Map the dayside heat pattern and test whether a trace atmosphere moves energy across the planet.', 'thermal-orbital-survey'],
  'tau-ceti-h': ['Dustline Passage', 'Survey the planet while separating its signal from the system’s dusty debris environment.', 'debris-orbital-survey'],
  'tau-ceti-f': ['Cold Super-Earth', 'Constrain the atmosphere and volatile inventory of a massive world receiving weak stellar energy.', 'atmospheric-probe-survey'],
  'trappist-1-b': ['The Heated Face', 'Measure volcanic and atmospheric indicators on the system’s innermost world.', 'thermal-orbital-survey'],
  'trappist-1-c': ['Between Fire and Air', 'Compare dayside emission and nightside heat transport for evidence of a persistent atmosphere.', 'atmospheric-probe-survey'],
  'trappist-1-d': ['The Narrow Climate', 'Map the boundary between extreme heating and potentially temperate regions.', 'climate-orbital-survey'],
  'trappist-1-e': ['The Temperate Benchmark', 'Complete the system’s highest-priority rocky-world atmosphere and surface-chemistry survey.', 'surface-biosignature-survey'],
  'trappist-1-f': ['Ice, Air, or Ocean', 'Determine whether the outer temperate candidate is airless, ice-covered, or able to support a deeper volatile cycle.', 'surface-biosignature-survey'],
  'trappist-1-g': ['The Outer Temperate Edge', 'Measure atmospheric mass and heat retention near the cold edge of the system’s promising orbits.', 'atmospheric-probe-survey'],
  'trappist-1-h': ['The Frozen Clock', 'Study a cold outer world whose orbit completes the system’s resonant chain.', 'ice-world-survey'],
  'kepler-186-b': ['Short-Year Furnace', 'Map the radiation balance of the system’s fast inner planet.', 'thermal-orbital-survey'],
  'kepler-186-c': ['Cloudless Signal', 'Test whether the second planet carries an atmosphere detectable through repeated limb observations.', 'atmospheric-probe-survey'],
  'kepler-186-d': ['The Middle Orbit', 'Measure density and heat loss to distinguish a bare rock from a volatile-bearing world.', 'geophysical-orbital-survey'],
  'kepler-186-e': ['Last Inner Crossing', 'Complete comparative atmospheric observations before the long transfer to Kepler-186 f.', 'atmospheric-probe-survey'],
  'kepler-186-f': ['At the Faint Green Edge', 'Investigate a cool Earth-size candidate while treating atmosphere, water, and life as unresolved questions.', 'surface-biosignature-survey'],
  '55-cancri-e': ['Ocean of Stone', 'Deploy a heat-resistant probe to measure the extreme inner world’s thermal cycle and possible volcanic gases.', 'thermal-probe-survey'],
  '55-cancri-b': ['The Fourteen-Day Giant', 'Map the hot giant’s upper atmosphere and its effect on nearby flight paths.', 'gas-giant-probe-survey'],
  '55-cancri-c': ['Gravity in the Gap', 'Measure the intermediate giant’s mass field and atmospheric structure.', 'gas-giant-probe-survey'],
  '55-cancri-f': ['Clouds Near the Temperate Orbit', 'Study a giant planet near moderate stellar flux without treating its cloud tops as a habitable surface.', 'gas-giant-probe-survey'],
  '55-cancri-d': ['The Long Watch', 'Complete a deep-system magnetosphere and satellite-search campaign around the distant giant.', 'outer-giant-survey'],
  'hd-219134-b': ['Rock Under Pressure', 'Measure an intensely heated super-Earth’s mass, density, and surface-emission pattern.', 'geophysical-orbital-survey'],
  'hd-219134-c': ['Twin Heat', 'Compare the second close-in super-Earth against the first to isolate composition from irradiation.', 'comparative-planet-survey'],
  'hd-219134-f': ['The Dense Unknown', 'Resolve whether the compact third world is primarily rock, metal, or volatile-rich material.', 'geophysical-orbital-survey'],
  'hd-219134-d': ['Atmosphere at Forty-Seven Days', 'Use repeated limb passes to constrain the atmosphere of a heavier intermediate world.', 'atmospheric-probe-survey'],
  'hd-219134-g': ['The Sub-Neptune Divide', 'Probe the transition between a massive rocky world and a volatile-wrapped planet.', 'atmospheric-probe-survey'],
  'hd-219134-h': ['The Cold Sentinel', 'Survey the distant giant’s magnetic environment and search for stable moon-scale signals.', 'outer-giant-survey'],
  'lhs-1140-c': ['The Hot Inner Reference', 'Establish the inner planet’s heat and atmosphere record before comparing it with LHS 1140 b.', 'thermal-orbital-survey'],
  'lhs-1140-b': ['Heavy Water Question', 'Investigate whether the massive temperate candidate’s density and atmosphere allow an ocean-world interpretation.', 'surface-biosignature-survey'],
  'toi-700-b': ['The Inner Baseline', 'Measure the compact inner planet to calibrate the rest of the TOI-700 campaign.', 'geophysical-orbital-survey'],
  'toi-700-c': ['Wrapped in Gas', 'Characterize the system’s larger sub-Neptune and its influence on neighboring observations.', 'atmospheric-probe-survey'],
  'toi-700-e': ['The Early Temperate Test', 'Survey the inner temperate-zone Earth-size planet for atmosphere, climate, and surface chemistry.', 'surface-biosignature-survey'],
  'toi-700-d': ['The Outer Temperate Test', 'Compare TOI-700 d with e and search for independent evidence of a stable atmosphere or water-compatible conditions.', 'surface-biosignature-survey'],
  'andromeda-explorer-a-b': ['Copper Dawn', 'Map a warm fictional rocky world and establish the system’s first surface baseline.', 'frontier-surface-survey'],
  'andromeda-explorer-a-c': ['The Open Ocean Hypothesis', 'Test a fictional temperate world for a stable hydrological cycle and an original game-world biosphere.', 'frontier-biosphere-survey'],
  'andromeda-explorer-a-d': ['Storm Crown', 'Deploy probes through a fictional giant planet’s layered storms.', 'gas-giant-probe-survey'],
  'triangulum-explorer-a-b': ['Ash Meridian', 'Trace volcanic provinces across a fictional high-gravity rocky world.', 'frontier-surface-survey'],
  'triangulum-explorer-a-c': ['Blue-White Horizon', 'Survey a fictional cold sub-Neptune for rings, storms, and moon candidates.', 'outer-giant-survey']
});

const SOLAR_MISSIONS = Object.freeze({
  moon: ['The Lunar Field Book', 'Link orbital context, landing-site geology, and a returned lunar sample.', 'surface-geology-survey'],
  mercury: ['Caloris Under the Sun', 'Cross Caloris Planitia, map impact structures, and protect the field team from extreme solar exposure.', 'surface-geology-survey'],
  venus: ['Radar Through the Clouds', 'Use a protected craft and orbital radar to investigate Maxwell Montes without claiming an Earth-like surface visit.', 'protected-surface-survey'],
  mars: ['Water Written in Stone', 'Follow landforms and minerals that preserve evidence of Mars’s changing water history.', 'surface-geology-survey'],
  jupiter: ['The Radiation Kingdom', 'Map Jupiter’s belts, storms, magnetic field, and safe corridors to its major moons.', 'gas-giant-probe-survey'],
  io: ['The Moving Volcanoes', 'Document active volcanic terrain and compare deposits across Tvashtar Paterae.', 'surface-geology-survey'],
  europa: ['Lines Across the Ice', 'Survey fractured ice and search for evidence connecting surface geology to the hidden ocean.', 'surface-biosignature-survey'],
  saturn: ['The Ring Laboratory', 'Measure ring structure, shepherding effects, storms, and safe moon transfers.', 'gas-giant-probe-survey'],
  titan: ['Dunes Beneath the Haze', 'Cross Titan’s dune terrain and study methane weather, organics, and surface-atmosphere exchange.', 'protected-surface-survey'],
  enceladus: ['Plume Source', 'Trace south-polar fractures and collect contamination-controlled plume evidence.', 'surface-biosignature-survey'],
  uranus: ['The Sideways Seasons', 'Measure an ice giant’s extreme axial orientation, rings, and magnetosphere.', 'outer-giant-survey'],
  neptune: ['The Fastest Winds', 'Deploy remote instruments to study Neptune’s storms and deep atmosphere.', 'outer-giant-survey'],
  triton: ['Cantaloupe Ice', 'Survey Triton’s unusual terrain and nitrogen activity under Neptune’s distant light.', 'surface-geology-survey'],
  ceres: ['Bright Material', 'Map Occator Crater and examine the origin of its reflective salt-rich deposits.', 'surface-geology-survey'],
  vesta: ['The Giant Impact', 'Cross the Rheasilvia basin and reconstruct the collision that reshaped Vesta.', 'surface-geology-survey'],
  pluto: ['Across Sputnik Planitia', 'Study nitrogen-ice cells, mountain boundaries, and Pluto’s changing atmosphere.', 'surface-geology-survey']
});

function missionStages(operation) {
  const fieldLabel = operation.includes('surface')
    ? 'Land, deploy the field team, and complete the primary survey.'
    : operation.includes('probe')
      ? 'Reach the assigned corridor and deploy the instrument package.'
      : 'Reach the assigned observation position and complete the primary scan.';
  return Object.freeze([
    Object.freeze({ id: 'briefing', label: 'Review the mission briefing aboard Surveyor.' }),
    Object.freeze({ id: 'approach', label: 'Set the destination course and enter the local frame.' }),
    Object.freeze({ id: 'fieldwork', label: fieldLabel }),
    Object.freeze({ id: 'analysis', label: 'Return the evidence to Surveyor and complete science analysis.' })
  ]);
}

function makeMission(destination, authored, scope) {
  const [title, premise, operation] = authored;
  const system = destination.objectClass === 'exoplanet' ? resolveUniverseAddress(destination.parentFrameId) : destination;
  const habitability = destination.objectClass === 'exoplanet' ? assessPlanetHabitability(destination, system) : null;
  const fictional = String(destination.accuracy || '').includes('generated') || destination.generatedFlags?.includes('host-star-parameters');
  return Object.freeze({
    type: 'DestinationMissionDefinition',
    version: DESTINATION_MISSION_CATALOG_VERSION,
    id: `mission:${destination.id}`,
    destinationId: destination.id,
    destinationName: destination.name,
    systemId: system?.id || destination.id,
    scope,
    title,
    premise,
    operation,
    stages: missionStages(operation),
    habitability,
    truthClass: fictional ? 'fictional-game-world' : destination.accuracy === 'observed' ? 'observed-context-with-modeled-gameplay' : 'catalog-derived-with-modeled-gameplay',
    lifePolicy: fictional && operation.includes('biosphere')
      ? 'Original fictional life may be established by the completed mission.'
      : 'No extraterrestrial life is confirmed. Signals remain candidates until the mission evidence chain is complete.',
    provenance: destination.provenance || Object.freeze([])
  });
}

const CATALOG_MISSIONS = new Map();
for (const destination of getUniverseDestinations()) {
  const authored = destination.objectClass === 'planetary_system'
    ? SYSTEM_MISSIONS[destination.id]
    : destination.objectClass === 'exoplanet'
      ? PLANET_MISSIONS[destination.id]
      : null;
  if (authored) CATALOG_MISSIONS.set(destination.id, makeMission(destination, authored, destination.objectClass === 'planetary_system' ? 'system' : 'planet'));
}

const SOLAR_BODY_MISSIONS = new Map(SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS.map((bodyId) => {
  const authored = SOLAR_MISSIONS[bodyId];
  return [bodyId, Object.freeze({
    type: 'DestinationMissionDefinition',
    version: DESTINATION_MISSION_CATALOG_VERSION,
    id: `mission:${bodyId}`,
    destinationId: bodyId,
    destinationName: bodyId[0].toUpperCase() + bodyId.slice(1),
    systemId: 'sol',
    scope: 'solar-body',
    title: authored[0],
    premise: authored[1],
    operation: authored[2],
    stages: missionStages(authored[2]),
    habitability: null,
    truthClass: 'observed-context-with-modeled-gameplay',
    lifePolicy: 'No extraterrestrial life is confirmed. Astrobiology objectives preserve contamination controls and uncertainty.',
    provenance: Object.freeze([])
  })];
}));

function getDestinationMission(destinationId) {
  return CATALOG_MISSIONS.get(String(destinationId || '')) || SOLAR_BODY_MISSIONS.get(String(destinationId || '')) || null;
}

function listDestinationMissions() {
  return [...CATALOG_MISSIONS.values(), ...SOLAR_BODY_MISSIONS.values()];
}

function missionCoverage() {
  const requiredCatalogIds = getUniverseDestinations()
    .filter((destination) => ['planetary_system', 'exoplanet'].includes(destination.objectClass))
    .map((destination) => destination.id);
  const requiredSolarIds = [...SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS];
  const required = [...new Set([...requiredCatalogIds, ...requiredSolarIds])];
  const missing = required.filter((id) => !getDestinationMission(id));
  const duplicates = listDestinationMissions().map((mission) => mission.destinationId).filter((id, index, all) => all.indexOf(id) !== index);
  return Object.freeze({
    version: DESTINATION_MISSION_CATALOG_VERSION,
    requiredCount: required.length,
    missionCount: listDestinationMissions().length,
    missing: Object.freeze(missing),
    duplicates: Object.freeze([...new Set(duplicates)]),
    complete: missing.length === 0 && duplicates.length === 0
  });
}

export {
  DESTINATION_MISSION_CATALOG_VERSION,
  getDestinationMission,
  listDestinationMissions,
  missionCoverage,
  PLANET_MISSIONS,
  SOLAR_MISSIONS,
  SYSTEM_MISSIONS
};
