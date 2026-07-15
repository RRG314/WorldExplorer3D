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
  { id: 'transport', label: 'Transport', description: 'Roads, paths, cycleways, rail, and movement infrastructure.' },
  { id: 'structures', label: 'Structures', description: 'Buildings, entrances, and built shells that affect 3D rendering.' },
  { id: 'landscape', label: 'Landscape', description: 'Water, vegetation, landuse, and outdoor environmental features.' },
  { id: 'places', label: 'Places', description: 'Named points of interest, trees, markers, and public-facing content.' },
  { id: 'indoors', label: 'Indoors', description: 'Level-aware indoor shells and connector scaffolding for future interior editing.' }
]);

const OVERLAY_VALIDATION_RULES = Object.freeze([
  { id: 'geometry.line.length', label: 'Line geometry length', description: 'Line features need enough distance between vertices to render and route safely.' },
  { id: 'geometry.polygon.area', label: 'Polygon area', description: 'Area features need a meaningful footprint and a closed usable ring.' },
  { id: 'geometry.point.location', label: 'Point location', description: 'Point features need a valid world position.' },
  { id: 'merge.baseFeatureRequired', label: 'Base feature reference', description: 'Render overrides and local replacements must target a concrete base feature.' },
  { id: 'field.required', label: 'Required field', description: 'Required preset fields must be set before the feature can be submitted.' },
  { id: 'feature.road.class', label: 'Road class', description: 'Road presets must declare a road class such as residential or primary.' },
  { id: 'feature.railway.class', label: 'Railway type', description: 'Rail presets need a railway type so they render and review correctly.' },
  { id: 'feature.building.heightOrLevels', label: 'Building 3D data', description: 'Buildings should have at least levels or height for stable 3D output.' },
  { id: 'feature.buildingPart.verticalPlacement', label: 'Building part vertical placement', description: 'Elevated building parts should describe where they start above grade or which level they belong to.' },
  { id: 'feature.bridgeTunnelExclusive', label: 'Bridge or tunnel', description: 'A feature should not be both a bridge and a tunnel at the same time.' },
  { id: 'feature.levelRequired', label: 'Indoor level reference', description: 'Indoor features should declare a level so they can be reviewed and layered correctly.' },
  { id: 'feature.pointLabelRecommended', label: 'Point label', description: 'Public-facing points should usually have a readable name or identifying ref.' },
  { id: 'feature.connectorLevelsRecommended', label: 'Connector served levels', description: 'Stairs and elevators should list which levels they connect.' }
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

export {
  OVERLAY_EDITOR_TOOLS,
  OVERLAY_GEOMETRY_TYPES,
  OVERLAY_MERGE_MODES,
  OVERLAY_PRESET_CATEGORIES,
  OVERLAY_PUBLICATION_STATES,
  OVERLAY_REVIEW_STATES,
  OVERLAY_SOURCE_TYPES,
  OVERLAY_TOOL_IDS,
  OVERLAY_VALIDATION_RULES,
  createField,
  deleteIfEmpty,
  ensureRelations,
  ensureTags,
  ensureThreeD,
  finiteNumber,
  getConnectorLevels,
  getIndoorShellLevels,
  getRelationValue,
  getTag,
  normalizeBoolean,
  normalizeNumberInput,
  numberField,
  parseDelimitedList,
  sanitizeText,
  selectField,
  setBooleanTag,
  setBuildingRefValue,
  setConnectorLevels,
  setIndoorShellLevels,
  setLevelValue,
  setNumericTag,
  setRelationValue,
  setTag,
  textField,
  textareaField,
  toggleField
};
