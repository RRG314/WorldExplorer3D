const SCREEN_LAYOUT_SCHEMA_VERSION = 1;
let singleton = null;

function createScreenLayoutService(documentRef = globalThis.document) {
  let activityLayer = '';
  let panelLayer = '';
  let revision = 0;
  const listeners = new Set();

  function publish(reason) {
    revision += 1;
    const state = snapshot();
    listeners.forEach((listener) => listener(state, reason));
    globalThis.dispatchEvent?.(new CustomEvent('we3d-screen-layout-change', { detail: state }));
    return state;
  }

  function setActivityLayer(id = '', open = true) {
    const next = open ? String(id || '').trim() : '';
    const previous = activityLayer;
    if (previous === next) return snapshot();
    const body = documentRef?.body;
    if (body && previous) body.classList.remove(`activity-${previous}-open`);
    activityLayer = next;
    if (body) {
      body.classList.toggle('game-activity-layer-open', !!activityLayer);
      if (activityLayer) body.classList.add(`activity-${activityLayer}-open`);
      if (activityLayer) body.dataset.gameActivityLayer = activityLayer;
      else delete body.dataset.gameActivityLayer;
      body.querySelectorAll?.('.floatMenu.open').forEach((menu) => menu.classList.remove('open'));
      body.querySelectorAll?.('.floatBtn[aria-expanded="true"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
    }
    return publish('activity-layer');
  }

  function setPanelLayer(id = '', open = true) {
    const requested = String(id || '').trim();
    const next = open ? requested : panelLayer === requested || !requested ? '' : panelLayer;
    const previous = panelLayer;
    if (previous === next) return snapshot();
    const body = documentRef?.body;
    if (body && previous) body.classList.remove(`panel-${previous}-open`);
    panelLayer = next;
    if (body) {
      body.classList.toggle('game-panel-layer-open', !!panelLayer);
      if (panelLayer) body.classList.add(`panel-${panelLayer}-open`);
      if (panelLayer) body.dataset.gamePanelLayer = panelLayer;
      else delete body.dataset.gamePanelLayer;
      body.querySelectorAll?.('.floatMenu.open').forEach((menu) => menu.classList.remove('open'));
      body.querySelectorAll?.('.floatBtn[aria-expanded="true"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
    }
    return publish('panel-layer');
  }

  function snapshot() {
    return Object.freeze({
      type: 'ScreenLayoutSnapshot',
      schemaVersion: SCREEN_LAYOUT_SCHEMA_VERSION,
      revision,
      activityLayer,
      panelLayer,
      zones: Object.freeze({
        status: 'top',
        context: 'center-lower',
        quickAccess: 'bottom',
        activity: activityLayer ? 'focus' : 'none'
      })
    });
  }

  return Object.freeze({
    type: 'ScreenLayoutService',
    setActivityLayer,
    setPanelLayer,
    snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}

function getScreenLayoutService(documentRef = globalThis.document) {
  singleton ||= createScreenLayoutService(documentRef);
  return singleton;
}

export { SCREEN_LAYOUT_SCHEMA_VERSION, createScreenLayoutService, getScreenLayoutService };
