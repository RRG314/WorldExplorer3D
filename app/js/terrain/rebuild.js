import { ctx as appCtx } from "../shared-context.js?v=55";
import { appendUpwardRibbonGeometry, buildIndexedBatchMesh } from "../road-render.js?v=4";
import { detectRoadIntersections } from "./intersections.js?v=3";
import { boundsIntersectLocal } from "./context-utils.js?v=1";
import {
  buildFeatureRibbonEdges,
  roadSkirtDepth,
  sampleFeatureSurfaceY,
  shouldRenderRoadSkirts
} from "../structure-semantics.js?v=49";
import { yieldToMainThread } from "../world/cooperative-scheduling.js?v=1";

import {
  computeIntersectionCapRadius,
  shouldBuildCompactIntersectionCap
} from "./road-junctions.js?v=6";

const ROAD_SURFACE_BIAS = 0.18;
const MAX_ROAD_BATCH_VERTICES = 60000;

export { detectRoadIntersections };

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

export function resolveRoadRibbonSubdivisionStep(road) {
  const baseDetail = Number.isFinite(road?.subdivideMaxDist) ? road.subdivideMaxDist : 3.5;
  // The feature compiler already assigns a coarser but bounded subdivision to
  // the fixed regional context. Replacing it here with core-city density turns
  // a complete bridge/tunnel network into millions of unnecessary triangles.
  if (road?.fixedRegionalContext === true) return baseDetail;
  const hasTransitionAnchors = Array.isArray(road?.structureTransitionAnchors) &&
    road.structureTransitionAnchors.length > 0;
  if (road?.structureSemantics?.terrainMode && road.structureSemantics.terrainMode !== "at_grade") {
    return Math.min(baseDetail, 0.55);
  }
  if (hasTransitionAnchors) return Math.min(baseDetail, 0.6);
  return baseDetail;
}

export async function publishCompiledTransportMeshes(deps = {}) {
  const {
    disableRoadDebugMode,
    clearTerrainHeightCache,
    getSharedRoadMaterials,
    cachedTerrainHeight,
    cachedBaseTerrainHeight,
    subdivideRoadPoints,
    pointAlongPolyline,
    polylineCurvatureMetric,
    rebuildStructureVisualMeshes,
    rebuildStructureVisualMeshesCooperatively,
    validateRoadTerrainConformance
  } = deps;

  if (!appCtx.terrainEnabled || appCtx.roads.length === 0 || appCtx.onMoon) return;
  const baseRoads = appCtx.roads;
  if (baseRoads.length === 0) return;
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const publicationStartedAt = now();
  const phaseDurationsMs = Object.create(null);
  const measure = (name, task) => {
    const startedAt = now();
    try {
      return task();
    } finally {
      phaseDurationsMs[name] = Number((now() - startedAt).toFixed(2));
    }
  };
  const measureAsync = async (name, task) => {
    const startedAt = now();
    try {
      return await task();
    } finally {
      phaseDurationsMs[name] = Number((now() - startedAt).toFixed(2));
    }
  };

  if (typeof disableRoadDebugMode === "function") {
    disableRoadDebugMode();
  }

  if (typeof clearTerrainHeightCache === "function") clearTerrainHeightCache();
  if (typeof appCtx.refreshStructureAwareFeatureProfilesCooperatively === "function") {
    await measureAsync(
      'refreshStructureProfiles',
      () => appCtx.refreshStructureAwareFeatureProfilesCooperatively()
    );
  } else if (typeof appCtx.refreshStructureAwareFeatureProfiles === "function") {
    measure('refreshStructureProfiles', () => appCtx.refreshStructureAwareFeatureProfiles());
    await yieldToMainThread();
  }

  measure('disposePreviousMeshes', () => {
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
  });
  appCtx.urbanSurfaceStats = {
    sidewalkBatchCount: 0,
    sidewalkVertices: 0,
    sidewalkTriangles: 0,
    skippedBuildingAprons: Number(appCtx.urbanSurfaceStats?.skippedBuildingAprons || 0)
  };

  const intersections = measure('detectIntersections', () => detectRoadIntersections(baseRoads));
  await yieldToMainThread();
  // Do not bend road profiles into a separately fitted junction plane. Those
  // large convex envelopes were wider than the actual carriageway and caused
  // visible polygon fans and edge bumps on slopes. Continuous road ribbons
  // remain authoritative; only a small terrain-draped center cap closes true
  // three-or-more-way gaps.
  for (const road of baseRoads) road.junctionTransitions = [];

  const roadMainBatches = [];
  let roadMainBatchVerts = [];
  let roadMainBatchIdx = [];
  const roadSkirtBatchVerts = [];
  const roadSkirtBatchIdx = [];
  const roadMarkBatchVerts = [];
  const roadMarkBatchIdx = [];
  const flushRoadMainBatch = () => {
    if (roadMainBatchVerts.length > 0 && roadMainBatchIdx.length > 0) {
      roadMainBatches.push({ verts: roadMainBatchVerts, indices: roadMainBatchIdx });
    }
    roadMainBatchVerts = [];
    roadMainBatchIdx = [];
  };
  const appendRoadMainGeometry = (verts, indices) => {
    const incomingVertices = Array.isArray(verts) ? verts.length / 3 : 0;
    const currentVertices = roadMainBatchVerts.length / 3;
    if (currentVertices > 0 && currentVertices + incomingVertices > MAX_ROAD_BATCH_VERTICES) {
      flushRoadMainBatch();
    }
    appendIndexedGeometry(roadMainBatchVerts, roadMainBatchIdx, verts, indices);
  };

  const sharedRoadMaterials = typeof getSharedRoadMaterials === "function" ? getSharedRoadMaterials() : {};
  const roadMat = sharedRoadMaterials.roadMat;
  const skirtMat = sharedRoadMaterials.skirtMat;
  const markMat = sharedRoadMaterials.markMat;
  await measureAsync('buildRoadRibbons', async () => {
    let sliceStartedAt = now();
    for (let roadIndex = 0; roadIndex < baseRoads.length; roadIndex += 1) {
      const road = baseRoads[roadIndex];
      if (!road || !Array.isArray(road.pts) || road.pts.length < 2) continue;
      const { width } = road;
      const hw = width / 2;

      const requestedDetail = resolveRoadRibbonSubdivisionStep(road);
      const basePts = subdivideRoadPoints(road.pts, requestedDetail);
      // Preserve the source road as one continuous ribbon. A separate
      // intersection-cap pass previously trimmed these endpoints and filled
      // junctions with fan polygons, exposing circles and triangle boundaries.
      const pts = basePts;
      if (!Array.isArray(pts) || pts.length < 2) continue;

      const verts = [];
      const indices = [];
      const leftEdge = [];
      const rightEdge = [];
      const roadTerrainSampler = road?.structureSemantics?.terrainMode === "at_grade" ?
        cachedTerrainHeight :
        cachedBaseTerrainHeight;
      const ribbonEdges = buildFeatureRibbonEdges(road, pts, hw, roadTerrainSampler, {
        surfaceBias: Number.isFinite(road?.surfaceBias) ? road.surfaceBias : ROAD_SURFACE_BIAS
      });
      leftEdge.push(...ribbonEdges.leftEdge);
      rightEdge.push(...ribbonEdges.rightEdge);

      appendUpwardRibbonGeometry(leftEdge, rightEdge, verts, indices);
      appendRoadMainGeometry(verts, indices);
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
      // Large regional locations can publish tens of thousands of ribbons.
      // Yield by elapsed time, rather than a fixed road count, because one
      // complex interchange can cost far more than many short streets.
      if (now() - sliceStartedAt >= 24) {
        await yieldToMainThread();
        sliceStartedAt = now();
      }
    }
  });
  await yieldToMainThread();

  let compactJunctionCount = 0;
  measure('buildJunctionCaps', () => {
    for (const intersection of intersections) {
      const capVerts = [];
      const capIndices = [];
      if (appendCompactIntersectionCap(
        intersection,
        capVerts,
        capIndices,
        cachedTerrainHeight
      )) {
        appendRoadMainGeometry(capVerts, capIndices);
        compactJunctionCount += 1;
      }
    }
    flushRoadMainBatch();
  });

  measure('uploadRoadMeshes', () => {
    roadMainBatches.forEach((batch, batchIndex) => {
      buildIndexedBatchMesh({
        scene: appCtx.scene,
        targetList: appCtx.roadMeshes,
        verts: batch.verts,
        indices: batch.indices,
        material: roadMat,
        renderOrder: 2,
        userData: {
          isRoadBatch: true,
          roadBatchIndex: batchIndex,
          sharedRoadMaterial: true,
          worldLoadSequence: appCtx._worldLoadSequence || 0
        }
      });
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
  });
  await yieldToMainThread();
  await measureAsync('rebuildStructureVisuals', () => (
    typeof rebuildStructureVisualMeshesCooperatively === 'function'
      ? rebuildStructureVisualMeshesCooperatively
      : rebuildStructureVisualMeshes
  )({
    boundsIntersect: boundsIntersectLocal,
    cachedTerrainHeight,
    pointAlongPolyline,
    polylineCurvatureMetric
  }));

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
      roadMainBatches.reduce((sum, batch) => sum + batch.verts.length / 3, 0) +
      roadSkirtBatchVerts.length / 3 +
      roadMarkBatchVerts.length / 3,
    triangles:
      roadMainBatches.reduce((sum, batch) => sum + batch.indices.length / 3, 0) +
      roadSkirtBatchIdx.length / 3 +
      roadMarkBatchIdx.length / 3,
    phaseDurationsMs: Object.freeze({
      ...phaseDurationsMs,
      total: Number((now() - publicationStartedAt).toFixed(2))
    }),
    worldLoadSequence: appCtx._worldLoadSequence || 0
  });
  return appCtx.transportSurfacePublication;
}
