import {capturePresentation} from '../runtime/renderer-owners.js';
import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

// This is the existing shell's keyboard return action, shared by navigation
// and travel readouts. The current presentation owner selects the canvas.
export function bindWorldFocusControls(context, closeMenus, documentRef = globalThis.document) {
  const scope = createLifecycleScope('ui-world-focus');
  function focusWorld() {
    const layout = context.screenLayout?.snapshot?.();
    if (!scope.isActive() || !context.gameStarted || context.paused || context.worldLoading ||
        context.titleLaunchPending || context.earthResumePending ||
        layout?.panelLayer || layout?.activityLayer || context.vrPresentation?.active) return false;
    const presentation = capturePresentation(context);
    const canvas = presentation.renderer?.domElement;
    if (!presentation.owner || !canvas?.isConnected || !presentation.isCurrent()) return false;
    closeMenus();
    if (canvas.tabIndex < 0) canvas.tabIndex = 0;
    canvas.focus({preventScroll:true});
    return documentRef.activeElement === canvas;
  }
  scope.listen(documentRef.getElementById('returnToWorldBtn'), 'click', focusWorld);
  for (const id of ['floatMenuContainer', 'hud', 'minimapZoomControls', 'worldQuickControls']) {
    const element = documentRef.getElementById(id);
    if (!element) continue;
    scope.listen(element, 'keydown', event => {
      if (event.key !== 'Escape' || event.target?.isContentEditable ||
          ['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)) return;
      if (!focusWorld()) return;
      event.preventDefault();
      event.stopPropagation(); // Returning to play must not also toggle pause.
    });
  }
  scope.listen(globalThis, 'pagehide', event => { if (!event.persisted) scope.dispose('page closed'); });
  return Object.freeze({focusWorld, dispose: () => scope.dispose('UI released')});
}
