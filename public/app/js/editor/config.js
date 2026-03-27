const OVERLAY_SOURCE_TYPES = Object.freeze([
  'overlay_new',
  'base_patch',
  'render_override'
]);

const OVERLAY_MERGE_MODES = Object.freeze([
  'additive',
  'render_override',
  'local_replace'
]);

const OVERLAY_REVIEW_STATES = Object.freeze([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'needs_changes',
  'superseded'
]);

const OVERLAY_PUBLICATION_STATES = Object.freeze([
  'unpublished',
  'published',
  'rolled_back'
]);

const OVERLAY_GEOMETRY_TYPES = Object.freeze([
  'Point',
  'LineString',
  'Polygon'
]);

const OVERLAY_TOOL_IDS = Object.freeze([
  'select',
  'draw_point',
  'draw_line',
  'draw_polygon',
  'add_vertex',
  'delete_vertex',
  'split_line',
  'merge_features'
]);

const OVERLAY_EDITOR_TOOLS = Object.freeze([
  { id: 'select', label: 'Select', hotkey: 'V', description: 'Select overlay or base features, move vertices, and inspect geometry.' },
  { id: 'draw_point', label: 'Point', hotkey: '1', description: 'Create point features like POIs, trees, markers, entrances, and indoor anchors.' },
  { id: 'draw_line', label: 'Line', hotkey: '2', description: 'Create roads, footpaths, cycleways, railways, stairs, and corridor centerlines.' },
  { id: 'draw_polygon', label: 'Polygon', hotkey: '3', description: 'Create building shells, landuse, water, parking, and indoor rooms.' },
  { id: 'add_vertex', label: 'Add Vertex', hotkey: 'A', description: 'Insert a new vertex on the nearest selected edge.' },
  { id: 'delete_vertex', label: 'Delete Vertex', hotkey: 'D', description: 'Remove a selected vertex while preserving valid geometry.' },
  { id: 'split_line', label: 'Split', hotkey: 'S', description: 'Split a selected line feature at the nearest segment.' },
  { id: 'merge_features', label: 'Merge', hotkey: 'M', description: 'Merge compatible overlay line features that share endpoints.' }
]);

const OVERLAY_PRESET_CATEGORIES = Object.freeze([
  {
    id: 'transport',
    label: 'Transport',
    description: 'Roads, paths, cycleways, rail, and movement infrastructure.'
  },
  {
    id: 'structures',
    label: 'Structures',
    description: 'Buildings, entrances, and built shells that affect 3D rendering.'
  },
  {
    id: 'landscape',
    label: 'Landscape',
    description: 'Water, vegetation, landuse, and outdoor environmental features.'
  },
  {
    id: 'places',
    label: 'Places',
    description: 'Named points of interest, trees, markers, and public-facing content.'
  },
  {
    id: 'indoors',
    label: 'Indoors',
    description: 'Level-aware indoor shells and connector scaffolding for future interior editing.'
  }
]);

const OVERLAY_VALIDATION_RULES = Object.freeze([
  {
    id: 'geometry.line.length',
    label: 'Line geometry length',
    description: 'Line features need enough distance between vertices to render and route safely.'
  },
  {
    id: 'geometry.polygon.area',
    label: 'Polygon area',
    description: 'Area features need a meaningful footprint and a closed usable ring.'
  },
  {
    id: 'geometry.point.location',
    label: 'Point location',
    description: 'Point features need a valid world position.'
  },
  {
    id: 'merge.baseFeatureRequired',
    label: 'Base feature reference',
    description: 'Render overrides and local replacements must target a concrete base feature.'
  },
  {
    id: 'field.required',
    label: 'Required field',
    description: 'Required preset fields must be set before the feature can be submitted.'
  },
  {
    id: 'feature.road.class',
    label: 'Road class',
    description: 'Road presets must declare a road class such as residential or primary.'
  },
  {
    id: 'feature.railway.class',
    label: 'Railway type',
    description: 'Rail presets need a railway type so they render and review correctly.'
  },
  {
    id: 'feature.building.heightOrLevels',
    label: 'Building 3D data',
    description: 'Buildings should have at least levels or height for stable 3D output.'
  },
  {
    id: 'feature.buildingPart.verticalPlacement',
    label: 'Building part vertical placement',
    description: 'Elevated building parts should describe where they start above grade or which level they belong to.'
  },
  {
    id: 'feature.bridgeTunnelExclusive',
    label: 'Bridge or tunnel',
    description: 'A feature should not be both a bridge and a tunnel at the same time.'
  },
  {
    id: 'feature.levelRequired',
    label: 'Indoor level reference',
    description: 'Indoor features should declare a level so they can be reviewed and layered correctly.'
  },
  {
    id: 'feature.pointLabelRecommended',
    label: 'Point label',
    description: 'Public-facing points should usually have a readable name or identifying ref.'
  },
  {
    id: 'feature.connectorLevelsRecommended',
    label: 'Connector served levels',
    description: 'Stairs and elevators should list which levels they connect.'
  }
]);

function sanitizeText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function finiteNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  const next = sanitizeText(value, 16).toLowerCase();
  return next === 'true' || next === 'yes' || next === '1' || next === 'on';
}

function parseDelimitedList(value, maxEntries = 12, itemMax = 40) {
  return String(value || '')
    .split(/[\n,>]+/g)
    .map((entry) => sanitizeText(entry, itemMax))
    .filter(Boolean)
    .slice(0, maxEntries);
}

function ensureTags(feature) {
  if (!feature.tags || typeof feature.tags !== 'object') feature.tags = {};
  return feature.tags;
}

function ensureThreeD(feature) {
  if (!feature.threeD || typeof feature.threeD !== 'object') feature.threeD = {};
  return feature.threeD;
}

function ensureRelations(feature) {
  if (!feature.relations || typeof feature.relations !== 'object') feature.relations = {};
  if (!feature.relations.indoorShell || typeof feature.relations.indoorShell !== 'object') {
    feature.relations.indoorShell = { enabled: false, levels: [] };
  }
  return feature.relations;
}

function deleteIfEmpty(object, key) {
  if (!object || !key) return;
  if (object[key] == null || object[key] === '') delete object[key];
}

function setTag(feature, key, value, max = 120) {
  const tags = ensureTags(feature);
  const cleanValue = sanitizeText(value, max);
  if (!cleanValue) delete tags[key];
  else tags[key] = cleanValue;
}

function getTag(feature, key) {
  return sanitizeText(feature?.tags?.[key] || '', 180);
}

function setBooleanTag(feature, key, enabled) {
  const tags = ensureTags(feature);
  if (enabled) tags[key] = 'yes';
  else delete tags[key];
}

function setNumericTag(feature, key, value, options = {}) {
  const next = value === '' || value == null ? null : Number(value);
  const tags = ensureTags(feature);
  if (!Number.isFinite(next)) {
    delete tags[key];
    return null;
  }
  const precision = Number.isFinite(options.precision) ? options.precision : null;
  tags[key] = precision != null ? String(next.toFixed(precision)) : String(next);
  return next;
}

function setRelationValue(feature, key, value, max = 120) {
  const relations = ensureRelations(feature);
  const cleanValue = sanitizeText(value, max);
  if (!cleanValue) delete relations[key];
  else relations[key] = cleanValue;
  return cleanValue;
}

function getRelationValue(feature, key) {
  return sanitizeText(feature?.relations?.[key] || '', 180);
}

function setLevelValue(feature, value) {
  const cleanValue = setRelationValue(feature, 'level', value, 40);
  feature.level = cleanValue;
}

function setBuildingRefValue(feature, value) {
  const cleanValue = setRelationValue(feature, 'buildingRef', value, 180);
  feature.buildingRef = cleanValue;
}

function setIndoorShellLevels(feature, value) {
  const relations = ensureRelations(feature);
  const levels = parseDelimitedList(value, 24, 24);
  relations.indoorShell.enabled = levels.length > 0;
  relations.indoorShell.levels = levels.map((level) => ({
    level,
    label: level === '0' ? 'Ground' : `Level ${level}`
  }));
}

function getIndoorShellLevels(feature) {
  const levels = Array.isArray(feature?.relations?.indoorShell?.levels)
    ? feature.relations.indoorShell.levels.map((entry) => sanitizeText(entry?.level || '', 24)).filter(Boolean)
    : [];
  return levels.join(', ');
}

function setConnectorLevels(feature, key, value) {
  const threeD = ensureThreeD(feature);
  threeD[key] = parseDelimitedList(value, 16, 24);
}

function getConnectorLevels(feature, key) {
  return Array.isArray(feature?.threeD?.[key]) ? feature.threeD[key].join(', ') : '';
}

function normalizeNumberInput(value, options = {}) {
  if (value === '' || value == null) return null;
  const next = Number(value);
  if (!Number.isFinite(next)) return null;
  if (Number.isFinite(options.min) && next < options.min) return Number(options.min);
  if (Number.isFinite(options.max) && next > options.max) return Number(options.max);
  return next;
}

function createField(definition = {}) {
  return Object.freeze(definition);
}

function textField(definition = {}) {
  return createField({
    kind: 'text',
    placeholder: '',
    maxLength: 120,
    ...definition
  });
}

function textareaField(definition = {}) {
  return createField({
    kind: 'textarea',
    placeholder: '',
    maxLength: 320,
    rows: 3,
    ...definition
  });
}

function numberField(definition = {}) {
  return createField({
    kind: 'number',
    step: 1,
    min: null,
    max: null,
    units: '',
    ...definition
  });
}

function selectField(definition = {}) {
  return createField({
    kind: 'select',
    options: [],
    ...definition
  });
}

function toggleField(definition = {}) {
  return createField({
    kind: 'toggle',
    ...definition
  });
}

const OVERLAY_FIELD_DEFINITIONS = Object.freeze([
  textField({
    id: 'name',
    label: 'Name',
    helpText: 'Public-facing name shown in labels, review summaries, and point markers when relevant.',
    example: 'Union Station',
    advancedMapping: [
      { path: 'tags.name', label: 'Name tag' }
    ],
    readValue: (feature) => getTag(feature, 'name'),
    applyValue: (feature, value) => setTag(feature, 'name', value, 120),
    summarize: (value) => sanitizeText(value || '', 120)
  }),
  textField({
    id: 'ref',
    label: 'Reference',
    helpText: 'Short code or room/reference label used to identify the feature without a full public name.',
    example: 'A-214',
    advancedMapping: [
      { path: 'tags.ref', label: 'Reference tag' }
    ],
    readValue: (feature) => getTag(feature, 'ref'),
    applyValue: (feature, value) => setTag(feature, 'ref', value, 80),
    summarize: (value) => value ? `Ref ${sanitizeText(value, 80)}` : ''
  }),
  selectField({
    id: 'road_class',
    label: 'Road Class',
    helpText: 'Choose the road hierarchy that best matches how this segment behaves in the world.',
    example: 'residential',
    options: [
      { value: 'residential', label: 'Residential', description: 'Local neighborhood roads.' },
      { value: 'service', label: 'Service', description: 'Access roads, alleys, and service areas.' },
      { value: 'living_street', label: 'Living Street', description: 'Pedestrian-priority shared streets.' },
      { value: 'tertiary', label: 'Tertiary', description: 'Minor connector roads.' },
      { value: 'secondary', label: 'Secondary', description: 'Important connectors or district roads.' },
      { value: 'primary', label: 'Primary', description: 'Major through roads.' }
    ],
    advancedMapping: [
      { path: 'tags.highway', label: 'Road class tag' }
    ],
    readValue: (feature) => getTag(feature, 'highway') || 'residential',
    applyValue: (feature, value) => setTag(feature, 'highway', value, 40),
    summarize: (value, field) => value ? `${field.options.find((entry) => entry.value === value)?.label || value} road` : ''
  }),
  numberField({
    id: 'lanes',
    label: 'Lanes',
    helpText: 'Use the total lane count when it is known and materially affects traversal or rendering.',
    example: '2',
    min: 1,
    max: 16,
    step: 1,
    advancedMapping: [
      { path: 'tags.lanes', label: 'Lane count tag' }
    ],
    readValue: (feature) => getTag(feature, 'lanes'),
    applyValue: (feature, value) => setNumericTag(feature, 'lanes', normalizeNumberInput(value, { min: 1, max: 16 })),
    summarize: (value) => value ? `${value} lanes` : ''
  }),
  toggleField({
    id: 'oneway',
    label: 'One Way',
    helpText: 'Enable when movement on this segment should be interpreted in a single direction.',
    advancedMapping: [
      { path: 'tags.oneway', label: 'Directionality tag' }
    ],
    readValue: (feature) => getTag(feature, 'oneway') === 'yes',
    applyValue: (feature, value) => {
      const enabled = normalizeBoolean(value);
      setBooleanTag(feature, 'oneway', enabled);
    },
    summarize: (value) => value ? 'One way' : ''
  }),
  selectField({
    id: 'surface',
    label: 'Surface',
    helpText: 'Surface helps rendering, accessibility review, and route interpretation.',
    example: 'asphalt',
    options: [
      { value: 'asphalt', label: 'Asphalt' },
      { value: 'paved', label: 'Paved' },
      { value: 'concrete', label: 'Concrete' },
      { value: 'gravel', label: 'Gravel' },
      { value: 'dirt', label: 'Dirt' },
      { value: 'grass', label: 'Grass' },
      { value: 'ballast', label: 'Ballast' },
      { value: 'wood', label: 'Wood' }
    ],
    advancedMapping: [
      { path: 'tags.surface', label: 'Surface tag' },
      { path: 'threeD.surface', label: 'Render surface' }
    ],
    readValue: (feature) => feature?.threeD?.surface || getTag(feature, 'surface'),
    applyValue: (feature, value) => {
      const cleanValue = sanitizeText(value, 60).toLowerCase();
      setTag(feature, 'surface', cleanValue, 60);
      const threeD = ensureThreeD(feature);
      if (!cleanValue) delete threeD.surface;
      else threeD.surface = cleanValue;
    },
    summarize: (value) => value ? `${sanitizeText(value, 40)} surface` : ''
  }),
  toggleField({
    id: 'bridge',
    label: 'Bridge',
    helpText: 'Use this when the feature is elevated over another traversable feature or terrain.',
    advancedMapping: [
      { path: 'threeD.bridge', label: 'Bridge flag' },
      { path: 'tags.bridge', label: 'Bridge tag' }
    ],
    readValue: (feature) => feature?.threeD?.bridge === true,
    applyValue: (feature, value) => {
      const enabled = normalizeBoolean(value);
      const threeD = ensureThreeD(feature);
      threeD.bridge = enabled;
      setBooleanTag(feature, 'bridge', enabled);
    },
    summarize: (value) => value ? 'Bridge' : ''
  }),
  toggleField({
    id: 'tunnel',
    label: 'Tunnel',
    helpText: 'Use this when the feature passes under terrain or another structure.',
    advancedMapping: [
      { path: 'threeD.tunnel', label: 'Tunnel flag' },
      { path: 'tags.tunnel', label: 'Tunnel tag' }
    ],
    readValue: (feature) => feature?.threeD?.tunnel === true,
    applyValue: (feature, value) => {
      const enabled = normalizeBoolean(value);
      const threeD = ensureThreeD(feature);
      threeD.tunnel = enabled;
      setBooleanTag(feature, 'tunnel', enabled);
    },
    summarize: (value) => value ? 'Tunnel' : ''
  }),
  numberField({
    id: 'layer',
    label: 'Layer',
    helpText: 'Layer helps order stacked roads, paths, bridges, tunnels, and indoor connectors.',
    example: '1',
    step: 1,
    min: -5,
    max: 12,
    advancedMapping: [
      { path: 'threeD.layer', label: 'Render layer' },
      { path: 'tags.layer', label: 'Layer tag' }
    ],
    readValue: (feature) => Number.isFinite(Number(feature?.threeD?.layer)) ? String(feature.threeD.layer) : '0',
    applyValue: (feature, value) => {
      const next = normalizeNumberInput(value, { min: -5, max: 12 });
      const threeD = ensureThreeD(feature);
      threeD.layer = Number.isFinite(next) ? Math.round(next) : 0;
      setNumericTag(feature, 'layer', threeD.layer);
    },
    summarize: (value) => String(value || '0') !== '0' ? `Layer ${value}` : ''
  }),
  selectField({
    id: 'footway_type',
    label: 'Footpath Type',
    helpText: 'Choose the pedestrian use that best matches how this path is intended to work.',
    options: [
      { value: 'sidewalk', label: 'Sidewalk' },
      { value: 'crossing', label: 'Crossing' },
      { value: 'path', label: 'Path' },
      { value: 'pedestrian', label: 'Pedestrian Way' }
    ],
    advancedMapping: [
      { path: 'tags.highway', label: 'Pedestrian class tag' },
      { path: 'tags.footway', label: 'Footway subtype tag' }
    ],
    readValue: (feature) => getTag(feature, 'footway') || getTag(feature, 'highway') || 'sidewalk',
    applyValue: (feature, value) => {
      const cleanValue = sanitizeText(value, 40).toLowerCase() || 'sidewalk';
      setTag(feature, 'highway', cleanValue === 'pedestrian' ? 'pedestrian' : 'footway', 40);
      if (cleanValue === 'pedestrian') deleteIfEmpty(ensureTags(feature), 'footway');
      else setTag(feature, 'footway', cleanValue, 40);
    },
    summarize: (value) => value ? sanitizeText(value, 40) : ''
  }),
  selectField({
    id: 'cycleway_type',
    label: 'Bike Path Type',
    helpText: 'Describe how bicycle traffic should be treated on this segment.',
    options: [
      { value: 'cycleway', label: 'Dedicated Cycleway' },
      { value: 'shared_path', label: 'Shared Path' },
      { value: 'lane', label: 'Bike Lane' }
    ],
    advancedMapping: [
      { path: 'tags.highway', label: 'Path class tag' },
      { path: 'tags.bicycle', label: 'Bicycle access tag' },
      { path: 'tags.cycleway', label: 'Cycleway subtype tag' }
    ],
    readValue: (feature) => {
      if (getTag(feature, 'cycleway')) return getTag(feature, 'cycleway');
      if (getTag(feature, 'highway') === 'cycleway') return 'cycleway';
      return 'cycleway';
    },
    applyValue: (feature, value) => {
      const cleanValue = sanitizeText(value, 40).toLowerCase() || 'cycleway';
      setTag(feature, 'bicycle', 'designated', 40);
      if (cleanValue === 'cycleway') {
        setTag(feature, 'highway', 'cycleway', 40);
        deleteIfEmpty(ensureTags(feature), 'cycleway');
      } else {
        setTag(feature, 'highway', 'path', 40);
        setTag(feature, 'cycleway', cleanValue === 'shared_path' ? 'shared' : cleanValue, 40);
      }
    },
    summarize: (value) => value ? sanitizeText(value, 40) : ''
  }),
  selectField({
    id: 'access',
    label: 'Access',
    helpText: 'Use access when the feature is restricted, staff-only, customers-only, or otherwise not open to everyone.',
    options: [
      { value: 'yes', label: 'Public' },
      { value: 'permissive', label: 'Permissive' },
      { value: 'customers', label: 'Customers' },
      { value: 'private', label: 'Private' },
      { value: 'no', label: 'No Access' }
    ],
    advancedMapping: [
      { path: 'tags.access', label: 'Access tag' }
    ],
    readValue: (feature) => getTag(feature, 'access') || 'yes',
    applyValue: (feature, value) => setTag(feature, 'access', value || 'yes', 40),
    summarize: (value, field) => value && value !== 'yes'
      ? field.options.find((entry) => entry.value === value)?.label || value
      : ''
  }),
  selectField({
    id: 'railway_type',
    label: 'Railway Type',
    helpText: 'Describe the rail service being represented so routing and visualization stay clear.',
    options: [
      { value: 'rail', label: 'Rail' },
      { value: 'light_rail', label: 'Light Rail' },
      { value: 'tram', label: 'Tram' },
      { value: 'subway', label: 'Subway' }
    ],
    advancedMapping: [
      { path: 'tags.railway', label: 'Railway type tag' }
    ],
    readValue: (feature) => getTag(feature, 'railway') || 'rail',
    applyValue: (feature, value) => setTag(feature, 'railway', value || 'rail', 40),
    summarize: (value) => value ? sanitizeText(value.replace('_', ' '), 40) : ''
  }),
  selectField({
    id: 'electrified',
    label: 'Electrified',
    helpText: 'Optional detail for rail lines when power infrastructure meaningfully affects the feature.',
    options: [
      { value: 'no', label: 'No' },
      { value: 'yes', label: 'Yes' }
    ],
    advancedMapping: [
      { path: 'tags.electrified', label: 'Electrified tag' }
    ],
    readValue: (feature) => getTag(feature, 'electrified') || 'no',
    applyValue: (feature, value) => setTag(feature, 'electrified', value || 'no', 40),
    summarize: (value) => value === 'yes' ? 'Electrified' : ''
  }),
  selectField({
    id: 'building_type',
    label: 'Building Type',
    helpText: 'Choose the building use or shell type that best matches how the feature should read in the world.',
    options: [
      { value: 'yes', label: 'Generic Building' },
      { value: 'residential', label: 'Residential' },
      { value: 'commercial', label: 'Commercial' },
      { value: 'retail', label: 'Retail' },
      { value: 'industrial', label: 'Industrial' },
      { value: 'school', label: 'School' },
      { value: 'hospital', label: 'Hospital' },
      { value: 'hotel', label: 'Hotel' }
    ],
    advancedMapping: [
      { path: 'tags.building', label: 'Building tag' }
    ],
    readValue: (feature) => getTag(feature, 'building') || 'yes',
    applyValue: (feature, value) => setTag(feature, 'building', value || 'yes', 40),
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  numberField({
    id: 'building_levels',
    label: 'Building Levels',
    helpText: 'Preferred when you know the floor count more confidently than the absolute height.',
    example: '6',
    min: 0,
    max: 250,
    step: 1,
    advancedMapping: [
      { path: 'threeD.buildingLevels', label: '3D level count' },
      { path: 'tags.building:levels', label: 'Building levels tag' }
    ],
    readValue: (feature) => Number.isFinite(Number(feature?.threeD?.buildingLevels)) ? String(feature.threeD.buildingLevels) : getTag(feature, 'building:levels'),
    applyValue: (feature, value) => {
      const next = normalizeNumberInput(value, { min: 0, max: 250 });
      const threeD = ensureThreeD(feature);
      threeD.buildingLevels = Number.isFinite(next) ? Math.round(next) : null;
      if (threeD.buildingLevels == null) delete threeD.buildingLevels;
      setNumericTag(feature, 'building:levels', threeD.buildingLevels);
    },
    summarize: (value) => value ? `${value} levels` : ''
  }),
  numberField({
    id: 'height',
    label: 'Height',
    helpText: 'Use measured or well-estimated height in meters when available.',
    example: '22.5',
    units: 'm',
    min: 0,
    max: 1200,
    step: 0.1,
    advancedMapping: [
      { path: 'threeD.height', label: '3D height' },
      { path: 'tags.height', label: 'Height tag' }
    ],
    readValue: (feature) => Number.isFinite(Number(feature?.threeD?.height)) ? String(feature.threeD.height) : getTag(feature, 'height'),
    applyValue: (feature, value) => {
      const next = normalizeNumberInput(value, { min: 0, max: 1200 });
      const threeD = ensureThreeD(feature);
      threeD.height = Number.isFinite(next) ? next : null;
      if (threeD.height == null) delete threeD.height;
      setNumericTag(feature, 'height', threeD.height, { precision: 1 });
    },
    summarize: (value) => value ? `${value} m tall` : ''
  }),
  numberField({
    id: 'min_height',
    label: 'Min Height',
    helpText: 'Use when the visible building or path starts above ground, such as an arcade or elevated deck.',
    example: '4',
    units: 'm',
    min: 0,
    max: 200,
    step: 0.1,
    advancedMapping: [
      { path: 'threeD.minHeight', label: '3D minimum height' },
      { path: 'tags.min_height', label: 'Minimum height tag' }
    ],
    readValue: (feature) => Number.isFinite(Number(feature?.threeD?.minHeight)) ? String(feature.threeD.minHeight) : getTag(feature, 'min_height'),
    applyValue: (feature, value) => {
      const next = normalizeNumberInput(value, { min: 0, max: 200 });
      const threeD = ensureThreeD(feature);
      threeD.minHeight = Number.isFinite(next) ? next : 0;
      setNumericTag(feature, 'min_height', threeD.minHeight, { precision: 1 });
    },
    summarize: (value) => Number(value) > 0 ? `Starts ${value} m above grade` : ''
  }),
  selectField({
    id: 'building_part_kind',
    label: 'Building Part',
    helpText: 'Use this for elevated or partial building sections such as roofs, balconies, canopies, or skywalk-like connectors.',
    options: [
      { value: 'part', label: 'General Part' },
      { value: 'roof', label: 'Roof Part' },
      { value: 'balcony', label: 'Balcony' },
      { value: 'canopy', label: 'Canopy / Skywalk' }
    ],
    advancedMapping: [
      { path: 'tags.building:part', label: 'Building part tag' }
    ],
    readValue: (feature) => getTag(feature, 'building:part') || 'part',
    applyValue: (feature, value) => setTag(feature, 'building:part', value || 'part', 40),
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  numberField({
    id: 'building_min_level',
    label: 'Min Levels',
    helpText: 'Use this when the building part starts several floors above the ground and you know the floor count more clearly than the meter height.',
    example: '1',
    min: 0,
    max: 120,
    step: 1,
    advancedMapping: [
      { path: 'tags.building:min_level', label: 'Building minimum level tag' }
    ],
    readValue: (feature) => getTag(feature, 'building:min_level'),
    applyValue: (feature, value) => setNumericTag(feature, 'building:min_level', normalizeNumberInput(value, { min: 0, max: 120 })),
    summarize: (value) => value ? `Starts above ${value} levels` : ''
  }),
  textField({
    id: 'part_level',
    label: 'Part Level',
    helpText: 'Use the specific level for roofs or balconies when the part belongs to a known floor.',
    example: '3',
    advancedMapping: [
      { path: 'tags.level', label: 'OSM level tag' }
    ],
    readValue: (feature) => getTag(feature, 'level'),
    applyValue: (feature, value) => setTag(feature, 'level', value, 40),
    summarize: (value) => value ? `Part level ${sanitizeText(value, 40)}` : ''
  }),
  selectField({
    id: 'roof_shape',
    label: 'Roof Type',
    helpText: 'Use a roof type when it is clearly visible and improves the 3D shell.',
    options: [
      { value: 'flat', label: 'Flat' },
      { value: 'gabled', label: 'Gabled' },
      { value: 'hipped', label: 'Hipped' },
      { value: 'shed', label: 'Shed' },
      { value: 'dome', label: 'Dome' }
    ],
    advancedMapping: [
      { path: 'threeD.roofShape', label: '3D roof shape' },
      { path: 'tags.roof:shape', label: 'Roof shape tag' }
    ],
    readValue: (feature) => sanitizeText(feature?.threeD?.roofShape || getTag(feature, 'roof:shape') || 'flat', 40).toLowerCase() || 'flat',
    applyValue: (feature, value) => {
      const cleanValue = sanitizeText(value, 40).toLowerCase() || 'flat';
      const threeD = ensureThreeD(feature);
      threeD.roofShape = cleanValue;
      setTag(feature, 'roof:shape', cleanValue, 40);
    },
    summarize: (value, field) => {
      const label = field.options.find((entry) => entry.value === value)?.label || value;
      return label && label !== 'Flat' ? `${label} roof` : '';
    }
  }),
  textField({
    id: 'indoor_shell_levels',
    label: 'Shell Levels',
    helpText: 'Optional scaffold for future interior editing. Add comma-separated levels to mark this building as level-aware.',
    example: 'B1, 0, 1, 2',
    advancedMapping: [
      { path: 'relations.indoorShell.enabled', label: 'Indoor shell flag' },
      { path: 'relations.indoorShell.levels[]', label: 'Indoor shell levels' }
    ],
    readValue: (feature) => getIndoorShellLevels(feature),
    applyValue: (feature, value) => setIndoorShellLevels(feature, value),
    summarize: (value) => value ? `Shell levels ${sanitizeText(value, 80)}` : ''
  }),
  selectField({
    id: 'parking_type',
    label: 'Parking Type',
    helpText: 'Use the form that best matches how vehicles are stored here.',
    options: [
      { value: 'surface', label: 'Surface Lot' },
      { value: 'multi-storey', label: 'Multi-storey' },
      { value: 'underground', label: 'Underground' },
      { value: 'street_side', label: 'Street Side' }
    ],
    advancedMapping: [
      { path: 'tags.amenity', label: 'Amenity tag' },
      { path: 'tags.parking', label: 'Parking subtype tag' }
    ],
    readValue: (feature) => getTag(feature, 'parking') || 'surface',
    applyValue: (feature, value) => {
      setTag(feature, 'amenity', 'parking', 40);
      setTag(feature, 'parking', value || 'surface', 40);
    },
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  selectField({
    id: 'water_kind',
    label: 'Water Type',
    helpText: 'Describe what kind of water body or water area this overlay represents.',
    options: [
      { value: 'pond', label: 'Pond' },
      { value: 'lake', label: 'Lake' },
      { value: 'reservoir', label: 'Reservoir' },
      { value: 'basin', label: 'Basin' },
      { value: 'canal', label: 'Canal' }
    ],
    advancedMapping: [
      { path: 'tags.natural', label: 'Natural tag' },
      { path: 'tags.water', label: 'Water subtype tag' }
    ],
    readValue: (feature) => getTag(feature, 'water') || 'pond',
    applyValue: (feature, value) => {
      setTag(feature, 'natural', 'water', 40);
      setTag(feature, 'water', value || 'pond', 40);
    },
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  selectField({
    id: 'park_kind',
    label: 'Landuse / Park Type',
    helpText: 'Choose the outdoor use that best matches how the area should read in the world.',
    options: [
      { value: 'park', label: 'Park' },
      { value: 'garden', label: 'Garden' },
      { value: 'recreation_ground', label: 'Recreation Ground' },
      { value: 'plaza', label: 'Plaza' },
      { value: 'forest', label: 'Forest' }
    ],
    advancedMapping: [
      { path: 'tags.leisure', label: 'Leisure tag' },
      { path: 'tags.landuse', label: 'Landuse tag' },
      { path: 'tags.natural', label: 'Natural tag' }
    ],
    readValue: (feature) => {
      if (getTag(feature, 'leisure')) return getTag(feature, 'leisure');
      if (getTag(feature, 'landuse')) return getTag(feature, 'landuse');
      if (getTag(feature, 'natural') === 'wood') return 'forest';
      return 'park';
    },
    applyValue: (feature, value) => {
      const cleanValue = sanitizeText(value, 40).toLowerCase() || 'park';
      const tags = ensureTags(feature);
      delete tags.leisure;
      delete tags.landuse;
      delete tags.natural;
      delete tags.highway;
      delete tags.area;
      if (cleanValue === 'park') {
        tags.leisure = 'park';
        tags.landuse = 'recreation_ground';
      } else if (cleanValue === 'garden') {
        tags.leisure = 'garden';
      } else if (cleanValue === 'recreation_ground') {
        tags.landuse = 'recreation_ground';
      } else if (cleanValue === 'plaza') {
        tags.highway = 'pedestrian';
        tags.area = 'yes';
      } else if (cleanValue === 'forest') {
        tags.landuse = 'forest';
        tags.natural = 'wood';
      }
    },
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  textField({
    id: 'tree_species',
    label: 'Species',
    helpText: 'Optional species or genus label when it is known and useful.',
    example: 'oak',
    advancedMapping: [
      { path: 'tags.species', label: 'Species tag' }
    ],
    readValue: (feature) => getTag(feature, 'species'),
    applyValue: (feature, value) => setTag(feature, 'species', value, 80),
    summarize: (value) => value ? sanitizeText(value, 80) : ''
  }),
  selectField({
    id: 'poi_kind',
    label: 'POI Type',
    helpText: 'Choose the public-facing kind of point this should appear as in the world.',
    options: [
      { value: 'attraction', label: 'Attraction' },
      { value: 'viewpoint', label: 'Viewpoint' },
      { value: 'information', label: 'Information' },
      { value: 'cafe', label: 'Cafe' },
      { value: 'restaurant', label: 'Restaurant' },
      { value: 'toilets', label: 'Toilets' },
      { value: 'shop', label: 'Shop' },
      { value: 'artwork', label: 'Artwork' },
      { value: 'marker', label: 'Generic Marker' }
    ],
    advancedMapping: [
      { path: 'tags.tourism', label: 'Tourism tag' },
      { path: 'tags.amenity', label: 'Amenity tag' },
      { path: 'tags.shop', label: 'Shop tag' }
    ],
    readValue: (feature) => {
      if (getTag(feature, 'shop')) return 'shop';
      if (getTag(feature, 'amenity')) return getTag(feature, 'amenity');
      if (getTag(feature, 'tourism')) return getTag(feature, 'tourism');
      return 'marker';
    },
    applyValue: (feature, value) => {
      const cleanValue = sanitizeText(value, 40).toLowerCase() || 'marker';
      const tags = ensureTags(feature);
      delete tags.tourism;
      delete tags.amenity;
      delete tags.shop;
      if (cleanValue === 'shop') tags.shop = 'yes';
      else if (['cafe', 'restaurant', 'toilets'].includes(cleanValue)) tags.amenity = cleanValue;
      else if (cleanValue === 'marker') tags.tourism = 'information';
      else tags.tourism = cleanValue;
    },
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  selectField({
    id: 'entrance_type',
    label: 'Entrance Type',
    helpText: 'Use the entrance type that best describes how people should access the building or shell.',
    options: [
      { value: 'main', label: 'Main' },
      { value: 'yes', label: 'Generic' },
      { value: 'service', label: 'Service' },
      { value: 'staircase', label: 'Stair Entrance' },
      { value: 'emergency', label: 'Emergency' }
    ],
    advancedMapping: [
      { path: 'tags.entrance', label: 'Entrance tag' }
    ],
    readValue: (feature) => getTag(feature, 'entrance') || 'yes',
    applyValue: (feature, value) => setTag(feature, 'entrance', value || 'yes', 40),
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  selectField({
    id: 'room_type',
    label: 'Room Type',
    helpText: 'Choose the indoor room use so reviewers understand the intended shell and later interior semantics.',
    options: [
      { value: 'generic', label: 'Generic Room' },
      { value: 'office', label: 'Office' },
      { value: 'classroom', label: 'Classroom' },
      { value: 'retail', label: 'Retail' },
      { value: 'lobby', label: 'Lobby' },
      { value: 'utility', label: 'Utility' },
      { value: 'restroom', label: 'Restroom' },
      { value: 'storage', label: 'Storage' }
    ],
    advancedMapping: [
      { path: 'tags.indoor', label: 'Indoor tag' },
      { path: 'tags.room', label: 'Room type tag' }
    ],
    readValue: (feature) => getTag(feature, 'room') || 'generic',
    applyValue: (feature, value) => {
      setTag(feature, 'indoor', 'room', 40);
      setTag(feature, 'room', value || 'generic', 40);
    },
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  selectField({
    id: 'corridor_type',
    label: 'Corridor Type',
    helpText: 'Use corridor when the geometry marks shared circulation rather than a room shell.',
    options: [
      { value: 'corridor', label: 'Corridor' },
      { value: 'hall', label: 'Hall' },
      { value: 'concourse', label: 'Concourse' }
    ],
    advancedMapping: [
      { path: 'tags.indoor', label: 'Indoor tag' },
      { path: 'tags.corridor', label: 'Corridor subtype tag' }
    ],
    readValue: (feature) => getTag(feature, 'corridor') || 'corridor',
    applyValue: (feature, value) => {
      setTag(feature, 'indoor', 'corridor', 40);
      if ((value || 'corridor') === 'corridor') deleteIfEmpty(ensureTags(feature), 'corridor');
      else setTag(feature, 'corridor', value, 40);
    },
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  textField({
    id: 'level',
    label: 'Level',
    helpText: 'Required for indoor features and useful for entrances. Use values like 0, 1, 2, B1, or L2.',
    example: '0',
    advancedMapping: [
      { path: 'relations.level', label: 'Overlay level relation' },
      { path: 'level', label: 'Top-level level index' }
    ],
    readValue: (feature) => getRelationValue(feature, 'level') || sanitizeText(feature?.level || '', 40),
    applyValue: (feature, value) => setLevelValue(feature, value),
    summarize: (value) => value ? `Level ${sanitizeText(value, 40)}` : ''
  }),
  textField({
    id: 'building_ref',
    label: 'Building Reference',
    helpText: 'Link indoor or entrance features back to the shell they belong to when the relationship matters.',
    example: 'overlay_building_123',
    advancedMapping: [
      { path: 'relations.buildingRef', label: 'Parent building ref' },
      { path: 'buildingRef', label: 'Top-level building ref' }
    ],
    readValue: (feature) => getRelationValue(feature, 'buildingRef') || sanitizeText(feature?.buildingRef || '', 180),
    applyValue: (feature, value) => setBuildingRefValue(feature, value),
    summarize: (value) => value ? `Building ${sanitizeText(value, 60)}` : ''
  }),
  textField({
    id: 'connector_levels',
    label: 'Served Levels',
    helpText: 'Comma-separated levels this stairs or elevator connects. This is scaffold data for the future interior editor.',
    example: '0, 1, 2',
    advancedMapping: [
      { path: 'threeD.stairs[] / threeD.elevators[]', label: 'Served level lists' }
    ],
    readValue: (feature) => {
      const presetId = sanitizeText(feature?.presetId || '', 80).toLowerCase();
      if (presetId === 'elevator') return getConnectorLevels(feature, 'elevators');
      return getConnectorLevels(feature, 'stairs');
    },
    applyValue: (feature, value) => {
      const presetId = sanitizeText(feature?.presetId || '', 80).toLowerCase();
      if (presetId === 'elevator') setConnectorLevels(feature, 'elevators', value);
      else setConnectorLevels(feature, 'stairs', value);
    },
    summarize: (value) => value ? `Serves ${sanitizeText(value, 80)}` : ''
  }),
  textareaField({
    id: 'contributor_note',
    label: 'Contributor Note',
    helpText: 'Optional review context for moderators. Explain uncertain geometry, source evidence, or why this overlay is needed.',
    example: 'Added the missing side entrance and corrected the building shell height from on-site photos.',
    advancedMapping: [
      { path: 'submission.contributorNote', label: 'Submission note' }
    ],
    readValue: (feature) => sanitizeText(feature?.submission?.contributorNote || '', 320),
    applyValue: (feature, value) => {
      if (!feature.submission || typeof feature.submission !== 'object') feature.submission = {};
      feature.submission.contributorNote = sanitizeText(value, 320);
    },
    summarize: () => ''
  })
]);

const FIELD_MAP = new Map(OVERLAY_FIELD_DEFINITIONS.map((field) => [field.id, field]));

function presetFieldGroup(id, label, fields, options = {}) {
  return {
    id,
    label,
    fields,
    collapsible: options.collapsible === true
  };
}

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
        'Bridge or tunnel handling is wrong in the runtime layer.'
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
      presetFieldGroup('future-indoor', 'Indoor Scaffold', ['indoor_shell_levels'])
    ],
    requiredFields: ['building_type'],
    validationRules: ['feature.building.heightOrLevels'],
    search: ['building', 'footprint', 'tower', 'house', 'structure'],
    help: {
      description: 'Use for real building footprints and shells that affect how the 3D world renders.',
      whenToUse: [
        'A building footprint is missing or clearly wrong.',
        'The runtime shell needs corrected levels, height, or roof shape.',
        'You need to add entrances or prepare the shell for future indoor editing.'
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

const PRESET_MAP = new Map(OVERLAY_PRESETS.map((preset) => [preset.id, preset]));
const CATEGORY_MAP = new Map(OVERLAY_PRESET_CATEGORIES.map((category) => [category.id, category]));
const VALIDATION_RULE_MAP = new Map(OVERLAY_VALIDATION_RULES.map((rule) => [rule.id, rule]));

function normalizePresetId(value) {
  const next = String(value || '').trim().toLowerCase();
  return PRESET_MAP.has(next) ? next : 'poi_marker';
}

function getOverlayPreset(presetId) {
  return PRESET_MAP.get(normalizePresetId(presetId)) || PRESET_MAP.get('poi_marker');
}

function listOverlayPresets() {
  return OVERLAY_PRESETS.map((preset) => ({ ...preset }));
}

function listOverlayPresetCategories() {
  return OVERLAY_PRESET_CATEGORIES.map((category) => ({ ...category }));
}

function getOverlayPresetCategory(categoryId) {
  const next = sanitizeText(categoryId, 80).toLowerCase();
  return CATEGORY_MAP.get(next) || CATEGORY_MAP.get('places');
}

function searchOverlayPresets(query = '', geometryType = '') {
  const needle = String(query || '').trim().toLowerCase();
  const geometry = String(geometryType || '').trim();
  return OVERLAY_PRESETS.filter((preset) => {
    if (geometry && preset.geometryType !== geometry) return false;
    if (!needle) return true;
    const haystack = [
      preset.id,
      preset.label,
      preset.featureClass,
      preset.category,
      ...(Array.isArray(preset.search) ? preset.search : [])
    ].join(' ').toLowerCase();
    return haystack.includes(needle);
  }).map((preset) => ({ ...preset }));
}

function overlayToolConfig(toolId) {
  const next = String(toolId || '').trim().toLowerCase();
  return OVERLAY_EDITOR_TOOLS.find((tool) => tool.id === next) || OVERLAY_EDITOR_TOOLS[0];
}

function normalizeOverlayTool(toolId) {
  return overlayToolConfig(toolId).id;
}

function getOverlayFieldDefinition(fieldId) {
  return FIELD_MAP.get(sanitizeText(fieldId, 80).toLowerCase()) || null;
}

function getOverlayValidationRule(ruleId) {
  return VALIDATION_RULE_MAP.get(sanitizeText(ruleId, 120)) || null;
}

function listOverlayValidationRules() {
  return OVERLAY_VALIDATION_RULES.map((rule) => ({ ...rule }));
}

function getOverlayPresetFieldGroups(presetId) {
  const preset = getOverlayPreset(presetId);
  return (Array.isArray(preset.fieldGroups) ? preset.fieldGroups : []).map((group) => ({
    ...group,
    fields: (Array.isArray(group.fields) ? group.fields : [])
      .map((fieldId) => getOverlayFieldDefinition(fieldId))
      .filter(Boolean)
  }));
}

function readOverlayFieldValue(feature, fieldId) {
  const field = getOverlayFieldDefinition(fieldId);
  if (!field || typeof field.readValue !== 'function') return '';
  return field.readValue(feature || {});
}

function applyOverlayFieldValue(feature, fieldId, value) {
  const field = getOverlayFieldDefinition(fieldId);
  if (!field || typeof field.applyValue !== 'function') return false;
  field.applyValue(feature, value);
  return true;
}

function summarizeOverlayFieldValue(feature, fieldId) {
  const field = getOverlayFieldDefinition(fieldId);
  if (!field) return '';
  const value = readOverlayFieldValue(feature, fieldId);
  if (typeof field.summarize === 'function') {
    return sanitizeText(field.summarize(value, field, feature) || '', 120);
  }
  return sanitizeText(String(value || ''), 120);
}

function inferPresetFromBaseFeature(baseFeature = {}) {
  const featureType = String(baseFeature?.featureType || baseFeature?.kind || '').toLowerCase();
  if (featureType === 'road') return 'road';
  if (featureType === 'footway') return 'footway';
  if (featureType === 'cycleway') return 'cycleway';
  if (featureType === 'railway') return 'railway';
  if (featureType === 'building') return 'building';
  if (featureType === 'parking') return 'parking';
  if (featureType === 'water') return 'water';
  if (featureType === 'landuse' || featureType === 'park') return 'park_landuse';
  if (featureType === 'tree') return 'tree';
  if (featureType === 'entrance') return 'entrance';
  return 'poi_marker';
}

export {
  OVERLAY_EDITOR_TOOLS,
  OVERLAY_FIELD_DEFINITIONS,
  OVERLAY_GEOMETRY_TYPES,
  OVERLAY_MERGE_MODES,
  OVERLAY_PRESETS,
  OVERLAY_PRESET_CATEGORIES,
  OVERLAY_PUBLICATION_STATES,
  OVERLAY_REVIEW_STATES,
  OVERLAY_SOURCE_TYPES,
  OVERLAY_TOOL_IDS,
  OVERLAY_VALIDATION_RULES,
  applyOverlayFieldValue,
  getOverlayFieldDefinition,
  getOverlayPreset,
  getOverlayPresetCategory,
  getOverlayPresetFieldGroups,
  getOverlayValidationRule,
  inferPresetFromBaseFeature,
  listOverlayPresetCategories,
  listOverlayPresets,
  listOverlayValidationRules,
  normalizeOverlayTool,
  normalizePresetId,
  overlayToolConfig,
  readOverlayFieldValue,
  searchOverlayPresets,
  summarizeOverlayFieldValue
};
