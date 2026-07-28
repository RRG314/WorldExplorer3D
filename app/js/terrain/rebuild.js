import { ctx as appCtx } from "../shared-context.js?v=55";
import { appendUpwardRibbonGeometry, buildIndexedBatchMesh } from "../road-render.js?v=2";
import { detectRoadIntersections } from "./intersections.js?v=1";
import {
  buildFeatureRibbonEdges,
  enforceAtGradeRibbonClearance,
  projectPointToFeature,
  sampleFeatureSurfaceY,
  shouldRenderRoadSkirts
} from "../structure-semantics.js?v=25";
import { compileIntersectionTopologyGeometry } from "./intersection-geometry.js?v=1";
import { buildSidewalkStripBatch } from "./sidewalk-batching.js?v=3";

const ROAD_SURFACE_BIAS = 0.08;

export { detectRoadIntersections };

function shouldBuildIntersectionCap(intersection) {
  if (!intersection || !Array.isArray(intersection.roads)) return false;
  if (intersection.roads.length < 3) return false;
  return true;
}

function computeIntersectionCapRadius(intersection) {
  const maxWidth = Number(intersection?.maxWidth || 8);
  const roads = Array.isArray(intersection?.roads) ? intersection.roads : [];
  const branchCount = Math.max(2, roads.length);
  const avgWidth = roads.length > 0 ?
    roads.reduce((sum, r) => sum + Number(r?.width || maxWidth), 0) / roads.length :
    maxWidth;

  const halfWidth = Math.max(avgWidth * 0.28, maxWidth * 0.26);
  const branchBoost = Math.min(0.04, Math.max(0, (branchCount - 4) * 0.02));
  const unclamped = halfWidth * (1 + branchBoost);
  const minRadius = maxWidth * 0.22;
  const maxRadius = maxWidth * 0.34;
  return Math.max(minRadius, Math.min(maxRadius, unclamped));
}

function polylineLengthLocal(points = []) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return total;
}

function trimPolylineEndpoints(points = [], startTrim = 0, endTrim = 0) {
  if (!Array.isArray(points) || points.length < 2) return Array.isArray(points) ? points.slice() : [];
  const totalLength = polylineLengthLocal(points);
  if (!(totalLength > 0)) return points.slice();

  const safeStartTrim = Math.max(0, Math.min(Number(startTrim) || 0, totalLength * 0.32));
  const safeEndTrim = Math.max(0, Math.min(Number(endTrim) || 0, totalLength * 0.32));
  if (safeStartTrim <= 0 && safeEndTrim <= 0) return points.slice();
  if (safeStartTrim + safeEndTrim >= totalLength - 2.5) return points.slice();

  let startIndex = 0;
  let startPoint = { ...points[0] };
  let remainingStart = safeStartTrim;
  while (remainingStart > 1e-4 && startIndex < points.length - 1) {
    const a = points[startIndex];
    const b = points[startIndex + 1];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    if (!(segLen > 1e-4)) {
      startIndex += 1;
      startPoint = { ...points[startIndex] };
      continue;
    }
    if (remainingStart >= segLen) {
      remainingStart -= segLen;
      startIndex += 1;
      startPoint = { ...points[startIndex] };
      continue;
    }
    const t = remainingStart / segLen;
    startPoint = {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t
    };
    remainingStart = 0;
  }

  let endIndex = points.length - 1;
  let endPoint = { ...points[endIndex] };
  let remainingEnd = safeEndTrim;
  while (remainingEnd > 1e-4 && endIndex > 0) {
    const a = points[endIndex];
    const b = points[endIndex - 1];
    const segLen = Math.hypot(a.x - b.x, a.z - b.z);
    if (!(segLen > 1e-4)) {
      endIndex -= 1;
      endPoint = { ...points[endIndex] };
      continue;
    }
    if (remainingEnd >= segLen) {
      remainingEnd -= segLen;
      endIndex -= 1;
      endPoint = { ...points[endIndex] };
      continue;
    }
    const t = remainingEnd / segLen;
    endPoint = {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t
    };
    remainingEnd = 0;
  }

  if (startIndex >= endIndex && Math.hypot(endPoint.x - startPoint.x, endPoint.z - startPoint.z) < 2.5) {
    return points.slice();
  }

  const trimmed = [startPoint];
  for (let i = startIndex + 1; i < endIndex; i++) trimmed.push(points[i]);
  trimmed.push(endPoint);
  return trimmed;
}

function trimRoadVisualPointsForCaps(points, options = {}) {
  const {
    endIntersection = null,
    halfWidth = 0,
    startIntersection = null
  } = options;
  const trimForIntersection = (intersection) => {
    if (!shouldBuildIntersectionCap(intersection)) return 0;
    const radius = computeIntersectionCapRadius(intersection);
    return Math.max(0, radius - Math.min(Math.max(halfWidth * 0.22, 0.3), 0.85));
  };
  return trimPolylineEndpoints(
    points,
    trimForIntersection(startIntersection),
    trimForIntersection(endIntersection)
  );
}

function appendIndexedGeometry(targetVerts, targetIndices, verts, indices) {
  if (!Array.isArray(verts) || verts.length === 0) return;
  const baseVertex = targetVerts.length / 3;
  targetVerts.push(...verts);
  if (Array.isArray(indices) && indices.length > 0) {
    for (let i = 0; i < indices.length; i++) {
      targetIndices.push(indices[i] + baseVertex);
    }
  } else {
    const count = verts.length / 3;
    for (let i = 0; i < count; i++) {
      targetIndices.push(baseVertex + i);
    }
  }
}

function appendRoadCenterMarkings(road, points, targetVerts, targetIndices) {
  if (
    (Number(road?.width) || 0) < 8.4 ||
    !/(motorway|trunk|primary)/.test(String(road?.type || "")) ||
    !Array.isArray(points) ||
    points.length < 2
  ) return;

  const markHalfWidth = 0.15;
  const dashLength = 6;
  const patternLength = 12;
  let distanceBeforeSegment = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const segmentLength = Math.hypot(dx, dz);
    if (!(segmentLength > 1e-5)) continue;
    const dirX = dx / segmentLength;
    const dirZ = dz / segmentLength;
    const normalX = -dirZ;
    const normalZ = dirX;
    let localDistance = 0;
    while (localDistance < segmentLength) {
      const globalDistance = distanceBeforeSegment + localDistance;
      const phase = ((globalDistance % patternLength) + patternLength) % patternLength;
      const advanceToDash = phase < dashLength ? 0 : patternLength - phase;
      const dashStart = localDistance + advanceToDash;
      if (dashStart >= segmentLength) break;
      const activePhase = (distanceBeforeSegment + dashStart) % patternLength;
      const availableDash = dashLength - activePhase;
      const dashEnd = Math.min(segmentLength, dashStart + Math.max(0.01, availableDash));
      const x1 = start.x + dirX * dashStart;
      const z1 = start.z + dirZ * dashStart;
      const x2 = start.x + dirX * dashEnd;
      const z2 = start.z + dirZ * dashEnd;
      const y1 = sampleFeatureSurfaceY(road, x1, z1) + 0.012;
      const y2 = sampleFeatureSurfaceY(road, x2, z2) + 0.012;
      if (Number.isFinite(y1) && Number.isFinite(y2)) {
        const baseVertex = targetVerts.length / 3;
        targetVerts.push(
          x1 + normalX * markHalfWidth, y1, z1 + normalZ * markHalfWidth,
          x1 - normalX * markHalfWidth, y1, z1 - normalZ * markHalfWidth,
          x2 + normalX * markHalfWidth, y2, z2 + normalZ * markHalfWidth,
          x2 - normalX * markHalfWidth, y2, z2 - normalZ * markHalfWidth
        );
        targetIndices.push(
          baseVertex, baseVertex + 2, baseVertex + 1,
          baseVertex + 1, baseVertex + 2, baseVertex + 3
        );
      }
      localDistance = Math.max(dashEnd, dashStart + 0.01);
      const newPhase = (distanceBeforeSegment + localDistance) % patternLength;
      if (newPhase < dashLength) localDistance += dashLength - newPhase;
    }
    distanceBeforeSegment += segmentLength;
  }
}

export function buildRoadSkirts(leftEdge, rightEdge, skirtDepth = 1.5) {
  const verts = [];
  const indices = [];

  for (let i = 0; i < leftEdge.length; i++) {
    const top = leftEdge[i];
    verts.push(top.x, top.y, top.z);
    verts.push(top.x, top.y - skirtDepth, top.z);

    if (i < leftEdge.length - 1) {
      const vi = i * 2;
      indices.push(vi, vi + 1, vi + 2);
      indices.push(vi + 1, vi + 3, vi + 2);
    }
  }

  for (let i = 0; i < rightEdge.length; i++) {
    const top = rightEdge[i];
    const baseIdx = leftEdge.length * 2 + i * 2;
    verts.push(top.x, top.y, top.z);
    verts.push(top.x, top.y - skirtDepth, top.z);

    if (i < rightEdge.length - 1) {
      const vi = baseIdx;
      indices.push(vi, vi + 1, vi + 2);
      indices.push(vi + 1, vi + 3, vi + 2);
    }
  }

  return { verts, indices };
}

export function publishCompiledTransportMeshes(deps = {}) {
  const {
    terrain,
    constants = {},
    disableRoadDebugMode,
    clearTerrainHeightCache,
    getSharedRoadMaterials,
    getSharedUrbanSurfaceMaterials,
    boundsIntersectLocal,
    expandBoundsLocal,
    pointsBoundsLocal,
    isUrbanLanduseType,
    isGreenLanduseType,
    roadHasExplicitSidewalkHint,
    roadConnectedSidewalkContinuity,
    roadSupportsInferredUrbanSidewalks,
    roadSupportsSidewalks,
    roadBaseSidewalkWidth,
    resolveSidewalkWidth,
    computeSidewalkCornerScale,
    clampSidewalkWidthTransitions,
    smoothSidewalkOuterHeights,
    cachedTerrainHeight,
    cachedBaseTerrainHeight,
    subdivideRoadPoints,
    pointAlongPolyline,
    polylineCurvatureMetric,
    rebuildStructureVisualMeshes,
    validateRoadTerrainConformance
  } = deps;

  const {
    SIDEWALK_INNER_GAP = 0.18,
    SIDEWALK_MIN_WIDTH = 0.9,
    SIDEWALK_SEGMENT_MIN_WIDTH = 0.62,
    SIDEWALK_CURB_LIFT = 0.05,
    SIDEWALK_HEIGHT_BIAS = 0.13,
    URBAN_CONTEXT_PAD = 26
  } = constants;

  if (!appCtx.terrainEnabled || appCtx.roads.length === 0 || appCtx.onMoon) return;
  const baseRoads = appCtx.roads;
  if (baseRoads.length === 0) return;

  if (typeof disableRoadDebugMode === "function") {
    disableRoadDebugMode();
  }

  if (typeof clearTerrainHeightCache === "function") clearTerrainHeightCache();
  if (typeof appCtx.refreshStructureAwareFeatureProfiles === "function") {
    appCtx.refreshStructureAwareFeatureProfiles();
  }

  appCtx.roadMeshes.forEach((mesh) => {
    mesh.parent?.remove?.(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material && !mesh.userData?.sharedRoadMaterial) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => {
          if (mat && typeof mat.dispose === "function") mat.dispose();
        });
      } else if (typeof mesh.material.dispose === "function") {
        mesh.material.dispose();
      }
    }
  });
  appCtx.replaceWorldCollection('roadMeshes');

  appCtx.urbanSurfaceMeshes.forEach((mesh) => {
    mesh.parent?.remove?.(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material && !mesh.userData?.sharedUrbanSurfaceMaterial && typeof mesh.material.dispose === "function") {
      mesh.material.dispose();
    }
  });
  appCtx.replaceWorldCollection('urbanSurfaceMeshes');
  appCtx.urbanSurfaceStats = {
    sidewalkBatchCount: 0,
    sidewalkVertices: 0,
    sidewalkTriangles: 0,
    skippedBuildingAprons: Number(appCtx.urbanSurfaceStats?.skippedBuildingAprons || 0)
  };

  const intersections = detectRoadIntersections(baseRoads);

  const roadMainBatchVerts = [];
  const roadMainBatchIdx = [];
  const roadSkirtBatchVerts = [];
  const roadSkirtBatchIdx = [];
  const roadCapBatchVerts = [];
  const roadCapBatchIdx = [];
  const roadMarkBatchVerts = [];
  const roadMarkBatchIdx = [];
  const sidewalkBatchVerts = [];
  const sidewalkBatchIdx = [];

  const sharedRoadMaterials = typeof getSharedRoadMaterials === "function" ? getSharedRoadMaterials() : {};
  const roadMat = sharedRoadMaterials.roadMat;
  const skirtMat = sharedRoadMaterials.skirtMat;
  const capMat = sharedRoadMaterials.capMat;
  const markMat = sharedRoadMaterials.markMat;
  const urbanSurfaceMaterials = typeof getSharedUrbanSurfaceMaterials === "function" ? getSharedUrbanSurfaceMaterials() : {};
  const sidewalkMat = urbanSurfaceMaterials.sidewalkMat;

  baseRoads.forEach((road, roadIdx) => {
    if (!road || !Array.isArray(road.pts) || road.pts.length < 2) return;
    const { width } = road;
    const hw = width / 2;

    const baseDetail = Number.isFinite(road?.subdivideMaxDist) ? road.subdivideMaxDist : 3.5;
    const hasTransitionAnchors = Array.isArray(road?.structureTransitionAnchors) && road.structureTransitionAnchors.length > 0;
    const detail =
      road?.structureSemantics?.terrainMode && road.structureSemantics.terrainMode !== "at_grade" ?
        Math.min(baseDetail, 0.55) :
        hasTransitionAnchors ?
          Math.min(baseDetail, 0.6) :
          baseDetail;
    const basePts = subdivideRoadPoints(road.pts, detail);
    const endpointIntersectionRefs = {
      start: intersections.find((intersection) =>
        !intersection?.hasGradeSeparatedRoad &&
        intersection?.roads?.some((entry) => entry.roadIdx === roadIdx && entry.ptIdx === 0)
      ) || null,
      end: intersections.find((intersection) =>
        !intersection?.hasGradeSeparatedRoad &&
        intersection?.roads?.some((entry) => entry.roadIdx === roadIdx && entry.ptIdx === road.pts.length - 1)
      ) || null
    };
    const pts =
      road?.structureSemantics?.terrainMode === "at_grade" && !hasTransitionAnchors ?
        trimRoadVisualPointsForCaps(basePts, {
          startIntersection: endpointIntersectionRefs.start,
          endIntersection: endpointIntersectionRefs.end,
          halfWidth: hw
        }) :
        basePts;
    if (!Array.isArray(pts) || pts.length < 2) return;

    const verts = [];
    const indices = [];
    const leftEdge = [];
    const rightEdge = [];
    const roadBounds = road.bounds || pointsBoundsLocal(road.pts, width * 0.5 + URBAN_CONTEXT_PAD);
    const contextBounds = expandBoundsLocal(roadBounds, URBAN_CONTEXT_PAD);
    const contextCenterX = (contextBounds.minX + contextBounds.maxX) * 0.5;
    const contextCenterZ = (contextBounds.minZ + contextBounds.maxZ) * 0.5;
    const contextRadius = Math.max(
      20,
      Math.hypot(contextBounds.maxX - contextBounds.minX, contextBounds.maxZ - contextBounds.minZ) * 0.5
    );
    const nearbyBuildings = typeof appCtx.getNearbyBuildings === "function" ?
      appCtx.getNearbyBuildings(contextCenterX, contextCenterZ, contextRadius) :
      appCtx.buildings;
    const buildingCandidates = Array.isArray(nearbyBuildings) ? nearbyBuildings.filter((building) =>
      boundsIntersectLocal(building, contextBounds)
    ) : [];
    const nearbyLanduses = Array.isArray(appCtx.landuses) ? appCtx.landuses.filter((landuse) =>
      boundsIntersectLocal(landuse.bounds || pointsBoundsLocal(landuse.pts || []), contextBounds)
    ) : [];
    const nearbyUrbanLanduses = nearbyLanduses.filter((landuse) => isUrbanLanduseType(landuse?.type)).length;
    const nearbyGreenLanduses = nearbyLanduses.filter((landuse) => isGreenLanduseType(landuse?.type)).length;
    const explicitSidewalkHint = roadHasExplicitSidewalkHint(road);
    const roadLength = polylineLengthLocal(road.pts);
    const denseUrbanContext =
      nearbyUrbanLanduses >= 2 ||
      buildingCandidates.length >= 12 ||
      (buildingCandidates.length >= 8 && width >= 9) ||
      (nearbyUrbanLanduses >= 1 && buildingCandidates.length >= 5);
    const ruralGreenContext =
      nearbyUrbanLanduses === 0 &&
      (nearbyGreenLanduses > 0 || buildingCandidates.length < 4);
    const shouldBuildSidewalks =
      roadSupportsSidewalks(road) &&
      explicitSidewalkHint;
    const sidewalkWidth = shouldBuildSidewalks ? roadBaseSidewalkWidth(road, denseUrbanContext) : 0;
    const nearbyIntersections = shouldBuildSidewalks ? intersections.filter((intersection) =>
      !intersection?.hasGradeSeparatedRoad &&
      boundsIntersectLocal(roadBounds, { minX: intersection.x, maxX: intersection.x, minZ: intersection.z, maxZ: intersection.z }, Math.max(width * 1.1, 8))
    ) : [];
    const endpointIntersections = shouldBuildSidewalks ? endpointIntersectionRefs : null;

    const roadTerrainSampler = road?.structureSemantics?.terrainMode === "at_grade" ?
      cachedTerrainHeight :
      cachedBaseTerrainHeight;
    const ribbonEdges = buildFeatureRibbonEdges(road, pts, hw, roadTerrainSampler, {
      surfaceBias: Number.isFinite(road?.surfaceBias) ? road.surfaceBias : ROAD_SURFACE_BIAS
    });
    leftEdge.push(...ribbonEdges.leftEdge);
    rightEdge.push(...ribbonEdges.rightEdge);

    enforceAtGradeRibbonClearance(
      road,
      leftEdge,
      rightEdge,
      roadTerrainSampler,
      Number.isFinite(road?.surfaceBias) ? road.surfaceBias : ROAD_SURFACE_BIAS
    );

    appendUpwardRibbonGeometry(leftEdge, rightEdge, verts, indices);
    appendIndexedGeometry(roadMainBatchVerts, roadMainBatchIdx, verts, indices);
    appendRoadCenterMarkings(road, pts, roadMarkBatchVerts, roadMarkBatchIdx);

    const terrainMode = road?.structureSemantics?.terrainMode;
    if (shouldRenderRoadSkirts(road)) {
      const skirtDepth = terrainMode === "subgrade" ? 0.3 : 3.6;
      const skirtData = buildRoadSkirts(leftEdge, rightEdge, skirtDepth);
      if (skirtData.verts.length > 0) {
        appendIndexedGeometry(roadSkirtBatchVerts, roadSkirtBatchIdx, skirtData.verts, skirtData.indices);
      }
    }

    if (shouldBuildSidewalks) {
      const allowLeft = road.sidewalkHint !== "right";
      const allowRight = road.sidewalkHint !== "left";
      if (allowLeft) {
        buildSidewalkStripBatch({
          pts,
          edgePoints: leftEdge,
          sideSign: 1,
          halfWidth: hw,
          desiredWidth: sidewalkWidth,
          roadFeature: road,
          buildingCandidates,
          nearbyIntersections,
          endpointIntersections,
          constants: {
            SIDEWALK_INNER_GAP,
            SIDEWALK_MIN_WIDTH,
            SIDEWALK_SEGMENT_MIN_WIDTH,
            SIDEWALK_CURB_LIFT,
            SIDEWALK_HEIGHT_BIAS
          },
          deps: {
            appendIndexedGeometry,
            cachedTerrainHeight,
            clampSidewalkWidthTransitions,
            computeIntersectionCapRadius,
            computeSidewalkCornerScale,
            resolveSidewalkWidth,
            smoothSidewalkOuterHeights
          },
          targets: {
            sidewalkBatchVerts,
            sidewalkBatchIdx
          }
        });
      }
      if (allowRight) {
        buildSidewalkStripBatch({
          pts,
          edgePoints: rightEdge,
          sideSign: -1,
          halfWidth: hw,
          desiredWidth: sidewalkWidth,
          roadFeature: road,
          buildingCandidates,
          nearbyIntersections,
          endpointIntersections,
          constants: {
            SIDEWALK_INNER_GAP,
            SIDEWALK_MIN_WIDTH,
            SIDEWALK_SEGMENT_MIN_WIDTH,
            SIDEWALK_CURB_LIFT,
            SIDEWALK_HEIGHT_BIAS
          },
          deps: {
            appendIndexedGeometry,
            cachedTerrainHeight,
            clampSidewalkWidthTransitions,
            computeIntersectionCapRadius,
            computeSidewalkCornerScale,
            resolveSidewalkWidth,
            smoothSidewalkOuterHeights
          },
          targets: {
            sidewalkBatchVerts,
            sidewalkBatchIdx
          }
        });
      }
    }
  });

  intersections.forEach((intersection) => {
    if (intersection?.hasGradeSeparatedRoad) return;
    if (!shouldBuildIntersectionCap(intersection)) return;
    const capData = compileIntersectionTopologyGeometry(intersection, baseRoads, {
      computeRadius: computeIntersectionCapRadius,
      projectPointToFeature,
      sampleFeatureSurfaceY,
      sampleGroundY: cachedTerrainHeight,
      surfaceBias: ROAD_SURFACE_BIAS
    });
    appendIndexedGeometry(roadCapBatchVerts, roadCapBatchIdx, capData.verts, capData.indices);
  });

  buildIndexedBatchMesh({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    verts: roadMainBatchVerts,
    indices: roadMainBatchIdx,
    material: roadMat,
    renderOrder: 2,
    userData: { isRoadBatch: true, sharedRoadMaterial: true, worldLoadSequence: appCtx._worldLoadSequence || 0 }
  });
  buildIndexedBatchMesh({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    verts: roadSkirtBatchVerts,
    indices: roadSkirtBatchIdx,
    material: skirtMat,
    renderOrder: 1,
    userData: { isRoadBatch: true, isRoadSkirt: true, sharedRoadMaterial: true, worldLoadSequence: appCtx._worldLoadSequence || 0 }
  });
  buildIndexedBatchMesh({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    verts: roadCapBatchVerts,
    indices: roadCapBatchIdx,
    material: capMat,
    renderOrder: 3,
    userData: { isRoadBatch: true, isIntersectionCap: true, sharedRoadMaterial: true, worldLoadSequence: appCtx._worldLoadSequence || 0 }
  });
  buildIndexedBatchMesh({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    verts: roadMarkBatchVerts,
    indices: roadMarkBatchIdx,
    material: markMat,
    renderOrder: 4,
    receiveShadow: false,
    userData: { isRoadBatch: true, isRoadMarking: true, sharedRoadMaterial: true, worldLoadSequence: appCtx._worldLoadSequence || 0 }
  });
  if (sidewalkBatchVerts.length > 0 && sidewalkBatchIdx.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(sidewalkBatchVerts, 3));
    const vertexCount = sidewalkBatchVerts.length / 3;
    const indexArray = vertexCount > 65535 ? new Uint32Array(sidewalkBatchIdx) : new Uint16Array(sidewalkBatchIdx);
    geo.setIndex(new THREE.BufferAttribute(indexArray, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, sidewalkMat);
    mesh.renderOrder = 2;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    Object.assign(mesh.userData, {
      isUrbanSurfaceBatch: true,
      isSidewalkBatch: true,
      sharedUrbanSurfaceMaterial: true
    });
    appCtx.scene.add(mesh);
    appCtx.urbanSurfaceMeshes.push(mesh);
    appCtx.urbanSurfaceStats.sidewalkBatchCount += 1;
    appCtx.urbanSurfaceStats.sidewalkVertices += vertexCount;
    appCtx.urbanSurfaceStats.sidewalkTriangles += sidewalkBatchIdx.length / 3;
  }

  rebuildStructureVisualMeshes({
    boundsIntersect: boundsIntersectLocal,
    cachedTerrainHeight,
    pointAlongPolyline,
    polylineCurvatureMetric
  });

  appCtx.transportSurfacePublication = Object.freeze({
    authority: "compiled_transport_surface",
    roadCount: baseRoads.length,
    meshCount: appCtx.roadMeshes.length,
    intersectionCount: intersections.filter((intersection) =>
      !intersection?.hasGradeSeparatedRoad && shouldBuildIntersectionCap(intersection)
    ).length,
    compiledSampleCount: baseRoads.reduce((total, road) =>
      total + Number(road?.transportSurfaceModel?.distances?.length || 0), 0),
    vertices:
      roadMainBatchVerts.length / 3 +
      roadSkirtBatchVerts.length / 3 +
      roadCapBatchVerts.length / 3 +
      roadMarkBatchVerts.length / 3,
    triangles:
      roadMainBatchIdx.length / 3 +
      roadSkirtBatchIdx.length / 3 +
      roadCapBatchIdx.length / 3 +
      roadMarkBatchIdx.length / 3,
    worldLoadSequence: appCtx._worldLoadSequence || 0
  });
}
