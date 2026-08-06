import fs from 'node:fs/promises';
import path from 'node:path';

export async function captureViewport(page, filePath) {
  const diagnostics = await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    const camera = ctx.camera;
    const nearbyMeshes = [];
    const roadBatchSummary = {};
    ctx.scene?.traverse?.((object) => {
      if (object?.isMesh && object.userData?.isRoadBatch) {
        const key = `${object.parent?.name || object.parent?.type || 'unknown'}:${Number(object.userData.worldLoadSequence || 0)}`;
        roadBatchSummary[key] = Number(roadBatchSummary[key] || 0) + 1;
      }
      if (!camera || !object?.isMesh || object.visible === false || !object.geometry) return;
      object.geometry.computeBoundingBox?.();
      const bounds = object.geometry.boundingBox;
      if (!bounds) return;
      const localCamera = object.worldToLocal(camera.position.clone());
      const distance = bounds.distanceToPoint(localCamera);
      if (distance > 4) return;
      object.geometry.computeBoundingSphere?.();
      nearbyMeshes.push({
        name: object.name || '(unnamed)',
        parent: object.parent?.name || object.parent?.type || '(unnamed)',
        ancestry: (() => {
          const names = [];
          let current = object;
          while (current && names.length < 6) {
            names.push(current.name || current.type || '(unnamed)');
            current = current.parent;
          }
          return names;
        })(),
        distance: Number(distance.toFixed(2)),
        radius: Number(Number(object.geometry.boundingSphere?.radius || 0).toFixed(1)),
        terrain: !!object.userData?.isTerrainMesh,
        landuseType: object.userData?.landuseType || null,
        roadBatch: !!(object.userData?.roadBatch || object.userData?.isRoadBatch),
        structureVisual: !!object.userData?.structureVisual,
        groundPlane: !!object.userData?.isGroundPlane,
        userDataKeys: Object.keys(object.userData || {}).sort()
      });
    });
    return {
      camera: camera ? {
        x: Number(camera.position.x.toFixed(2)),
        y: Number(camera.position.y.toFixed(2)),
        z: Number(camera.position.z.toFixed(2))
      } : null,
      car: {
        stateY: Number(Number(ctx.car?.y || 0).toFixed(2)),
        meshY: Number(Number(ctx.carMesh?.position?.y || 0).toFixed(2)),
        onRoad: !!ctx.car?.onRoad
      },
      lastEarthWorldSceneClear: ctx.lastEarthWorldSceneClear || null,
      roadBatchSummary,
      nearbyMeshes: nearbyMeshes.sort((a, b) => a.distance - b.distance).slice(0, 20)
    };
  });
  const session = await page.context().newCDPSession(page);
  try {
    const result = await session.send('Page.captureScreenshot', {
      captureBeyondViewport: false,
      format: 'png',
      fromSurface: true
    });
    await fs.writeFile(filePath, Buffer.from(result.data, 'base64'));
  } finally {
    await session.detach();
  }
  return diagnostics;
}

export async function captureDroneView(page, spec, result, outputDir) {
  const presentation = await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    ctx.setTravelMode?.('drone', { source: 'world_matrix_visual', emitTutorial: false, force: true });
    const groundY = Number(
      ctx.GroundHeight?.walkSurfaceY?.(ctx.drone?.x || 0, ctx.drone?.z || 0, ctx.car?.y) ??
      ctx.elevationWorldYAtWorldXZ?.(ctx.drone?.x || 0, ctx.drone?.z || 0) ??
      0
    );
    let nearbyMaximumY = groundY;
    for (const offsetX of [-400, -200, 0, 200, 400]) {
      for (const offsetZ of [-400, -200, 0, 200, 400]) {
        const sampleY = Number(
          ctx.SurfaceQuery?.terrainAt?.(
            Number(ctx.drone?.x || 0) + offsetX,
            Number(ctx.drone?.z || 0) + offsetZ
          )?.position?.y
        );
        if (Number.isFinite(sampleY)) nearbyMaximumY = Math.max(nearbyMaximumY, sampleY);
      }
    }
    if (typeof THREE !== 'undefined') {
      const droneX = Number(ctx.drone?.x || 0);
      const droneZ = Number(ctx.drone?.z || 0);
      for (const terrainMesh of ctx.terrainGroup?.children || []) {
        if (!terrainMesh?.isMesh || terrainMesh.visible === false) continue;
        const bounds = new THREE.Box3().setFromObject(terrainMesh);
        const distanceX = droneX < bounds.min.x ? bounds.min.x - droneX :
          droneX > bounds.max.x ? droneX - bounds.max.x : 0;
        const distanceZ = droneZ < bounds.min.z ? bounds.min.z - droneZ :
          droneZ > bounds.max.z ? droneZ - bounds.max.z : 0;
        if (Math.hypot(distanceX, distanceZ) <= 700 && Number.isFinite(bounds.max.y)) {
          nearbyMaximumY = Math.max(nearbyMaximumY, bounds.max.y);
        }
      }
    }
    if (ctx.drone) {
      ctx.drone.y = Math.max(groundY + 80, nearbyMaximumY + 100);
      ctx.drone.pitch = -0.48;
    }
    ctx.publishLocationWorld?.();
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    const allMeshes = (ctx.buildingMeshes || []).filter((mesh) => mesh?.isMesh);
    const meshes = allMeshes.filter((mesh) => mesh.visible !== false);
    const sourceCount = (mesh) => Math.max(1, Number(mesh.userData?.batchCount || 1));
    const nearMeshes = allMeshes.filter((mesh) => String(mesh.userData?.lodTier || 'near') === 'near');
    const visibleNearMeshes = nearMeshes.filter((mesh) => mesh.visible !== false);
    return {
      altitude: Number((Number(ctx.drone?.y || 0) - groundY).toFixed(1)),
      nearbyTerrainClearance: Number((Number(ctx.drone?.y || 0) - nearbyMaximumY).toFixed(1)),
      visibleMeshes: meshes.length,
      visibleSources: meshes.reduce((sum, mesh) => sum + sourceCount(mesh), 0),
      totalNearSources: nearMeshes.reduce((sum, mesh) => sum + sourceCount(mesh), 0),
      visibleNearSources: visibleNearMeshes.reduce((sum, mesh) => sum + sourceCount(mesh), 0),
      contextLost: !!ctx.renderer?.getContext?.().isContextLost?.()
    };
  });
  await captureViewport(page, path.join(outputDir, `${spec.id}-drone.png`));
  if (String(spec.category || '').includes('bridge')) {
    const landmarkOverview = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      const targets = (ctx.historicMarkers || []).filter((mesh) =>
        String(mesh?.userData?.landmarkKind || '').startsWith('suspension_bridge')
      );
      if (!ctx.camera || !ctx.renderer || targets.length === 0 || typeof THREE === 'undefined') return null;
      const bounds = new THREE.Box3();
      targets.forEach((mesh) => bounds.expandByObject(mesh));
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const bridgeRunsAlongX = size.x >= size.z;
      const sideDistance = Math.max(520, Math.min(980, Math.max(size.x, size.z) * 0.34));
      const cameraY = center.y + Math.max(80, Math.min(180, size.y * 0.18));
      const cameraX = center.x + (bridgeRunsAlongX ? 0 : sideDistance);
      const cameraZ = center.z + (bridgeRunsAlongX ? sideDistance : 0);
      const targetY = center.y + size.y * 0.06;
      const dx = center.x - cameraX;
      const dy = targetY - cameraY;
      const dz = center.z - cameraZ;
      const horizontalDistance = Math.hypot(dx, dz) || 1;
      if (ctx.drone) {
        ctx.drone.x = cameraX;
        ctx.drone.y = cameraY;
        ctx.drone.z = cameraZ;
        ctx.drone.yaw = Math.atan2(-dx, -dz);
        ctx.drone.pitch = Math.atan2(dy, horizontalDistance);
        ctx.drone.roll = 0;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      ctx.camera.position.set(cameraX, cameraY, cameraZ);
      ctx.camera.lookAt(center.x, targetY, center.z);
      ctx.camera.updateProjectionMatrix?.();
      ctx.camera.updateMatrixWorld?.(true);
      ctx.renderer.render(ctx.scene, ctx.camera);
      return {
        center: { x: center.x, y: center.y, z: center.z },
        size: { x: size.x, y: size.y, z: size.z },
        targetMeshes: targets.length
      };
    });
    if (landmarkOverview) {
      await captureViewport(page, path.join(outputDir, `${spec.id}-landmark.png`));
      result.landmarkOverview = landmarkOverview;
    }
  }
  await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    mod?.ctx?.setTravelMode?.('drive', { source: 'world_matrix_visual', emitTutorial: false });
  }).catch(() => {});
  result.dronePresentation = presentation;
}
