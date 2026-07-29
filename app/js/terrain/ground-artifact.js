import {
  GROUND_ARTIFACT_SCHEMA_VERSION,
  validateGroundArtifactManifest
} from './ground-provider-registry.js?v=2';
import {
  compileDistrictGroundModel
} from '../world/compiler/district-ground-model.js?v=2';

function rejection(reason, diagnostics = {}) {
  return Object.freeze({
    type: 'GroundArtifact',
    schemaVersion: GROUND_ARTIFACT_SCHEMA_VERSION,
    status: 'rejected',
    reason,
    diagnostics: Object.freeze({ ...diagnostics })
  });
}

function coverageMatches(left, right) {
  return ['south', 'north', 'west', 'east'].every(
    (key) => Number(left?.[key]) === Number(right?.[key])
  );
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Text(text) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SHA-256 support is required');
  const bytes = new TextEncoder().encode(String(text));
  return bytesToHex(new Uint8Array(await subtle.digest('SHA-256', bytes)));
}

export function compileGroundArtifact({ manifest = {}, artifact = {} } = {}) {
  const manifestValidation = validateGroundArtifactManifest(manifest);
  if (!manifestValidation.valid) {
    return rejection('manifest-rejected', {
      artifactId: String(manifest.artifactId || ''),
      reasons: manifestValidation.reasons
    });
  }

  const bindings = [
    ['schemaVersion', Number(artifact.schemaVersion), Number(manifest.schemaVersion)],
    ['artifactId', String(artifact.artifactId || ''), String(manifest.artifactId)],
    ['providerId', String(artifact.providerId || ''), String(manifest.providerId)],
    ['sourceRelease', String(artifact.sourceRelease || ''), String(manifest.sourceRelease)],
    ['verticalDatum', String(artifact.verticalDatum || ''), String(manifest.verticalDatum)],
    ['spacingMeters', Number(artifact.grid?.spacingMeters), Number(manifest.spacingMeters)]
  ];
  const mismatches = bindings
    .filter(([, actual, expected]) => actual !== expected)
    .map(([field, actual, expected]) => Object.freeze({ field, actual, expected }));
  if (!coverageMatches(artifact.coverage, manifest.coverage)) {
    mismatches.push(Object.freeze({
      field: 'coverage',
      actual: artifact.coverage || null,
      expected: manifest.coverage
    }));
  }
  if (mismatches.length > 0) {
    return rejection('artifact-manifest-mismatch', {
      artifactId: String(manifest.artifactId),
      mismatches: Object.freeze(mismatches)
    });
  }

  const model = compileDistrictGroundModel({
    districtId: String(artifact.districtId || artifact.artifactId || ''),
    sourceClassification: 'accepted-ground',
    verticalDatum: manifest.verticalDatum,
    minimumConfidence: artifact.minimumConfidence,
    grid: artifact.grid,
    samples: artifact.samples
  });
  if (model.status !== 'accepted') {
    return rejection('ground-model-rejected', {
      artifactId: String(manifest.artifactId),
      modelReason: model.reason,
      modelDiagnostics: model.diagnostics
    });
  }
  if (model.grid.sampleCount !== Number(artifact.samples?.length)) {
    return rejection('artifact-sample-count-mismatch', {
      artifactId: String(manifest.artifactId),
      expectedCount: model.grid.sampleCount,
      receivedCount: Number(artifact.samples?.length || 0)
    });
  }

  return Object.freeze({
    type: 'GroundArtifact',
    schemaVersion: GROUND_ARTIFACT_SCHEMA_VERSION,
    status: 'accepted',
    artifactId: manifest.artifactId,
    providerId: manifest.providerId,
    sourceRelease: manifest.sourceRelease,
    contentSha256: manifest.contentSha256.toLowerCase(),
    verticalDatum: manifest.verticalDatum,
    coverage: Object.freeze({ ...manifest.coverage }),
    model,
    provenance: Object.freeze({
      providerId: manifestValidation.provider.id,
      providerLabel: manifestValidation.provider.label,
      sourceKind: manifestValidation.provider.sourceKind,
      sourceClassification: manifestValidation.provider.sourceClassification,
      runtimeDelivery: manifestValidation.provider.runtimeDelivery
    })
  });
}

export async function loadGroundArtifact({
  manifest = {},
  url,
  fetchImpl = globalThis.fetch
} = {}) {
  const validation = validateGroundArtifactManifest(manifest);
  if (!validation.valid) {
    return rejection('manifest-rejected', {
      artifactId: String(manifest.artifactId || ''),
      reasons: validation.reasons
    });
  }
  if (typeof fetchImpl !== 'function') {
    return rejection('fetch-unavailable', { artifactId: manifest.artifactId });
  }

  let response;
  try {
    response = await fetchImpl(String(url || ''), { cache: 'no-store' });
  } catch (error) {
    return rejection('artifact-fetch-failed', {
      artifactId: manifest.artifactId,
      message: String(error?.message || error)
    });
  }
  if (!response?.ok) {
    return rejection('artifact-fetch-failed', {
      artifactId: manifest.artifactId,
      httpStatus: Number(response?.status || 0)
    });
  }

  const text = await response.text();
  const actualSha256 = await sha256Text(text);
  if (actualSha256 !== String(manifest.contentSha256).toLowerCase()) {
    return rejection('artifact-integrity-failed', {
      artifactId: manifest.artifactId,
      expectedSha256: String(manifest.contentSha256).toLowerCase(),
      actualSha256
    });
  }

  let artifact;
  try {
    artifact = JSON.parse(text);
  } catch {
    return rejection('artifact-json-invalid', {
      artifactId: manifest.artifactId
    });
  }
  return compileGroundArtifact({ manifest, artifact });
}
