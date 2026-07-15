import {
  buildActivitySummary,
  defaultAnchorTypeForTemplate,
  getActivityAnchorType,
  listAnchorTypesForTemplate,
  sanitizeText
} from './schema.js?v=2';
import { saveCreatorActivityDraft } from '../activity-discovery/library.js?v=2';
import { getCurrentCreatorIdentity, syncOwnCreatorActivityStats } from '../../../js/creator-profile-api.js?v=1';

function createActivityEditorSessionUiEventsApi(context) {
  const { restartCreatorGuide } = context;

  function handlePanelClick(ctx, event) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    if (target.closest('#activityCreatorCloseBtn')) return void ctx.closeActivityCreator();
    if (target.closest('#activityCreatorStopTestBtn')) return void ctx.stopTestMode();
    if (target.closest('#activityCreatorResetBtn')) return void ctx.resetDraft();
    if (target.closest('#activityCreatorSaveBtn')) return void saveCurrentActivity(ctx);
    if (target.closest('#activityCreatorGuideBtn')) {
      ctx.state.guideOpen = true;
      ctx.renderUi();
      return;
    }
    if (target.closest('#activityCreatorGuideDismissBtn')) {
      ctx.state.guideOpen = false;
      ctx.renderUi();
      return;
    }
    if (target.closest('#activityCreatorGuideRestartBtn')) return void restartCreatorGuide(ctx);
    if (target.closest('#activityCreatorGuideActionBtn')) return void handleCreatorGuideAction(ctx);
    if (target.closest('#activityCreatorViewModeBtn')) {
      ctx.applyCreatorViewMode(ctx.state.viewMode === '2d' ? '3d' : '2d');
      return;
    }

    const toolBtn = target.closest('[data-activity-tool]');
    if (toolBtn) {
      ctx.state.tool = sanitizeText(toolBtn.dataset.activityTool || 'place', 24).toLowerCase();
      ctx.renderUi();
      ctx.refreshScenePreview();
      return;
    }

    const actionBtn = target.closest('[data-activity-action]');
    if (actionBtn) {
      const action = sanitizeText(actionBtn.dataset.activityAction || '', 32).toLowerCase();
      if (action === 'undo') {
        const snapshot = ctx.state.history.undo(ctx.currentActivitySnapshot());
        if (snapshot) ctx.applyHistorySnapshot(snapshot);
      } else if (action === 'redo') {
        const snapshot = ctx.state.history.redo(ctx.currentActivitySnapshot());
        if (snapshot) ctx.applyHistorySnapshot(snapshot);
      } else if (action === 'test') {
        ctx.startTestMode();
      } else if (action === 'delete') {
        ctx.deleteSelectedAnchor();
      }
      return;
    }

    const anchorTypeBtn = target.closest('[data-activity-anchor-type]');
    if (anchorTypeBtn) {
      ctx.state.anchorTypeId = sanitizeText(anchorTypeBtn.dataset.activityAnchorType || 'start', 80).toLowerCase();
      ctx.state.tool = 'place';
      ctx.renderUi();
      ctx.refreshScenePreview();
      return;
    }

    const reorderBtn = target.closest('[data-activity-reorder]');
    if (reorderBtn) {
      ctx.moveCheckpoint(
        sanitizeText(reorderBtn.dataset.activityAnchorId || '', 80).toLowerCase(),
        sanitizeText(reorderBtn.dataset.activityReorder || '', 8).toLowerCase()
      );
      return;
    }

    const anchorRow = target.closest('[data-activity-anchor-id]');
    if (anchorRow) ctx.setAnchorSelection(anchorRow.dataset.activityAnchorId || '');
  }

  function handlePanelInput(ctx, event) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    if (target.id === 'activityCreatorTemplateSelect') {
      const previousTemplate = ctx.selectedTemplate();
      ctx.state.templateId = sanitizeText(target.value || ctx.state.templateId, 80).toLowerCase();
      if (!listAnchorTypesForTemplate(ctx.state.templateId).some((entry) => entry.id === ctx.state.anchorTypeId)) {
        ctx.state.anchorTypeId = defaultAnchorTypeForTemplate(ctx.state.templateId).id;
      }
      const previousTitle = sanitizeText(ctx.state.draftTitle || '', 120);
      if (!previousTitle || previousTitle === sanitizeText(previousTemplate.label || '', 120)) {
        ctx.state.draftTitle = ctx.defaultDraftTitleForTemplate();
      }
      if (!ctx.state.guide.started) ctx.markCreatorGuideProgress({ started: true });
      ctx.revalidateAnchors();
      ctx.pushHistory();
      ctx.ensureDraftMetadata();
      ctx.renderUi();
      ctx.refreshScenePreview();
      ctx.setStatus(`${ctx.selectedTemplate().label} template active.`, 'ok');
      return;
    }
    if (target.id === 'activityCreatorSnapToggle') {
      ctx.state.snapEnabled = target.checked !== false;
      ctx.renderUi();
      return;
    }
    if (target.id === 'activityCreatorPlacementOffset') {
      ctx.state.placementHeightOffset = ctx.finiteNumber(target.value, 0);
      ctx.renderUi();
      return;
    }
    if (target.id === 'activityCreatorTitleInput') {
      ctx.state.draftTitle = sanitizeText(target.value || '', 120);
      ctx.renderUi();
      return;
    }
    if (target.id === 'activityCreatorDescriptionInput') {
      ctx.state.draftDescription = sanitizeText(target.value || '', 220);
      ctx.renderUi();
      return;
    }
    if (target.id === 'activityCreatorAudienceSelect') {
      const next = sanitizeText(target.value || 'library', 24).toLowerCase();
      ctx.state.audience = next === 'room' ? 'room' : 'library';
      ctx.renderUi();
      return;
    }

    const fieldTarget = target.closest('[data-activity-field]');
    if (!fieldTarget) return;
    const field = sanitizeText(fieldTarget.dataset.activityField || '', 40).toLowerCase();
    const anchor = ctx.selectedAnchor();
    if (!anchor) return;
    ctx.updateAnchor(anchor.id, (entry) => {
      if (field === 'label') entry.label = sanitizeText(target.value || '', 80) || getActivityAnchorType(entry.typeId).label;
      else if (field === 'type_id') {
        entry.typeId = sanitizeText(target.value || entry.typeId, 80).toLowerCase();
        const anchorType = getActivityAnchorType(entry.typeId);
        if ((entry.typeId === 'fishing_zone' || entry.typeId === 'boost_ring' || entry.typeId === 'buoy_gate') && !(entry.radius > 0)) {
          entry.radius = anchorType.defaultRadius || 18;
        }
        if (entry.typeId === 'trigger_zone' || entry.typeId === 'hazard_zone') {
          entry.sizeX = anchorType.defaultSize?.x || entry.sizeX || 12;
          entry.sizeY = anchorType.defaultSize?.y || entry.sizeY || 6;
          entry.sizeZ = anchorType.defaultSize?.z || entry.sizeZ || 12;
        }
      } else if (field === 'yaw') entry.yaw = ctx.finiteNumber(target.value, 0);
      else if (field === 'height_offset') {
        entry.heightOffset = ctx.finiteNumber(target.value, 0);
        entry.y = entry.baseY + entry.heightOffset;
      } else if (field === 'radius') entry.radius = Math.max(4, ctx.finiteNumber(target.value, 18));
      else if (field === 'size_x') entry.sizeX = Math.max(1.2, ctx.finiteNumber(target.value, 12));
      else if (field === 'size_y') entry.sizeY = Math.max(1, ctx.finiteNumber(target.value, 6));
      else if (field === 'size_z') entry.sizeZ = Math.max(1.2, ctx.finiteNumber(target.value, 12));
    });
    if (event.type === 'change') ctx.pushHistory();
  }

  async function saveCurrentActivity(ctx) {
    const activity = ctx.buildActivityPayload();
    if (!activity) return;
    const identity = getCurrentCreatorIdentity();
    const audience = ctx.state.audience === 'room' ? 'room' : 'library';
    const roomCode = audience === 'room' ? sanitizeText(ctx.state.roomCode || ctx.currentRoomCode?.() || '', 24).toUpperCase() : '';
    ctx.setStatus('Saving activity...', 'working');
    try {
      const saved = await saveCreatorActivityDraft({
        activity,
        audience,
        roomCode,
        contributorId: identity.id,
        contributorName: identity.name
      });
      ctx.state.savedActivityId = saved.id;
      ctx.state.savedAtMs = Date.now();
      ctx.state.lastSavedSummary = buildActivitySummary(saved.activity || activity);
      syncOwnCreatorActivityStats({ incrementDrafts: 1 }).catch(() => {});
      ctx.setStatus(audience === 'room' ? 'Room activity draft saved.' : 'Activity draft saved.', 'ok');
      ctx.renderUi();
    } catch (error) {
      console.error('[ActivityCreator] save failed', error);
      ctx.setStatus(error?.message || 'Could not save activity.', 'error');
    }
  }

  async function handleCreatorGuideAction(ctx) {
    const step = creatorGuideConfig(ctx)[ctx.state.guide.step] || null;
    if (!step) return;
    if (step.id === 'template') {
      if (!ctx.state.templateId) return ctx.setStatus('Pick a template first.', 'warning');
      ctx.markCreatorGuideProgress({ step: 1, started: true });
      ctx.renderUi();
      return;
    }
    if (step.id === 'anchor') {
      if (!ctx.state.anchors.length) return ctx.setStatus('Place at least one anchor.', 'warning');
      ctx.markCreatorGuideProgress({ step: 2 });
      ctx.renderUi();
      return;
    }
    if (step.id === 'test') {
      if (!ctx.state.anchors.length) return ctx.setStatus('Add anchors before testing.', 'warning');
      ctx.startTestMode();
      ctx.markCreatorGuideProgress({ step: 3 });
      return;
    }
    if (step.id === 'save') {
      await saveCurrentActivity(ctx);
      ctx.markCreatorGuideProgress({ completed: true, step: creatorGuideConfig(ctx).length - 1 });
      ctx.renderUi();
    }
  }

  function bindRefEvents(ctx) {
    if (ctx.state.refsBound) return;
    const refs = ctx.getRefs();
    refs.panel?.addEventListener('click', (event) => handlePanelClick(ctx, event));
    refs.panel?.addEventListener('input', (event) => handlePanelInput(ctx, event));
    refs.panel?.addEventListener('change', (event) => handlePanelInput(ctx, event));
    ctx.state.refsBound = true;
  }

  return {
    bindRefEvents,
    handleCreatorGuideAction,
    saveCurrentActivity
  };
}

export { createActivityEditorSessionUiEventsApi };
