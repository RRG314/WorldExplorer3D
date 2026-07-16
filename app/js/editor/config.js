import { OVERLAY_PRESETS } from './config-presets.js?v=1';
import { TRANSPORT_OVERLAY_FIELDS } from './config-fields-transport.js?v=1';
import { PLACE_OVERLAY_FIELDS } from './config-fields-places.js?v=1';
import {
  OVERLAY_EDITOR_TOOLS,
  OVERLAY_GEOMETRY_TYPES,
  OVERLAY_MERGE_MODES,
  OVERLAY_PRESET_CATEGORIES,
  OVERLAY_PUBLICATION_STATES,
  OVERLAY_REVIEW_STATES,
  OVERLAY_SOURCE_TYPES,
  OVERLAY_TOOL_IDS,
  OVERLAY_VALIDATION_RULES,
  deleteIfEmpty,
  ensureRelations,
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
} from './config-core.js?v=1';

const OVERLAY_FIELD_DEFINITIONS = Object.freeze([
  ...TRANSPORT_OVERLAY_FIELDS,
  ...PLACE_OVERLAY_FIELDS
]);

const FIELD_MAP = new Map(OVERLAY_FIELD_DEFINITIONS.map((field) => [field.id, field]));

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
