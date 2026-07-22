import {
  buildActivitySummary,
  buildTemplateChecklist,
  defaultAnchorTypeForTemplate,
  getActivityAnchorType,
  listActivityTemplateGroups,
  listAnchorTypesForTemplate,
  sanitizeText
} from './schema.js?v=3';
import { listStoredActivities, saveCreatorActivityDraft } from '../activity-discovery/library.js?v=4';
import { getCurrentCreatorIdentity, syncOwnCreatorActivityStats } from '../../../js/creator-profile-api.js?v=1';

function inspectorHtml(ctx, anchor) {
  if (!anchor) {
    return `
      <div class="activityCreatorEmptyState">
        Select an anchor in the world or from the anchor list to inspect it, move it, and adjust its properties.
      </div>
    `;
  }
  const allowedAnchorTypes = listAnchorTypesForTemplate(ctx.state.templateId);
  const anchorType = getActivityAnchorType(anchor.typeId);
  const sizeFields = anchor.typeId === 'fishing_zone' || anchor.typeId === 'boost_ring' || anchor.typeId === 'buoy_gate'
    ? `
      <label class="activityCreatorField">
        <span>${ctx.escapeHtml(anchor.typeId === 'fishing_zone' ? 'Zone Radius' : anchor.typeId === 'boost_ring' ? 'Ring Radius' : 'Gate Width')}</span>
        <input data-activity-field="radius" type="number" step="0.5" value="${ctx.escapeHtml(anchor.radius)}">
      </label>
    `
    : anchor.typeId === 'trigger_zone' || anchor.typeId === 'hazard_zone'
      ? `
        <div class="activityCreatorFieldGrid">
          <label class="activityCreatorField">
            <span>Size X</span>
            <input data-activity-field="size_x" type="number" step="0.5" value="${ctx.escapeHtml(anchor.sizeX)}">
          </label>
          <label class="activityCreatorField">
            <span>Size Y</span>
            <input data-activity-field="size_y" type="number" step="0.5" value="${ctx.escapeHtml(anchor.sizeY)}">
          </label>
          <label class="activityCreatorField">
            <span>Size Z</span>
            <input data-activity-field="size_z" type="number" step="0.5" value="${ctx.escapeHtml(anchor.sizeZ)}">
          </label>
        </div>
      `
      : '';
  const checkpointControls = anchor.typeId === 'checkpoint'
    ? `
      <div class="activityCreatorMiniRow">
        <button type="button" data-activity-reorder="up" data-activity-anchor-id="${ctx.escapeHtml(anchor.id)}">Move Earlier</button>
        <button type="button" data-activity-reorder="down" data-activity-anchor-id="${ctx.escapeHtml(anchor.id)}">Move Later</button>
      </div>
    `
    : '';
  return `
    <div class="activityCreatorInspectorTitle">${ctx.escapeHtml(anchor.label)}</div>
    <div class="activityCreatorInspectorMeta">${ctx.escapeHtml(anchorType.description)}</div>
    <div class="activityCreatorFieldStack">
      <label class="activityCreatorField">
        <span>Label</span>
        <input data-activity-field="label" type="text" maxlength="80" value="${ctx.escapeHtml(anchor.label)}">
      </label>
      <label class="activityCreatorField">
        <span>Anchor Type</span>
        <select data-activity-field="type_id">
          ${allowedAnchorTypes.map((entry) => `<option value="${ctx.escapeHtml(entry.id)}"${entry.id === anchor.typeId ? ' selected' : ''}>${ctx.escapeHtml(entry.label)}</option>`).join('')}
        </select>
      </label>
      <div class="activityCreatorFieldGrid">
        <label class="activityCreatorField">
          <span>Yaw</span>
          <input data-activity-field="yaw" type="number" step="0.05" value="${ctx.escapeHtml(anchor.yaw || 0)}">
        </label>
        <label class="activityCreatorField">
          <span>Height Offset</span>
          <input data-activity-field="height_offset" type="number" step="0.25" value="${ctx.escapeHtml(anchor.heightOffset || 0)}">
        </label>
      </div>
      ${sizeFields}
      ${checkpointControls}
    </div>
    <div class="activityCreatorMetaCard ${anchor.valid === false ? 'invalid' : ''}">
      <div><strong>Environment</strong> ${ctx.escapeHtml((anchor.environment || 'unresolved').replace(/_/g, ' '))}</div>
      <div><strong>World</strong> X ${anchor.x.toFixed(1)} • Y ${anchor.y.toFixed(1)} • Z ${anchor.z.toFixed(1)}</div>
      ${anchor.invalidReason ? `<div><strong>Issue</strong> ${ctx.escapeHtml(anchor.invalidReason)}</div>` : ''}
    </div>
    <div class="activityCreatorMiniRow">
      <button type="button" data-activity-action="delete">Delete Anchor</button>
    </div>
  `;
}

function selectCreatorAnchorType(ctx, anchorTypeId = '') {
  const nextId = sanitizeText(anchorTypeId || '', 48).toLowerCase();
  if (!nextId || !listAnchorTypesForTemplate(ctx.state.templateId).some((entry) => entry.id === nextId)) return false;
  ctx.state.anchorTypeId = nextId;
  ctx.state.tool = 'place';
  ctx.renderUi();
  ctx.refreshScenePreview();
  return true;
}

function creatorGuideConfig(ctx) {
  const template = ctx.selectedTemplate();
  const validation = ctx.activityIssues();
  const step = ctx.currentCreatorGuideStep();
  const roomContext = ctx.currentRoomCreationContext();
  const saveTargetLabel = ctx.state.audience === 'room' && roomContext.available
    ? `the current room (${roomContext.room?.code || 'room'})`
    : 'your creator library';
  const anchorType = step.anchorTypeId ? getActivityAnchorType(step.anchorTypeId) : null;
  const requirementCount = Math.max(1, Number(step.min || 1));
  const anchorRequirementCopy = anchorType
    ? {
      title: requirementCount > 1 ? `Add ${step.label}` : `Add ${anchorType.label}`,
      body: `${anchorType.description} Place ${requirementCount > 1 ? `at least ${requirementCount}` : 'one'} ${step.label.toLowerCase()} in the world so players know what to do next.`,
      actionLabel: `Select ${step.label}`
    }
    : null;
  const stepMap = {
    intro: {
      title: `Start with ${template.label}`,
      body: 'Pick a template for the kind of game you want to make. Then place a start point in the world. Saved activities stay in your creator library on this browser so you can inspect and replay what you build.',
      actionLabel: "Let's Build"
    },
    test: {
      title: validation.valid ? 'Test the Activity' : 'Clear the Last Issues',
      body: validation.valid
        ? 'Your anchor setup is valid. Run Test Activity to spawn at the start and play through the route like a player would.'
        : 'Use the validation panel on the left to clear missing anchors or invalid placements. Once the draft is valid, run Test Activity.',
      actionLabel: validation.valid ? 'Start Test' : 'Show Validation'
    },
    save: {
      title: 'Save the Game',
      body: `Give the activity a clear title, then save it to ${saveTargetLabel}. You can inspect it from the Games browser after it saves.`,
      actionLabel: 'Save Activity'
    },
    complete: {
      title: 'Creator Walkthrough Complete',
      body: `This activity is now saved in ${saveTargetLabel}. You can keep refining it, or open the browser to inspect what you just made.`,
      actionLabel: 'Open Saved Activity'
    }
  };
  if (step.id === 'start' && anchorRequirementCopy) {
    return {
      ...step,
      title: 'Place the Start Point',
      body: 'Choose Start Point from the anchor palette, then click in the world where players should begin the activity. Use 2D Plan if you want a top-down layout first.',
      actionLabel: 'Select Start'
    };
  }
  if (step.anchorTypeId && step.id !== 'start' && anchorRequirementCopy) {
    return { ...step, ...anchorRequirementCopy };
  }
  return {
    ...step,
    ...(stepMap[step.id] || stepMap.intro)
  };
}

function renderCreatorGuide(ctx, refs) {
  if (!refs.guideCard || !ctx.state.active) return;
  const config = creatorGuideConfig(ctx);
  refs.guideCard.hidden = ctx.state.guideOpen !== true;
  if (refs.guideProgress) refs.guideProgress.textContent = config.id === 'complete' ? `Complete • ${config.total}/${config.total}` : `Step ${config.index} of ${config.total}`;
  if (refs.guideTitle) refs.guideTitle.textContent = config.title;
  if (refs.guideBody) refs.guideBody.textContent = config.body;
  if (refs.guideActionBtn) {
    refs.guideActionBtn.textContent = config.actionLabel;
    refs.guideActionBtn.disabled = config.id === 'complete' && !ctx.state.guide.lastSavedActivityId;
  }
}

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
    if (field === 'label') {
      entry.label = sanitizeText(target.value || '', 80) || getActivityAnchorType(entry.typeId).label;
    } else if (field === 'type_id') {
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
    } else if (field === 'yaw') {
      entry.yaw = ctx.finiteNumber(target.value, 0);
    } else if (field === 'height_offset') {
      entry.heightOffset = ctx.finiteNumber(target.value, 0);
      entry.y = entry.baseY + entry.heightOffset;
    } else if (field === 'radius') {
      entry.radius = Math.max(4, ctx.finiteNumber(target.value, 18));
    } else if (field === 'size_x') {
      entry.sizeX = Math.max(1.2, ctx.finiteNumber(target.value, 12));
    } else if (field === 'size_y') {
      entry.sizeY = Math.max(1, ctx.finiteNumber(target.value, 6));
    } else if (field === 'size_z') {
      entry.sizeZ = Math.max(1.2, ctx.finiteNumber(target.value, 12));
    }
  });
  if (event.type === 'change') ctx.pushHistory();
}

export function bindRefEvents(ctx) {
  if (ctx.state.refsBound) return;
  const refs = ctx.getRefs();
  refs.panel?.addEventListener('click', (event) => handlePanelClick(ctx, event));
  refs.panel?.addEventListener('input', (event) => handlePanelInput(ctx, event));
  refs.panel?.addEventListener('change', (event) => handlePanelInput(ctx, event));
  ctx.state.refsBound = true;
}

async function saveCurrentActivity(ctx, options = {}) {
  const validation = ctx.activityIssues();
  if (!validation.valid) {
    ctx.setStatus('Fix validation issues before saving this activity.', 'error');
    return null;
  }
  if (!Array.isArray(ctx.state.anchors) || ctx.state.anchors.length === 0) {
    ctx.setStatus('Place at least one anchor before saving.', 'warning');
    return null;
  }
  ctx.ensureDraftMetadata();
  try {
    const creator = await getCurrentCreatorIdentity({
      fallbackName: ctx.appCtx.authUser?.displayName || 'Explorer'
    });
    const template = ctx.selectedTemplate();
    const roomContext = ctx.currentRoomCreationContext();
    const savingToRoom = ctx.state.audience === 'room' && roomContext.available;
    let saved = null;
    if (savingToRoom) {
      if (typeof ctx.appCtx.saveCurrentRoomActivity !== 'function') {
        throw new Error('Room game saving is unavailable right now.');
      }
      saved = await ctx.appCtx.saveCurrentRoomActivity({
        id: `room_${Date.now().toString(36)}`,
        templateId: ctx.state.templateId,
        title: ctx.state.draftTitle || template.label,
        description: ctx.state.draftDescription || template.description,
        traversalMode: template.traversalMode,
        preferredSurface: template.preferredSurface,
        creatorId: creator.creatorId,
        creatorName: creator.creatorName,
        creatorAvatar: creator.creatorAvatar,
        visibility: 'room',
        status: 'published',
        difficulty: ctx.activityIssues().issues.some((issue) => issue.severity === 'error') ? 'Needs Fixes' : 'Moderate',
        estimatedMinutes: Math.max(2, Math.min(45, Math.round(Math.max(2, ctx.state.anchors.length * 1.4)))),
        locationLabel: ctx.currentLocationLabel(),
        anchors: ctx.state.anchors
      });
    } else {
      saved = saveCreatorActivityDraft({
        templateId: ctx.state.templateId,
        anchors: ctx.state.anchors,
        name: ctx.state.draftTitle || template.label,
        description: ctx.state.draftDescription || '',
        creatorId: creator.creatorId,
        creatorAvatar: creator.creatorAvatar
      }, {
        title: ctx.state.draftTitle || template.label,
        description: ctx.state.draftDescription || '',
        creatorId: creator.creatorId,
        creatorName: creator.creatorName,
        creatorAvatar: creator.creatorAvatar,
        visibility: 'private',
        status: 'draft',
        locationLabel: ctx.currentLocationLabel()
      });
      await syncOwnCreatorActivityStats(listStoredActivities().filter((entry) => entry.creatorId === creator.creatorId));
    }
    ctx.markCreatorGuideProgress({
      saved: true,
      completed: ctx.state.guide.tested === true,
      lastSavedActivityId: saved.id
    });
    ctx.state.guideOpen = true;
    ctx.renderUi();
    ctx.setStatus(savingToRoom ? `Saved ${saved.title} as a room game.` : `Saved ${saved.title} to your creator library.`, 'ok');
    if (options.openBrowser === true && typeof ctx.appCtx.openActivityBrowser === 'function') {
      ctx.closeActivityCreator();
      await ctx.appCtx.openActivityBrowser({
        activityId: saved.id,
        scope: savingToRoom ? 'rooms' : 'creator'
      });
    }
    return saved;
  } catch (error) {
    ctx.setStatus(error?.message || 'Could not save this creator activity right now.', 'error');
    return null;
  }
}

function restartCreatorGuide(ctx) {
  ctx.state.guide = ctx.defaultCreatorGuideState();
  ctx.state.guideOpen = true;
  ctx.saveCreatorGuideState();
  ctx.renderUi();
  ctx.setStatus('Creator walkthrough restarted.', 'ok');
  return true;
}

async function handleCreatorGuideAction(ctx) {
  const step = ctx.currentCreatorGuideStep();
  if (step.id === 'intro') {
    ctx.markCreatorGuideProgress({ started: true });
    ctx.renderUi();
    ctx.setStatus('Pick a template and place the start point in the world.', 'ok');
    return true;
  }
  if (step.id === 'start') {
    ctx.setStatus('Start Point is selected. Click in the world to place it.', 'ok');
    return selectCreatorAnchorType(ctx, 'start');
  }
  if (step.anchorTypeId) {
    const anchorType = getActivityAnchorType(step.anchorTypeId);
    ctx.setStatus(`${anchorType.label} is selected. Click in the world to place it.`, 'ok');
    return selectCreatorAnchorType(ctx, step.anchorTypeId);
  }
  if (step.id === 'test') {
    if (!ctx.activityIssues().valid) {
      ctx.setStatus('Use the validation panel on the left to clear the remaining issues, then test again.', 'warning');
      return false;
    }
    return ctx.startTestMode();
  }
  if (step.id === 'save') {
    return !!(await saveCurrentActivity(ctx));
  }
  if (step.id === 'complete' && ctx.state.guide.lastSavedActivityId && typeof ctx.appCtx.openActivityBrowser === 'function') {
    ctx.closeActivityCreator();
    await ctx.appCtx.openActivityBrowser({ activityId: ctx.state.guide.lastSavedActivityId });
    return true;
  }
  return false;
}

export function renderUi(ctx) {
  const refs = ctx.getRefs();
  if (!(refs.panel instanceof HTMLElement)) return;
  const template = ctx.selectedTemplate();
  const summary = buildActivitySummary({ templateId: ctx.state.templateId, anchors: ctx.state.anchors });
  const validation = ctx.activityIssues();
  const checklist = buildTemplateChecklist(ctx.state.templateId, ctx.state.anchors);
  const roomContext = ctx.currentRoomCreationContext();
  if (ctx.state.audience === 'room' && !roomContext.available) {
    ctx.state.audience = 'library';
  }
  const saveTargetLabel = ctx.state.audience === 'room' && roomContext.available
    ? `Current Room • ${sanitizeText(roomContext.room?.name || roomContext.room?.code || 'Room', 80)}`
    : 'Creator Library';

  refs.panel.classList.toggle('show', ctx.state.active);
  refs.panel.classList.toggle('activityCreatorTesting', ctx.state.testing.active === true);
  document.body.classList.toggle('activity-creator-open', ctx.state.active);
  document.body.classList.toggle('activity-creator-testing', ctx.state.active && ctx.state.testing.active === true);

  if (refs.title) refs.title.textContent = 'Activity Creator';
  if (refs.subline) refs.subline.textContent = `${template.label} • ${template.description}`;
  if (refs.status) {
    refs.status.textContent = ctx.state.status.text;
    refs.status.dataset.tone = ctx.state.status.tone;
  }
  if (refs.guideBtn) refs.guideBtn.textContent = ctx.state.guide.completed ? 'Guide' : 'Start Here';

  if (refs.templateSelect) {
    refs.templateSelect.innerHTML = listActivityTemplateGroups().map((group) => `
      <optgroup label="${ctx.escapeHtml(group.label)}">
        ${group.templates.map((entry) => `<option value="${ctx.escapeHtml(entry.id)}"${entry.id === ctx.state.templateId ? ' selected' : ''}>${ctx.escapeHtml(entry.label)}</option>`).join('')}
      </optgroup>
    `).join('');
  }
  if (refs.templateHelp) {
    refs.templateHelp.innerHTML = `
      <div>${ctx.escapeHtml(summary.description)}</div>
      <div>${template.help.map((entry) => ctx.escapeHtml(entry)).join('<br>')}</div>
      <div>${ctx.escapeHtml(ctx.state.audience === 'room' && roomContext.available
        ? 'Room games publish into the current multiplayer room so everyone in that room can start or join them together.'
        : 'Saved activities stay in your creator library on this browser until you publish them through a later backend workflow.')}</div>
    `;
  }
  if (refs.summary) {
    refs.summary.innerHTML = `
      <div class="activityCreatorSummaryTitle">${ctx.escapeHtml(ctx.state.draftTitle || summary.title)}</div>
      <div class="activityCreatorSummaryMeta">${ctx.escapeHtml(template.traversalMode)} • ${ctx.escapeHtml(template.preferredSurface.replace(/_/g, ' '))}</div>
      <div class="activityCreatorSummaryText">${ctx.escapeHtml(ctx.state.draftDescription || template.description)}</div>
    `;
  }
  if (refs.titleInput && document.activeElement !== refs.titleInput) refs.titleInput.value = ctx.state.draftTitle || '';
  if (refs.descriptionInput && document.activeElement !== refs.descriptionInput) refs.descriptionInput.value = ctx.state.draftDescription || '';
  if (refs.audienceSelect) {
    refs.audienceSelect.innerHTML = [
      '<option value="library">Creator Library</option>',
      roomContext.available ? `<option value="room">Current Room • ${ctx.escapeHtml(roomContext.room?.code || '')}</option>` : ''
    ].join('');
    refs.audienceSelect.value = ctx.state.audience === 'room' && roomContext.available ? 'room' : 'library';
    refs.audienceSelect.disabled = roomContext.available !== true && ctx.state.audience !== 'library';
  }
  if (refs.audienceHelp) {
    refs.audienceHelp.innerHTML = ctx.state.audience === 'room' && roomContext.available
      ? `Save this as a shared multiplayer game for <strong>${ctx.escapeHtml(roomContext.room?.name || roomContext.room?.code || 'your current room')}</strong>. Everyone in that room can join once the host starts it.`
      : roomContext.room
        ? `You are in room <strong>${ctx.escapeHtml(roomContext.room.name || roomContext.room.code || 'room')}</strong>. Switch Save To if you want to publish this draft as a shared room game.`
        : `Save to <strong>${ctx.escapeHtml(saveTargetLabel)}</strong> to keep a private creator draft on this device. Join and manage a multiplayer room if you want to publish a shared room game.`;
  }
  if (refs.checklist) {
    refs.checklist.innerHTML = checklist.map((entry) => `
      <div class="activityCreatorChecklistItem ${entry.satisfied ? 'ok' : 'warn'}">
        <span>${ctx.escapeHtml(entry.label)}</span>
        <strong>${entry.count}/${entry.min}${Number.isFinite(entry.max) ? `-${entry.max}` : '+'}</strong>
      </div>
    `).join('');
  }
  if (refs.validation) {
    refs.validation.innerHTML = validation.issues.length
      ? validation.issues.slice(0, 6).map((issue) => `
          <div class="activityCreatorIssue ${ctx.escapeHtml(issue.severity)}">
            <strong>${ctx.escapeHtml(issue.message)}</strong>
            ${issue.hint ? `<span>${ctx.escapeHtml(issue.hint)}</span>` : ''}
          </div>
        `).join('')
      : '<div class="activityCreatorIssue ok"><strong>Validation is clean.</strong><span>This draft is ready to test.</span></div>';
  }
  if (refs.anchorPalette) {
    refs.anchorPalette.innerHTML = listAnchorTypesForTemplate(ctx.state.templateId).map((anchorType) => `
      <button type="button" class="activityCreatorAnchorBtn ${anchorType.id === ctx.state.anchorTypeId ? 'active' : ''}" data-activity-anchor-type="${ctx.escapeHtml(anchorType.id)}">
        <span>${ctx.escapeHtml(anchorType.icon)}</span>
        <strong>${ctx.escapeHtml(anchorType.label)}</strong>
        <small>${ctx.escapeHtml(anchorType.description)}</small>
      </button>
    `).join('');
  }
  if (refs.anchorList) {
    refs.anchorList.innerHTML = ctx.state.anchors.length
      ? ctx.state.anchors.map((anchor) => `
          <div class="activityCreatorAnchorRow ${anchor.id === ctx.state.selectedAnchorId ? 'selected' : ''}" data-activity-anchor-id="${ctx.escapeHtml(anchor.id)}">
            <div>
              <strong>${ctx.escapeHtml(anchor.label)}</strong>
              <span>${ctx.escapeHtml(getActivityAnchorType(anchor.typeId).label)} • ${ctx.escapeHtml((anchor.environment || 'unresolved').replace(/_/g, ' '))}</span>
            </div>
            ${anchor.typeId === 'checkpoint' ? `
              <div class="activityCreatorRowActions">
                <button type="button" data-activity-reorder="up" data-activity-anchor-id="${ctx.escapeHtml(anchor.id)}">↑</button>
                <button type="button" data-activity-reorder="down" data-activity-anchor-id="${ctx.escapeHtml(anchor.id)}">↓</button>
              </div>
            ` : ''}
          </div>
        `).join('')
      : '<div class="activityCreatorEmptyState">No anchors yet. Pick an anchor type and click in the world to place it.</div>';
  }
  if (refs.inspector) refs.inspector.innerHTML = inspectorHtml(ctx, ctx.selectedAnchor());
  if (refs.snapToggle) refs.snapToggle.checked = ctx.state.snapEnabled;
  if (refs.placementOffsetInput && refs.placementOffsetInput.value !== String(ctx.state.placementHeightOffset)) refs.placementOffsetInput.value = String(ctx.state.placementHeightOffset);
  if (refs.viewModeBtn) refs.viewModeBtn.textContent = ctx.state.viewMode === '2d' ? '3D View' : '2D Plan';
  if (refs.testBtn) refs.testBtn.disabled = validation.valid !== true;
  if (refs.toolDock) {
    refs.toolDock.querySelectorAll('[data-activity-tool]').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-activity-tool') === ctx.state.tool);
    });
  }
  if (refs.testBar) refs.testBar.hidden = ctx.state.testing.active !== true;
  if (refs.testSummary) refs.testSummary.textContent = ctx.state.testing.message || 'Testing activity';
  renderCreatorGuide(ctx, refs);
}
