import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { completeWorldReady, discoveryWorldReady } from '../scripts/verification/complete-world-readiness.mjs';

function fixture() {
  let snapshots = 0;
  const diagnostics = {
    gameStarted: true, worldLoading: false,
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
    ready: (predicate = completeWorldReady) => vm.runInContext(`(${predicate.toString()})()`, context) };
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

test('save readiness never invokes the full diagnostic while the loading cover or startup is active', () => {
  const f = fixture();
  f.context.__WE3D_RUNTIME_READY__ = false;
  assert.equal(f.ready(discoveryWorldReady), false);
  f.context.__WE3D_RUNTIME_READY__ = true;
  f.state.worldLoading = true;
  for (let i = 0; i < 20; i++) assert.equal(f.ready(discoveryWorldReady), false);
  f.state.worldLoading = false;
  f.context.document.querySelector = () => ({});
  assert.equal(f.ready(discoveryWorldReady), false);
  assert.equal(f.snapshots(), 0);
});

test('save readiness retains the released-build gameplay and discovery requirements', () => {
  const f = fixture();
  assert.equal(f.ready(discoveryWorldReady), true);
  for (const [object, key, value] of [
    [f.state, 'gameStarted', false], [f.state, 'worldLoading', true],
    [f.diagnostics, 'gameStarted', false], [f.diagnostics, 'worldLoading', true],
    [f.diagnostics.worldDiscovery, 'active', false]
  ]) {
    const original = object[key]; object[key] = value;
    assert.equal(f.ready(discoveryWorldReady), false, key);
    object[key] = original;
  }
  assert.equal(f.ready(discoveryWorldReady), true);
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
