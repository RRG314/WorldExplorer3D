export function createPerfRendererInfoApi({ appCtx, perfStats }) {
  function recordPerfRendererInfo(rendererRef) {
    if (!rendererRef || !rendererRef.info) return;
    const info = rendererRef.info;
    const render = info.render || {};
    const memory = info.memory || {};
    const programs = Array.isArray(info.programs) ? info.programs.length : info.programs || 0;

    perfStats.renderer.calls = render.calls || 0;
    perfStats.renderer.triangles = render.triangles || 0;
    perfStats.renderer.points = render.points || 0;
    perfStats.renderer.lines = render.lines || 0;
    perfStats.renderer.geometries = memory.geometries || 0;
    perfStats.renderer.textures = memory.textures || 0;
    perfStats.renderer.programs = programs || 0;
    perfStats.live.worldCounts = {
      roads: typeof appCtx.roads !== 'undefined' && Array.isArray(appCtx.roads) ? appCtx.roads.length : 0,
      buildings: typeof appCtx.buildingMeshes !== 'undefined' && Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes.length : 0,
      poiMeshes: typeof appCtx.poiMeshes !== 'undefined' && Array.isArray(appCtx.poiMeshes) ? appCtx.poiMeshes.length : 0,
      landuseMeshes: typeof appCtx.landuseMeshes !== 'undefined' && Array.isArray(appCtx.landuseMeshes) ? appCtx.landuseMeshes.length : 0
    };
    const rdtNoiseConfig = typeof appCtx.getRdtNoiseConfig === 'function'
      ? appCtx.getRdtNoiseConfig()
      : {
          enabled: !!appCtx.rdtNoiseEnabled,
          variant: appCtx.rdtNoiseVariant || 'standard',
          chaos: Number.isFinite(Number(appCtx.rdtNoiseChaos)) ? Number(appCtx.rdtNoiseChaos) : 0
        };
    perfStats.live.rdtNoise = {
      ...(perfStats.live.rdtNoise || {}),
      enabled: !!rdtNoiseConfig?.enabled,
      variant: String(rdtNoiseConfig?.variant || 'standard'),
      chaos: Number.isFinite(Number(rdtNoiseConfig?.chaos)) ? Number(rdtNoiseConfig.chaos) : 0
    };
    perfStats.updatedAt = Date.now();
  }

  return { recordPerfRendererInfo };
}
