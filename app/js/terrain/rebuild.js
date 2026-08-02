import { ctx as appCtx } from "../shared-context.js?v=55";
import { appendUpwardRibbonGeometry, buildIndexedBatchMesh } from "../road-render.js?v=2";
import { detectRoadIntersections } from "./intersections.js?v=2";
import {
  buildFeatureRibbonEdges,
  roadSkirtDepth,
  sampleFeatureSurfaceY,
  shouldRenderRoadSkirts
} from "../structure-semantics.js?v=37";
import { buildSidewalkStripBatch } from "./sidewalk-batching.js?v=3";

const ROAD_SURFACE_BIAS = 0.08;

export { detectRoadIntersections };

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

function shouldBuildCompactIntersectionCap(intersection) {
  return !!(
    intersection &&
    intersection.hasGradeSeparatedRoad !== true &&
    Array.isArray(intersection.roads) &&
    intersection.roads.length >= 3
  );
}

function appendCompactIntersectionCap(
  intersection,
  targetVerts,
  targetIndices,
  terrainHeightAt,
  segments = 16
) {
  if (!shouldBuildCompactIntersectionCap(intersection)) return false;
  const sampleTerrain = typeof terrainHeightAt === "function" ? terrainHeightAt : () => 0;
  const radius = computeIntersectionCapRadius(intersection);
  const base = targetVerts.length / 3;
  targetVerts.push(
    Number(intersection.x),
    Number(sampleTerrain(intersection.x, intersection.z)) + ROAD_SURFACE_BIAS + 0.004,
    Number(intersection.z)
  );
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const x = Number(intersection.x) + Math.cos(angle) * radius;
    const z = Number(intersection.z) + Math.sin(angle) * radius;
    targetVerts.push(x, Number(sampleTerrain(x, z)) + ROAD_SURFACE_BIAS + 0.004, z);
  }
  for (let index = 0; index < segments; index += 1) {
    targetIndices.push(base, base + 1 + index, base + 1 + ((index + 1) % segments));
  }
  return true;
}

export {
  appendCompactIntersectionCap,
  computeIntersectionCapRadius,
  shouldBuildCompactIntersectionCap
};

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
  const laneCount = Math.max(1, Number(road?.transportRecord?.crossSection?.lanes) || 1);
  const corridorOffset = Number(
    road?.transportRecord?.crossSection?.placement?.centerlineOffsetMeters
  ) || 0;
  const markingOffsets = Array.from({ length: Math.max(1, laneCount - 1) }, (_, index) =>
    laneCount > 1
      ? -Number(road.width) * 0.5 + Number(road.width) * (index + 1) / laneCount
      : 0
  );
  for (const laneOffset of markingOffsets) {
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
      const lateralOffset = corridorOffset + laneOffset;
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
        const x1 = start.x + dirX * dashStart + normalX * lateralOffset;
        const z1 = start.z + dirZ * dashStart + normalZ * lateralOffset;
        const x2 = start.x + dirX * dashEnd + normalX * lateralOffset;
        const z2 = start.z + dirZ * dashEnd + normalZ * lateralOffset;
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
}

export function buildRoadSkirts(leftEdge, rightEdge, skirtDepth = 1.5, baseHeightAt = null) {
  const verts = [];
  const indices = [];
  const bottomY = (top) => {
    const fixedBottom = top.y - skirtDepth;
    if (typeof baseHeightAt !== 'function') return fixedBottom;
    const terrainY = Number(baseHeightAt(top.x, top.z));
    if (!Number.isFinite(terrainY)) return fixedBottom;
    return Math.max(fixedBottom, Math.min(top.y - 0.15, terrainY - 0.25));
  };

  for (let i = 0; i < leftEdge.length; i++) {
    const top = leftEdge[i];
    verts.push(top.x, top.y, top.z);
    verts.push(top.x, bottomY(top), top.z);

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
    verts.push(top.x, bottomY(top), top.z);

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
    constants = {},
    disableRoadDebugMode,
    clearTerrainHeightCache,
    getSharedRoadMaterials,
    getSharedUrbanSurfaceMaterials,
    boundsIntersectLocal,
    expandBoundsLocal,
    pointsBoundsLocal,
    isUrbanLanduseType,
    roadHasExplicitSidewalkHint,
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
  // Do not bend road profiles into a separately fitted junction plane. Those
  // large convex envelopes were wider than the actual carriageway and caused
  // visible polygon fans and edge bumps on slopes. Continuous road ribbons
  // remain authoritative; only a small terrain-draped center cap closes true
  // three-or-more-way gaps.
  for (const road of baseRoads) road.junctionTransitions = [];

  const roadMainBatchVerts = [];
  const roadMainBatchIdx = [];
  const roadSkirtBatchVerts = [];
  const roadSkirtBatchIdx = [];
  const roadMarkBatchVerts = [];
  const roadMarkBatchIdx = [];
  const sidewalkBatchVerts = [];
  const sidewalkBatchIdx = [];

  const sharedRoadMaterials = typeof getSharedRoadMaterials === "function" ? getSharedRoadMaterials() : {};
  const roadMat = sharedRoadMaterials.roadMat;
  const skirtMat = sharedRoadMaterials.skirtMat;
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
    // Preserve the source road as one continuous ribbon. A separate
    // intersection-cap pass previously trimmed these endpoints and filled
    // junctions with fan polygons, exposing circles and triangle boundaries.
    const pts = basePts;
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
    const explicitSidewalkHint = roadHasExplicitSidewalkHint(road);
    const denseUrbanContext =
      nearbyUrbanLanduses >= 2 ||
      buildingCandidates.length >= 12 ||
      (buildingCandidates.length >= 8 && width >= 9) ||
      (nearbyUrbanLanduses >= 1 && buildingCandidates.length >= 5);
    // The detached sidewalk extrusion has no junction/topology authority and
    // produces pale floating strips on steep or fragmented OSM ways. Preserve
    // the mapped sidewalk hint for navigation, but do not publish competing
    // geometry until it can share the road/junction surface contract.
    const shouldBuildSidewalks = false;
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

    appendUpwardRibbonGeometry(leftEdge, rightEdge, verts, indices);
    appendIndexedGeometry(roadMainBatchVerts, roadMainBatchIdx, verts, indices);
    appendRoadCenterMarkings(road, pts, roadMarkBatchVerts, roadMarkBatchIdx);

    if (shouldRenderRoadSkirts(road)) {
      const skirtDepth = roadSkirtDepth(road);
      const skirtData = buildRoadSkirts(
        leftEdge,
        rightEdge,
        skirtDepth,
        road?.structureSemantics?.terrainMode === "at_grade" ? roadTerrainSampler : null
      );
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

  let compactJunctionCount = 0;
  for (const intersection of intersections) {
    if (appendCompactIntersectionCap(
      intersection,
      roadMainBatchVerts,
      roadMainBatchIdx,
      cachedTerrainHeight
    )) compactJunctionCount += 1;
  }

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
    transportGraphId: appCtx.transportNetworkModel?.id || null,
    roadCount: baseRoads.length,
    meshCount: appCtx.roadMeshes.length,
    intersectionCount: compactJunctionCount,
    topologyIntersectionCount: intersections.filter((intersection) =>
      !intersection?.hasGradeSeparatedRoad
    ).length,
    compiledSampleCount: baseRoads.reduce((total, road) =>
      total + Number(road?.transportSurfaceModel?.distances?.length || 0), 0),
    vertices:
      roadMainBatchVerts.length / 3 +
      roadSkirtBatchVerts.length / 3 +
      roadMarkBatchVerts.length / 3,
    triangles:
      roadMainBatchIdx.length / 3 +
      roadSkirtBatchIdx.length / 3 +
      roadMarkBatchIdx.length / 3,
    worldLoadSequence: appCtx._worldLoadSequence || 0
  });
}
