import { researchText as esc } from '../ui/research-markup.js';
import {
  decodeDetectorFrame,
  apertureMeasurement,
  ASTRONOMY_SOURCE,
} from './astronomy-instrument.js';
export const astronomyTimeLabel = (n) =>
  new Date(n).toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC';
export const ASTRONOMY_OUTCOMES = Object.freeze({
  'catalog-match-repeat-consistent':
    'Catalog position matches; unclipped repeat rates agree within the stated noise bound',
  'catalog-position-brightness-unresolved':
    'Position or brightness comparison remains unresolved at this noise level',
  'saturated-first-use-shorter-frame':
    'First exposure clips; use the shorter unclipped frame for comparison',
  'two-unclipped-frames': 'Both exposures are unclipped and their positions match the catalog',
  'no-supported-brightness-comparison':
    'Clipping or position prevents a supported brightness comparison',
  'fixed-detector-artifact-separated':
    'Sky point moves with the dither; fixed detector defect remains in the covered control',
  'artifact-or-position-unresolved': 'Detector artifact or sky position remains unresolved',
});
export function astronomySourceMarkup(a) {
  if (!a?.target || !Number.isFinite(a.referenceTime)) return '';
  const t = a.target;
  return `<section><h3>${esc(t.name)} · HIP ${t.hip}</h3><p>Bundled HYG v4 catalog: RA ${t.raHours.toFixed(5)} h · declination ${t.decDegrees.toFixed(5)}° · catalog visual magnitude ${t.magnitude.toFixed(2)}. Reference: ${esc(astronomyTimeLabel(a.referenceTime))} at ${a.site.location.lat.toFixed(5)}°, ${a.site.location.lon.toFixed(5)}°.</p><p>Catalog J2000 coordinates; no proper motion, precession or atmospheric refraction applied. The saved reference time is replayed after reopening. It does not change the surrounding world's clock. <a href='${ASTRONOMY_SOURCE.url}' target='_blank' rel='noopener'>HYG catalog · CC BY-SA 4.0</a>.</p></section>`;
}
export function astronomyFrameMarkup(record, label = 'Detector image') {
  if (!record) return '';
  let f, m;
  try {
    f = decodeDetectorFrame(record.image || record);
    m = apertureMeasurement(f);
  } catch {
    return '';
  }
  // Preview groups 8-bit values into 16 display levels. The exact original
  // 4096 bytes remain in the report, independent of this SVG presentation.
  const paths = Array.from({ length: 16 }, () => []);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; ) {
      const level = Math.min(15, Math.floor(f.pixels[y * 64 + x] / 16)),
        start = x++;
      while (x < 64 && Math.min(15, Math.floor(f.pixels[y * 64 + x] / 16)) === level) x++;
      paths[level].push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  return `<figure class='astronomy-frame'><svg viewBox='0 0 64 64' role='img' aria-label='${esc(label)}: reproducible synthetic detector pixels, not a sky photograph' shape-rendering='crispEdges'>${paths.map((d, i) => (d.length ? `<path fill='rgb(${i * 17},${i * 17},${i * 17})' d='${d.join('')}'/>` : '')).join('')}</svg><figcaption>${esc(label)} · ${f.seconds} s · ${f.shutter === 'closed' ? 'covered detector' : 'open aperture'} · peak ${m.peak}/255${m.clipped ? ' · CLIPPED' : ''}<br>64 × 64 synthetic pixels · preview uses 16 gray levels.</figcaption></figure>`;
}
export function astronomyComparisonMarkup(a) {
  const r = a.analysis;
  if (!r?.measurements) return '';
  return `<section><h3>Position and brightness comparison</h3><div class='astronomy-table'><table><caption>Retained aperture measurements · simulation counts, not calibrated magnitudes</caption><thead><tr><th>Frame</th><th>Centroid x, y</th><th>Counts/s ± noise</th><th>Peak</th></tr></thead><tbody>${[
    'primary',
    'comparison',
    'dark',
  ]
    .map((k) => {
      const m = r.measurements[k];
      return `<tr><th scope='row'>${esc(k)}</th><td>${m.centroid ? `${m.centroid.x.toFixed(2)}, ${m.centroid.y.toFixed(2)}` : 'Not resolved'}</td><td>${m.rate.toFixed(2)} ± ${m.uncertainty.toFixed(2)}</td><td>${m.peak}${m.clipped ? ' · clipped' : ''}</td></tr>`;
    })
    .join(
      ''
    )}</tbody></table></div><p>Comparison minus first rate ${r.rateDifference.toFixed(2)} counts/s; three-noise bound ±${r.rateBound.toFixed(2)} counts/s. Predicted catalog position and detected centroid ${r.positionConsistent ? 'agree within' : 'do not both meet'} 1.5 pixels. Aperture radius 4 pixels; sky annulus 6–10 pixels. ${a.variantId === 'detector-dither' ? `Sky centroid shift ${r.skyShift.toFixed(2)} pixels. Fixed defect at (45, 24) ${r.fixedDefect ? 'is retained in all three frames' : 'is not resolved in every frame'}.` : ''}</p><p>${esc(ASTRONOMY_OUTCOMES[r.outcome] || 'Comparison unavailable')}.</p></section>`;
}
export function astronomyLimitsMarkup() {
  return `<p>Generated detector signal uses a fixed training gain, seeded shot/read noise, bias, dark signal and 8-bit saturation. HYG supplies positions and relative scene flux; counts are not calibrated photometry or evidence of a new celestial object. A clipped frame cannot establish brightness. The covered control reveals detector signal rather than sky. Real work also requires calibrated comparison stars, flats and atmospheric corrections. <a href='${ASTRONOMY_SOURCE.methodUrl}' target='_blank' rel='noopener'>AAVSO CCD photometry methods</a>.</p>`;
}
export function astronomyReportMarkup(r) {
  if (
    r?.schemaVersion !== 1 ||
    r.truthType !== 'catalog-and-synthetic-observing-log' ||
    !r.analysis?.measurements ||
    !['primary', 'comparison', 'dark'].every((k) => astronomyFrameMarkup(r.frames?.[k]))
  )
    return '';
  return `<details class='astronomy-report'><summary>Observing log · ${esc(r.title)}</summary>${astronomySourceMarkup(r)}<div class='astronomy-frames'>${['primary', 'comparison', 'dark'].map((k) => astronomyFrameMarkup(r.frames[k], k === 'primary' ? 'First exposure' : k === 'comparison' ? 'Comparison exposure' : 'Covered control')).join('')}</div>${astronomyComparisonMarkup(r)}${astronomyLimitsMarkup()}<details><summary>Reproducibility record</summary><p>Catalog checksum ${esc(r.source.sha256)}. Detector protocol catalog-synthetic-detector-v1. Each frame retains its original 4096 bytes, pointing, exposure, shutter, seed and measured active clock. Reference timestamp and controls remain unchanged after publishing.</p><ul>${[
    'primary',
    'comparison',
    'dark',
  ]
    .map((k) => {
      const f = r.frames[k];
      return `<li>${esc(k)}: azimuth ${f.image.pointing.azimuth.toFixed(4)}°, elevation ${f.image.pointing.altitude.toFixed(4)}°, seed ${f.image.seed}, ${f.effort.activeSeconds.toFixed(3)} active seconds.</li>`;
    })
    .join('')}</ul></details></details>`;
}
