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
      cameraMode: Number(ctx.camMode),
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
    if (ctx.drone) {
      ctx.drone.y = groundY + 80;
      ctx.drone.pitch = -0.48;
    }
    ctx.updateWorldLod?.(true);
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    const allMeshes = (ctx.buildingMeshes || []).filter((mesh) => mesh?.isMesh);
    const meshes = allMeshes.filter((mesh) => mesh.visible !== false);
    const sourceCount = (mesh) => Math.max(1, Number(mesh.userData?.batchCount || 1));
    const nearMeshes = allMeshes.filter((mesh) => String(mesh.userData?.lodTier || 'near') === 'near');
    const visibleNearMeshes = nearMeshes.filter((mesh) => mesh.visible !== false);
    return {
      altitude: Number((Number(ctx.drone?.y || 0) - groundY).toFixed(1)),
      visibleMeshes: meshes.length,
      visibleSources: meshes.reduce((sum, mesh) => sum + sourceCount(mesh), 0),
      totalNearSources: nearMeshes.reduce((sum, mesh) => sum + sourceCount(mesh), 0),
      visibleNearSources: visibleNearMeshes.reduce((sum, mesh) => sum + sourceCount(mesh), 0),
      contextLost: !!ctx.renderer?.getContext?.().isContextLost?.()
    };
  });
  await captureViewport(page, path.join(outputDir, `${spec.id}-drone.png`));
  const category = String(spec.category || '');
  const captureBridge = category.includes('bridge');
  const capturePyramid = category.includes('historic_arid');
  const captureCurated = category.includes('historic');
  if (captureBridge || capturePyramid || captureCurated) {
    const landmarkOverview = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      const targets = (ctx.historicMarkers || []).filter((mesh) =>
        String(mesh?.userData?.landmarkKind || '').startsWith('suspension_bridge') ||
        String(mesh?.userData?.landmarkKind || '') === 'pyramid' ||
        !!mesh?.userData?.curatedLandmarkId
      );
      if (!ctx.camera || !ctx.renderer || targets.length === 0 || typeof THREE === 'undefined') return null;
      const bounds = new THREE.Box3();
      targets.forEach((mesh) => bounds.expandByObject(mesh));
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const bridgeRunsAlongX = size.x >= size.z;
      const pyramidComplex = targets.some((mesh) => String(mesh?.userData?.landmarkKind || '') === 'pyramid');
      const sideDistance = pyramidComplex
        ? Math.max(420, Math.min(760, Math.max(size.x, size.z) * 0.58))
        : Math.max(520, Math.min(980, Math.max(size.x, size.z) * 0.34));
      const cameraY = center.y + (pyramidComplex
        ? Math.max(105, Math.min(190, size.y * 0.72))
        : Math.max(80, Math.min(180, size.y * 0.18)));
      const cameraX = center.x + (pyramidComplex ? sideDistance : (bridgeRunsAlongX ? 0 : sideDistance));
      const cameraZ = center.z + (pyramidComplex ? sideDistance * -0.78 : (bridgeRunsAlongX ? sideDistance : 0));
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

export async function captureTunnelPortalTraversal(page, spec, result, outputDir) {
  const placeAtStage = async (stage, ratio = null) => page.evaluate(async ({ stageName, stationRatio }) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    const tunnelRoads = (ctx.roads || []).filter((road) =>
      road?.structureSemantics?.structureKind === 'tunnel' &&
      Array.isArray(road.pts) && road.pts.length >= 2
    );
    const roadLength = (road) => road.pts.slice(0, -1).reduce((total, point, index) =>
      total + Math.hypot(road.pts[index + 1].x - point.x, road.pts[index + 1].z - point.z), 0
    );
    tunnelRoads.sort((a, b) => roadLength(b) - roadLength(a));
    const tunnel = tunnelRoads[0] || null;
    if (!tunnel) return { stage: stageName, applied: false, reason: 'tunnel_missing' };

    let road = tunnel;
    let endpoint = null;
    let targetDistance = roadLength(tunnel) * Number(stationRatio || 0);
    if (stageName === 'exit') {
      const candidates = ['start', 'end'].flatMap((side) =>
        (tunnel.connectedFeatures?.[side] || []).map((entry) => ({ side, ...entry }))
      ).filter((entry) =>
        entry.feature &&
        entry.feature?.structureSemantics?.terrainMode !== 'subgrade' &&
        Array.isArray(entry.feature.pts) && entry.feature.pts.length >= 2
      );
      const connection = candidates[0] || null;
      if (!connection) {
        return {
          stage: stageName,
          applied: false,
          reason: 'at_grade_portal_connection_missing',
          tunnelLength: Number(roadLength(tunnel).toFixed(2))
        };
      }
      road = connection.feature;
      endpoint = connection.endpoint;
      const length = roadLength(road);
      targetDistance = endpoint === 'start' ? Math.min(8, length * 0.25) : Math.max(0, length - Math.min(8, length * 0.25));
    }

    const totalLength = roadLength(road);
    const clampedDistance = Math.max(0, Math.min(totalLength, targetDistance));
    let traversed = 0;
    let segmentIndex = 0;
    let t = 0;
    for (let i = 0; i < road.pts.length - 1; i += 1) {
      const segmentLength = Math.hypot(
        road.pts[i + 1].x - road.pts[i].x,
        road.pts[i + 1].z - road.pts[i].z
      );
      if (traversed + segmentLength >= clampedDistance || i === road.pts.length - 2) {
        segmentIndex = i;
        t = segmentLength > 0 ? (clampedDistance - traversed) / segmentLength : 0;
        break;
      }
      traversed += segmentLength;
    }
    const start = road.pts[segmentIndex];
    const end = road.pts[segmentIndex + 1];
    const x = start.x + (end.x - start.x) * t;
    const z = start.z + (end.z - start.z) * t;
    const angle = Math.atan2(-(end.x - start.x), -(end.z - start.z));
    const surfaceY = Number(ctx.sampleFeatureSurfaceY?.(road, x, z, { segIndex: segmentIndex, t }));
    if (!Number.isFinite(surfaceY) || typeof ctx.applyResolvedWorldSpawn !== 'function') {
      return { stage: stageName, applied: false, reason: 'surface_or_spawn_unavailable' };
    }
    ctx.setTravelMode?.('drive', { source: 'world_matrix_tunnel_portal', emitTutorial: false, force: true });
    ctx.applyResolvedWorldSpawn({
      valid: true,
      mode: 'drive',
      x,
      z,
      angle,
      carY: surfaceY + 1.2,
      walkY: surfaceY + 1.7,
      onRoad: true,
      road,
      source: `world_matrix_tunnel_${stageName}`
    }, { mode: 'drive' });
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    const renderedY = ctx.GroundHeight?._raycastMeshY?.(ctx.roadMeshes || [], x, z, surfaceY + 2.2, 5);
    const terrainY = ctx.SurfaceQuery?.terrainAt?.(x, z)?.position?.y;
    const waterMeshes = (ctx.landuseMeshes || []).filter((mesh) =>
      mesh?.userData?.landuseType === 'water' || !!mesh?.userData?.waterAreaRef
    );
    return {
      stage: stageName,
      applied: true,
      endpoint,
      ratio: Number.isFinite(stationRatio) ? stationRatio : null,
      x: Number(x.toFixed(2)),
      z: Number(z.toFixed(2)),
      roadName: road.name || road.ref || null,
      structureKind: road.structureSemantics?.structureKind || 'at_grade',
      terrainMode: road.structureSemantics?.terrainMode || 'at_grade',
      surfaceY: Number(surfaceY.toFixed(2)),
      renderedY: Number.isFinite(renderedY) ? Number(renderedY.toFixed(2)) : null,
      renderedDelta: Number.isFinite(renderedY) ? Number(Math.abs(renderedY - surfaceY).toFixed(2)) : null,
      terrainY: Number.isFinite(terrainY) ? Number(terrainY.toFixed(2)) : null,
      cameraY: Number(Number(ctx.camera?.position?.y || 0).toFixed(2)),
      cameraAboveRoad: Number((Number(ctx.camera?.position?.y || 0) - surfaceY).toFixed(2)),
      waterMeshes: waterMeshes.length,
      visibleWaterMeshes: waterMeshes.filter((mesh) => mesh?.visible !== false).length,
      boatAvailable: !!ctx.boatMode?.available,
      boatPromptVisible: !!document.getElementById('boatPrompt')?.classList?.contains('show'),
      tunnelLength: Number(roadLength(tunnel).toFixed(2))
    };
  }, { stageName: stage, stationRatio: ratio });

  const checkpoints = [];
  checkpoints.push(await placeAtStage('entry', 0.08));
  const entryVisual = await captureViewport(page, path.join(outputDir, `${spec.id}-tunnel-entry.png`));
  checkpoints.push(await placeAtStage('interior_a', 0.3));
  const movementStart = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    document.activeElement?.blur?.();
    document.body?.focus?.();
    return { x: Number(ctx.car?.x || 0), z: Number(ctx.car?.z || 0) };
  });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(120);
  const movementInput = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      keyActive: !!ctx.keys?.ArrowUp,
      throttle: Number(ctx.readControlActions?.('drive')?.throttle || 0),
      paused: !!ctx.paused,
      gameStarted: !!ctx.gameStarted,
      worldLoading: !!ctx.worldLoading,
      travelMode: ctx.getCurrentTravelMode?.() || null,
      speed: Number(ctx.car?.speed || 0)
    };
  });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    for (let frame = 0; frame < 90; frame += 1) ctx.update?.(1 / 60);
  });
  await page.waitForTimeout(300);
  const movementRunning = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      keyActive: !!ctx.keys?.ArrowUp,
      throttle: Number(ctx.readControlActions?.('drive')?.throttle || 0),
      speed: Number(ctx.car?.speed || 0),
      vFwd: Number(ctx.car?.vFwd || 0)
    };
  });
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(300);
  const movementEnd = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      x: Number(ctx.car?.x || 0),
      z: Number(ctx.car?.z || 0),
      structureKind: ctx.car?.road?.structureSemantics?.structureKind || null
    };
  });
  checkpoints.push(await placeAtStage('interior_b', 0.5));
  const interiorVisual = await captureViewport(page, path.join(outputDir, `${spec.id}-tunnel-interior.png`));
  checkpoints.push(await placeAtStage('interior_c', 0.82));
  checkpoints.push(await placeAtStage('exit'));
  const exitVisual = await captureViewport(page, path.join(outputDir, `${spec.id}-tunnel-exit.png`));
  result.tunnelPortalTraversal = {
    checkpoints,
    visuals: { entry: entryVisual, interior: interiorVisual, exit: exitVisual },
    movement: {
      distance: Number(Math.hypot(movementEnd.x - movementStart.x, movementEnd.z - movementStart.z).toFixed(2)),
      remainedInTunnel: movementEnd.structureKind === 'tunnel',
      input: movementInput,
      running: movementRunning
    }
  };
}
