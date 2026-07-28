import {
  projectPointToFeature,
  sampleFeatureSurfaceY
} from "../structure-semantics.js?v=25";

function createTerrainHeightSamplingApi(deps = {}) {
  const {
    appCtx,
    terrainTileDeps,
    worldToLatLon,
    latLonToTileXY,
    getOrLoadTerrainTile,
    sampleTileElevationMeters,
    clampElevationMeters,
    elevationWorldYAtWorldXZ
  } = deps;

  const terrainHeightCache = new Map();
  const baseTerrainHeightCache = new Map();
  let terrainHeightCacheEnabled = true;

  function terrainMeshHeightAt(x, z) {
    if (!appCtx.terrainGroup || appCtx.terrainGroup.children.length === 0) {
      return elevationWorldYAtWorldXZ(x, z);
    }

    const segs = appCtx.TERRAIN_SEGMENTS;
    const vps = segs + 1;

    for (let c = 0; c < appCtx.terrainGroup.children.length; c++) {
      const mesh = appCtx.terrainGroup.children[c];
      const info = mesh.userData?.terrainTile;
      if (!info) continue;

      const pos = mesh.geometry.attributes.position;
      if (!pos || pos.count < 4) continue;

      const lx = x - mesh.position.x;
      const lz = z - mesh.position.z;
      const x0 = pos.getX(0);
      const x1 = pos.getX(segs);
      const z0 = pos.getZ(0);
      const z1 = pos.getZ(segs * vps);

      if (lx < x0 || lx > x1 || lz < z0 || lz > z1) continue;

      const fx = (lx - x0) / (x1 - x0) * segs;
      const fz = (lz - z0) / (z1 - z0) * segs;
      const col = Math.max(0, Math.min(segs - 1, Math.floor(fx)));
      const row = Math.max(0, Math.min(segs - 1, Math.floor(fz)));
      const sx = fx - col;
      const sz = fz - row;

      const baseY = mesh.position.y;
      const y00 = pos.getY(row * vps + col) + baseY;
      const y10 = pos.getY(row * vps + col + 1) + baseY;
      const y01 = pos.getY((row + 1) * vps + col) + baseY;
      const y11 = pos.getY((row + 1) * vps + col + 1) + baseY;
      const y0 = y00 + (y10 - y00) * sx;
      const y1 = y01 + (y11 - y01) * sx;
      return y0 + (y1 - y0) * sz;
    }

    return elevationWorldYAtWorldXZ(x, z, terrainTileDeps);
  }

  function baseTerrainHeightAt(x, z) {
    const { lat, lon } = worldToLatLon(x, z);
    const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
    const tile = getOrLoadTerrainTile(appCtx.TERRAIN_ZOOM, t.x, t.y, terrainTileDeps);
    if (tile.loaded) {
      const u = t.xf - t.x;
      const v = t.yf - t.y;
      const meters = sampleTileElevationMeters(tile, u, v, clampElevationMeters);
      return meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
    }
    const meshY = terrainMeshHeightAt(x, z);
    if (Number.isFinite(meshY)) return meshY;
    return elevationWorldYAtWorldXZ(x, z, terrainTileDeps);
  }

  function cachedBaseTerrainHeight(x, z) {
    const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    if (baseTerrainHeightCache.has(key)) return baseTerrainHeightCache.get(key);
    const h = baseTerrainHeightAt(x, z);
    baseTerrainHeightCache.set(key, h);
    return h;
  }

  function applyStructureTerrainCuts(worldX, worldZ, terrainY) {
    if (!Array.isArray(appCtx.structureTerrainCuts) || appCtx.structureTerrainCuts.length === 0 || !Number.isFinite(terrainY)) {
      return terrainY;
    }

    let adjustedY = terrainY;
    for (let i = 0; i < appCtx.structureTerrainCuts.length; i++) {
      const cut = appCtx.structureTerrainCuts[i];
      if (!cut?.feature || !cut?.bounds) continue;
      if (worldX < cut.bounds.minX || worldX > cut.bounds.maxX || worldZ < cut.bounds.minZ || worldZ > cut.bounds.maxZ) continue;

      const projected = projectPointToFeature(cut.feature, worldX, worldZ);
      if (!projected) continue;
      const width = Math.max(4.5, Number(cut.width) || Number(cut.feature?.width) || 6);
      const influenceRadius = width * 0.82 + 3.4;
      if (!Number.isFinite(projected.dist) || projected.dist > influenceRadius) continue;

      const surfaceY = sampleFeatureSurfaceY(cut.feature, worldX, worldZ, projected);
      if (!Number.isFinite(surfaceY)) continue;

      const clearance = Math.max(3.1, Number(cut.clearance) || 3.8);
      const targetY = surfaceY - clearance;
      if (!(targetY < adjustedY - 0.05)) continue;

      const lateralT = Math.max(0, Math.min(1, projected.dist / Math.max(0.5, influenceRadius)));
      let fade = 1 - (lateralT * lateralT * (3 - 2 * lateralT));
      const distances = cut.feature?.transportSurfaceModel?.pathDistances || cut.feature?.surfaceDistances;
      const points = cut.feature?.pts;
      if (distances instanceof Float32Array && Array.isArray(points) && points.length >= 2) {
        const lastIndex = distances.length - 1;
        const p1 = points[projected.segIndex];
        const p2 = points[projected.segIndex + 1];
        const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        const distanceAlong = (Number(distances[projected.segIndex]) || 0) + segLen * projected.t;
        const totalDistance = Number(distances[lastIndex]) || 0;
        const portalLength = Math.max(6, Number(cut.portalLength) || 0);
        if (portalLength > 0 && totalDistance > 0) {
          const portalDistance = Math.min(distanceAlong, Math.max(0, totalDistance - distanceAlong));
          const portalT = Math.max(0, Math.min(1, portalDistance / portalLength));
          fade *= portalT * portalT * (3 - 2 * portalT);
        }
      }
      adjustedY = Math.min(adjustedY, adjustedY + (targetY - adjustedY) * fade);
    }

    return adjustedY;
  }

  function pointAlongPolyline(points = [], distance = 0) {
    if (!Array.isArray(points) || points.length === 0) return null;
    if (points.length === 1) return { x: points[0].x, z: points[0].z, tangentX: 1, tangentZ: 0 };
    let remaining = Math.max(0, Number(distance) || 0);
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const segLen = Math.hypot(dx, dz);
      if (segLen <= 1e-6) continue;
      if (remaining <= segLen) {
        const t = remaining / segLen;
        return {
          x: p1.x + dx * t,
          z: p1.z + dz * t,
          tangentX: dx / segLen,
          tangentZ: dz / segLen
        };
      }
      remaining -= segLen;
    }
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const dx = last.x - prev.x;
    const dz = last.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    return {
      x: last.x,
      z: last.z,
      tangentX: dx / len,
      tangentZ: dz / len
    };
  }

  function polylineCurvatureMetric(points = []) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    let totalTurn = 0;
    let samples = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      const ax = curr.x - prev.x;
      const az = curr.z - prev.z;
      const bx = next.x - curr.x;
      const bz = next.z - curr.z;
      const aLen = Math.hypot(ax, az);
      const bLen = Math.hypot(bx, bz);
      if (!(aLen > 1e-5) || !(bLen > 1e-5)) continue;
      const dot = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (aLen * bLen)));
      totalTurn += Math.acos(dot);
      samples += 1;
    }
    return samples > 0 ? totalTurn / samples : 0;
  }

  function cachedTerrainHeight(x, z) {
    if (!terrainHeightCacheEnabled) return terrainMeshHeightAt(x, z);
    const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    if (terrainHeightCache.has(key)) return terrainHeightCache.get(key);
    const h = terrainMeshHeightAt(x, z);
    terrainHeightCache.set(key, h);
    return h;
  }

  function clearTerrainHeightCache() {
    terrainHeightCache.clear();
    baseTerrainHeightCache.clear();
  }

  function calculateCurvature(pts, i) {
    if (i === 0 || i >= pts.length - 1) return 0;

    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx1 = p1.x - p0.x;
    const dz1 = p1.z - p0.z;
    const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1) || 1;
    const dx2 = p2.x - p1.x;
    const dz2 = p2.z - p1.z;
    const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
    const nx1 = dx1 / len1;
    const nz1 = dz1 / len1;
    const nx2 = dx2 / len2;
    const nz2 = dz2 / len2;
    const dot = nx1 * nx2 + nz1 * nz2;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    const avgLen = (len1 + len2) / 2;
    return angle / (avgLen || 1);
  }

  function subdivideRoadPoints(pts, maxDist) {
    if (pts.length < 2) return pts;

    const result = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const dx = cur.x - prev.x;
      const dz = cur.z - prev.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const curvPrev = calculateCurvature(pts, i - 1);
      const curvCur = calculateCurvature(pts, i);
      const avgCurv = (curvPrev + curvCur) / 2;
      const curvFactor = Math.max(0, Math.min(1, avgCurv / 0.5));
      const adaptiveDist = maxDist * (1 - curvFactor * 0.8) || maxDist;

      if (dist > adaptiveDist) {
        const steps = Math.ceil(dist / adaptiveDist);
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          result.push({ x: prev.x + dx * t, z: prev.z + dz * t });
        }
      }
      result.push(cur);
    }

    return result;
  }

  return {
    applyStructureTerrainCuts,
    baseTerrainHeightAt,
    cachedBaseTerrainHeight,
    cachedTerrainHeight,
    clearTerrainHeightCache,
    pointAlongPolyline,
    polylineCurvatureMetric,
    subdivideRoadPoints,
    terrainMeshHeightAt
  };
}

export { createTerrainHeightSamplingApi };
