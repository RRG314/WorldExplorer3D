const CHARACTER_SCHEMA_VERSION = 1;
const PROGRESSION_RULES_VERSION = 1;

const ATTRIBUTE_MINIMUM = 2;
const ATTRIBUTE_MAXIMUM = 8;
const ATTRIBUTE_CREATION_MINIMUM = 3;
const ATTRIBUTE_CREATION_MAXIMUM = 6;
const ATTRIBUTE_CUSTOM_POINT_BUDGET = 28;

const ATTRIBUTE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'strength', label: 'Strength', summary: 'Heavy tools, demanding construction, and physical field work.' }),
  Object.freeze({ id: 'endurance', label: 'Endurance', summary: 'Sustained swimming, diving, and harsh-environment work.' }),
  Object.freeze({ id: 'precision', label: 'Precision', summary: 'Fine excavation, photography stability, and careful placement.' }),
  Object.freeze({ id: 'awareness', label: 'Awareness', summary: 'Field clues, wildlife cues, and instrument interpretation.' }),
  Object.freeze({ id: 'fieldKnowledge', label: 'Field Knowledge', summary: 'Identification and scientific context.' }),
  Object.freeze({ id: 'technical', label: 'Technical', summary: 'Equipment, vehicles, construction systems, and spacecraft.' }),
  Object.freeze({ id: 'navigation', label: 'Navigation', summary: 'Routes, surveying, marine travel, flight, and orbital work.' })
]);

const BALANCED_ATTRIBUTES = Object.freeze(Object.fromEntries(ATTRIBUTE_DEFINITIONS.map(({ id }) => [id, 4])));

function attributeSpread(overrides = {}) {
  return Object.freeze({ ...BALANCED_ATTRIBUTES, ...overrides });
}

const BACKGROUND_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'general-explorer', label: 'General Explorer', summary: 'Balanced field capability with a start in surveying.', attributes: attributeSpread({}), specialtyXp: Object.freeze({ surveying: 18 }), proficiencyXp: Object.freeze({ 'survey-equipment': 14 }), recommendedToolIds: Object.freeze(['field-lens', 'field-camera']) }),
  Object.freeze({ id: 'field-naturalist', label: 'Field Naturalist', summary: 'Stronger wildlife observation and field interpretation.', attributes: attributeSpread({ awareness: 5, fieldKnowledge: 5, strength: 3, technical: 3 }), specialtyXp: Object.freeze({ wildlife: 24, photography: 10 }), proficiencyXp: Object.freeze({ photography: 12 }), recommendedToolIds: Object.freeze(['field-camera', 'field-binoculars']) }),
  Object.freeze({ id: 'field-prospector', label: 'Field Prospector', summary: 'Stronger geological clues, detecting, and careful excavation.', attributes: attributeSpread({ precision: 5, awareness: 5, endurance: 3, navigation: 3 }), specialtyXp: Object.freeze({ geology: 24 }), proficiencyXp: Object.freeze({ detector: 14, excavation: 10 }), recommendedToolIds: Object.freeze(['metal-detector', 'hand-trowel']) }),
  Object.freeze({ id: 'marine-surveyor', label: 'Marine Surveyor', summary: 'Stronger water travel, dive work, and marine navigation.', attributes: attributeSpread({ endurance: 5, navigation: 5, strength: 3, precision: 3 }), specialtyXp: Object.freeze({ marine: 24, surveying: 8 }), proficiencyXp: Object.freeze({ dive: 12, sonar: 10 }), recommendedToolIds: Object.freeze(['portable-sonar', 'virtual-dive-kit']) }),
  Object.freeze({ id: 'expedition-pilot', label: 'Expedition Pilot', summary: 'Stronger vehicle systems and route handling.', attributes: attributeSpread({ technical: 5, navigation: 5, fieldKnowledge: 3, endurance: 3 }), specialtyXp: Object.freeze({ piloting: 24 }), proficiencyXp: Object.freeze({ aircraft: 10, 'ground-vehicle': 10 }), recommendedToolIds: Object.freeze([]) }),
  Object.freeze({ id: 'field-engineer', label: 'Field Engineer', summary: 'Stronger building systems and precise technical work.', attributes: attributeSpread({ technical: 5, precision: 5, awareness: 3, navigation: 3 }), specialtyXp: Object.freeze({ engineering: 24 }), proficiencyXp: Object.freeze({ 'construction-tools': 14 }), recommendedToolIds: Object.freeze([]) }),
  Object.freeze({ id: 'research-surveyor', label: 'Research Surveyor', summary: 'Stronger scientific interpretation and route surveying.', attributes: attributeSpread({ fieldKnowledge: 5, navigation: 5, strength: 3, technical: 3 }), specialtyXp: Object.freeze({ surveying: 24 }), proficiencyXp: Object.freeze({ 'survey-equipment': 14 }), recommendedToolIds: Object.freeze(['field-lens']) }),
  Object.freeze({ id: 'planetary-explorer', label: 'Planetary Explorer', summary: 'Stronger spacecraft systems, navigation, and planetary work.', attributes: attributeSpread({ technical: 5, navigation: 5, endurance: 3, strength: 3 }), specialtyXp: Object.freeze({ space: 24, piloting: 8 }), proficiencyXp: Object.freeze({ spacecraft: 14 }), recommendedToolIds: Object.freeze([]) })
]);

const SPECIALTY_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'wildlife', label: 'Wildlife', summary: 'Wildlife, plants, habitats, tracks, and observation.' }),
  Object.freeze({ id: 'companion-handling', label: 'Companion Handling', summary: 'Reading, befriending, caring for, and training companions.' }),
  Object.freeze({ id: 'geology', label: 'Geology', summary: 'Rocks, minerals, sediment, fossils, and prospecting.' }),
  Object.freeze({ id: 'marine', label: 'Marine Exploration', summary: 'Water survey, fishing, diving, sonar, boats, and submersibles.' }),
  Object.freeze({ id: 'space', label: 'Space Exploration', summary: 'Planetary travel, landings, field science, and atmosphere work.' }),
  Object.freeze({ id: 'piloting', label: 'Piloting', summary: 'Ground, air, boat, rover, and spacecraft operation.' }),
  Object.freeze({ id: 'engineering', label: 'Engineering', summary: 'Building, repair, and technical construction.' }),
  Object.freeze({ id: 'photography', label: 'Photography', summary: 'Field and scientific camera technique.' }),
  Object.freeze({ id: 'surveying', label: 'Surveying', summary: 'Routes, habitats, maps, sonar, and planetary surveys.' })
]);

const PROFICIENCY_DEFINITIONS = Object.freeze([
  'detector', 'excavation', 'dive', 'sonar', 'boat', 'submersible',
  'ground-vehicle', 'aircraft', 'spacecraft', 'photography',
  'survey-equipment', 'construction-tools'
].map((id) => Object.freeze({ id, label: id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ') })));

const TRAIT_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'sure-footed', label: 'Sure-Footed', summary: 'Steadier movement on rough ground.' }),
  Object.freeze({ id: 'patient-observer', label: 'Patient Observer', summary: 'Observation cues settle sooner after sustained stillness.' }),
  Object.freeze({ id: 'methodical', label: 'Methodical', summary: 'Finer excavation control with slower heavy removal.' }),
  Object.freeze({ id: 'equipment-minded', label: 'Equipment Minded', summary: 'Clearer equipment-condition and instrument feedback.' }),
  Object.freeze({ id: 'wayfinder', label: 'Wayfinder', summary: 'Earlier route and bearing interpretation.' }),
  Object.freeze({ id: 'strong-swimmer', label: 'Strong Swimmer', summary: 'Stronger starting water-movement assistance.' })
]);

const SPECIALTY_RANKS = Object.freeze([
  Object.freeze({ rank: 0, label: 'Unstarted', minimumXp: 0 }),
  Object.freeze({ rank: 1, label: 'Familiar', minimumXp: 40 }),
  Object.freeze({ rank: 2, label: 'Practiced', minimumXp: 120 }),
  Object.freeze({ rank: 3, label: 'Capable', minimumXp: 260 }),
  Object.freeze({ rank: 4, label: 'Advanced', minimumXp: 480 }),
  Object.freeze({ rank: 5, label: 'Specialist', minimumXp: 780 })
]);

const PROFICIENCY_RANKS = Object.freeze([
  Object.freeze({ rank: 0, label: 'New', minimumXp: 0 }),
  Object.freeze({ rank: 1, label: 'Familiar', minimumXp: 30 }),
  Object.freeze({ rank: 2, label: 'Practiced', minimumXp: 90 }),
  Object.freeze({ rank: 3, label: 'Skilled', minimumXp: 190 }),
  Object.freeze({ rank: 4, label: 'Expert', minimumXp: 340 })
]);

function definitionById(definitions, id) {
  return definitions.find((entry) => entry.id === String(id || '')) || null;
}

function rankForXp(ranks, xp = 0) {
  const total = Math.max(0, Number(xp) || 0);
  return ranks.slice().reverse().find((entry) => total >= entry.minimumXp) || ranks[0];
}

export {
  ATTRIBUTE_CREATION_MAXIMUM,
  ATTRIBUTE_CREATION_MINIMUM,
  ATTRIBUTE_CUSTOM_POINT_BUDGET,
  ATTRIBUTE_DEFINITIONS,
  ATTRIBUTE_MAXIMUM,
  ATTRIBUTE_MINIMUM,
  BACKGROUND_DEFINITIONS,
  BALANCED_ATTRIBUTES,
  CHARACTER_SCHEMA_VERSION,
  PROFICIENCY_DEFINITIONS,
  PROFICIENCY_RANKS,
  PROGRESSION_RULES_VERSION,
  SPECIALTY_DEFINITIONS,
  SPECIALTY_RANKS,
  TRAIT_DEFINITIONS,
  definitionById,
  rankForXp
};
