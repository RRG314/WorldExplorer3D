const STORAGE_KEY = 'worldExplorer3D.accessibility.v1';
const TEXT_SCALES = new Set(['100', '115', '130']);
const DEFAULTS = Object.freeze({ textScale: '100', reducedMotion: false, highContrast: false });
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function visible(element) {
  if (!(element instanceof HTMLElement) || element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return {
      textScale: TEXT_SCALES.has(String(parsed?.textScale)) ? String(parsed.textScale) : DEFAULTS.textScale,
      reducedMotion: parsed?.reducedMotion === true,
      highContrast: parsed?.highContrast === true
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
}

function initAccessibility() {
  const root = document.documentElement;
  const announceRegion = document.getElementById('accessibilityAnnouncements');
  const textScale = document.getElementById('accessibilityTextScale');
  const reducedMotion = document.getElementById('accessibilityReducedMotion');
  const highContrast = document.getElementById('accessibilityHighContrast');
  const status = document.getElementById('accessibilitySettingsStatus');
  let settings = loadSettings();
  let activeModal = null;
  let restoreFocus = null;

  const upgradeSemantics = () => {
    document.querySelectorAll('.floatItem, .mode, .loc, #ctrlHeader').forEach((element) => {
      if (!(element instanceof HTMLElement) || element.dataset.we3dKeyboardButton === 'true') return;
      element.dataset.we3dKeyboardButton = 'true';
      element.setAttribute('role', 'button');
      element.tabIndex = 0;
      element.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        element.click();
      });
    });
    document.querySelectorAll('.floatItem, .mode, .loc').forEach((element) => {
      element.setAttribute('aria-pressed', String(element.classList.contains('on') || element.classList.contains('sel')));
    });
    const controlsHeader = document.getElementById('ctrlHeader');
    const controlsContent = document.getElementById('ctrlContent');
    if (controlsHeader && controlsContent) {
      controlsHeader.setAttribute('aria-controls', 'ctrlContent');
      controlsHeader.setAttribute('aria-expanded', String(!controlsContent.classList.contains('hidden')));
    }
    [
      'locationSearchStatus', 'perfSettingsStatus', 'urbanEquipmentStatus',
      'gameShareStatus', 'editorStatus', 'activityCreatorStatus', 'roomPanelStatus'
    ].forEach((id) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
    });
    document.querySelectorAll('canvas').forEach((canvas) => {
      if (canvas.hasAttribute('aria-label') || canvas.getAttribute('aria-hidden') === 'true') return;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', canvas.id === 'largeMapCanvas' ? 'Interactive world map' : 'Interactive 3D world view');
    });
  };

  const apply = ({ persist = true, announce = true } = {}) => {
    root.dataset.we3dTextScale = settings.textScale;
    root.dataset.we3dMotion = settings.reducedMotion ? 'reduce' : 'system';
    root.dataset.we3dContrast = settings.highContrast ? 'more' : 'standard';
    if (textScale) textScale.value = settings.textScale;
    if (reducedMotion) reducedMotion.checked = settings.reducedMotion;
    if (highContrast) highContrast.checked = settings.highContrast;
    const summary = `${settings.textScale}% text · ${settings.reducedMotion ? 'reduced motion' : 'system motion'} · ${settings.highContrast ? 'higher contrast' : 'standard contrast'}`;
    if (status) status.textContent = summary;
    if (persist) saveSettings(settings);
    if (announce && announceRegion) announceRegion.textContent = `Accessibility settings updated: ${summary}.`;
    globalThis.dispatchEvent?.(new CustomEvent('we3d:accessibility-change', { detail: { ...settings } }));
  };

  const update = (patch) => {
    settings = { ...settings, ...patch };
    apply();
  };

  textScale?.addEventListener('change', () => update({ textScale: TEXT_SCALES.has(textScale.value) ? textScale.value : '100' }));
  reducedMotion?.addEventListener('change', () => update({ reducedMotion: reducedMotion.checked }));
  highContrast?.addEventListener('change', () => update({ highContrast: highContrast.checked }));
  document.getElementById('mobileControlsReset')?.addEventListener('click', () => {
    settings = { ...DEFAULTS };
    apply();
  });

  const modalCandidates = () => [...document.querySelectorAll([
    'dialog[open]', '[role="dialog"][aria-modal="true"]',
    '#globeHubOverlay:not([hidden])', '#roomPanelModal.show',
    '#pauseScreen.show', '#resultScreen.show', '#caughtScreen.show'
  ].join(','))].filter(visible);

  const syncModal = () => {
    const next = modalCandidates().at(-1) || null;
    if (next === activeModal) return;
    if (!next && activeModal) {
      activeModal = null;
      const target = restoreFocus;
      restoreFocus = null;
      if (target instanceof HTMLElement && target.isConnected && visible(target)) target.focus({ preventScroll: true });
      return;
    }
    if (next) {
      if (!activeModal && document.activeElement instanceof HTMLElement) restoreFocus = document.activeElement;
      activeModal = next;
      queueMicrotask(() => {
        if (activeModal !== next || next.contains(document.activeElement)) return;
        const first = [...next.querySelectorAll(FOCUSABLE)].find(visible);
        (first || next).focus?.({ preventScroll: true });
      });
    }
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !activeModal || !visible(activeModal)) return;
    const items = [...activeModal.querySelectorAll(FOCUSABLE)].filter(visible);
    if (items.length === 0) {
      event.preventDefault();
      activeModal.focus?.();
      return;
    }
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || !activeModal.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, true);

  document.addEventListener('focusin', (event) => {
    if (!activeModal || !visible(activeModal) || activeModal.contains(event.target)) return;
    const first = [...activeModal.querySelectorAll(FOCUSABLE)].find(visible);
    (first || activeModal).focus?.({ preventScroll: true });
  });

  const observer = new MutationObserver(() => {
    upgradeSemantics();
    syncModal();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'open', 'aria-hidden']
  });
  apply({ persist: false, announce: false });
  upgradeSemantics();
  syncModal();

  const snapshot = () => Object.freeze({
    schemaVersion: 1,
    settings: { ...settings },
    browserZoomAllowed: !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(document.querySelector('meta[name="viewport"]')?.content || ''),
    reducedMotionSystem: matchMedia('(prefers-reduced-motion: reduce)').matches,
    forcedColors: matchMedia('(forced-colors: active)').matches,
    activeModalId: activeModal?.id || '',
    liveRegionReady: announceRegion?.getAttribute('aria-live') === 'polite'
  });
  globalThis.getWorldExplorerAccessibilitySnapshot = snapshot;
  return { snapshot, update, announce(message) { if (announceRegion) announceRegion.textContent = String(message || ''); } };
}

export { initAccessibility };
