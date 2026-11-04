import { researchText as esc } from '../ui/research-markup.js';
import { meteorologyReading } from './meteorology-career.js';
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  dateStyle: 'medium',
  timeStyle: 'short',
});
export const meteorologyTimeLabel = (n) =>
  Number.isFinite(n) && Number.isFinite(new Date(n).getTime())
    ? timeFormatter.format(n) + ' UTC'
    : 'Not supplied';
const date = meteorologyTimeLabel;
const classifications = {
  unavailable: 'Weather source unavailable',
  'manual-simulation': 'Manual weather simulation',
  'forecast-model': 'MET Norway numerical forecast',
  'unidentified-source': 'Unidentified weather source',
};
export function meteorologySourceMarkup(s) {
  if (
    !s ||
    !Object.hasOwn(classifications, s.classification) ||
    !Number.isFinite(s.checkedAt) ||
    !(s.ageSeconds === null || (Number.isFinite(s.ageSeconds) && s.ageSeconds >= 0))
  )
    return '';
  return `<section class='meteorology-reference'><h3>${classifications[s.classification]}</h3><p>Checked ${esc(date(s.checkedAt))}. Issue time: ${esc(date(s.issuedAt))}. Valid time: ${esc(date(s.validAt))}. Fetched: ${esc(date(s.fetchedAt))}.</p><p>Issue age: ${s.ageSeconds === null ? 'not available' : esc((s.ageSeconds / 3600).toFixed(2)) + ' hours'}. ${s.classification === 'forecast-model' ? 'A fetched numerical forecast is not a local station observation.' : 'Missing source or age remains unavailable; manual weather is not a public observation.'}</p><p>The separate training replay below uses its own stated reference time. It does not verify this public provider. <a href='https://docs.api.met.no/doc/ForecastJSON.html' target='_blank' rel='noopener'>MET Norway source and time definitions</a>.</p></section>`;
}
function readable(r) {
  return (
    r &&
    Array.isArray(r.samples) &&
    r.samples.length === 3 &&
    r.samples.every(
      (s) =>
        Number.isFinite(s?.activeSeconds) &&
        Number.isFinite(s.rotorAngle) &&
        s.vaneBase &&
        s.vaneTip &&
        ['x', 'z'].every((k) => Number.isFinite(s.vaneBase[k]) && Number.isFinite(s.vaneTip[k])) &&
        Array.isArray(s.cloudPaths) &&
        s.cloudPaths.length === 9 &&
        s.cloudPaths.every((p) => typeof p?.covered === 'boolean') &&
        Array.isArray(s.exposurePaths) &&
        s.exposurePaths.length === 4 &&
        s.exposurePaths.every((p) => typeof p?.blocked === 'boolean')
    ) &&
    Number.isFinite(r.heightMeters)
  );
}
export function meteorologyMeasurementMarkup(r) {
  if (
    !readable(r) ||
    !['a', 'b'].includes(r.stationId) ||
    !Number.isFinite(r.referenceTime) ||
    !Number.isFinite(r.activeSeconds)
  )
    return '';
  const v = meteorologyReading(r);
  if (!['speed', 'fromDeg', 'cloudPercent', 'heightMeters'].every((k) => Number.isFinite(v[k])))
    return '';
  return `<section><h3>Station ${esc(r.stationId.toUpperCase())} · ${esc(date(r.referenceTime))}</h3><p>Replay cup speed ${v.speed.toFixed(2)} ± ${v.speedUncertainty.toFixed(1)} m/s · wind from ${v.fromDeg.toFixed(1)}° true. Miniature replay sky ${v.cloudPercent.toFixed(1)}% covered. Cup height ${v.heightMeters.toFixed(2)} m. Three rotor/vane/sky samples over ${r.activeSeconds.toFixed(1)} active seconds.</p><div class='meteorology-table'><table><caption>Saved rotor positions and replay cues</caption><thead><tr><th>Time s</th><th>Turns</th><th>From °</th><th>Sky cells</th></tr></thead><tbody>${r.samples
    .map((s) => {
      const bearing =
        ((Math.atan2(s.vaneTip.x - s.vaneBase.x, -(s.vaneTip.z - s.vaneBase.z)) * 180) / Math.PI +
          360) %
        360;
      return `<tr><td>${s.activeSeconds.toFixed(2)}</td><td>${(s.rotorAngle / (2 * Math.PI)).toFixed(3)}</td><td>${bearing.toFixed(1)}</td><td>${s.cloudPaths.filter((p) => p.covered).length}/9</td></tr>`;
    })
    .join(
      ''
    )}</tbody></table></div><p>${v.clearWindPaths}/4 authored exposure paths clear. Shelter uses an illustrative geometric rule, not a calculation of real airflow. The training calibration is 12 m/s per revolution/s.</p></section>`;
}
export function meteorologyPairMarkup(readings, label) {
  if (
    !['a', 'b'].every(
      (id) =>
        readable(readings?.[id]) &&
        ['speed', 'fromDeg', 'cloudPercent'].every((k) =>
          Number.isFinite(meteorologyReading(readings[id])[k])
        )
    )
  )
    return '';

  if (!['a', 'b'].every((id) => readable(readings?.[id]))) return '';
  return `<div class='meteorology-table'><table><caption>${esc(label)} · matched virtual reference time</caption><thead><tr><th>Station</th><th>m/s</th><th>From °</th><th>Sky %</th></tr></thead><tbody>${[
    'a',
    'b',
  ]
    .map((id) => {
      const r = meteorologyReading(readings[id]);
      return `<tr><th scope='row'>${id.toUpperCase()}</th><td>${r.speed.toFixed(2)}</td><td>${r.fromDeg.toFixed(1)}</td><td>${r.cloudPercent.toFixed(1)}</td></tr>`;
    })
    .join('')}</tbody></table></div>`;
}
export function meteorologyForecastMarkup(f) {
  if (
    !f ||
    ![
      'speedLow',
      'speedHigh',
      'directionFrom',
      'directionHalfwidth',
      'recordedAt',
      'validReferenceTime',
    ].every((k) => Number.isFinite(f[k])) ||
    !['more', 'less', 'similar'].includes(f.cloudTrend)
  )
    return '';
  return `<section class='meteorology-forecast'><h3>Saved virtual forecast</h3><p>Saved ${esc(date(f.recordedAt))}, before the comparison was revealed. Fictional replay reference: ${esc(date(f.validReferenceTime))}.</p><p>A, the open training mast: ${f.speedLow.toFixed(1)}–${f.speedHigh.toFixed(1)} m/s. Wind from ${f.directionFrom.toFixed(0)}° ± ${f.directionHalfwidth.toFixed(0)}°. Replay sky: ${esc(f.cloudTrend)} cloud cover. These recorded bounds cannot be replaced after comparison starts.</p></section>`;
}
export function meteorologyVerificationChart(report) {
  if (
    !meteorologyForecastMarkup(report?.forecast) ||
    !['baseline', 'verification'].every((visit) =>
      ['a', 'b'].every((id) => readable(report.readings?.[visit]?.[id]))
    )
  )
    return '';
  const f = report.forecast,
    rows = ['a', 'b'].map((id) => ({
      id,
      before: meteorologyReading(report.readings.baseline[id]),
      after: meteorologyReading(report.readings.verification[id]),
    })),
    maximum =
      Math.max(f.speedHigh, ...rows.flatMap((r) => [r.before.speed + 0.3, r.after.speed + 0.3])) *
      1.2;
  if (
    !Number.isFinite(maximum) ||
    maximum <= 0 ||
    rows.some((r) =>
      [r.before, r.after].some((v) => !Number.isFinite(v.speed) || v.speed < 0 || v.speed > 25)
    )
  )
    return '';
  const y = (n) => 175 - (n / maximum) * 130;
  return `<svg class='meteorology-chart' viewBox='0 0 440 240' role='img' aria-label='Actual baseline and comparison replay wind readings with the forecast interval saved for station A'><title>Virtual wind forecast verification</title><rect x='295' y='${y(f.speedHigh)}' width='70' height='${y(f.speedLow) - y(f.speedHigh)}' fill='#efce7a' opacity='.23'/>${[
    0, 1, 2, 3,
  ]
    .map((i) => {
      const n = (maximum * i) / 3;
      return `<text x='6' y='${y(n) + 6}'>${n.toFixed(1)}</text><path d='M70 ${y(n)}H410' stroke='#7b9692' opacity='.4'/>`;
    })
    .join('')}${rows
    .map((r, i) => {
      const c = i ? '#7ed6db' : '#f1cf7b',
        x = (n) => (n ? 330 : 110) + (i ? 10 : -10);
      return `<polyline points='${x(0)},${y(r.before.speed)} ${x(1)},${y(r.after.speed)}' fill='none' stroke='${c}' stroke-width='3'/>${['before', 'after'].map((visit, n) => `<path d='M${x(n)} ${y(r[visit].speed - 0.3)}V${y(r[visit].speed + 0.3)}' stroke='${c}' stroke-width='3'/><text x='${x(n) + 8}' y='${y(r[visit].speed) + (i ? 22 : -12)}'>${r.id.toUpperCase()}</text>`).join('')}`;
    })
    .join(
      ''
    )}<text x='78' y='216'>Baseline</text><text x='285' y='216'>Comparison</text></svg><p>Vertical scale m/s. Gold A and teal B are actual virtual sensor readings; bars show an illustrative ±0.3 m/s instrument tolerance. Shaded band is the saved A forecast, not a retrospective fit.</p>`;
}
export function meteorologyReportMarkup(r) {
  if (
    r?.schemaVersion !== 1 ||
    r.truthType !== 'virtual-weather-study' ||
    !meteorologySourceMarkup(r.source) ||
    !meteorologyForecastMarkup(r.forecast) ||
    !meteorologyVerificationChart(r) ||
    !['speedError', 'directionError', 'cloudChange'].every((k) =>
      Number.isFinite(r.verification?.[k])
    ) ||
    !['within-all-bounds', 'one-or-more-missed'].includes(r.outcome)
  )
    return '';
  return `<details class='meteorology-report'><summary>Forecast card · ${esc(r.title)}</summary><p>${r.outcome === 'within-all-bounds' ? 'The comparison stayed within the saved speed, direction and sky predictions.' : 'At least one saved prediction missed; the original forecast and error remain in this record.'}</p>${meteorologyForecastMarkup(r.forecast)}${meteorologyVerificationChart(r)}${meteorologyPairMarkup(r.readings.baseline, 'Baseline replay')}${meteorologyPairMarkup(r.readings.verification, 'Comparison replay')}<p>A speed error relative to the interval midpoint: ${r.verification.speedError.toFixed(2)} m/s. Signed circular wind-from error: ${r.verification.directionError.toFixed(1)}°. Sky coverage change: ${r.verification.cloudChange.toFixed(1)} percentage points. Circular direction comparisons cross north correctly.</p><details><summary>Saved instrument readings</summary>${['baseline', 'verification'].flatMap((visit) => ['a', 'b'].map((id) => meteorologyMeasurementMarkup(r.readings[visit][id]))).join('')}</details>${meteorologySourceMarkup(r.source)}<p>These portable low training masts and simulated periods do not verify a public 10 m forecast or real local weather. Repeat matched stations and reference times with independently calibrated observations before making a real-world claim. <a href='https://www.weather.gov/media/epz/mesonet/CWOP-Siting.pdf' target='_blank' rel='noopener'>NWS instrument siting reference</a>.</p></details>`;
}
