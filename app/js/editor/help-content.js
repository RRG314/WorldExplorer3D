import {
  getOverlayFieldDefinition
} from './field-registry.js?v=1';
import {
  getOverlayPreset,
  getOverlayPresetAdvancedMappings,
  getOverlayPresetCategory
} from './preset-registry.js?v=1';
import {
  getOverlayValidationRule
} from './validation-registry.js?v=1';

const DEFAULT_EDITOR_HELP_TOPIC = 'workflow';

function sanitizeText(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const EDITOR_HELP_TOPICS = Object.freeze([
  {
    id: 'workflow',
    label: 'How Editing Works',
    summary: 'World Explorer editing is preset-first, geometry-first, moderation-backed, and currently presented as a beta demo.',
    sections: [
      {
        title: 'Default workflow',
        items: [
          'Choose a preset first so the editor exposes the right geometry and guided fields.',
          'Draw or refine geometry in the world, then fill only the fields relevant to that preset.',
          'Validate before submitting so moderation sees a clean overlay instead of an unclear draft.'
        ]
      },
      {
        title: 'What this editor is not',
        items: [
          'Not a raw-tag workflow that expects contributors to memorize a giant wiki.',
          'Not a sandbox build mode for decorative objects.',
          'Not a direct edit path into imported OSM source records.',
          'Not connected to OpenStreetMap contribution workflows in this beta demo.'
        ]
      }
    ]
  },
  {
    id: 'overlay_model',
    label: 'Overlay Model',
    summary: 'Approved overlays merge into the runtime world without mutating the imported base ingest.',
    sections: [
      {
        title: 'Base versus overlay',
        items: [
          'Base world data remains the stable ingest layer.',
          'Overlay features can supplement missing content or override local runtime behavior.',
          'Only approved overlays publish into runtime layers.'
        ]
      },
      {
        title: 'Merge modes',
        items: [
          'Additive overlays add new world content.',
          'Render overrides change how a base feature appears without altering the base record.',
          'Local replacements safely swap a local segment or shell after approval.'
        ]
      }
    ]
  },
  {
    id: 'moderation',
    label: 'Moderation',
    summary: 'Contributors save drafts and submit them. Moderators decide what becomes live.',
    sections: [
      {
        title: 'Review states',
        items: [
          'Draft stays private to the contributor until it is submitted.',
          'Submitted enters the moderation queue for review.',
          'Approved and published overlays affect runtime output only after review.'
        ]
      },
      {
        title: 'What helps approval',
        items: [
          'Readable geometry that matches the chosen preset.',
          'Clear 3D, access, or level fields when those details matter.',
          'A concise contributor note when the change is subtle, evidence-based, or locally corrective.'
        ]
      }
    ]
  },
  {
    id: 'validation',
    label: 'Validation',
    summary: 'Validation explains why something is unsafe or unclear before it reaches moderation.',
    sections: [
      {
        title: 'What gets checked',
        items: [
          'Geometry sanity such as point placement, line length, and polygon footprint size.',
          'Required preset fields like road class, building type, or indoor level.',
          'Conflicts such as bridge and tunnel being set at the same time.'
        ]
      },
      {
        title: 'How to use it',
        items: [
          'Errors block submission and should be fixed first.',
          'Warnings are review-risk indicators and should usually be addressed.',
          'Issue cards explain the field or concept that needs attention and how to fix it.'
        ]
      }
    ]
  },
  {
    id: 'power_user',
    label: 'Power User Mode',
    summary: 'Advanced mode exposes low-level overlay controls without making raw tags the default workflow.',
    sections: [
      {
        title: 'What advanced mode shows',
        items: [
          'Underlying mapping from guided fields to tags and overlay properties.',
          'Overlay controls such as merge mode, source type, and base target reference.',
          'Raw tag editing when the guided schema is not enough.'
        ]
      },
      {
        title: 'When to use it',
        items: [
          'You already understand the preset and need a precise low-level fix.',
          'You are debugging a moderation or rendering edge case.',
          'You need to inspect how the guided schema maps to stored overlay data.'
        ]
      }
    ]
  }
]);

function listHelpTopics() {
  return EDITOR_HELP_TOPICS.slice();
}

function getHelpTopic(topicId) {
  const next = sanitizeText(topicId || DEFAULT_EDITOR_HELP_TOPIC, 80).toLowerCase();
  return EDITOR_HELP_TOPICS.find((topic) => topic.id === next) || EDITOR_HELP_TOPICS[0];
}

function buildPresetHelpCard(presetId) {
  const preset = getOverlayPreset(presetId);
  const category = getOverlayPresetCategory(preset.category);
  return {
    id: preset.id,
    label: preset.label,
    categoryLabel: category.label,
    description: sanitizeText(preset.help.description || preset.description || '', 240),
    whenToUse: preset.help.whenToUse.slice(0, 4),
    doNotUse: preset.help.doNotUse.slice(0, 4),
    mistakes: preset.help.mistakes.slice(0, 4),
    examples: preset.help.examples.slice(0, 3),
    moderationNotes: sanitizeText(preset.help.moderationNotes || '', 240),
    advancedNotes: sanitizeText(preset.help.advancedNotes || '', 240),
    relatedPresets: preset.help.relatedPresetIds
      .map((id) => getOverlayPreset(id))
      .filter(Boolean)
      .map((item) => ({ id: item.id, label: item.label }))
  };
}

function buildFieldHelpCard(fieldId) {
  const field = getOverlayFieldDefinition(fieldId);
  if (!field) return null;
  return {
    id: field.id,
    label: field.label,
    description: sanitizeText(field.help.shortText || field.description || '', 240),
    longText: sanitizeText(field.help.longText || field.description || '', 320),
    examples: field.help.examples.slice(0, 3),
    moderationNotes: sanitizeText(field.help.moderationNotes || '', 220),
    advancedNotes: sanitizeText(field.help.advancedNotes || '', 220),
    mapping: Array.isArray(field.advancedMapping) ? field.advancedMapping.slice() : []
  };
}

function buildValidationIssueGuidance(issue = {}) {
  const field = issue.fieldId ? getOverlayFieldDefinition(issue.fieldId) : null;
  const rule = issue.ruleId ? getOverlayValidationRule(issue.ruleId) : null;
  return {
    title: field?.label || rule?.label || 'Validation Issue',
    message: sanitizeText(issue.message || '', 240),
    hint: sanitizeText(issue.hint || rule?.fixGuidance || rule?.description || '', 240),
    severity: sanitizeText(issue.severity || rule?.severity || 'warning', 16).toLowerCase(),
    fieldId: sanitizeText(issue.fieldId || '', 80),
    ruleId: sanitizeText(issue.ruleId || '', 120),
    moderatorNote: sanitizeText(rule?.moderatorNote || '', 220)
  };
}

function listPresetAdvancedMappings(presetId) {
  const preset = getOverlayPreset(presetId);
  return getOverlayPresetAdvancedMappings(preset.id).map((mapping) => ({
    fieldId: sanitizeText(mapping.fieldId || '', 80),
    fieldLabel: sanitizeText(mapping.fieldLabel || mapping.group || '', 120),
    path: sanitizeText(mapping.path || '', 140),
    label: sanitizeText(mapping.label || '', 140),
    group: sanitizeText(mapping.group || '', 120)
  }));
}

function buildHelpTopic(topicId, context = {}) {
  const next = sanitizeText(topicId || DEFAULT_EDITOR_HELP_TOPIC, 80).toLowerCase();
  if (next === 'preset') {
    const card = buildPresetHelpCard(context.presetId || 'poi_marker');
    return {
      id: 'preset',
      label: `${card.label} Guide`,
      summary: card.description,
      sections: [
        { title: 'When To Use It', items: card.whenToUse },
        { title: 'Do Not Use It For', items: card.doNotUse },
        { title: 'Common Mistakes', items: card.mistakes },
        { title: 'Examples', items: card.examples },
        { title: 'Moderation Notes', items: card.moderationNotes ? [card.moderationNotes] : [] },
        { title: 'Advanced Notes', items: card.advancedNotes ? [card.advancedNotes] : [] }
      ]
    };
  }

  if (next === 'advanced_mappings') {
    const preset = getOverlayPreset(context.presetId || 'poi_marker');
    const mappings = listPresetAdvancedMappings(preset.id);
    return {
      id: 'advanced_mappings',
      label: `${preset.label} Mapping`,
      summary: 'This view shows how guided fields map to stored overlay tags, relations, and runtime properties.',
      sections: [
        {
          title: 'Field Mappings',
          items: mappings.map((mapping) => `${mapping.fieldLabel}: ${mapping.label} (${mapping.path})`)
        }
      ]
    };
  }

  if (next === 'field') {
    const card = buildFieldHelpCard(context.fieldId || '');
    return {
      id: 'field',
      label: card?.label || 'Field Help',
      summary: sanitizeText(card?.description || 'This field controls how the selected preset is stored and reviewed.', 240),
      sections: [
        {
          title: 'What This Field Means',
          items: [sanitizeText(card?.longText || card?.description || 'Use the guided value that best matches the real-world feature.', 240)]
        },
        {
          title: 'Examples',
          items: card?.examples?.length ? card.examples : ['No example is registered for this field yet.']
        },
        {
          title: 'Advanced Mapping',
          items: card?.mapping?.length
            ? card.mapping.map((mapping) => `${sanitizeText(mapping.label || '', 120)} (${sanitizeText(mapping.path || '', 120)})`)
            : ['This field does not expose advanced mapping metadata yet.']
        },
        {
          title: 'Moderation Notes',
          items: card?.moderationNotes ? [card.moderationNotes] : []
        }
      ]
    };
  }

  if (next === 'validation_issue') {
    const guidance = buildValidationIssueGuidance(context.issue || {});
    return {
      id: 'validation_issue',
      label: guidance.title,
      summary: guidance.message,
      sections: [
        {
          title: 'How To Fix It',
          items: guidance.hint ? [guidance.hint] : ['Update the guided fields or geometry until this issue clears.']
        },
        {
          title: 'Why Moderation Cares',
          items: guidance.moderatorNote ? [guidance.moderatorNote] : []
        }
      ]
    };
  }

  return getHelpTopic(next);
}

export {
  DEFAULT_EDITOR_HELP_TOPIC,
  EDITOR_HELP_TOPICS,
  buildFieldHelpCard,
  buildHelpTopic,
  buildPresetHelpCard,
  buildValidationIssueGuidance,
  getHelpTopic,
  listHelpTopics,
  listPresetAdvancedMappings
};
