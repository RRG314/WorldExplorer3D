import { researchText as esc } from '../ui/research-markup.js';
const words = (value) => esc(String(value || 'Not recorded').replaceAll('-', ' ')),
  taxa = (window) =>
    [...new Set((window?.observations || []).map((o) => o.speciesLabel || o.speciesId))].join(
      ', '
    ) || 'Not observed';
const point = (p) => p && ['x', 'y', 'z'].every((k) => Number.isFinite(p[k]));
const windowShape = (w) =>
  w &&
  w.config &&
  Array.isArray(w.observations) &&
  w.observations.every((o) => o && typeof o.speciesId === 'string') &&
  Number.isFinite(w.completedAt) &&
  Number.isFinite(new Date(w.completedAt).getTime()) &&
  Number.isFinite(w.activeSeconds) &&
  Number.isFinite(w.excludedSeconds) &&
  Number.isFinite(w.config.metersPerUnit);
export function marineComparisonMarkup(comparison) {
  if (
    !Array.isArray(comparison?.rows) ||
    comparison.rows.length !== 2 ||
    comparison.rows.some(
      (r) =>
        !r ||
        !['seconds', 'individuals', 'depthMeters', 'lightRelative'].every((k) =>
          Number.isFinite(r[k])
        )
    )
  )
    return '';
  return `<div class="oceanography-table"><table><caption>Matched virtual camera records · individual detections, not population estimates</caption><thead><tr><th>Habitat</th><th>Time s</th><th>Animals</th><th>Depth m</th><th>Light</th></tr></thead><tbody>${comparison.rows.map((r) => `<tr><th>${words(r.id)}</th><td>${r.seconds.toFixed(1)}</td><td>${r.individuals}</td><td>${r.depthMeters.toFixed(1)}</td><td>${r.lightRelative.toFixed(2)}</td></tr>`).join('')}</tbody></table></div><p>Depth is measured in game water. Light is a relative rendering value, not a lux measurement. Local current measurements were unavailable.</p>`;
}
export function marineBehaviorMarkup(window) {
  const rows = window?.trajectory;
  if (
    !Array.isArray(rows) ||
    rows.length < 3 ||
    !Number.isFinite(window.config?.metersPerUnit) ||
    rows.some(
      (r) =>
        !r ||
        !point(r.position) ||
        !['activeSeconds', 'distanceMeters'].every((k) => Number.isFinite(r[k]))
    )
  )
    return '';
  const first = rows[0],
    u = window.config.metersPerUnit;
  return (
    marineBehaviorPlot(window) +
    `<div class="oceanography-table"><table><caption>One virtual individual · sampled movement sequence</caption><thead><tr><th>Time s</th><th>Offset m</th><th>Depth Δ m</th><th>Range m</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.activeSeconds.toFixed(1)}</td><td>${(Math.hypot(r.position.x - first.position.x, r.position.z - first.position.z) * u).toFixed(1)}</td><td>${((first.position.y - r.position.y) * u).toFixed(1)}</td><td>${r.distanceMeters.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`
  );
}
export function marineBiologyConclusion(report) {
  const counts = report?.comparison?.rows?.map((r) => r?.individuals),
    oneDetection = counts?.length === 2 && counts.some((n) => n === 0) && counts.some((n) => n > 0);
  const result = {
    'neither-watch-detected-animals': 'Neither matched habitat watch detected a qualifying animal.',
    'different-observed-taxa': 'The matched watches recorded different virtual animal labels.',
    'different-individual-detections':
      'The matched watches recorded different numbers of individual detections.',
    'similar-observed-records': 'The matched watches produced similar observed records.',
  }[report?.comparison?.result];
  return typeof result === 'string'
    ? `${oneDetection ? 'One matched habitat watch recorded an animal; the other recorded none.' : result} These short camera records do not establish population size, absence or a cause. Repeat matched effort at another time; local current measurements remain missing.`
    : '';
}
export function marineStationPlanMarkup(report) {
  const rows = (Array.isArray(report?.habitats) ? report.habitats : [])
    .map((w) => ({
      id: w?.config?.habitatId,
      method: w?.config?.method,
      point: w?.contexts?.[0]?.habitat?.coordinate,
    }))
    .filter((r) => Number.isFinite(r.point?.lat) && Number.isFinite(r.point?.lon));
  if (rows.length !== 2) return '';
  return `<details class="marine-station-plan"><summary>Saved observation stations</summary>${rows.map((r) => `<p>${words(r.id)} · ${r.point.lat.toFixed(5)}, ${r.point.lon.toFixed(5)} · ${words(r.method)}</p>`).join('')}<p>The A/B map markers retain these virtual station positions when the saved study is reopened.</p></details>`;
}
export function marineHabitatPlot(report) {
  const windows = report?.habitats;
  if (!Array.isArray(windows) || windows.length !== 2 || !windows.every(windowShape)) return '';
  const observations = windows.flatMap((w) => w.observations);
  if (observations.some((o) => !Number.isFinite(o.depthMeters))) return '';
  const maxDepth = Math.max(35, ...observations.map((o) => o.depthMeters + 5)),
    y = (d) => 40 + (d / maxDepth) * 150;
  return `<svg class="marine-observation-chart" viewBox="0 0 440 250" role="img" aria-label="Individual detections by game depth in the two habitat windows; counts and effort also in the table"><title>Recorded individuals by game depth</title><text x="65" y="24">A</text><text x="265" y="24">B</text>${[0, 10, 20, 30].map((d) => `<path d="M45 ${y(d)}H410" stroke="#678481" opacity=".4"/><text x="4" y="${y(d) + 6}">${d} m</text>`).join('')}${windows
    .map((w, i) => {
      const x = i ? 280 : 80;
      return w.observations.length
        ? w.observations
            .map(
              (o, n) =>
                `<circle cx="${x + (n % 4) * 20}" cy="${y(o.depthMeters)}" r="6" fill="${i ? '#85dbdf' : '#f1cd73'}"/>`
            )
            .join('')
        : `<text x="${x - 18}" y="120">None recorded</text>`;
    })
    .join(
      ''
    )}</svg><p>Each dot is one recorded virtual individual. A and B match the saved station markers.</p>`;
}
export function marineBehaviorPlot(window) {
  const rows = window?.trajectory;
  if (
    !Array.isArray(rows) ||
    rows.length < 3 ||
    rows.some((r) => !point(r?.position)) ||
    !Number.isFinite(window.config?.metersPerUnit)
  )
    return '';
  const u = window.config.metersPerUnit,
    xs = rows.map((r) => (r.position.x - rows[0].position.x) * u),
    zs = rows.map((r) => (r.position.z - rows[0].position.z) * u),
    minX = Math.min(...xs) - 2,
    minZ = Math.min(...zs) - 2,
    maxX = Math.max(...xs) + 2,
    maxZ = Math.max(...zs) + 2,
    scale = Math.min(340 / (maxX - minX), 140 / (maxZ - minZ)),
    positions = rows.map((r, i) => ({
      x: 30 + (xs[i] - minX) * scale,
      y: 30 + (zs[i] - minZ) * scale,
    })),
    scaleMetres = [5, 2, 1, 0.5, 0.2].find((m) => m * scale <= 110) || 0.1;
  return `<svg class="marine-observation-chart" viewBox="0 0 440 230" role="img" aria-label="Horizontal path of the same virtual individual, with numbered time samples"><title>One individual’s sampled horizontal path</title><polyline points="${positions.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#85dbdf" stroke-width="3"/>${positions.map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#f1cd73"/><text x="${p.x + 7}" y="${p.y - 7}">${i + 1}</text>`).join('')}<text x="365" y="25">N ↑</text><path d="M290 200h${scaleMetres * scale}" stroke="#eef8f3" stroke-width="2"/><text x="290" y="190">${scaleMetres} m</text></svg>`;
}
export function marineBiologyReportMarkup(report) {
  if (
    report?.schemaVersion !== 1 ||
    report.truthType !== 'virtual-marine-observations' ||
    report.livePresenceClaim !== false ||
    report.populationEstimate !== false ||
    !Array.isArray(report.habitats) ||
    report.habitats.length !== 2 ||
    !windowShape(report.surface) ||
    !report.habitats.every(windowShape) ||
    !windowShape(report.follow) ||
    !marineBehaviorMarkup(report.follow) ||
    !marineComparisonMarkup(report.comparison)
  )
    return '';
  return `<details class="marine-biology-report"><summary>Marine habitat plate · ${esc(report.title)}</summary><p>${esc(marineBiologyConclusion(report))}</p>${marineHabitatPlot(report)}${marineComparisonMarkup(report.comparison)}${marineStationPlanMarkup(report)}<p>Near-surface watch: ${report.surface.observations.length ? esc(taxa(report.surface)) : 'No qualifying animal observed during the bounded effort. This does not mean absent.'}</p>${report.habitats.map((w) => `<p>${words(w.config.habitatId)} · ${esc(taxa(w))} · ${w.config.method === 'habitat-transect-v1' ? `${w.distanceMeters.toFixed(1)} m actual moving search between marked endpoints` : 'stationary watch'} · ${w.activeSeconds.toFixed(1)} active s.</p>`).join('')}${marineBehaviorMarkup(report.follow)}<p>Recorded movement: ${words(report.behavior)}. Movement does not by itself establish feeding or intention.</p><p>Follow-up station: ${words(report.followUp)}. Repeat the matched protocol at another time.</p><details><summary>Observation sources and times</summary><p>Licensed virtual animals · camera visibility, geometry and viewing distance checked. This is not a real wildlife sighting. Camera samples are bounded to twelve visible individuals per 150 ms check.</p>${[report.surface, ...report.habitats, report.follow].map((w) => `<p>${words(w.config.kind)} · ${words(w.config.method)} · ${esc(new Date(w.completedAt).toISOString())} · ${w.activeSeconds.toFixed(1)} active s; ${w.excludedSeconds.toFixed(1)} excluded s.</p>`).join('')}<p>Game-depth source: water surface minus observer position. Light source: rendered ocean lighting. Current: unavailable.</p></details></details>`;
}
