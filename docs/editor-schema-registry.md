# Editor Schema Registry

World Explorer's guided editor is driven by central schema modules rather than scattered per-panel form logic.

## Source Modules

- `app/js/editor/field-registry.js`
  - Normalizes editable field contracts.
  - Exposes field help, examples, advanced mapping, visibility rules, and read/apply helpers.
  - Adds advanced overlay-control fields such as `merge_mode`, `source_type`, and `base_feature_ref`.
- `app/js/editor/preset-registry.js`
  - Normalizes preset contracts.
  - Exposes preset picker groups, guided field groups, advanced field groups, required field lists, summary templates, and future flags.
  - Canonicalizes `landuse_park` while preserving `park_landuse` as a compatibility alias.
- `app/js/editor/validation-registry.js`
  - Normalizes reusable validation rule metadata.
  - Stores user-facing fix guidance, severity, target fields, execution locations, and moderator notes.
- `app/js/editor/help-content.js`
  - Stores contributor help topics, preset help cards, field help cards, validation guidance, and advanced mapping references.
- `app/js/editor/summaries.js`
  - Builds schema-driven submission, moderation, and activity summaries from preset templates plus field summaries.

## Normal Contributor Layer

The default editor flow should only need:

- A preset id
- Guided field groups from `getOverlayPresetFieldGroups(...)`
- Required fields from the preset contract
- Validation feedback from `validateOverlayFeature(...)`
- Help text from `buildPresetHelpCard(...)` and `buildFieldHelpCard(...)`

Raw tags are not required for this path.

## Advanced Contributor Layer

Advanced mode uses:

- `getOverlayPresetAdvancedFieldGroups(...)`
- `listPresetAdvancedMappings(...)`
- Optional raw tag editing

The advanced field layer is explicit and separate from the default workflow so contributors can inspect low-level overlay behavior without exposing raw tags as the main authoring surface.

## Summary Model

Each normalized preset exposes a `moderationSummaryTemplate` with:

- `createVerb`
- `updateVerb`
- `subjectLabel`
- `primaryFieldIds`
- `secondaryFieldIds`

`buildSubmissionSummary(...)` and `buildModerationSummaryLine(...)` use that template plus field-level summary functions to produce readable, moderation-friendly descriptions.

## Integration Notes

- Existing compatibility exports in `app/js/editor/config.js` remain in place for low-level constants.
- Live editor consumers now import preset/field registries directly where guided behavior matters.
- The advanced inspector is schema-driven for overlay control fields; the remaining hardcoded 3D inspector sections should migrate to the same field registry next.
