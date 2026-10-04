// Self-contained browser evaluator, also exercised with deterministic frame clocks.
export async function sampleFrameWindow(durationMs) {
  const options = typeof durationMs === 'object' ? durationMs : null;
  const targetDistance = Number(options?.targetDistance || 0);
  const routeActor = options?.actorKey ? globalThis[options.actorKey] : null;
  if (targetDistance > 0 && (!routeActor || !Number.isFinite(routeActor.x) || !Number.isFinite(routeActor.z))) {
    throw new Error('A distance sample needs a live actor position reference.');
  }
  durationMs = options ? options.durationMs : durationMs;
  return new Promise((resolve) => {
    const deltas = [];
    const background = [];
    const backgroundContext = options?.backgroundContextKey ? globalThis[options.backgroundContextKey] : null;
    let backgroundAt = -Infinity;
    const lightSample = options?.collectDiagnostics === false;
    if (lightSample && !routeActor) throw new Error('A lightweight sample needs a live actor reference.');
    const startActor = lightSample ? {position:routeActor} : globalThis.getWorldExplorerRuntimeDiagnostics?.()?.activeActor;
    const startPosition = startActor?.position ? {x:startActor.position.x,z:startActor.position.z} : null;
    const requestedAt = performance.now();
    let startedAt = null;
    let previous = null;
    let priorX = routeActor?.x, priorZ = routeActor?.z, distanceTraveled = 0, movingMs = 0;
    const frame = (now) => {
      // RAF timestamps can predate this request. Never move the clock backward,
      // and measure a complete window between eligible frame timestamps.
      if (!Number.isFinite(now) || now < requestedAt || (previous !== null && now <= previous)) {
        requestAnimationFrame(frame);
        return;
      }
      if (startedAt === null) startedAt = now;
      else {
        const delta = now-previous; deltas.push(delta);
        if (routeActor) {
          const distance=Math.hypot(routeActor.x-priorX,routeActor.z-priorZ);
          distanceTraveled+=distance;if(distance>.005)movingMs+=delta;
        }
      }
      if(routeActor){priorX=routeActor.x;priorZ=routeActor.z;}
      previous = now;
      // Scalar counters only, at most once per second. Do not traverse the
      // scene or build the public diagnostics snapshot inside a timed window.
      if (backgroundContext && now - backgroundAt >= 1000) {
        backgroundAt = now;
        const overview = backgroundContext.streetOverview?.stats;
        const transport = backgroundContext.transportDetail?.stats;
        background.push({elapsedMs:now-startedAt,
          overview:overview ? {status:overview.status,completedCells:overview.completedCells,totalCells:overview.totalCells,workerActive:overview.workerActive} : null,
          transport:transport ? {status:transport.status,completedRegions:transport.completedRegions,pendingRegions:transport.pendingRegions,blocked:transport.blocked} : null});
      }
      // Read only two coordinates per frame, not the full world diagnostics.
      const routeComplete = targetDistance > 0 && startPosition &&
        Math.hypot(routeActor.x-startPosition.x,routeActor.z-startPosition.z) >= targetDistance;
      if (now - startedAt < durationMs && !routeComplete) requestAnimationFrame(frame);
      else {
        const diagnostics = lightSample ? {activeActor:{position:routeActor}} : globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
        resolve({
          deltas,
          background,
          requestedAt, startedAt, endedAt: now, timeOrigin: performance.timeOrigin ?? null,
          distanceTraveled, movingMs,
          firstFrameDelayMs: startedAt-requestedAt,
          elapsedMs: now-startedAt,
          routeComplete: Boolean(routeComplete),
          startPosition,
          endPosition: diagnostics.activeActor?.position ? {x:diagnostics.activeActor.position.x,z:diagnostics.activeActor.position.z} : null,
          diagnostics: {
            renderer: diagnostics.renderer || {},
            worldCounts: diagnostics.worldCounts || null,
            // Production artifacts bundle the module graph, so source-only module
            // URLs are intentionally absent. Keep the release measurement on the
            // public diagnostics contract instead of importing private source.
            drawCallBreakdown: diagnostics.performance?.drawCallBreakdown || []
          }
        });
      }
    };
    requestAnimationFrame(frame);
  });
}
