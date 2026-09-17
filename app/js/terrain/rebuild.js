import { STREET_POLYGON_GRID_WORLD } from '../world/compiler/street-polygon-kernel.js';
import { measurePublishedRoadTriangles, roadSourceCoordinateTolerance } from './published-road-integrity.js';
import {emitLocalLoadTrace} from '../world/load-trace.js';
import {prepareCarriagewayTiles} from '../world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../world/compiler/street-carriageway-mesh.js';
import {createPavementTerrainPartitionCooperatively} from '../world/pavement-terrain-partition.js';
import {roadPlacementOffsetWorld} from '../world/road-units.js';
import { markGroundSurfaceChanged } from './surface-revision.js';
import { ctx as appCtx } from "../shared-context.js?v=55";
import { appendUpwardRibbonGeometry, buildIndexedBatchMesh } from "../road-render.js?v=4";
import { detectRoadIntersections } from "./intersections.js?v=5";
import { boundsIntersectLocal } from "./context-utils.js?v=1";
import {
  buildFeatureRibbonEdges,
  roadSkirtDepth,
  sampleFeatureSurfaceY,
  shouldRenderRoadSkirts
} from "../structure-semantics.js?v=63";
import { yieldToMainThread } from "../world/cooperative-scheduling.js?v=1";

import { roadWidthAtSegment } from "../world/road-cross-section-profile.js?v=1";
import { createRoadContactIndex, createRoadContactIndexCooperatively } from './road-contact-index.js?v=1';

const ROAD_SURFACE_BIAS = 0.18;
const MAX_ROAD_BATCH_VERTICES = 60000;

export { detectRoadIntersections };

function appendIndexedGeometry(targetVerts, targetIndices, verts, indices) {
  if (!verts || verts.length === 0) return;
  const baseVertex = targetVerts.length / 3;
  for (let i = 0; i < verts.length; i++) targetVerts.push(verts[i]);
  if (indices && indices.length > 0) {
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

export function shouldRenderRoadCenterMarkings(road) {
  if (!/(motorway|trunk|primary)/.test(String(road?.type || ""))) return false;
  // Elevated ribbons and their engineered bodies are compiled by separate
  // owners. Until those meshes share one published top surface, lane quads can
  // remain visible when the body is occluded. Preserve ordinary ground-road
  // markings while leaving elevated decoration to its structure owner.
  return road?.structureSemantics?.terrainMode !== 'elevated';
}

export function appendRoadCenterMarkings(road, points, outputVerts, outputIndices, widthSamplesMeters = null, surfaceHeightAt = (x,z)=>sampleFeatureSurfaceY(road,x,z), contactIndex = null) {
  const targetVerts=[], targetIndices=[];
  if (
    !shouldRenderRoadCenterMarkings(road) ||
    !Array.isArray(points) ||
    points.length < 2
  ) return;

  const markHalfWidth = 0.15;
  const dashLength = 6;
  const patternLength = 12;
  const laneCount = Math.max(1, Number(road?.transportRecord?.crossSection?.lanes) || 1);
  const corridorOffset = roadPlacementOffsetWorld(road);
  let distanceBeforeSegment = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const segmentLength = Math.hypot(dx, dz);
      if (!(segmentLength > 1e-5)) continue;
      const localWidth = Math.min(
        Number(widthSamplesMeters?.[index]) || Number(road.width) || 0,
        Number(widthSamplesMeters?.[index + 1]) || Number(road.width) || 0
      );
      if (localWidth < 8.4) {
        distanceBeforeSegment += segmentLength;
        continue;
      }
      const dirX = dx / segmentLength;
      const dirZ = dz / segmentLength;
      const normalX = -dirZ;
      const normalZ = dirX;
      const markingOffsets = Array.from({ length: Math.max(1, laneCount - 1) }, (_, laneIndex) =>
        laneCount > 1
          ? -localWidth * 0.5 + localWidth * (laneIndex + 1) / laneCount
          : 0
      );
      for (const laneOffset of markingOffsets) {
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
        const y1 = surfaceHeightAt(x1, z1) + 0.012;
        const y2 = surfaceHeightAt(x2, z2) + 0.012;
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
      }
      distanceBeforeSegment += segmentLength;
  }
  for(let i=0;i<targetVerts.length;i+=3) targetVerts[i+1]=surfaceHeightAt(targetVerts[i],targetVerts[i+2])+.012;
  if(contactIndex){
    for(let i=0;i<targetIndices.length;i+=3){
      const points=targetIndices.slice(i,i+3).map(j=>({x:targetVerts[j*3],z:targetVerts[j*3+2]}));
      const projected=contactIndex.projectTriangle(points,.012,'at_grade');
      const base=outputVerts.length/3;
      for(const v of projected)outputVerts.push(v);
      for(let j=0;j<projected.length/3;j++)outputIndices.push(base+j);
    }
    return;
  }
  const base=outputVerts.length/3;
  for(const v of targetVerts)outputVerts.push(v);
  for(const i of targetIndices)outputIndices.push(i+base);
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

export function createCompiledRoadSurfaceSampler(feature, fallbackSampler, diagnostics = null) {
  return (x, z) => {
    const compiledY = sampleFeatureSurfaceY(feature, x, z);
    if (Number.isFinite(compiledY)) {
      // At-grade terrain has already consumed the compiled corridor grades.
      // Rendering max(profile, terrain) applied fill a second time and left
      // the cut half of the profile hovering over its own graded ground.
      // Read the published ground in both directions. Bridges and tunnels
      // retain their independent engineered profiles.
      if (feature?.structureSemantics?.terrainMode === 'at_grade' && typeof fallbackSampler === 'function') {
        const renderedTerrainY = fallbackSampler(x, z);
        if (Number.isFinite(renderedTerrainY)) {
          if (diagnostics && renderedTerrainY > compiledY) diagnostics.renderedTerrainClamps = Number(diagnostics.renderedTerrainClamps || 0) + 1;
          return renderedTerrainY;
        }
      }
      return compiledY;
    }
    if (diagnostics && typeof diagnostics === 'object') {
      diagnostics.compiledSurfaceFallbacks =
        Number(diagnostics.compiledSurfaceFallbacks || 0) + 1;
    }
    return typeof fallbackSampler === 'function' ? fallbackSampler(x, z) : NaN;
  };
}

export function createRoadTerrainConformanceAudit() {
  return {
    authority: 'published-at-grade-road-geometry-versus-rendered-terrain',
    totalSamples: 0,
    issuesFound: 0,
    minimumDelta: Infinity,
    maximumDelta: -Infinity,
    buriedSamples: 0,
    floatingSamples: 0,
    profileDepartures: 0,
    maximumProfileDeparture: 0,
    worstProfileDepartures: [],
    worstDeltas: []
  };
}

export function recordAtGradeRoadTerrainConformance(
  audit,
  feature,
  verts,
  terrainHeightAt,
  worldToLatLon = null
) {
  if (
    !audit ||
    feature?.structureSemantics?.terrainMode !== 'at_grade' ||
    !Array.isArray(verts) ||
    typeof terrainHeightAt !== 'function'
  ) return audit;

  // Bound audit cost per road while covering both edges along its full path.
  const vertexCount = Math.floor(verts.length / 3);
  const stride = Math.max(1, Math.floor(vertexCount / 96));
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += stride) {
    const offset = vertexIndex * 3;
    const x = Number(verts[offset]);
    const y = Number(verts[offset + 1]);
    const z = Number(verts[offset + 2]);
    const terrainY = Number(terrainHeightAt(x, z));
    if (![x, y, z, terrainY].every(Number.isFinite)) continue;
    const delta = y - terrainY;
    // Independent reference: agreeing with a distorted terrain surface must
    // not certify a road that has lost its engineered profile.
    const expectedY=sampleFeatureSurfaceY(feature,x,z);
    const profileDeparture=Number.isFinite(expectedY) ? Math.abs(y-expectedY) : 0;
    audit.maximumProfileDeparture=Math.max(audit.maximumProfileDeparture,profileDeparture);
    if(profileDeparture>.25){
      audit.profileDepartures++;
      audit.worstProfileDepartures.push({roadName:feature.name||'Unnamed road',x,z,expectedY,renderedY:y,departure:profileDeparture});
      audit.worstProfileDepartures.sort((a,b)=>b.departure-a.departure);
      audit.worstProfileDepartures.length=Math.min(10,audit.worstProfileDepartures.length);
    }
    audit.totalSamples += 1;
    audit.minimumDelta = Math.min(audit.minimumDelta, delta);
    audit.maximumDelta = Math.max(audit.maximumDelta, delta);
    // A one-sided check accepted metre-scale floating at-grade surfaces.
    // Allow the authored surface bias plus 0.25 world units of mesh tolerance;
    // larger gaps need a terrain/transport reconciliation review. Structures
    // are excluded above, so bridge clearance is not a pavement defect.
    const allowedGap = (Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : ROAD_SURFACE_BIAS) + 0.25;
    const buried = delta < -0.05, floating = delta > allowedGap;
    if (!buried && !floating) continue;
    audit.buriedSamples += Number(buried);
    audit.floatingSamples += Number(floating);
    audit.issuesFound += 1;
    const geographic = typeof worldToLatLon === 'function'
      ? worldToLatLon(x, z)
      : null;
    audit.worstDeltas.push({
      sourceFeatureId: String(feature?.sourceFeatureId || feature?.id || ''),
      roadName: String(feature?.name || feature?.tags?.name || 'Unnamed road'),
      delta: Number(delta.toFixed(3)),
      kind: buried ? 'buried' : 'floating',
      lat: Number.isFinite(geographic?.lat) ? Number(geographic.lat.toFixed(6)) : null,
      lon: Number.isFinite(geographic?.lon) ? Number(geographic.lon.toFixed(6)) : null,
      x: Number(x.toFixed(1)),
      z: Number(z.toFixed(1))
    });
  }
  return audit;
}

export function finalizeRoadTerrainConformanceAudit(audit) {
  const result = audit || createRoadTerrainConformanceAudit();
  result.worstDeltas.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
  return Object.freeze({
    authority: result.authority,
    totalSamples: Number(result.totalSamples || 0),
    issuesFound: Number(result.issuesFound || 0),
    profileDepartures: Number(result.profileDepartures || 0),
    maximumProfileDeparture: Number(result.maximumProfileDeparture || 0),
    worstProfileDepartures: Object.freeze((result.worstProfileDepartures || []).map(Object.freeze)),
    minimumDelta: Number.isFinite(result.minimumDelta)
      ? Number(result.minimumDelta.toFixed(4))
      : null,
    maximumDelta: Number.isFinite(result.maximumDelta) ? Number(result.maximumDelta.toFixed(4)) : null,
    buriedSamples: Number(result.buriedSamples || 0),
    floatingSamples: Number(result.floatingSamples || 0),
    worstDeltas: Object.freeze(result.worstDeltas.slice(0, 10).map(Object.freeze))
  });
}

function mapPublishedPointsToCrossSectionWidths(feature, publishedPoints) {
  const sourcePoints = feature?.pts;
  if (!Array.isArray(sourcePoints) || sourcePoints.length < 2 || !Array.isArray(publishedPoints)) {
    return null;
  }
  const widths = new Float32Array(publishedPoints.length);
  let sourceSegmentIndex = 0;
  for (let index = 0; index < publishedPoints.length; index += 1) {
    const point = publishedPoints[index];
    const start = sourcePoints[sourceSegmentIndex];
    const end = sourcePoints[sourceSegmentIndex + 1];
    const dx = Number(end.x) - Number(start.x);
    const dz = Number(end.z) - Number(start.z);
    const lengthSquared = dx * dx + dz * dz;
    const segmentT = lengthSquared > 1e-8
      ? Math.max(0, Math.min(1,
          ((Number(point.x) - Number(start.x)) * dx + (Number(point.z) - Number(start.z)) * dz) /
          lengthSquared
        ))
      : 0;
    widths[index] = roadWidthAtSegment(feature, sourceSegmentIndex, segmentT);
    const atSourceEndpoint = point === end ||
      Math.hypot(Number(point.x) - Number(end.x), Number(point.z) - Number(end.z)) <= 1e-6;
    if (atSourceEndpoint && sourceSegmentIndex < sourcePoints.length - 2) {
      sourceSegmentIndex += 1;
    }
  }
  return widths;
}

export async function publishCompiledTransportMeshes(deps = {}) {
  const {
    disableRoadDebugMode,
    clearTerrainHeightCache,
    getSharedRoadMaterials,
    cachedTerrainHeight,
    cachedBaseTerrainHeight,
    applyTransportTerrainCorridors,
    repositionBuildingsWithTerrain,
    subdivideRoadPoints,
    pointAlongPolyline,
    polylineCurvatureMetric,
    rebuildStructureVisualMeshes,
    rebuildStructureVisualMeshesCooperatively,
    worldToLatLon
  } = deps;

  if (!appCtx.terrainEnabled || appCtx.roads.length === 0 || appCtx.onMoon) return;
  const sequence = appCtx._worldLoadSequence;
  const generation = appCtx._roadMeshGeneration = (appCtx._roadMeshGeneration || 0) + 1;
  const isCurrent = () => sequence === appCtx._worldLoadSequence && generation === appCtx._roadMeshGeneration && !appCtx.onMoon;
  const baseRoads = appCtx.roads;
  if (baseRoads.length === 0) return;
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const publicationStartedAt = now();
  const phaseDurationsMs = Object.create(null);
  const diagnosticsEnabled=typeof location!=='undefined' && new URLSearchParams(location.search).has('streetDiagnostics');
  const trace=(phase,detail={})=>{emitLocalLoadTrace('transport',phase,detail);if(diagnosticsEnabled)console.info('[TransportSurface]',phase,JSON.stringify(detail));};
  const measure = (name, task) => {
    trace(name+':start');
    const startedAt = now();
    try {
      return task();
    } finally {
      phaseDurationsMs[name] = Number((now() - startedAt).toFixed(2));
      trace(name+':end',{milliseconds:phaseDurationsMs[name]});
    }
  };
  const measureAsync = async (name, task) => {
    trace(name+':start');
    const startedAt = now();
    try {
      return await task();
    } finally {
      phaseDurationsMs[name] = Number((now() - startedAt).toFixed(2));
      trace(name+':end',{milliseconds:phaseDurationsMs[name]});
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
  if (typeof applyTransportTerrainCorridors === 'function') {
    await measureAsync('applyTransportTerrainCorridors', () => applyTransportTerrainCorridors({
      isCurrent,
      yieldBetweenTiles: yieldToMainThread,
      // finalizeLoadedWorld owns the one semantic terrain-material
      // publication after the complete transport height rebuild.
      deferVisualProfile: true
    }));
    if(!isCurrent())return;
    appCtx.streetFrontageGrading?.clearSamples?.();
    if (typeof repositionBuildingsWithTerrain === 'function') {
      measure('reprojectGroundAttachedWorld', () => repositionBuildingsWithTerrain());
    }
    await yieldToMainThread();
  }
  // Water masks and compiled cut/fill corridors change the physical terrain
  // beneath bridge ends. Refresh support geometry against that final surface
  // before publishing meshes so a road cannot become unsupported only after
  // the terrain rebuild lowers the ground below it.
  if (typeof appCtx.refreshTransportStructureAssembliesForPublishedTerrain === 'function') {
    await measureAsync(
      'refreshPublishedTerrainStructureAssemblies',
      () => appCtx.refreshTransportStructureAssembliesForPublishedTerrain()
    );
    await yieldToMainThread();
  }

  const intersections = measure('detectIntersections', () => detectRoadIntersections(baseRoads));
  await yieldToMainThread();
  // Junction footprints are resolved by the same planar union as road
  // segments. No stacked circular cap is published over the intersection.
  for (const road of baseRoads) road.junctionTransitions = [];

  const roadMainBatches = [];
  let roadMainBatchVerts = [];
  let roadMainBatchIdx = [];
  let roadMainBatchRanges = [];
  const roadSkirtBatchVerts = [];
  const roadSkirtBatchIdx = [];
  const roadMarkBatchVerts = [];
  const roadMarkBatchIdx = [];
  const roadSurfaceIntegrity = {
    authority: 'unioned-carriageway-regions',
    surfaceHeightAuthority: 'partitioned-published-terrain',
    geometryMeasurementAuthority: 'published-buffer-geometry-triangles',
    junctionMeasurementAuthority: 'published-at-grade-contact-index',
    junctionPrecisionAuthority: 'compiler-grid-and-float32-rounding-bound',
    invalidTriangles: 0,
    removedZeroFootprintTriangles: 0,
    correctedDownwardTriangles: 0,
    junctionSamples: 0,
    junctionPrecisionContacts: 0,
    junctionExactContactMisses: 0,
    maximumJunctionContactDistance: 0,
    maximumJunctionCoordinateTolerance: 0,
    junctionCoverageExamples: [],
    carriagewayRegions: 0,
    surfaceTriangles: 0,
    downwardFacingTriangles: 0,
    zeroFootprintTriangles: 0,
    junctionCoverageGaps: 0
  };
  const roadTerrainAudit = createRoadTerrainConformanceAudit();
  const flushRoadMainBatch = () => {
    if (roadMainBatchVerts.length > 0 && roadMainBatchIdx.length > 0) {
      roadMainBatches.push({ verts: roadMainBatchVerts, indices: roadMainBatchIdx, ranges: roadMainBatchRanges });
    }
    roadMainBatchVerts = [];
    roadMainBatchIdx = [];
    roadMainBatchRanges = [];
  };
  const appendRoadMainGeometry = (verts, indices, terrainMode) => {
    const incomingVertices = verts ? verts.length / 3 : 0;
    const currentVertices = roadMainBatchVerts.length / 3;
    if (currentVertices > 0 && currentVertices + incomingVertices > MAX_ROAD_BATCH_VERTICES) {
      flushRoadMainBatch();
    }
    roadMainBatchRanges.push({start:roadMainBatchIdx.length,count:indices.length,terrainMode:terrainMode || 'unknown'});
    appendIndexedGeometry(roadMainBatchVerts, roadMainBatchIdx, verts, indices);
  };

  const sharedRoadMaterials = typeof getSharedRoadMaterials === "function" ? getSharedRoadMaterials() : {};
  const roadMat = sharedRoadMaterials.roadMat;
  const skirtMat = sharedRoadMaterials.skirtMat;
  const markMat = sharedRoadMaterials.markMat;
  const atGradeRoads=[];
  await measureAsync('buildStructureRibbons', async () => {
    let sliceStartedAt = now();
    const publishedSharedSurfaces = new Set();
    for (let roadIndex = 0; roadIndex < baseRoads.length; roadIndex += 1) {
      const road = baseRoads[roadIndex];
      if (!road || !Array.isArray(road.pts) || road.pts.length < 2) continue;
      const sharedSurface = road?.transportSurfacePresentation?.status === 'compiled'
        ? road.transportSurfacePresentation
        : null;
      if (sharedSurface) {
        if (publishedSharedSurfaces.has(sharedSurface.id)) continue;
        publishedSharedSurfaces.add(sharedSurface.id);
      }
      const renderRoad = sharedSurface || road;
      const { width } = renderRoad;
      const hw = width / 2;

      const requestedDetail = resolveRoadRibbonSubdivisionStep(renderRoad);
      const basePts = sharedSurface
        ? sharedSurface.pts
        : subdivideRoadPoints(road.pts, requestedDetail);
      // Preserve the source road as one continuous ribbon. A separate
      // intersection-cap pass previously trimmed these endpoints and filled
      // junctions with fan polygons, exposing circles and triangle boundaries.
      const pts = basePts;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      if(renderRoad.structureSemantics?.terrainMode==='at_grade') {
        atGradeRoads.push({road:renderRoad,points:pts,widths:sharedSurface ? null : mapPublishedPointsToCrossSectionWidths(road,pts)});
        // Keep the independent profile audit after retiring per-road meshes.
        // Sample each source's cross-section; agreement among rendered layers
        // must not hide departure from the intended transport profile.
        const auditVertices=[];
        const stride=Math.max(1,Math.floor(pts.length/32));
        for(let i=0;i<pts.length;i+=stride) {
          const p=pts[i],q=pts[Math.min(i+1,pts.length-1)] || p;
          const prev=i===pts.length-1 ? pts[i-1] : p;
          const dx=q.x-prev.x,dz=q.z-prev.z,length=Math.hypot(dx,dz)||1;
          for(const side of [-1,0,1]) {
            const x=p.x-dz/length*hw*side,z=p.z+dx/length*hw*side;
            auditVertices.push(x,cachedTerrainHeight(x,z)+ROAD_SURFACE_BIAS,z);
          }
        }
        recordAtGradeRoadTerrainConformance(roadTerrainAudit,renderRoad,auditVertices,cachedTerrainHeight,worldToLatLon);
        if(now()-sliceStartedAt>=24) {await yieldToMainThread();sliceStartedAt=now();}
        if(!isCurrent())return;
        continue;
      }

      const verts = [];
      const indices = [];
      const leftEdge = [];
      const rightEdge = [];
      const roadTerrainSampler = renderRoad?.structureSemantics?.terrainMode === "at_grade" ?
        cachedTerrainHeight :
        cachedBaseTerrainHeight;
      const surfaceBias = Number.isFinite(renderRoad?.surfaceBias)
        ? renderRoad.surfaceBias
        : ROAD_SURFACE_BIAS;
      let widthSamplesMeters = null;
      const ribbonEdges = buildFeatureRibbonEdges(renderRoad, pts, hw, roadTerrainSampler, {surfaceBias});
      leftEdge.push(...ribbonEdges.leftEdge);
      rightEdge.push(...ribbonEdges.rightEdge);
      appendUpwardRibbonGeometry(leftEdge, rightEdge, verts, indices);
      recordAtGradeRoadTerrainConformance(
        roadTerrainAudit,
        renderRoad,
        verts,
        cachedTerrainHeight,
        worldToLatLon
      );
      appendRoadMainGeometry(verts, indices, renderRoad.structureSemantics?.terrainMode);
      if(shouldRenderRoadCenterMarkings(renderRoad)) {
        const markingSurface=createRoadContactIndex([{geometry:{attributes:{position:{array:verts}},getIndex:()=>({array:indices})},userData:{terrainMode:renderRoad.structureSemantics?.terrainMode}}]);
        appendRoadCenterMarkings(renderRoad,pts,roadMarkBatchVerts,roadMarkBatchIdx,widthSamplesMeters,
          (x,z)=>markingSurface.sampleAt(x,z),markingSurface);
        markingSurface.dispose();
      }

      if (shouldRenderRoadSkirts(renderRoad)) {
        const skirtDepth = roadSkirtDepth(renderRoad);
        const skirtData = buildRoadSkirts(
          leftEdge,
          rightEdge,
          skirtDepth,
          renderRoad?.structureSemantics?.terrainMode === "at_grade" ? roadTerrainSampler : null
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

  if(!isCurrent())return;
  await measureAsync('buildCarriagewayRegions',async()=>{
    const partition=await createPavementTerrainPartitionCooperatively(appCtx.terrainGroup?.children || [],{includeFarTerrain:true,current:isCurrent,yieldWork:yieldToMainThread});
    try {
      trace('indexCarriageways:start',{roads:atGradeRoads.length});
      const tiles=prepareCarriagewayTiles(atGradeRoads.map(entry=>entry.road));
      trace('indexCarriageways:end',{tiles:tiles.length});
      let sliceStartedAt=now();
      for(const [tileIndex,tile] of tiles.entries()) {
        if(!isCurrent())return;
        if(tileIndex%128===0)trace('meshCarriageway:progress',{completed:tileIndex,total:tiles.length,key:tile.key});
        const mesh=meshCarriagewayTile(tile,(x,z)=>cachedTerrainHeight(x,z)+ROAD_SURFACE_BIAS,partition);
        if(mesh.indices.length) {
          appendRoadMainGeometry(mesh.positions,mesh.indices,'at_grade');
          roadSurfaceIntegrity.carriagewayRegions++;

        }
        if(now()-sliceStartedAt>=24) {await yieldToMainThread();sliceStartedAt=now();}
      }
    } finally {partition.dispose();}
    flushRoadMainBatch();
  });
  if(!isCurrent())return;
  await measureAsync('projectGroundRoadMarkings',async()=>{
    const support=createRoadContactIndex(roadMainBatches.map(batch=>({geometry:{attributes:{position:{array:batch.verts}},getIndex:()=>({array:batch.indices})},userData:{surfaceRanges:batch.ranges}})));
    try {
      let sliceStartedAt=now();
      for(const {road,points,widths} of atGradeRoads) {
        if(!isCurrent())return;
        if(shouldRenderRoadCenterMarkings(road)) {
          const groundSupport={sampleAt:(x,z)=>support.sampleAt(x,z,NaN,'at_grade'),projectTriangle:(points,lift)=>support.projectTriangle(points,lift,'at_grade')};
          appendRoadCenterMarkings(road,points,roadMarkBatchVerts,roadMarkBatchIdx,widths,groundSupport.sampleAt,groundSupport);
        }
        if(now()-sliceStartedAt>=24) {await yieldToMainThread();sliceStartedAt=now();}
      }
    } finally {support.dispose();}
  });

  if (!isCurrent()) return;
  const publishedVertexCount=roadMainBatches.reduce((sum,batch)=>sum+batch.verts.length/3,0)+roadSkirtBatchVerts.length/3+roadMarkBatchVerts.length/3;

  const stagedRoadGroup = new THREE.Group();
  const stagedRoadMeshes = [];
  let stagedRoadContact;
  try {
  measure('uploadRoadMeshes', () => {
    roadMainBatches.forEach((batch, batchIndex) => {
      buildIndexedBatchMesh({
        scene: stagedRoadGroup,
        targetList: stagedRoadMeshes,
        verts: batch.verts,
        indices: batch.indices,
        material: roadMat,
        renderOrder: 2,
        userData: {
          isRoadBatch: true,
          surfaceRanges: batch.ranges,
          roadBatchIndex: batchIndex,
          sharedRoadMaterial: true,
          worldLoadSequence: appCtx._worldLoadSequence || 0
        }
      });
    });
    buildIndexedBatchMesh({
      scene: stagedRoadGroup,
      targetList: stagedRoadMeshes,
      verts: roadSkirtBatchVerts,
      indices: roadSkirtBatchIdx,
      material: skirtMat,
      renderOrder: 1,
      userData: { isRoadBatch: true, isRoadSkirt: true, sharedRoadMaterial: true, worldLoadSequence: appCtx._worldLoadSequence || 0 }
    });
    buildIndexedBatchMesh({
      scene: stagedRoadGroup,
      targetList: stagedRoadMeshes,
      verts: roadMarkBatchVerts,
      indices: roadMarkBatchIdx,
      material: markMat,
      renderOrder: 4,
      receiveShadow: false,
      userData: { isRoadBatch: true, isRoadMarking: true, sharedRoadMaterial: true, worldLoadSequence: appCtx._worldLoadSequence || 0 }
    });
  });
  // BufferGeometry owns independent typed arrays now. Release construction
  // arrays before building contacts, when both old and new worlds coexist.
  for(const batch of roadMainBatches){batch.verts.length=0;batch.indices.length=0;}
  roadMainBatches.length=0;
  roadSkirtBatchVerts.length=roadSkirtBatchIdx.length=0;
  roadMarkBatchVerts.length=roadMarkBatchIdx.length=0;
  stagedRoadContact = await measureAsync('buildRoadContacts',()=>createRoadContactIndexCooperatively(stagedRoadMeshes,16,{current:isCurrent,yieldWork:yieldToMainThread}));
  await measureAsync('measurePublishedRoadIntegrity', async () => {
    let sliceStartedAt = now();
    for (const mesh of stagedRoadMeshes) {
      if (mesh.userData?.isRoadSkirt || mesh.userData?.isRoadMarking) continue;
      roadSurfaceIntegrity.removedZeroFootprintTriangles += mesh.userData.removedZeroFootprintTriangles || 0;
      roadSurfaceIntegrity.correctedDownwardTriangles += mesh.userData.correctedDownwardTriangles || 0;
      const measured = measurePublishedRoadTriangles(mesh.geometry?.attributes?.position?.array, mesh.geometry?.getIndex?.()?.array);
      for (const [key, value] of Object.entries(measured)) roadSurfaceIntegrity[key] += value;
      if (now() - sliceStartedAt >= 24) { await yieldToMainThread(); sliceStartedAt = now(); }
      if (!isCurrent()) return;
    }
    for (const intersection of intersections) {
      if (intersection.hasGradeSeparatedRoad) continue;
      roadSurfaceIntegrity.junctionSamples++;
      const height = stagedRoadContact.sampleAt(intersection.x, intersection.z, NaN, 'at_grade');
      if (!Number.isFinite(height)) {
        roadSurfaceIntegrity.junctionExactContactMisses++;
        const tolerance = roadSourceCoordinateTolerance(intersection.x, intersection.z, STREET_POLYGON_GRID_WORLD);
        roadSurfaceIntegrity.maximumJunctionCoordinateTolerance = Math.max(roadSurfaceIntegrity.maximumJunctionCoordinateTolerance, tolerance);
        const nearest = stagedRoadContact.nearestSurfaceAt(intersection.x, intersection.z, tolerance, 'at_grade');
        if (nearest) {
          roadSurfaceIntegrity.junctionPrecisionContacts++;
          roadSurfaceIntegrity.maximumJunctionContactDistance = Math.max(roadSurfaceIntegrity.maximumJunctionContactDistance, nearest.distance);
        } else {
          roadSurfaceIntegrity.junctionCoverageGaps++;
          if (roadSurfaceIntegrity.junctionCoverageExamples.length < 12) {
            roadSurfaceIntegrity.junctionCoverageExamples.push({x:intersection.x,z:intersection.z,tolerance,
              nearestSurface: stagedRoadContact.nearestSurfaceAt(intersection.x,intersection.z,4,'at_grade'),
              branches: intersection.roads.map(branch => {
                const road=baseRoads[branch.roadIdx];
                return {...branch,name:road?.name,sourceFeatureId:road?.sourceFeatureId,
                  mode:road?.structureSemantics?.terrainMode,sharedSurface:road?.transportSurfacePresentation?.id,
                  sourceWidth:road?.width,placementOffset:roadPlacementOffsetWorld(road)};
              })});
          }
        }
      }
      if (now() - sliceStartedAt >= 24) { await yieldToMainThread(); sliceStartedAt = now(); }
      if (!isCurrent()) return;
    }
  });
  if(!isCurrent())throw new Error('Road publication superseded');
  } catch (error) {
    stagedRoadContact?.dispose();
    for (const mesh of stagedRoadMeshes) mesh.geometry?.dispose();
    throw error;
  }
  // No asynchronous boundary inside the publication: old roads stay visible
  // throughout compilation and are released only after every replacement exists.
  const previousRoadMeshes = [...appCtx.roadMeshes];
  for (const mesh of stagedRoadMeshes) appCtx.addEarthWorldObject(mesh);
  appCtx.replaceWorldCollection('roadMeshes', stagedRoadMeshes);
  const previousRoadContact = appCtx.roadContactIndex;
  appCtx.roadContactIndex = stagedRoadContact;
  previousRoadContact?.dispose?.();
  for (const mesh of previousRoadMeshes) {
    mesh.parent?.remove(mesh);
    mesh.geometry?.dispose();
    if (!mesh.userData?.sharedRoadMaterial) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material?.dispose?.();
    }
  }
  // The pavement owner keeps its render and collision meshes together until its
  // own replacement is ready; road rebuilds must never dispose only the render half.
  markGroundSurfaceChanged(appCtx);
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

  const roadTerrainConformance = finalizeRoadTerrainConformanceAudit(roadTerrainAudit);

  appCtx.transportSurfacePublication = Object.freeze({
    authority: "compiled_transport_surface",
    transportGraphId: appCtx.transportNetworkModel?.id || null,
    roadCount: baseRoads.length,
    meshCount: appCtx.roadMeshes.length,
    intersectionCount: intersections.filter(i=>!i.hasGradeSeparatedRoad).length,
    topologyIntersectionCount: intersections.filter((intersection) =>
      !intersection?.hasGradeSeparatedRoad
    ).length,
    compiledSampleCount: baseRoads.reduce((total, road) =>
      total + Number(road?.transportSurfaceModel?.distances?.length || 0), 0),
    vertices: publishedVertexCount,
    triangles: stagedRoadMeshes.reduce((sum,mesh)=>sum+(mesh.geometry?.getIndex?.()?.count || 0)/3,0),
    roadSurfaceIntegrity: Object.freeze({ ...roadSurfaceIntegrity }),
    roadTerrainConformance,
    phaseDurationsMs: Object.freeze({
      ...phaseDurationsMs,
      total: Number((now() - publicationStartedAt).toFixed(2))
    }),
    worldLoadSequence: appCtx._worldLoadSequence || 0
  });
  return appCtx.transportSurfacePublication;
}
