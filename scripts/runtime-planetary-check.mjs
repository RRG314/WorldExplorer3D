async function waitForPlanetaryState(page, expectedEnv, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return {
        env: ctx.getEnv?.(),
        paused: ctx.paused,
        traveling: ctx.travelingToMoon
      };
    });
    if (state.env === expectedEnv && state.paused === false && state.traveling === false) {
      return state;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for ${expectedEnv}: ${JSON.stringify(state)}`);
}

export async function exercisePlanetaryRoundTrip(page) {
  const before = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.renderer.domElement.dataset.planetaryRoundTrip = 'same-renderer';
    return {
      sequence: Number(ctx._worldLoadSequence || 0),
      roads: ctx.roads?.length || 0,
      buildings: ctx.buildings?.length || 0
    };
  });

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { captureEarthWorldSession } = await import('/app/js/earth-session.js?v=2');
    captureEarthWorldSession();
    ctx.earthPosition = {
      x: Number(ctx.car?.x) || 0,
      z: Number(ctx.car?.z) || 0,
      angle: Number(ctx.car?.angle) || 0
    };
    ctx.arriveAtMoon();
  });
  await waitForPlanetaryState(page, 'MOON');
  await page.waitForTimeout(1500);

  const moon = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const earthBefore = ctx.lunarEarthSphere?.position?.toArray?.() || [];
    ctx.camera.position.x += 120;
    ctx.camera.position.z -= 80;
    ctx.updateLunarEarthPosition?.();
    const earthAfter = ctx.lunarEarthSphere?.position?.toArray?.() || [];
    const lists = [
      'roadMeshes', 'urbanSurfaceMeshes', 'structureVisualMeshes', 'buildingMeshes',
      'landuseMeshes', 'linearFeatureMeshes', 'poiMeshes', 'historicMarkers', 'streetFurnitureMeshes',
      'vegetationMeshes'
    ];
    return {
      env: ctx.getEnv?.(),
      earthFixed: earthBefore.length === 3 && earthBefore.every((value, index) =>
        Math.abs(value - earthAfter[index]) < 1e-9
      ),
      earthLeakCount: lists.reduce((total, name) =>
        total + (ctx[name] || []).filter((object) => object?.visible && object?.parent).length, 0
      ),
      astronautGear: !!ctx.Walk?.state?.characterMesh?.getObjectByName?.('Planetary Astronaut Gear'),
      minimapVisible: getComputedStyle(document.getElementById('minimap')).display !== 'none',
      skyObserverBody: ctx.starField?.userData?.observerBody
    };
  });

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.returnToEarth();
  });
  await waitForPlanetaryState(page, 'EARTH');
  await page.waitForTimeout(800);

  const earth = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      env: ctx.getEnv?.(),
      sequence: Number(ctx._worldLoadSequence || 0),
      roads: ctx.roads?.length || 0,
      buildings: ctx.buildings?.length || 0,
      earthVisible: ctx.earthSceneVisible === true,
      rendererPreserved: ctx.renderer?.domElement?.dataset?.planetaryRoundTrip === 'same-renderer'
    };
  });
  return { before, moon, earth };
}
