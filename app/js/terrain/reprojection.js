import {
  buildFeatureRibbonEdges,
  isRoadSurfaceReachable
} from "../structure-semantics.js?v=28";
import { waterSurfaceBaseElevation } from "../world/load-geometry.js?v=20";
import { reconcileWaterBodySurface } from '../world/water-body-contract.js?v=3';

function createTerrainReprojectionApi(deps = {}) {
  const {
    appCtx,
    terrainMeshHeightAt,
    cachedBaseTerrainHeight,
    elevationWorldYAtWorldXZ
  } = deps;

  function reprojectWaterwayMeshToTerrain(mesh) {
    const centerline = mesh.userData?.waterwayCenterline;
    if (!centerline || centerline.length < 2) return false;

    const width = mesh.userData?.waterwayWidth || 6;
    const halfWidth = width * 0.5;
    const verticalBias = Number.isFinite(mesh.userData?.waterwayBias) ? mesh.userData.waterwayBias : 0.08;
    const positions = mesh.geometry?.attributes?.position;
    if (!positions || positions.count < centerline.length * 2) return false;

    for (let i = 0; i < centerline.length; i++) {
      const p = centerline[i];
      let dx;
      let dz;
      if (i === 0) {
        dx = centerline[1].x - p.x;
        dz = centerline[1].z - p.z;
      } else if (i === centerline.length - 1) {
        dx = p.x - centerline[i - 1].x;
        dz = p.z - centerline[i - 1].z;
      } else {
        dx = centerline[i + 1].x - centerline[i - 1].x;
        dz = centerline[i + 1].z - centerline[i - 1].z;
      }

      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const leftX = p.x + nx * halfWidth;
      const leftZ = p.z + nz * halfWidth;
      const rightX = p.x - nx * halfWidth;
      const rightZ = p.z - nz * halfWidth;
      const leftY = terrainMeshHeightAt(leftX, leftZ) + verticalBias;
      const rightY = terrainMeshHeightAt(rightX, rightZ) + verticalBias;

      positions.setXYZ(i * 2, leftX, leftY, leftZ);
      positions.setXYZ(i * 2 + 1, rightX, rightY, rightZ);
    }

    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    return true;
  }

  function reprojectLinearFeatureMeshToTerrain(mesh) {
    const centerline = mesh.userData?.linearFeatureCenterline;
    if (!centerline || centerline.length < 2) return false;

    const width = mesh.userData?.linearFeatureWidth || 2;
    const halfWidth = width * 0.5;
    const verticalBias = Number.isFinite(mesh.userData?.linearFeatureBias) ? mesh.userData.linearFeatureBias : 0.05;
    const positions = mesh.geometry?.attributes?.position;
    if (!positions || positions.count < centerline.length * 2) return false;
    const featureRef = mesh.userData?.linearFeatureRef || null;
    if (featureRef?.structureSemantics?.gradeSeparated) {
      const ribbonEdges = buildFeatureRibbonEdges(featureRef, centerline, halfWidth, cachedBaseTerrainHeight, {
        surfaceBias: verticalBias
      });
      if (ribbonEdges.leftEdge.length === centerline.length && ribbonEdges.rightEdge.length === centerline.length) {
        for (let i = 0; i < centerline.length; i++) {
          const leftEdge = ribbonEdges.leftEdge[i];
          const rightEdge = ribbonEdges.rightEdge[i];
          positions.setXYZ(i * 2, leftEdge.x, leftEdge.y, leftEdge.z);
          positions.setXYZ(i * 2 + 1, rightEdge.x, rightEdge.y, rightEdge.z);
        }
        positions.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        return true;
      }
    }

    const resolveBaseY = (x, z, kind) => {
      const terrainY = terrainMeshHeightAt(x, z);
      const fallbackTerrain = Number.isFinite(terrainY) ? terrainY : 0;
      const nearestRoad = typeof appCtx.findNearestRoad === "function" ? appCtx.findNearestRoad(x, z, {
        y: fallbackTerrain + 0.4,
        maxVerticalDelta: 6
      }) : null;
      const snapPadding =
        kind === "footway" ? 2.4 :
        kind === "cycleway" ? 2.0 :
        1.0;
      const shouldSnapToRoad = isRoadSurfaceReachable(nearestRoad, {
        extraLateralPadding: snapPadding - 1.35
      });
      if (shouldSnapToRoad) {
        const roadSampleX = Number.isFinite(nearestRoad?.pt?.x) ? nearestRoad.pt.x : x;
        const roadSampleZ = Number.isFinite(nearestRoad?.pt?.z) ? nearestRoad.pt.z : z;
        const roadY =
          appCtx.GroundHeight && typeof appCtx.GroundHeight.roadMeshY === "function" ?
            appCtx.GroundHeight.roadMeshY(roadSampleX, roadSampleZ) :
            null;
        if (Number.isFinite(roadY)) return roadY;
        if (appCtx.GroundHeight && typeof appCtx.GroundHeight.roadSurfaceY === "function") {
          return appCtx.GroundHeight.roadSurfaceY(roadSampleX, roadSampleZ);
        }
        return fallbackTerrain + 0.08;
      }
      return fallbackTerrain;
    };

    const kind = String(mesh.userData?.linearFeatureKind || "").toLowerCase();
    for (let i = 0; i < centerline.length; i++) {
      const p = centerline[i];
      let dx;
      let dz;
      if (i === 0) {
        dx = centerline[1].x - p.x;
        dz = centerline[1].z - p.z;
      } else if (i === centerline.length - 1) {
        dx = p.x - centerline[i - 1].x;
        dz = p.z - centerline[i - 1].z;
      } else {
        dx = centerline[i + 1].x - centerline[i - 1].x;
        dz = centerline[i + 1].z - centerline[i - 1].z;
      }

      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const leftX = p.x + nx * halfWidth;
      const leftZ = p.z + nz * halfWidth;
      const rightX = p.x - nx * halfWidth;
      const rightZ = p.z - nz * halfWidth;
      const leftY = resolveBaseY(leftX, leftZ, kind) + verticalBias;
      const rightY = resolveBaseY(rightX, rightZ, kind) + verticalBias;

      positions.setXYZ(i * 2, leftX, leftY, leftZ);
      positions.setXYZ(i * 2 + 1, rightX, rightY, rightZ);
    }

    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    return true;
  }

  function repositionBuildingsWithTerrain() {
    if (!appCtx.terrainEnabled || appCtx.onMoon) return;

    const collidersBySourceId = new Map();
    if (Array.isArray(appCtx.buildings)) {
      for (let i = 0; i < appCtx.buildings.length; i++) {
        const building = appCtx.buildings[i];
        if (!building) continue;
        const sourceId = String(building.sourceBuildingId || '');
        if (!sourceId) continue;
        if (!collidersBySourceId.has(sourceId)) collidersBySourceId.set(sourceId, []);
        collidersBySourceId.get(sourceId).push(building);
      }
    }

    appCtx.buildingMeshes.forEach((mesh) => {
      const pts = mesh.userData.buildingFootprint;
      if (!pts || pts.length === 0) return;

      const fallbackElevation = Number.isFinite(mesh.userData?.avgElevation) ?
        mesh.userData.avgElevation :
        0;

      let minElevation = Infinity;
      let maxElevation = -Infinity;
      let sampleCount = 0;
      pts.forEach((p) => {
        let h = terrainMeshHeightAt(p.x, p.z);
        if ((!Number.isFinite(h) || h === 0) && typeof elevationWorldYAtWorldXZ === "function") {
          h = elevationWorldYAtWorldXZ(p.x, p.z);
        }
        if (h === 0 && Math.abs(fallbackElevation) > 2) h = fallbackElevation;
        if (!Number.isFinite(h)) return;
        minElevation = Math.min(minElevation, h);
        maxElevation = Math.max(maxElevation, h);
        sampleCount++;
      });

      if (!Number.isFinite(minElevation) || sampleCount === 0) {
        minElevation = Number.isFinite(fallbackElevation) ? fallbackElevation : 0;
        maxElevation = minElevation;
      }

      const slopeRange = Number.isFinite(maxElevation) && Number.isFinite(minElevation) ?
        Math.max(0, maxElevation - minElevation) :
        0;
      const reliefLift = slopeRange >= 0.15 ? Math.min(0.35, slopeRange * 0.22) : 0.05;
      const structureBaseOffset = Number.isFinite(mesh.userData?.structureBaseOffset) ?
        mesh.userData.structureBaseOffset :
        0;
      const baseElevation = minElevation + reliefLift + structureBaseOffset;
      const midLodHalfHeight = Number.isFinite(mesh.userData?.midLodHalfHeight) ?
        mesh.userData.midLodHalfHeight :
        0;
      mesh.position.y = mesh.userData?.midLodPositionMode === 'base' ?
        baseElevation :
        baseElevation + midLodHalfHeight;
      mesh.userData.avgElevation = baseElevation;

      const sourceBuildingId = String(mesh.userData?.sourceBuildingId || "");
      if (sourceBuildingId) {
        const colliders = collidersBySourceId.get(sourceBuildingId) || [];
        for (let i = 0; i < colliders.length; i++) {
          const building = colliders[i];
          building.baseY = baseElevation;
          building.minY = baseElevation;
          building.maxY = baseElevation + (Number.isFinite(building.height) ? building.height : 0);
        }
      }
    });

    appCtx.landuseMeshes.forEach((mesh) => {
      if (mesh.userData?.isWaterwayLine) {
        reprojectWaterwayMeshToTerrain(mesh);
        return;
      }

      const pts = mesh.userData.landuseFootprint;
      if (!pts || pts.length === 0) return;

      const sampledHeights = [];
      pts.forEach((p) => {
        sampledHeights.push(terrainMeshHeightAt(p.x, p.z));
      });
      const isWaterPolygon = mesh.userData?.landuseType === "water";
      const avgElevation = isWaterPolygon
        ? waterSurfaceBaseElevation(sampledHeights)
        : sampledHeights.reduce((sum, value) => sum + value, 0) / sampledHeights.length;
      mesh.position.y = avgElevation;

      const positions = mesh.geometry.attributes.position;
      if (!positions) return;

      const flattenFactor = isWaterPolygon ?
        Number.isFinite(mesh.userData?.waterFlattenFactor) ? mesh.userData.waterFlattenFactor : 0.12 :
        1.0;
      const vertexOffset = isWaterPolygon ? 0.08 : 0.05;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const tY = terrainMeshHeightAt(x, z);
        positions.setY(i, (tY - avgElevation) * flattenFactor + vertexOffset);
      }
      positions.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      if (isWaterPolygon) {
        mesh.userData.waterSurfaceBase = avgElevation;
        if (mesh.userData.waterAreaRef) {
          reconcileWaterBodySurface(mesh.userData.waterAreaRef, avgElevation + vertexOffset, {
            datumMethod: 'terrain-reprojection',
            datumConfidence: 0.92
          });
        }
      }
    });

    appCtx.linearFeatureMeshes.forEach((mesh) => {
      reprojectLinearFeatureMeshToTerrain(mesh);
    });

    appCtx.poiMeshes.forEach((mesh) => {
      const pos = mesh.userData.poiPosition;
      if (!pos) return;

      const tY = terrainMeshHeightAt(pos.x, pos.z);
      const offset = mesh.userData.isCapMesh ? 4 : 2;
      mesh.position.y = tY + offset;
    });

    appCtx.streetFurnitureMeshes.forEach((group) => {
      if (!group.userData || !group.userData.furniturePos) return;
      const pos = group.userData.furniturePos;
      const tY = terrainMeshHeightAt(pos.x, pos.z);
      group.position.y = tY;
    });
  }

  return {
    repositionBuildingsWithTerrain
  };
}

export { createTerrainReprojectionApi };
