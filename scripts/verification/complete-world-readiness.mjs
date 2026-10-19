// Playwright serializes this function. Keep each journey's original
// condition and argument intact, but never run its full-city diagnostic while
// the loading cover is visible. This guard is evaluated on every poll, including
// a later location transition; a separate one-time wait is insufficient.
export function afterWorldLoad(predicate) {
  if (typeof predicate !== 'function') throw new TypeError('Expected a readiness predicate');
  // A string containing an arrow function is just a truthy expression to
  // waitForFunction. Return a real callable; only trusted test source is used.
  return new Function('argument', `
    if (globalThis.__WE3D_RUNTIME_READY__ !== true || document.querySelector('#loading.show')) return false;
    return (${predicate.toString()})(argument);
  `);
}

// Serialized by Playwright into the page. Avoid whole-city diagnostic scans
// while startup is still running; retain the complete acceptance predicate.
export function completeWorldReady() {
  if (globalThis.__WE3D_RUNTIME_READY__ !== true || document.querySelector('#loading.show')) return false;
  const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
  if (state.gameStarted !== true || state.worldLoading !== false) return false;
  const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
  return diagnostics.surfaceChain?.surfaces?.terrain?.kind === 'terrain' &&
    Number.isFinite(Number(diagnostics.surfaceChain?.surfaces?.terrain?.y)) &&
    Number(diagnostics.worldCounts?.roads || 0) > 0 &&
    Number(diagnostics.worldCounts?.buildingMeshes || 0) > 0 &&
    Number(diagnostics.transportStructures?.publishedBodies || 0) > 0 &&
    Number(diagnostics.visualOwners?.water?.surfaceCount || 0) > 0 &&
    diagnostics.livingWorld?.active === true &&
    diagnostics.urbanSandbox?.active === true &&
    diagnostics.worldDiscovery?.active === true;
}

// Save compatibility needs the discovery owner, including on released builds
// that predate the complete-world predicate. Do not scan venue candidates and
// every subsystem on each loading frame just to inspect these three flags.
// Keep this evaluator self-contained because Playwright serializes it.
export function discoveryWorldReady() {
  if (globalThis.__WE3D_RUNTIME_READY__ !== true || document.querySelector('#loading.show')) return false;
  const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
  if (state.gameStarted !== true || state.worldLoading !== false) return false;
  const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
  return diagnostics?.gameStarted === true && diagnostics.worldLoading === false &&
    diagnostics.worldDiscovery?.active === true;
}
