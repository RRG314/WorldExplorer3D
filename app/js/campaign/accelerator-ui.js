import { createResearchStationShell } from './research-station-shell.js';
import { researchText as esc, researchSelect as select } from '../ui/research-markup.js';
import { acceleratorTarget } from './accelerator-career.js';
import { acceleratorStudy } from './accelerator-studies.js';
import { CERN_STATIONS, acceleratorTargetSite } from './cern-study-sites.js';
import { acceleratorReadingMarkup, acceleratorReportMarkup } from './accelerator-report.js';
import { hitSample, signatures } from '../../vendor/collision-lab/models.mjs';

export const acceleratorStationLabel = (id) =>
  CERN_STATIONS[acceleratorTargetSite(id)]?.[id]?.label || 'Recorded-data analysis';
const number = (name, label, value, min, max, step) =>
  `<label>${esc(label)}<input type='number' name='${name}' value='${value}' min='${min}' max='${max}' step='${step}' required></label>`;
const button = (action, label) =>
  `<button type='button' data-research-action='${action}' class='research-primary'>${label}</button>`;
const hitPlot = (hits) =>
  `<svg viewBox='0 0 440 250' role='img' aria-label='Generated training hits with position x and transverse displacement y in metres; use the labelled checkboxes below to choose measurements'><title>Choose a consistent curved track among the clutter</title><path d='M50 20V200H420M50 130H420' fill='none' stroke='#9ebdb5'/><g font-size='20' fill='currentColor'><text x='12' y='20'>y · m</text><text x='50' y='224'>0</text><text x='230' y='224'>1</text><text x='405' y='224'>2</text><text x='190' y='239'>x · metres</text>${hits.map((h) => `<circle data-hit-point='${h.id}' cx='${50 + h.x * 180}' cy='${130 - h.y * 200}' r='5' fill='#83bcc6'/><text x='${58 + h.x * 180}' y='${125 - h.y * 200}'>${h.id}</text>`).join('')}</g></svg>`;
export function createAcceleratorUI(options) {
  const { tools, getState } = options,
    objective = (a) =>
      a.phase === 'complete'
        ? 'Review your saved Collision Lab notebook'
        : a.phase === 'publish'
          ? 'Publish the reproducible comparison'
          : acceleratorStationLabel(a.phase);
  function view(a) {
    const study = acceleratorStudy(a.variantId),
      w = tools.snapshot().window,
      r = tools.reading();
    let body = `<p>${esc(study.question)}</p>`,
      actions = '';
    if (a.phase === 'orientation') {
      body += `<p>Walk through the distinct beam, RF and focusing rooms at Meyrin. Then use Travel to the separate CMS Point 5 surface site, descend by the visitor lift, follow the guarded detector route and use its analysis benches. Return by the same lift and exterior door.</p><p>These are virtual interpretive training rooms inside admitted mapped footprints. They are not surveyed operational rooms or a real access permit. Original educational beam models, generated hits and recorded CMS events remain distinct.</p>`;
      actions = button('orientation', 'Begin beam study');
    } else if (a.phase === 'complete') {
      body += acceleratorReportMarkup(a.report).replace(
        "class='accelerator-report'",
        "class='accelerator-report' open"
      );
      actions = `<button type='button' data-research-journal>View Journal</button><button type='button' data-research-next>Choose next study</button>`;
    } else if (a.phase === 'publish') {
      const list = a.measurements.population;
      body +=
        list.map((m) => acceleratorReadingMarkup(m.experiment)).join('') +
        `<p>The opposite- and same-charge populations use the identical ${study.cutGeV} GeV/c momentum cut. Retain both original counts and mass histograms, the individual event witness and observer control. This comparison does not establish a discovery, calibrated background or engineering performance.</p>`;
      actions = button('publish', 'Publish Collision Lab notebook');
    } else {
      const method = a.phase,
        prior = a.measurements[method] || [];
      let fields = '';
      if (method === 'bend') {
        body += `<p>Steer a positive-charge training particle with momentum ${study.momentumGeV} GeV/c to a ${study.radiusMeters} m radius in the marked bend direction (${study.caseIndex ? 'positive' : 'negative'} curvature). Choose field polarity and magnitude; compare the actual path and radius.</p>`;
        fields = number('fieldTesla', 'Magnetic field · T', 0, -3, 3, 0.01);
      }
      if (method === 'rf') {
        body += `<p>A particle starts at 20 MeV and crosses eight ideal 2 MV cavities. Set the phase to reach ${study.rfTargetMeV} ± 0.5 MeV. Watch the mounted readout for three active seconds; paused time does not count.</p>`;
        fields = number('phaseDegrees', 'RF phase · degrees', 90, 0, 180, 0.1);
      }
      if (method === 'focus') {
        body += `<p>Transport all 64 rays through the training optics. Alternate the quadrupoles and adjust both strengths. Keep every ray and compare both RMS widths; improving only one plane is insufficient.</p>`;
        fields =
          number('k1', 'First quadrupole strength', 0.5, 0, 2, 0.01) +
          number('k2', 'Second quadrupole strength', 0.5, 0, 2, 0.01) +
          select('alternating', 'Second orientation', {
            true: 'Alternating planes',
            false: 'Same orientation',
          });
      }
      if (method === 'signals') {
        body += `<p>${prior.length ? 'Now open additional chosen readouts and select an interpretation supported uniquely by those clues.' : 'First open only a subset that leaves at least two particle interpretations, with no particle chosen. Retain that ambiguity before revealing more.'} Layer selection changes the detector display; the surrounding machine barrier remains solid. Signal levels: 0 absent, 1 small, 2 strong.</p>`;
        fields =
          `<fieldset><legend>Readouts to open</legend>${['Tracker', 'Electromagnetic calorimeter', 'Hadronic calorimeter', 'Muon chambers'].map((label, i) => `<label><input type='checkbox' name='read${i}'>${label}</label>`).join('')}</fieldset>` +
          select('choice', 'Particle interpretation', {
            '-1': 'Keep ambiguous',
            ...Object.fromEntries(signatures.map((s, i) => [i, s.name])),
          });
      }
      if (method === 'track') {
        const hits = hitSample(study.caseIndex);
        body += hitPlot(hits);
        body += `<p>Select three to six displayed hits and inspect the fit. The completed record needs six consistent hits spanning more than 1.4 m, with RMS residual below 15 mm. Extra clutter is deliberately present. Do not select solely by a hit's letter.</p>`;
        fields = `<div class='accelerator-hit-table'><table><caption>Generated training hits · metres</caption><thead><tr><th>Hit</th><th>x</th><th>y</th></tr></thead><tbody>${hits.map((h) => `<tr><td><label><input type='checkbox' name='hit${h.id}'>${h.id}</label></td><td>${h.x.toFixed(2)}</td><td>${h.y.toFixed(3)}</td></tr>`).join('')}</tbody></table></div>`;
      }
      if (method === 'mass') {
        body += `<p>${prior.length ? 'Change the observer by at least 0.005 in β along the recorded pair momentum to approach its rest frame. Compare energy, longitudinal momentum and the unchanged invariant mass.' : 'First record β = 0 in the original laboratory frame.'} This loads and checks the locally bundled 100,000-row CMS source before using the retained event witness. Raw four-vectors are never modified.</p>`;
        fields = number('beta', 'Observer speed · β = v/c', 0, 0, 0.999999, 0.000001);
      }
      if (method === 'population') {
        body += `<p>${prior.length ? 'Now record the same-charge control.' : 'First record opposite-charge pairs.'} Both muons must each reach at least ${study.cutGeV} GeV/c transverse momentum for both selections. Compare the full population and original 55-bin invariant-mass histogram; do not change the cut between samples.</p>`;
        fields = select('charge', 'Charge selection', {
          opposite: 'Opposite charge',
          same: 'Same charge',
        });
      }
      if (prior.length)
        body += `<section><h3>Retained control</h3>${prior.map((m) => acceleratorReadingMarkup(m.experiment)).join('')}</section>`;
      if (method === 'focus')
        body += `<p>The mounted chart retains all 64 original model paths. Its 5 m longitudinal range fits a 2 m tabletop; transverse positions are enlarged 20 times for visibility. The moving light follows the first original ray.</p>`;
      if (['signals', 'mass', 'population'].includes(method))
        body += `<p>The moving light reads the mounted chart during observation; it is not a simulated detector-particle trajectory.</p>`;
      body += `<form id='accelerator-form' data-research-form='run'>${fields}</form>`;
      if (r?.method === method)
        body +=
          acceleratorReadingMarkup(r) +
          (r.method === 'signals'
            ? `<p>Opened values: ${r.readings.opened.map((x) => `${x.index + 1}: ${x.value}`).join(' · ')}. Compatible: ${r.readings.possible.map((i) => esc(signatures[i].name)).join(', ')}.</p>`
            : '');
      if (w?.ready) {
        const saveable =
          r.accepted ||
          (method === 'signals' &&
            !prior.length &&
            r.readings.possible.length > 1 &&
            r.inputs.choice === -1) ||
          (method === 'mass' && !prior.length && r.inputs.beta === 0);
        body += `<p>${saveable ? 'The working display is ready to retain.' : 'These settings do not yet meet the comparison. Adjust the instrument and run again.'}</p>`;
        if (saveable) actions += button('measure', 'Save measured experiment');
      }
      actions += `<button type='submit' form='accelerator-form'>${w?.ready ? 'Adjust and run again' : 'Set instrument and observe'}</button>`;
    }
    return { title: objective(a), body, actions };
  }
  const shell = createResearchStationShell({
    ...options,
    careerId: 'accelerator',
    label: 'Accelerator scientist',
    siteLabel: 'CERN virtual training',
    target: acceleratorTarget,
    objective,
    stationLabel: acceleratorStationLabel,
    view,
    afterRender(body) {
      for (const input of body.querySelectorAll('input[name^="hit"]'))
        input.onchange = () =>
          body
            .querySelector('[data-hit-point="' + input.name.slice(3) + '"]')
            ?.setAttribute('fill', input.checked ? '#efd079' : '#83bcc6');
    },
    onCommand(type, fields, a, { perform, close, feedback }) {
      if (type === 'run') {
        const method = a.phase,
          study = acceleratorStudy(a.variantId),
          inputs =
            method === 'bend'
              ? { fieldTesla: Number(fields.fieldTesla) }
              : method === 'rf'
                ? { phaseDegrees: Number(fields.phaseDegrees) }
                : method === 'focus'
                  ? {
                      k1: Number(fields.k1),
                      k2: Number(fields.k2),
                      alternating: fields.alternating === 'true',
                    }
                  : method === 'signals'
                    ? {
                        revealed: [0, 1, 2, 3].filter((i) => fields['read' + i]),
                        choice: Number(fields.choice),
                      }
                    : method === 'track'
                      ? {
                          selected: hitSample(study.caseIndex)
                            .filter((h) => fields['hit' + h.id])
                            .map((h) => h.id),
                        }
                      : method === 'mass'
                        ? { beta: Number(fields.beta) }
                        : { cutGeV: study.cutGeV, charge: fields.charge };
        feedback('Setting the working instrument…');
        void tools
          .run(inputs)
          .then(() => close())
          .catch((e) => feedback(e.message));
        return;
      }
      const command =
        type === 'orientation'
          ? { type, scope: 'virtual-interpretive-not-access-permit' }
          : type === 'publish'
            ? { type, limit: 'recorded-comparison-not-discovery-or-engineering' }
            : () => ({ type, measurement: tools.record() });
      void perform(command);
    },
  });
  const status = document.createElement('p'),
    travel = document.createElement('button');
  status.setAttribute('aria-live', 'polite');
  travel.type = 'button';
  travel.textContent = 'Travel to the next CERN site';
  travel.addEventListener('click', () => options.onTravel());
  shell.mountTools(status);
  shell.mountTools(travel);
  return {
    ...shell,
    update() {
      shell.update();
      const w = tools.snapshot().window,
        e = w?.effort;
      status.textContent = w?.pending
        ? 'Loading the selected experiment…'
        : w?.ready
          ? 'Instrument ready. Open the station to save or compare.'
          : e
            ? `${e.activeSeconds.toFixed(1)} / 3 active seconds · ${e.reason}`
            : options.atTargetSite() && !options.isInside()
              ? 'Walk to the marked building entrance and enter the virtual training rooms.'
              : '';
      travel.hidden = options.atTargetSite();
      travel.textContent =
        acceleratorTargetSite(acceleratorTarget(getState().active)) === 'cms-point-five'
          ? 'Travel to CMS Point 5'
          : 'Travel to Meyrin reception';
    },
  };
}
