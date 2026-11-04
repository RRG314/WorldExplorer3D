import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
import { researchText as esc } from '../ui/research-markup.js';
import { cartographyLegValue } from './cartography-career.js';
const coordinate = (p) =>
  p &&
  Number.isFinite(p.lat) &&
  Math.abs(p.lat) <= 90 &&
  Number.isFinite(p.lon) &&
  Math.abs(p.lon) <= 180;
const readable = (r) =>
  Array.isArray(r?.samples) &&
  r.samples.length >= 3 &&
  r.samples.length <= 256 &&
  Number.isFinite(r.activeSeconds) &&
  r.samples.every((p) => coordinate(p?.position) && Number.isFinite(p?.heightMeters));
export function cartographyLegMarkup(raw, index = 0, plan = null) {
  if (!readable(raw) || (plan && !Number.isFinite(plan.mapDistance))) return '';
  const r = cartographyLegValue(raw);
  if (!Object.values(r).every(Number.isFinite)) return '';
  return `<section><h3>Leg ${index + 1} · ${index ? 'A → B' : 'O → A'}</h3><dl class="cartography-reading"><div><dt>Walked surface distance</dt><dd>${r.distance.toFixed(2)} m</dd></div><div><dt>Control-to-control chord</dt><dd>${r.chord.toFixed(2)} m</dd></div><div><dt>True bearing of chord</dt><dd>${r.bearing.toFixed(1)}°</dd></div><div><dt>Largest sampled grade</dt><dd>${(r.maxGrade * 100).toFixed(1)}%</dd></div></dl><p>${Number(raw.activeSeconds).toFixed(1)} active seconds · ${raw.samples.length} supported samples. ${plan ? `Mapped network distance ${plan.mapDistance.toFixed(2)} m; walked minus mapped ${(r.distance - plan.mapDistance).toFixed(2)} m.` : ''} Bearing describes the chord; it is not a direction to walk through a corner. Recording starts within 0.8 m and ends within 0.7 m of a control: endpoint placement alone permits up to 1.5 m difference, in addition to surface and sampling uncertainty.</p></section>`;
}
export function cartographyMapMarkup(site, legs = []) {
  if (
    !Array.isArray(site?.plan?.legs) ||
    site.plan.legs.length !== 2 ||
    !site.plan.legs.every(
      (l) =>
        Array.isArray(l?.points) &&
        l.points.length >= 2 &&
        l.points.length <= 128 &&
        l.points.every(coordinate)
    ) ||
    !['origin', 'a', 'b', 'entry'].every((k) => coordinate(site.points?.[k])) ||
    !coordinate(site.location) ||
    !Array.isArray(legs) ||
    legs.length > 2 ||
    legs.some((r) => !readable(r))
  )
    return '';
  const frame = earthCoordinateFrame(site.location, 111000),
    convert = (p) => frame.toWorld(p.lat, p.lon),
    controls = Object.fromEntries(
      ['origin', 'a', 'b', 'entry'].map((k) => [k, convert(site.points[k])])
    ),
    all = [
      ...Object.values(controls),
      ...site.plan.legs.flatMap((l) => l.points.map(convert)),
      ...legs.flatMap((l) => l.samples.map((p) => convert(p.position))),
    ],
    xs = all.map((p) => p.x),
    zs = all.map((p) => p.z),
    minX = Math.min(...xs),
    minZ = Math.min(...zs),
    scale = Math.min(
      320 / Math.max(10, Math.max(...xs) - minX),
      170 / Math.max(10, Math.max(...zs) - minZ)
    ),
    project = (p) => ({ x: 48 + (p.x - minX) * scale, y: 43 + (p.z - minZ) * scale }),
    line = (points) =>
      points
        .map((p) => {
          const q = project(convert(p));
          return `${q.x.toFixed(2)},${q.y.toFixed(2)}`;
        })
        .join(' '),
    bar = Math.min(10, Math.floor(100 / scale));
  return `<svg class="cartography-map" viewBox="0 0 440 280" role="img" aria-label="North-up saved virtual route sheet: teal mapped route, gold measured walk, controls O A B and entrance E"><title>Personal virtual route sheet</title>${site.plan.legs.map((l) => `<polyline points="${line(l.points)}" fill="none" stroke="#56c5c5" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}${legs.map((l) => `<polyline points="${line(l.samples.map((s) => s.position))}" fill="none" stroke="#f4cf76" stroke-width="2.5"/>`).join('')}${Object.entries(
    controls
  )
    .map(([k, p]) => {
      const q = project(p),
        label = { origin: 'O', a: 'A', b: 'B', entry: 'E' }[k];
      return `<circle cx="${q.x}" cy="${q.y}" r="5" fill="#f8f1dd" stroke="#163d3a" stroke-width="2"/><text x="${q.x + 9}" y="${q.y - 8}">${label}</text>`;
    })
    .join(
      ''
    )}<text x="375" y="25">N ↑</text><path d="M45 250h${bar * scale}" stroke="#f8f1dd" stroke-width="3"/><text x="45" y="238">${bar} m</text><text x="215" y="248">Teal: map · Gold: walk</text></svg>`;
}
export function cartographyAccessMarkup(r) {
  if (!r || !Number.isFinite(r.maxGrade) || typeof r.crossingMapped !== 'boolean') return '';
  return `<section><h3>Entrance approach E</h3><p>${esc(r.entranceProvenance === 'mapped' ? 'Mapped entrance' : 'Inferred facade entrance')} · ${esc(String(r.entrySupport || 'unknown').replaceAll('-', ' '))}. ${esc(r.entryReason)}</p><p>Two-metre local probe: largest sampled grade ${(r.maxGrade * 100).toFixed(1)}%, surface ${esc(r.surfaceKind)}. Mapped crossing nearby: ${r.crossingMapped ? 'recorded' : 'not supplied'}. A missing crossing record does not prove an absent crossing. The local probe points toward control B; it samples a terrain slice rather than the complete entrance route.</p><p>Loaded support and an available virtual doorway do not establish step-free travel, crossing safety, opening hours or a real public right of access.</p></section>`;
}
export function cartographyReportMarkup(r) {
  if (
    r?.schemaVersion !== 1 ||
    r.truthType !== 'loaded-virtual-route-survey' ||
    !Array.isArray(r.legs) ||
    r.legs.length !== 2 ||
    !r.legs.every(readable) ||
    !cartographyAccessMarkup(r.access)
  )
    return '';
  const map = cartographyMapMarkup(r.site, r.legs);
  if (!map) return '';
  if (
    r.site.plan.legs.some(
      (l) =>
        !Number.isFinite(l.mapDistance) ||
        !Array.isArray(l.sources) ||
        l.sources.length > 24 ||
        l.sources.some((s) => !s || typeof s.id !== 'string')
    )
  )
    return '';
  const sources = [
    ...new Map(r.site.plan.legs.flatMap((l) => l.sources || []).map((s) => [s.id, s])).values(),
  ];
  const comparison =
    Array.isArray(r.reference) &&
    r.reference.length === 2 &&
    r.reference.every((v) => Number.isFinite(v.distance) && Number.isFinite(v.bearing))
      ? `<section><h3>Reciprocal comparison</h3>${r.legs
          .map((leg, i) => {
            const v = cartographyLegValue(leg),
              old = r.reference[i],
              turn = ((v.bearing - old.bearing + 540) % 360) - 180;
            return `<p>Leg ${i + 1}: first survey ${old.distance.toFixed(2)} m at ${old.bearing.toFixed(1)}°; return ${v.distance.toFixed(2)} m at ${v.bearing.toFixed(1)}°. Bearing change ${Math.abs(turn).toFixed(1)}°; walked distance change ${(v.distance - old.distance).toFixed(2)} m. Small differences include the actual approach and sampling.</p>`;
          })
          .join('')}</section>`
      : '';
  return `<details class="cartography-report"><summary>Route sheet · ${esc(r.title)}</summary><p>Personal virtual route · ${esc(r.site.name)}. O is the origin; A and B are the original survey controls. E is the inspected entrance approach.</p>${map}${comparison}${r.legs.map((raw, i) => cartographyLegMarkup(raw, i, r.site.plan.legs[i])).join('')}${cartographyAccessMarkup(r.access)}<section><h3>Map and loaded world</h3><p>Horizontal network geometry: ${sources.map((s) => `${esc(s.name)} (${esc(s.kind)}; ${esc(s.provenance)})`).join(' · ')}. Mapped elevation was not established; heights and grades come from the loaded surfaces. Walking distance includes actual movement and height change, so it need not equal a map chord or network length.</p><p>The map and rendered streets can share source geometry. Their agreement is not an independent survey or a measured accuracy bound. Walking and surface sampling add uncertainty; no calibrated positional accuracy is claimed.</p></section><details><summary>Original controls and raw route record</summary><ul>${Object.entries(
    r.site.points
  )
    .map(([k, p]) => `<li>${esc(k)}: ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</li>`)
    .join(
      ''
    )}</ul><p>Each leg retains its supported sample positions, loaded heights and active seconds in your saved data. Real public access is unverified.</p></details><p>Reuse this sheet from Activities → Cartographer → Visit saved route. It reopens the original controls and rechecks current loaded support. No Live GPS route is offered.</p></details>`;
}
