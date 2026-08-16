import {
  buildTemplateChecklist,
  getActivityAnchorType,
  getActivityTemplate,
  orderedRouteAnchors,
  sanitizeText
} from './schema.js?v=2';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pushIssue(list, severity, code, message, hint = '', anchorId = '') {
  list.push({
    severity: sanitizeText(severity, 16).toLowerCase(),
    code: sanitizeText(code, 80),
    message: sanitizeText(message, 220),
    hint: sanitizeText(hint, 240),
    anchorId: sanitizeText(anchorId, 80)
  });
}

function validateAnchor(template, anchor, issues) {
  if (!anchor) return;
  const anchorType = getActivityAnchorType(anchor.typeId);
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !Number.isFinite(anchor.z)) {
    pushIssue(issues, 'error', 'anchor_missing_position', `${anchorType.label} is missing a valid world position.`, 'Move the anchor again so it resolves onto a valid surface.', anchor.id);
  }
  if (anchor.valid === false) {
    pushIssue(
      issues,
      'error',
      'anchor_invalid_environment',
      `${anchorType.label} is on an invalid surface for ${template.label}.`,
      anchor.invalidReason || 'Move the anchor until the placement preview turns green.',
      anchor.id
    );
  }
  if (anchor.typeId === 'trigger_zone') {
    if (!(Number(anchor.sizeX) > 0.4 && Number(anchor.sizeY) > 0.4 && Number(anchor.sizeZ) > 0.4)) {
      pushIssue(issues, 'error', 'trigger_zone_size', 'Trigger zones need positive box dimensions.', 'Increase the selected zone size in the inspector or use the scale tool.', anchor.id);
    }
  }
  if (anchor.typeId === 'hazard_zone') {
    if (!(Number(anchor.sizeX) > 1 && Number(anchor.sizeY) > 0.8 && Number(anchor.sizeZ) > 1)) {
      pushIssue(issues, 'error', 'hazard_zone_size', 'Hazard zones need a readable volume.', 'Increase the hazard zone size so players can see and understand the danger area.', anchor.id);
    }
  }
  if (anchor.typeId === 'boost_ring' && !(Number(anchor.radius) >= 2.5)) {
    pushIssue(issues, 'warning', 'boost_ring_radius', 'Boost rings should be large enough to pass through cleanly.', 'Increase the ring radius so the route stays readable in motion.', anchor.id);
  }
  if (anchor.typeId === 'buoy_gate' && anchor.environment !== 'water_surface') {
    pushIssue(issues, 'error', 'buoy_gate_surface', 'Buoy gates must stay aligned to the water surface.', 'Move the gate back over visible water until it turns valid.', anchor.id);
  }
  if (anchor.typeId === 'fishing_zone') {
    if (!(Number(anchor.radius) >= 4)) {
      pushIssue(issues, 'warning', 'fishing_zone_radius', 'Fishing zones should be large enough to read clearly on the water surface.', 'Increase the zone radius so it is easier to enter and moderate.', anchor.id);
    }
    if (anchor.environment !== 'water_surface') {
      pushIssue(issues, 'error', 'fishing_zone_surface', 'Fishing zones must stay aligned to water.', 'Place this anchor over a visible water surface.', anchor.id);
    }
  }
  if (anchor.typeId === 'dock_point' && anchor.environment !== 'water_surface' && anchor.environment !== 'dock') {
    pushIssue(issues, 'error', 'dock_point_surface', 'Dock points need shoreline or dock-adjacent water placement.', 'Move the dock point closer to the waterfront until it turns valid.', anchor.id);
  }
}

function validateActivityDraft(activity = {}) {
  const template = getActivityTemplate(activity.templateId);
  const anchors = Array.isArray(activity.anchors) ? activity.anchors : [];
  const issues = [];
  const checklist = buildTemplateChecklist(template.id, anchors);

  checklist.forEach((entry) => {
    if (entry.count < entry.min) {
      pushIssue(
        issues,
        'error',
        `missing_${entry.id}`,
        `${template.label} needs at least ${entry.min} ${entry.label.toLowerCase()} anchor${entry.min === 1 ? '' : 's'}.`,
        `Add ${entry.label.toLowerCase()} anchors from the anchor palette before testing or publishing.`
      );
    }
    if (Number.isFinite(entry.max) && entry.count > entry.max) {
      pushIssue(
        issues,
        'warning',
        `too_many_${entry.id}`,
        `${template.label} currently has more ${entry.label.toLowerCase()} anchors than expected.`,
        `Trim duplicate ${entry.label.toLowerCase()} anchors or convert them to another anchor type.`
      );
    }
  });

  anchors.forEach((anchor) => validateAnchor(template, anchor, issues));

  const route = orderedRouteAnchors(anchors);
  if (
    ['driving_route', 'walking_route', 'rooftop_run', 'interior_route', 'boat_course', 'fishing_trip', 'submarine_course', 'drone_course'].includes(template.id) &&
    route.length >= 2
  ) {
    for (let index = 1; index < route.length; index += 1) {
      const prev = route[index - 1];
      const next = route[index];
      const distance = Math.hypot(Number(next.x || 0) - Number(prev.x || 0), Number(next.z || 0) - Number(prev.z || 0));
      if (distance < 2) {
        pushIssue(
          issues,
          'warning',
          'route_segment_too_short',
          'Two route anchors are nearly on top of each other.',
          'Spread checkpoints or finish points apart so route direction is legible.',
          next.id
        );
      }
    }
  }

  const errorCount = issues.filter((entry) => entry.severity === 'error').length;
  const warningCount = issues.filter((entry) => entry.severity === 'warning').length;
  const validityScore = clamp(1 - errorCount * 0.2 - warningCount * 0.05, 0, 1);

  return {
    valid: errorCount === 0,
    issues,
    checklist,
    errorCount,
    warningCount,
    validityScore
  };
}

export {
  validateActivityDraft
};
