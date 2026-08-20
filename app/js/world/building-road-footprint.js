import { yieldToMainThread as defaultYieldToMainThread } from './cooperative-scheduling.js?v=1';

const BUILDING_EDGE_CLEARANCE_METERS = 0.12;
const MIN_PUBLISHED_ROAD_WIDTH_METERS = 1.2;
// The traffic graph's smallest supported two-way vehicle cross-section is
// 4.8 m. Anything narrower remains a mapped surface for walking and context,
// but cannot honestly publish vehicle traversal.
const MIN_DRIVEABLE_ROAD_WIDTH_METERS = 4.8;

export async function createBuildingRoadFootprintGuards(options = {}) {
  const roads = Array.isArray(options.roads) ? options.roads : [];
  const useRdtBudgeting = options.useRdtBudgeting === true;
  const rdtLoadComplexity = Number(options.rdtLoadComplexity || 0);
  const roadBuildingCellSize = 120;
  const buildingRoadRadiusCells = useRdtBudgeting ? (rdtLoadComplexity >= 6 ? 5 : 4) : 3;
  const roadCoverageCells = new Set();
  const roadCenterlineCellSize = 120;
  const roadCenterlineCells = new Map();
  const roadCenterlineSegments = [];
  const roadCorridorCellSize = 4;
  const roadCorridorCells = new Set();
  const yieldEveryRoads = Math.max(1, Math.floor(Number(options.yieldEveryRoads) || 32));
  const yieldEverySegmentSamples = Math.max(
    32,
    Math.floor(Number(options.yieldEverySegmentSamples) || 256)
  );
  const yieldToMainThread = typeof options.yieldToMainThread === 'function'
    ? options.yieldToMainThread
    : defaultYieldToMainThread;
  let yieldCount = 0;
  let segmentYieldCount = 0;
  const cellKey = (x, z, size) => `${Math.floor(x / size)},${Math.floor(z / size)}`;

  const markCell = (cells, size, x, z, radiusCells) => {
    const cx = Math.floor(x / size);
    const cz = Math.floor(z / size);
    const radius = Math.max(0, radiusCells | 0);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) cells.add(`${cx + dx},${cz + dz}`);
    }
  };
  const markRoadCorridorCell = (x, z, radius) =>
    markCell(roadCorridorCells, roadCorridorCellSize, x, z, radius);
  const registerRoadCenterlineSegment = (p0, p1, radius, road, indexRadius = radius) => {
    const segmentIndex = roadCenterlineSegments.length;
    roadCenterlineSegments.push({ p0, p1, radius, road });
    const minCellX = Math.floor((Math.min(p0.x, p1.x) - indexRadius) / roadCenterlineCellSize);
    const maxCellX = Math.floor((Math.max(p0.x, p1.x) + indexRadius) / roadCenterlineCellSize);
    const minCellZ = Math.floor((Math.min(p0.z, p1.z) - indexRadius) / roadCenterlineCellSize);
    const maxCellZ = Math.floor((Math.max(p0.z, p1.z) + indexRadius) / roadCenterlineCellSize);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const key = `${cellX},${cellZ}`;
        const entries = roadCenterlineCells.get(key) || [];
        entries.push(segmentIndex);
        roadCenterlineCells.set(key, entries);
      }
    }
  };
  const markRoadSegment = async (p0, p1, cellSize, radiusCells, markPoint) => {
    if (!p0 || !p1) return;
    const segmentLength = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const steps = Math.max(1, Math.ceil(segmentLength / Math.max(1.75, cellSize * 0.5)));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      markPoint(p0.x + (p1.x - p0.x) * t, p0.z + (p1.z - p0.z) * t, radiusCells);
      if (step > 0 && step % yieldEverySegmentSamples === 0 && step < steps) {
        segmentYieldCount += 1;
        await yieldToMainThread();
      }
    }
  };

  for (let roadIndex = 0; roadIndex < roads.length; roadIndex += 1) {
    const road = roads[roadIndex];
    try {
    if (!Array.isArray(road?.pts)) continue;
    const halfWidth = Number.isFinite(road.width) ? road.width * 0.5 : 4;
    const coreRadius = Math.max(0.8, Math.max(0, halfWidth * 0.32 - 0.25));
    const corridorRadius = Math.max(1.6, halfWidth + 2.4);
    const corridorRadiusCells = Math.max(0, Math.ceil((corridorRadius + 0.25) / roadCorridorCellSize));
    for (let index = 0; index < road.pts.length; index++) {
      const point = road.pts[index];
      roadCoverageCells.add(cellKey(point.x, point.z, roadBuildingCellSize));
      markRoadCorridorCell(point.x, point.z, corridorRadiusCells);
      if (index >= road.pts.length - 1) continue;
      const next = road.pts[index + 1];
      registerRoadCenterlineSegment(point, next, coreRadius, road, halfWidth);
      await markRoadSegment(
        point,
        next,
        roadCorridorCellSize * 1.5,
        corridorRadiusCells,
        markRoadCorridorCell
      );
    }
    } finally {
      if ((roadIndex + 1) % yieldEveryRoads === 0 && roadIndex + 1 < roads.length) {
        yieldCount += 1;
        await yieldToMainThread();
      }
    }
  }

  const sampleFootprintCoverage = (points, tester) => {
    if (!Array.isArray(points) || points.length < 3 || typeof tester !== 'function') {
      return { total: 0, inside: 0, centroidInside: false };
    }
    let sumX = 0;
    let sumZ = 0;
    const samples = [];
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      sumX += point.x;
      sumZ += point.z;
      samples.push(
        point,
        { x: (point.x + next.x) * 0.5, z: (point.z + next.z) * 0.5 },
        { x: point.x + (next.x - point.x) * 0.25, z: point.z + (next.z - point.z) * 0.25 },
        { x: point.x + (next.x - point.x) * 0.75, z: point.z + (next.z - point.z) * 0.75 }
      );
    });
    const centroid = { x: sumX / points.length, z: sumZ / points.length };
    samples.push(centroid);
    const inside = samples.reduce(
      (count, point) => count + (tester(point.x, point.z) ? 1 : 0),
      0
    );
    return { total: samples.length, inside, centroidInside: tester(centroid.x, centroid.z) };
  };

  const pointInFootprint = (x, z, points) => {
    let inside = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
      const currentPoint = points[index];
      const previousPoint = points[previous];
      const crosses = ((currentPoint.z > z) !== (previousPoint.z > z)) &&
        x < (previousPoint.x - currentPoint.x) * (z - currentPoint.z) /
          ((previousPoint.z - currentPoint.z) || Number.EPSILON) + currentPoint.x;
      if (crosses) inside = !inside;
    }
    return inside;
  };

  const footprintBounds = (points) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    return { minX, maxX, minZ, maxZ };
  };

  const candidateRoadCenterlineSegments = (bounds) => {
    const indices = new Set();
    const minCellX = Math.floor(bounds.minX / roadCenterlineCellSize);
    const maxCellX = Math.floor(bounds.maxX / roadCenterlineCellSize);
    const minCellZ = Math.floor(bounds.minZ / roadCenterlineCellSize);
    const maxCellZ = Math.floor(bounds.maxZ / roadCenterlineCellSize);
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        for (const segmentIndex of roadCenterlineCells.get(`${cellX},${cellZ}`) || []) {
          indices.add(segmentIndex);
        }
      }
    }
    return [...indices].map((index) => roadCenterlineSegments[index]);
  };

  const orientation = (a, b, c) =>
    Math.sign((b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z));
  const onSegment = (a, b, c) =>
    b.x <= Math.max(a.x, c.x) + 1e-7 && b.x + 1e-7 >= Math.min(a.x, c.x) &&
    b.z <= Math.max(a.z, c.z) + 1e-7 && b.z + 1e-7 >= Math.min(a.z, c.z);
  const segmentsIntersect = (a, b, c, d) => {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    return (o1 === 0 && onSegment(a, c, b)) ||
      (o2 === 0 && onSegment(a, d, b)) ||
      (o3 === 0 && onSegment(c, a, d)) ||
      (o4 === 0 && onSegment(c, b, d));
  };

  const pointToSegmentDistance = (point, start, end) => {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSq = dx * dx + dz * dz;
    const amount = lengthSq > 0
      ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq))
      : 0;
    return Math.hypot(
      point.x - (start.x + dx * amount),
      point.z - (start.z + dz * amount)
    );
  };

  const segmentToSegmentDistance = (a, b, c, d) => {
    if (segmentsIntersect(a, b, c, d)) return 0;
    return Math.min(
      pointToSegmentDistance(a, c, d),
      pointToSegmentDistance(b, c, d),
      pointToSegmentDistance(c, a, b),
      pointToSegmentDistance(d, a, b)
    );
  };

  const segmentToFootprintDistance = (segment, points) => {
    if (pointInFootprint(segment.p0.x, segment.p0.z, points) ||
        pointInFootprint(segment.p1.x, segment.p1.z, points)) return 0;
    let minimum = Infinity;
    for (let index = 0; index < points.length; index += 1) {
      minimum = Math.min(
        minimum,
        segmentToSegmentDistance(
          segment.p0,
          segment.p1,
          points[index],
          points[(index + 1) % points.length]
        )
      );
      if (minimum <= 1e-7) return 0;
    }
    return minimum;
  };

  const footprintIntersectsRoadCenterline = (points) => {
    if (!Array.isArray(points) || points.length < 3 || roadCenterlineSegments.length === 0) return false;
    const bounds = footprintBounds(points);
    for (const segment of candidateRoadCenterlineSegments(bounds)) {
      if (Math.max(segment.p0.x, segment.p1.x) < bounds.minX || Math.min(segment.p0.x, segment.p1.x) > bounds.maxX ||
          Math.max(segment.p0.z, segment.p1.z) < bounds.minZ || Math.min(segment.p0.z, segment.p1.z) > bounds.maxZ) continue;
      if (pointInFootprint(segment.p0.x, segment.p0.z, points) ||
          pointInFootprint(segment.p1.x, segment.p1.z, points)) return true;
      for (let index = 0; index < points.length; index += 1) {
        if (segmentsIntersect(segment.p0, segment.p1, points[index], points[(index + 1) % points.length])) {
          return true;
        }
      }
    }
    return false;
  };

  // Mapped road centerlines and mapped building outlines are stronger inputs
  // than a class-default road width. Resolve that inferred cross-section here,
  // before final road meshes, traversal, and traffic consume it. This keeps the
  // source identities intact while preventing two physical owners from
  // occupying the same at-grade surface.
  const resolveFootprintTransportAuthority = (points, options = {}) => {
    if (!Array.isArray(points) || points.length < 3 || roadCenterlineSegments.length === 0) {
      return Object.freeze({ action: 'none', constrainedRoads: 0 });
    }
    if (options.allowsPassageBelow === true) {
      return Object.freeze({ action: 'passage_preserved', constrainedRoads: 0 });
    }

    const bounds = footprintBounds(points);
    const constraints = new Map();
    let gradeSeparatedOverlaps = 0;
    for (const segment of candidateRoadCenterlineSegments(bounds)) {
      const road = segment?.road;
      if (!road) continue;
      const distance = segmentToFootprintDistance(segment, points);
      const halfWidth = Math.max(0.6, Number(road.width || 0) * 0.5);
      if (!(distance < halfWidth - 1e-7)) continue;

      const terrainMode = String(road?.structureSemantics?.terrainMode || 'at_grade');
      if (terrainMode !== 'at_grade') {
        gradeSeparatedOverlaps += 1;
        continue;
      }
      if (distance <= 1e-7) {
        return Object.freeze({
          action: 'suppress_building',
          reason: 'mapped_centerline_conflict',
          constrainedRoads: 0,
          gradeSeparatedOverlaps
        });
      }

      const widthSource = String(road?.transportRecord?.crossSection?.widthSource || '');
      if (options.inferredFootprint === true) {
        return Object.freeze({
          action: 'suppress_building',
          reason: 'inferred_footprint_conflict',
          constrainedRoads: 0,
          gradeSeparatedOverlaps
        });
      }
      if (widthSource !== 'fallback:road-class') {
        return Object.freeze({
          action: 'suppress_building',
          reason: 'mapped_cross_section_conflict',
          constrainedRoads: 0,
          gradeSeparatedOverlaps
        });
      }

      const resolvedHalfWidth = distance - BUILDING_EDGE_CLEARANCE_METERS;
      if (resolvedHalfWidth < MIN_PUBLISHED_ROAD_WIDTH_METERS * 0.5) {
        return Object.freeze({
          action: 'suppress_building',
          reason: 'insufficient_centerline_clearance',
          constrainedRoads: 0,
          gradeSeparatedOverlaps
        });
      }
      const resolvedWidth = resolvedHalfWidth * 2;
      const previous = constraints.get(road);
      if (!previous || resolvedWidth < previous.resolvedWidth) {
        constraints.set(road, { resolvedWidth, distance });
      }
    }

    let minimumResolvedWidth = Infinity;
    let newlyNonDriveableRoads = 0;
    for (const [road, constraint] of constraints) {
      const sourceWidth = Number(
        road?.resolvedCrossSection?.sourceWidthMeters ||
        road?.transportRecord?.crossSection?.widthMeters ||
        road?.width
      );
      const previousWidth = Number(road.width || sourceWidth);
      const resolvedWidth = Math.max(
        MIN_PUBLISHED_ROAD_WIDTH_METERS,
        Math.min(previousWidth, constraint.resolvedWidth)
      );
      const wasDriveable = road.driveable !== false;
      road.width = resolvedWidth;
      if (resolvedWidth < MIN_DRIVEABLE_ROAD_WIDTH_METERS) road.driveable = false;
      if (wasDriveable && road.driveable === false) newlyNonDriveableRoads += 1;
      road.resolvedCrossSection = Object.freeze({
        authority: 'mapped_building_clearance',
        sourceWidthMeters: sourceWidth,
        sourceWidthSource: String(road?.transportRecord?.crossSection?.widthSource || ''),
        resolvedWidthMeters: resolvedWidth,
        clearanceMeters: BUILDING_EDGE_CLEARANCE_METERS,
        minimumMappedFootprintDistanceMeters: constraint.distance,
        inferenceMethod: 'mapped-footprint-clearance',
        constraintFeatureId: String(options.sourceBuildingId || '') || null,
        driveable: road.driveable !== false
      });
      minimumResolvedWidth = Math.min(minimumResolvedWidth, resolvedWidth);
    }

    return Object.freeze({
      action: constraints.size > 0 ? 'constrain_inferred_width' : 'none',
      constrainedRoads: constraints.size,
      gradeSeparatedOverlaps,
      newlyNonDriveableRoads,
      minimumResolvedWidth: Number.isFinite(minimumResolvedWidth) ? minimumResolvedWidth : null
    });
  };

  const pointOnRoadCore = (x, z) => {
    const bounds = { minX: x, maxX: x, minZ: z, maxZ: z };
    return candidateRoadCenterlineSegments(bounds).some((segment) => {
      const dx = segment.p1.x - segment.p0.x;
      const dz = segment.p1.z - segment.p0.z;
      const lengthSq = dx * dx + dz * dz;
      const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - segment.p0.x) * dx + (z - segment.p0.z) * dz) / lengthSq)) : 0;
      return Math.hypot(x - (segment.p0.x + dx * t), z - (segment.p0.z + dz * t)) <= segment.radius;
    });
  };

  const expandFootprintForGroundApron = (points) => {
    if (!Array.isArray(points) || points.length < 3) return points || [];
    const center = points.reduce(
      (value, point) => ({ x: value.x + point.x, z: value.z + point.z }),
      { x: 0, z: 0 }
    );
    center.x /= points.length;
    center.z /= points.length;
    const maxRadius = points.reduce(
      (best, point) => Math.max(best, Math.hypot(point.x - center.x, point.z - center.z)),
      0
    );
    const outset = Math.min(1.5, Math.max(0.65, maxRadius * 0.08));
    return points.map((point) => {
      const dx = point.x - center.x;
      const dz = point.z - center.z;
      const length = Math.hypot(dx, dz);
      return length > 1e-4
        ? { x: point.x + dx / length * outset, z: point.z + dz / length * outset }
        : { x: point.x, z: point.z };
    });
  };

  const isBuildingNearLoadedRoad = (points) => {
    if (useRdtBudgeting || !points?.length || roadCoverageCells.size === 0) return true;
    const center = points.reduce(
      (value, point) => ({ x: value.x + point.x, z: value.z + point.z }),
      { x: 0, z: 0 }
    );
    const cx = Math.floor(center.x / points.length / roadBuildingCellSize);
    const cz = Math.floor(center.z / points.length / roadBuildingCellSize);
    for (let dx = -buildingRoadRadiusCells; dx <= buildingRoadRadiusCells; dx++) {
      for (let dz = -buildingRoadRadiusCells; dz <= buildingRoadRadiusCells; dz++) {
        if (roadCoverageCells.has(`${cx + dx},${cz + dz}`)) return true;
      }
    }
    return false;
  };

  return Object.freeze({
    expandFootprintForGroundApron,
    footprintIntersectsRoadCenterline,
    isBuildingNearLoadedRoad,
    overlapsRoadCorridor: (stats) => {
      if (!stats || stats.total <= 0) return false;
      const overlapRatio = stats.inside / stats.total;
      return stats.centroidInside ||
        (stats.inside >= Math.max(3, Math.ceil(stats.total * 0.24)) && overlapRatio >= 0.18);
    },
    pointOnRoadCore,
    pointOnRoadCorridor: (x, z) => roadCorridorCells.has(cellKey(x, z, roadCorridorCellSize)),
    resolveFootprintTransportAuthority,
    sampleFootprintCoverage,
    scheduling: Object.freeze({
      chunkSize: yieldEveryRoads,
      segmentSampleChunkSize: yieldEverySegmentSamples,
      segmentYieldCount,
      yieldCount
    })
  });
}
