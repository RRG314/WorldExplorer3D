import { readOverlayFieldValue } from './field-registry.js?v=1';
import {
  getOverlayPreset,
  getOverlayPresetAdvancedFieldGroups,
  getOverlayPresetFieldGroups,
  getOverlayPresetPickerGroups
} from './preset-registry.js?v=1';
import {
  buildPresetHelpCard,
  buildSubmissionSummary,
  buildValidationIssueGuidance,
  listPresetAdvancedMappings,
  readableFeatureDescription
} from './help.js?v=1';
import { createOverlayFeatureDraft } from './schema.js?v=1';
import { renderHelpDrawer } from './session-help-drawer.js?v=1';

function presetSampleFeature(presetId) {
  return createOverlayFeatureDraft({ presetId });
}

function updateFieldValue(ref, value) {
  if (!ref) return;
  if (ref.type === 'checkbox') ref.checked = value === true;
  else if (ref.value !== String(value ?? '')) ref.value = String(value ?? '');
}

function guidedFieldInputHtml(ctx, field, feature, disabled) {
  const value = readOverlayFieldValue(feature, field.id);
  const disabledAttr = disabled ? ' disabled' : '';
  const helpText = ctx.escapeHtml(field.help?.shortText || field.helpText || field.description || '');
  const exampleValue = Array.isArray(field.exampleValues) ? field.exampleValues[0] : field.example;
  const example = exampleValue ? `<div class="editorFieldExample">Example: ${ctx.escapeHtml(exampleValue)}</div>` : '';
  const helpBtn = `<button type="button" class="editorFieldHelpBtn" data-editor-help-field="${ctx.escapeHtml(field.id)}">Help</button>`;

  if (field.inputType === 'select' || field.kind === 'select') {
    const options = Array.isArray(field.options) ? field.options : [];
    const optionHtml = options.map((entry) => `
      <option value="${ctx.escapeHtml(entry.value)}"${String(entry.value) === String(value) ? ' selected' : ''}>${ctx.escapeHtml(entry.label)}</option>
    `).join('');
    const activeOption = options.find((entry) => String(entry.value) === String(value));
    const hint = activeOption?.description ? `<div class="editorSelectOptionHint">${ctx.escapeHtml(activeOption.description)}</div>` : '';
    return `
      <label class="editorField">
        <div class="editorFieldLead">
          <span class="editorFieldLabel">${ctx.escapeHtml(field.label)}</span>
          ${helpBtn}
        </div>
        <select data-editor-guided-field="${ctx.escapeHtml(field.id)}"${disabledAttr}>${optionHtml}</select>
        <div class="editorFieldHelp">${helpText}</div>
        ${example}
        ${hint}
      </label>
    `;
  }

  if (field.inputType === 'toggle' || field.kind === 'toggle') {
    return `
      <div class="editorField">
        <div class="editorFieldLead">
          <span class="editorFieldLabel">${ctx.escapeHtml(field.label)}</span>
          ${helpBtn}
        </div>
        <label class="editorAdvancedToggle">
          <input type="checkbox" data-editor-guided-field="${ctx.escapeHtml(field.id)}"${value === true ? ' checked' : ''}${disabledAttr}>
          <span>${ctx.escapeHtml(field.label)}</span>
        </label>
        <div class="editorFieldHelp">${helpText}</div>
        ${example}
      </div>
    `;
  }

  if (field.inputType === 'textarea' || field.kind === 'textarea') {
    return `
      <label class="editorField">
        <div class="editorFieldLead">
          <span class="editorFieldLabel">${ctx.escapeHtml(field.label)}</span>
          ${helpBtn}
        </div>
        <textarea data-editor-guided-field="${ctx.escapeHtml(field.id)}" rows="${Number.isFinite(Number(field.rows)) ? Number(field.rows) : 3}" maxlength="${Number.isFinite(Number(field.maxLength)) ? Number(field.maxLength) : 320}" placeholder="${ctx.escapeHtml(field.placeholderText || field.placeholder || '')}"${disabledAttr}>${ctx.escapeHtml(value || '')}</textarea>
        <div class="editorFieldHelp">${helpText}</div>
        ${example}
      </label>
    `;
  }

  const inputType = field.inputType === 'number' || field.kind === 'number' ? 'number' : 'text';
  const stepAttr = (field.inputType === 'number' || field.kind === 'number') && field.step != null ? ` step="${ctx.escapeHtml(field.step)}"` : '';
  const minAttr = (field.inputType === 'number' || field.kind === 'number') && field.min != null ? ` min="${ctx.escapeHtml(field.min)}"` : '';
  const maxAttr = (field.inputType === 'number' || field.kind === 'number') && field.max != null ? ` max="${ctx.escapeHtml(field.max)}"` : '';
  return `
    <label class="editorField">
      <div class="editorFieldLead">
        <span class="editorFieldLabel">${ctx.escapeHtml(field.label)}</span>
        ${helpBtn}
      </div>
      <input type="${inputType}" data-editor-guided-field="${ctx.escapeHtml(field.id)}" value="${ctx.escapeHtml(value || '')}" placeholder="${ctx.escapeHtml(field.placeholderText || field.placeholder || '')}"${stepAttr}${minAttr}${maxAttr}${disabledAttr}>
      <div class="editorFieldHelp">${helpText}</div>
      ${example}
    </label>
  `;
}

function renderTagList(ctx, refs, feature) {
  if (!(refs.tagList instanceof HTMLElement)) return;
  if (!feature) {
    refs.tagList.innerHTML = '<div class="editorEmptyState">Select or create an overlay feature to edit raw tags.</div>';
    return;
  }
  const keys = [...new Set([
    ...Object.keys(getOverlayPreset(feature.presetId).tags || {}),
    ...Object.keys(feature.tags || {})
  ])].filter(Boolean);
  refs.tagList.innerHTML = keys.length
    ? keys.map((key) => `
        <label class="editorKeyValueRow">
          <span>${ctx.escapeHtml(key)}</span>
          <input type="text" data-editor-tag="${ctx.escapeHtml(key)}" value="${ctx.escapeHtml(feature.tags?.[key] || '')}">
        </label>
      `).join('')
    : '<div class="editorEmptyState">No raw tags yet. Add one below.</div>';
}

function renderWorkspaceFeatureList(ctx, refs) {
  if (!(refs.workspaceFeatureList instanceof HTMLElement)) return;
  refs.workspaceFeatureList.innerHTML = ctx.state.workspaceFeatures.length
    ? ctx.state.workspaceFeatures.map((feature) => `
        <button class="editorListRow ${feature.featureId === ctx.state.selectedFeatureId ? 'selected' : ''}" data-editor-workspace-id="${ctx.escapeHtml(feature.featureId)}">
          <span>${ctx.escapeHtml(ctx.overlayFeatureLabel(feature))}</span>
          <span>${ctx.escapeHtml(feature.storageMode === 'local' ? 'local draft' : feature.reviewState)}</span>
        </button>
      `).join('')
    : '<div class="editorEmptyState">No workspace features yet. Pick a preset and draw in the world.</div>';
}

function renderValidation(ctx, refs, feature) {
  if (!(refs.validationIssues instanceof HTMLElement)) return;
  const issues = feature?.validation?.issues || [];
  refs.validationIssues.innerHTML = issues.length
    ? issues.map((entry) => {
        const guidance = buildValidationIssueGuidance(entry);
        return `
          <div class="editorIssue ${ctx.escapeHtml(guidance.severity)}">
            <div class="editorIssueHead">
              <div class="editorIssueTitle">${ctx.escapeHtml(guidance.title)}</div>
              <button type="button" class="editorIssueHelpBtn" data-editor-validation-help="${ctx.escapeHtml(entry.code)}">Why?</button>
            </div>
            <div>${ctx.escapeHtml(guidance.message)}</div>
            ${guidance.hint ? `<div class="editorIssueHint">${ctx.escapeHtml(guidance.hint)}</div>` : ''}
          </div>
        `;
      }).join('')
    : '<div class="editorIssue ok">No validation issues on the selected feature.</div>';
}

function renderOnboardingCard(ctx, refs, feature) {
  if (!(refs.onboardingCard instanceof HTMLElement)) return;
  const preset = getOverlayPreset(feature?.presetId || ctx.state.activePresetId);
  const hasBaseSelection = !!ctx.state.selectedBaseFeature;
  refs.onboardingCard.innerHTML = `
    <div class="editorOnboardingEyebrow">World Editor</div>
    <div class="editorOnboardingTitle">Start here</div>
    <div class="editorOnboardingCopy">Choose what you want to map, then draw or adjust it directly in the world. Contributions are reviewed for World Explorer and are not sent to OpenStreetMap.</div>
    <div class="editorOnboardingSteps">
      <div class="editorOnboardingStep">
        <strong>1. Choose a preset</strong>
        ${ctx.escapeHtml(`Current preset: ${preset.label}. Switch presets before drawing if this is the wrong feature type.`)}
      </div>
      <div class="editorOnboardingStep">
        <strong>2. Place or patch geometry</strong>
        ${ctx.escapeHtml(hasBaseSelection
          ? `A base feature is selected. Clone ${ctx.state.selectedBaseFeature.displayName || 'it'} into an overlay patch, or ignore it and draw a fresh overlay.`
          : 'Drag roads and paths to lay segments. Drag buildings and parking to box out footprints. Click still works for custom vertex editing.')}
      </div>
      <div class="editorOnboardingStep">
        <strong>3. Edit fields after geometry exists</strong>
        Guided fields, validation, and submission preview stay hidden until there is something real to edit.
      </div>
    </div>
    <div class="editorOnboardingActions">
      <button type="button" data-editor-sidebar-view="presets">Browse Presets</button>
      <button type="button" class="secondary" data-editor-start-draw="1">Draw ${ctx.escapeHtml(preset.label)}</button>
      <button type="button" class="secondary" data-editor-help-topic="workflow">How review works</button>
    </div>
  `;
}

function renderPresetList(ctx, refs) {
  if (!(refs.presetList instanceof HTMLElement)) return;
  const groups = getOverlayPresetPickerGroups(ctx.state.presetQuery);
  refs.presetList.innerHTML = groups.map((category) => {
    return `
      <div class="editorPresetCategoryBlock">
        <div class="editorPresetCategoryLabel">${ctx.escapeHtml(category.label)}</div>
        ${category.presets.map((preset) => `
          <button class="editorPresetCard ${preset.id === ctx.state.activePresetId ? 'active' : ''}" data-editor-preset="${ctx.escapeHtml(preset.id)}">
            <strong>${ctx.escapeHtml(preset.label)}</strong>
            <span>${ctx.escapeHtml(preset.geometryType)} • ${ctx.escapeHtml(preset.featureClass)}</span>
          </button>
        `).join('')}
      </div>
    `;
  }).join('');
  if (refs.presetSummary) {
    const preset = getOverlayPreset(ctx.state.activePresetId);
    const helpCard = buildPresetHelpCard(preset.id);
    refs.presetSummary.innerHTML = `
      <div class="editorPresetSummaryTitle">
        <strong>${ctx.escapeHtml(helpCard.label)}</strong>
        <span class="editorPresetSummaryMeta">${ctx.escapeHtml(helpCard.categoryLabel)} • ${ctx.escapeHtml(preset.geometryType)}</span>
      </div>
      <div class="editorPresetSummaryText">${ctx.escapeHtml(helpCard.description)}</div>
      <div class="editorPresetSummaryList">
        ${helpCard.whenToUse.slice(0, 2).map((entry) => `<div>Use when: ${ctx.escapeHtml(entry)}</div>`).join('')}
        ${helpCard.mistakes.slice(0, 1).map((entry) => `<div>Watch for: ${ctx.escapeHtml(entry)}</div>`).join('')}
      </div>
      <div class="editorPresetSummaryRelated">
        <button type="button" data-editor-help-topic="preset">Open Guide</button>
        ${helpCard.relatedPresets.slice(0, 3).map((entry) => `<button type="button" data-editor-related-preset="${ctx.escapeHtml(entry.id)}">${ctx.escapeHtml(entry.label)}</button>`).join('')}
      </div>
    `;
  }
}

function renderSelectedPresetCard(ctx, refs, feature) {
  if (!(refs.selectedPresetCard instanceof HTMLElement)) return;
  const preset = getOverlayPreset(feature?.presetId || ctx.state.activePresetId);
  const helpCard = buildPresetHelpCard(preset.id);
  refs.selectedPresetCard.innerHTML = `
    <div class="editorPresetSummaryTitle">
      <strong>${ctx.escapeHtml(preset.label)}</strong>
      <span class="editorPresetSummaryMeta">${ctx.escapeHtml(preset.featureClass)} • ${ctx.escapeHtml(preset.geometryType)}</span>
    </div>
    <div class="editorPresetSummaryText">${ctx.escapeHtml(helpCard.description)}</div>
    <div class="editorPresetSummaryList">
      ${helpCard.whenToUse.slice(0, 2).map((entry) => `<div>${ctx.escapeHtml(entry)}</div>`).join('')}
    </div>
  `;
}

function renderFieldGroupCards(ctx, container, groups, previewFeature, disabled, emptyMessage) {
  if (!(container instanceof HTMLElement)) return;
  if (!groups.length) {
    container.innerHTML = `<div class="editorEmptyState">${ctx.escapeHtml(emptyMessage)}</div>`;
    return;
  }
  container.innerHTML = `
    ${disabled ? '<div class="editorEmptyState">Draw or clone geometry to enable editing for this feature.</div>' : ''}
    ${groups.map((group) => `
      <div class="editorFieldGroupCard">
        <div class="editorFieldGroupTitle">${ctx.escapeHtml(group.label)}</div>
        ${group.fields.map((field) => guidedFieldInputHtml(ctx, field, previewFeature, disabled)).join('')}
      </div>
    `).join('')}
  `;
}

function renderGuidedFieldPanel(ctx, refs, feature) {
  const presetId = feature?.presetId || ctx.state.activePresetId;
  const groups = getOverlayPresetFieldGroups(presetId, { feature });
  const previewFeature = feature || presetSampleFeature(presetId);
  const disabled = !feature;
  renderFieldGroupCards(
    ctx,
    refs.guidedFieldPanel,
    groups,
    previewFeature,
    disabled,
    'No guided fields are registered for this preset yet.'
  );
}

function renderAdvancedFieldPanel(ctx, refs, feature) {
  const presetId = feature?.presetId || ctx.state.activePresetId;
  const groups = getOverlayPresetAdvancedFieldGroups(presetId, { feature, advancedMode: true });
  const previewFeature = feature || presetSampleFeature(presetId);
  const disabled = !feature;
  renderFieldGroupCards(
    ctx,
    refs.advancedFieldPanel,
    groups,
    previewFeature,
    disabled,
    'No advanced overlay fields are registered for this preset.'
  );
}

function renderAdvancedMapping(ctx, refs, feature) {
  if (!(refs.advancedMapping instanceof HTMLElement)) return;
  const presetId = feature?.presetId || ctx.state.activePresetId;
  const mappings = listPresetAdvancedMappings(presetId);
  refs.advancedMapping.innerHTML = mappings.length
    ? mappings.map((entry) => `
        <div class="editorAdvancedMappingRow">
          <div>
            <strong>${ctx.escapeHtml(entry.fieldLabel)}</strong>
            <span>${ctx.escapeHtml(entry.label)}</span>
          </div>
          <span>${ctx.escapeHtml(entry.path)}</span>
        </div>
      `).join('')
    : '<div class="editorEmptyState">No advanced mapping metadata is registered for this preset.</div>';
}

function renderWorkspaceSidebar(ctx, refs, feature) {
  const view = ctx.resolveWorkspaceSidebarView(feature);
  refs.sidebarStartBtn?.classList.toggle('active', view === 'start');
  refs.sidebarPresetsBtn?.classList.toggle('active', view === 'presets');
  refs.sidebarSelectionBtn?.classList.toggle('active', view === 'selection');
  if (refs.sidebarSelectionBtn) refs.sidebarSelectionBtn.disabled = !feature && ctx.state.workspaceFeatures.length === 0;
  if (refs.sidebarStartView) refs.sidebarStartView.hidden = view !== 'start';
  if (refs.sidebarPresetsView) refs.sidebarPresetsView.hidden = view !== 'presets';
  if (refs.sidebarSelectionView) refs.sidebarSelectionView.hidden = view !== 'selection';
  renderOnboardingCard(ctx, refs, feature);
}

function renderOwnFeatures(ctx, refs) {
  if (!(refs.ownFeatureList instanceof HTMLElement)) return;
  refs.ownFeatureList.innerHTML = ctx.state.ownFeatures.length
    ? ctx.state.ownFeatures.map((feature) => {
        const summary = buildSubmissionSummary(feature);
        return `
          <div class="editorSubmissionCard">
            <div class="editorSubmissionTop">
              <strong>${ctx.escapeHtml(summary.title)}</strong>
              <span class="editorSubmissionStatus" data-status="${ctx.escapeHtml(feature.reviewState)}">${ctx.escapeHtml(feature.storageMode === 'local' ? 'local draft' : feature.reviewState)}</span>
            </div>
            <div class="editorSubmissionMeta">${ctx.escapeHtml(feature.presetId)} • v${ctx.escapeHtml(feature.version)} • ${ctx.escapeHtml(summary.validationLine)}${feature.storageMode === 'local' ? ' • local device draft' : ''}</div>
            <div class="editorSubmissionSubtitle">${ctx.escapeHtml(summary.description)}</div>
            ${summary.highlights.length ? `<div class="editorSubmissionChipRow">${summary.highlights.slice(0, 4).map((item) => `<span>${ctx.escapeHtml(item)}</span>`).join('')}</div>` : ''}
            ${summary.contributorNote ? `<div class="editorSubmissionNote">${ctx.escapeHtml(summary.contributorNote)}</div>` : ''}
            <div class="editorSubmissionActions">
              <button type="button" data-editor-own-action="load" data-editor-own-id="${ctx.escapeHtml(feature.featureId)}">Load</button>
              <button type="button" data-editor-own-action="focus" data-editor-own-id="${ctx.escapeHtml(feature.featureId)}">Focus</button>
              ${feature.reviewState === 'draft' || feature.reviewState === 'needs_changes' || feature.reviewState === 'rejected'
                ? `<button type="button" data-editor-own-action="submit" data-editor-own-id="${ctx.escapeHtml(feature.featureId)}">Submit</button>
                   <button type="button" data-editor-own-action="delete" data-editor-own-id="${ctx.escapeHtml(feature.featureId)}">Delete</button>`
                : ''}
            </div>
          </div>
        `;
      }).join('')
    : '<div class="editorEmptyState">No saved drafts on this device yet.</div>';
}

function moderationFilteredItems(ctx, refs) {
  const stateFilter = ctx.sanitizeText(refs.moderationStateFilter?.value || '', 40).toLowerCase();
  const search = ctx.sanitizeText(refs.moderationSearchInput?.value || '', 80).toLowerCase();
  return ctx.state.moderationQueue.filter((feature) => {
    const matchesState = !stateFilter || stateFilter === 'all' || feature.reviewState === stateFilter;
    if (!matchesState) return false;
    if (!search) return true;
    return [
      ctx.overlayFeatureLabel(feature),
      feature.featureClass,
      feature.presetId,
      feature.tags?.name,
      feature.baseFeatureRef?.displayName
    ].join(' ').toLowerCase().includes(search);
  });
}

function renderModeration(ctx, refs) {
  if (!(refs.moderationList instanceof HTMLElement)) return;
  const items = moderationFilteredItems(ctx, refs);
  refs.moderationList.innerHTML = items.length
    ? items.map((feature) => `
        <button class="editorListRow ${feature.featureId === ctx.state.selectedFeatureId ? 'selected' : ''}" data-editor-moderation-id="${ctx.escapeHtml(feature.featureId)}">
          <span>${ctx.escapeHtml(ctx.overlayFeatureLabel(feature))}</span>
          <span>${ctx.escapeHtml(feature.reviewState)}</span>
        </button>
      `).join('')
    : '<div class="editorEmptyState">No moderation items match this view.</div>';

  const selected = items.find((feature) => feature.featureId === ctx.state.selectedFeatureId) || items[0] || null;
  if (selected && ctx.state.selectedFeatureId !== selected.featureId) {
    ctx.state.selectedFeatureId = selected.featureId;
  }
  if (!(refs.moderationDetail instanceof HTMLElement)) return;
  if (!selected) {
    refs.moderationDetail.innerHTML = '<div class="editorEmptyState">Select a submitted overlay feature to inspect and moderate it.</div>';
    return;
  }
  const summary = buildSubmissionSummary(selected);
  refs.moderationDetail.innerHTML = `
    <div class="editorModerationDetailHead">
      <div>
        <div class="editorModerationDetailTitle">${ctx.escapeHtml(summary.title)}</div>
        <div class="editorModerationCellValue">${ctx.escapeHtml(summary.description)}</div>
      </div>
      <span class="editorSubmissionStatus" data-status="${ctx.escapeHtml(selected.reviewState)}">${ctx.escapeHtml(selected.reviewState)}</span>
    </div>
    <div class="editorModerationDetailGrid">
      <div class="editorModerationCell">
        <div class="editorModerationCellLabel">Preset</div>
        <div class="editorModerationCellValue">${ctx.escapeHtml(selected.presetId)} • ${ctx.escapeHtml(selected.geometryType)}</div>
      </div>
      <div class="editorModerationCell">
        <div class="editorModerationCellLabel">Merge</div>
        <div class="editorModerationCellValue">${ctx.escapeHtml(selected.mergeMode)}</div>
      </div>
      <div class="editorModerationCell">
        <div class="editorModerationCellLabel">Base Ref</div>
        <div class="editorModerationCellValue">${ctx.escapeHtml(selected.baseFeatureRef?.displayName || selected.baseFeatureRef?.featureId || 'none')}</div>
      </div>
      <div class="editorModerationCell">
        <div class="editorModerationCellLabel">Validation</div>
        <div class="editorModerationCellValue">${ctx.escapeHtml(summary.validationLine)}</div>
      </div>
    </div>
    ${summary.highlights.length ? `
      <div class="editorHelpSection">
        <strong>Readable Summary</strong>
        ${summary.highlights.map((item) => `<div>${ctx.escapeHtml(item)}</div>`).join('')}
      </div>
    ` : ''}
    ${summary.contributorNote ? `
      <div class="editorHelpSection">
        <strong>Contributor Note</strong>
        <div>${ctx.escapeHtml(summary.contributorNote)}</div>
      </div>
    ` : ''}
    ${selected.moderation?.note ? `
      <div class="editorHelpSection">
        <strong>Latest Moderator Note</strong>
        <div>${ctx.escapeHtml(selected.moderation.note)}</div>
      </div>
    ` : ''}
    ${Array.isArray(selected.validation?.issues) && selected.validation.issues.length ? `
      <div class="editorHelpSection">
        <strong>Validation Notes</strong>
        ${selected.validation.issues.slice(0, 5).map((item) => `<div>${ctx.escapeHtml(item.message)}${item.hint ? ` - ${ctx.escapeHtml(item.hint)}` : ''}</div>`).join('')}
      </div>
    ` : ''}
  `;
}

export function renderUi(ctx) {
  const refs = ctx.getRefs();
  if (!(refs.panel instanceof HTMLElement)) return;
  const feature = ctx.selectedFeature();
  const stage = ctx.workspaceStage(feature);
  const sidebarView = ctx.resolveWorkspaceSidebarView(feature);
  refs.panel.classList.toggle('show', ctx.state.active);
  refs.panel.classList.toggle('editorWorldPeek', ctx.state.peekWorld === true);
  refs.panel.classList.toggle('editorNoSelection', !feature);
  refs.panel.classList.toggle('editorHasSelection', !!feature);
  refs.panel.dataset.tab = ctx.state.tab;
  refs.panel.dataset.stage = stage;
  refs.panel.dataset.sidebarView = sidebarView;
  document.body.classList.toggle('editor-workspace-open', ctx.state.active);
  document.body.classList.toggle('editor-workspace-peek', ctx.state.active && ctx.state.peekWorld === true);
  if (refs.title) refs.title.textContent = 'World Editor Beta';
  if (refs.subline) refs.subline.textContent = 'Create reviewed overlays or switch to persistent Blocks. Neither workflow changes OpenStreetMap, Overture, or imported provider data.';
  if (refs.authBadge) {
    refs.authBadge.textContent = ctx.state.authUser?.uid
      ? `${ctx.sanitizeText(ctx.state.authUser.displayName || ctx.state.authUser.email || 'Explorer', 60)}${ctx.state.userIsAdmin ? ' • Admin' : ''}`
      : 'Local drafts available • Sign in to sync cloud drafts • Not an OSM editor';
  }
  if (refs.viewModeBtn) refs.viewModeBtn.textContent = ctx.state.viewMode === '2d' ? '3D View' : '2D Plan';
  if (refs.status) {
    refs.status.textContent = ctx.state.status.text;
    refs.status.dataset.tone = ctx.state.status.tone;
    refs.status.hidden = ctx.state.status.tone === 'info'
      && (
        ctx.state.status.text === 'Overlay editor is ready.'
        || ctx.state.status.text === 'Editor panels restored.'
        || ctx.state.status.text.startsWith('Centered on ')
      );
  }
  if (refs.peekBtn) refs.peekBtn.textContent = ctx.state.peekWorld ? 'Restore Panels' : 'Peek World';
  renderPresetList(ctx, refs);
  const preset = getOverlayPreset(feature?.presetId || ctx.state.activePresetId);
  renderWorkspaceSidebar(ctx, refs, feature);
  renderWorkspaceFeatureList(ctx, refs);
  renderSelectedPresetCard(ctx, refs, feature);
  renderGuidedFieldPanel(ctx, refs, feature);
  renderAdvancedFieldPanel(ctx, refs, feature);
  renderValidation(ctx, refs, feature);
  renderOwnFeatures(ctx, refs);
  renderModeration(ctx, refs);
  renderAdvancedMapping(ctx, refs, feature);
  renderHelpDrawer(ctx, refs, feature);

  if (refs.viewportHint) {
    refs.viewportHint.hidden = true;
    refs.viewportHint.textContent = '';
  }
  if (refs.viewportMeta) {
    refs.viewportMeta.innerHTML = '';
  }

  if (refs.selectedFeatureTitle) refs.selectedFeatureTitle.textContent = feature ? ctx.overlayFeatureLabel(feature) : 'No Overlay Selected';
  if (refs.selectedFeatureMeta) {
    refs.selectedFeatureMeta.textContent = feature
      ? readableFeatureDescription(feature)
      : ctx.state.selectedBaseFeature
        ? `Base feature: ${ctx.state.selectedBaseFeature.displayName}`
        : 'Select a base world feature or draw a new overlay.';
  }
  if (refs.geometryTypeValue) refs.geometryTypeValue.textContent = feature?.geometryType || ctx.state.selectedBaseFeature?.geometryType || preset.geometryType || 'n/a';
  if (refs.reviewStateBadge) refs.reviewStateBadge.textContent = feature ? (feature.storageMode === 'local' ? 'local draft' : feature.reviewState) : 'unsaved';
  if (refs.inspectorPanel) refs.inspectorPanel.hidden = !feature;
  if (refs.baseSelection) {
    refs.baseSelection.innerHTML = ctx.state.selectedBaseFeature
      ? `<strong>${ctx.escapeHtml(ctx.state.selectedBaseFeature.displayName)}</strong><div>${ctx.escapeHtml(ctx.state.selectedBaseFeature.featureType)} • ${ctx.escapeHtml(ctx.state.selectedBaseFeature.geometryType)}</div>`
      : '<div class="editorEmptyState">Nothing selected yet. Click a building, road, or place in the world if you want to patch existing data.</div>';
  }

  updateFieldValue(refs.heightInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'height') || '');
  updateFieldValue(refs.levelsInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'building_levels') || '');
  updateFieldValue(refs.minHeightInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'min_height') || 0);
  updateFieldValue(refs.roofShapeSelect, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'roof_shape') || 'flat');
  updateFieldValue(refs.layerInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'layer') || 0);
  updateFieldValue(refs.bridgeCheckbox, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'bridge') === true);
  updateFieldValue(refs.tunnelCheckbox, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'tunnel') === true);
  updateFieldValue(refs.surfaceInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'surface') || '');
  updateFieldValue(refs.levelRefInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'level') || '');
  updateFieldValue(refs.buildingRefInput, readOverlayFieldValue(feature || presetSampleFeature(preset.id), 'building_ref') || '');
  if (refs.advancedToggle) refs.advancedToggle.checked = ctx.state.advancedMode === true;
  if (refs.advancedPanel) refs.advancedPanel.hidden = ctx.state.advancedMode !== true;

  renderTagList(ctx, refs, feature);

  if (refs.entrancesList) {
    refs.entrancesList.innerHTML = feature?.threeD?.entrances?.length
      ? feature.threeD.entrances.map((entry, index) => `
          <button type="button" class="editorListRow" data-editor-entrance-index="${index}">
            <span>${ctx.escapeHtml(ctx.sanitizeText(entry.label || `Entrance ${index + 1}`, 80))}</span>
            <span>${ctx.escapeHtml(ctx.sanitizeText(entry.kind || 'entrance', 40))}</span>
          </button>
        `).join('')
      : '<div class="editorEmptyState">No entrance anchors added yet.</div>';
  }

  refs.workspacePane?.classList.toggle('active', ctx.state.tab === 'workspace');
  refs.minePane?.classList.toggle('active', ctx.state.tab === 'mine');
  refs.moderationPane?.classList.toggle('active', ctx.state.tab === 'moderation' && ctx.state.userIsAdmin);
  refs.workspaceTabBtn?.classList.toggle('active', ctx.state.tab === 'workspace');
  refs.mineTabBtn?.classList.toggle('active', ctx.state.tab === 'mine');
  refs.moderationTabBtn?.classList.toggle('active', ctx.state.tab === 'moderation');
  if (refs.moderationTabBtn) refs.moderationTabBtn.hidden = !ctx.state.userIsAdmin;

  if (refs.previewDrawer) {
    refs.previewDrawer.classList.toggle('show', ctx.state.previewOpen);
    if (refs.previewSummary) {
      refs.previewSummary.textContent = feature
        ? buildSubmissionSummary(feature).description
        : 'Select a feature to preview submission details.';
    }
    if (refs.previewHighlights) {
      const summary = feature ? buildSubmissionSummary(feature) : null;
      refs.previewHighlights.innerHTML = summary?.highlights?.length
        ? summary.highlights.map((entry) => `<div class="editorPreviewChip">${ctx.escapeHtml(entry)}</div>`).join('')
        : '';
    }
    if (refs.previewValidation) {
      refs.previewValidation.innerHTML = feature?.validation?.issues?.length
        ? feature.validation.issues.map((entry) => {
            const guidance = buildValidationIssueGuidance(entry);
            return `<div class="editorIssue ${ctx.escapeHtml(guidance.severity)}">${ctx.escapeHtml(guidance.message)}${guidance.hint ? `<div class="editorIssueHint">${ctx.escapeHtml(guidance.hint)}</div>` : ''}</div>`;
          }).join('')
        : '<div class="editorIssue ok">Validation is clean enough to submit.</div>';
    }
    if (refs.previewChecklist) {
      const summary = feature ? buildSubmissionSummary(feature) : null;
      const noteHtml = ctx.state.previewNote ? `<div class="editorPreviewChip">${ctx.escapeHtml(ctx.state.previewNote)}</div>` : '';
      const checklistHtml = summary?.reviewerChecklist?.length
        ? summary.reviewerChecklist.map((entry) => `<div class="editorPreviewChip">${ctx.escapeHtml(entry)}</div>`).join('')
        : '';
      refs.previewChecklist.innerHTML = noteHtml + checklistHtml;
    }
    updateFieldValue(refs.submissionNoteInput, ctx.state.previewNote);
  }

  if (refs.toolbar instanceof HTMLElement) {
    refs.toolbar.querySelectorAll('[data-editor-tool]').forEach((button) => {
      const active = button.getAttribute('data-editor-tool') === ctx.state.tool;
      button.classList.toggle('active', active);
    });
    const addVertexButton = refs.toolbar.querySelector('[data-editor-tool="add_vertex"]');
    const deleteVertexButton = refs.toolbar.querySelector('[data-editor-tool="delete_vertex"]');
    const splitLineButton = refs.toolbar.querySelector('[data-editor-tool="split_line"]');
    const mergeButton = refs.toolbar.querySelector('[data-editor-action="merge"]');
    const validateButton = refs.toolbar.querySelector('[data-editor-action="validate"]');
    const previewButton = refs.toolbar.querySelector('[data-editor-action="preview"]');
    if (addVertexButton instanceof HTMLElement) addVertexButton.hidden = !feature;
    if (deleteVertexButton instanceof HTMLElement) deleteVertexButton.hidden = !feature;
    if (splitLineButton instanceof HTMLElement) splitLineButton.hidden = !feature || feature.geometryType !== 'LineString';
    if (mergeButton instanceof HTMLElement) mergeButton.hidden = ctx.state.workspaceFeatures.length < 2;
    if (validateButton instanceof HTMLElement) validateButton.hidden = !feature;
    if (previewButton instanceof HTMLElement) previewButton.hidden = !feature;
  }
}
