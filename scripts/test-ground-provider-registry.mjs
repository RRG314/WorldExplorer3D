import assert from 'node:assert/strict';
import {
  GROUND_ARTIFACT_SCHEMA_VERSION,
  GROUND_TARGET_VERTICAL_DATUM,
  groundProvider,
  groundProviderCatalog,
  groundProviderCatalogSnapshot,
  selectGroundArtifact,
  validateGroundArtifactManifest
} from '../app/js/terrain/ground-provider-registry.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function manifest(overrides = {}) {
  return {
    schemaVersion: GROUND_ARTIFACT_SCHEMA_VERSION,
    artifactId: 'fixture-ground',
    providerId: 'usgs-3dep-best-available',
    sourceRelease: 'fixture-2026',
    contentSha256: SHA_A,
    spacingMeters: 10,
    coverage: {
      south: 38,
      north: 40,
      west: -78,
      east: -76
    },
    verticalDatum: GROUND_TARGET_VERTICAL_DATUM,
    complete: true,
    missingSampleCount: 0,
    ...overrides
  };
}

assert.equal(groundProviderCatalog().length, 6);
assert.equal(
  groundProvider('usgs-3dep-best-available').sourceClassification,
  'accepted-ground'
);
assert.equal(
  groundProvider('copernicus-dem-glo30').sourceClassification,
  'correctable-surface'
);
assert.equal(
  groundProvider('arcticdem').sourceKind,
  'digital-surface-model'
);
assert.equal(
  groundProvider('mapzen-terrarium').sourceClassification,
  'legacy-ground-fallback-only'
);

const noArtifacts = selectGroundArtifact({
  latitude: 39.29,
  longitude: -76.61,
  manifests: []
});
assert.equal(noArtifacts.status, 'blocked');
assert.equal(noArtifacts.reason, 'no-ground-artifacts-configured');

const acceptedUs = selectGroundArtifact({
  latitude: 39.29,
  longitude: -76.61,
  manifests: [manifest()]
});
assert.equal(acceptedUs.status, 'accepted');
assert.equal(acceptedUs.provider.id, 'usgs-3dep-best-available');
assert.equal(acceptedUs.manifest.verticalDatum, 'EGM2008');

const outsideUs = selectGroundArtifact({
  latitude: -33.86,
  longitude: 151.2,
  manifests: [manifest()]
});
assert.equal(outsideUs.status, 'blocked');
assert.equal(
  outsideUs.rejected[0].reason,
  'outside-artifact-coverage'
);

const fabdemWithoutLicense = manifest({
  artifactId: 'fabdem-unlicensed',
  providerId: 'fabdem-v1.2',
  contentSha256: SHA_B,
  spacingMeters: 30,
  coverage: { south: -60, north: 80, west: -180, east: 180 },
  licenseAttested: false
});
const fabdemValidation =
  validateGroundArtifactManifest(fabdemWithoutLicense);
assert.equal(fabdemValidation.valid, false);
assert.ok(
  fabdemValidation.reasons.includes('license-attestation-required')
);

const licensedFabdem = {
  ...fabdemWithoutLicense,
  licenseAttested: true
};
assert.equal(validateGroundArtifactManifest(licensedFabdem).valid, true);
assert.equal(
  selectGroundArtifact({
    latitude: -33.86,
    longitude: 151.2,
    manifests: [licensedFabdem]
  }).status,
  'accepted'
);

const copernicusDirect = manifest({
  artifactId: 'copernicus-direct',
  providerId: 'copernicus-dem-glo30'
});
const copernicusValidation =
  validateGroundArtifactManifest(copernicusDirect);
assert.ok(
  copernicusValidation.reasons.includes('provider-not-ground-authority')
);

const wrongDatum = manifest({ verticalDatum: 'NAVD88' });
assert.ok(
  validateGroundArtifactManifest(wrongDatum).reasons.includes(
    'vertical-datum-not-normalized'
  )
);
const incomplete = manifest({ complete: false, missingSampleCount: 1 });
assert.ok(
  validateGroundArtifactManifest(incomplete).reasons.includes(
    'incomplete-coverage'
  )
);
assert.ok(
  validateGroundArtifactManifest(
    manifest({ coverage: { south: 40, north: 30, west: -80, east: -70 } })
  ).reasons.includes('invalid-coverage')
);

const higherPriorityWins = selectGroundArtifact({
  latitude: 39.29,
  longitude: -76.61,
  manifests: [
    {
      ...licensedFabdem,
      coverage: { south: 38, north: 40, west: -78, east: -76 }
    },
    manifest()
  ]
});
assert.equal(higherPriorityWins.provider.id, 'usgs-3dep-best-available');

const antimeridianArtifact = manifest({
  artifactId: 'antimeridian',
  coverage: { south: -5, north: 5, west: 170, east: -170 }
});
assert.equal(
  selectGroundArtifact({
    latitude: 0,
    longitude: 179.9,
    manifests: [antimeridianArtifact]
  }).status,
  'accepted'
);
assert.equal(
  selectGroundArtifact({
    latitude: 0,
    longitude: -179.9,
    manifests: [antimeridianArtifact]
  }).status,
  'accepted'
);

const snapshot = groundProviderCatalogSnapshot();
assert.equal(snapshot.targetVerticalDatum, 'EGM2008');
assert.equal(snapshot.providerCount, 6);
assert(Object.isFrozen(snapshot));
assert(Object.isFrozen(snapshot.providers));

console.log(JSON.stringify({
  ok: true,
  contract: 'ground-provider-registry',
  targetVerticalDatum: GROUND_TARGET_VERTICAL_DATUM,
  providers: groundProviderCatalog().map((provider) => ({
    id: provider.id,
    classification: provider.sourceClassification,
    licenseStatus: provider.licenseStatus
  })),
  selection: {
    regionalPriority: higherPriorityWins.provider.id,
    globalCandidateRequiresLicense: true,
    directSurfaceModelsRejected: true,
    missingCoverageBlocksPublication: true
  }
}, null, 2));
