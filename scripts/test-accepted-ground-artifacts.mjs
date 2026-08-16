import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  loadGroundArtifact
} from '../app/js/terrain/ground-artifact.js';
import {
  createAcceptedGroundRuntime
} from '../app/js/terrain/accepted-ground-runtime.js';

const catalog = JSON.parse(await fs.readFile(
  new URL('../app/assets/ground/manifest-catalog.json', import.meta.url),
  'utf8'
));
assert.equal(catalog.schemaVersion, 1);
assert.ok(catalog.manifests.length > 0, 'accepted-ground catalog is empty');

const results = [];
for (const manifest of catalog.manifests) {
  const artifactUrl = new URL(
    `../app/assets/ground/${manifest.url.replace(/^\.\//, '')}`,
    import.meta.url
  );
  const artifactText = await fs.readFile(artifactUrl, 'utf8');
  const loaded = await loadGroundArtifact({
    manifest,
    url: artifactUrl.href,
    fetchImpl: async () => ({
      ok: true,
      text: async () => artifactText
    })
  });
  assert.equal(
    loaded.status,
    'accepted',
    `${manifest.artifactId} failed integrity/compile validation`
  );
  const corrupted = await loadGroundArtifact({
    manifest,
    url: artifactUrl.href,
    fetchImpl: async () => ({
      ok: true,
      text: async () => artifactText.replace(
        '"groundElevationMeters":',
        '"groundElevationMeters": 999, "_corrupted":'
      )
    })
  });
  assert.equal(corrupted.status, 'rejected');
  assert.equal(corrupted.reason, 'artifact-integrity-failed');

  const runtime = createAcceptedGroundRuntime({
    loadArtifact: async () => loaded
  });
  const center = {
    latitude:
      (manifest.coverage.south + manifest.coverage.north) * 0.5,
    longitude:
      (manifest.coverage.west + manifest.coverage.east) * 0.5
  };
  const probes = [
    center,
    {
      latitude: manifest.coverage.south,
      longitude: manifest.coverage.west
    },
    {
      latitude: manifest.coverage.south,
      longitude: manifest.coverage.east
    },
    {
      latitude: manifest.coverage.north,
      longitude: manifest.coverage.west
    },
    {
      latitude: manifest.coverage.north,
      longitude: manifest.coverage.east
    }
  ];
  const prepared = await runtime.prepare({
    ...center,
    manifests: [manifest],
    coverageProbes: probes
  });
  assert.equal(prepared.status, 'accepted');
  for (const probe of probes) {
    const sample = runtime.sampleAtLatLon(
      probe.latitude,
      probe.longitude
    );
    assert.equal(sample.status, 'available');
    assert.ok(Number.isFinite(sample.groundElevationMeters));
    assert.equal(sample.verticalDatum, 'EGM2008');
  }
  assert.equal(runtime.verifyCoverage(probes).status, 'accepted');
  const outside = runtime.sampleAtLatLon(
    manifest.coverage.north + 0.01,
    center.longitude
  );
  assert.equal(outside.status, 'unavailable');

  results.push({
    artifactId: manifest.artifactId,
    providerId: manifest.providerId,
    sampleCount: loaded.model.grid.sampleCount,
    spacingMeters: manifest.spacingMeters,
    verticalDatum: manifest.verticalDatum,
    contentSha256: manifest.contentSha256
  });
}

console.log(JSON.stringify({
  ok: true,
  contract: 'accepted-ground-artifacts',
  artifactCount: results.length,
  artifacts: results,
  integrityVerifiedBeforeParse: true,
  corruptionRejectedBeforeCompile: true,
  completeEdgeCoverageVerified: true,
  outsideCoverageUnavailable: true
}, null, 2));
