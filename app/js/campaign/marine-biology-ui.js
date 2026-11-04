import {
  researchText as esc,
  researchSelect as select,
  researchButton as button,
} from '../ui/research-markup.js';
import {
  marineComparisonMarkup,
  marineBehaviorMarkup,
  marineBiologyReportMarkup,
} from './marine-biology-report.js';
export function createMarineBiologyControls({ api, prefix }) {
  const node = document.createElement('section');
  node.className = 'marine-career marine-biology';
  node.setAttribute('aria-label', 'Marine biologist study');
  node.innerHTML =
    '<header><span>Marine biologist</span><h3></h3></header><p data-marine-guidance></p><div data-marine-body></div><div data-marine-actions></div><p data-marine-progress></p><p data-marine-status role="status" aria-live="polite"></p><footer></footer>';
  const body = node.querySelector('[data-marine-body]'),
    actions = node.querySelector('[data-marine-actions]'),
    progress = node.querySelector('[data-marine-progress]'),
    status = node.querySelector('[data-marine-status]');
  let cursor = '';
  node.onclick = (event) => {
    const b = event.target.closest('[data-research-action]');
    if (!b) return;
    const action = b.dataset.researchAction;
    if (action === 'pause') {
      api().pause();
      render(api().snapshot());
      api().focusWorld?.();
    } else if (action === 'journal') api().journal();
    else if (action === 'next') api().next();
    else
      void api()
        .act(action)
        .then((saved) => {
          render(api().snapshot());
          if (action === 'refresh-view') body.querySelector('[data-marine-individual]')?.focus();
          else if (
            action === 'begin-window' ||
            (saved &&
              action === 'file-window' &&
              ['surface', 'habitat', 'follow'].includes(api().snapshot().phase))
          )
            api().focusWorld?.();
        });
  };
  node.onchange = (event) => {
    if (event.target.matches('[data-marine-individual]'))
      void api()
        .act('select-individual', { individualId: event.target.value })
        .then(() => render(api().snapshot()));
  };
  node.onsubmit = (event) => {
    const form = event.target;
    if (!form.matches('[data-marine-command]')) return;
    event.preventDefault();
    void api()
      .act(form.dataset.marineCommand, Object.fromEntries(new FormData(form)))
      .then(() => render(api().snapshot()));
  };
  function render(s) {
    node.hidden = !s?.visible;
    if (node.hidden) return;
    node.querySelector('h3').textContent = s.study?.label || 'Marine observations';
    const hints = [];
    if (s.station)
      hints.push(
        `Walk to ${s.station === 'lab' ? 'the wet lab' : 'the submarine cradle'}${Number.isFinite(s.stationDistance) ? ` · ${s.stationDistance.toFixed(1)} m` : ''}.`
      );
    if (s.target)
      hints.push(
        `${s.target.label}${Number.isFinite(s.targetDistance) ? ` · ${s.targetDistance.toFixed(1)} m` : ''}${Number.isFinite(s.targetBearing) ? ` · bearing ${Math.round(s.targetBearing)}°` : ''}${s.target.depthBand ? ` · ${s.target.depthBand[0]}–${s.target.depthBand[1]} m game-depth band` : ''}.`
      );
    node.querySelector('[data-marine-guidance]').textContent = hints.join(' ');
    status.textContent = s.error || s.message || '';
    const r = s.window;
    progress.textContent = r
      ? `${r.activeSeconds.toFixed(1)} / 8 active s · ${r.observations.length} individual records${r.config.method === 'habitat-transect-v1' ? ` · ${r.distanceMeters.toFixed(1)} m moved · ${r.gateIndex}/2 endpoints` : ''} · ${r.reason}`
      : '';
    const individualField = body.querySelector('[data-marine-individual]');
    if (individualField) individualField.value = s.selectedIndividualId || '';
    const beginButton = actions.querySelector('[data-research-action="begin-window"]');
    if (beginButton)
      beginButton.disabled =
        s.busy ||
        !s.underwater ||
        !s.instrumentAvailable ||
        (!!r && !r.interrupted) ||
        (s.phase === 'follow' && !s.selectedIndividualId);
    const key = [
      s.phase,
      !!s.underwater,
      !!s.instrumentAvailable,
      s.active?.runId,
      s.active?.habitats.length,
      r?.ready,
      r?.interrupted,
      !!r,
      s.viewRevision,
      s.ready,
      s.unsupported,
      s.busy,
    ].join(':');
    if (key === cursor) return;
    cursor = key;
    body.innerHTML = '';
    actions.innerHTML = '';
    const form = (type, fields, label) => {
      body.innerHTML += `<form id="${prefix}-form" data-marine-command="${type}">${fields}</form>`;
      actions.innerHTML += `<button type="submit" class="research-primary" form="${prefix}-form"${s.busy ? ' disabled' : ''}>${esc(label)}</button>`;
    };
    if (s.unsupported)
      body.innerHTML =
        '<p>This saved marine study needs a newer World Explorer version. Your observations are retained.</p>';
    else if (!s.ready) {
      body.innerHTML = '<p>Loading your marine Journal…</p>';
      actions.innerHTML = button('retry', 'Retry Journal', s.busy, true);
    } else if (s.phase === 'briefing') {
      body.innerHTML = `<p>${esc(s.study.question)}</p><p>Take a near-surface watch, compare two marked water habitats, then record one individual’s movement. Use matched effort and keep current-data limits with the report.</p><details><summary>Observation method</summary><p>These are licensed virtual animals in a reviewed offshore game habitat. Keep at least 50 m from dolphins. The short camera windows record individuals in view; they do not measure a real population. Ordinary exploration remains available.</p></details>`;
      actions.innerHTML = button('accept', 'Begin marine study', s.busy, true);
    } else if (['surface', 'habitat', 'follow'].includes(s.phase)) {
      if (!s.underwater)
        body.innerHTML =
          '<p>Deploy this vessel’s submarine from the working-deck cradle. Your saved observations stay with this study.</p>';
      else if (!s.instrumentAvailable)
        body.innerHTML =
          '<p>The observation camera is waiting for supported water and licensed study animals. Stay in the admitted site and retry when loading is complete; no effort is counted while unavailable.</p>';
      else if (s.phase === 'surface')
        body.innerHTML =
          '<p>Rise to the upper three game metres and stop. Watch for eight active seconds. A clear no-sighting record is valid and does not mean absent.</p>';
      else if (s.phase === 'habitat')
        body.innerHTML =
          s.study.method === 'habitat-transect-v1'
            ? '<p>Begin at the first marked endpoint and pilot the fifteen-metre line through this water habitat. Cross both endpoints with at least twelve metres of actual travel. Repeat the same method in the other depth band.</p>'
            : '<p>Hold one viewpoint within the marked water habitat for eight active seconds. Only animals in this depth band enter its record. Repeat the same method in the other band.</p>';
      else
        body.innerHTML =
          '<p>Keep the same dolphin in clear view from at least 50 m away. Record its changing positions for eight active seconds. A stationary model or a different individual cannot complete the sequence.</p>';
      if (s.phase === 'follow' && !r) {
        const choices = Object.fromEntries(
          (s.individuals || []).map((o) => [
            o.id,
            `${o.label} ${String.fromCharCode(65 + ((Number(o.id.split(':').at(-1)) || 0) % 26))} · ${Math.round(o.distanceMeters)} m`,
          ])
        );
        body.innerHTML += select('individualId', 'Visible individual', choices).replace(
          '<select ',
          '<select data-marine-individual '
        );
        const field = body.querySelector('[data-marine-individual]');
        field.value = s.selectedIndividualId || '';
        actions.innerHTML = button('refresh-view', 'Refresh visible individuals', s.busy);
      }
      if (r?.ready) {
        if (s.phase === 'follow') {
          body.innerHTML += marineBehaviorMarkup(r);
          form(
            'file-window',
            select('behavior', 'Visible movement', {
              'swam-through-view': 'Swam through the view',
              'changed-depth': 'Changed depth',
              'changed-direction': 'Changed direction',
              feeding: 'Feeding was established',
            }) +
              select('interpretation', 'What does the sequence establish?', {
                'observed-motion-not-feeding-or-intent':
                  'Visible motion; feeding and intention remain unknown',
                'inferred-feeding': 'A feeding event or intention',
              }),
            'File behavior sequence'
          );
        } else
          actions.innerHTML += button(
            'file-window',
            r.observations.length ? 'File observed individuals' : 'File no-sighting record',
            s.busy,
            true
          );
      } else
        actions.innerHTML += button(
          'begin-window',
          r ? 'Restart observation window' : 'Begin observation window',
          s.busy ||
            !s.underwater ||
            !s.instrumentAvailable ||
            (!!r && !r.interrupted) ||
            (s.phase === 'follow' && !s.selectedIndividualId),
          true
        );
    } else if (s.phase === 'comparison') {
      body.innerHTML = marineComparisonMarkup(s.comparison);
      form(
        'compare',
        select('result', 'What do these records show?', {
          'neither-watch-detected-animals': 'Neither watch detected a qualifying animal',
          'different-observed-taxa':
            s.comparison.rows.some((r) => r.individuals === 0) &&
            s.comparison.rows.some((r) => r.individuals > 0)
              ? 'An animal was recorded in one watch only'
              : 'Different virtual animal labels were observed',
          'different-individual-detections': 'Different numbers of individual detections',
          'similar-observed-records': 'Similar observed records',
        }) +
          select('limitation', 'Limit on the habitat comparison', {
            'individual-records-not-population-or-cause':
              'Individual records; population size and cause remain unknown',
            'population-census': 'A census of both populations',
          }) +
          select('currentLimit', 'Current context', {
            'no-local-current-measurement': 'No local current measurement was available',
            'zero-current': 'Missing current data means zero flow',
          }),
        'Save habitat comparison'
      );
    } else if (s.phase === 'report') {
      body.innerHTML =
        marineComparisonMarkup(s.comparison) +
        '<p>Choose one observed habitat for another matched period. A repeat can test consistency; it cannot replace missing context or turn non-detection into absence.</p>';
      form(
        'report',
        select(
          'followUp',
          'Follow-up habitat',
          Object.fromEntries(s.study.habitats.map((id) => [id, id.replaceAll('-', ' ')]))
        ) +
          select('followUpMethod', 'Follow-up method', {
            'repeat-matched-effort-other-time': 'Repeat matched effort at another time',
            'unmatched-count': 'Compare an unmatched casual count',
          }),
        'Save marine habitat plate'
      );
    } else {
      body.innerHTML = marineBiologyReportMarkup(s.active.report);
      actions.innerHTML =
        button('journal', 'View Journal') + button('next', 'Choose next study', false, true);
    }
    node.querySelector('footer').innerHTML = button('pause', 'Pause marine study');
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
