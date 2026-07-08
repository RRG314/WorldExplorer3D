import { OVERLAY_FIELD_DEFINITIONS } from './config.js?v=1';

function sanitizeText(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function uniqueList(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeFieldId(value) {
  return sanitizeText(value, 80).toLowerCase();
}

function inferValueType(field = {}) {
  if (field.kind === 'toggle') return 'boolean';
  if (field.kind === 'number') return 'number';
  return 'string';
}

function inferDefaultValue(field = {}) {
  if (Object.prototype.hasOwnProperty.call(field, 'defaultValue')) {
    return cloneJson(field.defaultValue);
  }
  if (typeof field.readValue === 'function') {
    try {
      const value = field.readValue({});
      if (value != null && value !== '') return cloneJson(value);
    } catch {}
  }
  if (field.kind === 'toggle') return false;
  if (field.kind === 'number') return null;
  if (field.kind === 'select') return field.options?.[0]?.value || '';
  return '';
}

function normalizeOptions(options = []) {
  return Array.isArray(options)
    ? options
      .map((option) => ({
        value: sanitizeText(option?.value || '', 80),
        label: sanitizeText(option?.label || option?.value || '', 120),
        description: sanitizeText(option?.description || '', 200)
      }))
      .filter((option) => option.value)
    : [];
}

function inferThreeDRelevance(field = {}) {
  if (field.threeDRelevance === true) return true;
  const mappings = Array.isArray(field.advancedMapping) ? field.advancedMapping : [];
  return mappings.some((mapping) => String(mapping?.path || '').startsWith('threeD.'));
}

function normalizeHelpModel(field = {}) {
  const examples = Array.isArray(field.exampleValues)
    ? field.exampleValues.map((entry) => sanitizeText(entry, 160)).filter(Boolean)
    : field.example
      ? [sanitizeText(field.example, 160)]
      : [];
  const help = field.help && typeof field.help === 'object' ? field.help : {};
  return Object.freeze({
    shortText: sanitizeText(help.shortText || field.helpText || '', 240),
    longText: sanitizeText(help.longText || help.shortText || field.helpText || '', 320),
    examples,
    whenToUse: Array.isArray(help.whenToUse) ? help.whenToUse.map((entry) => sanitizeText(entry, 180)).filter(Boolean) : [],
    doNotUse: Array.isArray(help.doNotUse) ? help.doNotUse.map((entry) => sanitizeText(entry, 180)).filter(Boolean) : [],
    commonMistakes: Array.isArray(help.commonMistakes) ? help.commonMistakes.map((entry) => sanitizeText(entry, 180)).filter(Boolean) : [],
    moderationNotes: sanitizeText(help.moderationNotes || field.moderationNotes || '', 220),
    advancedNotes: sanitizeText(help.advancedNotes || field.advancedNotes || '', 220)
  });
}

const FIELD_VALIDATION_OVERRIDES = Object.freeze({
  road_class: ['feature.road.class'],
  railway_type: ['feature.railway.class'],
  building_type: ['field.required'],
  building_levels: ['feature.building.heightOrLevels'],
  height: ['feature.building.heightOrLevels'],
  min_height: ['feature.building.heightOrLevels'],
  bridge: ['feature.bridgeTunnelExclusive'],
  tunnel: ['feature.bridgeTunnelExclusive'],
  level: ['feature.levelRequired'],
  connector_levels: ['feature.connectorLevelsRecommended'],
  merge_mode: ['merge.baseFeatureRequired'],
  base_feature_ref: ['merge.baseFeatureRequired']
});

const ADVANCED_ONLY_FIELD_IDS = new Set([
  'source_type',
  'merge_mode',
  'base_feature_ref'
]);

function normalizeFieldDefinition(field = {}) {
  const id = normalizeFieldId(field.id);
  const options = normalizeOptions(field.options);
  const help = normalizeHelpModel(field);
  const validationRuleIds = uniqueList([
    ...(Array.isArray(field.validationRuleIds) ? field.validationRuleIds : []),
    ...(Array.isArray(field.validationRules) ? field.validationRules : []),
    ...(FIELD_VALIDATION_OVERRIDES[id] || [])
  ]);
  const normalized = Object.freeze({
    ...field,
    id,
    label: sanitizeText(field.label || id, 120),
    description: sanitizeText(field.description || help.longText || help.shortText, 320),
    inputType: sanitizeText(field.inputType || field.kind || 'text', 32).toLowerCase(),
    valueType: sanitizeText(field.valueType || inferValueType(field), 32).toLowerCase(),
    defaultValue: inferDefaultValue(field),
    requiredBehavior: sanitizeText(field.requiredBehavior || 'preset_defined', 40).toLowerCase(),
    visibilityRules: Array.isArray(field.visibilityRules) ? field.visibilityRules.map((rule) => ({ ...rule })) : [],
    advancedOnly: field.advancedOnly === true || ADVANCED_ONLY_FIELD_IDS.has(id),
    validationRuleIds,
    exampleValues: help.examples,
    placeholderText: sanitizeText(field.placeholderText || field.placeholder || '', 160),
    units: sanitizeText(field.units || '', 20),
    options,
    threeDRelevance: inferThreeDRelevance(field),
    help,
    helpText: help.shortText,
    example: help.examples[0] || '',
    advancedMapping: Array.isArray(field.advancedMapping)
      ? field.advancedMapping.map((mapping) => ({
        path: sanitizeText(mapping?.path || '', 140),
        label: sanitizeText(mapping?.label || '', 140)
      })).filter((mapping) => mapping.path && mapping.label)
      : [],
    moderationNotes: help.moderationNotes,
    advancedNotes: help.advancedNotes
  });
  return normalized;
}

function applyTopLevelText(feature, key, value, max = 180) {
  if (!feature || typeof feature !== 'object') return '';
  const cleanValue = sanitizeText(value, max);
  if (!cleanValue) delete feature[key];
  else feature[key] = cleanValue;
  return cleanValue;
}

function applyBaseFeatureRef(feature, value) {
  if (!feature || typeof feature !== 'object') return '';
  const cleanValue = sanitizeText(value, 180);
  const next = feature.baseFeatureRef && typeof feature.baseFeatureRef === 'object'
    ? { ...feature.baseFeatureRef }
    : { source: 'osm', featureType: '', featureId: '', areaKey: '', displayName: '' };
  next.featureId = cleanValue;
  if (!cleanValue) next.displayName = '';
  feature.baseFeatureRef = next;
  return cleanValue;
}

const SYNTHETIC_FIELD_DEFINITIONS = Object.freeze([
  normalizeFieldDefinition({
    id: 'source_type',
    label: 'Source Type',
    kind: 'select',
    advancedOnly: true,
    description: 'Select how this overlay relates to the imported base world.',
    helpText: 'Source type explains whether the feature is a brand-new overlay, a local base patch, or a rendering override.',
    help: {
      longText: 'Use source type only in advanced mode. Normal contributors should usually stay with the preset default unless a moderator or advanced workflow requires a different overlay strategy.',
      advancedNotes: 'Changing source type can alter moderation expectations and runtime merge safety.'
    },
    defaultValue: 'overlay_new',
    options: [
      { value: 'overlay_new', label: 'Overlay New', description: 'Adds new overlay content that supplements the base world.' },
      { value: 'base_patch', label: 'Base Patch', description: 'Targets a local correction against imported base content without mutating the raw ingest.' },
      { value: 'render_override', label: 'Render Override', description: 'Overrides rendering behavior for an existing base feature after approval.' }
    ],
    advancedMapping: [
      { path: 'sourceType', label: 'Overlay source type' }
    ],
    readValue: (feature = {}) => sanitizeText(feature.sourceType || 'overlay_new', 40).toLowerCase() || 'overlay_new',
    applyValue: (feature = {}, value) => applyTopLevelText(feature, 'sourceType', value, 40),
    summarize: () => ''
  }),
  normalizeFieldDefinition({
    id: 'merge_mode',
    label: 'Merge Mode',
    kind: 'select',
    advancedOnly: true,
    description: 'Controls how the approved overlay merges into runtime layers.',
    helpText: 'Merge mode decides whether this overlay adds new content, overrides local rendering, or replaces a local base segment at runtime.',
    help: {
      longText: 'Only use advanced merge changes when you understand the moderation and runtime implications. Additive is safest. Local replacement and render override usually need a concrete base target.',
      advancedNotes: 'Changing merge mode can make a previously valid draft require a base feature reference.'
    },
    defaultValue: 'additive',
    options: [
      { value: 'additive', label: 'Additive', description: 'Adds runtime content without replacing a base feature.' },
      { value: 'render_override', label: 'Render Override', description: 'Changes how an existing base feature renders at runtime.' },
      { value: 'local_replace', label: 'Local Replace', description: 'Replaces a local base segment or footprint after approval.' }
    ],
    advancedMapping: [
      { path: 'mergeMode', label: 'Runtime merge mode' }
    ],
    readValue: (feature = {}) => sanitizeText(feature.mergeMode || 'additive', 40).toLowerCase() || 'additive',
    applyValue: (feature = {}, value) => applyTopLevelText(feature, 'mergeMode', value, 40),
    summarize: (value) => value && value !== 'additive' ? sanitizeText(String(value).replace(/_/g, ' '), 80) : ''
  }),
  normalizeFieldDefinition({
    id: 'base_feature_ref',
    label: 'Base Feature Reference',
    kind: 'text',
    advancedOnly: true,
    description: 'Reference the base-world feature this overlay is patching or overriding.',
    helpText: 'Required when using render override or local replacement so moderators can compare this overlay to the correct base feature.',
    help: {
      longText: 'Set this when the overlay depends on a specific OSM-derived base feature. Additive overlays usually leave this blank.',
      moderationNotes: 'A clear base target makes review and rollback much safer.',
      advancedNotes: 'If you clear the base target while keeping a replacement merge mode, validation will fail.'
    },
    validationRuleIds: ['merge.baseFeatureRequired'],
    visibilityRules: [
      { mergeModes: ['render_override', 'local_replace'] }
    ],
    example: 'way/123456789',
    placeholder: 'way/123456789',
    advancedMapping: [
      { path: 'baseFeatureRef.featureId', label: 'Base feature id' },
      { path: 'baseFeatureRef.displayName', label: 'Base feature display name' }
    ],
    readValue: (feature = {}) => sanitizeText(feature?.baseFeatureRef?.featureId || '', 180),
    applyValue: (feature = {}, value) => applyBaseFeatureRef(feature, value),
    summarize: (value) => value ? `Targets ${sanitizeText(value, 80)}` : ''
  })
]);

const NORMALIZED_FIELD_DEFINITIONS = Object.freeze([
  ...OVERLAY_FIELD_DEFINITIONS.map((field) => normalizeFieldDefinition(field)),
  ...SYNTHETIC_FIELD_DEFINITIONS
]);

const FIELD_MAP = new Map(NORMALIZED_FIELD_DEFINITIONS.map((field) => [field.id, field]));

function getOverlayFieldDefinition(fieldId) {
  return FIELD_MAP.get(normalizeFieldId(fieldId)) || null;
}

function listOverlayFieldDefinitions(options = {}) {
  const includeAdvanced = options.includeAdvanced !== false;
  return NORMALIZED_FIELD_DEFINITIONS.filter((field) => includeAdvanced || field.advancedOnly !== true);
}

function resolveFieldContext(context = {}) {
  return {
    feature: context.feature && typeof context.feature === 'object' ? context.feature : null,
    presetId: sanitizeText(context.presetId || context.feature?.presetId || '', 80).toLowerCase(),
    geometryType: sanitizeText(context.geometryType || context.feature?.geometryType || '', 40),
    mergeMode: sanitizeText(context.mergeMode || context.feature?.mergeMode || '', 40).toLowerCase(),
    sourceType: sanitizeText(context.sourceType || context.feature?.sourceType || '', 40).toLowerCase(),
    advancedMode: context.advancedMode === true
  };
}

function visibilityRuleMatches(rule = {}, context = {}) {
  const normalizedContext = resolveFieldContext(context);
  if (Array.isArray(rule.presetIds) && rule.presetIds.length && !rule.presetIds.includes(normalizedContext.presetId)) return false;
  if (Array.isArray(rule.geometryTypes) && rule.geometryTypes.length && !rule.geometryTypes.includes(normalizedContext.geometryType)) return false;
  if (Array.isArray(rule.mergeModes) && rule.mergeModes.length && !rule.mergeModes.includes(normalizedContext.mergeMode)) return false;
  if (Array.isArray(rule.sourceTypes) && rule.sourceTypes.length && !rule.sourceTypes.includes(normalizedContext.sourceType)) return false;
  if (rule.requireFeature === true && !normalizedContext.feature) return false;
  return true;
}

function isOverlayFieldVisible(fieldOrId, context = {}) {
  const field = typeof fieldOrId === 'string' ? getOverlayFieldDefinition(fieldOrId) : fieldOrId;
  if (!field) return false;
  const normalizedContext = resolveFieldContext(context);
  if (field.advancedOnly === true && normalizedContext.advancedMode !== true) return false;
  const rules = Array.isArray(field.visibilityRules) ? field.visibilityRules : [];
  if (!rules.length) return true;
  return rules.some((rule) => visibilityRuleMatches(rule, normalizedContext));
}

function resolveOverlayFieldDefinitions(fieldIds = [], context = {}) {
  return uniqueList(fieldIds.map((fieldId) => normalizeFieldId(fieldId)))
    .map((fieldId) => getOverlayFieldDefinition(fieldId))
    .filter((field) => isOverlayFieldVisible(field, context));
}

function readOverlayFieldValue(feature = {}, fieldId) {
  const field = getOverlayFieldDefinition(fieldId);
  if (!field || typeof field.readValue !== 'function') return '';
  return field.readValue(feature || {});
}

function applyOverlayFieldValue(feature = {}, fieldId, value) {
  const field = getOverlayFieldDefinition(fieldId);
  if (!field || typeof field.applyValue !== 'function') return false;
  field.applyValue(feature, value);
  return true;
}

function summarizeOverlayFieldValue(feature = {}, fieldId) {
  const field = getOverlayFieldDefinition(fieldId);
  if (!field) return '';
  const value = readOverlayFieldValue(feature, fieldId);
  if (typeof field.summarize === 'function') {
    return sanitizeText(field.summarize(value, field, feature) || '', 140);
  }
  return sanitizeText(String(value || ''), 140);
}

function getOverlayFieldHelp(fieldId) {
  return getOverlayFieldDefinition(fieldId)?.help || null;
}

function listOverlayAdvancedFieldDefinitions() {
  return NORMALIZED_FIELD_DEFINITIONS.filter((field) => field.advancedOnly === true);
}

export {
  FIELD_VALIDATION_OVERRIDES,
  NORMALIZED_FIELD_DEFINITIONS as OVERLAY_FIELD_REGISTRY,
  applyOverlayFieldValue,
  getOverlayFieldDefinition,
  getOverlayFieldHelp,
  isOverlayFieldVisible,
  listOverlayAdvancedFieldDefinitions,
  listOverlayFieldDefinitions,
  normalizeFieldId,
  readOverlayFieldValue,
  resolveOverlayFieldDefinitions,
  summarizeOverlayFieldValue
};
