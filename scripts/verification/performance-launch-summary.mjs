// This function also executes through page.evaluate: keep it self-contained.
// Never serialize the load session, facility graph or source feature arrays
// before timing. The runtime owns those objects; the report needs only results.
export function performanceLaunchSummary(state = globalThis.__WE3D_PERF_CONTEXT__) {
  const load = state.worldLoadRuntimeState;
  const publication = state.transportSurfacePublication;
  return {
    worldLoad: load ? {
      sequence: load.sequence,
      status: load.status,
      geometryReady: load.geometryReady,
      gameplayRuntimesReady: load.gameplayRuntimesReady,
      transportProviderDecision: load.transportProviderDecision,
      gameplayStartupDurationsMs: load.gameplayStartupDurationsMs,
      firstRender: load.firstRender,
      museumProgramPreparation: state.museumProgramPreparation
    } : null,
    performance: state.perfStats ? {
      mode: state.perfStats.mode,
      lastLoad: state.perfStats.lastLoad,
      live: state.perfStats.live
    } : null,
    transportCompilation: publication ? {
      roadCount: publication.roadCount,
      meshCount: publication.meshCount,
      phaseDurationsMs: publication.phaseDurationsMs
    } : null
  };
}
