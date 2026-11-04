import { createLifecycleScope } from '../runtime/lifecycle-scope.js?v=2';

export function hudLaneHeight(lane, obstacles, viewportHeight, gap = 8) {
  let bottom = viewportHeight;
  for (const obstacle of obstacles) {
    if (obstacle.right > lane.left && obstacle.left < lane.right && obstacle.bottom > lane.top) {
      bottom = Math.min(bottom, Math.max(lane.top, obstacle.top));
    }
  }
  return Math.max(0, Math.floor(bottom - lane.top - gap));
}

export function hudMapPresentation(available, visualHeight, coordsHeight, buttonHeight = 44) {
  if (available < buttonHeight) return 'hidden';
  if (available >= Math.max(96, visualHeight) + coordsHeight + 4) return 'full';
  return available >= coordsHeight + buttonHeight + 4 ? 'compact' : 'button';
}

// ScreenLayout owns this binding. Resize/mode events refresh two CSS limits;
// no simulation, frame loop, location state or persistent preference lives here.
export function bindHudLaneLayout(documentRef, host = globalThis) {
  const scope = createLifecycleScope('screen-layout-hud');
  const root = documentRef?.getElementById('hud');
  const ids = [
    'hudBox',
    'hudMap',
    'hudUtilities',
    'floatMenuContainer',
    'mobileTouchControls',
    'mobileMovePad',
    'mobileLookPad',
    'mobileActionStack',
    'mobileDrivePedals',
    'mobileTiltQuickRecenter',
    'coords',
    'hudMapOpenBtn',
    'hudStatusPanels',
    'explorerGameHeader',
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, documentRef?.getElementById(id)]));
  const toolbar = root?.querySelector?.('.hudUtilityActions');
  const previous = new Map(),
    written = new Map();
  const documentStyle=documentRef?.documentElement?.style;
  const oldMastheadHeight=documentStyle?.getPropertyValue('--wx-masthead-height');
  let writtenMastheadHeight=null;
  let resizeFrame = null;
  const map = nodes.hudMap,
    visual = map?.querySelector?.('.hudMapVisual'),
    shortcut = nodes.hudMapOpenBtn;
  const statusPanels = nodes.hudStatusPanels,
    oldStatusHidden = statusPanels?.hidden,
    oldToolbarHidden = toolbar?.hidden;
  let lastToolbarHeight = 48,
    writtenToolbarHidden = oldToolbarHidden,
    writtenStatusHidden = oldStatusHidden;
  const oldPresentation = map?.getAttribute?.('data-hud-map-layout'),
    oldShortcutHidden = shortcut?.hidden;
  let lastVisualHeight = 0,
    lastCoordsHeight = 0,
    writtenPresentation = null,
    measurementKey = '';
  function mapPresentation(available) {
    const style = shortcut ? host.getComputedStyle(shortcut) : {};
    const buttonHeight = Math.max(
      44,
      (parseFloat(style.lineHeight) || 0) +
        (parseFloat(style.paddingTop) || 0) +
        (parseFloat(style.paddingBottom) || 0) +
        (parseFloat(style.borderTopWidth) || 0) +
        (parseFloat(style.borderBottomWidth) || 0)
    );
    const key = [
      Math.round(available),
      host.innerWidth,
      host.innerHeight,
      map?.getBoundingClientRect?.().width,
      style.fontSize,
      nodes.coords?.textContent,
    ].join('|');
    if (key !== measurementKey) {
      // Measure the complete responsive map, even when the last viewport used
      // its shortcut. The final state is applied in this same owned UI frame.
      if (map?.getAttribute?.('data-hud-map-layout') !== 'full')
        map?.removeAttribute?.('data-hud-map-layout');
      if (shortcut) shortcut.hidden = true;
      const view = visible(visual),
        coords = visible(nodes.coords);
      lastVisualHeight = view?.height || 0;
      lastCoordsHeight = coords?.height || 0;
      measurementKey = key;
    }
    const value = hudMapPresentation(available, lastVisualHeight, lastCoordsHeight, buttonHeight);
    if (map?.getAttribute?.('data-hud-map-layout') !== value)
      map?.setAttribute?.('data-hud-map-layout', value);
    writtenPresentation = value;
    if (shortcut) shortcut.hidden = value === 'full' || value === 'hidden';
  }
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
    root.style.setProperty(name, text);
    written.set(name, text);
  }
  function refresh() {
    if (!scope.isActive() || !root) return;
    // The same UI layout observer measures the shared masthead even while a
    // specialist renderer hides Earth's HUD. No frame or gameplay owner added.
    const masthead=visible(nodes.explorerGameHeader);
    const mastheadHeight=masthead&&masthead.top<=1?Math.ceil(masthead.bottom):0;
    if(documentStyle){
      const value=`${mastheadHeight}px`;
      if(documentStyle.getPropertyValue('--wx-masthead-height')!==value)documentStyle.setProperty('--wx-masthead-height',value);
      writtenMastheadHeight=value;
    }
    if (!visible(root)) return;
    const obstacles = [visible(nodes.floatMenuContainer)].filter(Boolean);
    if (visible(nodes.mobileTouchControls)) {
      for (const id of [
        'mobileMovePad',
        'mobileLookPad',
        'mobileActionStack',
        'mobileDrivePedals',
        'mobileTiltQuickRecenter',
      ]) {
        const rect = visible(nodes[id]);
        if (rect) obstacles.push(rect);
      }
    }
    const panelChildren = [...(statusPanels?.children || [])];
    const hasStatus = panelChildren.some(
      (node) =>
        !node.hidden &&
        host.getComputedStyle(node).display !== 'none' &&
        host.getComputedStyle(node).visibility !== 'hidden'
    );
    if (statusPanels) {
      writtenStatusHidden = !hasStatus;
      if (statusPanels.hidden !== writtenStatusHidden) statusPanels.hidden = writtenStatusHidden;
    }
    const measuredToolbar = visible(toolbar);
    if (measuredToolbar) lastToolbarHeight = measuredToolbar.height;
    for (const [id, property] of [
      ['hudMap', '--wx-hud-map-height'],
      ['hudUtilities', '--wx-hud-utility-height'],
    ]) {
      const element = nodes[id];
      if (!element || host.getComputedStyle(element).display === 'none') continue;
      // A zero-height lane must recover when the viewport/controls change.
      const rect = element.getBoundingClientRect();
      if (rect.width > 0) {
        const available = hudLaneHeight(rect, obstacles, host.innerHeight);
        set(property, available);
        if (id === 'hudMap') mapPresentation(available);
        else if (toolbar) {
          writtenToolbarHidden = hasStatus && available < lastToolbarHeight + 80;
          if (toolbar.hidden !== writtenToolbarHidden) toolbar.hidden = writtenToolbarHidden;
        }
      }
    }
    const toolbarRect = visible(toolbar);
    if (toolbarRect) set('--wx-hud-utility-footer', Math.ceil(toolbarRect.height + 8));
  }
  // ResizeObserver runs during layout. Apply its dependent CSS limits on the
  // next owned UI frame, instead of resizing an observed ancestor mid-delivery.
  function scheduleRefresh() {
    if (!scope.isActive() || resizeFrame !== null) return;
    resizeFrame = scope.animationFrame(() => {
      resizeFrame = null;
      refresh();
    });
    if (resizeFrame === null) refresh();
  }
  if (root && typeof host.ResizeObserver === 'function') {
    const observer = new host.ResizeObserver(scheduleRefresh);
    for (const node of [root, toolbar, visual, ...Object.values(nodes)].filter(Boolean))
      observer.observe(node);
    scope.defer(() => observer.disconnect());
  }
  scope.listen(host, 'resize', scheduleRefresh, { passive: true });
  scope.listen(host, 'pagehide', (event) => {
    if (!event.persisted) scope.dispose('page closed');
  });
  scope.defer(() => {
    if(documentStyle&&documentStyle.getPropertyValue('--wx-masthead-height')===writtenMastheadHeight){
      if(oldMastheadHeight)documentStyle.setProperty('--wx-masthead-height',oldMastheadHeight);
      else documentStyle.removeProperty('--wx-masthead-height');
    }
    if (toolbar && toolbar.hidden === writtenToolbarHidden) toolbar.hidden = oldToolbarHidden;
    if (statusPanels && statusPanels.hidden === writtenStatusHidden)
      statusPanels.hidden = oldStatusHidden;
    if (map?.getAttribute?.('data-hud-map-layout') === writtenPresentation) {
      if (oldPresentation == null) map.removeAttribute('data-hud-map-layout');
      else map.setAttribute('data-hud-map-layout', oldPresentation);
      if (shortcut) shortcut.hidden = oldShortcutHidden;
    }
    for (const [name, value] of previous)
      if (root.style.getPropertyValue(name) === written.get(name)) {
        if (value) root.style.setProperty(name, value);
        else root.style.removeProperty(name);
      }
  });
  refresh();
  return Object.freeze({ refresh, dispose: () => scope.dispose('HUD released') });
}
