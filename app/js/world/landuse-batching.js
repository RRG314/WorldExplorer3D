import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  appendGeometryWithTransform,
  boundingSphereCenter,
  buildMergedGeometry,
  disposeSceneMesh,
  materialBatchKey
} from "./geometry-batching.js?v=4";

export function batchLanduseMeshes() {
  try {
    if (!Array.isArray(appCtx.landuseMeshes) || appCtx.landuseMeshes.length < 4) return 0;

    const keep = [];
    const groups = new Map();

    for (let i = 0; i < appCtx.landuseMeshes.length; i++) {
      const mesh = appCtx.landuseMeshes[i];
      if (!mesh || mesh.userData?.isLanduseBatch) {
        if (mesh) keep.push(mesh);
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
      const type = mesh.userData?.landuseType || 'unknown';
      const isWaterwayLine = !!mesh.userData?.isWaterwayLine;
      if (type === 'water' || isWaterwayLine) {
        keep.push(mesh);
        continue;
      }
      const key = `${type}|${isWaterwayLine ? 1 : 0}|${mesh.renderOrder || 0}|${matKey}`;

      if (!groups.has(key)) {
        groups.set(key, {
          meshes: [],
          material: mesh.material,
          renderOrder: mesh.renderOrder || 0,
          landuseType: type,
          isWaterwayLine,
          surfaceVariant: mesh.userData?.surfaceVariant || type,
          alwaysVisible: false,
          anyVisible: false
        });
      }
      const group = groups.get(key);
      group.meshes.push(mesh);
      group.alwaysVisible = group.alwaysVisible || !!mesh.userData?.alwaysVisible;
      group.anyVisible = group.anyVisible || !!mesh.visible;
    }

    if (!groups.size) return 0;

    const batched = [];
    let sourceCount = 0;

    groups.forEach((group) => {
      if (!group || !Array.isArray(group.meshes) || group.meshes.length < 2) {
        if (group?.meshes?.length === 1) keep.push(group.meshes[0]);
        return;
      }

      const batch = { positions: [], normals: [], uvs: [], indices: [] };
      const xzPoints = [];

      for (let i = 0; i < group.meshes.length; i++) {
        const mesh = group.meshes[i];
        mesh.updateMatrixWorld(true);
        appendGeometryWithTransform(batch, mesh.geometry, mesh.matrixWorld);

        let cx = Number.isFinite(mesh.position?.x) ? mesh.position.x : 0;
        let cz = Number.isFinite(mesh.position?.z) ? mesh.position.z : 0;
        const footprint = mesh.userData?.landuseFootprint || mesh.userData?.waterwayCenterline;
        if (Array.isArray(footprint) && footprint.length > 0) {
          let sumX = 0;
          let sumZ = 0;
          for (let p = 0; p < footprint.length; p++) {
            sumX += footprint[p].x;
            sumZ += footprint[p].z;
          }
          cx = sumX / footprint.length;
          cz = sumZ / footprint.length;
        } else {
          const center = boundingSphereCenter(mesh, cx, cz);
          cx = center.x;
          cz = center.z;
        }
        xzPoints.push({ x: cx, z: cz });
      }

      const geometry = buildMergedGeometry(batch);
      if (!geometry) {
        keep.push(...group.meshes);
        return;
      }

      const material = group.material.clone();
      const mergedMesh = new THREE.Mesh(geometry, material);
      mergedMesh.renderOrder = group.renderOrder;
      mergedMesh.receiveShadow = false;
      mergedMesh.castShadow = false;
      mergedMesh.frustumCulled = true;

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
        landuseType: group.landuseType,
        isWaterwayLine: !!group.isWaterwayLine,
        surfaceVariant: group.surfaceVariant,
        isLanduseBatch: true,
        alwaysVisible: group.alwaysVisible,
        batchCount: group.meshes.length,
        lodCenter: { x: centerX, z: centerZ },
        lodRadius: maxRadius
      };
      mergedMesh.visible = group.anyVisible || group.alwaysVisible;

      appCtx.scene.add(mergedMesh);
      batched.push(mergedMesh);
      for (let i = 0; i < group.meshes.length; i++) disposeSceneMesh(group.meshes[i]);
      sourceCount += group.meshes.length;
    });

    if (!batched.length) {
      appCtx._lastLanduseBatchStats = { groupCount: groups.size, batchMeshCount: 0, sourceMeshCount: 0 };
      return 0;
    }
    appCtx.replaceWorldCollection('landuseMeshes', [...keep, ...batched]);
    appCtx._lastLanduseBatchStats = {
      groupCount: groups.size,
      batchMeshCount: batched.length,
      sourceMeshCount: sourceCount
    };
    return sourceCount;
  } catch (err) {
    console.warn('[WorldLoad] batchLanduseMeshes failed:', err);
    appCtx._lastLanduseBatchStats = {
      groupCount: 0,
      batchMeshCount: 0,
      sourceMeshCount: 0,
      error: err?.message || String(err)
    };
    return 0;
  }
}
