import {
  oceanographyText as esc,
  waterColumnMarkup,
  transectMarkup,
  oceanographyConclusion,
  sonarReturnsMarkup,
} from './oceanography-report.js';
import { OCEANOGRAPHY_PROTOCOL as P, oceanographyComparison } from './oceanography-career.js';
const select = (name, label, choices) =>
  `<label>${esc(label)}<select name="${name}" required><option value="">Choose…</option>${Object.entries(
    choices
  )
    .map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`)
    .join('')}</select></label>`;
const button = (action, label, disabled = false, primary = false) =>
  `<button type="button"${primary ? ' class="research-primary"' : ''} data-ocean-action="${action}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
export function createOceanographyControls({ api, prefix }) {
  const node = document.createElement('section');
  node.className = 'oceanography-career';
  node.setAttribute('aria-label', 'Oceanographer survey');
  node.innerHTML =
    '<header><span>Oceanographer</span><h3></h3></header><p data-ocean-guidance></p><div data-ocean-body></div><div data-ocean-actions></div><p data-ocean-progress></p><p data-ocean-status role="status" aria-live="polite"></p><footer></footer>';
  const body = node.querySelector('[data-ocean-body]'),
    actions = node.querySelector('[data-ocean-actions]'),
    guidance = node.querySelector('[data-ocean-guidance]'),
    progress = node.querySelector('[data-ocean-progress]'),
    status = node.querySelector('[data-ocean-status]');
  let cursor = '';
  node.onclick = (event) => {
    const b = event.target.closest('[data-ocean-action]');
    if (!b) return;
    const action = b.dataset.oceanAction;
    if (action === 'pause') api().pause();
    else if (action === 'journal') api().journal();
    else if (action === 'next') api().next();
    else
      void api()
        .act(action)
        .then(() => render(api().snapshot()));
  };
  node.onsubmit = (event) => {
    const form = event.target;
    if (!form.matches('[data-ocean-command]')) return;
    event.preventDefault();
    void api()
      .act(form.dataset.oceanCommand, Object.fromEntries(new FormData(form)))
      .then(() => render(api().snapshot()));
  };
  function render(s) {
    node.hidden = !s?.visible;
    if (node.hidden) return;
    node.querySelector('h3').textContent = s.study?.label || 'Water-column survey';
    status.textContent =
      s.error || (s.cast?.ready ? 'Recovered cast is ready to file.' : s.message || '');
    const guidanceParts = [];
    if (s.station)
      guidanceParts.push(
        `Walk to ${s.station === 'chart' ? 'the bridge chart table' : s.station === 'sub' ? 'the CTD control beside the submarine cradle' : 'the wet lab'}${Number.isFinite(s.stationDistance) ? ` · ${s.stationDistance.toFixed(1)} m` : ''}.`
      );
    if (s.nextStation)
      guidanceParts.push(
        `${s.nextStation.name} · ${Number.isFinite(s.nextStationMeters) ? s.nextStationMeters.toFixed(1) : '—'} m · ${s.nextStation.lat.toFixed(4)}, ${s.nextStation.lon.toFixed(4)}. Moor within 25 m before the cast.`
      );
    if (s.contactGate) guidanceParts.push(s.contactGate.reason);
    if (s.target)
      guidanceParts.push(
        `${s.target.returnShape} · ${Number.isFinite(s.targetDistance) ? s.targetDistance.toFixed(1) : '—'} m`
      );
    if (s.phase === 'return' && Number.isFinite(s.parentDistance))
      guidanceParts.push(
        `Parent vessel · ${s.parentDistance.toFixed(1)} m. Approach within ${P.parentApproachMeters} m at 1–15 m game depth, then record the return before recovering aboard.`
      );
    guidance.textContent = guidanceParts.join(' ');
    progress.textContent = s.cast
      ? s.cast.ready
        ? `${s.cast.activeSeconds.toFixed(1)} active s · Instrument recovered`
        : `${s.cast.activeSeconds.toFixed(1)} active s · ${Math.max(0, s.cast.depthMeters).toFixed(2)} m below the water surface · ${s.cast.reason}`
      : '';
    const key = [
      s.phase,
      s.active?.runId,
      s.active?.stationIndex,
      s.active?.pings.length,
      !!s.depths,
      !!s.cast,
      s.cast?.measurementComplete,
      s.cast?.ready,
      s.cast?.interrupted,
      s.ready,
      s.busy,
      s.unsupported,
    ].join(':');
    if (cursor === key) return;
    cursor = key;
    const form = (type, fields, label) => {
      body.innerHTML += `<form id="${prefix}-form" data-ocean-command="${type}">${fields}</form>`;
      actions.innerHTML += `<button type="submit" class="research-primary" form="${prefix}-form"${s.busy ? ' disabled' : ''}>${esc(label)}</button>`;
    };
    body.innerHTML = '';
    actions.innerHTML = '';
    if (s.unsupported) {
      body.innerHTML =
        '<p>This saved ocean survey needs a newer version of World Explorer. Your records are retained.</p>';
    } else if (!s.ready) {
      body.innerHTML = '<p>Loading your saved survey…</p>';
      actions.innerHTML = button('retry', 'Retry Journal', s.busy, true);
    } else if (s.phase === 'planning') {
      body.innerHTML = `<p>${esc(s.study.question)}</p><p>At the bridge chart table, review the two regional model depths. Plan the same 2, 4 and 6 m training downcast at both stations. Temperature and practical salinity come from the declared training scenario; they are not live ocean measurements.</p>`;
      if (s.depths)
        body.innerHTML += s.depths
          .map(
            (d) =>
              `<p>${esc(d.stationId)} · ${d.depthMeters.toFixed(1)} m chart model · ${esc(d.sourceId)} · archived ${esc(d.fetchedAt)}</p>`
          )
          .join('');
      actions.innerHTML = button('check-plan', 'Review both station charts', s.busy, !s.depths);
      if (s.depths)
        form(
          'accept',
          select('protocolId', 'Matched downcast protocol', {
            [P.id]: '2 / 4 / 6 m downcast',
          }),
          'Accept two-station survey'
        );
    } else if (s.phase === 'casts') {
      body.innerHTML =
        '<p>At the working-deck control, the winch lowers the physical probe to each sampling depth and recovers it. Remain here while moored. Pause freezes the cast; sailing, leaving the station or changing vessels interrupts it. A failed file action keeps its completed result ready to retry.</p>';
      if (s.active.casts.shelf)
        body.innerHTML += waterColumnMarkup({ shelf: s.active.casts.shelf });
      actions.innerHTML =
        button(
          'start-cast',
          s.cast ? 'Restart downcast' : 'Begin downcast',
          s.busy || (!!s.cast && !s.cast.interrupted && !s.cast.ready),
          !s.cast || s.cast.interrupted
        ) +
        button(
          'cast',
          'File recovered cast',
          s.busy || !s.cast?.ready || s.cast?.interrupted,
          true
        );
    } else if (s.phase === 'mapping') {
      body.innerHTML =
        `<p>${s.active.pings.length}/3 geometry returns charted. Deploy this vessel’s submarine and map a short corridor. Record each return inside the sonar cone while stopped; move at least 5 m between returns. Broad shapes and their uncertainty remain distinct from a direct identification.</p>` +
        sonarReturnsMarkup(s.active.pings);
      actions.innerHTML = button('ping', 'Record geometry return', s.busy, true);
    } else if (s.phase === 'select-target') {
      body.innerHTML =
        '<p>Choose one of your charted contacts for direct inspection. A sonar return shape is a clue. Keep its uncertainty with the chart.</p>' +
        sonarReturnsMarkup(s.active.pings);
      form(
        'select-target',
        select(
          'targetId',
          'Mapped dive target',
          Object.fromEntries(s.active.pings.map((p) => [p.target.id, p.target.returnShape]))
        ) +
          select('uncertainty', 'What does the return establish?', {
            'return-shape-not-identification': 'A return shape; identity remains unconfirmed',
            'exact-identification': 'An exact identification',
          }),
        'Choose inspection target'
      );
    } else if (s.phase === 'inspection') {
      body.innerHTML =
        '<p>Pilot the submarine within 6 m of the selected contact and face its exposed structure. Stop before recording the direct view.</p>';
      form(
        'inspect',
        select('form', 'Visible structure', {
          'branching-colonies-on-rock': 'Branching colonies on a rocky base',
          'unbroken-mineral-surface': 'Unbroken mineral surface',
          'straight-edges-and-latches': 'Straight edges and manufactured latches',
        }),
        'Record direct submersible view'
      );
    } else if (s.phase === 'return') {
      body.innerHTML =
        '<p>Navigate back alongside your parent vessel. Record the approach, then use Recover to parent vessel and walk to the wet lab. Recovery from elsewhere keeps observations but does not stand in for this navigation step.</p>';
      actions.innerHTML = button('return-approach', 'Record approach to this vessel', s.busy, true);
    } else if (s.phase === 'report') {
      const c = oceanographyComparison(s.active);
      body.innerHTML =
        waterColumnMarkup(s.active.casts) +
        `<p>Maximum matched-depth contrast: ${c.temperatureContrast.toFixed(2)}°C and ${c.salinityContrast.toFixed(2)} practical salinity. Temperature spans: ${c.temperatureSpanA.toFixed(2)} / ${c.temperatureSpanB.toFixed(2)}°C.</p>`;
      form(
        'report',
        select('result', 'Supported water-column result', {
          'temperature-contrast-with-depth': 'A resolved temperature contrast with depth',
          'fresher-upper-layer': 'A fresher upper layer at the shelf station',
          'not-resolved-by-this-protocol': 'The differences are not resolved by this protocol',
        }) +
          select('limitation', 'Limit on this comparison', {
            'two-simulated-profiles-not-a-regional-water-mass':
              'Two simulated profiles do not establish a regional water mass',
            'unresolved-does-not-prove-identical-water':
              'Unresolved does not prove identical water',
            'salinity-pattern-does-not-identify-a-river-source':
              'A salinity pattern does not identify its river source',
          }) +
          select('geometryContext', 'Relationship to the inspected feature', {
            'virtual-feature-not-a-regional-cause':
              'Local virtual feature; regional cause remains unknown',
            'feature-proves-cause': 'The feature proves the regional cause',
          }) +
          select('followUp', 'Useful follow-up', {
            'repeat-matched-profiles-other-time': 'Repeat matched profiles at another time',
            'collect-more-unmatched': 'Compare different protocols without matching depths',
          }),
        'Save annotated transect'
      );
    } else {
      body.innerHTML =
        `<p>${esc(oceanographyConclusion({ ...s.active.report, selected: s.active.selected }))}</p>` +
        waterColumnMarkup(s.active.casts) +
        transectMarkup(s.active) +
        sonarReturnsMarkup(s.active.pings);
      actions.innerHTML =
        button('journal', 'View Journal') + button('next', 'Choose next survey', false, true);
    }
    node.querySelector('footer').innerHTML = button('pause', 'Pause survey');
    for (const b of node.querySelectorAll('button')) if (s.busy) b.disabled = true;
  }
  return {
    node,
    render,
    dispose() {
      node.remove();
    },
  };
}
