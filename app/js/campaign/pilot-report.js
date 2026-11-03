import { validHandling } from './delivery-handling.js';
export function pilotReportMarkup(report) {
  try {
    const d = report?.delivery,
      r = d?.route;
    if (
      report?.schemaVersion !== 1 ||
      report.assignmentId !== 'return-case' ||
      d.phase !== 'complete' ||
      r.distanceUnits !== 'm' ||
      !Number.isFinite(r.distance) ||
      r.distance < 100 ||
      r.distance > 2500 ||
      !Array.isArray(r.points) ||
      r.points.length < 2 ||
      r.points.length > 160 ||
      r.points.some((p) => ![p.lat, p.lon].every(Number.isFinite))
    )
      return '';
    const origin = r.points[0],
      points = r.points.map((p) => ({
        x: (p.lon - origin.lon) * 111000 * Math.cos((origin.lat * Math.PI) / 180),
        z: -(p.lat - origin.lat) * 111000,
      })),
      xs = points.map((p) => p.x),
      zs = points.map((p) => p.z),
      minX = Math.min(...xs) - 12,
      minZ = Math.min(...zs) - 12,
      width = Math.max(...xs) - minX + 12,
      height = Math.max(...zs) - minZ + 12,
      first = points[0],
      last = points.at(-1),
      h = d.handling;
    const metrics =
      h?.speedUnits === 'm/s' && validHandling(h)
        ? `<dl><dt>Review distance</dt><dd>${Math.round(h.distance)} m</dd><dt>Review time</dt><dd>${h.seconds.toFixed(1)} s</dd><dt>Peak speed</dt><dd>${(h.maxSpeed * 2.2369362921).toFixed(1)} mph · ${(h.maxSpeed * 3.6).toFixed(1)} km/h</dd><dt>Hard braking / sharp turns / road departures</dt><dd>${h.hardBrakes} / ${h.sharpTurns} / ${h.roadDepartures}</dd></dl><p>${h.complete ? 'Continuous handling review.' : 'Handling review was interrupted; the delivery is still saved.'}${h.legacyReview ? ' The earlier legacy review remains archived separately.' : ''}</p>`
        : '<p>No complete metric handling review is available; no steady-cargo claim is made.</p>';
    return `<details class="discoveryGeologyEvidence pilot-delivery-report"><summary>Field Case Return · saved delivery</summary><p>The same field case was retrieved, carried through ${r.points.length} road gates and unloaded at its original base. Harbor Run and its earned finish remain in your history.</p><figure style="margin:8px 0"><svg role="img" aria-label="Checked driving route from pickup to return base" viewBox="${minX} ${minZ} ${width} ${height}" style="width:100%;max-height:min(240px,38dvh);display:block;background:#12282e"><polyline points="${points.map((p) => `${p.x},${p.z}`).join(' ')}" fill="none" stroke="#edc864" stroke-width="${Math.max(width, height) / 170}"/><circle cx="${first.x}" cy="${first.z}" r="${Math.max(width, height) / 65}" fill="#59b6f1"/><circle cx="${last.x}" cy="${last.z}" r="${Math.max(width, height) / 65}" fill="#a8d5a1"/></svg><figcaption>Checked driving route · blue pickup · green return base · ${r.distance} m. The line shows the planned road route. The handling review below records your drive.</figcaption></figure>${metrics}<p>${d.distinction === 'steady-cargo' ? 'Steady cargo distinction earned.' : 'Case returned; no additional handling distinction.'}</p><small>Virtual field delivery · local saved record · no competitive or cash reward.</small></details>`;
  } catch {
    return '';
  }
}
