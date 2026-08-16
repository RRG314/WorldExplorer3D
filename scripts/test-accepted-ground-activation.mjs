import assert from 'node:assert/strict';
import { activateAcceptedGroundForWorldLoad } from
  '../app/js/world/accepted-ground-activation.js';
import { diagnoseDistrictGroundSource } from
  '../app/js/world/compiler/selected-location-source-adapter.js';
import { setCustomLocation } from '../app/js/location-session.js';
import { ctx as sharedCtx } from '../app/js/shared-context.js?v=55';

function harness(groundState) {
  const messages = [];
  const finalizations = [];
  const phases = [];
  let terrainUpdates = 0;
  let groundSuppressions = 0;
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
    publishLocationTerrain: () => { terrainUpdates += 1; },
    suppressGroundFallbackPlaceholder: () => { groundSuppressions += 1; }
  };
  return {
    appCtx,
    finalizations,
    loadMetrics,
    messages,
    phases,
    runtimeState,
    groundSuppressions: () => groundSuppressions,
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

const worldwideFallback = harness({
  status: 'blocked',
  reason: 'no-ground-artifacts-configured'
});
assert.equal(await worldwideFallback.run(), true);
assert.equal(worldwideFallback.appCtx.worldLoading, true);
assert.equal(worldwideFallback.appCtx.initialEarthWorldReady, true);
assert.equal(worldwideFallback.runtimeState.groundMode, 'worldwide-terrain-fallback');
assert.equal(worldwideFallback.runtimeState.acceptedGround.status, 'fallback');
assert.equal(worldwideFallback.runtimeState.acceptedGround.providerId, 'mapzen-terrarium');
assert.equal(worldwideFallback.terrainUpdates(), 1);
assert.equal(worldwideFallback.finalizations.length, 0);
assert.match(worldwideFallback.messages.at(-1).message, /worldwide terrain and OpenStreetMap/);
assert.deepEqual(worldwideFallback.phases, [
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

const openOcean = harness({
  status: 'blocked',
  reason: 'no-accepted-ground-artifact-for-location'
});
openOcean.appCtx.selLoc = 'custom';
openOcean.appCtx.LOC = {
  lat: 30,
  lon: -40,
  name: 'Atlantic Ocean'
};
openOcean.appCtx.customLoc = {
  lat: 30,
  lon: -40,
  name: 'Atlantic Ocean',
  arrivalMode: 'boat',
  surfaceEvidence: {
    kind: 'open_ocean',
    verified: true,
    source: 'gebco-elevation-sample',
    elevationMeters: -4200
  }
};
assert.equal(await openOcean.run(), true);
assert.equal(openOcean.terrainUpdates(), 0);
assert.equal(openOcean.finalizations.length, 0);
assert.equal(openOcean.runtimeState.groundMode, 'open-ocean-surface-only');
assert.equal(openOcean.runtimeState.acceptedGround.status, 'not-applicable');
assert.equal(openOcean.runtimeState.acceptedGround.waterKind, 'open_ocean');
assert.equal(openOcean.groundSuppressions(), 1);

assert.equal(setCustomLocation({
  lat: 30,
  lon: -40,
  name: 'Manual Coordinates',
  arrivalMode: 'boat'
}, { syncInputs: false }), true);
assert.equal(sharedCtx.customLoc.arrivalMode, 'boat');

const explicitBoat = harness({
  status: 'blocked',
  reason: 'no-accepted-ground-artifact-for-location'
});
explicitBoat.appCtx.selLoc = 'custom';
explicitBoat.appCtx.LOC = {
  lat: 30,
  lon: -40,
  name: 'Manual Coordinates'
};
explicitBoat.appCtx.customLoc = {
  lat: 30,
  lon: -40,
  name: 'Manual Coordinates',
  arrivalMode: 'boat'
};
assert.equal(await explicitBoat.run(), true);
assert.equal(explicitBoat.runtimeState.groundMode, 'worldwide-terrain-fallback');
assert.equal(explicitBoat.runtimeState.surfaceDomain.kind, 'land');
assert.equal(explicitBoat.terrainUpdates(), 1);
assert.equal(explicitBoat.groundSuppressions(), 0);

console.log(JSON.stringify({
  ok: true,
  contract: 'accepted-ground-activation',
  worldwideLandFallbackStarts: true,
  acceptedArtifactStartsTerrain: true,
  openOceanDoesNotFabricateGround: true,
  unverifiedBoatArrivalCannotOverrideLand: true,
  diagnosticsUseAcceptedArtifact: true
}, null, 2));
