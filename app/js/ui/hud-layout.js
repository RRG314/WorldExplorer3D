import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

export function hudLaneHeight(lane, obstacles, viewportHeight, gap = 8) {
  let bottom = viewportHeight;
  for (const obstacle of obstacles) {
    if (obstacle.right > lane.left && obstacle.left < lane.right && obstacle.bottom > lane.top) {
      bottom = Math.min(bottom, Math.max(lane.top, obstacle.top));
    }
  }
  return Math.max(0, Math.floor(bottom - lane.top - gap));
}

// ScreenLayout owns this binding. Resize/mode events refresh two CSS limits;
// no simulation, frame loop, location state or persistent preference lives here.
export function bindHudLaneLayout(documentRef, host = globalThis) {
  const scope = createLifecycleScope('screen-layout-hud');
  const root = documentRef?.getElementById('hud');
  const ids = ['hudBox','hudMap','hudUtilities','floatMenuContainer','mobileTouchControls',
    'mobileMovePad','mobileLookPad','mobileActionStack','mobileDrivePedals','mobileTiltQuickRecenter'];
  const nodes = Object.fromEntries(ids.map(id => [id, documentRef?.getElementById(id)]));
  const toolbar = root?.querySelector?.('.hudUtilityActions');
  const previous = new Map(), written = new Map();
  let resizeFrame = null;
  function visible(element) {
    if (!element || element.hidden) return null;
    const style = host.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }
  function set(name, value) {
    const text = `${value}px`;
    if (!previous.has(name)) previous.set(name, root.style.getPropertyValue(name));
    if (root.style.getPropertyValue(name) === text) return;
    root.style.setProperty(name, text); written.set(name, text);
  }
  function refresh() {
    if (!scope.isActive() || !root || !visible(root)) return;
    const obstacles = [visible(nodes.floatMenuContainer)].filter(Boolean);
    if (visible(nodes.mobileTouchControls)) {
      for (const id of ['mobileMovePad','mobileLookPad','mobileActionStack','mobileDrivePedals','mobileTiltQuickRecenter']) {
        const rect = visible(nodes[id]); if (rect) obstacles.push(rect);
      }
    }
    for (const [id, property] of [['hudMap','--wx-hud-map-height'],['hudUtilities','--wx-hud-utility-height']]) {
      const element = nodes[id];
      if (!element || host.getComputedStyle(element).display === 'none') continue;
      // A zero-height lane must recover when the viewport/controls change.
      const rect = element.getBoundingClientRect();
      if (rect.width > 0) set(property, hudLaneHeight(rect, obstacles, host.innerHeight));
    }
    const toolbarRect = visible(toolbar);
    if (toolbarRect) set('--wx-hud-utility-footer', Math.ceil(toolbarRect.height + 8));
  }
  // ResizeObserver runs during layout. Apply its dependent CSS limits on the
  // next owned UI frame, instead of resizing an observed ancestor mid-delivery.
  function scheduleRefresh() {
    if (!scope.isActive() || resizeFrame !== null) return;
    resizeFrame = scope.animationFrame(() => { resizeFrame = null; refresh(); });
    if (resizeFrame === null) refresh();
  }
  if (root && typeof host.ResizeObserver === 'function') {
    const observer = new host.ResizeObserver(scheduleRefresh);
    for (const node of [root,toolbar,...Object.values(nodes)].filter(Boolean)) observer.observe(node);
    scope.defer(() => observer.disconnect());
  }
  scope.listen(host, 'resize', scheduleRefresh, {passive:true});
  scope.listen(host, 'pagehide', event => { if (!event.persisted) scope.dispose('page closed'); });
  scope.defer(() => {
    for (const [name, value] of previous) if (root.style.getPropertyValue(name) === written.get(name)) {
      if (value) root.style.setProperty(name, value); else root.style.removeProperty(name);
    }
  });
  refresh();
  return Object.freeze({refresh, dispose: () => scope.dispose('HUD released')});
}
