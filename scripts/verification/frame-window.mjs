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
    const startActor = globalThis.getWorldExplorerRuntimeDiagnostics?.()?.activeActor;
    const startPosition = startActor?.position ? {x:startActor.position.x,z:startActor.position.z} : null;
    const requestedAt = performance.now();
    let startedAt = null;
    let previous = null;
    const frame = (now) => {
      // RAF timestamps can predate this request. Never move the clock backward,
      // and measure a complete window between eligible frame timestamps.
      if (!Number.isFinite(now) || now < requestedAt || (previous !== null && now <= previous)) {
        requestAnimationFrame(frame);
        return;
      }
      if (startedAt === null) startedAt = now;
      else deltas.push(now - previous);
      previous = now;
      // Read only two coordinates per frame, not the full world diagnostics.
      const routeComplete = targetDistance > 0 && startPosition &&
        Math.hypot(routeActor.x-startPosition.x,routeActor.z-startPosition.z) >= targetDistance;
      if (now - startedAt < durationMs && !routeComplete) requestAnimationFrame(frame);
      else {
        const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
        resolve({
          deltas,
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
