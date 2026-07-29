import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGroundArtifact } from '../app/js/terrain/ground-artifact.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = [
  {
    id: 'golden-gate',
    latitude: 37.8202408,
    longitude: -122.47857
  },
  {
    id: 'holland-tunnel',
    latitude: 40.726368,
    longitude: -74.014159
  },
  {
    id: 'pregerson-interchange',
    latitude: 33.928746,
    longitude: -118.280939
  }
];

const evidence = [];
for (const fixture of fixtures) {
  const directory = path.join(root, 'app', 'assets', 'ground', fixture.id);
  const [manifest, artifact] = await Promise.all([
    fs.readFile(path.join(directory, 'ground-manifest.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(directory, 'ground-artifact.json'), 'utf8').then(JSON.parse)
  ]);
  const compiled = compileGroundArtifact({ manifest, artifact });
  assert.equal(compiled.status, 'accepted', `${fixture.id} ground was rejected`);
  assert.equal(manifest.providerId, 'copernicus-dem-classified-ground-v1');
  assert.equal(manifest.licenseAttested, true);
  assert.equal(manifest.correctionAttested, true);
  assert.ok(
    manifest.sourceEvidence?.sourceTiles?.every((tile) =>
      String(tile?.url || '').startsWith('https://copernicus-dem-30m.s3.amazonaws.com/')
    ),
    `${fixture.id} was not bound to the public unsigned Copernicus distribution`
  );
  assert.ok(
    fixture.latitude >= Number(manifest.coverage?.south) &&
    fixture.latitude <= Number(manifest.coverage?.north),
    `${fixture.id} latitude is outside accepted coverage`
  );
  assert.ok(
    fixture.longitude >= Number(manifest.coverage?.west) &&
    fixture.longitude <= Number(manifest.coverage?.east),
    `${fixture.id} longitude is outside accepted coverage`
  );
  evidence.push({
    id: fixture.id,
    artifactId: manifest.artifactId,
    providerId: manifest.providerId,
    sourceRelease: manifest.sourceRelease,
    sampleCount: artifact.samples.length,
    contentSha256: manifest.contentSha256
  });
}

console.log(JSON.stringify({
  ok: true,
  contract: 'phase3-named-accepted-ground',
  permissionGatedSourceUsed: false,
  fixtures: evidence
}, null, 2));
