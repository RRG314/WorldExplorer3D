import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { completeWorldReady } from '../scripts/verification/complete-world-readiness.mjs';

function fixture() {
  let snapshots = 0;
  const diagnostics = {
    surfaceChain: { surfaces: { terrain: { kind: 'terrain', y: 1 } } },
    worldCounts: { roads: 3, buildingMeshes: 2 },
    transportStructures: { publishedBodies: 1 },
    visualOwners: { water: { surfaceCount: 1 } },
    livingWorld: { active: true }, urbanSandbox: { active: true }, worldDiscovery: { active: true }
  };
  const state = { gameStarted: true, worldLoading: false };
  const context = vm.createContext({
    __WE3D_RUNTIME_READY__: true,
    document: { querySelector: () => null },
    render_game_to_text: () => JSON.stringify(state),
    getWorldExplorerRuntimeDiagnostics: () => { snapshots++; return diagnostics; }
  });
  return { diagnostics, state, context, snapshots: () => snapshots,
    ready: () => vm.runInContext(`(${completeWorldReady.toString()})()`, context) };
}

test('readiness polling does not scan city diagnostics during startup or under a visible loading cover', () => {
  const f = fixture();
  f.context.__WE3D_RUNTIME_READY__ = false;
  assert.equal(f.ready(), false);
  f.context.__WE3D_RUNTIME_READY__ = true;
  f.state.worldLoading = true;
  for (let i = 0; i < 20; i++) assert.equal(f.ready(), false);
  f.state.worldLoading = false;
  f.context.document.querySelector = () => ({});
  assert.equal(f.ready(), false);
  assert.equal(f.snapshots(), 0);
});

test('finished loading must still satisfy every original world subsystem requirement', () => {
  const f = fixture();
  assert.equal(f.ready(), true);
  for (const [object, key, invalid] of [
    [f.diagnostics.worldCounts, 'roads', 0],
    [f.diagnostics.worldCounts, 'buildingMeshes', 0],
    [f.diagnostics.transportStructures, 'publishedBodies', 0],
    [f.diagnostics.visualOwners.water, 'surfaceCount', 0],
    [f.diagnostics.livingWorld, 'active', false],
    [f.diagnostics.urbanSandbox, 'active', false],
    [f.diagnostics.worldDiscovery, 'active', false],
    [f.diagnostics.surfaceChain.surfaces.terrain, 'y', NaN],
    [f.diagnostics.surfaceChain.surfaces.terrain, 'kind', 'fallback']
  ]) {
    const original = object[key]; object[key] = invalid;
    assert.equal(f.ready(), false, key);
    object[key] = original;
  }
  assert.equal(f.ready(), true);
});
