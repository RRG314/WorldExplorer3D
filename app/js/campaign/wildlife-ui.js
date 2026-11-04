import {
  WILDLIFE_STUDIES,
  WILDLIFE_METHODS,
  wildlifeTarget,
  wildlifeEffortComparison
} from './wildlife-career.js';
import { createResearchStationShell } from './research-station-shell.js';
import { wildlifeText as esc, wildlifeChecklistMarkup } from './wildlife-report.js';
const select = (name, label, choices) =>
  `<label>${esc(label)}<select name="${name}" required><option value="">Choose…</option>${Object.entries(
    choices
  )
    .map(([id, text]) => `<option value="${id}">${esc(text)}</option>`)
    .join('')}</select></label>`;
const form = (type, body) =>
  `<form id="wildlifeFormActive" data-research-form="${type}">${body}</form>`;
const submit = (label) =>
  `<button type="submit" class="research-primary" form="wildlifeFormActive">${label}</button>`;
export const wildlifeObjective = (active) =>
  ({
    brief: 'Frame a visible animal or training sign',
    method: 'Choose the observation protocol',
    survey: `Observe ${active.habitatIndex === 0 ? 'A · Wooded edge' : 'B · Open edge'} with measured effort`,
    review: 'Compare effort and identification confidence',
    interpretation: 'Explain the paired checklists and their limits',
    complete: 'Paired habitat report saved'
  })[active.phase];
export function createWildlifeUI(options) {
  const stationLabel = (id) =>
    id === 'bench' ? 'Comparison bench' : id === 'a' ? 'Wooded plot A' : 'Open plot B';
  function view(active) {
    const study = WILDLIFE_STUDIES[active.variantId];
    let body = '',
      actions = '';
    if (active.phase === 'brief') {
      body = `<p>${esc(study.brief)}</p><p>Stand near plot A and face ${study.lead === 'animal' ? 'the deer beyond the FINISH marker' : 'the diagnostic signs on the raised soil tray'}. Keep the subject visible; this course does not collect or tame animals.</p>`;
      actions =
        '<button type="button" class="research-primary" data-research-action="world">Frame the field lead</button>';
    } else if (active.phase === 'method') {
      body =
        `<p>The field lead is recorded. Two contrasting virtual plots share the same short protocol. Only active, supported, visible world time counts. Hidden or paused time is excluded; reload keeps filed checklists and restarts an unfinished observation.</p>` +
        form(
          'method',
          select(
            'method',
            'Observation protocol',
            Object.fromEntries(study.methods.map((id) => [id, WILDLIFE_METHODS[id].label]))
          )
        );
      actions = submit('Use this protocol in both habitats');
    } else if (active.phase === 'survey') {
      const method = WILDLIFE_METHODS[active.method],
        id = active.habitatIndex === 0 ? 'a' : 'b';
      body = `<p>${esc(method.label)} · minimum ${method.seconds} active seconds.</p><p>${method.minimumDistance ? 'Enter the START stakes, begin the instrument, then walk straight through the plot to FINISH. Cover 5–8 m without leaving the marked corridor. Turn your view toward the animal or sign while observing.' : 'Begin at the centre marker. ' + (active.method === 'stationary-watch' ? 'Stay still and keep the animal in view. Moving more than 0.8 m interrupts the watch.' : 'Aim at the path beyond FINISH and align the mounted sensor. A 60° cone, clear line of sight and actual animal movement govern detections.')}</p>${active.method === 'track-photo' ? `<p>Photograph the split hoof or canid paw structures on this habitat’s soil tray. Keep the image with its measured transect. ${active.captures[`habitat-${id}`] ? 'Photograph saved.' : 'Photograph required.'}</p>` : ''}<p>File this observation at its plot before moving on. A failed save keeps the measured result ready to retry.</p>`;
      actions =
        '<button type="button" class="research-primary" data-research-action="world">Return to field instruments</button>';
    } else if (active.phase === 'review') {
      body =
        '<p>Retain what was actually observed. A non-detection is “not observed”, never proof of absence. Sign shape may support a group without dating the track or establishing an exact maker.</p>' +
        wildlifeChecklistMarkup(active.surveys);
      if (wildlifeEffortComparison(active).sameInstrument === false)
        body +=
          '<p>The sensor windows used different timing rules. Repeat both with one protocol before comparing detections.</p>';
      let fields = select('effortComparison', 'Compare duration, distance and method', {
        matched: 'Comparable effort',
        'unequal-effort': 'Unequal effort · do not compare counts directly'
      });
      for (const id of ['a', 'b']) {
        const choices = {
          unresolved: 'Unresolved',
          ...Object.fromEntries(
            active.surveys[id].observations.map((row) => [
              row.taxon,
              row.taxon.replaceAll('-', ' ')
            ])
          )
        };
        fields +=
          `<fieldset><legend>${id === 'a' ? 'Wooded plot A' : 'Open plot B'}</legend>` +
          select(`taxon-${id}`, 'Supported identification', choices) +
          select(`confidence-${id}`, 'Confidence', {
            confident: 'Confident visual identification',
            tentative: 'Tentative · retain uncertainty',
            'not-observed': 'Not observed during this effort'
          }) +
          '</fieldset>';
      }
      body += form('identify', fields);
      actions = submit('Save evidence review');
    } else if (active.phase === 'interpretation') {
      body =
        wildlifeChecklistMarkup(active.surveys, active.identifications) +
        `<p>Recorded effort: ${esc(wildlifeEffortComparison(active).status)}. Explain this pair without extending a short virtual exercise into a population or habitat-preference claim.</p>` +
        form(
          'report',
          select('coverContrast', 'Actual contrast', {
            'wooded-versus-open': 'Tree and shrub cover versus low open cover',
            'identical-habitat': 'Identical cover'
          }) +
            select('interpretation', 'Supported result', {
              'paired-observations-only': 'Describe this pair only',
              inconclusive: 'Inconclusive · keep the records'
            }) +
            select('limitation', 'Limit on the method', {
              'short-pair-not-population': 'Short pair cannot establish a population',
              'signs-do-not-date-presence': 'Persistent signs do not date current presence',
              'detections-not-individuals': 'Detection events are not different individuals'
            }) +
            select('followUp', 'Useful next comparison', {
              'repeat-same-method-other-time': 'Repeat the same method at another time',
              'compare-fresh-evidence': 'Compare with fresh independent evidence',
              'repeat-sensors-longer': 'Repeat matched sensor windows for longer',
              'repeat-matching-effort': 'Repeat with matching effort first'
            })
        );
      actions = submit('Save paired habitat report');
    } else {
      body =
        `<h3>${esc(study.label)} · complete</h3><p>${esc(active.report.conclusion)}</p>` +
        wildlifeChecklistMarkup(active.surveys, active.identifications) +
        '<p>The Journal keeps both checklists, confidence, behavior and detection records, actual effort, limits and any sign photographs.</p>';
      actions =
        '<button type="button" data-research-journal>View Journal</button><button type="button" data-research-next>Choose next study</button>';
    }
    return { title: wildlifeObjective(active), body, actions };
  }
  const shell = createResearchStationShell({
    ...options,
    careerId: 'wildlife',
    label: 'Wildlife ecologist',
    target: wildlifeTarget,
    objective: wildlifeObjective,
    stationLabel,
    view,
    onCommand(type, fields, active, { perform, close }) {
      if (type === 'world') {
        options.tools.enter();
        close();
        return;
      }
      let command = { type, ...fields };
      if (type === 'identify')
        command = {
          type,
          effortComparison: fields.effortComparison,
          identifications: Object.fromEntries(
            ['a', 'b'].map((id) => [
              id,
              { taxon: fields[`taxon-${id}`], confidence: fields[`confidence-${id}`] }
            ])
          )
        };
      void perform(command);
    }
  });
  const toolbar = document.createElement('aside');
  toolbar.className = 'field-photo-toolbar wildlife-instruments';
  toolbar.setAttribute('aria-label', 'Wildlife field instruments');
  toolbar.innerHTML =
    '<p data-wildlife-effort></p><div></div><p role="status" aria-live="polite"></p>';
  shell.mountTools(toolbar);
  let cursor = '',
    disposed = false;
  const status = toolbar.querySelector('[role=status]');
  toolbar.onclick = async (event) => {
    const button = event.target.closest('[data-wildlife-tool]');
    if (!button || options.tools.busy) return;
    const kind = button.dataset.wildlifeTool;
    status.textContent = '';
    try {
      if (kind === 'eye') options.tools.enter();
      else if (kind === 'start') options.tools.start();
      else if (kind === 'align') status.textContent = options.tools.align();
      else await options.tools.perform(kind, button.dataset.slot);
      if (['inspect', 'record', 'photo'].includes(kind)) {
        status.textContent = 'Field record saved.';
        shell.refresh();
      }
      options.requestWorldFocus?.();
    } catch (error) {
      status.textContent = error.message || 'The field record could not save. Try again.';
    }
    update();
  };
  function update() {
    shell.update();
    const a = options.getState().active,
      id = a.habitatIndex === 0 ? 'a' : 'b',
      s = options.tools.snapshot(),
      effort = s.effort;
    toolbar.hidden = disposed || !['brief', 'survey'].includes(a.phase) || shell.isOpen();
    if (toolbar.hidden) return;
    const next = [
      a.phase,
      a.habitatIndex,
      a.method,
      !!effort?.complete,
      !!effort?.interrupted,
      !!a.captures[`habitat-${id}`]
    ].join(':');
    if (cursor !== next || !toolbar.querySelector('button')) {
      let buttons = '<button type="button" data-wildlife-tool="eye">Eye-level view</button>';
      if (a.phase === 'brief')
        buttons +=
          '<button type="button" class="research-primary" data-wildlife-tool="inspect">Record visible lead</button>';
      else {
        if (a.method === 'trail-camera')
          buttons +=
            '<button type="button" data-wildlife-tool="align">Align mounted sensor</button>';
        if (a.method === 'track-photo' && !a.captures[`habitat-${id}`])
          buttons += `<button type="button" data-wildlife-tool="photo" data-slot="habitat-${id}">Photograph sign</button>`;
        buttons += `<button type="button" data-wildlife-tool="start">${effort ? 'Restart' : 'Begin'} observation</button><button type="button" class="research-primary" data-wildlife-tool="record"${!effort?.complete || effort?.interrupted ? ' disabled' : ''}>File measured checklist</button>`;
      }
      toolbar.querySelector('div').innerHTML = buttons;
      cursor = next;
    }
    toolbar.querySelector('[data-wildlife-effort]').textContent =
      a.phase === 'brief'
        ? 'Face the highlighted field lead, then record what is visible.'
        : effort
          ? `${effort.activeSeconds.toFixed(1)} / ${effort.targetSeconds} active s · ${effort.distanceMeters.toFixed(1)} m · ${effort.observations.length} evidence records. ${effort.reason}`
          : 'Instrument ready. Begin at this protocol’s marked start.';
    for (const button of toolbar.querySelectorAll('button'))
      button.disabled =
        !!options.tools.busy ||
        (button.dataset.wildlifeTool === 'record' && (!effort?.complete || effort.interrupted));
  }
  return {
    ...shell,
    update,
    dispose() {
      disposed = true;
      shell.dispose();
      toolbar.remove();
    }
  };
}
