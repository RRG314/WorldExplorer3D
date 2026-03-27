import {
  OVERLAY_PRESETS,
  OVERLAY_PRESET_CATEGORIES
} from './config.js?v=1';
import {
  getOverlayFieldDefinition,
  isOverlayFieldVisible,
  normalizeFieldId,
  resolveOverlayFieldDefinitions
} from './field-registry.js?v=1';

function sanitizeText(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function uniqueList(values = []) {
  return [...new Set(values.filter(Boolean))];
}

const PRESET_ALIASES = Object.freeze({
  park_landuse: 'landuse_park'
});

const PRESET_EXAMPLES = Object.freeze({
  road: [
    'Patch a missing residential street segment that affects driving traversal.',
    'Correct the surface and bridge state for a local connector road.'
  ],
  footway: [
    'Add a missing sidewalk between two building entrances.',
    'Map a public crossing or pedestrian shortcut that improves walking routes.'
  ],
  cycleway: [
    'Add a dedicated greenway segment missing from the runtime world.',
    'Correct the oneway or access state for a bike path.'
  ],
  railway: [
    'Fix the displayed rail subtype for a tram or light-rail corridor.',
    'Patch bridge or tunnel handling for a local rail segment.'
  ],
  building: [
    'Correct a missing building footprint and add levels for stable 3D output.',
    'Patch a commercial shell height and roof shape before indoor work starts.'
  ],
  entrance: [
    'Add the public entrance point to a building shell.',
    'Mark a service entrance with the correct access restrictions.'
  ],
  parking: [
    'Add a surface parking lot polygon missing from the outdoor world.',
    'Correct a structured parking footprint and access mode.'
  ],
  water: [
    'Add a pond or basin polygon so the world renders the area as water.',
    'Patch a local water outline that is missing from the base ingest.'
  ],
  landuse_park: [
    'Add a park or plaza polygon that improves outdoor context and traversal.',
    'Mark a garden or recreation ground that should read clearly in the world.'
  ],
  tree: [
    'Add a notable tree that improves world readability or landmarking.',
    'Mark a planted feature without drawing a full landuse polygon.'
  ],
  poi_marker: [
    'Add a named point of interest for a visitor-facing landmark.',
    'Create a simple marker that supplements the base world without replacing it.'
  ],
  interior_room: [
    'Scaffold a room polygon inside a level-aware building shell.',
    'Lay out a lobby or office room for future interior navigation.'
  ],
  corridor: [
    'Add an indoor corridor centerline for level-aware traversal scaffolding.',
    'Mark a concourse path before the full interior editor ships.'
  ],
  stairs: [
    'Add a staircase connector between two or more levels.',
    'Mark a stair line so later indoor traversal knows the connection path.'
  ],
  elevator: [
    'Add an elevator point with served levels for accessibility scaffolding.',
    'Mark a lift anchor before detailed indoor geometry is authored.'
  ]
});

const PRESET_SUMMARY_TEMPLATES = Object.freeze({
  road: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'road',
    primaryFieldIds: ['road_class'],
    secondaryFieldIds: ['surface', 'oneway']
  },
  footway: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'footpath',
    primaryFieldIds: ['footway_type'],
    secondaryFieldIds: ['surface', 'access']
  },
  cycleway: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'bike path',
    primaryFieldIds: ['cycleway_type'],
    secondaryFieldIds: ['surface', 'oneway']
  },
  railway: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'railway',
    primaryFieldIds: ['railway_type'],
    secondaryFieldIds: ['electrified', 'bridge', 'tunnel']
  },
  building: {
    createVerb: 'Created',
    updateVerb: 'Updated',
    subjectLabel: 'building',
    primaryFieldIds: ['building_type'],
    secondaryFieldIds: ['building_levels', 'height', 'roof_shape']
  },
  entrance: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'entrance',
    primaryFieldIds: ['entrance_type'],
    secondaryFieldIds: ['access', 'level']
  },
  parking: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'parking area',
    primaryFieldIds: ['parking_type'],
    secondaryFieldIds: ['access', 'surface']
  },
  water: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'water feature',
    primaryFieldIds: ['water_kind'],
    secondaryFieldIds: ['name']
  },
  landuse_park: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'park area',
    primaryFieldIds: ['park_kind'],
    secondaryFieldIds: ['name']
  },
  tree: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'tree',
    primaryFieldIds: ['tree_species'],
    secondaryFieldIds: ['height']
  },
  poi_marker: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'point of interest',
    primaryFieldIds: ['poi_kind'],
    secondaryFieldIds: ['name', 'access']
  },
  interior_room: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'room',
    primaryFieldIds: ['room_type'],
    secondaryFieldIds: ['level', 'ref', 'access']
  },
  corridor: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'corridor',
    primaryFieldIds: ['corridor_type'],
    secondaryFieldIds: ['level', 'access']
  },
  stairs: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'stairs',
    primaryFieldIds: ['name'],
    secondaryFieldIds: ['level', 'connector_levels', 'access']
  },
  elevator: {
    createVerb: 'Added',
    updateVerb: 'Updated',
    subjectLabel: 'elevator',
    primaryFieldIds: ['ref', 'name'],
    secondaryFieldIds: ['level', 'connector_levels', 'access']
  }
});

const PRESET_FUTURE_FLAGS = Object.freeze({
  building: ['multi_level_building', 'indoor_shell_ready'],
  entrance: ['building_shell_attachment'],
  interior_room: ['interior_editor_scaffold'],
  corridor: ['interior_editor_scaffold'],
  stairs: ['interior_connector_scaffold'],
  elevator: ['interior_connector_scaffold']
});

function canonicalPresetId(value) {
  const next = sanitizeText(value, 80).toLowerCase();
  return PRESET_ALIASES[next] || next;
}

function normalizeFieldGroup(group = {}, options = {}) {
  const rawFields = Array.isArray(group.fields)
    ? group.fields
    : Array.isArray(group.fieldIds)
      ? group.fieldIds
      : [];
  return Object.freeze({
    id: sanitizeText(group.id || options.fallbackId || 'group', 80).toLowerCase(),
    label: sanitizeText(group.label || 'Fields', 120),
    description: sanitizeText(group.description || '', 220),
    fieldIds: uniqueList(rawFields.map((fieldId) => normalizeFieldId(fieldId))),
    collapsible: group.collapsible === true,
    advancedOnly: options.advancedOnly === true || group.advancedOnly === true
  });
}

const DEFAULT_ADVANCED_FIELD_GROUPS = Object.freeze([
  normalizeFieldGroup({
    id: 'overlay_controls',
    label: 'Overlay Controls',
    description: 'Advanced controls for merge behavior, source intent, and base targeting.',
    fields: ['merge_mode', 'source_type', 'base_feature_ref'],
    collapsible: false
  }, { advancedOnly: true })
]);

function normalizeCategory(category = {}) {
  return Object.freeze({
    id: sanitizeText(category.id || 'places', 80).toLowerCase() || 'places',
    label: sanitizeText(category.label || 'Places', 120),
    description: sanitizeText(category.description || '', 220)
  });
}

const CATEGORY_REGISTRY = Object.freeze(OVERLAY_PRESET_CATEGORIES.map((category) => normalizeCategory(category)));
const CATEGORY_MAP = new Map(CATEGORY_REGISTRY.map((category) => [category.id, category]));

function normalizePresetHelp(preset = {}, presetId) {
  const help = preset.help && typeof preset.help === 'object' ? preset.help : {};
  return Object.freeze({
    description: sanitizeText(help.description || preset.description || '', 320),
    whenToUse: Array.isArray(help.whenToUse) ? help.whenToUse.map((entry) => sanitizeText(entry, 180)).filter(Boolean) : [],
    doNotUse: Array.isArray(help.doNotUse) ? help.doNotUse.map((entry) => sanitizeText(entry, 180)).filter(Boolean) : [],
    mistakes: Array.isArray(help.mistakes) ? help.mistakes.map((entry) => sanitizeText(entry, 180)).filter(Boolean) : [],
    moderationNotes: sanitizeText(help.moderationNotes || '', 220),
    advancedNotes: sanitizeText(help.advancedNotes || '', 220),
    relatedPresetIds: uniqueList((Array.isArray(help.relatedPresetIds) ? help.relatedPresetIds : []).map((entry) => canonicalPresetId(entry))),
    examples: PRESET_EXAMPLES[presetId] || []
  });
}

function buildPresetAdvancedMappingMetadata(preset = {}, fieldGroups = [], advancedFieldGroups = []) {
  const rows = [
    { path: 'presetId', label: 'Preset id', group: 'Overlay Contract' },
    { path: 'sourceType', label: 'Overlay source type', group: 'Overlay Contract' },
    { path: 'mergeMode', label: 'Runtime merge mode', group: 'Overlay Contract' }
  ];
  if (preset.sourceType !== 'overlay_new' || preset.mergeMode !== 'additive') {
    rows.push({ path: 'baseFeatureRef.featureId', label: 'Base feature target', group: 'Overlay Contract' });
  }
  [...fieldGroups, ...advancedFieldGroups].forEach((group) => {
    group.fieldIds.forEach((fieldId) => {
      const field = getOverlayFieldDefinition(fieldId);
      const mappings = Array.isArray(field?.advancedMapping) ? field.advancedMapping : [];
      mappings.forEach((mapping) => {
        rows.push({
          path: sanitizeText(mapping.path || '', 140),
          label: sanitizeText(mapping.label || '', 140),
          group: sanitizeText(group.label || 'Field Mapping', 120),
          fieldId,
          fieldLabel: sanitizeText(field?.label || fieldId, 120)
        });
      });
    });
  });
  return uniqueList(rows.map((row) => `${row.group}:${row.path}:${row.label}`)).map((key) => {
    const [group, path, label] = key.split(':');
    const match = rows.find((row) => row.group === group && row.path === path && row.label === label);
    return Object.freeze({ ...match });
  });
}

function normalizePresetDefinition(preset = {}) {
  const rawId = sanitizeText(preset.id || '', 80).toLowerCase();
  const id = canonicalPresetId(rawId);
  const aliases = uniqueList([
    rawId !== id ? rawId : '',
    ...(Array.isArray(preset.aliases) ? preset.aliases : []).map((entry) => sanitizeText(entry, 80).toLowerCase())
  ]);
  const fieldGroups = (Array.isArray(preset.fieldGroups) ? preset.fieldGroups : [])
    .map((group, index) => normalizeFieldGroup(group, { fallbackId: `${id}_group_${index + 1}` }));
  const advancedFieldGroups = (Array.isArray(preset.advancedFieldGroups) && preset.advancedFieldGroups.length ? preset.advancedFieldGroups : DEFAULT_ADVANCED_FIELD_GROUPS)
    .map((group, index) => normalizeFieldGroup(group, { fallbackId: `${id}_advanced_${index + 1}`, advancedOnly: true }));
  const help = normalizePresetHelp(preset, id);
  const geometryTypeAllowed = uniqueList(
    (Array.isArray(preset.geometryTypes) ? preset.geometryTypes : [preset.geometryType]).map((entry) => sanitizeText(entry, 40))
  );
  const editableFieldIds = uniqueList(fieldGroups.flatMap((group) => group.fieldIds));
  const advancedFieldIds = uniqueList(advancedFieldGroups.flatMap((group) => group.fieldIds));
  const normalized = Object.freeze({
    ...preset,
    id,
    aliases,
    description: help.description,
    geometryTypeAllowed,
    defaultProperties: Object.freeze({
      sourceType: sanitizeText(preset.sourceType || 'overlay_new', 40).toLowerCase() || 'overlay_new',
      mergeMode: sanitizeText(preset.mergeMode || 'additive', 40).toLowerCase() || 'additive',
      tags: cloneJson(preset.tags || {}),
      threeD: cloneJson(preset.threeD || {}),
      relations: cloneJson(preset.relations || {})
    }),
    editableFieldIds,
    advancedFieldIds,
    requiredFieldIds: uniqueList((Array.isArray(preset.requiredFields) ? preset.requiredFields : []).map((fieldId) => normalizeFieldId(fieldId))),
    validationRuleIds: uniqueList(Array.isArray(preset.validationRules) ? preset.validationRules : []),
    help,
    helpCard: help,
    exampleUsage: PRESET_EXAMPLES[id] || [],
    moderationSummaryTemplate: PRESET_SUMMARY_TEMPLATES[id] || {
      createVerb: 'Added',
      updateVerb: 'Updated',
      subjectLabel: sanitizeText(preset.label || 'feature', 80).toLowerCase(),
      primaryFieldIds: editableFieldIds.slice(0, 1),
      secondaryFieldIds: editableFieldIds.slice(1, 4)
    },
    futureFlags: PRESET_FUTURE_FLAGS[id] || [],
    fieldGroups,
    advancedFieldGroups,
    advancedMappingMetadata: buildPresetAdvancedMappingMetadata(preset, fieldGroups, advancedFieldGroups),
    search: uniqueList([
      id,
      ...aliases,
      sanitizeText(preset.label || '', 80).toLowerCase(),
      sanitizeText(preset.featureClass || '', 80).toLowerCase(),
      ...(Array.isArray(preset.search) ? preset.search : []).map((entry) => sanitizeText(entry, 80).toLowerCase())
    ])
  });
  return normalized;
}

const PRESET_REGISTRY = Object.freeze(OVERLAY_PRESETS.map((preset) => normalizePresetDefinition(preset)));
const PRESET_MAP = new Map(PRESET_REGISTRY.map((preset) => [preset.id, preset]));
const PRESET_ALIAS_MAP = new Map(PRESET_REGISTRY.flatMap((preset) => [[preset.id, preset.id], ...preset.aliases.map((alias) => [alias, preset.id])]));

function normalizePresetId(value) {
  const next = PRESET_ALIAS_MAP.get(canonicalPresetId(value));
  return next || 'poi_marker';
}

function getOverlayPreset(presetId) {
  return PRESET_MAP.get(normalizePresetId(presetId)) || PRESET_MAP.get('poi_marker');
}

function listOverlayPresets() {
  return PRESET_REGISTRY.slice();
}

function listOverlayPresetCategories() {
  return CATEGORY_REGISTRY.slice();
}

function getOverlayPresetCategory(categoryId) {
  return CATEGORY_MAP.get(sanitizeText(categoryId, 80).toLowerCase()) || CATEGORY_MAP.get('places');
}

function resolveFieldGroupDefinitions(groups = [], context = {}) {
  return groups
    .map((group) => {
      const fields = resolveOverlayFieldDefinitions(group.fieldIds, context);
      if (!fields.length) return null;
      return {
        ...group,
        fields
      };
    })
    .filter(Boolean);
}

function getOverlayPresetFieldGroups(presetId, options = {}) {
  const preset = getOverlayPreset(presetId);
  return resolveFieldGroupDefinitions(preset.fieldGroups, {
    ...options,
    presetId: preset.id,
    advancedMode: false,
    mergeMode: options.feature?.mergeMode || preset.defaultProperties?.mergeMode || preset.mergeMode,
    sourceType: options.feature?.sourceType || preset.defaultProperties?.sourceType || preset.sourceType
  });
}

function getOverlayPresetAdvancedFieldGroups(presetId, options = {}) {
  const preset = getOverlayPreset(presetId);
  return resolveFieldGroupDefinitions(preset.advancedFieldGroups, {
    ...options,
    presetId: preset.id,
    advancedMode: true,
    mergeMode: options.feature?.mergeMode || preset.defaultProperties?.mergeMode || preset.mergeMode,
    sourceType: options.feature?.sourceType || preset.defaultProperties?.sourceType || preset.sourceType
  });
}

function getOverlayPresetFieldOrder(presetId, options = {}) {
  const normalFieldIds = getOverlayPresetFieldGroups(presetId, options).flatMap((group) => group.fields.map((field) => field.id));
  const advancedFieldIds = options.includeAdvanced === true
    ? getOverlayPresetAdvancedFieldGroups(presetId, options).flatMap((group) => group.fields.map((field) => field.id))
    : [];
  return uniqueList([...normalFieldIds, ...advancedFieldIds]);
}

function getOverlayPresetRequiredFields(presetId) {
  return getOverlayPreset(presetId).requiredFieldIds
    .map((fieldId) => getOverlayFieldDefinition(fieldId))
    .filter(Boolean);
}

function getOverlayPresetValidationRuleIds(presetId) {
  return getOverlayPreset(presetId).validationRuleIds.slice();
}

function searchOverlayPresets(query = '', geometryType = '') {
  const needle = sanitizeText(query, 120).toLowerCase();
  const geometry = sanitizeText(geometryType, 40);
  return PRESET_REGISTRY.filter((preset) => {
    if (geometry && !preset.geometryTypeAllowed.includes(geometry)) return false;
    if (!needle) return true;
    return preset.search.some((entry) => entry.includes(needle));
  });
}

function getOverlayPresetPickerGroups(query = '', options = {}) {
  const presets = searchOverlayPresets(query, options.geometryType || '');
  return CATEGORY_REGISTRY
    .map((category) => ({
      ...category,
      presets: presets.filter((preset) => preset.category === category.id)
    }))
    .filter((entry) => entry.presets.length > 0 || options.includeEmpty === true);
}

function inferPresetFromBaseFeature(baseFeature = {}) {
  const featureType = sanitizeText(baseFeature?.featureType || baseFeature?.kind || '', 80).toLowerCase();
  if (featureType === 'road') return 'road';
  if (featureType === 'footway') return 'footway';
  if (featureType === 'cycleway') return 'cycleway';
  if (featureType === 'railway') return 'railway';
  if (featureType === 'building') return 'building';
  if (featureType === 'parking') return 'parking';
  if (featureType === 'water') return 'water';
  if (featureType === 'landuse' || featureType === 'park') return 'landuse_park';
  if (featureType === 'tree') return 'tree';
  if (featureType === 'entrance') return 'entrance';
  return 'poi_marker';
}

function getOverlayPresetAdvancedMappings(presetId) {
  return getOverlayPreset(presetId).advancedMappingMetadata.slice();
}

export {
  OVERLAY_PRESET_CATEGORIES as LEGACY_OVERLAY_PRESET_CATEGORIES,
  PRESET_ALIASES,
  PRESET_EXAMPLES,
  PRESET_FUTURE_FLAGS,
  PRESET_SUMMARY_TEMPLATES,
  PRESET_REGISTRY as OVERLAY_PRESET_REGISTRY,
  canonicalPresetId,
  getOverlayPreset,
  getOverlayPresetAdvancedFieldGroups,
  getOverlayPresetAdvancedMappings,
  getOverlayPresetCategory,
  getOverlayPresetFieldGroups,
  getOverlayPresetFieldOrder,
  getOverlayPresetPickerGroups,
  getOverlayPresetRequiredFields,
  getOverlayPresetValidationRuleIds,
  inferPresetFromBaseFeature,
  listOverlayPresetCategories,
  listOverlayPresets,
  normalizePresetId,
  searchOverlayPresets
};
