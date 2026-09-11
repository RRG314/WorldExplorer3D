export function createPerfPanelApi({ appCtx, constants, perfStats, state }) {
  const {
    PERF_QUALITY_TIER_PERFORMANCE,
    PERF_QUALITY_TIER_QUALITY
  } = constants;
  const {
    getDynamicBudgetState,
    getPerfMode,
    getPerfOverlayEnabled,
    getPerfSpikeMetrics
  } = state;

  function formatPerfNumber(n) {
    if (!Number.isFinite(n)) return '0';
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(Math.round(n));
  }

  function getRenderQualityLabel(liveQuality = null) {
    const level = typeof appCtx.getRenderQualityLevel === 'function'
      ? String(appCtx.getRenderQualityLevel() || '').toLowerCase()
      : String(appCtx.renderQualityLevel || '').toLowerCase();
    if (level === 'low') return 'LOW';
    if (level === 'med' || level === 'medium') return 'MED';
    if (level === 'high') return 'HIGH';
    const tier = String(liveQuality?.tier || '').toLowerCase();
    if (tier === PERF_QUALITY_TIER_PERFORMANCE) return 'LOW';
    if (tier === PERF_QUALITY_TIER_QUALITY) return 'HIGH';
    return 'MED';
  }

  function capturePerfSnapshot(extra = {}) {
    const locName = (() => {
      if (typeof appCtx.selLoc === 'undefined') return 'Unknown';
      if (appCtx.selLoc === 'custom' && typeof appCtx.customLoc !== 'undefined') return appCtx.customLoc?.name || 'Custom';
      if (typeof appCtx.LOCS !== 'undefined' && appCtx.LOCS && appCtx.LOCS[appCtx.selLoc]) return appCtx.LOCS[appCtx.selLoc].name;
      return String(appCtx.selLoc);
    })();

    return {
      generatedAt: new Date().toISOString(),
      location: locName,
      mode: getPerfMode(),
      fps: Number((perfStats.live.fps || 0).toFixed(2)),
      frameMs: Number((perfStats.live.frameMs || 0).toFixed(2)),
      dynamicBudget: getDynamicBudgetState(),
      renderer: { ...perfStats.renderer },
      live: { ...perfStats.live },
      spikes: getPerfSpikeMetrics(true),
      lastLoad: perfStats.lastLoad ? { ...perfStats.lastLoad } : null,
      ...extra
    };
  }

  async function copyPerfSnapshotToClipboard(extra = {}) {
    const snapshot = capturePerfSnapshot(extra);
    const text = JSON.stringify(snapshot, null, 2);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return snapshot;
    }
    throw new Error('Clipboard API unavailable in this browser context.');
  }

  function logBaselineSnapshot(extra = {}) {
    const snapshot = capturePerfSnapshot(extra);
    const baselineLine = `BASELINE: fps=${Number(snapshot?.fps || 0).toFixed(1)}, calls=${Number(snapshot?.renderer?.calls || 0)}, tris=${Number(snapshot?.renderer?.triangles || 0)}, textures=${Number(snapshot?.renderer?.textures || 0)}`;
    console.log(baselineLine);
    return { snapshot, baselineLine };
  }

  function updatePerfPanel(force = false) {
    const panel = document.getElementById('perfPanel');
    if (!panel) return;
    if (!getPerfOverlayEnabled() || !appCtx.gameStarted) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';
    const lastLoad = perfStats.lastLoad || {};
    const renderer = perfStats.renderer;
    const live = perfStats.live || {};
    const lod = live.lodVisible || {};
    const counts = live.worldCounts || {};
    const spikes = live.spikes || getPerfSpikeMetrics(false);
    const quality = live.quality || getDynamicBudgetState();
    const rdtNoise = live.rdtNoise || {};
    const rdtNoiseStatus = rdtNoise.enabled ? `ON ${String(rdtNoise.variant || 'standard').toUpperCase()}` : 'OFF';
    const lines = [
      `MODE: ${String(getPerfMode()).toUpperCase()}`,
      `FPS: ${(live.fpsCurrent || 0).toFixed(1)} CUR | ${(live.fps || 0).toFixed(1)} AVG | FRAME: ${(live.frameMs || 0).toFixed(1)} ms`,
      `QUALITY: ${getRenderQualityLabel(quality)} (${quality.auto ? 'AUTO' : 'LOCK'} ${String(quality.tier || 'balanced').toUpperCase()})`,
      `DRAW: ${formatPerfNumber(renderer.calls)} | TRI: ${formatPerfNumber(renderer.triangles)}`,
      `GEO: ${formatPerfNumber(renderer.geometries)} | TEX: ${formatPerfNumber(renderer.textures)} | PROG: ${formatPerfNumber(renderer.programs)}`,
      `LOAD: ${Number.isFinite(lastLoad.loadMs) ? `${lastLoad.loadMs} ms` : '--'}`,
      `FEATURES: R${counts.roads || 0} B${counts.buildings || 0} P${counts.poiMeshes || 0} L${counts.landuseMeshes || 0}`,
      `RDT-NOISE: ${rdtNoiseStatus} | EDGE ${(Number(rdtNoise.edgeAvgAbsOffset) || 0).toFixed(2)}m/${(Number(rdtNoise.terrainEdgeAvgAbsOffset) || 0).toFixed(2)}m`,
      `ROAD MASK: ${(Number(rdtNoise.landuseMaskedPct) || 0).toFixed(1)}% (${Number(rdtNoise.landuseVertices) || 0}) | SAMPLES ${(Number(rdtNoise.edgeSamples) || 0) + (Number(rdtNoise.terrainEdgeSamples) || 0)}`,
      `LOD: NEAR ${lod.near || 0} | MID ${lod.mid || 0}`,
      `SPIKES: >33 ${spikes.over33_3 || 0} | >50 ${spikes.over50 || 0} | MAX ${(spikes.maxFrameMs || 0).toFixed(1)} ms`,
      `TERRAIN RING: ${Number.isFinite(live.terrainRing) ? live.terrainRing : '--'} | SPEED ${Math.round(live.speedMph || 0)} mph`
    ];
    const nextText = lines.join('\n');
    if (force || panel.textContent !== nextText) panel.textContent = nextText;
    if (typeof appCtx.positionTopOverlays === 'function') appCtx.positionTopOverlays();
  }

  return {
    capturePerfSnapshot,
    copyPerfSnapshotToClipboard,
    logBaselineSnapshot,
    updatePerfPanel
  };
}
