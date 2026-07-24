import { sampleFeatureSurfaceY } from "../structure-semantics.js?v=21";

export function buildSidewalkStripBatch(options = {}) {
  const {
    pts,
    edgePoints,
    sideSign,
    halfWidth,
    desiredWidth,
    roadFeature,
    buildingCandidates,
    nearbyIntersections = [],
    endpointIntersections = null,
    constants = {},
    deps = {},
    targets = {}
  } = options;

  const {
    SIDEWALK_INNER_GAP = 0.18,
    SIDEWALK_MIN_WIDTH = 0.9,
    SIDEWALK_SEGMENT_MIN_WIDTH = 0.62,
    SIDEWALK_CURB_LIFT = 0.05,
    SIDEWALK_HEIGHT_BIAS = 0.13
  } = constants;

  const {
    appendIndexedGeometry,
    cachedTerrainHeight,
    clampSidewalkWidthTransitions,
    computeIntersectionCapRadius,
    computeSidewalkCornerScale,
    resolveSidewalkWidth,
    smoothSidewalkOuterHeights
  } = deps;

  const { sidewalkBatchVerts, sidewalkBatchIdx } = targets;

  if (!Array.isArray(pts) || pts.length < 2 || !Array.isArray(edgePoints) || edgePoints.length !== pts.length) return;
  if (!Number.isFinite(desiredWidth) || desiredWidth < SIDEWALK_MIN_WIDTH) return;

  const widths = new Float32Array(pts.length);
  const widthCaps = new Float32Array(pts.length);
  const widthLocked = new Uint8Array(pts.length);
  let pathDistances = null;
  let totalPathLength = 0;

  if (endpointIntersections?.start || endpointIntersections?.end) {
    pathDistances = new Float32Array(pts.length);
    for (let i = 1; i < pts.length; i++) {
      totalPathLength += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      pathDistances[i] = totalPathLength;
    }
  }

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let dx;
    let dz;
    if (i === 0) {
      dx = pts[1].x - p.x;
      dz = pts[1].z - p.z;
    } else if (i === pts.length - 1) {
      dx = p.x - pts[i - 1].x;
      dz = p.z - pts[i - 1].z;
    } else {
      dx = pts[i + 1].x - pts[i - 1].x;
      dz = pts[i + 1].z - pts[i - 1].z;
    }
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const outwardX = sideSign > 0 ? nx : -nx;
    const outwardZ = sideSign > 0 ? nz : -nz;
    let widthAtPoint = resolveSidewalkWidth(
      p.x,
      p.z,
      outwardX,
      outwardZ,
      halfWidth + SIDEWALK_INNER_GAP,
      desiredWidth,
      buildingCandidates
    );
    let widthCap = Math.max(0, desiredWidth * computeSidewalkCornerScale(pts, i, sideSign));
    if (widthAtPoint > widthCap) widthAtPoint = widthCap;

    if (pathDistances && widthAtPoint > 0) {
      const applyEndpointTaper = (intersection, distanceAlongRoad) => {
        if (!intersection || !Number.isFinite(distanceAlongRoad)) return;
        const capRadius = computeIntersectionCapRadius(intersection);
        const clearDistance = capRadius + Math.max(halfWidth * 0.35, 0.9);
        const taperDistance = clearDistance + Math.max(halfWidth + desiredWidth + 4.5, 10);
        if (distanceAlongRoad <= clearDistance) {
          widthAtPoint = 0;
          widthCap = 0;
          widthLocked[i] = 1;
          return;
        }
        if (distanceAlongRoad >= taperDistance) return;
        const t = Math.max(0, Math.min(1, (distanceAlongRoad - clearDistance) / Math.max(1, taperDistance - clearDistance)));
        const fade = t * t * (3 - 2 * t);
        widthCap = Math.min(widthCap, desiredWidth * fade);
        widthAtPoint = Math.min(widthAtPoint, widthCap);
      };

      if (endpointIntersections?.start) {
        applyEndpointTaper(endpointIntersections.start, pathDistances[i]);
      }
      if (!widthLocked[i] && endpointIntersections?.end) {
        applyEndpointTaper(endpointIntersections.end, totalPathLength - pathDistances[i]);
      }
    }

    if (widthAtPoint > 0 && nearbyIntersections.length > 0) {
      for (let j = 0; j < nearbyIntersections.length; j++) {
        const intersection = nearbyIntersections[j];
        const capRadius = computeIntersectionCapRadius(intersection);
        const taperRadius = capRadius + Math.max(halfWidth + desiredWidth + 2, 8);
        const dist = Math.hypot(p.x - intersection.x, p.z - intersection.z);
        if (dist >= taperRadius) continue;
        if (dist <= capRadius) {
          widthAtPoint = 0;
          widthCap = 0;
          widthLocked[i] = 1;
          break;
        }
        const t = Math.max(0, Math.min(1, (dist - capRadius) / Math.max(1, taperRadius - capRadius)));
        const fade = t * t * (3 - 2 * t);
        widthCap = Math.min(widthCap, desiredWidth * fade);
        widthAtPoint = Math.min(widthAtPoint, widthCap);
      }
    }

    widths[i] = widthAtPoint;
    widthCaps[i] = widthCap;
  }

  for (let pass = 0; pass < 1; pass++) {
    for (let i = 1; i < widths.length - 1; i++) {
      if (widthLocked[i]) {
        widths[i] = 0;
        continue;
      }
      let neighborSum = 0;
      let neighborCount = 0;
      if (!widthLocked[i - 1]) {
        neighborSum += widths[i - 1];
        neighborCount += 1;
      }
      if (!widthLocked[i + 1]) {
        neighborSum += widths[i + 1];
        neighborCount += 1;
      }
      if (!neighborCount) continue;
      const neighborAvg = neighborSum / neighborCount;
      const smoothed = widths[i] * 0.7 + neighborAvg * 0.3;
      widths[i] = Math.min(widthCaps[i], smoothed);
    }
  }

  clampSidewalkWidthTransitions(widths, pts, widthCaps, widthLocked);

  const outerHeights = new Float32Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let dx;
    let dz;
    if (i === 0) {
      dx = pts[1].x - p.x;
      dz = pts[1].z - p.z;
    } else if (i === pts.length - 1) {
      dx = p.x - pts[i - 1].x;
      dz = p.z - pts[i - 1].z;
    } else {
      dx = pts[i + 1].x - pts[i - 1].x;
      dz = pts[i + 1].z - pts[i - 1].z;
    }
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const outwardX = sideSign > 0 ? nx : -nx;
    const outwardZ = sideSign > 0 ? nz : -nz;
    const innerOffset = halfWidth + SIDEWALK_INNER_GAP;
    const width = widths[i] >= SIDEWALK_MIN_WIDTH ? widths[i] : 0;
    const innerY = edgePoints[i].y + SIDEWALK_CURB_LIFT;
    const outerX = p.x + outwardX * (innerOffset + width);
    const outerZ = p.z + outwardZ * (innerOffset + width);
    const elevatedSurfaceY =
      roadFeature?.structureSemantics?.terrainMode !== "at_grade" ?
        sampleFeatureSurfaceY(roadFeature, outerX, outerZ) :
        NaN;
    const outerTerrainY = Number.isFinite(elevatedSurfaceY) ?
      elevatedSurfaceY + SIDEWALK_CURB_LIFT :
      cachedTerrainHeight(outerX, outerZ) + SIDEWALK_HEIGHT_BIAS;
    outerHeights[i] = width > 0 ? Math.max(outerTerrainY, innerY - 0.18) : innerY;
  }

  smoothSidewalkOuterHeights(outerHeights, widths, pts);

  const localVerts = [];
  const localIdx = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let dx;
    let dz;
    if (i === 0) {
      dx = pts[1].x - p.x;
      dz = pts[1].z - p.z;
    } else if (i === pts.length - 1) {
      dx = p.x - pts[i - 1].x;
      dz = p.z - pts[i - 1].z;
    } else {
      dx = pts[i + 1].x - pts[i - 1].x;
      dz = pts[i + 1].z - pts[i - 1].z;
    }
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const outwardX = sideSign > 0 ? nx : -nx;
    const outwardZ = sideSign > 0 ? nz : -nz;
    const innerOffset = halfWidth + SIDEWALK_INNER_GAP;
    const width = widths[i] >= SIDEWALK_MIN_WIDTH ? widths[i] : 0;
    const innerX = p.x + outwardX * innerOffset;
    const innerZ = p.z + outwardZ * innerOffset;
    const outerX = p.x + outwardX * (innerOffset + width);
    const outerZ = p.z + outwardZ * (innerOffset + width);
    const innerY = edgePoints[i].y + SIDEWALK_CURB_LIFT;
    const outerY = width > 0 ? Math.max(outerHeights[i], innerY - 0.18) : innerY;
    localVerts.push(innerX, innerY, innerZ);
    localVerts.push(outerX, outerY, outerZ);
    if (i < pts.length - 1) {
      const nextWidth = widths[i + 1] >= SIDEWALK_MIN_WIDTH ? widths[i + 1] : 0;
      const segmentWidth = Math.max(width, nextWidth);
      const narrowSide = Math.min(width, nextWidth);
      if (segmentWidth >= SIDEWALK_SEGMENT_MIN_WIDTH && narrowSide >= SIDEWALK_SEGMENT_MIN_WIDTH * 0.25) {
        const vi = i * 2;
        localIdx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
      }
    }
  }

  if (localIdx.length > 0) {
    appendIndexedGeometry(sidewalkBatchVerts, sidewalkBatchIdx, localVerts, localIdx);
  }
}
