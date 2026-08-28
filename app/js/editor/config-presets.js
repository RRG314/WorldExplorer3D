import { presetFieldGroup } from './config-preset-utils.js?v=1';
import { INDOOR_OVERLAY_PRESETS } from './config-presets-indoors.js?v=1';

const OVERLAY_PRESETS = Object.freeze([
  {
    id: 'road',
    label: 'Road',
    category: 'transport',
    icon: 'Road',
    geometryType: 'LineString',
    geometryTypes: ['LineString'],
    featureClass: 'road',
    color: '#f59e0b',
    sourceType: 'base_patch',
    mergeMode: 'local_replace',
    tags: { highway: 'residential', name: '', surface: 'asphalt' },
    threeD: { layer: 0, bridge: false, tunnel: false, surface: 'asphalt' },
    fieldGroups: [
      presetFieldGroup('basics', 'Road Basics', ['name', 'road_class', 'lanes', 'oneway']),
      presetFieldGroup('structure', 'Surface And Structure', ['surface', 'bridge', 'tunnel', 'layer'])
    ],
    requiredFields: ['road_class'],
    validationRules: ['feature.road.class', 'feature.bridgeTunnelExclusive'],
    search: ['road', 'street', 'drive', 'highway', 'avenue'],
    help: {
      description: 'Use for drivable road segments that should affect runtime traversal or visual correction.',
      whenToUse: [
        'A road is missing from the base world.',
        'A local segment needs corrected class, surface, lanes, or bridge/tunnel handling.',
        'You are patching a short local replacement instead of changing raw OSM ingest.'
      ],
      doNotUse: [
        'Sidewalks or pedestrian-only paths.',
        'Rail lines or tram corridors.',
        'Indoor routes.'
      ],
      mistakes: [
        'Using a road preset for a parking aisle or driveway that should be a service road.',
        'Forgetting to mark one-way travel when it materially changes traversal.'
      ],
      moderationNotes: 'Local replacements need a clear base feature reference and should not silently expand beyond the intended segment.',
      relatedPresetIds: ['footway', 'cycleway', 'parking']
    }
  },
  {
    id: 'footway',
    label: 'Footpath',
    category: 'transport',
    icon: 'Walk',
    geometryType: 'LineString',
    geometryTypes: ['LineString'],
    featureClass: 'footway',
    color: '#e5e7eb',
    sourceType: 'overlay_new',
    mergeMode: 'additive',
    tags: { highway: 'footway', footway: 'sidewalk', surface: 'paved', access: 'yes', name: '' },
    threeD: { layer: 0, bridge: false, tunnel: false, surface: 'paved' },
    fieldGroups: [
      presetFieldGroup('basics', 'Footpath Basics', ['name', 'footway_type', 'access']),
      presetFieldGroup('structure', 'Surface And Structure', ['surface', 'bridge', 'tunnel', 'layer'])
    ],
    requiredFields: ['footway_type'],
    validationRules: ['feature.bridgeTunnelExclusive'],
    search: ['footway', 'path', 'sidewalk', 'pedestrian', 'trail'],
    help: {
      description: 'Use for pedestrian movement lines such as sidewalks, shared paths, or crossings.',
      whenToUse: [
        'The pedestrian network is missing or incomplete.',
        'A sidewalk or crossing needs local correction for traversal or presentation.'
      ],
      doNotUse: [
        'Drivable vehicle roads.',
        'Dedicated bike infrastructure unless pedestrians are secondary.'
      ],
      mistakes: [
        'Using a road preset for sidewalks.',
        'Marking private paths as public without setting access.'
      ],
      moderationNotes: 'Access and surface matter for route quality. Use them when known.',
      relatedPresetIds: ['road', 'cycleway', 'entrance']
    }
  },
  {
    id: 'cycleway',
    label: 'Bike Path',
    category: 'transport',
    icon: 'Bike',
    geometryType: 'LineString',
    geometryTypes: ['LineString'],
    featureClass: 'cycleway',
    color: '#34d399',
    sourceType: 'overlay_new',
    mergeMode: 'additive',
    tags: { highway: 'cycleway', bicycle: 'designated', surface: 'paved', name: '' },
    threeD: { layer: 0, bridge: false, tunnel: false, surface: 'paved' },
    fieldGroups: [
      presetFieldGroup('basics', 'Bike Path Basics', ['name', 'cycleway_type', 'access', 'oneway']),
      presetFieldGroup('structure', 'Surface And Structure', ['surface', 'bridge', 'tunnel', 'layer'])
    ],
    requiredFields: ['cycleway_type'],
    validationRules: ['feature.bridgeTunnelExclusive'],
    search: ['cycleway', 'bike', 'bicycle', 'greenway', 'lane'],
    help: {
      description: 'Use for bicycle-priority links that should appear and route as cycling infrastructure.',
      whenToUse: [
        'A dedicated or shared bike path is missing.',
        'An existing cycling segment needs corrected directionality, access, or structure.'
      ],
      doNotUse: [
        'Pedestrian-only paths.',
        'General-purpose vehicle roads.'
      ],
      mistakes: [
        'Using the cycleway preset for a painted lane that should remain part of a vehicle road patch.',
        'Forgetting access restrictions or one-way travel.'
      ],
      moderationNotes: 'Cycleway geometry should match actual ridable paths, not wide road polygons.',
      relatedPresetIds: ['road', 'footway']
    }
  },
  {
    id: 'railway',
    label: 'Railway',
    category: 'transport',
    icon: 'Rail',
    geometryType: 'LineString',
    geometryTypes: ['LineString'],
    featureClass: 'railway',
    color: '#94a3b8',
    sourceType: 'base_patch',
    mergeMode: 'render_override',
    tags: { railway: 'rail', electrified: 'no', name: '' },
    threeD: { layer: 0, bridge: false, tunnel: false, surface: 'ballast' },
    fieldGroups: [
      presetFieldGroup('basics', 'Rail Basics', ['name', 'railway_type', 'electrified']),
      presetFieldGroup('structure', 'Surface And Structure', ['surface', 'bridge', 'tunnel', 'layer'])
    ],
    requiredFields: ['railway_type'],
    validationRules: ['feature.railway.class', 'feature.bridgeTunnelExclusive'],
    search: ['railway', 'rail', 'track', 'tram', 'train'],
    help: {
      description: 'Use for rail lines that need visual correction, supplementing, or clear subtype metadata.',
      whenToUse: [
        'A rail segment is missing or misclassified.',
        'A bridge or tunnel appears incorrectly in the world.'
      ],
      doNotUse: [
        'Road traffic corridors.',
        'Pedestrian or bicycle infrastructure.'
      ],
      mistakes: [
        'Using a railway overlay without the matching base feature reference for render overrides.',
        'Forgetting subtype differences like tram versus heavy rail.'
      ],
      moderationNotes: 'Rail overrides should be tightly scoped and easy to compare against the base feature.',
      relatedPresetIds: ['road']
    }
  },
  {
    id: 'building',
    label: 'Building',
    category: 'structures',
    icon: 'Bldg',
    geometryType: 'Polygon',
    geometryTypes: ['Polygon'],
    featureClass: 'building',
    color: '#60a5fa',
    sourceType: 'base_patch',
    mergeMode: 'render_override',
    tags: { building: 'yes', name: '' },
    threeD: { height: null, buildingLevels: null, minHeight: 0, roofShape: 'flat', layer: 0, entrances: [] },
    relations: { indoorShell: { enabled: false, levels: [] } },
    fieldGroups: [
      presetFieldGroup('identity', 'Building Identity', ['name', 'building_type']),
      presetFieldGroup('shell', '3D Shell', ['building_levels', 'height', 'min_height', 'roof_shape']),
      presetFieldGroup('future-indoor', 'Indoor Levels', ['indoor_shell_levels'])
    ],
    requiredFields: ['building_type'],
    validationRules: ['feature.building.heightOrLevels'],
    search: ['building', 'footprint', 'tower', 'house', 'structure'],
    help: {
      description: 'Use for real building footprints and shells that affect how the 3D world renders.',
      whenToUse: [
        'A building footprint is missing or clearly wrong.',
        'The building needs corrected levels, height, or roof shape.',
        'You need to add entrances or describe its indoor levels.'
      ],
      doNotUse: [
        'Temporary props or decorative objects.',
        'Individual rooms or interior circulation.'
      ],
      mistakes: [
        'Submitting a building shell without levels or height when that data is reasonably known.',
        'Using a building overlay when only an entrance point is missing.'
      ],
      moderationNotes: 'Building render overrides should stay compatible with the base shell or clearly explain why a full replacement is required.',
      relatedPresetIds: ['entrance', 'interior_room', 'elevator']
    }
  },
  {
    id: 'building_part',
    label: 'Building Part',
    category: 'structures',
    icon: 'Part',
    geometryType: 'Polygon',
    geometryTypes: ['Polygon'],
    featureClass: 'building_part',
    color: '#93c5fd',
    sourceType: 'base_patch',
    mergeMode: 'render_override',
    tags: { 'building:part': 'part', name: '' },
    threeD: { height: null, buildingLevels: null, minHeight: 0, roofShape: 'flat', layer: 0, entrances: [] },
    relations: { indoorShell: { enabled: false, levels: [] } },
    fieldGroups: [
      presetFieldGroup('identity', 'Part Identity', ['name', 'building_part_kind', 'building_ref']),
      presetFieldGroup('vertical', 'Vertical Placement', ['building_min_level', 'part_level', 'building_levels', 'height', 'min_height', 'roof_shape'])
    ],
    requiredFields: ['building_part_kind'],
    validationRules: ['feature.building.heightOrLevels', 'feature.buildingPart.verticalPlacement'],
    search: ['building part', 'skywalk', 'balcony', 'roof', 'overhang', 'connector'],
    help: {
      description: 'Use for roofs, balconies, canopies, overhangs, and elevated building sections that do not start at ground level.',
      whenToUse: [
        'A skywalk-like connector or overhang needs its own footprint.',
        'A roof, balcony, or canopy should render above the street instead of down to ground level.',
        'A building section starts above grade and needs explicit vertical placement.'
      ],
      doNotUse: [
        'A normal whole-building shell that starts at the ground.',
        'Standalone roads or pedestrian bridges that are not part of a building.'
      ],
      mistakes: [
        'Leaving a balcony or roof part without a level, min level, or min height.',
        'Using a building part when the base building footprint itself is what needs correction.'
      ],
      moderationNotes: 'Building parts should explain how they relate to the parent shell and how far above grade they begin.',
      relatedPresetIds: ['building', 'entrance']
    }
  },
  {
    id: 'entrance',
    label: 'Entrance',
    category: 'structures',
    icon: 'Door',
    geometryType: 'Point',
    geometryTypes: ['Point'],
    featureClass: 'entrance',
    color: '#f43f5e',
    sourceType: 'base_patch',
    mergeMode: 'additive',
    tags: { entrance: 'yes', access: 'yes', name: '' },
    threeD: { layer: 0 },
    fieldGroups: [
      presetFieldGroup('basics', 'Entrance Basics', ['name', 'entrance_type', 'access']),
      presetFieldGroup('placement', 'Placement', ['level', 'building_ref'])
    ],
    requiredFields: ['entrance_type'],
    validationRules: ['feature.pointLabelRecommended'],
    search: ['entrance', 'door', 'entry', 'access'],
    help: {
      description: 'Use for exterior access points that help people enter a building or shell.',
      whenToUse: [
        'A building access point is missing.',
        'You need to specify public, service, or emergency access.'
      ],
      doNotUse: [
        'Whole building shells.',
        'Indoor rooms or circulation polygons.'
      ],
      mistakes: [
        'Placing an entrance far away from the shell it belongs to.',
        'Omitting the level for multi-level contexts where the entrance is not at grade.'
      ],
      moderationNotes: 'Entrances are most useful when their building relationship is obvious.',
      relatedPresetIds: ['building', 'interior_room']
    }
  },
  {
    id: 'parking',
    label: 'Parking',
    category: 'structures',
    icon: 'Park',
    geometryType: 'Polygon',
    geometryTypes: ['Polygon'],
    featureClass: 'parking',
    color: '#9ca3af',
    sourceType: 'overlay_new',
    mergeMode: 'additive',
    tags: { amenity: 'parking', parking: 'surface', access: 'yes', name: '' },
    threeD: { layer: 0, surface: 'paved' },
    fieldGroups: [
      presetFieldGroup('basics', 'Parking Basics', ['name', 'parking_type', 'access']),
      presetFieldGroup('surface', 'Surface', ['surface', 'layer'])
    ],
    requiredFields: ['parking_type'],
    validationRules: [],
    search: ['parking', 'lot', 'garage'],
    help: {
      description: 'Use for mapped parking areas that should appear as usable outdoor features.',
      whenToUse: [
        'A parking lot or structured parking footprint is missing.',
        'The parking type or access is wrong.'
      ],
      doNotUse: [
        'Road travel lanes.',
        'Individual parking-space micro-mapping in this pass.'
      ],
      mistakes: [
        'Using parking to cover broad mixed-use paved areas.',
        'Ignoring access when the lot is private or customers-only.'
      ],
      moderationNotes: 'Keep parking overlays scoped to the actual parking footprint.',
      relatedPresetIds: ['road']
    }
  },
  {
    id: 'water',
    label: 'Water',
    category: 'landscape',
    icon: 'Water',
    geometryType: 'Polygon',
    geometryTypes: ['Polygon'],
    featureClass: 'water',
    color: '#38bdf8',
    sourceType: 'overlay_new',
    mergeMode: 'render_override',
    tags: { natural: 'water', water: 'pond', name: '' },
    threeD: { layer: 0, surface: 'water' },
    fieldGroups: [
      presetFieldGroup('basics', 'Water Basics', ['name', 'water_kind'])
    ],
    requiredFields: ['water_kind'],
    validationRules: [],
    search: ['water', 'pond', 'lake', 'riverbank', 'canal'],
    help: {
      description: 'Use for lakes, ponds, basins, canals, and other water areas that should render as water.',
      whenToUse: [
        'A water body is missing or shaped incorrectly.',
        'A local render override is needed for a water area.'
      ],
      doNotUse: [
        'Paved plazas or decorative blue surfaces that are not water.',
        'Linear waterways unless they are better represented as areas in this pass.'
      ],
      mistakes: [
        'Using water for any depression or dark area in imagery.',
        'Drawing a water polygon that overlaps buildings or roads without intention.'
      ],
      moderationNotes: 'Water render overrides should explain why the base layer is insufficient.',
      relatedPresetIds: ['park_landuse']
    }
  },
  {
    id: 'park_landuse',
    label: 'Landuse / Park',
    category: 'landscape',
    icon: 'Land',
    geometryType: 'Polygon',
    geometryTypes: ['Polygon'],
    featureClass: 'landuse',
    color: '#22c55e',
    sourceType: 'overlay_new',
    mergeMode: 'additive',
    tags: { leisure: 'park', landuse: 'recreation_ground', name: '' },
    threeD: { layer: 0, surface: 'grass' },
    fieldGroups: [
      presetFieldGroup('basics', 'Outdoor Area Basics', ['name', 'park_kind'])
    ],
    requiredFields: ['park_kind'],
    validationRules: [],
    search: ['park', 'landuse', 'green', 'garden', 'plaza'],
    help: {
      description: 'Use for parks, gardens, plazas, and other landuse patches that improve the outdoor world.',
      whenToUse: [
        'Green or public-use areas are missing.',
        'The area needs a better semantic label for rendering or discovery.'
      ],
      doNotUse: [
        'Specific POIs that should be mapped as points.',
        'Indoor areas.'
      ],
      mistakes: [
        'Using one giant park polygon for several distinct spaces.',
        'Forgetting that plazas are hardscape, not vegetation.'
      ],
      moderationNotes: 'Broad area overlays should respect existing roads, buildings, and water boundaries.',
      relatedPresetIds: ['water', 'tree', 'poi_marker']
    }
  },
  {
    id: 'tree',
    label: 'Tree',
    category: 'landscape',
    icon: 'Tree',
    geometryType: 'Point',
    geometryTypes: ['Point'],
    featureClass: 'tree',
    color: '#16a34a',
    sourceType: 'overlay_new',
    mergeMode: 'additive',
    tags: { natural: 'tree', species: '', name: '' },
    threeD: { height: 6, minHeight: 0, layer: 0 },
    fieldGroups: [
      presetFieldGroup('basics', 'Tree Basics', ['name', 'tree_species', 'height'])
    ],
    requiredFields: [],
    validationRules: [],
    search: ['tree', 'vegetation', 'planting'],
    help: {
      description: 'Use for individual trees or notable planted points that matter in the 3D world.',
      whenToUse: [
        'A significant tree or planting landmark is missing.',
        'You want a lightweight natural point without drawing a full landuse area.'
      ],
      doNotUse: [
        'Large wooded areas that should be landuse or natural polygons.',
        'Generic points of interest.'
      ],
      mistakes: [
        'Over-mapping dense tree clusters one by one in a pass intended for major world corrections.'
      ],
      moderationNotes: 'Tree points are most valuable when they change readability or landmarking.',
      relatedPresetIds: ['park_landuse', 'poi_marker']
    }
  },
  {
    id: 'poi_marker',
    label: 'POI / Marker',
    category: 'places',
    icon: 'POI',
    geometryType: 'Point',
    geometryTypes: ['Point'],
    featureClass: 'poi',
    color: '#f97316',
    sourceType: 'overlay_new',
    mergeMode: 'additive',
    tags: { tourism: 'attraction', name: '' },
    threeD: { layer: 0 },
    fieldGroups: [
      presetFieldGroup('basics', 'POI Basics', ['name', 'poi_kind', 'ref', 'access'])
    ],
    requiredFields: ['poi_kind'],
    validationRules: ['feature.pointLabelRecommended'],
    search: ['poi', 'place', 'business', 'marker', 'landmark'],
    help: {
      description: 'Use for discoverable points, lightweight landmarks, and visitor-facing markers.',
      whenToUse: [
        'There is a specific named place worth surfacing in the world.',
        'A point marker should supplement the base map without changing the base data.'
      ],
      doNotUse: [
        'Road or building geometry.',
        'Open-ended notes that are not actual world features.'
      ],
      mistakes: [
        'Creating unnamed generic markers with no clear purpose.',
        'Using a POI when an entrance or building preset is more precise.'
      ],
      moderationNotes: 'Public-facing markers benefit from a readable name and a clear POI type.',
      relatedPresetIds: ['entrance', 'tree']
    }
  },
  ...INDOOR_OVERLAY_PRESETS
]);

export { OVERLAY_PRESETS };
