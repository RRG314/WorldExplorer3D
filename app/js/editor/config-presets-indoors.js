import { presetFieldGroup } from './config-preset-utils.js?v=1';

const INDOOR_OVERLAY_PRESETS = Object.freeze([
  {
    id: 'interior_room',
    label: 'Interior Room',
    category: 'indoors',
    icon: 'Room',
    geometryType: 'Polygon',
    geometryTypes: ['Polygon'],
    featureClass: 'indoor_room',
    color: '#a78bfa',
    sourceType: 'overlay_new',
    mergeMode: 'additive',
    tags: { indoor: 'room', room: 'generic', access: 'private', name: '' },
    threeD: { layer: 0 },
    fieldGroups: [
      presetFieldGroup('basics', 'Room Basics', ['name', 'room_type', 'ref', 'access']),
      presetFieldGroup('placement', 'Placement', ['level', 'building_ref'])
    ],
    requiredFields: ['room_type', 'level'],
    validationRules: ['feature.levelRequired'],
    search: ['room', 'interior', 'suite', 'indoor'],
    help: {
      description: 'Use for room shells inside a building when you need indoor-ready geometry and semantics.',
      whenToUse: [
        'You are preparing multi-level indoor geometry for a building shell.',
        'The room footprint matters for future interior navigation or rendering.'
      ],
      doNotUse: [
        'Outdoor building footprints.',
        'Hallways or circulation-only connectors.'
      ],
      mistakes: [
        'Skipping the level or building reference.',
        'Using the room preset for whole-floor circulation.'
      ],
      moderationNotes: 'Indoor room work is still scaffolded. Keep geometry disciplined and level-aware.',
      relatedPresetIds: ['corridor', 'stairs', 'elevator', 'building']
    }
  },
  {
    id: 'corridor',
    label: 'Corridor',
    category: 'indoors',
    icon: 'Hall',
    geometryType: 'LineString',
    geometryTypes: ['LineString'],
    featureClass: 'indoor_corridor',
    color: '#c084fc',
    sourceType: 'overlay_new',
    mergeMode: 'additive',
    tags: { indoor: 'corridor', access: 'private', name: '' },
    threeD: { layer: 0 },
    fieldGroups: [
      presetFieldGroup('basics', 'Corridor Basics', ['name', 'corridor_type', 'access']),
      presetFieldGroup('placement', 'Placement', ['level', 'building_ref'])
    ],
    requiredFields: ['level'],
    validationRules: ['feature.levelRequired'],
    search: ['corridor', 'hall', 'hallway', 'indoor'],
    help: {
      description: 'Use for indoor circulation paths while the dedicated interior editor is still scaffolded.',
      whenToUse: [
        'You need a circulation centerline for indoor traversal scaffolding.',
        'A hallway or concourse path should be represented without room polygons.'
      ],
      doNotUse: [
        'Outdoor paths.',
        'Individual rooms.'
      ],
      mistakes: [
        'Drawing corridor lines without a level.',
        'Using corridor for stairs or elevators.'
      ],
      moderationNotes: 'Corridor geometry is interim indoor data. Keep it clean and tied to a building shell.',
      relatedPresetIds: ['interior_room', 'stairs', 'elevator']
    }
  },
  {
    id: 'stairs',
    label: 'Stairs',
    category: 'indoors',
    icon: 'Stair',
    geometryType: 'LineString',
    geometryTypes: ['LineString'],
    featureClass: 'stairs',
    color: '#fb7185',
    sourceType: 'overlay_new',
    mergeMode: 'additive',
    tags: { highway: 'steps', indoor: 'yes', access: 'yes', name: '' },
    threeD: { layer: 0, stairs: [] },
    fieldGroups: [
      presetFieldGroup('basics', 'Stairs Basics', ['name', 'access']),
      presetFieldGroup('placement', 'Placement', ['level', 'building_ref', 'connector_levels'])
    ],
    requiredFields: ['level'],
    validationRules: ['feature.levelRequired', 'feature.connectorLevelsRecommended'],
    search: ['stairs', 'steps', 'staircase', 'indoor'],
    help: {
      description: 'Use for level-connecting stair geometry as indoor connector scaffold data.',
      whenToUse: [
        'You need to indicate how levels connect inside a building.',
        'A future indoor route should know where stairs are.'
      ],
      doNotUse: [
        'Generic entrances.',
        'Elevators.'
      ],
      mistakes: [
        'Not listing served levels when they are known.',
        'Leaving the connector unrelated to a building shell.'
      ],
      moderationNotes: 'Indoor connectors are scaffold data in this pass. Served levels make review much easier.',
      relatedPresetIds: ['elevator', 'corridor']
    }
  },
  {
    id: 'elevator',
    label: 'Elevator',
    category: 'indoors',
    icon: 'Lift',
    geometryType: 'Point',
    geometryTypes: ['Point'],
    featureClass: 'elevator',
    color: '#f472b6',
    sourceType: 'overlay_new',
    mergeMode: 'additive',
    tags: { highway: 'elevator', indoor: 'yes', access: 'yes', name: '' },
    threeD: { layer: 0, elevators: [] },
    fieldGroups: [
      presetFieldGroup('basics', 'Elevator Basics', ['name', 'ref', 'access']),
      presetFieldGroup('placement', 'Placement', ['level', 'building_ref', 'connector_levels'])
    ],
    requiredFields: ['level'],
    validationRules: ['feature.levelRequired', 'feature.connectorLevelsRecommended'],
    search: ['elevator', 'lift', 'indoor'],
    help: {
      description: 'Use for indoor elevator anchors and served-level scaffolding.',
      whenToUse: [
        'You need a level connector point for accessibility or future indoor traversal.',
        'An elevator location should be recorded before the full interior editor ships.'
      ],
      doNotUse: [
        'Outdoor markers with no building context.',
        'Stair geometry.'
      ],
      mistakes: [
        'Skipping the served levels.',
        'Using the elevator preset without a building or level context.'
      ],
      moderationNotes: 'Elevator overlays should be explicit about levels served and building context.',
      relatedPresetIds: ['stairs', 'corridor', 'interior_room']
    }
  }
]);

export { INDOOR_OVERLAY_PRESETS };
