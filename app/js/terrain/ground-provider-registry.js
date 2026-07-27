export const GROUND_ARTIFACT_SCHEMA_VERSION = 1;
export const GROUND_TARGET_VERTICAL_DATUM = 'EGM2008';

const PROVIDERS = Object.freeze({
  'usgs-3dep-10m': Object.freeze({
    id: 'usgs-3dep-10m',
    label: 'USGS 3DEP 1/3 arc-second DEM',
    sourceKind: 'bare-earth-dem',
    sourceClassification: 'accepted-ground',
    nativeVerticalDatum:
      'regional; typically NAVD88 in the conterminous United States',
    nominalResolutionMeters: 10,
    coverage: 'United States; artifact coverage manifest required',
    licenseStatus: 'usable-public-government-data',
    runtimeDelivery: 'precompiled-artifact-only',
    priority: 100,
    sourceDocument:
      'https://data.usgs.gov/datacatalog/data/USGS%3A3a81321b-c153-416f-98b7-cc8e5f0e17c3',
    datumDocument:
      'https://www.usgs.gov/faqs/what-projection-horizontal-datum-vertical-datum-and-resolution-a-usgs-digital-elevation-model'
  }),
  'fabdem-v1.2': Object.freeze({
    id: 'fabdem-v1.2',
    label: 'FABDEM V1.2',
    sourceKind: 'corrected-bare-earth-dem',
    sourceClassification: 'accepted-ground-candidate',
    nativeVerticalDatum: 'EGM2008',
    nominalResolutionMeters: 30,
    coverage: 'global published tile set',
    licenseStatus: 'license-attestation-required',
    runtimeDelivery: 'precompiled-artifact-only',
    priority: 80,
    sourceDocument:
      'https://research-information.bris.ac.uk/en/datasets/fabdem-v1-2/'
  }),
  'copernicus-dem-glo30': Object.freeze({
    id: 'copernicus-dem-glo30',
    label: 'Copernicus DEM GLO-30',
    sourceKind: 'digital-surface-model',
    sourceClassification: 'correctable-surface',
    nativeVerticalDatum: 'EGM2008',
    nominalResolutionMeters: 30,
    coverage: 'worldwide land surface',
    licenseStatus: 'source-license-and-access-acceptance-required',
    runtimeDelivery: 'precompiled-correction-input-only',
    priority: 0,
    sourceDocument:
      'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM'
  }),
  arcticdem: Object.freeze({
    id: 'arcticdem',
    label: 'ArcticDEM',
    sourceKind: 'digital-surface-model',
    sourceClassification: 'correctable-surface',
    nativeVerticalDatum: 'provider-release-specific',
    nominalResolutionMeters: 2,
    coverage: 'Arctic',
    licenseStatus: 'CC-BY-4.0-released-products',
    runtimeDelivery: 'precompiled-correction-input-only',
    priority: 0,
    sourceDocument:
      'https://www.pgc.umn.edu/guides/stereo-derived-elevation-models/pgc-dem-products-arcticdem-rema-and-earthdem/'
  }),
  rema: Object.freeze({
    id: 'rema',
    label: 'Reference Elevation Model of Antarctica',
    sourceKind: 'digital-surface-model',
    sourceClassification: 'correctable-surface',
    nativeVerticalDatum: 'provider-release-specific',
    nominalResolutionMeters: 2,
    coverage: 'Antarctica',
    licenseStatus: 'CC-BY-4.0-released-products',
    runtimeDelivery: 'precompiled-correction-input-only',
    priority: 0,
    sourceDocument:
      'https://www.pgc.umn.edu/guides/stereo-derived-elevation-models/pgc-dem-products-arcticdem-rema-and-earthdem/'
  }),
  'mapzen-terrarium': Object.freeze({
    id: 'mapzen-terrarium',
    label: 'Mapzen Terrain Tiles / Terrarium',
    sourceKind: 'mixed-source-terrain-composite',
    sourceClassification: 'legacy-ground-fallback-only',
    nativeVerticalDatum: 'mixed-source; not proven uniform',
    nominalResolutionMeters: null,
    coverage: 'global Web Mercator',
    licenseStatus: 'attribution-required',
    runtimeDelivery: 'legacy-visual-runtime',
    priority: 0,
    sourceDocument: 'https://registry.opendata.aws/terrain-tiles/'
  })
});

function freezeProvider(provider) {
  return provider || null;
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function normalizeLongitude(longitude) {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function coversLocation(coverage, latitude, longitude) {
  const south = Number(coverage?.south);
  const north = Number(coverage?.north);
  const west = Number(coverage?.west);
  const east = Number(coverage?.east);
  if (![south, north, west, east].every(Number.isFinite)) return false;
  if (latitude < south || latitude > north) return false;
  if (Math.abs(east - west) >= 360) return true;
  const normalizedLongitude = normalizeLongitude(longitude);
  const normalizedWest = normalizeLongitude(west);
  const normalizedEast = normalizeLongitude(east);
  return normalizedWest <= normalizedEast
    ? normalizedLongitude >= normalizedWest &&
        normalizedLongitude <= normalizedEast
    : normalizedLongitude >= normalizedWest ||
        normalizedLongitude <= normalizedEast;
}

function validCoverage(coverage) {
  const south = Number(coverage?.south);
  const north = Number(coverage?.north);
  const west = Number(coverage?.west);
  const east = Number(coverage?.east);
  return [south, north, west, east].every(Number.isFinite) &&
    south >= -90 &&
    north <= 90 &&
    south <= north;
}

function manifestRejection(manifest, reason) {
  return Object.freeze({
    artifactId: String(manifest?.artifactId || ''),
    providerId: String(manifest?.providerId || ''),
    reason
  });
}

export function groundProvider(providerId) {
  return freezeProvider(PROVIDERS[String(providerId || '')]);
}

export function groundProviderCatalog() {
  return Object.freeze(Object.values(PROVIDERS));
}

export function groundProviderCatalogSnapshot() {
  const providers = groundProviderCatalog();
  return Object.freeze({
    schemaVersion: GROUND_ARTIFACT_SCHEMA_VERSION,
    targetVerticalDatum: GROUND_TARGET_VERTICAL_DATUM,
    providerCount: providers.length,
    providers: Object.freeze(providers.map((provider) => Object.freeze({
      id: provider.id,
      sourceKind: provider.sourceKind,
      sourceClassification: provider.sourceClassification,
      licenseStatus: provider.licenseStatus,
      runtimeDelivery: provider.runtimeDelivery
    })))
  });
}

export function validateGroundArtifactManifest(manifest = {}) {
  const provider = groundProvider(manifest.providerId);
  const reasons = [];
  if (!provider) reasons.push('unknown-provider');
  if (Number(manifest.schemaVersion) !== GROUND_ARTIFACT_SCHEMA_VERSION) {
    reasons.push('unsupported-schema');
  }
  if (!String(manifest.artifactId || '')) reasons.push('missing-artifact-id');
  if (!String(manifest.sourceRelease || '')) reasons.push('missing-source-release');
  if (!isSha256(manifest.contentSha256)) reasons.push('invalid-content-sha256');
  if (!Number.isFinite(Number(manifest.spacingMeters)) ||
      Number(manifest.spacingMeters) <= 0) {
    reasons.push('invalid-spacing');
  }
  if (!validCoverage(manifest.coverage)) {
    reasons.push('invalid-coverage');
  }
  if (manifest.complete !== true || Number(manifest.missingSampleCount) !== 0) {
    reasons.push('incomplete-coverage');
  }
  if (String(manifest.verticalDatum || '') !== GROUND_TARGET_VERTICAL_DATUM) {
    reasons.push('vertical-datum-not-normalized');
  }
  if (provider?.sourceClassification === 'accepted-ground-candidate' &&
      manifest.licenseAttested !== true) {
    reasons.push('license-attestation-required');
  }
  if (provider &&
      !['accepted-ground', 'accepted-ground-candidate'].includes(
        provider.sourceClassification
      )) {
    reasons.push('provider-not-ground-authority');
  }
  return Object.freeze({
    valid: reasons.length === 0,
    reasons: Object.freeze(reasons),
    provider
  });
}

export function selectGroundArtifact(options = {}) {
  const latitude = Number(options.latitude);
  const longitude = Number(options.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError('latitude must be a finite value from -90 through 90');
  }
  if (!Number.isFinite(longitude)) {
    throw new TypeError('longitude must be finite');
  }
  const manifests = Array.isArray(options.manifests) ? options.manifests : [];
  const accepted = [];
  const rejected = [];
  for (const manifest of manifests) {
    const validation = validateGroundArtifactManifest(manifest);
    if (!validation.valid) {
      validation.reasons.forEach((reason) =>
        rejected.push(manifestRejection(manifest, reason)));
      continue;
    }
    if (!coversLocation(manifest.coverage, latitude, longitude)) {
      rejected.push(manifestRejection(manifest, 'outside-artifact-coverage'));
      continue;
    }
    accepted.push({ manifest, provider: validation.provider });
  }
  accepted.sort((left, right) => {
    const priorityDifference =
      Number(right.provider.priority) - Number(left.provider.priority);
    if (priorityDifference !== 0) return priorityDifference;
    const resolutionDifference =
      Number(left.manifest.spacingMeters) - Number(right.manifest.spacingMeters);
    if (resolutionDifference !== 0) return resolutionDifference;
    return String(left.manifest.artifactId)
      .localeCompare(String(right.manifest.artifactId));
  });
  if (accepted.length === 0) {
    return Object.freeze({
      status: 'blocked',
      reason: manifests.length === 0
        ? 'no-ground-artifacts-configured'
        : 'no-accepted-ground-artifact-for-location',
      provider: null,
      manifest: null,
      rejected: Object.freeze(rejected)
    });
  }
  const selection = accepted[0];
  return Object.freeze({
    status: 'accepted',
    reason: null,
    provider: selection.provider,
    manifest: Object.freeze({ ...selection.manifest }),
    rejected: Object.freeze(rejected)
  });
}
