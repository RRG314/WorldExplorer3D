import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  boundingSphereCenter,
  buildMergedGeometry,
  disposeSceneMesh,
  materialBatchKey,
  appendGeometryWithTransform
} from "./geometry-batching.js?v=4";
import { restoreFacadeWallMask } from "../engine/building-facade-shader.js?v=1";

const BUILDING_BATCH_CELL_METERS = 420;

function buildingMeshCenter(mesh) {
  const footprint = mesh?.userData?.buildingFootprint;
  if (Array.isArray(footprint) && footprint.length > 0) {
    let x = 0;
    let z = 0;
    for (let i = 0; i < footprint.length; i++) {
      x += footprint[i].x;
      z += footprint[i].z;
    }
    return { x: x / footprint.length, z: z / footprint.length };
  }
  return boundingSphereCenter(mesh, Number(mesh?.position?.x || 0), Number(mesh?.position?.z || 0));
}

export function batchMidLodBuildingMeshes() {
  return batchBuildingMeshesByTier(['mid']);
}

function batchBuildingMeshesByTier(tiers = ['near']) {
  try {
    if (!Array.isArray(appCtx.buildingMeshes) || appCtx.buildingMeshes.length < 2) return 0;
    const tierSet = new Set(Array.isArray(tiers) ? tiers : ['near']);

    const keep = [];
    const groups = new Map();

    for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
      const mesh = appCtx.buildingMeshes[i];
      if (!mesh) continue;
      const tier = mesh.userData?.lodTier || 'near';
      if (!tierSet.has(tier) || mesh.userData?.isBuildingBatch) {
        keep.push(mesh);
        continue;
      }
      if (!mesh.geometry || !mesh.material || Array.isArray(mesh.material)) {
        keep.push(mesh);
        continue;
      }

      const matKey = materialBatchKey(mesh.material);
      if (!matKey) {
        keep.push(mesh);
        continue;
      }
      const center = buildingMeshCenter(mesh);
      const cellX = Math.floor(center.x / BUILDING_BATCH_CELL_METERS);
      const cellZ = Math.floor(center.z / BUILDING_BATCH_CELL_METERS);
      const key = `${tier}|${cellX},${cellZ}|${matKey}`;
      if (!groups.has(key)) {
        groups.set(key, {
          meshes: [],
          material: mesh.material,
          renderOrder: mesh.renderOrder || 0,
          lodTier: tier
        });
      }
      groups.get(key).meshes.push(mesh);
    }

    if (groups.size === 0) return 0;

    const batchedMeshes = [];
    let sourceMeshCount = 0;

    groups.forEach((group) => {
      if (!group || !Array.isArray(group.meshes) || group.meshes.length < 2) {
        if (group?.meshes?.length === 1) keep.push(group.meshes[0]);
        return;
      }

      const batch = { positions: [], normals: [], uvs: [], indices: [] };
      const sourceMeshes = [];
      const xzPoints = [];

      for (let i = 0; i < group.meshes.length; i++) {
        const mesh = group.meshes[i];
        mesh.updateMatrixWorld(true);
        const appendCount = appendGeometryWithTransform(batch, mesh.geometry, mesh.matrixWorld);
        if (appendCount <= 0) {
          keep.push(mesh);
          continue;
        }
        sourceMeshes.push(mesh);

        xzPoints.push(buildingMeshCenter(mesh));
      }

      if (sourceMeshes.length < 2) {
        keep.push(...sourceMeshes);
        return;
      }

      const geometry = buildMergedGeometry(batch);
      if (!geometry) {
        keep.push(...sourceMeshes);
        return;
      }

      const material = group.material.clone();
      restoreFacadeWallMask(material);
      const mergedMesh = new THREE.Mesh(geometry, material);
      mergedMesh.renderOrder = group.renderOrder;
      mergedMesh.castShadow = true;
      mergedMesh.receiveShadow = true;
      mergedMesh.frustumCulled = false;

      let centerX = 0;
      let centerZ = 0;
      for (let i = 0; i < xzPoints.length; i++) {
        centerX += xzPoints[i].x;
        centerZ += xzPoints[i].z;
      }
      centerX /= xzPoints.length;
      centerZ /= xzPoints.length;

      let maxRadius = 0;
      for (let i = 0; i < xzPoints.length; i++) {
        maxRadius = Math.max(maxRadius, Math.hypot(xzPoints[i].x - centerX, xzPoints[i].z - centerZ));
      }

      mergedMesh.userData = {
        lodTier: group.lodTier || 'near',
        isBuildingBatch: true,
        isNearBuildingBatch: true,
        batchCount: sourceMeshes.length,
        lodCenter: { x: centerX, z: centerZ },
        lodRadius: maxRadius
      };

      appCtx.scene.add(mergedMesh);
      batchedMeshes.push(mergedMesh);
      for (let i = 0; i < sourceMeshes.length; i++) disposeSceneMesh(sourceMeshes[i]);
      sourceMeshCount += sourceMeshes.length;
    });

    if (!batchedMeshes.length) {
      appCtx._lastBuildingBatchStats = { groupCount: groups.size, batchMeshCount: 0, sourceMeshCount: 0 };
      return 0;
    }
    appCtx.replaceWorldCollection('buildingMeshes', [...keep, ...batchedMeshes]);
    appCtx._lastBuildingBatchStats = {
      groupCount: groups.size,
      batchMeshCount: batchedMeshes.length,
      sourceMeshCount
    };
    return sourceMeshCount;
  } catch (err) {
    console.warn('[WorldLoad] batchNearLodBuildingMeshes failed:', err);
    appCtx._lastBuildingBatchStats = {
      groupCount: 0,
      batchMeshCount: 0,
      sourceMeshCount: 0,
      error: err?.message || String(err)
    };
    return 0;
  }
}

export function batchNearLodBuildingMeshes() {
  return batchBuildingMeshesByTier(['near']);
}
