import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

// ScreenLayout owns admission; this view borrows the existing settings nodes.
export function bindControlPanel(ctx, {updateMode, clearHeld, requestWorldFocus, documentRef = document} = {}) {
  ctx.disposeControlsPanel?.();
  const scope = createLifecycleScope('ui-controls-panel');
  const layout = ctx.screenLayout;
  const dialog = documentRef.getElementById('controlsTab');
  const content = documentRef.getElementById('ctrlContent');
  const button = documentRef.getElementById('controlsBarBtn');
  const slot = documentRef.getElementById('controlsSharedSettings');
  let leases = [];
  let presented = false;
  const modeGuide = dialog?.querySelector('.controls-keyboard-guide');
  if (modeGuide) modeGuide.open = documentRef.getElementById('mobileControlSettings')?.hidden !== false;
  const isOpen = () => dialog?.open === true;

  function returnSettings() {
    for (const {node, parent, next} of leases) {
      if (node.parentElement !== slot || !parent?.isConnected) continue;
      parent.insertBefore(node, next?.parentNode === parent ? next : null);
    }
    leases = [];
  }

  function render(state) {
    const open = scope.isActive() && state.panelLayer === 'controls';
    if (open === presented) return;
    presented = open;
    if (open) {
      clearHeld?.();
      ctx.clearControlInputState?.('controls-settings');
      ctx.setPauseReason?.('controls_settings', true);
      leases = ['mobileControlSettings', 'keyboardBindingSettings', 'accessibilitySettings'].map(id => {
        const node = documentRef.getElementById(id);
        return node && {node, parent: node.parentElement, next: node.nextSibling};
      }).filter(Boolean);
      for (const {node} of leases) {
        if (node.id === 'mobileControlSettings') slot.prepend(node);
        else slot.append(node);
      }
      content.classList.remove('hidden');
      content.setAttribute('aria-hidden', 'false');
      dialog.setAttribute('aria-hidden', 'false');
      dialog.classList.add('bar-open');
      button?.setAttribute('aria-expanded', 'true');
      updateMode?.();
      dialog.showModal();
    } else {
      if (dialog.contains(documentRef.activeElement)) documentRef.activeElement.blur();
      dialog.close();
      content.classList.add('hidden');
      content.setAttribute('aria-hidden', 'true');
      dialog.setAttribute('aria-hidden', 'true');
      dialog.classList.remove('bar-open');
      button?.setAttribute('aria-expanded', 'false');
      returnSettings();
      ctx.setPauseReason?.('controls_settings', false);
      updateMode?.();
    }
  }

  function open() {
    if (!scope.isActive() || !dialog?.isConnected || typeof dialog.showModal !== 'function' ||
        !ctx.gameStarted || ctx.worldLoading || ctx.titleLaunchPending || ctx.vrPresentation?.active ||
        layout.snapshot().activityLayer || layout.snapshot().panelLayer === 'vr-setup') return false;
    layout.setPanelLayer('controls', true);
    return isOpen();
  }
  function close({returnFocus = false} = {}) {
    const owned = layout.snapshot().panelLayer === 'controls';
    layout.setPanelLayer('controls', false);
    if (owned && returnFocus) requestWorldFocus?.();
    return owned;
  }
  scope.defer(layout.subscribe(render));
  scope.listen(button, 'click', () => isOpen() ? close({returnFocus: true}) : open());
  scope.listen(documentRef.getElementById('ctrlHeader'), 'click', () => close({returnFocus: true}));
  scope.listen(dialog, 'cancel', event => { event.preventDefault(); close({returnFocus: true}); });
  scope.listen(dialog, 'close', () => {
    // A queued close event from a predecessor must not retire a reopened view.
    if (!dialog.open) close();
  });
  scope.listen(dialog, 'click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close({returnFocus: true});
  });
  scope.listen(dialog, 'keydown', event => {
    // Native fields retain their defaults without forwarding world commands.
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close({returnFocus: true}); }
  });
  scope.listen(globalThis, 'pagehide', event => { if (!event.persisted) scope.dispose('page closed'); });
  scope.defer(() => {
    layout.setPanelLayer('controls', false);
    render(layout.snapshot());
    returnSettings();
  });
  const dispose = () => scope.dispose('Controls view released');
  ctx.openControlsPanel = open;
  ctx.closeControlsPanel = close;
  ctx.disposeControlsPanel = dispose;
  scope.defer(() => {
    if (ctx.openControlsPanel === open) delete ctx.openControlsPanel;
    if (ctx.closeControlsPanel === close) delete ctx.closeControlsPanel;
    if (ctx.disposeControlsPanel === dispose) delete ctx.disposeControlsPanel;
  });
  return Object.freeze({open, close, dispose, snapshot: scope.snapshot});
}
