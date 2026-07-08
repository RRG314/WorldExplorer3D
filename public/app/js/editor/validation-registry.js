import { OVERLAY_VALIDATION_RULES } from './config.js?v=1';
import { getOverlayPreset, getOverlayPresetFieldOrder } from './preset-registry.js?v=1';
import { getOverlayFieldDefinition } from './field-registry.js?v=1';

function sanitizeText(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function uniqueList(values = []) {
  return [...new Set(values.filter(Boolean))];
}

const RULE_OVERRIDES = Object.freeze({
  'geometry.line.length': {
    severity: 'error',
    targetFieldIds: ['geometry'],
    executionLocation: 'app/js/editor/validation.js#validateGeometry',
    fixGuidance: 'Add or move vertices until the line represents a meaningful segment in the world.',
    moderatorNote: 'Reject line drafts that collapse to short stubs or accidental clicks.'
  },
  'geometry.polygon.area': {
    severity: 'error',
    targetFieldIds: ['geometry'],
    executionLocation: 'app/js/editor/validation.js#validateGeometry',
    fixGuidance: 'Expand the footprint or switch to a point preset if the feature is not truly an area.',
    moderatorNote: 'Tiny polygons are usually mistaken geometry or the wrong preset choice.'
  },
  'geometry.point.location': {
    severity: 'error',
    targetFieldIds: ['geometry'],
    executionLocation: 'app/js/editor/validation.js#validateGeometry',
    fixGuidance: 'Place the point in the correct world position before saving or submitting.',
    moderatorNote: 'Reject floating or unset point geometry.'
  },
  'merge.baseFeatureRequired': {
    severity: 'error',
    targetFieldIds: ['merge_mode', 'base_feature_ref'],
    executionLocation: 'app/js/editor/validation.js#validateOverlayFeature',
    fixGuidance: 'Pick or enter the base feature this overlay is replacing or overriding.',
    moderatorNote: 'Replacement and override overlays should always point at an explicit base feature.'
  },
  'field.required': {
    severity: 'error',
    targetFieldIds: [],
    executionLocation: 'app/js/editor/validation.js#validateRequiredFields',
    fixGuidance: 'Fill in the required guided field before submission.',
    moderatorNote: 'Required guided fields are part of the contributor workflow and should not be bypassed.'
  },
  'feature.road.class': {
    severity: 'error',
    targetFieldIds: ['road_class'],
    executionLocation: 'app/js/editor/validation.js#validateSemantics',
    fixGuidance: 'Choose the drivable road class that matches the real-world segment.',
    moderatorNote: 'Road class changes affect traversal and should match the intended vehicle hierarchy.'
  },
  'feature.railway.class': {
    severity: 'error',
    targetFieldIds: ['railway_type'],
    executionLocation: 'app/js/editor/validation.js#validateSemantics',
    fixGuidance: 'Set the rail subtype such as rail, tram, subway, or light rail.',
    moderatorNote: 'Rail subtype drives rendering and should stay consistent with the corridor.'
  },
  'feature.building.heightOrLevels': {
    severity: 'warning',
    targetFieldIds: ['building_levels', 'height', 'min_height'],
    executionLocation: 'app/js/editor/validation.js#validateThreeD',
    fixGuidance: 'Provide height or levels, and keep min height less than or equal to the visible shell height.',
    moderatorNote: '3D building shell metadata strongly improves review confidence and runtime output.'
  },
  'feature.bridgeTunnelExclusive': {
    severity: 'error',
    targetFieldIds: ['bridge', 'tunnel', 'layer'],
    executionLocation: 'app/js/editor/validation.js#validateThreeD',
    fixGuidance: 'A feature should be either a bridge or a tunnel, not both at once.',
    moderatorNote: 'Conflicting structure flags often indicate an accidental copy or a misunderstood layer relationship.'
  },
  'feature.levelRequired': {
    severity: 'error',
    targetFieldIds: ['level'],
    executionLocation: 'app/js/editor/validation.js#validateSemantics',
    fixGuidance: 'Set the indoor level using values like 0, 1, 2, or B1.',
    moderatorNote: 'Indoor geometry without a level is not reviewable or publish-safe.'
  },
  'feature.pointLabelRecommended': {
    severity: 'warning',
    targetFieldIds: ['name', 'ref'],
    executionLocation: 'app/js/editor/validation.js#validateSemantics',
    fixGuidance: 'Add a readable name or short reference so moderators and users can identify the point.',
    moderatorNote: 'Unnamed public-facing markers are hard to review and easy to misuse.'
  },
  'feature.connectorLevelsRecommended': {
    severity: 'warning',
    targetFieldIds: ['connector_levels'],
    executionLocation: 'app/js/editor/validation.js#validateSemantics',
    fixGuidance: 'List the levels the stairs or elevator connects, such as 0, 1, 2.',
    moderatorNote: 'Served levels make indoor connector review much clearer.'
  }
});

function normalizeRuleDefinition(rule = {}) {
  const id = sanitizeText(rule.id || '', 120);
  const override = RULE_OVERRIDES[id] || {};
  return Object.freeze({
    ...rule,
    id,
    label: sanitizeText(rule.label || id, 120),
    description: sanitizeText(rule.description || '', 280),
    severity: sanitizeText(override.severity || rule.severity || 'warning', 16).toLowerCase(),
    targetFieldIds: uniqueList((override.targetFieldIds || rule.targetFieldIds || []).map((fieldId) => sanitizeText(fieldId, 80).toLowerCase())),
    executionLocation: sanitizeText(override.executionLocation || rule.executionLocation || 'app/js/editor/validation.js', 180),
    fixGuidance: sanitizeText(override.fixGuidance || rule.fixGuidance || rule.description || '', 240),
    moderatorNote: sanitizeText(override.moderatorNote || rule.moderatorNote || '', 240)
  });
}

const VALIDATION_RULE_REGISTRY = Object.freeze(OVERLAY_VALIDATION_RULES.map((rule) => normalizeRuleDefinition(rule)));
const VALIDATION_RULE_MAP = new Map(VALIDATION_RULE_REGISTRY.map((rule) => [rule.id, rule]));

function getOverlayValidationRule(ruleId) {
  return VALIDATION_RULE_MAP.get(sanitizeText(ruleId, 120)) || null;
}

function listOverlayValidationRules() {
  return VALIDATION_RULE_REGISTRY.slice();
}

function getOverlayValidationRulesForPreset(presetId) {
  const preset = getOverlayPreset(presetId);
  const presetRuleIds = preset.validationRuleIds.slice();
  const fieldRuleIds = getOverlayPresetFieldOrder(preset.id, { includeAdvanced: true })
    .flatMap((fieldId) => getOverlayFieldDefinition(fieldId)?.validationRuleIds || []);
  return uniqueList([...presetRuleIds, ...fieldRuleIds])
    .map((ruleId) => getOverlayValidationRule(ruleId))
    .filter(Boolean);
}

function summarizeValidationIssues(issues = []) {
  const source = Array.isArray(issues) ? issues : [];
  const errors = source.filter((issue) => sanitizeText(issue?.severity || 'warning', 16).toLowerCase() === 'error');
  const warnings = source.filter((issue) => sanitizeText(issue?.severity || 'warning', 16).toLowerCase() === 'warning');
  return {
    errorCount: errors.length,
    warningCount: warnings.length,
    valid: errors.length === 0
  };
}

export {
  RULE_OVERRIDES,
  VALIDATION_RULE_REGISTRY as OVERLAY_VALIDATION_RULE_REGISTRY,
  getOverlayValidationRule,
  getOverlayValidationRulesForPreset,
  listOverlayValidationRules,
  summarizeValidationIssues
};
