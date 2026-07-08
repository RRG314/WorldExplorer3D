import {
  getOverlayPreset,
  getOverlayPresetCategory,
  getOverlayPresetFieldOrder
} from './preset-registry.js?v=1';
import {
  summarizeOverlayFieldValue
} from './field-registry.js?v=1';
import {
  overlayFeatureLabel
} from './schema.js?v=1';

function sanitizeText(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function formatMergeMode(value) {
  if (value === 'render_override') return 'render override';
  if (value === 'local_replace') return 'local replacement';
  return 'additive overlay';
}

function formatReviewState(value) {
  return sanitizeText(String(value || '').replace(/_/g, ' '), 80);
}

function uniqueList(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function joinSummaryParts(parts = []) {
  const source = parts.filter(Boolean);
  if (source.length <= 1) return source[0] || '';
  if (source.length === 2) return `${source[0]} and ${source[1]}`;
  return `${source.slice(0, -1).join(', ')}, and ${source[source.length - 1]}`;
}

function summaryFieldIdsForPreset(presetId, options = {}) {
  const preset = getOverlayPreset(presetId);
  const template = preset.moderationSummaryTemplate || {};
  const configured = uniqueList([
    ...(Array.isArray(template.primaryFieldIds) ? template.primaryFieldIds : []),
    ...(Array.isArray(template.secondaryFieldIds) ? template.secondaryFieldIds : [])
  ]);
  if (configured.length) return configured;
  return getOverlayPresetFieldOrder(preset.id, options);
}

function featureHighlights(feature = {}, options = {}) {
  const preset = getOverlayPreset(feature.presetId);
  const fieldIds = summaryFieldIdsForPreset(preset.id, options);
  const highlights = fieldIds
    .map((fieldId) => summarizeOverlayFieldValue(feature, fieldId))
    .filter(Boolean);
  if (feature.baseFeatureRef?.displayName || feature.baseFeatureRef?.featureId) {
    highlights.push(`Targets ${sanitizeText(feature.baseFeatureRef.displayName || feature.baseFeatureRef.featureId, 80)}`);
  }
  if (options.includeState !== false && feature.reviewState) {
    highlights.push(`State ${formatReviewState(feature.reviewState)}`);
  }
  return uniqueList(highlights).slice(0, Number.isFinite(options.limit) ? options.limit : 8);
}

function readableFeatureDescription(feature = {}) {
  const preset = getOverlayPreset(feature.presetId);
  const category = getOverlayPresetCategory(preset.category);
  const label = overlayFeatureLabel(feature);
  const mergePhrase = formatMergeMode(feature.mergeMode || preset.defaultProperties?.mergeMode || preset.mergeMode);
  const geometryPhrase = sanitizeText(feature.geometryType || preset.geometryType, 24).toLowerCase();
  const parts = [
    `${label} is a ${preset.label.toLowerCase()} ${geometryPhrase}`,
    `in the ${category.label.toLowerCase()} category`,
    `using ${mergePhrase}`
  ];
  if (feature.baseFeatureRef?.displayName || feature.baseFeatureRef?.featureId) {
    parts.push(`against ${sanitizeText(feature.baseFeatureRef.displayName || feature.baseFeatureRef.featureId, 80)}`);
  }
  return `${parts.join(' ')}.`;
}

function buildModerationSummaryLine(feature = {}, options = {}) {
  const preset = getOverlayPreset(feature.presetId);
  const template = preset.moderationSummaryTemplate || {};
  const actionVerb = sanitizeText(
    options.actionVerb || (feature.version > 1 ? template.updateVerb : template.createVerb) || 'Added',
    40
  );
  const subjectLabel = sanitizeText(template.subjectLabel || preset.label.toLowerCase(), 120);
  const primary = (Array.isArray(template.primaryFieldIds) ? template.primaryFieldIds : [])
    .map((fieldId) => summarizeOverlayFieldValue(feature, fieldId))
    .filter(Boolean)[0];
  const secondary = (Array.isArray(template.secondaryFieldIds) ? template.secondaryFieldIds : [])
    .map((fieldId) => summarizeOverlayFieldValue(feature, fieldId))
    .filter(Boolean)
    .slice(0, Number.isFinite(options.secondaryLimit) ? options.secondaryLimit : 3);
  const levelText = summarizeOverlayFieldValue(feature, 'level');
  const subject = primary
    ? `${sanitizeText(primary, 120)} ${subjectLabel}`
    : subjectLabel;
  let line = `${actionVerb} ${subject}`;
  if (secondary.length) {
    line += ` with ${joinSummaryParts(secondary)}`;
  } else if (levelText && !secondary.includes(levelText)) {
    line += ` on ${levelText.toLowerCase()}`;
  }
  return sanitizeText(line, 220);
}

function buildSubmissionSummary(feature = {}) {
  const preset = getOverlayPreset(feature.presetId);
  const validation = feature.validation || {};
  const issues = Array.isArray(validation.issues) ? validation.issues : [];
  const errorCount = issues.filter((entry) => entry.severity === 'error').length;
  const warningCount = issues.filter((entry) => entry.severity === 'warning').length;
  const contributorNote = sanitizeText(feature.submission?.contributorNote || '', 320);
  return {
    title: overlayFeatureLabel(feature),
    description: readableFeatureDescription(feature),
    summaryLine: buildModerationSummaryLine(feature),
    highlights: featureHighlights(feature, { limit: 8, includeState: false }),
    validationLine: errorCount > 0
      ? `${errorCount} error${errorCount === 1 ? '' : 's'} and ${warningCount} warning${warningCount === 1 ? '' : 's'}`
      : warningCount > 0
        ? `No blocking errors, ${warningCount} warning${warningCount === 1 ? '' : 's'}`
        : 'Validation is clean',
    contributorNote,
    reviewerChecklist: [
      preset.help?.moderationNotes || 'Check geometry, semantics, and runtime safety before publishing.',
      feature.baseFeatureRef?.featureId
        ? 'Confirm the base reference matches the intended local patch.'
        : 'Confirm this is a true additive overlay and not a hidden base edit.',
      feature.geometryType === 'Polygon' && preset.featureClass === 'building'
        ? 'Verify shell dimensions, levels, and roof data align with the intended 3D output.'
        : 'Verify geometry shape and placement match the selected preset.'
    ].map((item) => sanitizeText(item, 220)),
    reviewStateLine: feature.reviewState ? `Review state: ${formatReviewState(feature.reviewState)}` : ''
  };
}

function buildReviewSummaryCard(feature = {}) {
  return buildSubmissionSummary(feature);
}

function buildActivitySummary(feature = {}, options = {}) {
  return buildModerationSummaryLine(feature, options);
}

export {
  buildActivitySummary,
  buildModerationSummaryLine,
  buildReviewSummaryCard,
  buildSubmissionSummary,
  featureHighlights,
  readableFeatureDescription
};
