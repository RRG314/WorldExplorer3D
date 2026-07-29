import assert from 'node:assert/strict';
import { activateAcceptedGroundForWorldLoad } from
  '../app/js/world/accepted-ground-activation.js';
import { diagnoseDistrictGroundSource } from
  '../app/js/world/compiler/selected-location-source-adapter.js';

function harness(groundState) {
  const messages = [];
  const finalizations = [];
  const phases = [];
  let terrainUpdates = 0;
  const runtimeState = {};
  const loadMetrics = {};
  const appCtx = {
    terrainEnabled: true,
    onMoon: false,
    LOC: { lat: 39.2904, lon: -76.6122 },
    worldLoading: true,
    initialEarthWorldReady: true,
    prepareAcceptedGroundFromCatalog: async () => groundState,
    showLoad: (message, options) => messages.push({ message, options }),
    updateTerrainAround: () => { terrainUpdates += 1; }
  };
  return {
    appCtx,
    finalizations,
    loadMetrics,
    messages,
    phases,
    runtimeState,
    terrainUpdates: () => terrainUpdates,
    run: () => activateAcceptedGroundForWorldLoad({
      appCtx,
      loadMetrics,
      runtimeState,
      startLoadPhase: (name) => phases.push(`start:${name}`),
      endLoadPhase: (name) => phases.push(`end:${name}`),
      finalizePerfLoad: (...args) => finalizations.push(args)
    })
  };
}

const blocked = harness({
  status: 'blocked',
  reason: 'no-ground-artifacts-configured'
});
assert.equal(await blocked.run(), false);
assert.equal(blocked.appCtx.worldLoading, false);
assert.equal(blocked.appCtx.initialEarthWorldReady, false);
assert.equal(blocked.runtimeState.status, 'blocked');
assert.equal(blocked.terrainUpdates(), 0);
assert.equal(blocked.finalizations.length, 1);
assert.match(
  blocked.messages.at(-1).message,
  /accepted ground data is unavailable/
);
assert.deepEqual(blocked.phases, [
  'start:prepareAcceptedGround',
  'end:prepareAcceptedGround'
]);

const acceptedState = {
  status: 'accepted',
  artifactId: 'fixture-ground',
  providerId: 'usgs-3dep-best-available',
  sourceRelease: 'fixture-2026',
  verticalDatum: 'EGM2008'
};
const accepted = harness(acceptedState);
assert.equal(await accepted.run(), true);
assert.equal(accepted.terrainUpdates(), 1);
assert.equal(accepted.finalizations.length, 0);
assert.equal(accepted.runtimeState.acceptedGround, acceptedState);

const diagnosis = diagnoseDistrictGroundSource({
  status: 'available',
  groundElevationMeters: 12.4,
  artifactId: acceptedState.artifactId,
  providerId: acceptedState.providerId,
  sourceRelease: acceptedState.sourceRelease,
  verticalDatum: acceptedState.verticalDatum
});
assert.equal(diagnosis.status, 'accepted');
assert.equal(diagnosis.reason, null);
assert.equal(diagnosis.artifactId, acceptedState.artifactId);

console.log(JSON.stringify({
  ok: true,
  contract: 'accepted-ground-activation',
  blocksBeforeTerrainPublication: true,
  acceptedArtifactStartsTerrain: true,
  diagnosticsUseAcceptedArtifact: true
}, null, 2));
