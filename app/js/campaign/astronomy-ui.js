import { createResearchStationShell } from './research-station-shell.js';
import { researchText as esc, researchSelect as select } from '../ui/research-markup.js';
import {
  ASTRONOMY_STUDIES,
  astronomyTarget,
  astronomyFrameRole,
  astronomyExposurePlan,
  astronomyAnalysis,
} from './astronomy-career.js';
import {
  ASTRONOMY_OUTCOMES,
  astronomySourceMarkup,
  astronomyFrameMarkup,
  astronomyComparisonMarkup,
  astronomyLimitsMarkup,
  astronomyReportMarkup,
} from './astronomy-report.js';
export const astronomyStationLabel = (id) =>
  id === 'a' ? 'Telescope A' : id === 'b' ? 'Detector control B' : 'Observing-log bench C';
const objective = (a) =>
  ({
    align: 'Align the working telescope',
    configure: 'Choose the exposure',
    primary: 'Record the first exposure',
    controls: a.frames.comparison
      ? 'Take the covered-detector control'
      : 'Take the comparison exposure',
    analyze: 'Compare with the cited catalog',
    publish: 'Publish the observing log',
    complete: 'Observing log saved',
  })[a.phase];
export function createAstronomyUI(options) {
  const form = (type, body) =>
      `<form id='astronomyFormActive' data-research-form='${type}'>${body}</form>`,
    submit = (label) =>
      `<button type='submit' form='astronomyFormActive' class='research-primary'>${esc(label)}</button>`;
  const dials = () =>
    `<div class='astronomy-dials' aria-label='Telescope mount adjustments'>${[
      ['azimuth', 'Azimuth'],
      ['altitude', 'Elevation'],
    ]
      .map(
        ([axis, label]) =>
          `<fieldset><legend>${label}</legend>${[-0.5, -0.05, 0.05, 0.5].map((delta) => `<button type='button' data-research-action='turn' data-axis='${axis}' data-delta='${delta}' aria-label='${label} ${delta > 0 ? 'plus' : 'minus'} ${Math.abs(delta)} degrees'>${delta > 0 ? '+' : ''}${delta}°</button>`).join('')}</fieldset>`
      )
      .join('')}</div>`;
  function pointing(a, s) {
    return `<p>Catalog target: azimuth ${a.catalogDirection.azimuth.toFixed(2)}°, elevation ${a.catalogDirection.altitude.toFixed(2)}°. Actual mount: ${s.optics.azimuth.toFixed(2)}°, ${s.optics.altitude.toFixed(2)}°. Separation ${s.errorDegrees.toFixed(3)}° (within 0.15° required). Aperture ${s.optics.clear ? 'clear' : s.optics.covered ? 'covered' : 'blocked by visible geometry'}.</p>`;
  }
  function view(a) {
    const s = options.tools.snapshot(),
      r = s.window,
      role = astronomyFrameRole(a),
      plan = role && astronomyExposurePlan(a, role);
    let body = `<p>${esc(ASTRONOMY_STUDIES[a.variantId].question)}</p>`,
      actions = '';
    if (a.phase === 'align') {
      body +=
        astronomySourceMarkup(a) +
        `<p>Turn the actual telescope mount to the catalog target. These are supplied simulated observing conditions at the saved reference time; the detector will generate stated noise rather than take a sky photograph.</p>` +
        pointing(a, s) +
        dials();
      actions = `<button type='button' data-research-action='align' class='research-primary'>Save physical alignment</button>`;
    } else if (a.phase === 'configure') {
      body +=
        `<p>One telescope supplies the first image, repeat image and closed-shutter control. Stay beside the marked instrument during each exposure; pausing, a blocked aperture or leaving support stops the clock.</p>` +
        form(
          'configure',
          select(
            'seconds',
            'Exposure duration',
            a.variantId === 'exposure-bracket'
              ? { 8: '8 seconds · clipping trial; follow with 2 seconds' }
              : {
                  2: '2 seconds · matched pair and control',
                  1: '1 second · matched pair and control',
                }
          )
        );
      actions = submit('Save exposure settings');
    } else if (role) {
      body += `<p>${role === 'primary' ? 'First exposure' : role === 'comparison' ? 'Second exposure' : 'Closed-shutter control'} · ${plan.seconds} active seconds. ${a.variantId === 'detector-dither' && role === 'comparison' ? 'The actual mount shifts the sky by about four detector pixels; a detector defect stays fixed.' : ''} ${role === 'dark' ? 'The same physical cover now blocks incoming light.' : 'The actual aperture must remain open and unobstructed.'}</p>`;
      if (r?.ready) {
        body +=
          astronomyFrameMarkup(r.image, 'Unsaved detector exposure') +
          `<p>This completed buffer stays unchanged if saving fails. Save it before taking another exposure.</p>`;
        actions = `<button type='button' data-research-action='expose' class='research-primary'>Save exposure</button>`;
      } else {
        body += `<p>${r ? `${r.activeSeconds.toFixed(2)} / ${r.targetSeconds} active seconds. ${esc(r.reason)}` : 'Begin the exposure, then inspect the physical detector display beside the instrument.'}</p>`;
        actions = `<button type='button' data-research-action='begin' class='research-primary'>${r?.interrupted || r?.complete ? 'Restart exposure' : r ? 'Continue exposure' : 'Begin exposure'}</button>`;
      }
    } else if (a.phase === 'analyze') {
      const analysis = astronomyAnalysis(a),
        rows = { ...a, analysis };
      body +=
        astronomySourceMarkup(a) +
        `<div class='astronomy-frames'>${Object.entries(a.frames)
          .map(([k, f]) => astronomyFrameMarkup(f, k))
          .join('')}</div>` +
        astronomyComparisonMarkup(rows) +
        form(
          'analyze',
          select('catalogHip', 'Compare with catalog object', {
            [a.target.hip]: `${a.target.name} · HIP ${a.target.hip}`,
            0: 'Unidentified object',
          }) +
            select('outcome', 'What do the retained measurements support?', ASTRONOMY_OUTCOMES) +
            select('limit', 'Scope of this result', {
              'synthetic-not-calibrated-sky-discovery':
                'Catalog and synthetic detector exercise; no calibrated sky discovery',
              'new-object-discovered': 'A new celestial object was discovered',
            })
        );
      actions = submit('Save comparison');
    } else if (a.phase === 'publish') {
      body +=
        astronomyComparisonMarkup(a) +
        astronomyLimitsMarkup() +
        `<p>Publish all three original frames, their controls, source and noise limits to your Journal. The result remains reviewable at this observatory.</p>`;
      actions = `<button type='button' data-research-action='publish' class='research-primary'>Publish observing log</button>`;
    } else {
      body += astronomyReportMarkup(a.report).replace(
        "class='astronomy-report'",
        "class='astronomy-report' open"
      );
      actions = `<button type='button' data-research-journal>View Journal</button><button type='button' data-research-next class='research-primary'>Choose next study</button>`;
    }
    return { title: objective(a), body, actions };
  }
  const shell = createResearchStationShell({
    ...options,
    careerId: 'astronomy',
    label: 'Astronomer',
    target: astronomyTarget,
    objective,
    stationLabel: astronomyStationLabel,
    view,
    onCommand(type, fields, a, { perform, close, feedback, render }) {
      if (type === 'turn') {
        try {
          options.tools.turn(
            fields.axis === 'azimuth' ? Number(fields.delta) : 0,
            fields.axis === 'altitude' ? Number(fields.delta) : 0
          );
          render();
        } catch (e) {
          feedback(e.message);
        }
        return;
      }
      if (type === 'begin') {
        try {
          const r = options.tools.snapshot().window;
          options.tools.start({ restart: !!(r?.interrupted || r?.complete) });
          close();
        } catch (e) {
          feedback(e.message);
        }
        return;
      }
      const command =
        type === 'analyze'
          ? {
              type,
              catalogHip: Number(fields.catalogHip),
              outcome: fields.outcome,
              limit: fields.limit,
            }
          : { type, ...fields };
      void perform(() => options.tools.prepare(command));
    },
  });
  const toolbar = document.createElement('aside');
  toolbar.className = 'field-photo-toolbar astronomy-instruments';
  toolbar.setAttribute('aria-label', 'Observing exposure');
  toolbar.innerHTML = `<p data-astronomy-effort></p><div><button type='button' data-astronomy-open class='research-primary'>Open detector</button></div>`;
  shell.mountTools(toolbar);
  toolbar.querySelector('button').onclick = () => shell.open();
  let disposed = false;
  function update() {
    shell.update();
    const a = options.getState().active,
      r = options.tools.snapshot().window;
    toolbar.hidden = disposed || !astronomyFrameRole(a) || shell.isOpen();
    if (toolbar.hidden) return;
    toolbar.querySelector('[data-astronomy-effort]').textContent = r
      ? `${r.activeSeconds.toFixed(2)} / ${r.targetSeconds} active s · ${r.reason}`
      : 'Set up the next detector exposure.';
    toolbar.querySelector('button').textContent = r?.ready
      ? 'Review and save exposure'
      : 'Open detector';
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
