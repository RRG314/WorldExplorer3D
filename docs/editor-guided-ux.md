# World Explorer 3D Guided Editor UX

## Audit Summary

The current overlay editor already provides:

- Real geometry editing in `app/js/editor/session.js`
- Overlay draft storage and moderation in `app/js/editor/store.js`, `js/overlay-api.js`, and `functions/overlay.js`
- Preset defaults in `app/js/editor/config.js`
- Validation in `app/js/editor/validation.js`
- Runtime-safe publishing into overlay runtime layers

The main gaps before this pass were:

- The editor still exposed a generic inspector as the primary workflow
- Preset guidance was too thin for regular contributors
- Field-level help and validation explanations were minimal
- Raw tag editing was too close to the default authoring path
- Moderation summaries were present but not very readable
- There was no reusable in-app contributor guide surface

This pass keeps the overlay architecture intact and adds the understanding layer on top of it instead of replacing the editor core.

## Architecture Mapping

The guided layer lives inside the existing overlay editor stack:

- `app/js/editor/config.js`
  - preset registry
  - field definitions
  - validation rule descriptors
  - advanced mapping metadata
- `app/js/editor/help.js`
  - contributor guide topics
  - preset help cards
  - validation guidance helpers
  - readable submission/moderation summaries
- `app/js/editor/validation.js`
  - richer issue payloads with `fieldId`, `ruleId`, and `hint`
- `app/js/editor/session.js`
  - preset-first UI
  - guided field rendering
  - help drawer orchestration
  - advanced mode gating
  - moderation-friendly preview summaries
- `app/js/editor/schema.js` and `functions/overlay.js`
  - submission metadata normalization

## Guided Authoring Model

Each preset now carries:

- `id`
- `label`
- `category`
- `geometryType`
- `featureClass`
- `default tags`
- `default 3D properties`
- `fieldGroups`
- `requiredFields`
- `validationRules`
- `help` content

Each field definition can provide:

- label and control type
- inline help text
- example values
- read/apply handlers
- advanced property/tag mapping metadata
- summary formatting for review output

This keeps the default workflow preset-first and guided, while still allowing power users to inspect the underlying mapping.

## Help System

The help system is data-driven and intentionally small:

- Inline field help sits directly under each guided field
- Preset cards explain when to use a preset, what not to use it for, and common mistakes
- Validation issues now include fix guidance
- A help drawer exposes:
  - how editing works
  - overlay model explanation
  - moderation workflow
  - validation behavior
  - power-user mode guidance
  - selected preset guide
  - field-specific help
  - advanced mapping view

This avoids a large wiki while still giving contributors enough context inside the tool.

## Advanced Mode

Advanced mode is explicit and opt-in.

Regular contributors work through guided fields first.

Power users can reveal:

- merge mode controls
- source type controls
- raw tag editor
- underlying mapping rows
- manual 3D and relation overrides

This keeps the normal editing path approachable without blocking precise low-level corrections.

## Moderation Support

Submission and review surfaces now use readable summaries built from the same preset metadata:

- human-readable feature description
- highlight chips from guided fields
- contributor note support
- reviewer checklist hints
- richer moderation detail cards
- validation issue explanations

The editor still follows the existing overlay moderation pipeline:

- contributors save drafts
- contributors submit for review
- moderators approve, reject, or request changes
- only approved overlays publish into runtime

## Indoor Scaffolding

Indoor support remains scaffolded rather than fully built out in this pass.

New presets now exist for:

- Interior Room
- Corridor
- Stairs
- Elevator

They use level-aware metadata and connector fields so the future interior editor can build on consistent overlay records without forcing raw tag editing today.
