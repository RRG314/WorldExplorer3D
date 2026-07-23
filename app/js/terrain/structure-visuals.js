import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  polylineBounds,
  polylineDistances,
  sampleFeatureSurfaceY
} from "../structure-semantics.js?v=19";
import {
  clearStructureVisualMeshesForContext,
  rebuildStructureVisualMeshesForContext
} from "./structure-visual-meshes.js?v=4";
import { collectTunnelVisualInstances } from "./structure-tunnel-visuals.js?v=4";
import {
  buildGuardrailEdges,
  elevatedSegmentSafety
} from "../world/bridge-safety.js?v=2";

function countNearbyElevatedFeatures(feature, elevatedFeatures, boundsIntersect, padding = 28) {
  const featureBounds = feature?.bounds || polylineBounds(feature?.pts || [], (Number(feature?.width) || 4) + padding);
  if (!featureBounds) return 0;
  let count = 0;
  for (let i = 0; i < elevatedFeatures.length; i++) {
    const other = elevatedFeatures[i];
    if (!other || other === feature) continue;
    const otherBounds = other.bounds || polylineBounds(other.pts || [], (Number(other.width) || 4) + padding);
    if (!otherBounds) continue;
    if (boundsIntersect(featureBounds, otherBounds, padding)) count += 1;
  }
  return count;
}

export function collectStructureVisualInstances({
  boundsIntersect,
  cachedTerrainHeight,
  pointAlongPolyline,
  polylineCurvatureMetric
} = {}) {
  const intersectBounds = typeof boundsIntersect === "function" ? boundsIntersect : () => false;
  const sampleTerrainHeight = typeof cachedTerrainHeight === "function" ? cachedTerrainHeight : () => 0;
  const samplePointAlongPolyline = typeof pointAlongPolyline === "function" ? pointAlongPolyline : () => null;
  const measureCurvature = typeof polylineCurvatureMetric === "function" ? polylineCurvatureMetric : () => 0;

  const supportInstances = [];
  const portalInstances = [];
  const deckInstances = [];
  const girderInstances = [];
  const capInstances = [];
  const wallInstances = [];
  const roofInstances = [];
  const tunnelFloorInstances = [];
  const tunnelLightInstances = [];
  const guardrailInstances = [];
  const elevatedFeatures = []
    .concat(Array.isArray(appCtx.roads) ? appCtx.roads : [])
    .concat(Array.isArray(appCtx.linearFeatures) ? appCtx.linearFeatures.filter((feature) => feature?.isStructureConnector === true) : []);
  const elevatedVisualFeatures = elevatedFeatures.filter((feature) =>
    feature?.structureSemantics?.terrainMode === "elevated" &&
    Array.isArray(feature?.pts) &&
    feature.pts.length >= 2
  );

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

  for (let i = 0; i < elevatedFeatures.length; i++) {
    const feature = elevatedFeatures[i];
    const semantics = feature?.structureSemantics;
    if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2 || !semantics) continue;
    const category = String(semantics.featureCategory || feature.networkKind || feature.kind || "road").toLowerCase();
    const isConnectorLike = category === "connector" || category === "footway";
    const isSkywalk = semantics.skywalk || semantics.covered || semantics.indoor;
    const suppressExteriorVisuals = semantics.embeddedInBuilding === true;
    const roadLinkFeature = /(?:^|_)link$/i.test(String(feature?.type || ""));
    const localRoadType = String(feature?.type || "").toLowerCase();
    const lowPriorityRoadVisual =
      !isConnectorLike &&
      /^(service|residential|unclassified|living_street|track)$/.test(localRoadType);
    const visualDetail =
      semantics.terrainMode === "elevated" ?
        (isConnectorLike || isSkywalk ? 2.4 : 4.2) :
        10;
    const visualPts =
      typeof appCtx.subdivideRoadPoints === "function" && feature.pts.length >= 2 ?
        appCtx.subdivideRoadPoints(feature.pts, visualDetail) :
        feature.pts;
    const structurePts = Array.isArray(visualPts) && visualPts.length >= 2 ? visualPts : feature.pts;
    const guardrailEdges = buildGuardrailEdges(feature, structurePts, {
      outsideGap: 0.28,
      sampleTerrainY: sampleTerrainHeight
    });
    const { distances, total } = polylineDistances(structurePts);
    const curvatureMetric = measureCurvature(structurePts);
    const nearbyElevatedCount = semantics.terrainMode === "elevated" ?
      countNearbyElevatedFeatures(feature, elevatedVisualFeatures, intersectBounds) :
      0;
    const transitionAnchorDistances =
      Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0 ?
        feature.structureTransitionAnchors
          .map((anchor) => Number(anchor?.distance))
          .filter((distance) => Number.isFinite(distance)) :
        [];
    if (semantics.terrainMode === "elevated") {
      if (suppressExteriorVisuals) continue;
      const clutteredInterchange =
        !isConnectorLike &&
        !isSkywalk &&
        (
          roadLinkFeature ||
          !!semantics.rampCandidate ||
          (lowPriorityRoadVisual && nearbyElevatedCount >= 1) ||
          (total < 120 && nearbyElevatedCount >= 2) ||
          (nearbyElevatedCount >= 4) ||
          (curvatureMetric >= 0.22) ||
          (transitionAnchorDistances.length >= 2 && nearbyElevatedCount >= 2)
        );
      const renderRoadFullDeckBody =
        !isConnectorLike &&
        !isSkywalk &&
        !clutteredInterchange &&
        total >= 42;
      const renderRoadSideGirders =
        renderRoadFullDeckBody &&
        total >= 140 &&
        curvatureMetric < 0.12 &&
        nearbyElevatedCount <= 2;
      const renderRoadSupports =
        !isConnectorLike &&
        !isSkywalk &&
        !clutteredInterchange &&
        total >= 58 &&
        nearbyElevatedCount <= 3;
      const renderRoadAbutments = renderRoadFullDeckBody;
      const renderCapBeams = isConnectorLike || isSkywalk || renderRoadSupports;
      const width = Math.max(2, Number(feature.width) || 4);
      const deckThickness = isConnectorLike ? 0.72 : Math.max(0.9, Math.min(1.6, width * 0.11));
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
        const renderMinimalRoadDeckBody =
          !isConnectorLike &&
          !isSkywalk &&
          !suppressExteriorVisuals &&
          !clutteredInterchange &&
          total >= 24 &&
          segmentClearance > 0.95 &&
          (!nearTransitionVisual || segmentClearance > 1.35);
        const renderDeckBody =
          (
            isConnectorLike ||
            isSkywalk ||
            renderMinimalRoadDeckBody
          );
        const renderSideGirders =
          !nearTransitionVisual &&
          (
            isConnectorLike ||
            isSkywalk ||
            renderRoadSideGirders
          );
        const deckBodyThickness =
          isConnectorLike || isSkywalk ?
            deckThickness :
            (
              renderRoadFullDeckBody ?
                Math.max(0.16, Math.min(0.34, width * 0.028)) * (0.82 + rampVisualScale * 0.18) :
                Math.max(0.08, Math.min(0.18, width * 0.014)) * (0.88 + rampVisualScale * 0.12)
            );
        const deckBodyWidth =
          isConnectorLike || isSkywalk ?
            width + 0.5 :
            (
              renderRoadFullDeckBody ?
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
        if (guardrailSafety.protected) {
          for (const side of [-1, 1]) {
            const edge = side < 0 ? guardrailEdges.rightEdge : guardrailEdges.leftEdge;
            const edgeStart = edge[segIndex];
            const edgeEnd = edge[segIndex + 1];
            if (!edgeStart || !edgeEnd) continue;
            const railQuat = deckQuaternionForSegment(edgeStart, edgeStart.y, edgeEnd, edgeEnd.y);
            if (!railQuat) continue;
            const railX = (edgeStart.x + edgeEnd.x) * 0.5;
            const railY = (edgeStart.y + edgeEnd.y) * 0.5;
            const railZ = (edgeStart.z + edgeEnd.z) * 0.5;
            addBeam(
              guardrailInstances,
              railX,
              railY + 1.02,
              railZ,
              0.14,
              0.16,
              railQuat.length,
              rotationY,
              railQuat
            );
            addBeam(
              guardrailInstances,
              railX,
              railY + 0.56,
              railZ,
              0.1,
              0.12,
              railQuat.length,
              rotationY,
              railQuat
            );
            addBeam(
              guardrailInstances,
              railX,
              railY + 0.52,
              railZ,
              0.1,
              1.04,
              0.1,
              rotationY
            );
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

      const supportSpacing =
        isConnectorLike ?
          Math.max(16, width * 3.6) :
          Math.max(26, width * 3.8 + nearbyElevatedCount * 5);
      const skipNear = Math.max(8, width * 0.9);
      const skipDistance = (distance) => {
        if (distance < skipNear || distance > total - skipNear) return true;
        if (!Array.isArray(feature.structureStations)) return false;
        return feature.structureStations.some((station) =>
          Math.abs(distance - station.distance) < Math.max(width * 1.6, station.span * 0.58)
        );
      };

      if (isConnectorLike || renderRoadSupports) {
        for (let distance = supportSpacing * 0.5; distance < total; distance += supportSpacing) {
          if (skipDistance(distance)) continue;
          const point = samplePointAlongPolyline(structurePts, distance);
          if (!point) continue;
          const terrainY = sampleTerrainHeight(point.x, point.z);
          const deckY = sampleFeatureSurfaceY(feature, point.x, point.z);
          const supportDeckThickness = isConnectorLike ? 0.42 : 0.78;
          const supportHeight = deckY - deckThickness - terrainY;
          if (!(supportHeight > 2.4)) continue;
          const nx = -point.tangentZ;
          const nz = point.tangentX;
          const pierWidth =
            isConnectorLike ?
              Math.max(0.7, width * 0.22) :
              Math.max(1.2, Math.min(2.0, width * 0.14));
          if (isConnectorLike) {
            addSupportInstance({
              x: point.x,
              y: terrainY + supportHeight * 0.5,
              z: point.z,
              scaleX: pierWidth,
              scaleY: supportHeight,
              scaleZ: pierWidth
            });
          } else {
            const columnOffset = Math.max(1.2, Math.min(width * 0.24, width * 0.34));
            addSupportInstance({
              x: point.x + nx * columnOffset,
              y: terrainY + supportHeight * 0.5,
              z: point.z + nz * columnOffset,
              scaleX: pierWidth,
              scaleY: supportHeight,
              scaleZ: Math.max(1.0, pierWidth * 1.08)
            });
            addSupportInstance({
              x: point.x - nx * columnOffset,
              y: terrainY + supportHeight * 0.5,
              z: point.z - nz * columnOffset,
              scaleX: pierWidth,
              scaleY: supportHeight,
              scaleZ: Math.max(1.0, pierWidth * 1.08)
            });
            if (renderCapBeams) {
              addBeam(
                capInstances,
                point.x,
                deckY - supportDeckThickness - 0.18,
                point.z,
                width * 0.76,
                0.26,
                Math.max(0.5, pierWidth * 1.1),
                Math.atan2(point.tangentX, point.tangentZ)
              );
            }
          }
        }
      }

      if (!isConnectorLike && renderRoadSupports && renderCapBeams && Array.isArray(feature.structureStations)) {
        const stationSpanFactor = Math.max(8, width * 1.2);
        for (let s = 0; s < feature.structureStations.length; s++) {
          const station = feature.structureStations[s];
          const offsets = [
            station.distance - Math.max(stationSpanFactor, station.span * 0.68),
            station.distance + Math.max(stationSpanFactor, station.span * 0.68)
          ];
          for (let o = 0; o < offsets.length; o++) {
            const stationDistance = offsets[o];
            if (stationDistance <= skipNear || stationDistance >= total - skipNear) continue;
            const point = samplePointAlongPolyline(structurePts, stationDistance);
            if (!point) continue;
            const terrainY = sampleTerrainHeight(point.x, point.z);
            const deckY = sampleFeatureSurfaceY(feature, point.x, point.z);
            const supportHeight = deckY - deckThickness - terrainY;
            if (!(supportHeight > 2.6)) continue;
            const nx = -point.tangentZ;
            const nz = point.tangentX;
            const pierWidth = Math.max(1.2, Math.min(2.5, width * 0.17));
            const columnOffset = Math.max(1.2, Math.min(width * 0.28, width * 0.42));
            addSupportInstance({
              x: point.x + nx * columnOffset,
              y: terrainY + supportHeight * 0.5,
              z: point.z + nz * columnOffset,
              scaleX: pierWidth,
              scaleY: supportHeight,
              scaleZ: Math.max(1.0, pierWidth * 1.1)
            });
            addSupportInstance({
              x: point.x - nx * columnOffset,
              y: terrainY + supportHeight * 0.5,
              z: point.z - nz * columnOffset,
              scaleX: pierWidth,
              scaleY: supportHeight,
              scaleZ: Math.max(1.0, pierWidth * 1.1)
            });
            addBeam(
              capInstances,
              point.x,
              deckY - deckThickness - 0.2,
              point.z,
              width * 0.86,
              0.36,
              Math.max(0.58, pierWidth * 1.2),
              Math.atan2(point.tangentX, point.tangentZ)
            );
          }
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
      if (isConnectorLike || renderRoadAbutments) {
        addAbutmentAt(Math.min(6, total * 0.12));
        addAbutmentAt(Math.max(0, total - Math.min(6, total * 0.12)));
      }
    } else if (semantics.terrainMode === "subgrade") {
      const tunnel = collectTunnelVisualInstances(feature, structurePts, total, {
        samplePointAlongPolyline,
        sampleTerrainHeight
      });
      portalInstances.push(...tunnel.portals);
      wallInstances.push(...tunnel.walls);
      roofInstances.push(...tunnel.roofs);
      tunnelFloorInstances.push(...tunnel.floors);
      tunnelLightInstances.push(...tunnel.lights);
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
    tunnelFloorInstances,
    tunnelLightInstances,
    guardrailInstances
  };
}

export function clearStructureVisualMeshes() {
  return clearStructureVisualMeshesForContext(appCtx);
}

export function rebuildStructureVisualMeshes(deps = {}) {
  return rebuildStructureVisualMeshesForContext(appCtx, collectStructureVisualInstances, deps);
}
