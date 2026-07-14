export function createTerrainSidewalkApi(constants = {}) {
  const {
    SIDEWALK_CLEARANCE = 0.4,
    SIDEWALK_MIN_WIDTH = 0.9,
    SIDEWALK_SEGMENT_MIN_WIDTH = 0.62
  } = constants;

  function pointInPolygonXZLocal(x, z, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const zi = polygon[i].z;
      const xj = polygon[j].x;
      const zj = polygon[j].z;
      const intersects = (zi > z) !== (zj > z) &&
        x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointToSegmentDistanceXZLocal(x, z, p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len2 = dx * dx + dz * dz;
    if (len2 <= 1e-9) return Math.hypot(x - p1.x, z - p1.z);
    let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = p1.x + dx * t;
    const pz = p1.z + dz * t;
    return Math.hypot(x - px, z - pz);
  }

  function distanceToPolygonEdgeXZLocal(x, z, pts) {
    if (!Array.isArray(pts) || pts.length < 2) return Infinity;
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dist = pointToSegmentDistanceXZLocal(x, z, pts[i], pts[(i + 1) % pts.length]);
      if (dist < best) best = dist;
    }
    return best;
  }

  function roadHasExplicitSidewalkHint(road) {
    return (
      road?.sidewalkHint === 'both' ||
      road?.sidewalkHint === 'left' ||
      road?.sidewalkHint === 'right'
    );
  }

  function roadSupportsSidewalks(road) {
    const type = String(road?.type || '').toLowerCase();
    if (road?.structureSemantics?.terrainMode && road.structureSemantics.terrainMode !== 'at_grade') return false;
    if (road?.structureSemantics?.rampCandidate) return false;
    const explicitSidewalk = roadHasExplicitSidewalkHint(road);
    if (explicitSidewalk) return true;
    if (!type) return false;
    if (type.includes('motorway') || type.includes('trunk')) return false;
    if (
      type.includes('service') ||
      type.includes('parking_aisle') ||
      type.includes('driveway') ||
      type.includes('alley') ||
      type.includes('_link') ||
      type.includes('link')
    ) {
      return false;
    }
    if (road?.sidewalkHint === 'no' || road?.sidewalkHint === 'none') return false;
    return true;
  }

  function roadBaseSidewalkWidth(road, denseUrban = false) {
    const type = String(road?.type || '').toLowerCase();
    let width =
      type.includes('pedestrian') || type.includes('living_street') ? 2.05 :
      type.includes('primary') ? 1.6 :
      type.includes('secondary') ? 1.45 :
      type.includes('tertiary') ? 1.28 :
      type.includes('residential') || type.includes('unclassified') ? 1.12 :
      type.includes('service') ? 0.96 :
      1.02;
    if (road?.sidewalkHint === 'both') width += 0.12;
    else if (road?.sidewalkHint === 'left' || road?.sidewalkHint === 'right') width += 0.06;
    if (denseUrban) width += 0.06;
    return Math.max(SIDEWALK_MIN_WIDTH, Math.min(2.1, width));
  }

  function roadSupportsInferredUrbanSidewalks(road, denseUrbanContext = false) {
    if (!roadSupportsSidewalks(road)) return false;
    if (roadHasExplicitSidewalkHint(road)) return true;
    if (road?.sidewalkHint === 'no' || road?.sidewalkHint === 'none') return false;

    const type = String(road?.type || '').toLowerCase();
    const roadName = String(road?.name || '').trim();
    const roadWidth = Number(road?.width) || 0;

    if (type.includes('motorway') || type.includes('trunk') || type.includes('service')) return false;
    if (type.includes('primary') || type.includes('secondary')) return true;
    if (type.includes('pedestrian') || type.includes('living_street')) return true;
    if (type.includes('tertiary')) return denseUrbanContext && (roadWidth >= 6.4 || roadName.length > 0);
    if (type.includes('residential') || type.includes('unclassified')) {
      return denseUrbanContext && roadName.length > 0 && roadWidth >= 6.1;
    }
    return false;
  }

  function roadTypeFamily(type = '') {
    const normalized = String(type || '').toLowerCase();
    return normalized.replace(/_link$/i, '');
  }

  function roadPolylineLength(road) {
    const pts = Array.isArray(road?.pts) ? road.pts : [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    }
    return total;
  }

  function roadConnectedSidewalkContinuity(road, denseUrbanContext, ruralGreenContext) {
    if (!roadSupportsSidewalks(road)) return false;
    if (road?.sidewalkHint === 'no' || road?.sidewalkHint === 'none') return false;
    const roadName = String(road?.name || '').trim().toLowerCase();
    const family = roadTypeFamily(road?.type || '');
    const length = roadPolylineLength(road);
    const shortContinuation = length > 0 && length <= 170;
    const bridgeGapContinuation = length > 0 && length <= 80;
    if (ruralGreenContext && !shortContinuation) return false;
    const startConnections = Array.isArray(road?.connectedFeatures?.start) ? road.connectedFeatures.start : [];
    const endConnections = Array.isArray(road?.connectedFeatures?.end) ? road.connectedFeatures.end : [];
    const continuityScoreFor = (entries) => {
      let score = 0;
      let explicitCount = 0;
      let supportiveCount = 0;
      let strongCount = 0;
      let deadEnd = entries.length === 0;
      for (let i = 0; i < entries.length; i++) {
        const other = entries[i]?.feature || null;
        if (!other || !roadSupportsSidewalks(other)) continue;
        if (other?.structureSemantics?.terrainMode && other.structureSemantics.terrainMode !== 'at_grade') continue;
        const otherName = String(other?.name || '').trim().toLowerCase();
        const sameNamedRoad = !!roadName && roadName === otherName;
        const sameFamily = roadTypeFamily(other?.type || '') === family;
        const otherLength = roadPolylineLength(other);
        const otherShort = otherLength > 0 && otherLength <= 170;
        const explicitSidewalk = roadHasExplicitSidewalkHint(other);
        if (!sameNamedRoad && !sameFamily) continue;
        deadEnd = false;
        if (explicitSidewalk) {
          explicitCount += 1;
          supportiveCount += 1;
          strongCount += 1;
          score += sameNamedRoad ? 4 : 3;
        } else if (sameNamedRoad) {
          supportiveCount += 1;
          strongCount += (otherShort || shortContinuation) ? 1 : 0;
          score += otherShort || shortContinuation ? 2.25 : 1.6;
        } else if (sameFamily) {
          supportiveCount += 1;
          score += otherShort || shortContinuation ? 1.35 : 0.9;
          if (otherShort || bridgeGapContinuation) strongCount += 1;
        }
      }
      return {
        score,
        explicitCount,
        supportiveCount,
        strongCount,
        deadEnd
      };
    };

    const startScore = continuityScoreFor(startConnections);
    const endScore = continuityScoreFor(endConnections);
    if (denseUrbanContext && !ruralGreenContext) {
      if (startScore.explicitCount + endScore.explicitCount >= 1) return true;
      if (shortContinuation && (startScore.supportiveCount + endScore.supportiveCount) >= 2) return true;
    }
    if (startScore.explicitCount + endScore.explicitCount >= 2) return true;
    if (startScore.strongCount > 0 && endScore.supportiveCount > 0) return true;
    if (endScore.strongCount > 0 && startScore.supportiveCount > 0) return true;
    if (shortContinuation && (startScore.score + endScore.score) >= 2.6) return true;
    if (bridgeGapContinuation && (
      (startScore.score >= 1.8 && endScore.deadEnd) ||
      (endScore.score >= 1.8 && startScore.deadEnd)
    )) {
      return true;
    }
    return startScore.score > 0 && endScore.score > 0;
  }

  function pointInsideBuildingCandidate(x, z, building) {
    if (!building) return false;
    if (Number.isFinite(building.minX) && Number.isFinite(building.maxX) && (
      x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ
    )) {
      return false;
    }
    if (Array.isArray(building.pts) && building.pts.length >= 3) {
      return pointInPolygonXZLocal(x, z, building.pts);
    }
    return true;
  }

  function resolveSidewalkWidth(originX, originZ, outwardX, outwardZ, innerOffset, desiredWidth, buildingCandidates) {
    const probes = [
      desiredWidth,
      desiredWidth * 0.82,
      desiredWidth * 0.64,
      desiredWidth * 0.48
    ];
    for (let i = 0; i < probes.length; i++) {
      const width = probes[i];
      if (!Number.isFinite(width) || width < SIDEWALK_MIN_WIDTH) continue;
      const testOffsets = [
        innerOffset + Math.min(0.35, width * 0.35),
        innerOffset + width * 0.58,
        innerOffset + Math.max(0.2, width - 0.15)
      ];
      let blocked = false;
      for (let s = 0; s < testOffsets.length && !blocked; s++) {
        const px = originX + outwardX * testOffsets[s];
        const pz = originZ + outwardZ * testOffsets[s];
        for (let b = 0; b < buildingCandidates.length; b++) {
          const building = buildingCandidates[b];
          if (!pointInsideBuildingCandidate(px, pz, building)) continue;
          if (Array.isArray(building.pts) && building.pts.length >= 3) {
            if (distanceToPolygonEdgeXZLocal(px, pz, building.pts) < SIDEWALK_CLEARANCE) {
              blocked = true;
              break;
            }
          } else {
            blocked = true;
            break;
          }
        }
      }
      if (!blocked) return width;
    }
    return 0;
  }

  function clampSidewalkWidthTransitions(widths, pts, caps = null, locked = null) {
    if (!(widths instanceof Float32Array) || !Array.isArray(pts) || pts.length !== widths.length || widths.length < 2) {
      return;
    }

    const applyCaps = () => {
      if (!(caps instanceof Float32Array) || caps.length !== widths.length) return;
      for (let i = 0; i < widths.length; i++) {
        widths[i] = Math.min(widths[i], Math.max(0, caps[i]));
      }
    };
    const applyLocks = () => {
      if (!(locked instanceof Uint8Array) || locked.length !== widths.length) return;
      for (let i = 0; i < widths.length; i++) {
        if (locked[i]) widths[i] = 0;
      }
    };

    for (let i = 1; i < widths.length; i++) {
      const segLen = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) || 1;
      const maxDelta = Math.max(0.35, Math.min(0.95, segLen * 0.22));
      if (widths[i] > widths[i - 1] + maxDelta) widths[i] = widths[i - 1] + maxDelta;
    }
    applyCaps();
    applyLocks();
    for (let i = widths.length - 2; i >= 0; i--) {
      const segLen = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) || 1;
      const maxDelta = Math.max(0.35, Math.min(0.95, segLen * 0.22));
      if (widths[i] > widths[i + 1] + maxDelta) widths[i] = widths[i + 1] + maxDelta;
    }
    applyCaps();
    applyLocks();

    for (let i = 0; i < widths.length; i++) {
      if (widths[i] < SIDEWALK_SEGMENT_MIN_WIDTH * 0.45) widths[i] = 0;
    }
    applyCaps();
    applyLocks();
  }

  function smoothSidewalkOuterHeights(heights, widths, pts) {
    if (
      !(heights instanceof Float32Array) ||
      !(widths instanceof Float32Array) ||
      !Array.isArray(pts) ||
      heights.length !== widths.length ||
      heights.length < 3
    ) {
      return;
    }

    for (let pass = 0; pass < 1; pass++) {
      for (let i = 1; i < heights.length - 1; i++) {
        if (widths[i] <= 0) continue;
        const prevWeight = widths[i - 1] > 0 ? 1 : 0;
        const nextWeight = widths[i + 1] > 0 ? 1 : 0;
        if (!prevWeight && !nextWeight) continue;
        const neighborSum =
          (prevWeight ? heights[i - 1] : 0) +
          (nextWeight ? heights[i + 1] : 0);
        const neighborCount = prevWeight + nextWeight;
        if (!neighborCount) continue;
        heights[i] = heights[i] * 0.68 + (neighborSum / neighborCount) * 0.32;
      }
    }
  }

  function computeSidewalkCornerScale(pts, index, sideSign) {
    if (!Array.isArray(pts) || index <= 0 || index >= pts.length - 1) return 1;
    const prev = pts[index - 1];
    const curr = pts[index];
    const next = pts[index + 1];
    if (!prev || !curr || !next) return 1;

    const inX = curr.x - prev.x;
    const inZ = curr.z - prev.z;
    const outX = next.x - curr.x;
    const outZ = next.z - curr.z;
    const inLen = Math.hypot(inX, inZ) || 1;
    const outLen = Math.hypot(outX, outZ) || 1;
    const inDirX = inX / inLen;
    const inDirZ = inZ / inLen;
    const outDirX = outX / outLen;
    const outDirZ = outZ / outLen;

    const turnAngle = Math.acos(Math.max(-1, Math.min(1, inDirX * outDirX + inDirZ * outDirZ)));
    if (!Number.isFinite(turnAngle) || turnAngle < 0.14) return 1;

    const turnCross = inDirX * outDirZ - inDirZ * outDirX;
    const insideCorner = turnCross * sideSign > 0.02;
    if (!insideCorner) return 1;

    const severity = Math.max(0, Math.min(1, (turnAngle - 0.14) / 1.1));
    return Math.max(0.18, Math.min(1, 1 - severity * 0.78));
  }

  return {
    clampSidewalkWidthTransitions,
    computeSidewalkCornerScale,
    resolveSidewalkWidth,
    roadBaseSidewalkWidth,
    roadConnectedSidewalkContinuity,
    roadHasExplicitSidewalkHint,
    roadSupportsInferredUrbanSidewalks,
    roadSupportsSidewalks,
    smoothSidewalkOuterHeights
  };
}
