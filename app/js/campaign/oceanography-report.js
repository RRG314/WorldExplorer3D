import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
export const oceanographyText = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const esc = oceanographyText,
  words = (value) => esc(String(value || 'Not recorded').replaceAll('-', ' '));
function profiles(casts) {
  return ['shelf', 'north']
    .map((id) => ({ id, samples: casts?.[id]?.samples }))
    .filter(
      (r) =>
        Array.isArray(r.samples) &&
        r.samples.length === 3 &&
        r.samples.every(
          (p) =>
            p &&
            ['depthMeters', 'temperatureC', 'practicalSalinity'].every((k) => Number.isFinite(p[k]))
        )
    );
}
export function waterColumnMarkup(casts) {
  const rows = profiles(casts);
  if (!rows.length) return '';
  const chart = (key, label, uncertainty) => {
    const all = rows.flatMap((r) => r.samples.map((s) => s[key])),
      low = Math.min(...all) - uncertainty * 2,
      high = Math.max(...all) + uncertainty * 2,
      x = (v) => 55 + ((v - low) / Math.max(0.1, high - low)) * 330,
      y = (d) => 32 + (d / 8) * 130;
    return `<svg class="ocean-profile-chart" viewBox="0 0 420 200" role="img" aria-label="${esc(label)} versus measured game depth; values also listed below"><title>${esc(label)} · simulated training profiles</title><text x="55" y="18">${esc(label)}</text><path d="M55 30V165H390" fill="none" stroke="#90aaa8"/>${[0, 2, 4, 6, 8].map((d) => `<text x="14" y="${y(d) + 4}">${d} m</text><path d="M55 ${y(d)}H390" stroke="#678481" opacity=".3"/>`).join('')}<text x="55" y="186">${low.toFixed(1)}</text><text x="350" y="186">${high.toFixed(1)}</text>${rows
      .map((r, i) => {
        const colour = i ? '#85dbdf' : '#f1cd73';
        return `<polyline points="${r.samples.map((p) => `${x(p[key]).toFixed(2)},${y(p.depthMeters).toFixed(2)}`).join(' ')}" fill="none" stroke="${colour}" stroke-width="2.5"/>${r.samples.map((p) => `<path d="M${x(p[key] - uncertainty)} ${y(p.depthMeters)}H${x(p[key] + uncertainty)}" stroke="${colour}" stroke-width="2"/><circle cx="${x(p[key])}" cy="${y(p.depthMeters)}" r="3" fill="${colour}"/>`).join('')}`;
      })
      .join('')}</svg>`;
  };
  return `<p class="oceanography-legend"><span>Shelf station · gold</span><span>Northern station · blue</span></p><div class="oceanography-profiles">${chart('temperatureC', 'Temperature °C', 0.2)}${chart('practicalSalinity', 'Practical salinity · unitless', 0.1)}</div><div class="oceanography-table"><table><caption>Measured game depths · authored reference values · ±0.2°C / ±0.1 practical salinity</caption><thead><tr><th>Station</th><th>Depth m</th><th>Temp °C</th><th>Salinity</th></tr></thead><tbody>${rows.map((r) => r.samples.map((p) => `<tr><th>${r.id === 'shelf' ? 'Shelf' : 'North'}</th><td>${p.depthMeters.toFixed(2)}</td><td>${p.temperatureC.toFixed(2)}</td><td>${p.practicalSalinity.toFixed(2)}</td></tr>`).join('')).join('')}</tbody></table></div>`;
}
export function transectMarkup(report) {
  const origin = report.casts?.shelf?.position;
  if (!Number.isFinite(origin?.lat) || !Number.isFinite(origin?.lon)) return '';
  const frame = earthCoordinateFrame(origin, 111000),
    points = profiles(report.casts)
      .map((r) => report.casts[r.id])
      .map((c) => ({
        ...c.position,
        label: c.stationId === 'shelf' ? 'A' : 'B',
      }));
  for (const [i, r] of (Array.isArray(report.pings) ? report.pings : []).entries())
    if (Number.isFinite(r?.position?.lat) && Number.isFinite(r?.position?.lon))
      points.push({ ...r.position, label: String(i + 1) });
  if (points.length < 2) return '';
  const projected = points.map((p) => ({ ...frame.toWorld(p.lat, p.lon), label: p.label })),
    xs = projected.map((p) => p.x),
    zs = projected.map((p) => p.z),
    minX = Math.min(...xs) - 15,
    maxX = Math.max(...xs) + 15,
    minZ = Math.min(...zs) - 15,
    maxZ = Math.max(...zs) + 15,
    scale = Math.min(400 / (maxX - minX), 170 / (maxZ - minZ)),
    scaleMeters = scale >= 1 ? 50 : 100,
    map = (p) => ({ x: 25 + (p.x - minX) * scale, y: 25 + (p.z - minZ) * scale });
  return `<svg class="ocean-transect-chart" viewBox="0 0 460 230" role="img" aria-label="Saved training transect with two cast stations and sonar positions"><title>Saved training transect · local distances in metres</title><polyline points="${projected
    .map((p) => {
      const q = map(p);
      return `${q.x},${q.y}`;
    })
    .join(' ')}" fill="none" stroke="#9bbebc" stroke-width="2"/>${projected
    .map((p) => {
      const q = map(p);
      return `<circle cx="${q.x}" cy="${q.y}" r="4" fill="#f1cd73"/><text x="${q.x + 7}" y="${q.y - 7}">${esc(p.label)}</text>`;
    })
    .join(
      ''
    )}<text x="390" y="25">N ↑</text><path d="M330 202h${scaleMeters * scale}" fill="none" stroke="#eef8f3" stroke-width="2"/><text x="330" y="192">${scaleMeters} m</text></svg><p>A/B cast stations · 1–3 sonar positions · training chart. The scale bar shows local metres.</p>`;
}
export function sonarReturnsMarkup(pings) {
  const rows = (Array.isArray(pings) ? pings : []).filter(
    (r) => r?.target && Number.isFinite(r.uncertaintyMeters) && Number.isFinite(r.distanceMeters)
  );
  if (!rows.length) return '';
  return `<details class="ocean-sonar-records"><summary>Geometry returns and uncertainty · ${rows.length}</summary><p>Sonar positions are numbered on the transect. These virtual return envelopes describe broad geometry, not an identification or live sonar measurement.</p><ol>${rows.map((r) => `<li>${esc(r.target.returnShape || 'Unclassified return')} · ${r.distanceMeters.toFixed(1)} m range · ±${r.uncertaintyMeters.toFixed(1)} m recorded return envelope</li>`).join('')}</ol></details>`;
}
// Present readable conclusions without rewriting canonical saved observations.
export function oceanographyConclusion(report) {
  const finding = {
    'temperature-contrast-with-depth':
      'The matched virtual profiles resolve a temperature difference that changes with depth.',
    'not-resolved-by-this-protocol':
      'The matched virtual profiles do not resolve a difference within the stated uncertainty.',
    'fresher-upper-layer':
      'The matched virtual profiles show a fresher upper layer at Shelf station.',
  }[report?.result];
  const feature = {
    habitat: 'branching colonies on rock',
    rock: 'an unbroken mineral surface',
    case: 'a straight-edged case with latches',
  }[report?.selected];
  if (typeof finding !== 'string' || typeof feature !== 'string')
    return String(report?.conclusion || '');
  return `${finding} Direct inspection recorded ${feature}. This local virtual feature does not establish the cause of the water profile. Repeat matched casts at another time before extending the comparison.`;
}
export function oceanographyReportMarkup(report) {
  if (
    report?.schemaVersion !== 1 ||
    report.truthType !== 'authored-water-column-and-geometry' ||
    profiles(report.casts).length !== 2 ||
    !report.plan
  )
    return '';
  return `<details class="oceanography-report"><summary>Annotated water-column transect</summary><p>Two matched training casts; temperature and practical salinity are authored simulation. Geometry sonar and the inspected feature describe the virtual study, not a real occurrence or regional cause.</p>${waterColumnMarkup(report.casts)}${transectMarkup(report)}${sonarReturnsMarkup(report.pings)}<p>Direct view: ${words(report.observation?.form)}. Returned to the same vessel and submarine before this wet-lab comparison.</p><p>${esc(oceanographyConclusion(report))}</p><p>Limit: ${words(report.limitation)}<br>Follow-up: ${words(report.followUp)}</p><details><summary>Station chart sources and sampling times</summary>${(Array.isArray(
    report.plan.stationDepths
  )
    ? report.plan.stationDepths
    : []
  )
    .filter((d) => d && Number.isFinite(d.depthMeters))
    .map(
      (d) =>
        `<p>${words(d.stationId)} · ${Number(d.depthMeters).toFixed(1)} m regional model · ${esc(d.sourceId)} · archived sample ${esc(d.fetchedAt)}</p>`
    )
    .join('')}${profiles(report.casts)
    .map((r) => report.casts[r.id])
    .map(
      (c) =>
        `<p>${words(c.stationId)} · ${esc(c.method)} · ${esc(c.sourceId)} · game capture ${esc(Number.isFinite(new Date(c.completedAt).getTime()) ? new Date(c.completedAt).toISOString() : 'Capture time unavailable')}</p>`
    )
    .join('')}</details></details>`;
}
