import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  chunkGroundPoints,
  createGroundArtifactBundle,
  createGroundBuildPlan,
  fetchUsgs3depSamples,
  normalizeGroundSamples
} from './lib/ground-artifact-builder.mjs';
import {
  decodeUncompressedFloat32Tiff
} from './lib/tiff-f32.mjs';

function float32StripTiff(values, width, height) {
  const tags = [
    [256, 4, width],
    [257, 4, height],
    [258, 3, 32],
    [259, 3, 1],
    [273, 4, 122],
    [277, 3, 1],
    [278, 4, height],
    [279, 4, values.length * 4],
    [339, 3, 3]
  ];
  const bytes = new Uint8Array(122 + values.length * 4);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49]);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, tags.length, true);
  tags.forEach(([tag, type, value], index) => {
    const offset = 10 + index * 12;
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, 1, true);
    if (type === 3) view.setUint16(offset + 8, value, true);
    else view.setUint32(offset + 8, value, true);
  });
  view.setUint32(118, 0, true);
  values.forEach((value, index) => {
    view.setFloat32(122 + index * 4, value, true);
  });
  return bytes;
}

const decodedTiff = decodeUncompressedFloat32Tiff(
  float32StripTiff([1.25, -2.5, 3.75, 4.5], 2, 2)
);
assert.equal(decodedTiff.width, 2);
assert.equal(decodedTiff.height, 2);
assert.deepEqual([...decodedTiff.values], [1.25, -2.5, 3.75, 4.5]);
const compressedTiff = float32StripTiff([1, 2, 3, 4], 2, 2);
new DataView(compressedTiff.buffer).setUint16(54, 5, true);
assert.throws(
  () => decodeUncompressedFloat32Tiff(compressedTiff),
  /must be uncompressed/
);

const plan = createGroundBuildPlan({
  districtId: 'baltimore-fixture',
  centerLatitude: 39.2904,
  centerLongitude: -76.6122,
  widthMeters: 10,
  heightMeters: 10,
  spacingMeters: 10
});
assert.equal(plan.partCount, 1);
assert.equal(plan.crossesAntimeridian, false);
assert.equal(plan.parts[0].grid.sampleCount, 9);
assert.deepEqual(
  plan.parts[0].points.map((point) => point.key),
  [...plan.parts[0].points].sort((left, right) =>
    left.row - right.row || left.column - right.column
  ).map((point) => point.key)
);

const repeatedPlan = createGroundBuildPlan({
  districtId: 'baltimore-fixture',
  centerLatitude: 39.2904,
  centerLongitude: -76.6122,
  widthMeters: 10,
  heightMeters: 10,
  spacingMeters: 10
});
assert.deepEqual(plan, repeatedPlan, 'build plans must be deterministic');

const antimeridianPlan = createGroundBuildPlan({
  districtId: 'antimeridian-fixture',
  centerLatitude: 0,
  centerLongitude: 179.99999,
  widthMeters: 100,
  heightMeters: 10,
  spacingMeters: 10
});
assert.equal(antimeridianPlan.crossesAntimeridian, true);
assert.equal(antimeridianPlan.partCount, 2);
assert(antimeridianPlan.parts.every((part) => part.grid.sampleCount > 0));
assert.throws(
  () => createGroundBuildPlan({
    districtId: 'antimeridian-over-budget',
    centerLatitude: 0,
    centerLongitude: 179.99999,
    widthMeters: 100,
    heightMeters: 10,
    spacingMeters: 10,
    maxSamples: 15
  }),
  /maximum is 15/
);

const worldControls = [
  ['sydney', -33.8688, 151.2093],
  ['monaco', 43.7384, 7.4246],
  ['svalbard', 78.2232, 15.6469],
  ['antarctica', -77.846, 166.668],
  ['dubai-desert', 24.9222, 55.7676]
].map(([districtId, centerLatitude, centerLongitude]) =>
  createGroundBuildPlan({
    districtId,
    centerLatitude,
    centerLongitude,
    widthMeters: 100,
    heightMeters: 100,
    spacingMeters: 30
  })
);
assert(worldControls.every((control) =>
  control.providerId === null &&
  control.partCount === 1 &&
  control.sampleCount > 0 &&
  control.parts[0].points.every((point) =>
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude <= 85.0511287798066 &&
    point.latitude >= -85.0511287798066
  )
));

assert.throws(
  () => createGroundBuildPlan({
    districtId: 'oversized',
    centerLatitude: 0,
    centerLongitude: 0,
    widthMeters: 1000,
    heightMeters: 1000,
    spacingMeters: 1,
    maxSamples: 100
  }),
  /maximum is 100/
);
assert.deepEqual(
  chunkGroundPoints(plan.parts[0].points, 4).map((chunk) => chunk.length),
  [4, 4, 1]
);
assert.throws(
  () => chunkGroundPoints(plan.parts[0].points, 6),
  /integer from 1 through 5/
);

const providerPayload = {
  samples: plan.parts[0].points.map((point, index) => ({
    location: {
      x: point.longitude,
      y: point.latitude,
      spatialReference: { wkid: 4326 }
    },
    value: String(10 + index),
    rasterId: 80894,
    resolution: 1,
    attributes: {
      ProductName: 'USGS_3DEP',
      VerticalDatum: 'North American Vertical Datum of 1988 (NAVD 88)',
      URL: '20260511',
      title: 'USGS 1 Meter fixture',
      StartDate: 20241117,
      EndDate: '20241231'
    }
  }))
};
let observedRequest;
const rawSamples = await fetchUsgs3depSamples({
  points: plan.parts[0].points,
  fetchImpl: async (url, request) => {
    observedRequest = { url, request };
    return new Response(JSON.stringify(providerPayload), { status: 200 });
  }
});
assert.equal(rawSamples.length, plan.parts[0].grid.sampleCount);
assert.equal(rawSamples[0].sourceVerticalDatum, 'NAVD88');
assert.equal(rawSamples[0].sourceResolutionMeters, 1);
assert.match(String(observedRequest.request.body), /esriGeometryMultipoint/);

const wrongDatumPayload = structuredClone(providerPayload);
wrongDatumPayload.samples[0].attributes.VerticalDatum = 'local datum';
await assert.rejects(
  fetchUsgs3depSamples({
    points: plan.parts[0].points,
    fetchImpl: async () =>
      new Response(JSON.stringify(wrongDatumPayload), { status: 200 })
  }),
  /unsupported vertical datum/
);
const missingReleasePayload = structuredClone(providerPayload);
missingReleasePayload.samples[0].attributes.URL = '';
await assert.rejects(
  fetchUsgs3depSamples({
    points: plan.parts[0].points,
    fetchImpl: async () =>
      new Response(JSON.stringify(missingReleasePayload), { status: 200 })
  }),
  /has no source release/
);

await assert.rejects(
  normalizeGroundSamples({ rawSamples }),
  /verified datum normalizer is required/
);
await assert.rejects(
  normalizeGroundSamples({
    rawSamples,
    normalizeSample: async (sample) => ({
      groundElevationMeters: sample.rawElevationMeters,
      horizontalFrame: 'NAD83_2011',
      verticalDatum: 'NAVD88',
      uncertaintyMeters: 0.1
    })
  }),
  /did not produce EGM2008/
);
await assert.rejects(
  normalizeGroundSamples({
    rawSamples,
    normalizeSample: async (sample) => ({
      groundElevationMeters: sample.rawElevationMeters,
      horizontalFrame: 'NAD83_2011',
      verticalDatum: 'EGM2008',
      uncertaintyMeters: 0.1
    })
  }),
  /did not produce WGS84_G1674/
);
await assert.rejects(
  normalizeGroundSamples({
    rawSamples,
    maximumUncertaintyMeters: 1,
    normalizeSample: async (sample) => ({
      groundElevationMeters: sample.rawElevationMeters - 0.2,
      horizontalFrame: 'WGS84_G1674',
      verticalDatum: 'EGM2008',
      uncertaintyMeters: 1.1
    })
  }),
  /uncertainty exceeds policy/
);

const normalizedSamples = await normalizeGroundSamples({
  rawSamples,
  maximumUncertaintyMeters: 1,
  normalizeSample: async (sample) => ({
    groundElevationMeters: sample.rawElevationMeters - 0.2,
    horizontalFrame: 'WGS84_G1674',
    verticalDatum: 'EGM2008',
    uncertaintyMeters: 0.1,
    method: 'fixture-vdatum'
  })
});
const bundle = createGroundArtifactBundle({
  artifactId: 'baltimore-fixture-ground',
  part: plan.parts[0],
  sourceRelease: 'USGS-3DEP-20260511',
  normalizedSamples
});
assert.equal(bundle.compiled.status, 'accepted');
assert.equal(bundle.manifest.complete, true);
assert.equal(bundle.manifest.missingSampleCount, 0);
assert.equal(bundle.compiled.model.grid.sampleCount, plan.parts[0].grid.sampleCount);
assert.match(bundle.artifactText, /vertical-datum-normalization/);

const cliDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'we3d-ground-'));
const rawDocument = {
  schemaVersion: 1,
  type: 'GroundRawSampleSet',
  status: 'raw-not-runtime-ground',
  providerId: 'usgs-3dep-best-available',
  sourceHorizontalFrame: 'NAD83',
  sourceVerticalDatum: 'NAVD88',
  targetVerticalDatum: 'EGM2008',
  plan,
  sampleCount: rawSamples.length,
  sourceReleases: ['fixture-2026'],
  samples: rawSamples
};
const rawText = `${JSON.stringify(rawDocument, null, 2)}\n`;
const rawPath = path.join(cliDirectory, 'raw.json');
const normalizationPath = path.join(cliDirectory, 'normalization.json');
const artifactDirectory = path.join(cliDirectory, 'accepted');
await fs.writeFile(rawPath, rawText, 'utf8');
await fs.writeFile(normalizationPath, `${JSON.stringify({
  schemaVersion: 1,
  complete: true,
  sourceContentSha256:
    crypto.createHash('sha256').update(rawText).digest('hex'),
  targetHorizontalFrame: 'WGS84_G1674',
  targetVerticalDatum: 'EGM2008',
  normalizer: {
    name: 'fixture-vdatum',
    version: '1.0.0',
    datasetSha256: 'd'.repeat(64)
  },
  samples: rawSamples.map((sample) => ({
    key: sample.key,
    groundElevationMeters: sample.rawElevationMeters - 0.2,
    uncertaintyMeters: 0.1
  }))
}, null, 2)}\n`, 'utf8');
execFileSync(process.execPath, [
  'scripts/build-ground-artifact.mjs',
  'compile',
  '--raw', rawPath,
  '--normalization', normalizationPath,
  '--output-dir', artifactDirectory
], { cwd: process.cwd(), stdio: 'pipe' });
const cliManifest = JSON.parse(await fs.readFile(
  path.join(artifactDirectory, 'ground-manifest.json'),
  'utf8'
));
assert.equal(cliManifest.complete, true);
assert.equal(cliManifest.verticalDatum, 'EGM2008');
assert.match(cliManifest.contentSha256, /^[a-f0-9]{64}$/);

assert.throws(
  () => createGroundArtifactBundle({
    artifactId: 'incomplete',
    part: plan.parts[0],
    sourceRelease: 'fixture',
    normalizedSamples: normalizedSamples.slice(0, 3)
  }),
  /rejected/
);

console.log(JSON.stringify({
  ok: true,
  contract: 'ground-artifact-builder',
  deterministicPlan: true,
  antimeridianPartitioned: true,
  worldPlanningControls: worldControls.length,
  providerDatumVerified: true,
  sourceResolutionRecorded: rawSamples[0].sourceResolutionMeters,
  float32TiffDecodeVerified: true,
  normalizationFailClosed: true,
  artifactSampleCount: bundle.compiled.model.grid.sampleCount,
  cliCompileVerified: true
}, null, 2));
