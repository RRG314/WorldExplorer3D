import assert from 'node:assert/strict';
import {
  compileGroundArtifact,
  loadGroundArtifact,
  sha256Text
} from '../app/js/terrain/ground-artifact.js';

const artifact = {
  schemaVersion: 1,
  artifactId: 'fixture-ground-baltimore',
  districtId: 'fixture-baltimore',
  providerId: 'usgs-3dep-10m',
  sourceRelease: 'fixture-2026',
  verticalDatum: 'EGM2008',
  coverage: { south: 39.2, north: 39.4, west: -76.8, east: -76.4 },
  minimumConfidence: 0.75,
  grid: {
    crs: 'EPSG:3857',
    spacingMeters: 10,
    minColumn: -852000,
    maxColumn: -851999,
    minRow: 476000,
    maxRow: 476001
  },
  samples: [
    [-852000, 476000, 10],
    [-851999, 476000, 11],
    [-852000, 476001, 12],
    [-851999, 476001, 13]
  ].map(([column, row, elevation]) => ({
    column,
    row,
    available: true,
    rawElevationMeters: elevation,
    groundElevationMeters: elevation,
    confidence: 0.99,
    correctionReason: 'none',
    provenance: 'fixture-usgs-normalized-egm2008'
  }))
};
const artifactText = JSON.stringify(artifact);
const contentSha256 = await sha256Text(artifactText);
const manifest = {
  schemaVersion: 1,
  artifactId: artifact.artifactId,
  providerId: artifact.providerId,
  sourceRelease: artifact.sourceRelease,
  contentSha256,
  spacingMeters: artifact.grid.spacingMeters,
  coverage: artifact.coverage,
  verticalDatum: artifact.verticalDatum,
  complete: true,
  missingSampleCount: 0
};

const compiled = compileGroundArtifact({ manifest, artifact });
assert.equal(compiled.status, 'accepted');
assert.equal(compiled.model.status, 'accepted');
assert.equal(compiled.model.grid.sampleCount, 4);
assert.equal(compiled.provenance.sourceKind, 'bare-earth-dem');

const loaded = await loadGroundArtifact({
  manifest,
  url: 'fixture://ground',
  fetchImpl: async () => new Response(artifactText, { status: 200 })
});
assert.equal(loaded.status, 'accepted');
assert.equal(loaded.contentSha256, contentSha256);

const tampered = await loadGroundArtifact({
  manifest,
  url: 'fixture://tampered',
  fetchImpl: async () => new Response(
    artifactText.replace('"groundElevationMeters":10', '"groundElevationMeters":100'),
    { status: 200 }
  )
});
assert.equal(tampered.status, 'rejected');
assert.equal(tampered.reason, 'artifact-integrity-failed');

const mismatchedProvider = compileGroundArtifact({
  manifest,
  artifact: { ...artifact, providerId: 'fabdem-v1.2' }
});
assert.equal(mismatchedProvider.status, 'rejected');
assert.equal(mismatchedProvider.reason, 'artifact-manifest-mismatch');

const incomplete = compileGroundArtifact({
  manifest,
  artifact: { ...artifact, samples: artifact.samples.slice(0, 3) }
});
assert.equal(incomplete.status, 'rejected');
assert.equal(incomplete.reason, 'ground-model-rejected');
assert.equal(incomplete.diagnostics.modelReason, 'incomplete-coverage');

const invalidJsonText = '{';
const invalidJsonManifest = {
  ...manifest,
  contentSha256: await sha256Text(invalidJsonText)
};
const invalidJson = await loadGroundArtifact({
  manifest: invalidJsonManifest,
  url: 'fixture://invalid-json',
  fetchImpl: async () => new Response(invalidJsonText, { status: 200 })
});
assert.equal(invalidJson.status, 'rejected');
assert.equal(invalidJson.reason, 'artifact-json-invalid');

const unavailable = await loadGroundArtifact({
  manifest,
  url: 'fixture://missing',
  fetchImpl: async () => new Response('', { status: 404 })
});
assert.equal(unavailable.status, 'rejected');
assert.equal(unavailable.reason, 'artifact-fetch-failed');

console.log(JSON.stringify({
  ok: true,
  contract: 'ground-artifact',
  acceptedSampleCount: compiled.model.grid.sampleCount,
  verifiesSha256BeforeParse: true,
  bindsArtifactToManifest: true,
  rejectsIncompleteCoverage: true,
  rejectsTampering: true
}, null, 2));
