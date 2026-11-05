import { createLifecycleScope } from '../runtime/lifecycle-scope.js?v=2';

let binding;
// A presentation of existing actions. ScreenLayout, the active-play clock and
// original target controllers retain admission, input and close ownership.
export function bindGameMenu(ctx, { documentRef = document, requestWorldFocus = () => {} } = {}) {
  binding?.dispose();
  const scope = createLifecycleScope('ui-game-menu');
  const layout = ctx.screenLayout;
  const dialog = documentRef.getElementById('explorerGameMenu');
  const toggle = documentRef.getElementById('explorerGameMenuBtn');
  if (!dialog || !toggle || !layout)
    return Object.freeze({ dispose: () => scope.dispose('unavailable') });
  documentRef.body.append(dialog);
  function render(state) {
    const open = scope.isActive() && state.panelLayer === 'game-menu';
    if (open === dialog.open) return;
    ctx.clearControlInputState?.('game-menu');
    ctx.setPauseReason?.('game_menu', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) dialog.showModal();
    else dialog.close();
  }
  function close({ returnFocus = false } = {}) {
    if (layout.snapshot().panelLayer === 'game-menu') layout.setPanelLayer('game-menu', false);
    if (returnFocus) {
      toggle.focus({ preventScroll: true });
      requestWorldFocus();
    }
  }
  function open() {
    const state = layout.snapshot();
    if (
      !ctx.gameStarted ||
      ctx.worldLoading ||
      ctx.titleLaunchPending ||
      ctx.showLargeMap ||
      ctx.vrPresentation?.active ||
      state.panelLayer ||
      state.activityLayer
    )
      return false;
    documentRef.body.classList.remove('context-details-open');
    layout.setPanelLayer('game-menu', true);
    return dialog.open;
  }
  scope.defer(layout.subscribe(render));
  scope.listen(toggle, 'click', () => (dialog.open ? close({ returnFocus: true }) : open()));
  scope.listen(documentRef.getElementById('explorerGameMenuClose'), 'click', () =>
    close({ returnFocus: true })
  );
  // Registered before workspace navigation: release this view, then let that
  // component forward the same click to its original action exactly once.
  scope.listen(
    documentRef,
    'click',
    (event) => {
      if (
        dialog.open &&
        dialog.contains(event.target) &&
        event.target.closest?.('[data-explorer-target]')
      )
        close();
    },
    true
  );
  scope.listen(dialog, 'keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close({ returnFocus: true });
    }
  });
  scope.listen(dialog, 'keyup', (event) => event.stopPropagation());
  scope.listen(dialog, 'cancel', (event) => {
    event.preventDefault();
    close({ returnFocus: true });
  });
  scope.listen(dialog, 'click', (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      close({ returnFocus: true });
  });
  function toggleDetails() {
    const prompt = documentRef.getElementById('discoveryContextPrompt');
    const primary = documentRef.getElementById('urbanVehiclePrompt');
    if (
      ctx.spaceFlight?.active ||
      ctx.boatDeck?.active ||
      ctx.onMoon ||
      ctx.onMars ||
      ctx.activePlanetaryBodyId ||
      primary?.classList.contains('show') ||
      prompt?.classList.contains('show')
    ) {
      const expanded = documentRef.body.classList.toggle('context-details-open');
      documentRef
        .getElementById('explorerOpportunitiesBtn')
        ?.setAttribute('aria-expanded', String(expanded));
      layout.refreshHudLayout?.();
      return;
    }
    const target = documentRef.getElementById(
      prompt?.classList.contains('show') ? 'discoveryContextOpenBtn' : 'fWorldDiscovery'
    );
    target?.click();
  }
  scope.listen(documentRef.getElementById('explorerOpportunitiesBtn'), 'click', toggleDetails);
  scope.listen(documentRef.getElementById('explorerGameMenuActivity'), 'click', () => {
    close();
    toggleDetails();
  });
  scope.listen(
    documentRef,
    'keydown',
    (event) => {
      if (event.key === 'Escape' && documentRef.body.classList.contains('context-details-open')) {
        documentRef.body.classList.remove('context-details-open');
        documentRef
          .getElementById('explorerOpportunitiesBtn')
          ?.setAttribute('aria-expanded', 'false');
        layout.refreshHudLayout?.();
        event.preventDefault();
        event.stopPropagation();
        requestWorldFocus();
      }
    },
    true
  );
  scope.listen(globalThis, 'pagehide', (event) => {
    if (!event.persisted) scope.dispose('page closed');
  });
  scope.defer(() => {
    close();
    ctx.setPauseReason?.('game_menu', false);
  });
  render(layout.snapshot());
  binding = Object.freeze({ open, close, dispose: () => scope.dispose('menu released') });
  return binding;
}
