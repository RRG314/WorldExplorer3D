export function createBuildingRoadFootprintGuards(options = {}) {
  const roads = Array.isArray(options.roads) ? options.roads : [];
  const useRdtBudgeting = options.useRdtBudgeting === true;
  const rdtLoadComplexity = Number(options.rdtLoadComplexity || 0);
  const roadBuildingCellSize = 120;
  const buildingRoadRadiusCells = useRdtBudgeting ? (rdtLoadComplexity >= 6 ? 5 : 4) : 3;
  const roadCoverageCells = new Set();
  const roadCoreCellSize = 6;
  const roadCoreCells = new Set();
  const roadCorridorCellSize = 4;
  const roadCorridorCells = new Set();
  const cellKey = (x, z, size) => `${Math.floor(x / size)},${Math.floor(z / size)}`;

  const markCell = (cells, size, x, z, radiusCells) => {
    const cx = Math.floor(x / size);
    const cz = Math.floor(z / size);
    const radius = Math.max(0, radiusCells | 0);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) cells.add(`${cx + dx},${cz + dz}`);
    }
  };
  const markRoadCoreCell = (x, z, radius) => markCell(roadCoreCells, roadCoreCellSize, x, z, radius);
  const markRoadCorridorCell = (x, z, radius) =>
    markCell(roadCorridorCells, roadCorridorCellSize, x, z, radius);
  const markRoadSegment = (p0, p1, cellSize, radiusCells, markPoint) => {
    if (!p0 || !p1) return;
    const segmentLength = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const steps = Math.max(1, Math.ceil(segmentLength / Math.max(1.75, cellSize * 0.5)));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      markPoint(p0.x + (p1.x - p0.x) * t, p0.z + (p1.z - p0.z) * t, radiusCells);
    }
  };

  roads.forEach((road) => {
    if (!Array.isArray(road?.pts)) return;
    const halfWidth = Number.isFinite(road.width) ? road.width * 0.5 : 4;
    const coreRadius = Math.max(0.8, Math.max(0, halfWidth * 0.32 - 0.25));
    const coreRadiusCells = Math.max(0, Math.floor((coreRadius + 0.25) / roadCoreCellSize));
    const corridorRadius = Math.max(1.6, halfWidth + 2.4);
    const corridorRadiusCells = Math.max(0, Math.ceil((corridorRadius + 0.25) / roadCorridorCellSize));
    for (let index = 0; index < road.pts.length; index++) {
      const point = road.pts[index];
      roadCoverageCells.add(cellKey(point.x, point.z, roadBuildingCellSize));
      markRoadCoreCell(point.x, point.z, coreRadiusCells);
      markRoadCorridorCell(point.x, point.z, corridorRadiusCells);
      if (index >= road.pts.length - 1) continue;
      const next = road.pts[index + 1];
      markRoadSegment(point, next, roadCoreCellSize, coreRadiusCells, markRoadCoreCell);
      markRoadSegment(
        point,
        next,
        roadCorridorCellSize * 1.5,
        corridorRadiusCells,
        markRoadCorridorCell
      );
    }
  });

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
    isBuildingNearLoadedRoad,
    overlapsRoadCore: (stats) => !!stats && stats.total > 0 && stats.inside > 0,
    overlapsRoadCorridor: (stats) => {
      if (!stats || stats.total <= 0) return false;
      const overlapRatio = stats.inside / stats.total;
      return stats.centroidInside ||
        (stats.inside >= Math.max(3, Math.ceil(stats.total * 0.24)) && overlapRatio >= 0.18);
    },
    pointOnRoadCore: (x, z) => roadCoreCells.has(cellKey(x, z, roadCoreCellSize)),
    pointOnRoadCorridor: (x, z) => roadCorridorCells.has(cellKey(x, z, roadCorridorCellSize)),
    sampleFootprintCoverage
  });
}
