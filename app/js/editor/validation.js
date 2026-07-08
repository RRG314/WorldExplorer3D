import {
  getOverlayFieldDefinition,
  readOverlayFieldValue
} from './field-registry.js?v=1';
import {
  getOverlayPreset
} from './preset-registry.js?v=1';
import { mergeModeNeedsBaseFeatureRef, overlayFeatureLabel } from './schema.js?v=1';
import { cleanWorldLinePoints, cleanWorldRingPoints, geometryToWorldData, signedAreaWorld } from './geometry.js?v=1';

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeText(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function issue(code, message, severity = 'error', options = {}) {
  return {
    code,
    message: sanitizeText(message, 240),
    severity,
    fieldId: sanitizeText(options.fieldId || '', 80),
    hint: sanitizeText(options.hint || '', 240),
    ruleId: sanitizeText(options.ruleId || '', 120)
  };
}

function valueIsBlank(value) {
  if (value == null) return true;
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === '';
}

function validateGeometry(feature = {}) {
  const worldGeometry = geometryToWorldData(feature.geometry || {});
  if (worldGeometry.type === 'Point') {
    if (!Number.isFinite(worldGeometry.coordinates?.x) || !Number.isFinite(worldGeometry.coordinates?.z)) {
      return [issue(
        'point-invalid',
        'Point geometry is missing a valid location.',
        'error',
        {
          fieldId: 'geometry',
          hint: 'Place the point directly in the world before saving or submitting.',
          ruleId: 'geometry.point.location'
        }
      )];
    }
    return [];
  }
  if (worldGeometry.type === 'LineString') {
    const points = cleanWorldLinePoints(worldGeometry.coordinates || []);
    if (points.length < 2) {
      return [issue(
        'line-too-short',
        'Line features need at least two vertices.',
        'error',
        {
          fieldId: 'geometry',
          hint: 'Add another vertex or finish drawing a longer segment.',
          ruleId: 'geometry.line.length'
        }
      )];
    }
    let length = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      length += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
    }
    if (length < 1.2) {
      return [issue(
        'line-length',
        'Line geometry is too short to publish safely.',
        'error',
        {
          fieldId: 'geometry',
          hint: 'Extend the line so it represents a meaningful segment in the world.',
          ruleId: 'geometry.line.length'
        }
      )];
    }
    return [];
  }
  const ring = cleanWorldRingPoints(worldGeometry.coordinates?.[0] || []);
  if (ring.length < 3) {
    return [issue(
      'polygon-too-short',
      'Polygon features need at least three vertices.',
      'error',
      {
        fieldId: 'geometry',
        hint: 'Add vertices until the polygon closes into a valid footprint.',
        ruleId: 'geometry.polygon.area'
      }
    )];
  }
  const area = Math.abs(signedAreaWorld(ring));
  if (area < 6) {
    return [issue(
      'polygon-area',
      'Polygon footprint is too small to be meaningful.',
      'error',
      {
        fieldId: 'geometry',
        hint: 'Expand the footprint or use a point preset if the feature is not truly an area.',
        ruleId: 'geometry.polygon.area'
      }
    )];
  }
  return [];
}

function validateRequiredFields(feature = {}) {
  const preset = getOverlayPreset(feature.presetId);
  const requiredFields = Array.isArray(preset.requiredFields) ? preset.requiredFields : [];
  return requiredFields.flatMap((fieldId) => {
    const field = getOverlayFieldDefinition(fieldId);
    const value = readOverlayFieldValue(feature, fieldId);
    if (!valueIsBlank(value)) return [];
    return issue(
      `required-${fieldId}`,
      `${field?.label || fieldId} is required for ${preset.label.toLowerCase()} features.`,
      'error',
      {
        fieldId,
        hint: field?.helpText || 'Fill in the required guided field before submitting.',
        ruleId: 'field.required'
      }
    );
  });
}

function validateSemantics(feature = {}) {
  const preset = getOverlayPreset(feature.presetId);
  const tags = feature.tags || {};
  const issues = [];

  if (preset.featureClass === 'road' && !tags.highway) {
    issues.push(issue(
      'road-highway',
      'Road overlays need a road class.',
      'error',
      {
        fieldId: 'road_class',
        hint: 'Choose the correct road class in the guided fields.',
        ruleId: 'feature.road.class'
      }
    ));
  }
  if (preset.featureClass === 'railway' && !tags.railway) {
    issues.push(issue(
      'railway-tag',
      'Railway overlays need a railway type.',
      'error',
      {
        fieldId: 'railway_type',
        hint: 'Set the rail subtype, such as rail, tram, or subway.',
        ruleId: 'feature.railway.class'
      }
    ));
  }
  if (preset.featureClass === 'building' && !tags.building) {
    issues.push(issue(
      'building-tag',
      'Building overlays need a building type.',
      'error',
      {
        fieldId: 'building_type',
        hint: 'Choose the building type so the shell can be reviewed correctly.',
        ruleId: 'field.required'
      }
    ));
  }
  if (preset.featureClass === 'building_part' && !tags['building:part']) {
    issues.push(issue(
      'building-part-tag',
      'Building part overlays need a building part type.',
      'error',
      {
        fieldId: 'building_part_kind',
        hint: 'Choose whether this is a general part, roof, balcony, or canopy-like section.',
        ruleId: 'field.required'
      }
    ));
  }
  if ((preset.featureClass === 'poi' || preset.featureClass === 'entrance') && !overlayFeatureLabel(feature)) {
    issues.push(issue(
      'point-label',
      'This point should have a short display name or reference.',
      'warning',
      {
        fieldId: 'name',
        hint: 'Add a readable name or reference so moderators and players can identify the point.',
        ruleId: 'feature.pointLabelRecommended'
      }
    ));
  }
  if (['indoor_room', 'indoor_corridor', 'stairs', 'elevator'].includes(preset.featureClass) && !sanitizeText(feature?.relations?.level || feature?.level || '', 40)) {
    issues.push(issue(
      'indoor-level',
      'Indoor features need a level reference.',
      'error',
      {
        fieldId: 'level',
        hint: 'Set the level using values like 0, 1, 2, or B1.',
        ruleId: 'feature.levelRequired'
      }
    ));
  }
  if ((preset.id === 'stairs' || preset.id === 'elevator')) {
    const servedLevels = preset.id === 'elevator' ? feature?.threeD?.elevators : feature?.threeD?.stairs;
    if (!Array.isArray(servedLevels) || servedLevels.length === 0) {
      issues.push(issue(
        'connector-levels',
        'This connector should list which levels it serves.',
        'warning',
        {
          fieldId: 'connector_levels',
          hint: 'Add a comma-separated level list like `0, 1, 2`.',
          ruleId: 'feature.connectorLevelsRecommended'
        }
      ));
    }
  }
  return issues;
}

function validateThreeD(feature = {}) {
  const preset = getOverlayPreset(feature.presetId);
  const props = feature.threeD || {};
  const issues = [];
  const height = props.height;
  const levels = props.buildingLevels;
  const minHeight = finiteNumber(props.minHeight, 0);

  if (preset.featureClass === 'building') {
    if (height != null && !(finiteNumber(height, -1) >= 0)) {
      issues.push(issue(
        'height-value',
        'Building height must be zero or greater.',
        'error',
        {
          fieldId: 'height',
          hint: 'Use meters above ground, or clear the field if the value is unknown.',
          ruleId: 'feature.building.heightOrLevels'
        }
      ));
    }
    if (levels != null && !(finiteNumber(levels, -1) >= 0)) {
      issues.push(issue(
        'levels-value',
        'Building levels must be zero or greater.',
        'error',
        {
          fieldId: 'building_levels',
          hint: 'Use the visible floor count or leave it blank if it is unknown.',
          ruleId: 'feature.building.heightOrLevels'
        }
      ));
    }
    if (height == null && levels == null) {
      issues.push(issue(
        'building-height',
        'Provide either height or building levels for better 3D building output.',
        'warning',
        {
          fieldId: 'height',
          hint: 'At least one of height or levels helps moderation and runtime shell generation.',
          ruleId: 'feature.building.heightOrLevels'
        }
      ));
    }
  }
  if (preset.featureClass === 'building_part') {
    const tags = feature.tags || {};
    const partKind = sanitizeText(tags['building:part'] || '', 40).toLowerCase();
    const partLevel = sanitizeText(tags.level || '', 40);
    const minLevel = Number(tags['building:min_level']);
    const hasVerticalPlacement =
      minHeight > 0 ||
      partLevel !== '' ||
      Number.isFinite(minLevel) && minLevel > 0;
    if (!hasVerticalPlacement) {
      issues.push(issue(
        'building-part-placement',
        'Building parts should describe where they start above grade or which level they belong to.',
        ['roof', 'balcony', 'canopy'].includes(partKind) ? 'error' : 'warning',
        {
          fieldId: 'building_min_level',
          hint: 'Set Min Height, Min Levels, or Part Level so elevated building parts do not collapse to ground level.',
          ruleId: 'feature.buildingPart.verticalPlacement'
        }
      ));
    }
    if ((partKind === 'roof' || partKind === 'balcony') && height != null && finiteNumber(height, 0) > 2.5) {
      issues.push(issue(
        'building-part-thickness',
        'Roof and balcony parts are usually thin; this height looks unusually thick.',
        'warning',
        {
          fieldId: 'height',
          hint: 'Use a smaller height unless this part is truly a deep enclosed structure.',
          ruleId: 'feature.buildingPart.verticalPlacement'
        }
      ));
    }
  }
  if (minHeight < 0) {
    issues.push(issue(
      'min-height',
      'Minimum height must be zero or greater.',
      'error',
      {
        fieldId: 'min_height',
        hint: 'Use 0 for ground-level features or a positive value for elevated ones.',
        ruleId: 'feature.building.heightOrLevels'
      }
    ));
  }
  if (props.bridge === true && props.tunnel === true) {
    issues.push(issue(
      'bridge-tunnel',
      'A feature cannot be both a bridge and a tunnel.',
      'error',
      {
        fieldId: 'bridge',
        hint: 'Choose whichever structure matches reality and clear the other flag.',
        ruleId: 'feature.bridgeTunnelExclusive'
      }
    ));
  }
  return issues;
}

function validateOverlayFeature(feature = {}) {
  const issues = [
    ...validateGeometry(feature),
    ...validateRequiredFields(feature),
    ...validateSemantics(feature),
    ...validateThreeD(feature)
  ];
  if (mergeModeNeedsBaseFeatureRef(feature.mergeMode) && !feature.baseFeatureRef?.featureId) {
    issues.push(issue(
      'base-feature-ref',
      'Render overrides and local replacements need a base feature reference.',
      'error',
      {
        fieldId: 'base_feature_ref',
        hint: 'Select the base feature in the world and clone or target it before submitting.',
        ruleId: 'merge.baseFeatureRequired'
      }
    ));
  }
  return {
    valid: !issues.some((entry) => entry.severity === 'error'),
    issues
  };
}

function filterOverlayValidationIssues(issues = [], options = {}) {
  const fieldId = sanitizeText(options.fieldId || '', 80).toLowerCase();
  const severity = sanitizeText(options.severity || '', 16).toLowerCase();
  return (Array.isArray(issues) ? issues : []).filter((entry) => {
    if (fieldId && sanitizeText(entry?.fieldId || '', 80).toLowerCase() !== fieldId) return false;
    if (severity && sanitizeText(entry?.severity || '', 16).toLowerCase() !== severity) return false;
    return true;
  });
}

function getOverlayValidationFeedback(feature = {}, options = {}) {
  const validation = validateOverlayFeature(feature);
  return {
    ...validation,
    issues: filterOverlayValidationIssues(validation.issues, options)
  };
}

export {
  filterOverlayValidationIssues,
  getOverlayValidationFeedback,
  validateOverlayFeature
};
