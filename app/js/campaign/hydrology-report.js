import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
import { researchText as esc } from '../ui/research-markup.js';
import { hydrologyReading } from './hydrology-career.js';
const words = (v) => esc(String(v || 'Not recorded').replaceAll('-', ' '));
export function hydrologyMeasurementMarkup(reading) {
  if (
    !Array.isArray(reading?.lanes) ||
    reading.lanes.length !== 3 ||
    reading.lanes.some(
      (l) =>
        !Number.isFinite(l?.startedAt) ||
        !Number.isFinite(l?.finishedAt) ||
        l.finishedAt <= l.startedAt
    ) ||
    !['a', 'b'].includes(reading.stationId) ||
    !['widthMeters', 'depthMeters', 'activeSeconds'].every((k) => Number.isFinite(reading[k])) ||
    !Array.isArray(reading.optical) ||
    reading.optical.length !== 3 ||
    reading.optical.some(
      (s) =>
        !Array.isArray(s?.paths) ||
        s.paths.length !== 9 ||
        s.paths.some((p) => typeof p?.blocked !== 'boolean')
    )
  )
    return '';
  const r = hydrologyReading(reading);
  if (!['velocity', 'area', 'flow', 'obstruction'].every((k) => Number.isFinite(r[k]))) return '';
  return `<div class="hydrology-table"><table><caption>Actual virtual instrument reading · station ${esc(reading.stationId?.toUpperCase())}</caption><thead><tr><th>Lane</th><th>Distance m</th><th>Transit s</th><th>Speed m/s</th></tr></thead><tbody>${reading.lanes.map((l, i) => `<tr><td>${i + 1}</td><td>1.00</td><td>${(l.finishedAt - l.startedAt).toFixed(2)}</td><td>${(1 / (l.finishedAt - l.startedAt)).toFixed(3)}</td></tr>`).join('')}</tbody></table></div><p>Section: ${reading.widthMeters.toFixed(3)} m wide × ${reading.depthMeters.toFixed(3)} m deep = ${r.area.toFixed(4)} m². Mean speed ${r.velocity.toFixed(3)} m/s. Volume flow ${r.flow.toFixed(4)} ± ${r.flowUncertainty.toFixed(4)} m³/s.</p><p>Beam obstruction ${r.obstruction.toFixed(1)}% · three readings of nine optical paths. This virtual clarity proxy is not calibrated NTU. Effort ${reading.activeSeconds.toFixed(1)} active seconds.</p>`;
}
export function hydrologyReferenceMarkup(reference) {
  if (
    reference?.truthType !== 'archived-public-gauge' ||
    typeof reference.retrievedAt !== 'string' ||
    !Array.isArray(reference.observations) ||
    reference.observations.length !== 3 ||
    reference.observations.some((o) => !Number.isFinite(o?.value) || typeof o.date !== 'string')
  )
    return '';
  return `<section class="hydrology-reference"><h3>Archived river context</h3><p>${esc(reference.stationName)} · ${esc(reference.stationId)}. Historical daily means, separate from the virtual training reach.</p><ul>${reference.observations.map((o) => `<li>${esc(o.date)} · ${o.value.toFixed(1)} ft³/s · ${esc(o.approval)}</li>`).join('')}</ul><p><a href="https://api.waterdata.usgs.gov/" target="_blank" rel="noopener">USGS Water Data</a> · archived ${esc(reference.retrievedAt?.slice(0, 10))}. These different river/dates cannot establish the cause of a training change.</p></section>`;
}
export function hydrologyComparisonMarkup(rows) {
  if (
    !Array.isArray(rows) ||
    rows.length !== 2 ||
    rows.some(
      (r) =>
        !['a', 'b'].includes(r?.id) ||
        !r?.before ||
        !r?.after ||
        !Number.isFinite(r.obstructionChange) ||
        !['increased', 'decreased', 'overlap'].includes(r.flowResult) ||
        !['flow', 'flowUncertainty', 'obstruction'].every(
          (k) => Number.isFinite(r.before[k]) && Number.isFinite(r.after[k])
        )
    )
  )
    return '';
  return `<div class="hydrology-table"><table><caption>Same marked stations and protocol · volume flow m³/s. ↑ increased · ↓ decreased · ≈ overlap.</caption><thead><tr><th>Bank</th><th>Before</th><th>Return</th><th>Beam Δ %</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row" aria-label="${esc(r.id.toUpperCase())}: flow ${esc(r.flowResult)}">${esc(r.id.toUpperCase())} ${{ increased: '↑', decreased: '↓', overlap: '≈' }[r.flowResult]}</th><td>${r.before.flow.toFixed(4)}</td><td>${r.after.flow.toFixed(4)}</td><td>${Number(r.obstructionChange).toFixed(1)}</td></tr>`).join('')}</tbody></table></div><p>Flow envelopes use an illustrative 8% + 0.001 m³/s tolerance; the optical proxy retains one-path resolution. These are rectangular training-flume estimates, not a complete real river gauging survey.</p>`;
}
export function hydrologyMapMarkup(site) {
  if (
    !Number.isFinite(site?.location?.lat) ||
    !Number.isFinite(site?.location?.lon) ||
    !['a', 'b', 'bench'].every(
      (id) => Number.isFinite(site.points?.[id]?.lat) && Number.isFinite(site.points?.[id]?.lon)
    )
  )
    return '';
  const frame = earthCoordinateFrame(site.location, 111000),
    points = Object.fromEntries(
      ['a', 'b', 'bench'].map((id) => [id, frame.toWorld(site.points[id].lat, site.points[id].lon)])
    ),
    xs = Object.values(points).map((p) => p.x),
    zs = Object.values(points).map((p) => p.z),
    minX = Math.min(...xs) - 2,
    minZ = Math.min(...zs) - 3,
    scale = Math.min(330 / (Math.max(...xs) - minX + 2), 125 / (Math.max(...zs) - minZ + 2)),
    map = (p) => ({ x: 45 + (p.x - minX) * scale, y: 40 + (p.z - minZ) * scale }),
    a = map(points.a),
    b = map(points.b);
  return `<svg class="hydrology-chart" viewBox="0 0 440 230" role="img" aria-label="Saved dry bank stations and comparison bench; authored reach is schematic"><title>Marked training stations</title><path d="M${a.x} ${a.y - 1.6 * scale}L${b.x} ${b.y - 1.6 * scale}" stroke="#75c8d2" stroke-width="12"/><path d="M${a.x + 10} ${a.y - 1.6 * scale}l16 0m-6 -5l6 5-6 5" stroke="#142f31" stroke-width="2" fill="none"/>${Object.entries(
    points
  )
    .map(([id, p]) => {
      const q = map(p);
      return `<circle cx="${q.x}" cy="${q.y}" r="5" fill="#f1cf7b"/><text x="${q.x + 9}" y="${q.y + 6}">${id === 'bench' ? 'Bench' : id.toUpperCase()}</text>`;
    })
    .join(
      ''
    )}<text x="365" y="25">N ↑</text><path d="M275 201h${2 * scale}" stroke="#eef6f2" stroke-width="2"/><text x="275" y="190">2 m</text></svg><p>A and B are the saved dry bank coordinates. The blue reach is the authored training flume; it is not a mapped natural stream or catchment boundary.</p>`;
}
export function hydrologyFlowPlot(rows) {
  if (!hydrologyComparisonMarkup(rows)) return '';
  const maximum =
    Math.max(
      ...rows.flatMap((r) => [
        r.before.flow + r.before.flowUncertainty,
        r.after.flow + r.after.flowUncertainty,
      ])
    ) * 1.15;
  if (!(maximum > 0)) return '';
  const y = (q) => 170 - (q / maximum) * 125;
  return `<svg class="hydrology-chart" viewBox="0 0 440 240" role="img" aria-label="Before and declared return volume flow with illustrative uncertainty envelopes"><title>Paired virtual volume flow</title>${[
    0, 1, 2, 3,
  ]
    .map((i) => {
      const q = (maximum * i) / 3;
      return `<text x="3" y="${y(q) + 5}">${q.toFixed(3)}</text><path d="M80 ${y(q)}H415" stroke="#78918b" opacity=".4"/>`;
    })
    .join('')}${rows
    .map((r, i) => {
      const c = i ? '#7ed6db' : '#f1cf7b',
        x = (n) => (n ? 340 : 110) + (i ? 9 : -9);
      return `<polyline points="${x(0)},${y(r.before.flow)} ${x(1)},${y(r.after.flow)}" fill="none" stroke="${c}" stroke-width="3"/>${['before', 'after'].map((v, n) => `<path d="M${x(n)} ${y(r[v].flow - r[v].flowUncertainty)}V${y(r[v].flow + r[v].flowUncertainty)}" stroke="${c}" stroke-width="4"/><text x="${x(n) + 8}" y="${y(r[v].flow) + (i ? 22 : -12)}">${r.id.toUpperCase()}</text>`).join('')}`;
    })
    .join(
      ''
    )}<text x="80" y="211">Before</text><text x="290" y="211">Return</text></svg><p>Vertical scale: m³/s. Gold A and teal B identify the marked stations; their category positions are slightly offset to keep equal readings visible. Envelopes are illustrative training tolerances.</p>`;
}
export function hydrologyReportMarkup(report) {
  if (
    report?.schemaVersion !== 1 ||
    report.truthType !== 'virtual-stream-study' ||
    !report.readings ||
    !hydrologyMapMarkup(report.site) ||
    !['a', 'b'].every(
      (id) =>
        Number.isFinite(report.site?.points?.[id]?.lat) &&
        Number.isFinite(report.site?.points?.[id]?.lon)
    ) ||
    !Array.isArray(report.context?.catchment) ||
    report.context.catchment.length !== 2 ||
    !hydrologyComparisonMarkup(report.comparison) ||
    !hydrologyReferenceMarkup(report.context?.reference)
  )
    return '';
  const readings = ['baseline', 'return'].flatMap((visit) =>
    ['a', 'b'].map((id) => ({ visit, id, value: report.readings[visit]?.[id] }))
  );
  if (readings.some((r) => !hydrologyMeasurementMarkup(r.value))) return '';
  return `<details class="hydrology-report"><summary>Watershed plate · ${esc(report.title)}</summary><p>${words(report.flowResult)}. The recorded change does not identify a runoff, pollution or withdrawal source.</p>${hydrologyMapMarkup(report.site)}${hydrologyFlowPlot(report.comparison)}${hydrologyComparisonMarkup(report.comparison)}<p>Declared training return: ${words(report.condition?.id)}. Authored catchment margins: ${report.context.catchment.map(words).join(' / ')}. These are simulation conditions, not real weather or mapped pollution sources.</p><details><summary>Matched raw instrument readings</summary>${readings.map((r) => `<h3>${words(r.visit)} · ${esc(r.id.toUpperCase())}</h3>${hydrologyMeasurementMarkup(r.value)}`).join('')}</details>${hydrologyReferenceMarkup(report.context.reference)}<p>Follow-up: repeat the same stations, protocol and source measurements before attributing a cause. Saved bank positions: ${['a', 'b'].map((id) => `${id.toUpperCase()} ${report.site.points[id].lat.toFixed(5)}, ${report.site.points[id].lon.toFixed(5)}`).join(' · ')}.</p></details>`;
}
