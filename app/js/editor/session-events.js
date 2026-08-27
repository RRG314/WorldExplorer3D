import { createOverlayDraftFromBaseFeature } from './base-features.js?v=1';
import { applyOverlayFieldValue } from './field-registry.js?v=1';
import { getOverlayPreset } from './preset-registry.js?v=1';
import { normalizeOverlayFeature, overlayFeatureLabel } from './schema.js?v=1';
import { moderateOverlayDraft } from './store.js?v=1';

function updateSelectedFeature(ctx, mutator) {
  const index = ctx.state.workspaceFeatures.findIndex((feature) => feature.featureId === ctx.state.selectedFeatureId);
  if (index < 0) return;
  const next = normalizeOverlayFeature(ctx.cloneJson(ctx.state.workspaceFeatures[index]));
  mutator(next);
  ctx.updateFeatureAtIndex(index, next);
  ctx.selectedFeatureValidation();
  ctx.refreshWorkspacePreview();
  ctx.renderUi();
}

function bindSchemaFieldPanel(ctx, panel) {
  panel?.addEventListener('change', (event) => {
    const input = event.target instanceof HTMLElement ? event.target.closest('[data-editor-guided-field]') : null;
    if (!(input instanceof HTMLElement)) return;
    const fieldId = ctx.sanitizeText(input.dataset.editorGuidedField || '', 80).toLowerCase();
    if (!fieldId) return;
    const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value;
    updateSelectedFeature(ctx, (feature) => {
      applyOverlayFieldValue(feature, fieldId, value);
    });
  });
  panel?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-help-field]') : null;
    if (!(button instanceof HTMLElement)) return;
    const fieldId = ctx.sanitizeText(button.dataset.editorHelpField || '', 80).toLowerCase();
    if (!fieldId) return;
    ctx.openHelpDrawer('field', { fieldId });
  });
}

export function bindRefEvents(ctx) {
  if (ctx.state.refsBound) return;
  const refs = ctx.getRefs();
  refs.helpBtn?.addEventListener('click', () => ctx.openHelpDrawer());
  refs.viewModeBtn?.addEventListener('click', () => ctx.applyEditorViewMode(ctx.state.viewMode === '2d' ? '3d' : '2d'));
  refs.helpCloseBtn?.addEventListener('click', () => ctx.closeHelpDrawer());
  refs.peekBtn?.addEventListener('click', () => {
    ctx.state.peekWorld = ctx.state.peekWorld !== true;
    if (ctx.state.peekWorld) {
      ctx.state.helpOpen = false;
      ctx.state.helpContext = null;
      ctx.state.previewOpen = false;
      ctx.setStatus('Peek mode enabled. Side panels are hidden so you can inspect the live world while editing.', 'info');
      return;
    }
    ctx.setStatus('Editor panels restored.', 'info');
  });
  refs.closeBtn?.addEventListener('click', () => ctx.closeEditorSession());
  refs.workspaceTabBtn?.addEventListener('click', () => {
    ctx.state.tab = 'workspace';
    ctx.renderUi();
  });
  refs.sidebarStartBtn?.addEventListener('click', () => ctx.setWorkspaceSidebarView('start'));
  refs.sidebarPresetsBtn?.addEventListener('click', () => ctx.setWorkspaceSidebarView('presets'));
  refs.sidebarSelectionBtn?.addEventListener('click', () => {
    if (ctx.state.workspaceFeatures.length > 0) ctx.setWorkspaceSidebarView('selection');
  });
  refs.mineTabBtn?.addEventListener('click', () => {
    ctx.state.tab = 'mine';
    ctx.renderUi();
  });
  refs.blocksTabBtn?.addEventListener('click', async () => {
    ctx.closeEditorSession();
    try {
      const opened = await ctx.appCtx.openBlockBuilder?.();
      if (!opened) {
        ctx.openEditorSession({ initialTab: 'workspace', skipTutorial: true });
        ctx.setStatus('Persistent block building is unavailable in this world mode.', 'warning');
      }
    } catch (error) {
      ctx.openEditorSession({ initialTab: 'workspace', skipTutorial: true });
      ctx.setStatus(error?.message || 'Could not open persistent block building.', 'error');
    }
  });
  refs.moderationTabBtn?.addEventListener('click', () => {
    if (ctx.state.userIsAdmin) {
      ctx.state.tab = 'moderation';
      ctx.renderUi();
    }
  });
  refs.toolbar?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-tool],[data-editor-action]') : null;
    if (!(button instanceof HTMLElement)) return;
    const tool = ctx.sanitizeText(button.dataset.editorTool || '', 40);
    if (tool) {
      ctx.setTool(tool);
      return;
    }
    const action = ctx.sanitizeText(button.dataset.editorAction || '', 40);
    if (action === 'undo') {
      const snapshot = ctx.state.history.undo(ctx.editorSnapshot());
      if (snapshot) ctx.applyHistorySnapshot(snapshot);
    } else if (action === 'redo') {
      const snapshot = ctx.state.history.redo(ctx.editorSnapshot());
      if (snapshot) ctx.applyHistorySnapshot(snapshot);
    } else if (action === 'validate') {
      const result = ctx.selectedFeatureValidation();
      ctx.setStatus(result.valid ? 'Selected overlay feature validated.' : 'Validation found issues on the selected feature.', result.valid ? 'ok' : 'warning');
      ctx.renderUi();
    } else if (action === 'preview') {
      ctx.openPreviewDrawer();
    } else if (action === 'merge') {
      ctx.mergeSelectedFeatures();
    }
  });

  refs.presetSearchInput?.addEventListener('input', () => {
    ctx.state.presetQuery = ctx.sanitizeText(refs.presetSearchInput.value, 80);
    ctx.renderUi();
  });
  refs.presetList?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-preset]') : null;
    if (!(button instanceof HTMLElement)) return;
    ctx.setToolForPreset(button.dataset.editorPreset);
  });
  refs.presetSummary?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-help-topic],[data-editor-related-preset]') : null;
    if (!(button instanceof HTMLElement)) return;
    const relatedPreset = ctx.sanitizeText(button.dataset.editorRelatedPreset || '', 80).toLowerCase();
    if (relatedPreset) {
      ctx.setActivePreset(relatedPreset);
      return;
    }
    const helpTopic = ctx.sanitizeText(button.dataset.editorHelpTopic || '', 80).toLowerCase();
    if (helpTopic) ctx.openHelpDrawer(helpTopic);
  });
  refs.onboardingCard?.addEventListener('click', (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-editor-sidebar-view],[data-editor-start-draw],[data-editor-help-topic]') : null;
    if (!(target instanceof HTMLElement)) return;
    const sidebarView = ctx.sanitizeText(target.dataset.editorSidebarView || '', 24).toLowerCase();
    if (sidebarView) {
      ctx.setWorkspaceSidebarView(sidebarView);
      return;
    }
    if (target.dataset.editorStartDraw === '1') {
      ctx.setToolForPreset(ctx.state.activePresetId);
      ctx.setStatus(`Click in the world to draw a ${getOverlayPreset(ctx.state.activePresetId).label.toLowerCase()}.`, 'info');
      return;
    }
    const helpTopic = ctx.sanitizeText(target.dataset.editorHelpTopic || '', 80).toLowerCase();
    if (helpTopic) ctx.openHelpDrawer(helpTopic);
  });
  refs.workspaceFeatureList?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-workspace-id]') : null;
    if (!(button instanceof HTMLElement)) return;
    ctx.setSelectedFeature(button.dataset.editorWorkspaceId);
  });
  refs.cloneBaseBtn?.addEventListener('click', () => {
    if (!ctx.state.selectedBaseFeature) {
      ctx.setStatus('Select a base feature in the world first.', 'warning');
      return;
    }
    const draft = createOverlayDraftFromBaseFeature(ctx.state.selectedBaseFeature);
    ctx.addWorkspaceFeature(draft);
    ctx.state.selectedBaseFeature = null;
    ctx.pushHistory();
    ctx.setStatus('Base feature cloned into overlay workspace.', 'ok');
  });
  refs.centerFeatureBtn?.addEventListener('click', () => ctx.focusFeatureInWorld());
  refs.deleteFeatureBtn?.addEventListener('click', () => {
    ctx.deleteSelectedFeature();
  });
  refs.advancedToggle?.addEventListener('change', () => {
    ctx.state.advancedMode = refs.advancedToggle.checked;
    if (ctx.state.advancedMode) {
      ctx.openHelpDrawer('power_user');
      return;
    }
    ctx.renderUi();
  });
  bindSchemaFieldPanel(ctx, refs.guidedFieldPanel);
  bindSchemaFieldPanel(ctx, refs.advancedFieldPanel);
  refs.validationIssues?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-validation-help]') : null;
    if (!(button instanceof HTMLElement)) return;
    const code = ctx.sanitizeText(button.dataset.editorValidationHelp || '', 80);
    const issue = ctx.selectedFeature()?.validation?.issues?.find((entry) => entry.code === code) || null;
    if (issue) ctx.openHelpDrawer('validation_issue', { issue });
  });
  refs.helpTopicList?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-help-topic]') : null;
    if (!(button instanceof HTMLElement)) return;
    const topicId = ctx.sanitizeText(button.dataset.editorHelpTopic || '', 80).toLowerCase();
    if (!topicId) return;
    if (topicId === 'validation_issue' && ctx.state.helpContext?.issue) {
      ctx.openHelpDrawer(topicId, { issue: ctx.state.helpContext.issue });
      return;
    }
    if (topicId === 'field' && ctx.state.helpContext?.fieldId) {
      ctx.openHelpDrawer(topicId, { fieldId: ctx.state.helpContext.fieldId });
      return;
    }
    ctx.openHelpDrawer(topicId);
  });
  refs.tagList?.addEventListener('input', (event) => {
    const input = event.target instanceof HTMLElement ? event.target.closest('[data-editor-tag]') : null;
    if (!(input instanceof HTMLInputElement)) return;
    const key = ctx.sanitizeText(input.dataset.editorTag || '', 64).toLowerCase();
    if (!key) return;
    updateSelectedFeature(ctx, (feature) => {
      if (!feature.tags) feature.tags = {};
      feature.tags[key] = ctx.sanitizeText(input.value, 180);
    });
  });
  refs.addTagBtn?.addEventListener('click', () => {
    const key = ctx.sanitizeText(refs.newTagKeyInput?.value || '', 64).toLowerCase();
    const value = ctx.sanitizeText(refs.newTagValueInput?.value || '', 180);
    if (!key || !value) {
      ctx.setStatus('Provide both a tag key and value.', 'warning');
      return;
    }
    updateSelectedFeature(ctx, (feature) => {
      if (!feature.tags) feature.tags = {};
      feature.tags[key] = value;
    });
    if (refs.newTagKeyInput) refs.newTagKeyInput.value = '';
    if (refs.newTagValueInput) refs.newTagValueInput.value = '';
  });
  refs.heightInput?.addEventListener('input', () => {
    updateSelectedFeature(ctx, (feature) => {
      applyOverlayFieldValue(feature, 'height', refs.heightInput.value);
    });
  });
  refs.levelsInput?.addEventListener('input', () => {
    updateSelectedFeature(ctx, (feature) => {
      applyOverlayFieldValue(feature, 'building_levels', refs.levelsInput.value);
    });
  });
  refs.minHeightInput?.addEventListener('input', () => {
    updateSelectedFeature(ctx, (feature) => {
      applyOverlayFieldValue(feature, 'min_height', refs.minHeightInput.value);
    });
  });
  refs.roofShapeSelect?.addEventListener('change', () => {
    updateSelectedFeature(ctx, (feature) => {
      applyOverlayFieldValue(feature, 'roof_shape', refs.roofShapeSelect.value);
    });
  });
  refs.layerInput?.addEventListener('input', () => {
    updateSelectedFeature(ctx, (feature) => {
      applyOverlayFieldValue(feature, 'layer', refs.layerInput.value);
    });
  });
  refs.bridgeCheckbox?.addEventListener('change', () => {
    updateSelectedFeature(ctx, (feature) => {
      applyOverlayFieldValue(feature, 'bridge', refs.bridgeCheckbox.checked);
    });
  });
  refs.tunnelCheckbox?.addEventListener('change', () => {
    updateSelectedFeature(ctx, (feature) => {
      applyOverlayFieldValue(feature, 'tunnel', refs.tunnelCheckbox.checked);
    });
  });
  refs.surfaceInput?.addEventListener('input', () => {
    updateSelectedFeature(ctx, (feature) => {
      applyOverlayFieldValue(feature, 'surface', refs.surfaceInput.value);
    });
  });
  refs.levelRefInput?.addEventListener('input', () => {
    updateSelectedFeature(ctx, (feature) => {
      applyOverlayFieldValue(feature, 'level', refs.levelRefInput.value);
    });
  });
  refs.buildingRefInput?.addEventListener('input', () => {
    updateSelectedFeature(ctx, (feature) => {
      applyOverlayFieldValue(feature, 'building_ref', refs.buildingRefInput.value);
    });
  });
  refs.addEntranceBtn?.addEventListener('click', () => ctx.addEntranceAtCurrentPoint());
  refs.entrancesList?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-entrance-index]') : null;
    if (!(button instanceof HTMLElement)) return;
    const index = Number(button.dataset.editorEntranceIndex);
    if (!Number.isFinite(index)) return;
    updateSelectedFeature(ctx, (feature) => {
      feature.threeD.entrances.splice(index, 1);
    });
    ctx.pushHistory();
    ctx.setStatus('Entrance removed from building overlay.', 'ok');
  });
  refs.previewBtn?.addEventListener('click', () => ctx.openPreviewDrawer());
  refs.saveDraftBtn?.addEventListener('click', () => {
    ctx.saveSelectedFeature();
  });
  refs.submitBtn?.addEventListener('click', () => {
    ctx.submitSelectedFeatureForReview();
  });
  refs.submissionNoteInput?.addEventListener('input', () => {
    ctx.state.previewNote = ctx.sanitizeText(refs.submissionNoteInput.value, 320);
    updateSelectedFeature(ctx, (feature) => {
      ctx.applySubmissionMetadata(feature);
    });
  });
  refs.ownFeatureList?.addEventListener('click', async (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-own-action]') : null;
    if (!(button instanceof HTMLElement)) return;
    const action = ctx.sanitizeText(button.dataset.editorOwnAction || '', 24);
    const featureId = ctx.sanitizeText(button.dataset.editorOwnId || '', 180);
    const feature = ctx.state.ownFeatures.find((entry) => entry.featureId === featureId);
    if (!feature) return;
    if (action === 'load') {
      ctx.resetWorkspace();
      ctx.addWorkspaceFeature(feature);
      ctx.pushHistory();
      ctx.state.tab = 'workspace';
      ctx.renderUi();
      ctx.setStatus('Saved overlay draft loaded into the workspace.', 'ok');
    } else if (action === 'focus') {
      ctx.focusFeatureInWorld(feature);
    } else if (action === 'submit') {
      ctx.resetWorkspace();
      ctx.addWorkspaceFeature(feature);
      await ctx.submitSelectedFeatureForReview();
    } else if (action === 'delete') {
      ctx.resetWorkspace();
      ctx.addWorkspaceFeature(feature);
      await ctx.deleteSelectedFeature();
    }
  });
  refs.moderationList?.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-editor-moderation-id]') : null;
    if (!(button instanceof HTMLElement)) return;
    ctx.state.selectedFeatureId = ctx.sanitizeText(button.dataset.editorModerationId || '', 180);
    ctx.renderUi();
  });
  refs.moderationApproveBtn?.addEventListener('click', async () => {
    const feature = ctx.selectedModerationFeature();
    if (!feature) return;
    try {
      await moderateOverlayDraft(feature.featureId, 'approve', ctx.sanitizeText(refs.moderationNoteInput?.value || '', 320));
      ctx.setStatus(`Approved and published ${overlayFeatureLabel(feature)}.`, 'ok');
    } catch (error) {
      ctx.setStatus(error?.message || 'Could not approve this overlay feature.', 'error');
    }
  });
  refs.moderationNeedsBtn?.addEventListener('click', async () => {
    const feature = ctx.selectedModerationFeature();
    if (!feature) return;
    try {
      await moderateOverlayDraft(feature.featureId, 'needs_changes', ctx.sanitizeText(refs.moderationNoteInput?.value || '', 320));
      ctx.setStatus(`Returned ${overlayFeatureLabel(feature)} for changes.`, 'ok');
    } catch (error) {
      ctx.setStatus(error?.message || 'Could not return this overlay feature.', 'error');
    }
  });
  refs.moderationRejectBtn?.addEventListener('click', async () => {
    const feature = ctx.selectedModerationFeature();
    if (!feature) return;
    try {
      await moderateOverlayDraft(feature.featureId, 'reject', ctx.sanitizeText(refs.moderationNoteInput?.value || '', 320));
      ctx.setStatus(`Rejected ${overlayFeatureLabel(feature)}.`, 'ok');
    } catch (error) {
      ctx.setStatus(error?.message || 'Could not reject this overlay feature.', 'error');
    }
  });
  refs.tutorialStartBtn?.addEventListener('click', () => {
    refs.tutorial?.classList.remove('show');
  });
  refs.tutorialCancelBtn?.addEventListener('click', () => {
    refs.tutorial?.classList.remove('show');
    ctx.closeEditorSession();
  });
  document.getElementById('mainMenuBtn')?.addEventListener('click', () => ctx.closeEditorSession());
  ctx.state.refsBound = true;
}
