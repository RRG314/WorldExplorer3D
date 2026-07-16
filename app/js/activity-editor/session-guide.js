const CREATOR_GUIDE_STORAGE_KEY = 'worldExplorer3D.activityCreatorGuide.v1';

function defaultCreatorGuideState() {
  return {
    started: false,
    tested: false,
    saved: false,
    completed: false,
    lastSavedActivityId: ''
  };
}


export function createActivityCreatorGuideApi(options = {}) {
  const { state, sanitizeText, selectedTemplate, hasAnchorType } = options;

function loadCreatorGuideState() {
  if (typeof localStorage === 'undefined') return defaultCreatorGuideState();
  try {
    const raw = localStorage.getItem(CREATOR_GUIDE_STORAGE_KEY);
    if (!raw) return defaultCreatorGuideState();
    const parsed = JSON.parse(raw);
    return {
      started: parsed?.started === true,
      tested: parsed?.tested === true,
      saved: parsed?.saved === true,
      completed: parsed?.completed === true,
      lastSavedActivityId: sanitizeText(parsed?.lastSavedActivityId || '', 120).toLowerCase()
    };
  } catch (_) {
    return defaultCreatorGuideState();
  }
}

function saveCreatorGuideState() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CREATOR_GUIDE_STORAGE_KEY, JSON.stringify({
      started: state.guide.started === true,
      tested: state.guide.tested === true,
      saved: state.guide.saved === true,
      completed: state.guide.completed === true,
      lastSavedActivityId: sanitizeText(state.guide.lastSavedActivityId || '', 120).toLowerCase()
    }));
  } catch (_) {
    // Guide persistence should never interrupt creation.
  }
}

function markCreatorGuideProgress(patch = {}) {
  state.guide = {
    ...state.guide,
    ...patch
  };
  saveCreatorGuideState();
}

function creatorGuideStepIds() {
  const steps = [
    { id: 'intro' },
    { id: 'start', anchorTypeId: 'start', label: 'Start Point', min: 1 }
  ];
  selectedTemplate().requiredAnchors
    .filter((entry) => entry.id !== 'start' && (entry.min || 0) > 0)
    .forEach((entry) => {
      steps.push({
        id: `anchor_${entry.id}`,
        anchorTypeId: entry.id,
        label: entry.label,
        min: entry.min
      });
    });
  steps.push({ id: 'test' }, { id: 'save' });
  return steps;
}

function currentCreatorGuideStep() {
  const steps = creatorGuideStepIds();
  if (!state.guide.started) {
    return { ...steps[0], index: 1, total: steps.length };
  }
  for (let index = 1; index < steps.length; index += 1) {
    const step = steps[index];
    if (!step.anchorTypeId) continue;
    if (!hasAnchorType(step.anchorTypeId, step.min || 1)) {
      return { ...step, index: index + 1, total: steps.length };
    }
  }
  if (!state.guide.tested) {
    const stepIndex = steps.findIndex((entry) => entry.id === 'test');
    return { ...steps[stepIndex], index: stepIndex + 1, total: steps.length };
  }
  if (!state.guide.saved) {
    const stepIndex = steps.findIndex((entry) => entry.id === 'save');
    return { ...steps[stepIndex], index: stepIndex + 1, total: steps.length };
  }
  return { id: 'complete', index: steps.length, total: steps.length };
}


  return { currentCreatorGuideStep, loadCreatorGuideState, markCreatorGuideProgress, saveCreatorGuideState };
}

export { defaultCreatorGuideState };
