const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// Native station chrome owns focus and pause only. Domain views own their
// instruments and commands; the profile store owns every durable result.
export function createResearchStationShell({runtime, careerId, label, getState, target, objective, stationLabel, near, view, save, onCommand, afterRender, onJournal, onNext, requestWorldFocus}) {
  const pin = document.createElement('aside');
  pin.className = 'research-objective'; pin.setAttribute('aria-label', label + ' objective');
  pin.innerHTML = `<span>${escape(label)} · Fictional training site</span><strong></strong><p></p><div><button type="button" data-research-station>Open station</button><button type="button" data-research-pause>Pause fieldwork</button></div>`;
  const dialog = document.createElement('dialog'), titleId = careerId + 'StationTitle';
  dialog.className = 'experience-browser research-station'; dialog.dataset.career = careerId;
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.innerHTML = `<header class="experience-header"><div><span class="experience-eyebrow">${escape(label)} · Training site</span><h2 id="${titleId}" tabindex="-1"></h2></div><button type="button" data-research-close aria-label="Close station">×</button></header><div class="research-station-body"></div><footer class="research-station-actions"></footer><p class="research-station-status" role="status" aria-live="polite"></p>`;
  document.body.append(pin, dialog);
  const body = dialog.querySelector('.research-station-body'), actions = dialog.querySelector('footer'), status = dialog.querySelector('[role=status]'), heading = dialog.querySelector('h2');
  let busy = false, disposed = false, origin = null, station = null, cursor = null;
  const active = () => getState()?.active;
  function releaseLayer() {
    runtime.screenLayout?.setPanelLayer('research', false);
    runtime.setPauseReason?.('research-station', false);
  }
  function close({returnToWorld = true} = {}) {
    if (busy) return false;
    if (dialog.open) dialog.close();
    releaseLayer();
    if (returnToWorld && requestWorldFocus) requestWorldFocus();
    else if (origin?.isConnected) origin.focus({preventScroll: true});
    return true;
  }
  function render() {
    const value = active(); if (!value || disposed) return;
    const nextCursor = `${value.phase}:${value.layerIndex ?? ''}`, content = view(value);
    station = target(value); heading.textContent = content.title;
    body.innerHTML = content.body; actions.innerHTML = content.actions; status.textContent = '';
    afterRender?.(body, value);
    if (nextCursor !== cursor) {body.scrollTop = 0; if (dialog.open) heading.focus({preventScroll: true});}
    if (dialog.open && !dialog.contains(document.activeElement)) heading.focus({preventScroll: true});
    cursor = nextCursor;
  }
  async function perform(command) {
    if (busy || disposed) return;
    if (!near(station)) {status.textContent = 'Return to this marked station before recording.'; return;}
    busy = true; status.textContent = 'Saving your field record…';
    const controls = [...dialog.querySelectorAll('button,input,select')].map(control => [control, control.disabled]);
    for (const [control] of controls) control.disabled = true;
    try {
      const previous = station; await save(command); render();
      if (station !== previous) {busy = false; close();}
    } catch (error) {status.textContent = error?.message || 'The step could not save. Your previous records and finds are kept. Try again.';}
    finally {busy = false; for (const [control, disabled] of controls) if (control.isConnected) control.disabled = disabled; update();}
  }
  dialog.addEventListener('submit', event => {
    event.preventDefault(); const form = event.target;
    if (form.matches('[data-research-form]') && !busy) onCommand(form.dataset.researchForm, Object.fromEntries(new FormData(form)), active(), {perform, render, body});
  });
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || busy) return;
    if (button.hasAttribute('data-research-close')) close();
    else if (button.hasAttribute('data-research-journal')) {close({returnToWorld: false}); onJournal();}
    else if (button.hasAttribute('data-research-next')) {close({returnToWorld: false}); onNext();}
    else if (button.dataset.researchAction) onCommand(button.dataset.researchAction, {...button.dataset}, active(), {perform, render, body});
  });
  dialog.addEventListener('keydown', event => {if (event.key === 'Escape') event.stopPropagation();});
  dialog.addEventListener('cancel', event => {event.preventDefault(); close();});
  dialog.addEventListener('close', releaseLayer);
  function open() {
    if (disposed || busy || !active() || !near(target(active()))) return false;
    origin = document.activeElement; render(); if (!dialog.open) dialog.showModal();
    runtime.screenLayout?.setPanelLayer('research', true); runtime.setPauseReason?.('research-station', true);
    heading.focus({preventScroll: true}); return true;
  }
  function update() {
    if (disposed || !active()) return;
    const value = active(), id = target(value), meters = near(id, true), done = value.phase === 'complete';
    pin.querySelector('strong').textContent = objective(value);
    pin.querySelector('p').textContent = done ? 'Your report and exhibition plate are saved in Journal.' : Number.isFinite(meters) ? `${meters < 10 ? meters.toFixed(1) : Math.round(meters)} m to ${stationLabel(id)}` : 'Return to your training site.';
    const button = pin.querySelector('[data-research-station]'); button.disabled = busy || !near(id); button.textContent = done ? 'Review site report' : 'Open station';
    pin.hidden = !runtime.Walk?.state?.walker || runtime.getEnv?.() !== 'EARTH';
  }
  pin.querySelector('[data-research-station]').onclick = open;
  pin.querySelector('[data-research-pause]').onclick = () => {if (close({returnToWorld: false})) runtime.stopGameplayPlugin?.('fieldwork-paused');};
  return {open, update, refresh: render, dispose() {if (disposed) return; busy = false; close({returnToWorld: false}); disposed = true; pin.remove(); dialog.remove();}};
}
