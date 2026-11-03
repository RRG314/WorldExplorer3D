import { researchText as esc } from '../ui/research-markup.js';
const n = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const methods = ['bend', 'rf', 'focus', 'signals', 'track', 'mass', 'population'];
function validReading(r) {
  if (
    !r ||
    !methods.includes(r.method) ||
    !r.inputs ||
    !r.readings ||
    !['EDUCATIONAL_MODEL', 'REAL_RECORDED_DATA'].includes(r.category) ||
    typeof r.limits !== 'string'
  )
    return false;
  const v = r.readings,
    finite = (keys) => keys.every((k) => Number.isFinite(v[k]));
  if (r.method === 'bend')
    return (
      finite(['fieldTesla', 'momentumGeV', 'curvaturePerMeter', 'targetRadiusMeters']) &&
      (v.radiusMeters === null || Number.isFinite(v.radiusMeters))
    );
  if (r.method === 'rf')
    return finite(['energyMeV', 'gainPerCavityMeV']) && Number.isFinite(r.inputs.phaseDegrees);
  if (r.method === 'focus') return finite(['rmsXMeters', 'rmsYMeters', 'lost', 'total']);
  if (r.method === 'signals')
    return (
      Array.isArray(v.possible) &&
      v.possible.length <= 5 &&
      v.possible.every((i) => Number.isInteger(i) && i >= 0 && i < 5) &&
      Array.isArray(v.opened) &&
      v.opened.length <= 4 &&
      v.opened.every(
        (p) =>
          p && Number.isInteger(p.index) && p.index >= 0 && p.index < 4 && Number.isFinite(p.value)
      )
    );
  if (r.method === 'track')
    return (
      finite(['count', 'k', 'residual', 'span']) &&
      Array.isArray(v.residuals) &&
      v.residuals.length <= 6 &&
      v.residuals.every(
        (p) => p && typeof p.id === 'string' && Number.isFinite(p.meters) && Math.abs(p.meters) < 5
      )
    );
  if (r.method === 'mass')
    return (
      finite(['sourceRow', 'energy', 'momentum', 'mass']) &&
      Number.isFinite(r.inputs.beta) &&
      Array.isArray(v.muons) &&
      v.muons.length === 2 &&
      v.muons.every((m) => m && ['E', 'px', 'py', 'pz'].every((k) => Number.isFinite(m[k])))
    );
  return (
    finite(['count', 'cutGeV', 'outsideHistogram']) &&
    ['opposite', 'same', 'all'].includes(v.charge) &&
    Array.isArray(v.bins) &&
    v.bins.length === 55 &&
    v.bins.every((x) => Number.isSafeInteger(x) && x >= 0 && x <= 100000)
  );
}
export function acceleratorReadingMarkup(r) {
  if (!validReading(r)) return '';
  const v = r.readings;
  const text = {
    bend: () =>
      `B ${n(v.fieldTesla)} T · p ${n(v.momentumGeV)} GeV/c · radius ${n(v.radiusMeters)} m · target ${n(v.targetRadiusMeters)} m`,
    rf: () =>
      `Phase ${n(r.inputs.phaseDegrees, 2)}° · final ${n(v.energyMeV)} MeV · gain/cavity ${n(v.gainPerCavityMeV)} MeV`,
    focus: () =>
      `RMS x ${n(v.rmsXMeters * 1000)} mm · y ${n(v.rmsYMeters * 1000)} mm · ${v.lost}/${v.total} rays outside aperture`,
    signals: () =>
      `${v.possible.length} compatible interpretation${v.possible.length === 1 ? '' : 's'} · ${v.interpretation || 'no particle chosen'} · opened readouts ${v.opened.map((x) => x.index + 1).join(', ')}`,
    track: () =>
      `${v.count} selected hits · curvature ${n(v.k)} m⁻¹ · RMS residual ${n(v.residual * 1000)} mm · span ${n(v.span)} m`,
    mass: () =>
      `Recorded row ${v.sourceRow} · β ${n(r.inputs.beta, 6)} · E ${n(v.energy)} GeV · |p∥| ${n(Math.abs(v.momentum))} GeV/c · invariant mass ${n(v.mass)} GeV/c²`,
    population: () =>
      `${v.charge} charge · both muons pT ≥ ${v.cutGeV} GeV/c · ${v.count.toLocaleString()} selected of 100,000 recorded pairs · ${v.outsideHistogram} outside histogram`,
  };
  if (!Object.hasOwn(text, r.method)) return '';
  let plot = '';
  if (r.method === 'mass' && Array.isArray(v.muons) && v.muons.length === 2)
    plot = `<details><summary>Original recorded four-vectors · GeV</summary><table><thead><tr><th>Component</th><th>Muon 1</th><th>Muon 2</th></tr></thead><tbody>${['E', 'px', 'py', 'pz'].map((k) => `<tr><th scope='row'>${k}</th>${v.muons.map((m) => `<td>${n(m[k], 4)}</td>`).join('')}</tr>`).join('')}</tbody></table><p>Source values remain unchanged in the saved record; only this display rounds them.</p></details>`;
  if (r.method === 'population' && Array.isArray(v.bins) && v.bins.length === 55) {
    const max = Math.max(1, ...v.bins);
    plot = `<svg viewBox='0 0 440 250' role='img' aria-label='Recorded pair invariant mass histogram in 55 bins from 0 to 110 GeV per c squared'><title>Recorded mass population · ${esc(v.charge)} charge</title><path d='M50 10V198H430' fill='none' stroke='#b6ccc6'/>${v.bins.map((x, i) => `<rect x='${50 + i * 6.8}' y='${198 - (x / max) * 175}' width='6' height='${(x / max) * 175}' fill='#9bc9bc'/>`).join('')}<g fill='currentColor' font-size='20'><text x='50' y='221'>0</text><text x='208' y='221'>55</text><text x='375' y='221'>110</text><text x='125' y='238'>Invariant mass · GeV/c²</text><text x='2' y='25'>${max}</text></g></svg>`;
  }
  if (r.method === 'track' && Array.isArray(v.residuals))
    plot = `<svg viewBox='0 0 440 230' role='img' aria-label='Individual selected-hit fit residuals in millimetres'><title>Fit residuals</title><path d='M35 100H425' stroke='#b6ccc6'/><g fill='currentColor' font-size='20'>${v.residuals.map((p, i) => `<circle cx='${65 + i * 63}' cy='${100 - p.meters * 2500}' r='5' fill='#e2c27a'/><text x='${65 + i * 63}' y='190' text-anchor='middle'>${esc(p.id)}</text><text x='${65 + i * 63}' y='215' text-anchor='middle'>${n(p.meters * 1000, 1)}</text>`).join('')}<text x='15' y='22'>Residual · mm (zero at centre)</text></g></svg>`;
  return `<p>${esc(text[r.method]())}</p>${plot}<p>${esc(r.category === 'REAL_RECORDED_DATA' ? 'Recorded CMS 2010B data' : 'Educational model')} · ${esc(r.limits)}</p>`;
}
export function acceleratorReportMarkup(r) {
  if (
    r?.schemaVersion !== 1 ||
    r.truthType !== 'collision-lab-reproducible-study' ||
    !r.source ||
    !r.measurements ||
    Object.keys(r.measurements).some((k) => !methods.includes(k)) ||
    !['bend', 'rf', 'focus', 'signals', 'track', 'mass', 'population'].every(
      (k) =>
        Array.isArray(r.measurements[k]) &&
        r.measurements[k].length &&
        r.measurements[k].length <= 8 &&
        r.measurements[k].every(
          (m) =>
            m?.experiment?.method === k &&
            Number.isFinite(m?.effort?.activeSeconds) &&
            acceleratorReadingMarkup(m.experiment)
        )
    )
  )
    return '';
  return `<details class='accelerator-report'><summary>Collision Lab notebook · ${esc(r.title)}</summary><p>Meyrin beam training and CMS Point 5 analysis. The rooms and walking route are interpretive. A virtual visit grants no real-site access.</p>${Object.entries(
    r.measurements
  )
    .map(
      ([method, list]) =>
        `<section><h3>${esc({ bend: 'Steering', rf: 'RF acceleration', focus: 'Bunch focusing', signals: 'Detector ambiguity', track: 'Selected-hit fit', mass: 'Observer comparison', population: 'Fixed-cut charge control' }[method])}</h3>${list.map((m) => acceleratorReadingMarkup(m.experiment) + `<small>${n(m.effort.activeSeconds, 2)} supported active seconds · original station and settings retained</small>`).join('')}</section>`
    )
    .join(
      ''
    )}<details><summary>Source identity and scientific limits</summary><p>Collision Lab ${esc(r.source.version)} · original model SHA-256 ${esc(r.source.modelsSha256)}. Recorded source: CMS 2010B public dimuon teaching bundle, CC0, 100,000 rows. Bundle SHA-256 ${esc(r.source.dataSha256)}. Individual four-vectors, source row, identical charge-selection cut and selected-row digest remain in the saved record.</p><p>Changing the observer preserves invariant mass. Same-charge events are a control, not a complete background model; a peak alone is not a particle discovery or a significance measurement. The tabletop beam and selected hits are educational models, separate from recorded data. Neither the display geometry nor the training settings are engineering specifications.</p></details></details>`;
}
