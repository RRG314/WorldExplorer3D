import { createResearchStationShell } from './research-station-shell.js';
import { researchText as esc, researchSelect as select } from '../ui/research-markup.js';
import { METEOROLOGY_STUDIES, meteorologyTarget } from './meteorology-career.js';
import {
  meteorologyTimeLabel,
  meteorologySourceMarkup,
  meteorologyMeasurementMarkup,
  meteorologyPairMarkup,
  meteorologyForecastMarkup,
  meteorologyReportMarkup,
} from './meteorology-report.js';
export const meteorologyStationLabel = (id) =>
  id === 'a' ? 'Open training mast A' : id === 'b' ? 'Shelter comparison mast B' : 'Forecast bench';
const objective = (a) =>
  ({
    source: 'Identify the weather source and its age',
    deploy: 'Deploy the working virtual sensor',
    compare: 'Compare a second station',
    forecast: 'Record the forecast before comparison',
    verify: 'Verify the saved forecast',
    report: 'Retain the forecast and its errors',
    complete: 'Forecast card saved',
  })[a.phase];
export function createMeteorologyUI(options) {
  const form = (type, body) =>
      `<form id='meteorologyFormActive' data-research-form='${type}'>${body}</form>`,
    submit = (label) =>
      `<button type='submit' form='meteorologyFormActive' class='research-primary'>${esc(label)}</button>`,
    numeric = (name, label, value, min, max, step = 1) =>
      `<label>${esc(label)}<input type='number' name='${name}' value='${value}' min='${min}' max='${max}' step='${step}' required></label>`;
  function view(a) {
    const study = METEOROLOGY_STUDIES[a.variantId],
      id = meteorologyTarget(a),
      r = options.tools.snapshot().window;
    let body = `<p>${esc(study.question)}</p>`,
      actions = '';
    if (a.phase === 'source') {
      body +=
        meteorologySourceMarkup(options.tools.source()) +
        `<p>The supplied replay instruments are separate from the public weather source. They let you record and test a forecast when live observations are missing. Neither a weather panel nor a numerical forecast counts as a measured station observation.</p>` +
        form(
          'source-check',
          select('classification', 'What is the existing weather source?', {
            'forecast-model': 'A numerical forecast model',
            'manual-simulation': 'Manual weather simulation',
            unavailable: 'Unavailable',
            'unidentified-source': 'Unidentified source',
          }) +
            select('ageBand', 'Age since the provider issued the data', {
              'under-one-hour': 'Under one hour',
              'one-to-six-hours': 'One to six hours',
              'over-six-hours': 'Over six hours',
              'not-available': 'Issue time or age not supplied',
            }) +
            select('plan', 'Comparison method', {
              'explicit-simulated-replay': 'Run the explicitly simulated training replay',
            })
        );
      actions =
        `<button type='button' data-research-action='refresh-source'>Refresh source check</button>` +
        submit('Save source plan');
    } else if (['deploy', 'compare', 'verify'].includes(a.phase)) {
      const reference = study.referenceTime + (a.phase === 'verify' ? 3600000 : 0);
      body += `<p>${esc(meteorologyStationLabel(id))} · replay reference ${esc(meteorologyTimeLabel(reference))}. Both stations use this same virtual period. Readings are not simultaneous live observations. Cups and vane measure the replay; the miniature sky is a training display, separate from the surrounding real-place sky.</p>`;
      if (a.phase === 'verify') body += meteorologyForecastMarkup(a.forecast);
      if (!r?.ready) {
        body += `<p>Deploy the cup anemometer and inspect its moving gold cup, wind vane and miniature sky. Stay at this marker for eight active seconds. Three actual rotor, vane, sky and shelter samples are retained. Pausing stops instrument motion and effort.</p>`;
        actions = `<button type='button' data-research-action='begin' class='research-primary'>Deploy sensor and observe</button>`;
      } else {
        body +=
          meteorologyMeasurementMarkup(r) +
          form(
            'measure',
            select('windMeaning', 'What does the vane bearing mean?', {
              'from-true-north': 'Direction the wind comes from, clockwise from true north',
              'toward-true-north': 'Direction the wind travels toward',
            }) +
              select('speedUnit', 'Cup speed unit', {
                'm/s': 'Metres per second (m/s)',
                'km/h': 'Kilometres per hour',
              }) +
              select('cloudCue', 'Miniature replay sky cue', {
                'mostly-clear': 'Mostly clear: fewer than three covered cells',
                patchy: 'Patchy: three to six covered cells',
                overcast: 'Overcast: seven to nine covered cells',
              })
          );
        actions = submit('Save matched reading');
      }
    } else if (a.phase === 'forecast') {
      body +=
        meteorologyPairMarkup(a.readings.baseline, 'Baseline replay') +
        `<p>Forecast the open mast A for the next replay hour. Save a speed interval, wind-from sector and cloud trend before that period is revealed. A miss remains a useful result. Low portable training masts and the illustrative shelter are not equivalent to public open 10 m wind products.</p>` +
        form(
          'forecast',
          numeric('speedLow', 'Lowest predicted speed (m/s)', 3, 0, 25, 0.1) +
            numeric('speedHigh', 'Highest predicted speed (m/s)', 5, 0, 25, 0.1) +
            numeric('directionFrom', 'Predicted wind-from centre (degrees true)', 270, 0, 359, 1) +
            numeric(
              'directionHalfwidth',
              'Direction tolerance either side (degrees)',
              45,
              5,
              90,
              1
            ) +
            select('cloudTrend', 'Predicted miniature sky change', {
              similar: 'Similar within one cell',
              more: 'More cloud cover',
              less: 'Less cloud cover',
            })
        );
      actions = submit('Save forecast & start replay');
    } else if (a.phase === 'report') {
      body +=
        meteorologyForecastMarkup(a.forecast) +
        meteorologyPairMarkup(a.readings.verification, 'Comparison replay') +
        form(
          'report',
          select('outcome', 'How did the recorded forecast verify?', {
            'within-all-bounds': 'Speed, direction and sky stayed within the saved predictions',
            'one-or-more-missed': 'At least one saved prediction missed',
          }) +
            select('limit', 'What does this verification establish?', {
              'replay-not-public-forecast-validation':
                'Training replay result; no public forecast or live weather was validated',
              'public-forecast-validated': 'Public forecast accuracy was proved',
            }) +
            select('followUp', 'Next investigation', {
              'repeat-matched-time-and-independent-observations':
                'Repeat matched times and independently calibrated observations',
              'replace-issued-forecast': 'Replace the old forecast with what happened',
            })
        );
      actions = submit('Save forecast card');
    } else {
      body += meteorologyReportMarkup(a.report).replace(
        "class='meteorology-report'",
        "class='meteorology-report' open"
      );
      actions = `<button type='button' data-research-journal>View Journal</button><button type='button' data-research-next class='research-primary'>Choose next study</button>`;
    }
    return { title: objective(a), body, actions };
  }
  const shell = createResearchStationShell({
    ...options,
    careerId: 'meteorology',
    label: 'Meteorologist',
    target: meteorologyTarget,
    objective,
    stationLabel: meteorologyStationLabel,
    view,
    onCommand(type, fields, a, { perform, close, feedback, render }) {
      if (type === 'refresh-source') {
        options.tools.source(true);
        render();
        return;
      }
      if (type === 'begin') {
        try {
          options.tools.start();
          close();
        } catch (e) {
          feedback(e.message);
        }
        return;
      }
      const command =
        type === 'forecast'
          ? {
              type,
              forecast: {
                truthType: 'virtual-replay-forecast',
                speedLow: Number(fields.speedLow),
                speedHigh: Number(fields.speedHigh),
                directionFrom: Number(fields.directionFrom),
                directionHalfwidth: Number(fields.directionHalfwidth),
                cloudTrend: fields.cloudTrend,
              },
            }
          : { type, ...fields };
      void perform(() => options.tools.prepare(command));
    },
  });
  const toolbar = document.createElement('aside');
  toolbar.className = 'field-photo-toolbar meteorology-instruments';
  toolbar.setAttribute('aria-label', 'Virtual weather instruments');
  toolbar.innerHTML = `<p data-weather-effort></p><div><button type='button' data-weather-eye>Eye-level view</button><button type='button' data-weather-start>Deploy sensor</button><button type='button' data-weather-open class='research-primary'>Open measured reading</button></div><p role='status' aria-live='polite'></p>`;
  shell.mountTools(toolbar);
  let disposed = false;
  toolbar.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const status = toolbar.querySelector('[role=status]');
    status.textContent = '';
    try {
      if (b.hasAttribute('data-weather-eye')) options.tools.enter();
      else if (b.hasAttribute('data-weather-start')) options.tools.start();
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
      disposed || !['deploy', 'compare', 'verify'].includes(a.phase) || shell.isOpen();
    if (toolbar.hidden) return;
    toolbar.querySelector('[data-weather-effort]').textContent = r
      ? r.activeSeconds.toFixed(1) + ' active s · ' + r.reason
      : 'Inspect the working replay instruments, then deploy this sensor.';
    toolbar.querySelector('[data-weather-open]').disabled = !r?.ready || r.interrupted;
    toolbar.querySelector('[data-weather-start]').disabled = !!r?.ready;
    toolbar.querySelector('[data-weather-start]').textContent = r
      ? 'Restart unfinished reading'
      : 'Deploy sensor';
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
