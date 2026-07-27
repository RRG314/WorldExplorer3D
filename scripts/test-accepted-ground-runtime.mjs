import assert from 'node:assert/strict';
import {
  createAcceptedGroundRuntime
} from '../app/js/terrain/accepted-ground-runtime.js';
import {
  compileGroundArtifact
} from '../app/js/terrain/ground-artifact.js';
import {
  geographicToWebMercatorMeters
} from '../app/js/terrain/source-contract.js';

const center = Object.freeze({
  latitude: 39.290882,
  longitude: -76.610759
});
const spacingMeters = 10;
const projected = geographicToWebMercatorMeters(
  center.latitude,
  center.longitude
);

function artifactBundle(id, columnOffset = 0) {
  const minColumn =
    Math.floor(projected.eastingMeters / spacingMeters) + columnOffset;
  const minRow =
    Math.floor(projected.northingMeters / spacingMeters) + columnOffset;
  const grid = {
    crs: 'EPSG:3857',
    spacingMeters,
    minColumn,
    maxColumn: minColumn + 1,
    minRow,
    maxRow: minRow + 1
  };
  const samples = [];
  for (let row = grid.minRow; row <= grid.maxRow; row += 1) {
    for (let column = grid.minColumn; column <= grid.maxColumn; column += 1) {
      samples.push({
        column,
        row,
        available: true,
        rawElevationMeters: 10 + samples.length,
        groundElevationMeters: 9.6 + samples.length,
        confidence: 0.99,
        correctionReason: 'vertical-datum-normalization',
        provenance: `fixture:${id}`
      });
    }
  }
  const artifact = {
    schemaVersion: 1,
    artifactId: id,
    districtId: id,
    providerId: 'usgs-3dep-best-available',
    sourceRelease: 'fixture-2026',
    verticalDatum: 'EGM2008',
    coverage: {
      south: 39.28,
      north: 39.31,
      west: -76.63,
      east: -76.59
    },
    minimumConfidence: 0.75,
    grid,
    samples
  };
  const manifest = {
    schemaVersion: 1,
    artifactId: id,
    providerId: artifact.providerId,
    sourceRelease: artifact.sourceRelease,
    contentSha256: 'a'.repeat(64),
    spacingMeters,
    coverage: artifact.coverage,
    verticalDatum: artifact.verticalDatum,
    complete: true,
    missingSampleCount: 0,
    url: `fixture://${id}`
  };
  const compiled = compileGroundArtifact({ manifest, artifact });
  assert.equal(compiled.status, 'accepted');
  return Object.freeze({ manifest: Object.freeze(manifest), compiled });
}

const valid = artifactBundle('runtime-ground-valid');
const runtime = createAcceptedGroundRuntime({
  loadArtifact: async ({ manifest }) => {
    assert.equal(manifest.artifactId, valid.manifest.artifactId);
    return valid.compiled;
  },
  worldToLatLon: (x, z) => ({
    lat: center.latitude + z / 111000,
    lon: center.longitude + x / 87000
  })
});

assert.deepEqual(runtime.snapshot(), {
  generation: 0,
  status: 'blocked',
  reason: 'no-ground-artifacts-configured',
  location: null,
  artifactId: null,
  providerId: null,
  sourceRelease: null,
  verticalDatum: null,
  contentSha256: null
});
const accepted = await runtime.prepare({
  ...center,
  manifests: [valid.manifest],
  coverageProbes: [
    center,
    { latitude: center.latitude + 0.00001, longitude: center.longitude }
  ]
});
assert.equal(accepted.status, 'accepted');
assert.equal(accepted.verticalDatum, 'EGM2008');
assert.equal(runtime.sampleAtLatLon(
  center.latitude,
  center.longitude
).status, 'available');
assert.equal(runtime.sampleAtWorldXZ(0, 0).status, 'available');
assert.equal(runtime.verifyCoverage([center]).status, 'accepted');
assert.equal(Object.isFrozen(runtime.snapshot()), true);

const falseCoverage = artifactBundle('runtime-ground-false-coverage', 5000);
const falseCoverageRuntime = createAcceptedGroundRuntime({
  loadArtifact: async () => falseCoverage.compiled
});
const falseCoverageResult = await falseCoverageRuntime.prepare({
  ...center,
  manifests: [falseCoverage.manifest]
});
assert.equal(falseCoverageResult.status, 'rejected');
assert.equal(falseCoverageResult.reason, 'incomplete-runtime-coverage');
assert.equal(
  falseCoverageRuntime.sampleAtLatLon(
    center.latitude,
    center.longitude
  ).status,
  'unavailable'
);

const noCatalog = createAcceptedGroundRuntime();
assert.equal((await noCatalog.prepare({
  ...center,
  manifests: []
})).reason, 'no-ground-artifacts-configured');
const missingUrl = await noCatalog.prepare({
  ...center,
  manifests: [{ ...valid.manifest, url: '' }]
});
assert.equal(missingUrl.status, 'rejected');
assert.equal(missingUrl.reason, 'artifact-url-missing');

const throwingRuntime = createAcceptedGroundRuntime({
  loadArtifact: async () => {
    throw new Error('synthetic loader failure');
  }
});
const throwingState = await throwingRuntime.prepare({
  ...center,
  manifests: [valid.manifest]
});
assert.equal(throwingState.status, 'rejected');
assert.equal(throwingState.reason, 'artifact-load-threw');
assert.equal(throwingRuntime.snapshot().status, 'rejected');

let resolveFirst;
const staleRuntime = createAcceptedGroundRuntime({
  loadArtifact: ({ manifest }) => {
    if (manifest.artifactId === 'runtime-ground-stale') {
      return new Promise((resolve) => { resolveFirst = resolve; });
    }
    return Promise.resolve(valid.compiled);
  }
});
const stale = artifactBundle('runtime-ground-stale');
const firstPrepare = staleRuntime.prepare({
  ...center,
  manifests: [stale.manifest]
});
const secondPrepare = staleRuntime.prepare({
  ...center,
  manifests: [valid.manifest]
});
assert.equal((await secondPrepare).artifactId, valid.manifest.artifactId);
resolveFirst(stale.compiled);
const staleResult = await firstPrepare;
assert.equal(staleResult.status, 'superseded');
assert.equal(
  staleRuntime.snapshot().artifactId,
  valid.manifest.artifactId
);

console.log(JSON.stringify({
  ok: true,
  contract: 'accepted-ground-runtime',
  acceptedArtifact: accepted.artifactId,
  targetDatum: accepted.verticalDatum,
  rejectsFalseClaimedCoverage: true,
  rejectsMissingArtifactUrl: true,
  rejectsThrownArtifactLoad: true,
  stalePublicationBlocked: true,
  worldSamplingConfigured: true
}, null, 2));
