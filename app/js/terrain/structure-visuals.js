import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  polylineDistances,
  sampleFeatureSurfaceY
} from "../structure-semantics.js?v=48";
import {
  clearStructureVisualMeshesForContext,
  rebuildStructureVisualMeshesForContext,
  updateStructureVisualVisibilityForContext
} from "./structure-visual-meshes.js?v=20";
import {
  canPublishTunnelVisual,
  collectTunnelVisualInstances
} from "./structure-tunnel-visuals.js?v=20";
import {
  barrierPointConflictsWithDriveableRoad,
  createDriveableRoadConflictIndex,
  elevatedSegmentSafety,
  supportPointConflictsWithDriveableRoad
} from "../world/bridge-safety.js?v=8";
import { applyTerrainPortalMasksForContext } from './structure-terrain-portals.js?v=1';
import { yieldToMainThread } from '../world/cooperative-scheduling.js?v=1';
import { compileElevatedAssembly } from '../world/compiler/transport-structure-assembly.js?v=5';

export function canPublishElevatedStructureVisual(feature) {
  if (feature?.structureSemantics?.terrainMode !== 'elevated') return false;
  if (!Array.isArray(feature?.pts) || feature.pts.length < 2) return false;
  if (feature?.networkKind !== 'road') return true;
  const record = feature?.transportRecord;
  if (record?.completeness === 'lossless') return true;
  // A generalized mapped bridge owns visual continuity only. Hard collision,
  // supports, parapets, and engineered detail remain restricted to lossless
  // source geometry elsewhere in this publisher.
  return record?.completeness === 'generalized' &&
    record?.routeState === 'complete' &&
    record?.safeForDriving !== false &&
    feature?.structureSemantics?.isBridge === true;
}

export function collectStructureVisualInstances(deps = {}) {
  const {
    cachedTerrainHeight,
    pointAlongPolyline
  } = deps;
  const sampleTerrainHeight = typeof cachedTerrainHeight === "function" ? cachedTerrainHeight : () => 0;
  const samplePointAlongPolyline = typeof pointAlongPolyline === "function" ? pointAlongPolyline : () => null;

  const supportInstances = [];
  const portalInstances = [];
  const deckInstances = [];
  const girderInstances = [];
  const capInstances = [];
  const wallInstances = [];
  const roofInstances = [];
  const tunnelLightInstances = [];
  const tunnelShells = [];
  const tunnelPortalMasks = [];
  const elevatedDeckShells = [];
  const elevatedBarrierSegments = [];
  const guardrailInstances = [];
  const elevatedFeatures = Array.isArray(deps.allElevatedFeatures)
    ? deps.allElevatedFeatures
    : []
      .concat(Array.isArray(appCtx.roads) ? appCtx.roads : [])
      .concat(Array.isArray(appCtx.linearFeatures) ? appCtx.linearFeatures.filter((feature) => feature?.isStructureConnector === true) : []);
  const featuresToProcess = Array.isArray(deps.featuresToProcess)
    ? deps.featuresToProcess
    : elevatedFeatures;
  const roadConflictIndex = deps.roadConflictIndex || createDriveableRoadConflictIndex(appCtx.roads);

  const addSupportInstance = (instance) => {
    if (!instance || !(instance.scaleY > 0.5)) return;
    supportInstances.push(instance);
  };

  const addDeckBody = (x, y, z, width, thickness, depth, rotationY = 0, quaternion = null) => {
    if (!(width > 0.4 && thickness > 0.12 && depth > 0.35)) return;
    deckInstances.push({
      x,
      y,
      z,
      scaleX: width,
      scaleY: thickness,
      scaleZ: depth,
      rotationY,
      quaternion
    });
  };

  const addBeam = (collection, x, y, z, sx, sy, sz, rotationY = 0, quaternion = null) => {
    if (!(sx > 0.08 && sy > 0.08 && sz > 0.2)) return;
    collection.push({ x, y, z, scaleX: sx, scaleY: sy, scaleZ: sz, rotationY, quaternion });
  };

  const deckQuaternionForSegment = (p1, y1, p2, y2) => {
    const dx = p2.x - p1.x;
    const dy = y2 - y1;
    const dz = p2.z - p1.z;
    const length = Math.hypot(dx, dy, dz);
    if (!(length > 1e-5) || typeof THREE === "undefined") return null;
    const direction = new THREE.Vector3(dx / length, dy / length, dz / length);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction
    );
    return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w, length };
  };

  for (let i = 0; i < featuresToProcess.length; i++) {
    const feature = featuresToProcess[i];
    const semantics = feature?.structureSemantics;
    if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2 || !semantics) continue;
    const category = String(semantics.featureCategory || feature.networkKind || feature.kind || "road").toLowerCase();
    const generalizedRoadVisual =
      category === 'road' &&
      feature?.transportRecord?.completeness !== 'lossless';
    if (generalizedRoadVisual && semantics.terrainMode !== 'elevated' && !canPublishTunnelVisual(feature)) {
      continue;
    }
    const isConnectorLike = category === "connector" || category === "footway";
    const isSkywalk = semantics.skywalk || semantics.covered || semantics.indoor;
    const suppressExteriorVisuals = semantics.embeddedInBuilding === true;
    const roadLinkFeature = /(?:^|_)link$/i.test(String(feature?.type || ""));
    const visualDetail =
      semantics.terrainMode === "elevated" ?
        (
          isConnectorLike || isSkywalk ? 2.4 :
            generalizedRoadVisual && feature?.fixedRegionalContext === true ? 12 :
            feature?.fixedRegionalContext === true && !roadLinkFeature ? 7.5 :
              4.2
        ) :
        10;
    const visualPts =
      typeof appCtx.subdivideRoadPoints === "function" && feature.pts.length >= 2 ?
        appCtx.subdivideRoadPoints(feature.pts, visualDetail) :
        feature.pts;
    const structurePts = Array.isArray(visualPts) && visualPts.length >= 2 ? visualPts : feature.pts;
    const { distances, total } = polylineDistances(structurePts);
    const structureAssembly = semantics.terrainMode === 'elevated'
      ? feature.transportStructureAssembly || compileElevatedAssembly(
          feature,
          sampleTerrainHeight,
          {
            supportConflict: (candidateFeature, column) => supportPointConflictsWithDriveableRoad(
              candidateFeature,
              {
                x: column.x,
                z: column.z,
                supportBottomY: column.terrainY,
                supportTopY: column.topY,
                columnRadius: column.width * 0.5,
                roadIndex: roadConflictIndex
              }
            )
          }
        )
      : null;
    const transitionAnchorDistances =
      Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0 ?
        feature.structureTransitionAnchors
          .map((anchor) => Number(anchor?.distance))
          .filter((distance) => Number.isFinite(distance)) :
        [];
    if (semantics.terrainMode === "elevated") {
      if (suppressExteriorVisuals) continue;
      // Structural coverage is compiled once. Curvature, ramp classification,
      // nearby elevated roads, and feature length may tune detail, but may not
      // delete the body/support contract and leave a floating interchange.
      const renderRoadEngineeredDetail = structureAssembly?.engineeredDetail === true;
      const renderRoadSupports =
        structureAssembly?.visualSupportDetail === true &&
        Array.isArray(structureAssembly?.supportStations) &&
        structureAssembly.supportStations.length > 0;
      const renderCapBeams = isConnectorLike || isSkywalk || renderRoadSupports;
      const width = Math.max(2, Number(feature.width) || 4);
      const structureSpecification = feature?.transportStructureRef?.specification || {};
      const deckThickness = Number(structureSpecification.deckThickness) ||
        (isConnectorLike ? 0.72 : Math.max(0.9, Math.min(1.6, width * 0.11)));
      const girderDepth = isConnectorLike ? Math.max(0.34, deckThickness * 0.65) : Math.max(0.58, deckThickness * 0.72);
      for (let segIndex = 0; segIndex < structurePts.length - 1; segIndex++) {
        const p1 = structurePts[segIndex];
        const p2 = structurePts[segIndex + 1];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const segLen = Math.hypot(dx, dz);
        if (!(segLen > 0.35)) continue;
        const startY = sampleFeatureSurfaceY(feature, p1.x, p1.z);
        const endY = sampleFeatureSurfaceY(feature, p2.x, p2.z);
        const midX = (p1.x + p2.x) * 0.5;
        const midZ = (p1.z + p2.z) * 0.5;
        const deckY = sampleFeatureSurfaceY(feature, midX, midZ);
        if (!Number.isFinite(deckY) || !Number.isFinite(startY) || !Number.isFinite(endY)) continue;
        const rotationY = Math.atan2(dx, dz);
        const nx = -dz / (segLen || 1);
        const nz = dx / (segLen || 1);
        const segmentQuat = deckQuaternionForSegment(p1, startY, p2, endY);
        const deckDepth = segmentQuat?.length || segLen;
        const segmentStartDistance = Number(distances[segIndex]) || 0;
        const segmentEndDistance = Number(distances[segIndex + 1]) || segmentStartDistance + segLen;
        const segmentCenterDistance = (segmentStartDistance + segmentEndDistance) * 0.5;
        const slopeRatio = Math.abs(endY - startY) / Math.max(1, segLen);
        const terrainMidY = sampleTerrainHeight(midX, midZ);
        const segmentClearance = deckY - terrainMidY;
        const transitionVisualGap = Math.max(16, Math.min(42, width * 2.6));
        const nearTransitionVisual =
          !isConnectorLike &&
          !isSkywalk &&
          (
            segmentCenterDistance < transitionVisualGap ||
            segmentCenterDistance > Math.max(0, total - transitionVisualGap) ||
            transitionAnchorDistances.some((distance) => Math.abs(segmentCenterDistance - distance) < transitionVisualGap)
          );
        const rampVisualScale =
          isConnectorLike || isSkywalk ?
            1 :
            Math.max(0.24, 1 - Math.max(0, slopeRatio - 0.01) / 0.065);
        // The compiled road ribbon owns the drive surface; this publisher owns
        // the visible engineered body beneath it. The former condition only
        // emitted bodies for foot connectors, so lossless road bridges were
        // reduced to thin asphalt ribbons even though their exact geometry had
        // already passed the structure authority gate.
        // Vehicle roads use the one continuous compiled shell below. The old
        // segment-box road body overlapped that shell and had a different end
        // policy, so it could reintroduce seams after a later visual edit.
        const renderDeckBody = isConnectorLike || isSkywalk;
        const renderSideGirders =
          !nearTransitionVisual &&
          (
            isConnectorLike ||
            isSkywalk ||
            (renderRoadEngineeredDetail && semantics.isBridge === true)
          );
        const deckBodyThickness =
          isConnectorLike || isSkywalk ?
            deckThickness :
            (
              renderRoadEngineeredDetail ?
                Math.max(0.16, Math.min(0.34, width * 0.028)) * (0.82 + rampVisualScale * 0.18) :
                Math.max(0.08, Math.min(0.18, width * 0.014)) * (0.88 + rampVisualScale * 0.12)
            );
        const deckBodyWidth =
          isConnectorLike || isSkywalk ?
            width + 0.5 :
            (
              renderRoadEngineeredDetail ?
                width + 0.16 + rampVisualScale * 0.12 :
                width + 0.08 + rampVisualScale * 0.08
            );
        if (renderDeckBody) {
          addDeckBody(
            midX,
            deckY - deckBodyThickness * 0.5 - 0.04,
            midZ,
            deckBodyWidth,
            deckBodyThickness,
            deckDepth,
            rotationY,
            segmentQuat
          );
        }

        const guardrailSafety = elevatedSegmentSafety(feature, {
          x: midX,
          z: midZ,
          deckY,
          terrainY: terrainMidY,
          distance: segmentCenterDistance,
          total,
          waterAreas: appCtx.waterAreas
        });
        if (guardrailSafety.protected && (isConnectorLike || isSkywalk)) {
          const railOffset = width * 0.5 + 0.28;
          for (const side of [-1, 1]) {
            if (barrierPointConflictsWithDriveableRoad(feature, {
              x: midX + nx * railOffset * side,
              z: midZ + nz * railOffset * side,
              deckY,
              roadIndex: roadConflictIndex
            })) continue;
            addBeam(
              guardrailInstances,
              midX + nx * railOffset * side,
              deckY + (Number(structureSpecification.barrierHeight) || 1.1) - 0.08,
              midZ + nz * railOffset * side,
              0.14,
              0.16,
              deckDepth,
              rotationY,
              segmentQuat
            );
            addBeam(
              guardrailInstances,
              midX + nx * railOffset * side,
              deckY + 0.56,
              midZ + nz * railOffset * side,
              0.1,
              0.12,
              deckDepth,
              rotationY,
              segmentQuat
            );
            addBeam(
              guardrailInstances,
              midX + nx * railOffset * side,
              deckY + 0.52,
              midZ + nz * railOffset * side,
              0.1,
              1.04,
              0.1,
              rotationY
            );
          }
        } else if (guardrailSafety.protected) {
          const barrierHalfWidth = width * 0.5 + 0.18;
          const barrierSides = [-1, 1].filter((side) =>
            !barrierPointConflictsWithDriveableRoad(feature, {
              x: midX + nx * barrierHalfWidth * side,
              z: midZ + nz * barrierHalfWidth * side,
              deckY,
              roadIndex: roadConflictIndex
            })
          );
          if (barrierSides.length > 0) {
            elevatedBarrierSegments.push({
              p1: { x: p1.x, y: startY, z: p1.z },
              p2: { x: p2.x, y: endY, z: p2.z },
              halfWidth: barrierHalfWidth,
              sides: barrierSides,
              // Road bridges use a low concrete parapet. The collision owner
              // remains full protective height, but a 1.25 m solid visual wall
              // made ordinary ramps read as narrow trenches.
              height: 0.58
            });
          }
        }

        const sideOffset = Math.max(0.7, width * 0.34);
        const sideBeamWidth =
          isConnectorLike ?
            0.24 :
            Math.max(0.12, Math.min(0.24, width * 0.022));
        const sideGirderDepth =
          isConnectorLike || isSkywalk ?
            girderDepth :
            Math.max(0.14, Math.min(0.24, girderDepth * 0.34));
        if (renderSideGirders) {
          addBeam(
            girderInstances,
            midX + nx * sideOffset,
            deckY - deckBodyThickness + sideGirderDepth * 0.5,
            midZ + nz * sideOffset,
            sideBeamWidth,
            sideGirderDepth,
            deckDepth,
            rotationY,
            segmentQuat
          );
          addBeam(
            girderInstances,
            midX - nx * sideOffset,
            deckY - deckBodyThickness + sideGirderDepth * 0.5,
            midZ - nz * sideOffset,
            sideBeamWidth,
            sideGirderDepth,
            deckDepth,
            rotationY,
            segmentQuat
          );
          if (!isConnectorLike && width > 9.5 && rampVisualScale >= 0.82) {
            addBeam(
              girderInstances,
              midX,
              deckY - deckBodyThickness + sideGirderDepth * 0.44,
              midZ,
              Math.max(0.26, Math.min(0.52, width * 0.05)),
              Math.max(0.28, sideGirderDepth * 0.82),
              deckDepth,
              rotationY,
              segmentQuat
            );
          }
        }

        if (isSkywalk) {
          const wallHeight = Math.max(1.8, Math.min(2.7, width * 0.22 + 1.2));
          const wallThickness = 0.18;
          const wallOffset = Math.max(0.8, width * 0.48);
          addBeam(
            wallInstances,
            midX + nx * wallOffset,
            deckY + wallHeight * 0.5,
            midZ + nz * wallOffset,
            wallThickness,
            wallHeight,
            deckDepth,
            rotationY,
            segmentQuat
          );
          addBeam(
            wallInstances,
            midX - nx * wallOffset,
            deckY + wallHeight * 0.5,
            midZ - nz * wallOffset,
            wallThickness,
            wallHeight,
            deckDepth,
            rotationY,
            segmentQuat
          );
          addBeam(
            roofInstances,
            midX,
            deckY + wallHeight + 0.12,
            midZ,
            width + 0.36,
            0.16,
            deckDepth,
            rotationY,
            segmentQuat
          );
        }
      }

      if (
        !isConnectorLike &&
        !isSkywalk &&
        structureAssembly?.publishBody === true &&
        structureAssembly.total >= 0.5
      ) {
        const rings = (structureAssembly.surfaceSamples || []).map((sample) => ({
          x: sample.x,
          y: sample.y,
          z: sample.z,
          thickness: sample.thickness
        }));
        if (rings.length >= 2) {
          elevatedDeckShells.push({
            rings,
            width: structureAssembly.width,
            thickness: structureAssembly.baseThickness,
            featureId: structureAssembly.featureId,
            structureType: structureAssembly.structureType,
            bodyCoverage: structureAssembly.bodyCoverage
          });
        }
      }

      const supportSpacing = isConnectorLike
        ? Math.max(Number(structureSpecification.supportSpacing) || 0, 16, width * 3.6)
        : Number(structureAssembly?.supportSpacing) || Math.max(26, width * 3.8);
      const skipNear = Math.max(8, width * 0.9);
      const skipDistance = (distance) => {
        if (distance < skipNear || distance > total - skipNear) return true;
        if (!Array.isArray(feature.structureStations)) return false;
        return feature.structureStations.some((station) =>
          Math.abs(distance - station.distance) < Math.max(width * 1.6, station.span * 0.58)
        );
      };

      if (isConnectorLike) {
        for (let distance = supportSpacing * 0.5; distance < total; distance += supportSpacing) {
          if (skipDistance(distance)) continue;
          const point = samplePointAlongPolyline(structurePts, distance);
          if (!point) continue;
          const terrainY = sampleTerrainHeight(point.x, point.z);
          const deckY = sampleFeatureSurfaceY(feature, point.x, point.z);
          const supportHeight = deckY - deckThickness - terrainY;
          if (!(supportHeight > 2.4)) continue;
          const pierWidth = Math.max(0.7, width * 0.22);
          addSupportInstance({
            x: point.x,
            y: terrainY + supportHeight * 0.5,
            z: point.z,
            scaleX: pierWidth,
            scaleY: supportHeight,
            scaleZ: pierWidth
          });
        }
      }

      if (!isConnectorLike && renderRoadSupports && renderCapBeams) {
        for (const station of structureAssembly.supportStations) {
          const columns = Array.isArray(station.columns) ? station.columns : [];
          for (const column of columns) {
            addSupportInstance({
              x: column.x,
              y: column.terrainY + column.height * 0.5,
              z: column.z,
              scaleX: column.width,
              scaleY: column.height,
              scaleZ: Math.max(1, column.width * 1.1)
            });
          }
          const capHalfSpan = Math.max(
            width * 0.42,
            ...columns.map((column) => Math.abs(Number(column.offset) || 0) + column.width * 0.6)
          );
          addBeam(
            capInstances,
            station.x,
            station.surfaceY - deckThickness - 0.18,
            station.z,
            capHalfSpan * 2,
            0.34,
            Math.max(0.58, ...columns.map((column) => column.width * 1.2)),
            Math.atan2(station.tangentX, station.tangentZ)
          );
        }
      }

      const addAbutmentAt = (distance) => {
        const point = samplePointAlongPolyline(structurePts, distance);
        if (!point) return;
        const terrainY = sampleTerrainHeight(point.x, point.z);
        const deckY = sampleFeatureSurfaceY(feature, point.x, point.z);
        const supportHeight = deckY - 0.45 - terrainY;
        if (!(supportHeight > 1.4)) return;
        const nx = -point.tangentZ;
        const nz = point.tangentX;
        const widthScale = Math.max(1.2, Number(feature.width) || 4);
        addSupportInstance({
          x: point.x + nx * 0.2,
          y: terrainY + supportHeight * 0.5,
          z: point.z + nz * 0.2,
          scaleX: Math.max(1.8, widthScale * 0.92),
          scaleY: supportHeight,
          scaleZ: Math.max(2.1, widthScale * 0.44)
        });
        if (!isConnectorLike && renderCapBeams) {
          addBeam(
            capInstances,
            point.x,
            deckY - deckThickness - 0.18,
            point.z,
            Math.max(2.6, widthScale * 0.92),
            0.32,
            Math.max(1.2, widthScale * 0.38),
            Math.atan2(point.tangentX, point.tangentZ)
          );
        }
      };
      if (isConnectorLike) {
        addAbutmentAt(Math.min(6, total * 0.12));
        addAbutmentAt(Math.max(0, total - Math.min(6, total * 0.12)));
      } else if (structureAssembly?.visualSupportDetail) {
        for (const abutment of structureAssembly.abutments || []) {
          const nx = -abutment.tangentZ;
          const nz = abutment.tangentX;
          addSupportInstance({
            x: abutment.x + nx * 0.2,
            y: abutment.terrainY + abutment.height * 0.5,
            z: abutment.z + nz * 0.2,
            scaleX: Math.max(2.4, width * 0.92),
            scaleY: abutment.height,
            scaleZ: Math.max(1.4, width * 0.38),
            supportKind: 'abutment'
          });
        }
      }
    } else if (semantics.terrainMode === "subgrade") {
      const tunnel = collectTunnelVisualInstances(feature, structurePts, total, {
        samplePointAlongPolyline,
        sampleTerrainHeight
      });
      portalInstances.push(...tunnel.portals);
      wallInstances.push(...tunnel.walls);
      roofInstances.push(...tunnel.roofs);
      tunnelLightInstances.push(...tunnel.lights);
      tunnelShells.push(...tunnel.shells);
      tunnelPortalMasks.push(...tunnel.portalMasks);
    }
  }

  return {
    supportInstances,
    portalInstances,
    deckInstances,
    girderInstances,
    capInstances,
    wallInstances,
    roofInstances,
    tunnelLightInstances,
    tunnelShells,
    tunnelPortalMasks,
    elevatedDeckShells,
    elevatedBarrierSegments,
    guardrailInstances
  };
}

export async function collectStructureVisualInstancesCooperatively(deps = {}) {
  const allElevatedFeatures = []
    .concat(Array.isArray(appCtx.roads) ? appCtx.roads : [])
    .concat(Array.isArray(appCtx.linearFeatures)
      ? appCtx.linearFeatures.filter((feature) => feature?.isStructureConnector === true)
      : []);
  const roadConflictIndex = createDriveableRoadConflictIndex(appCtx.roads);
  const merged = {};
  const chunkSize = 180;
  for (let start = 0; start < allElevatedFeatures.length; start += chunkSize) {
    const partial = collectStructureVisualInstances({
      ...deps,
      allElevatedFeatures,
      roadConflictIndex,
      featuresToProcess: allElevatedFeatures.slice(start, start + chunkSize)
    });
    for (const [key, value] of Object.entries(partial)) {
      if (!Array.isArray(value)) continue;
      if (!Array.isArray(merged[key])) merged[key] = [];
      merged[key].push(...value);
    }
    await yieldToMainThread();
  }
  return merged;
}

export function clearStructureVisualMeshes() {
  return clearStructureVisualMeshesForContext(appCtx);
}

export function updateStructureVisualVisibility(force = false) {
  return updateStructureVisualVisibilityForContext(appCtx, force);
}

export function rebuildStructureVisualMeshes(deps = {}) {
  const collected = collectStructureVisualInstances(deps);
  applyTerrainPortalMasksForContext(appCtx, collected.tunnelPortalMasks);
  return rebuildStructureVisualMeshesForContext(appCtx, () => collected, deps);
}

export async function rebuildStructureVisualMeshesCooperatively(deps = {}) {
  const collected = await collectStructureVisualInstancesCooperatively(deps);
  applyTerrainPortalMasksForContext(appCtx, collected.tunnelPortalMasks);
  return rebuildStructureVisualMeshesForContext(appCtx, () => collected, deps);
}
