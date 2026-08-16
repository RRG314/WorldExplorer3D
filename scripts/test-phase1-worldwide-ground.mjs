import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import {
  compileGroundArtifact
} from '../app/js/terrain/ground-artifact.js';
import {
  sampleDistrictGroundMeters
} from '../app/js/world/compiler/district-ground-model.js';

const groundRoot = new URL('../app/assets/ground/', import.meta.url);
const [catalog, scenarios] = await Promise.all([
  fs.readFile(new URL('manifest-catalog.json', groundRoot), 'utf8')
    .then(JSON.parse),
  fs.readFile(new URL('scenario-catalog.json', groundRoot), 'utf8')
    .then(JSON.parse)
]);
const requiredCategories = new Set([
  'mountain-city',
  'coast',
  'alpine',
  'polar',
  'desert',
  'below-sea-level',
  'high-plateau',
  'vector-dem-tile-boundary'
]);
const requiredAttribution =
  'produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and ' +
  '© Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS ' +
  'by the European Union and ESA; all rights reserved.';
const requiredLiabilityNotice =
  'The organisations in charge of the Copernicus programme by law or by ' +
  'delegation do not incur any liability for any use of the Copernicus ' +
  'WorldDEM-30.';
const configuredCategories = new Set(
  scenarios.scenarios.flatMap((scenario) => scenario.categories)
);
for (const category of requiredCategories) {
  assert.ok(configuredCategories.has(category), `missing ${category} scenario`);
}

const manifestById = new Map(
  catalog.manifests.map((manifest) => [manifest.artifactId, manifest])
);
const compiledById = new Map();
for (const scenario of scenarios.scenarios) {
  const artifactId = `${scenario.id}-ground`;
  const manifest = manifestById.get(artifactId);
  assert.ok(manifest, `catalog missing ${artifactId}`);
  assert.equal(
    manifest.providerId,
    'copernicus-dem-classified-ground-v1'
  );
  assert.equal(manifest.licenseAttested, true);
  assert.equal(manifest.correctionAttested, true);
  assert.equal(manifest.attribution?.modified, true);
  assert.equal(manifest.attribution?.notice, requiredAttribution);
  assert.equal(
    manifest.attribution?.liabilityNotice,
    requiredLiabilityNotice
  );
  const artifact = JSON.parse(await fs.readFile(
    new URL(`${scenario.id}/ground-artifact.json`, groundRoot),
    'utf8'
  ));
  const compiled = compileGroundArtifact({ manifest, artifact });
  assert.equal(compiled.status, 'accepted');
  assert.equal(compiled.model.diagnostics.rawGroundProductsSeparated, true);
  assert.ok(artifact.samples.every((sample) =>
    Number.isFinite(sample.rawElevationMeters) &&
    Number.isFinite(sample.groundElevationMeters) &&
    sample.rawElevationMeters - sample.groundElevationMeters <= 80.000001
  ));
  compiledById.set(artifactId, { compiled, artifact, manifest });
}

const deadSea = compiledById.get('dead-sea-ground').artifact;
assert.ok(
  deadSea.samples.every((sample) => sample.groundElevationMeters < -400),
  'below-sea-level ground was clamped or converted to missing'
);
const plateau = compiledById.get('lhasa-plateau-ground').artifact;
assert.ok(
  plateau.samples.every((sample) => sample.groundElevationMeters > 3500),
  'high plateau was flattened'
);
const tileCorner =
  compiledById.get('four-tile-corner-ground').manifest.sourceEvidence;
assert.equal(
  new Set(tileCorner.sourceTiles.map((tile) => tile.tileId)).size,
  4,
  'four-tile corner did not bind all source tiles'
);
const legalSurfaces = await Promise.all([
  fs.readFile(new URL('../app/index.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('../legal/terms.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('../legal/terms/index.html', import.meta.url), 'utf8')
]);
for (const surface of legalSurfaces) {
  assert.ok(surface.includes(requiredAttribution));
  assert.ok(surface.includes(requiredLiabilityNotice));
}

const benchmarkModel =
  compiledById.get('four-tile-corner-ground').compiled.model;
const durations = [];
const { grid } = benchmarkModel;
for (let index = 0; index < 25000; index += 1) {
  const column =
    grid.minColumn + (index % (grid.maxColumn - grid.minColumn));
  const row =
    grid.minRow + (index * 17 % (grid.maxRow - grid.minRow));
  const started = performance.now();
  const sample = sampleDistrictGroundMeters(
    benchmarkModel,
    (column + 0.37) * grid.spacingMeters,
    (row + 0.61) * grid.spacingMeters
  );
  durations.push(performance.now() - started);
  assert.equal(sample.status, 'available');
}
durations.sort((left, right) => left - right);
const p95Milliseconds = durations[Math.floor(durations.length * 0.95)];
assert.ok(
  p95Milliseconds <= 0.2,
  `cached ground sampling p95 ${p95Milliseconds.toFixed(4)}ms exceeds 0.2ms`
);

console.log(JSON.stringify({
  ok: true,
  contract: 'phase1-worldwide-ground',
  worldwideScenarioCount: scenarios.scenarios.length,
  categories: [...configuredCategories].sort(),
  acceptedArtifactCount: catalog.manifests.length,
  belowSeaLevelPreserved: true,
  highPlateauPreserved: true,
  fourTileSourceBinding: true,
  requiredLegalNoticesPresent: true,
  maximumClassifiedCorrectionMeters: 80,
  cachedSamplingP95Milliseconds: Number(p95Milliseconds.toFixed(6)),
  samplingBudgetMilliseconds: 0.2
}, null, 2));
