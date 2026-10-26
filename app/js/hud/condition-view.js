import {setDomText, setDomAttribute} from '../ui/dom-state.js?v=1';

// Earth and Ocean supply their own condition/air value. This view only presents
// it; it never owns damage, breathing, recovery or persistence.
export function renderHudCondition(documentRef, condition, label = 'Explorer health') {
  const bar = documentRef.getElementById('conditionBar');
  const fill = documentRef.getElementById('conditionFill');
  if (!bar || !fill) return;
  const value = Math.max(0, Math.min(1, Number(condition)));
  const percent = Math.round(value * 100);
  const state = value <= .25 ? 'critical' : value <= .6 ? 'injured' : 'healthy';
  const width = `${percent}%`;
  if (fill.style.width !== width) fill.style.width = width;
  setDomAttribute(fill, 'data-state', state);
  setDomAttribute(bar, 'aria-label', label);
  setDomAttribute(bar, 'aria-valuenow', percent);
  setDomAttribute(bar, 'title', `${label} · ${percent}%`);
  setDomText(documentRef.getElementById('conditionLabel'), `${label} · ${percent}%`);
}
