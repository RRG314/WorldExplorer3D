export const ACCEPTED_GROUND_CATALOG_SCHEMA_VERSION = 1;
export const DEFAULT_ACCEPTED_GROUND_CATALOG_URL =
  '/app/assets/ground/manifest-catalog.json';

function result(status, reason, details = {}) {
  return Object.freeze({
    type: 'AcceptedGroundCatalog',
    schemaVersion: ACCEPTED_GROUND_CATALOG_SCHEMA_VERSION,
    status,
    reason,
    manifests: Object.freeze([...(details.manifests || [])]),
    url: String(details.url || '')
  });
}

function resolveCatalogUrl(url) {
  const value = String(url || '');
  try {
    return new URL(value, globalThis.location?.href).href;
  } catch {
    return value;
  }
}

export function parseAcceptedGroundCatalog(value, { url = '' } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return result('rejected', 'catalog-json-must-be-an-object', { url });
  }
  if (
    Number(value.schemaVersion) !==
    ACCEPTED_GROUND_CATALOG_SCHEMA_VERSION
  ) {
    return result('rejected', 'unsupported-catalog-schema', { url });
  }
  if (!Array.isArray(value.manifests)) {
    return result('rejected', 'catalog-manifests-must-be-an-array', { url });
  }
  const manifests = value.manifests.map((manifest) => {
    const normalized = { ...manifest };
    const artifactUrl = String(
      normalized.url || normalized.artifactUrl || ''
    );
    if (artifactUrl && url) {
      normalized.url = new URL(artifactUrl, url).href;
    }
    return Object.freeze(normalized);
  });
  return result('accepted', null, { manifests, url });
}

export async function loadAcceptedGroundCatalog({
  url = DEFAULT_ACCEPTED_GROUND_CATALOG_URL,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return result('rejected', 'catalog-fetch-unavailable', { url });
  }
  let response;
  try {
    response = await fetchImpl(String(url), { cache: 'no-store' });
  } catch {
    return result('rejected', 'catalog-fetch-failed', { url });
  }
  if (!response?.ok) {
    return result('rejected', 'catalog-fetch-failed', { url });
  }
  let value;
  try {
    value = await response.json();
  } catch {
    return result('rejected', 'catalog-json-invalid', { url });
  }
  return parseAcceptedGroundCatalog(value, {
    url: response.url || resolveCatalogUrl(url)
  });
}
