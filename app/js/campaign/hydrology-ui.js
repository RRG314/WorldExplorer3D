import { createResearchStationShell } from './research-station-shell.js';
import { researchText as esc, researchSelect as select } from '../ui/research-markup.js';
import { HYDROLOGY_STUDIES, hydrologyTarget, hydrologyComparison } from './hydrology-career.js';
import { HYDROLOGY_REFERENCE } from './hydrology-reference.js';
import {
  hydrologyMeasurementMarkup,
  hydrologyComparisonMarkup,
  hydrologyReferenceMarkup,
  hydrologyReportMarkup,
} from './hydrology-report.js';
export const hydrologyStationLabel = (id) =>
  id === 'bench'
    ? 'Catchment comparison bench'
    : id === 'a'
      ? 'Upstream dry bank A'
      : 'Downstream dry bank B';
const objective = (a) =>
  ({
    trace: 'Trace the visible stream',
    measure: 'Measure both dry bank stations',
    context: 'Compare the catchment and dated gauge',
    declare: 'Declare the training return',
    revisit: 'Repeat the matched station protocol',
    report: 'Separate change from its cause',
    complete: 'Watershed plate saved',
  })[a.phase];
export function createHydrologyUI(options) {
  const form = (type, body) =>
      `<form id="hydrologyFormActive" data-research-form="${type}">${body}</form>`,
    submit = (label) =>
      `<button type="submit" form="hydrologyFormActive" class="research-primary">${esc(label)}</button>`;
  function view(a) {
    const study = HYDROLOGY_STUDIES[a.variantId],
      id = hydrologyTarget(a),
      r = options.tools.snapshot().window;
    let body = `<p>${esc(study.question)}</p>`,
      actions = '';
    if (['trace', 'measure', 'revisit'].includes(a.phase)) {
      body += `<p>${esc(hydrologyStationLabel(id))} · stay on the bank. This supported training reach is a virtual flume; its flow, particles and rectangular section are simulated, not local river measurements.</p>`;
      if (!r?.ready || r.stationId !== id) {
        body +=
          a.phase === 'trace'
            ? '<p>Use the eye-level view. Aim at the visible metre-gate float, then keep its actual movement in view for at least two active seconds.</p>'
            : '<p>Release three floats at the one-metre gates and keep the observer at this bank. The instrument records each transit and three nine-path optical samples. Allow at least eight active seconds and all three transits.</p>';
        actions =
          '<button type="button" data-research-action="begin" class="research-primary">Release floats and observe</button>';
      } else if (a.phase === 'trace') {
        body += form(
          'trace',
          select('flowDirection', 'Observed float direction', {
            'upstream-to-downstream': 'From A toward B',
            'downstream-to-upstream': 'From B toward A',
          }) +
            select('stations', 'Sampling positions', {
              'dry-bank-a-and-b': 'Both marked dry bank stations',
              'inside-channel': 'Inside the flow channel',
            })
        );
        actions = submit('Save reach and bank plan');
      } else {
        body +=
          hydrologyMeasurementMarkup(r) +
          form(
            'measure',
            select('flowUnit', 'Volume flow unit', {
              'm3/s': 'Cubic metres per second (m³/s)',
              'm/s': 'Metres per second (m/s)',
            }) +
              select('clarityMeaning', 'What does the optical reading measure?', {
                'virtual-obstruction-not-calibrated-ntu':
                  'Virtual beam obstruction; not calibrated NTU',
                'calibrated-ntu': 'Calibrated river turbidity in NTU',
              })
          );
        actions = submit('Save matched station reading');
      }
    } else if (a.phase === 'context') {
      body +=
        `<p>Compare the physical catchment model: ${study.catchment.map((v) => esc(v.replaceAll('-', ' '))).join(' / ')}. Its margins are authored training context, not a mapped catchment survey.</p>` +
        hydrologyReferenceMarkup(HYDROLOGY_REFERENCE) +
        form(
          'context',
          select('catchment', 'What does the catchment model establish?', {
            'authored-margins-not-a-source-test':
              'Authored margins; no pollution source was tested',
            'road-pollution-proven': 'Road pollution was proved',
          }) +
            select('publicLimit', 'How do the archived gauge records apply?', {
              'different-river-and-dates': 'Different river and dates; context only',
              'same-current-stations': 'The same current training stations',
            })
        );
      actions = submit('Save catchment and dated context');
    } else if (a.phase === 'declare') {
      body +=
        `<p>Declare <strong>${esc(study.condition.replaceAll('-', ' '))}</strong>, then return to exactly the same two bank points. This changes only the training instruments; it does not change live weather.</p>` +
        form(
          'declare',
          select('condition', 'Declared return condition', {
            [study.condition]: study.condition.replaceAll('-', ' '),
          })
        );
      actions = submit('Declare virtual return');
    } else if (a.phase === 'report') {
      body +=
        hydrologyComparisonMarkup(hydrologyComparison(a)) +
        form(
          'report',
          select('flowResult', 'Paired flow evidence', {
            'increased-at-both-stations': 'Flow increased at both stations',
            'decreased-at-both-stations': 'Flow decreased at both stations',
            'mixed-or-overlapping-flow': 'Mixed or overlapping flow envelopes',
          }) +
            select('cause', 'What does this establish about the source?', {
              'change-observed-source-unestablished':
                'Change recorded; its source remains unestablished',
              'road-runoff-proven': 'A road-runoff source was proved',
            }) +
            select('followUp', 'Next investigation', {
              'repeat-matched-stations-and-source-measurements':
                'Repeat matched stations and source measurements',
              'unmatched-casual-count': 'Use an unmatched casual look',
            })
        );
      actions = submit('Save watershed plate');
    } else {
      body += hydrologyReportMarkup(a.report).replace(
        'class="hydrology-report"',
        'class="hydrology-report" open'
      );
      actions =
        '<button type="button" data-research-journal>View Journal</button><button type="button" data-research-next class="research-primary">Choose next study</button>';
    }
    return { title: objective(a), body, actions };
  }
  const shell = createResearchStationShell({
    ...options,
    careerId: 'hydrology',
    label: 'Hydrologist',
    target: hydrologyTarget,
    objective,
    stationLabel: hydrologyStationLabel,
    view,
    onCommand(type, fields, a, { perform, close, feedback }) {
      if (type === 'begin') {
        try {
          options.tools.start();
          close();
        } catch (e) {
          feedback(e.message);
        }
        return;
      }
      let command = { type, ...fields };
      if (type === 'context') command.reference = HYDROLOGY_REFERENCE;
      if (type === 'declare') command.truthType = 'declared-virtual-return';
      void perform(() => options.tools.prepare(command));
    },
  });
  const toolbar = document.createElement('aside');
  toolbar.className = 'field-photo-toolbar hydrology-instruments';
  toolbar.setAttribute('aria-label', 'Stream instruments');
  toolbar.innerHTML =
    '<p data-hydro-effort></p><div><button type="button" data-hydro-eye>Eye-level view</button><button type="button" data-hydro-start>Release floats</button><button type="button" data-hydro-open class="research-primary">Open measured reading</button></div><p role="status" aria-live="polite"></p>';
  shell.mountTools(toolbar);
  let disposed = false;
  toolbar.onclick = (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    const status = toolbar.querySelector('[role=status]');
    status.textContent = '';
    try {
      if (button.hasAttribute('data-hydro-eye')) options.tools.enter();
      else if (button.hasAttribute('data-hydro-start')) options.tools.start();
      else shell.open();
      options.requestWorldFocus?.();
    } catch (error) {
      status.textContent = error.message;
    }
    update();
  };
  function update() {
    shell.update();
    const a = options.getState().active,
      r = options.tools.snapshot().window;
    toolbar.hidden =
      disposed || !['trace', 'measure', 'revisit'].includes(a.phase) || shell.isOpen();
    if (toolbar.hidden) return;
    toolbar.querySelector('[data-hydro-effort]').textContent = r
      ? `${r.activeSeconds.toFixed(1)} active s · ${r.kind === 'measure' ? `${r.lanes.filter((l) => Number.isFinite(l.finishedAt)).length}/3 transits · ${r.optical.length}/3 optical samples · ` : ''}${r.reason}`
      : 'Aim at the marked stream reach. Effort counts only on the supported dry bank.';
    toolbar.querySelector('[data-hydro-open]').disabled = !r?.ready || r.interrupted;
    toolbar.querySelector('[data-hydro-start]').textContent = r
      ? 'Restart unfinished reading'
      : 'Release floats';
    toolbar.querySelector('[data-hydro-start]').disabled = !!r?.ready;
  }
  return {
    ...shell,
    update,
    dispose() {
      disposed = true;
      shell.dispose();
      toolbar.remove();
    },
  };
}
