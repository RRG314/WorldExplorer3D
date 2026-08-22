function finiteNumber(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function polylineMetrics(points = []) {
  const distances = new Float32Array(points.length);
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(
      Number(points[index]?.x) - Number(points[index - 1]?.x),
      Number(points[index]?.z) - Number(points[index - 1]?.z)
    );
    distances[index] = total;
  }
  return { distances, total };
}

function pointAtDistance(points, metrics, distance) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const target = Math.max(0, Math.min(metrics.total, Number(distance) || 0));
  let index = 0;
  while (index < metrics.distances.length - 2 && metrics.distances[index + 1] < target) {
    index += 1;
  }
  const start = points[index];
  const end = points[index + 1];
  const span = Number(metrics.distances[index + 1]) - Number(metrics.distances[index]) || 1;
  const t = Math.max(0, Math.min(1, (target - Number(metrics.distances[index])) / span));
  return {
    x: Number(start.x) + (Number(end.x) - Number(start.x)) * t,
    z: Number(start.z) + (Number(end.z) - Number(start.z)) * t
  };
}

function endpointDistance(pointsA, pointsB, reverseB = false) {
  const aStart = pointsA[0];
  const aEnd = pointsA[pointsA.length - 1];
  const bStart = reverseB ? pointsB[pointsB.length - 1] : pointsB[0];
  const bEnd = reverseB ? pointsB[0] : pointsB[pointsB.length - 1];
  return Math.hypot(aStart.x - bStart.x, aStart.z - bStart.z) +
    Math.hypot(aEnd.x - bEnd.x, aEnd.z - bEnd.z);
}

function compileHorizontalCenterline(roads, sampleStepMeters = 8) {
  if (!Array.isArray(roads) || roads.length !== 2) return [];
  const first = roads[0].pts;
  const secondSource = roads[1].pts;
  if (first.length < 2 || secondSource.length < 2) return [];
  const second = endpointDistance(first, secondSource, true) < endpointDistance(first, secondSource)
    ? [...secondSource].reverse()
    : secondSource;
  const firstMetrics = polylineMetrics(first);
  const secondMetrics = polylineMetrics(second);
  const sampleCount = Math.max(
    2,
    Math.min(512, Math.ceil(Math.max(firstMetrics.total, secondMetrics.total) /
      Math.max(2, finiteNumber(sampleStepMeters, 8))) + 1)
  );
  const points = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const ratio = sampleCount > 1 ? index / (sampleCount - 1) : 0;
    const a = pointAtDistance(first, firstMetrics, firstMetrics.total * ratio);
    const b = pointAtDistance(second, secondMetrics, secondMetrics.total * ratio);
    if (!a || !b) continue;
    points.push(Object.freeze({
      x: (a.x + b.x) * 0.5,
      z: (a.z + b.z) * 0.5
    }));
  }
  return points;
}

function normalizedHorizontalControl(control) {
  const horizontal = control?.horizontal || {};
  const widthMeters = finiteNumber(horizontal.widthMeters);
  const lanes = Math.round(finiteNumber(horizontal.lanes));
  const requiredDirectionalMembers = Math.round(finiteNumber(
    horizontal.requiredDirectionalMembers,
    2
  ));
  if (
    horizontal.kind !== 'shared_directional_carriageway_surface' ||
    !(widthMeters > 2) ||
    !(lanes >= 2) ||
    requiredDirectionalMembers !== 2 ||
    !String(horizontal.sourceUrl || '').startsWith('https://')
  ) return null;
  return Object.freeze({
    kind: horizontal.kind,
    widthMeters,
    lanes,
    requiredDirectionalMembers,
    measurementStatus: String(horizontal.measurementStatus || ''),
    sourceLabel: String(horizontal.sourceLabel || ''),
    sourceUrl: String(horizontal.sourceUrl || ''),
    authority: 'published_transport_surface_control'
  });
}

function distanceToPath(point, path) {
  let bestDistance = Infinity;
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(
      1,
      ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared
    ));
    const x = start.x + dx * t;
    const z = start.z + dz * t;
    bestDistance = Math.min(bestDistance, Math.hypot(point.x - x, point.z - z));
  }
  return bestDistance;
}

function normalizedVerticalControl(control) {
  const vertical = control?.vertical || {};
  const clearanceMeters = finiteNumber(vertical.clearanceMeters);
  if (
    vertical.kind !== 'minimum_clearance_above_mapped_water' ||
    !(clearanceMeters > 0) ||
    !String(vertical.sourceUrl || '').startsWith('https://')
  ) return null;
  return Object.freeze({
    id: String(control.id || ''),
    physicalSurfaceKind: String(control.physicalSurfaceKind || ''),
    kind: vertical.kind,
    clearanceMeters,
    referenceDatum: String(vertical.referenceDatum || ''),
    measurementStatus: String(vertical.measurementStatus || ''),
    sourceLabel: String(vertical.sourceLabel || ''),
    sourceUrl: String(vertical.sourceUrl || ''),
    authority: 'published_transport_surface_control',
    horizontal: normalizedHorizontalControl(control)
  });
}

function createSharedSurfaceBinding(control, matchedRoads) {
  const horizontal = normalizedHorizontalControl(control);
  if (!horizontal || matchedRoads.length !== horizontal.requiredDirectionalMembers) return null;
  const centerline = compileHorizontalCenterline(matchedRoads);
  if (centerline.length < 2) return null;
  const memberFeatureIds = Object.freeze(matchedRoads.map((road) => String(road.sourceFeatureId || '')));
  return Object.freeze({
    id: `shared-transport-surface:${String(control.id || '')}`,
    controlId: String(control.id || ''),
    physicalSurfaceKind: String(control.physicalSurfaceKind || ''),
    kind: horizontal.kind,
    widthMeters: horizontal.widthMeters,
    lanes: horizontal.lanes,
    centerline: Object.freeze(centerline),
    memberFeatureIds,
    publisherFeatureId: memberFeatureIds[0],
    status: 'source_identity_bound',
    authority: 'published_transport_surface_control',
    measurementStatus: horizontal.measurementStatus,
    sourceLabel: horizontal.sourceLabel,
    sourceUrl: horizontal.sourceUrl
  });
}

function roadMatchesControl(road, control, referencePath) {
  if (!road || !Array.isArray(road.pts) || road.pts.length < 2) return false;
  const match = control?.match || {};
  if (
    String(match.terrainMode || '') &&
    String(road?.structureSemantics?.terrainMode || '') !== String(match.terrainMode)
  ) return false;
  const mappedName = String(match.mappedName || '').trim().toLowerCase();
  if (mappedName && String(road.name || '').trim().toLowerCase() !== mappedName) return false;
  const maximumDistance = Math.max(
    1,
    finiteNumber(match.maximumDistanceFromReferencePathMeters, 30)
  );
  const matchingPoints = road.pts.filter((point) => distanceToPath(point, referencePath) <= maximumDistance).length;
  return matchingPoints >= Math.min(2, road.pts.length);
}

function applyPublishedTransportSurfaceControls({ controls = [], roads = [], referencePath = [] } = {}) {
  if (!Array.isArray(referencePath) || referencePath.length < 2) {
    return Object.freeze({ authority: 'published_transport_surface_control', appliedRoads: 0, controls: [] });
  }
  const applied = [];
  for (const control of controls) {
    const vertical = normalizedVerticalControl(control);
    if (!vertical) continue;
    const matchedRoads = [];
    for (const road of roads) {
      if (!roadMatchesControl(road, control, referencePath)) continue;
      road.transportSurfaceControl = vertical;
      matchedRoads.push(road);
      applied.push(Object.freeze({
        controlId: vertical.id,
        sourceFeatureId: String(road.sourceFeatureId || ''),
        mappedName: String(road.name || ''),
        sourceUrl: vertical.sourceUrl
      }));
    }
    const sharedSurfaceBinding = createSharedSurfaceBinding(control, matchedRoads);
    if (sharedSurfaceBinding) {
      for (const road of matchedRoads) road.transportSurfacePresentationBinding = sharedSurfaceBinding;
    }
  }
  return Object.freeze({
    authority: 'published_transport_surface_control',
    appliedRoads: applied.length,
    controls: Object.freeze(applied)
  });
}


function compileSharedTransportSurfacePresentations(
  roads = [],
  sampleSurfaceY = null
) {
  if (!Array.isArray(roads) || typeof sampleSurfaceY !== 'function') {
    return Object.freeze({ authority: 'compiled_transport_surface_group', groups: 0, memberRoads: 0 });
  }
  const bindings = new Map();
  for (const road of roads) {
    const binding = road?.transportSurfacePresentationBinding;
    if (binding?.kind !== 'shared_directional_carriageway_surface') continue;
    bindings.set(binding.id, binding);
  }
  let memberRoads = 0;
  for (const binding of bindings.values()) {
    const members = binding.memberFeatureIds.map((featureId) => roads.find((road) =>
      String(road?.sourceFeatureId || '') === featureId
    )).filter(Boolean);
    if (members.length !== binding.memberFeatureIds.length) continue;
    const pts = [];
    for (const point of binding.centerline) {
      const heights = members.map((member) => Number(sampleSurfaceY(member, point.x, point.z)))
        .filter(Number.isFinite);
      if (heights.length !== members.length) continue;
      pts.push({
        x: Number(point.x),
        y: heights.reduce((sum, height) => sum + height, 0) / heights.length,
        z: Number(point.z)
      });
    }
    if (pts.length < 2) continue;
    const metrics = polylineMetrics(pts);
    const surfaceHeights = new Float32Array(pts.map((point) => point.y));
    const publisher = members.find((member) =>
      String(member.sourceFeatureId || '') === binding.publisherFeatureId
    ) || members[0];
    const presentation = {
      id: binding.id,
      sourceFeatureId: binding.id,
      name: String(publisher.name || ''),
      type: String(publisher.type || 'road'),
      networkKind: 'road',
      width: binding.widthMeters,
      pts,
      surfaceDistances: metrics.distances,
      surfaceHeights,
      structureSemantics: publisher.structureSemantics,
      transportRecord: {
        crossSection: {
          lanes: binding.lanes,
          widthMeters: binding.widthMeters,
          widthSource: 'published:shared-physical-surface',
          placement: { centerlineOffsetMeters: 0, status: 'shared-surface-centerline' }
        }
      },
      memberFeatureIds: binding.memberFeatureIds,
      publisherFeatureId: binding.publisherFeatureId,
      physicalSurfaceKind: binding.physicalSurfaceKind,
      status: 'compiled',
      authority: 'compiled_transport_surface_group',
      measurementStatus: binding.measurementStatus,
      sourceLabel: binding.sourceLabel,
      sourceUrl: binding.sourceUrl
    };
    for (const member of members) member.transportSurfacePresentation = presentation;
    memberRoads += members.length;
  }
  return Object.freeze({
    authority: 'compiled_transport_surface_group',
    groups: bindings.size,
    memberRoads
  });
}

export {
  applyPublishedTransportSurfaceControls,
  compileSharedTransportSurfacePresentations
};
