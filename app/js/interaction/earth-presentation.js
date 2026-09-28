// A retained Earth world keeps simulation state, but its transient selection
// actions and civic HUD must not remain actionable in a different environment.
export function clearEarthInteractionPresentation(documentRoot = globalThis.document) {
  const selection = documentRoot?.getElementById('worldSelectionNotice');
  if (selection) {
    clearTimeout(Number(selection._hideTimer) || 0);
    selection._hideTimer = 0;
    selection.hidden = true;
    const action = selection.querySelector('[data-world-selection-action]');
    if (action) { action.onclick = null; action.hidden = true; }
  }
  const civic = documentRoot?.getElementById('urbanCivicStatus');
  civic?.classList.remove('show');
  civic?.setAttribute('aria-hidden', 'true');
}
