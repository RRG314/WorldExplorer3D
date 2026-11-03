import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
// Read existing entrance, surface and building-entry capabilities without creating an interior.
export function inspectCartographyAccess(runtime, qualified, a) {
  const u = qualified.metersPerUnit,
    frame = earthCoordinateFrame(runtime.LOC, runtime.SCALE),
    p = qualified.points.entry,
    e = (runtime.buildingEntranceCatalog?.entrances || []).find(
      (e) => String(e.id) === a.site.plan.entry.id
    );
  if (!e)
    throw Error(
      'The saved entrance record is not loaded. Keep the survey and retry after the location loads.'
    );
  const b = (runtime.buildings || []).find(
    (b) => String(b.sourceBuildingId || b.id) === String(e.buildingSourceId)
  );
  const support = b && runtime.resolveBuildingEntrySupport?.(b, { allowSynthetic: false });
  const from = qualified.points.b,
    dx = p.x - from.x,
    dz = p.z - from.z,
    length = Math.hypot(dx, dz),
    samples = [];
  for (let i = 0; i <= 4; i++) {
    const distance = Math.min(2 / u, length) * (1 - i / 4),
      x = p.x - (dx / length) * distance,
      z = p.z - (dz / length) * distance,
      s = runtime.SurfaceQuery.walkAt(x, z, { currentY: p.y, sampleRenderedMesh: true });
    if (!Number.isFinite(s?.position?.y))
      throw Error('Wait for the entrance approach surface to load.');
    samples.push({ x, z, y: s.position.y, kind: s.kind || 'terrain' });
  }
  let maxGrade = 0;
  for (let i = 1; i < samples.length; i++)
    maxGrade = Math.max(
      maxGrade,
      Math.abs(samples[i].y - samples[i - 1].y) /
        Math.max(0.01, Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z))
    );
  const crossingMapped = [...(runtime.linearFeatures || []), ...(runtime.roads || [])].some(
    (f) =>
      f.crossingNodes?.some(
        (n) =>
          Number.isFinite(n.x) && Number.isFinite(n.z) && Math.hypot(n.x - p.x, n.z - p.z) * u < 8
      ) ||
      (f.sourceTags?.highway === 'crossing' &&
        f.pts?.some((n) => Math.hypot(n.x - p.x, n.z - p.z) * u < 8))
  );
  return {
    siteId: a.site.id,
    runId: a.runId,
    at: Date.now(),
    entryId: a.site.plan.entry.id,
    entranceProvenance: a.site.plan.entry.provenance,
    entrySupport: support?.enterable ? 'enterable' : support ? 'exterior-only' : 'unknown',
    entryReason: support?.enterable
      ? 'A virtual interior is available at this loaded building.'
      : support
        ? 'The exterior approach is available; an enterable virtual interior is unavailable.'
        : 'The matching building or interior capability is not loaded.',
    entryReasonCode: String(support?.reason || 'unknown').slice(0, 80),
    resolvedBuildingId: b ? String(b.sourceBuildingId || b.id) : null,
    maxGrade,
    surfaceKind: samples.at(-1).kind,
    crossingMapped,
    samples: samples.map((s) => ({
      position: frame.toGeographic(s.x, s.z),
      heightMeters: s.y * u,
      surfaceKind: s.kind,
    })),
  };
}
