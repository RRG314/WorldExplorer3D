import { sampleFeatureSurfaceY } from "../structure-semantics.js?v=63";
import { tunnelCeilingHeight, TUNNEL_SECTION_LATERAL, canPublishTunnelGeometry } from '../world/compiler/tunnel-envelope.js';

function beam(x, y, z, scaleX, scaleY, scaleZ, rotationY) {
  return { x, y, z, scaleX, scaleY, scaleZ, rotationY };
}

export function canPublishTunnelVisual(feature) {
  return canPublishTunnelGeometry(feature);
}

export function collectTunnelVisualInstances(feature, structurePts, total, deps = {}) {
  const samplePoint = deps.samplePointAlongPolyline;
  const sampleTerrain = deps.sampleTerrainHeight;
  const portals = [];
  const walls = [];
  const roofs = [];
  const lights = [];
  const shells = [];
  const portalMasks = [];
  if (!Array.isArray(structurePts) || structurePts.length < 2) return { portals, walls, roofs, lights, shells, portalMasks };

  const model = feature?.tunnelSystemModel || null;
  if (!canPublishTunnelVisual(feature)) return { portals, walls, roofs, lights, shells, portalMasks };
  if (!['tunnel', 'underpass'].includes(model?.visualKind)) return { portals, walls, roofs, lights, shells, portalMasks };
  const width = Math.max(3.4, Number(feature?.width) || 6);
  const clearance = Number(model.clearance) || Math.max(3.2, Math.min(4.8, Number(feature?.structureSemantics?.cutDepth || 4.6) - 0.35));
  const roofThickness = Number(model.roofThickness) || 0.32;
  const interiorHalfWidth = width * 0.5 + 0.02;
  const shellRanges = Array.isArray(model.shellRanges)
    ? model.shellRanges.filter((range) =>
        Number.isFinite(range?.start) &&
        Number.isFinite(range?.end) &&
        range.end - range.start > 1.2
      )
    : Number.isFinite(model.shellStart) && Number.isFinite(model.shellEnd)
      ? [{ start: model.shellStart, end: model.shellEnd }]
      : [];
  if (shellRanges.length === 0) return { portals, walls, roofs, lights, shells, portalMasks };

  if (typeof samplePoint !== "function" || typeof sampleTerrain !== "function") return { portals, walls, roofs, lights, shells, portalMasks };
  if (model.visualKind === 'tunnel') {
    const lightOffset = Math.max(0.85, width * 0.28);
    for (const range of shellRanges) {
      const firstStation = Math.ceil((Number(range.start) + 8) / 24) * 24;
      for (let station = firstStation; station <= Number(range.end) - 8; station += 24) {
        const point = samplePoint(structurePts, station);
        if (!point) continue;
        const roadY = sampleFeatureSurfaceY(feature, point.x, point.z);
        const tangentX = Number(point.tangentX);
        const tangentZ = Number(point.tangentZ);
        const tangentLength = Math.hypot(tangentX, tangentZ);
        if (!Number.isFinite(roadY) || !(tangentLength > 0.1)) continue;
        const tx = tangentX / tangentLength;
        const tz = tangentZ / tangentLength;
        const nx = -tz;
        const nz = tx;
        const rotationY = Math.atan2(tx, tz);
        // Paired ceiling strips make the enclosure readable as a tunnel
        // without adding per-light PointLights (which would multiply GPU work
        // across a dense fixed city). One instanced batch owns every strip.
        for (const side of [-1, 1]) {
          lights.push(beam(
            point.x + nx * lightOffset * side,
            roadY + tunnelCeilingHeight(clearance, interiorHalfWidth, lightOffset) - 0.1,
            point.z + nz * lightOffset * side,
            Math.min(0.46, width * 0.08),
            0.07,
            1.6,
            rotationY
          ));
        }
      }
    }
  }
  const pointRing = (distance, includeTerrain = false) => {
    const point = samplePoint(structurePts, distance);
    if (!point) return null;
    const roadY = sampleFeatureSurfaceY(feature, point.x, point.z);
    const terrainY = includeTerrain ? Number(sampleTerrain(point.x, point.z)) : NaN;
    if (!Number.isFinite(roadY) || (includeTerrain && !Number.isFinite(terrainY))) return null;
    return {
      distance,
      x: point.x,
      y: roadY,
      ...(includeTerrain ? { terrainY: Math.max(roadY + 0.65, terrainY + 0.08) } : {}),
      z: point.z,
      tangentX: point.tangentX,
      tangentZ: point.tangentZ
    };
  };
  const distancesWithin = (startDistance, endDistance, maxStep = Infinity) => {
    const distances = [startDistance];
    for (let d = startDistance + maxStep; d < endDistance; d += maxStep) distances.push(d);
    let cumulative = 0;
    for (let index = 0; index < structurePts.length - 1; index += 1) {
      cumulative += Math.hypot(
        structurePts[index + 1].x - structurePts[index].x,
        structurePts[index + 1].z - structurePts[index].z
      );
      if (cumulative > startDistance + 0.15 && cumulative < endDistance - 0.15) {
        distances.push(cumulative);
      }
    }
    for (const zone of model.junctionZones || []) {
      for (const boundary of [Number(zone?.start), Number(zone?.end)]) {
        if (boundary > startDistance + 0.15 && boundary < endDistance - 0.15) {
          distances.push(boundary);
        }
      }
    }
    for (const opening of model.wallOpenings || []) {
      for (const boundary of [opening.start, opening.end]) {
        if (boundary > startDistance && boundary < endDistance) distances.push(boundary);
      }
    }
    distances.push(endDistance);
    return [...new Set(distances.map((distance) => Number(distance).toFixed(4)))]
      .map(Number)
      .sort((left, right) => left - right);
  };
  const continuationRing = (endpoint) => {
    const links = Array.isArray(feature?.connectedFeatures?.[endpoint])
      ? feature.connectedFeatures[endpoint]
      : [];
    const other = links.map((entry) => entry?.feature).find((candidate) =>
      candidate?.structureSemantics?.isTunnel === true &&
      Array.isArray(candidate?.pts) &&
      candidate.pts.length >= 2
    );
    if (!other) return null;
    const otherTotal = other.pts.slice(1).reduce((sum, point, index) =>
      sum + Math.hypot(point.x - other.pts[index].x, point.z - other.pts[index].z), 0);
    if (!(otherTotal > 0.5)) return null;
    const ownPoint = endpoint === 'start' ? structurePts[0] : structurePts[structurePts.length - 1];
    const distanceToOtherStart = Math.hypot(ownPoint.x - other.pts[0].x, ownPoint.z - other.pts[0].z);
    const sampleDistance = distanceToOtherStart < 1
      ? Math.min(otherTotal, 3)
      : Math.max(0, otherTotal - 3);
    const point = samplePoint(other.pts, sampleDistance);
    if (!point) return null;
    const roadY = sampleFeatureSurfaceY(other, point.x, point.z);
    if (!Number.isFinite(roadY)) return null;
    const dx = endpoint === 'start' ? ownPoint.x - point.x : point.x - ownPoint.x;
    const dz = endpoint === 'start' ? ownPoint.z - point.z : point.z - ownPoint.z;
    const length = Math.hypot(dx, dz);
    if (!(length > 0.1)) return null;
    return {
      x: point.x,
      y: roadY,
      z: point.z,
      tangentX: dx / length,
      tangentZ: dz / length
    };
  };
  for (let rangeIndex = 0; rangeIndex < shellRanges.length; rangeIndex += 1) {
    const range = shellRanges[rangeIndex];
    const rings = distancesWithin(range.start, range.end)
      .map((distance) => pointRing(distance))
      .filter(Boolean);
    if (rings.length < 2) continue;
    const junctionZones = Array.isArray(model.junctionZones) ? model.junctionZones : [];
    const junctionAtStart = junctionZones.some((zone) => zone.endpoint === 'start');
    const junctionAtEnd = junctionZones.some((zone) => zone.endpoint === 'end');
    if (range.start <= 0.2 && !Number.isFinite(model.portalStart) && !junctionAtStart) {
      const ring = continuationRing('start');
      if (ring) rings.unshift(ring);
    }
    if (range.end >= total - 0.2 && !Number.isFinite(model.portalEnd) && !junctionAtEnd) {
      const ring = continuationRing('end');
      if (ring) rings.push(ring);
    }
    const approaches = [];
    const portalZones = Array.isArray(model.portalZones) ? model.portalZones : [];
    for (const zone of portalZones) {
      const belongsToRange =
        Math.abs(Number(zone.distance) - Number(range.start)) < 0.2 ||
        Math.abs(Number(zone.distance) - Number(range.end)) < 0.2;
      if (!belongsToRange) continue;
      // The headwall closes the excavation at the portal. Cutting past that
      // face exposed the shell roof and left protruding ends beside the road.
      const cutStart = zone.approachStart;
      const cutEnd = zone.approachEnd;
      const cutRings = distancesWithin(cutStart, cutEnd)
        .map((distance) => pointRing(distance))
        .filter(Boolean);
      const linedRings = distancesWithin(cutStart, cutEnd, 2).map((d) => pointRing(d)).filter(Boolean).map((ring) => {
        const nx = -Number(ring.tangentZ);
        const nz = Number(ring.tangentX);
        const leftTerrainY = Number(sampleTerrain(
          ring.x + nx * interiorHalfWidth,
          ring.z + nz * interiorHalfWidth
        ));
        const rightTerrainY = Number(sampleTerrain(
          ring.x - nx * interiorHalfWidth,
          ring.z - nz * interiorHalfWidth
        ));
        return {
          ...ring,
          leftTerrainY: Math.max(ring.y + 0.18, Number.isFinite(leftTerrainY) ? leftTerrainY + 0.08 : ring.y + 0.18),
          rightTerrainY: Math.max(ring.y + 0.18, Number.isFinite(rightTerrainY) ? rightTerrainY + 0.08 : ring.y + 0.18)
        };
      });
      if (linedRings.length >= 2) approaches.push({ rings: linedRings, endpoint: zone.endpoint });
      for (let index = 0; index < cutRings.length - 1; index += 1) {
        const start = cutRings[index];
        const end = cutRings[index + 1];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.hypot(dx, dz);
        if (!(length > 0.1)) continue;
        portalMasks.push({
          x: (start.x + end.x) * 0.5,
          z: (start.z + end.z) * 0.5,
          tangentX: dx / length,
          tangentZ: dz / length,
          roadY: (start.y + end.y) * 0.5,
          grade: (end.y - start.y) / length,
          halfWidth: interiorHalfWidth,
          halfDepth: length * 0.5 + 0.02,
          cutHeight: Math.max(clearance + roofThickness,
            ...linedRings.filter((r) => r.distance >= start.distance - 0.1 && r.distance <= end.distance + 0.1)
              .map((r) => Math.max(r.leftTerrainY, r.rightTerrainY,
                Number(sampleTerrain(r.x, r.z))) - r.y + 0.2))
        });
      }
    }
    shells.push({
      rings,
      solidBoundary: feature.tunnelSolidBoundary || null,
      publishSolidBoundary: feature.tunnelSolidBoundary?.publisher === feature,
      approaches,
      portalFrames: (model.portalDistances || [])
        .filter((distance) => Math.abs(distance - range.start) < 0.2 || Math.abs(distance - range.end) < 0.2)
        .map((distance) => {
          const ring = pointRing(distance);
          if (!ring) return null;
          const outerHalfWidth = interiorHalfWidth + Math.max(0.35, roofThickness);
          return { ...ring, terrainHeights: TUNNEL_SECTION_LATERAL.map((lateral) =>
            Number(sampleTerrain(ring.x - ring.tangentZ * lateral * outerHalfWidth,
              ring.z + ring.tangentX * lateral * outerHalfWidth))) };
        }).filter(Boolean),
      halfWidth: interiorHalfWidth,
      clearance,
      roofThickness,
      visualKind: model.visualKind,
      junctionZones,
      wallOpenings: model.wallOpenings || []
    });
  }

  // Portal rims are emitted with the shell's actual arched cross-section.
  // Three independent boxes left visible gaps above the curved shoulders.
  return { portals, walls, roofs, lights, shells, portalMasks };
}
