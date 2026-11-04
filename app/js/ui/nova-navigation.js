import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

let currentBinding;

// NOVA presents existing actions. It never owns menu state, admission or travel.
export function bindNovaNavigation(documentRef = globalThis.document) {
  currentBinding?.dispose();
  const scope = createLifecycleScope('nova-navigation');
  const observers = [];
  for (const button of documentRef.querySelectorAll('[data-nova-target]')) {
    const target = documentRef.getElementById(button.dataset.novaTarget);
    if (!target) { button.disabled = true; continue; }
    const sync = () => {
      button.disabled = !!target.disabled || target.getAttribute('aria-disabled') === 'true';
      const expanded = target.getAttribute('aria-expanded');
      if (expanded !== null) button.setAttribute('aria-expanded', expanded);
      const controls = target.getAttribute('aria-controls');
      if (controls) button.setAttribute('aria-controls', controls);
    };
    scope.listen(button, 'click', () => { sync(); if (!button.disabled) target.click(); });
    if (globalThis.MutationObserver) {
      const observer = new MutationObserver(sync);
      observer.observe(target, {attributes:true, attributeFilter:['aria-expanded','aria-controls','disabled','aria-disabled']});
      observers.push(observer);
    }
    sync();
    const panels={fActivities:['experiences','experienceBrowser'],fExplorerJournal:['journal','discoveryPanel']};
    const panel=panels[button.dataset.novaTarget];
    if(panel){
      const update=state=>{button.setAttribute('aria-controls',panel[1]);button.setAttribute('aria-expanded',String(state.panelLayer===panel[0]));};
      update({panelLayer:documentRef.body?.dataset.gamePanelLayer});
      scope.listen(globalThis,'we3d-screen-layout-change',event=>update(event.detail||{}));
    }
  }
  scope.defer(() => observers.forEach(observer => observer.disconnect()));
  scope.listen(globalThis, 'pagehide', event => { if (!event.persisted) scope.dispose('page closed'); });
  currentBinding = Object.freeze({dispose: () => scope.dispose('navigation released')});
  return currentBinding;
}
