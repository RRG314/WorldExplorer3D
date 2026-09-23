import assert from 'node:assert/strict';
import { MARYLAND_JURISDICTIONS, MARYLAND_PARCEL_SOURCE, QUERY_FIELDS, buildMarylandParcelQueryUrl, normalizeMarylandParcelFeature } from '../../app/js/gis/maryland-parcel-core.js';

const queryUrl = `${MARYLAND_PARCEL_SOURCE.layerUrl}/query`;

async function query(params) {
  const url = new URL(queryUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } });
  assert.equal(response.ok, true, `provider HTTP ${response.status}`);
  const payload = await response.json();
  assert.equal(payload.error, undefined, payload.error?.message || 'provider query error');
  return payload;
}

const metadataResponse = await fetch(`${MARYLAND_PARCEL_SOURCE.layerUrl}?f=pjson`, { signal: AbortSignal.timeout(20000) });
assert.equal(metadataResponse.ok, true);
const metadata = await metadataResponse.json();
assert.equal(metadata.geometryType, 'esriGeometryPolygon');
assert.match(metadata.capabilities, /Query/);
assert.match(metadata.supportedQueryFormats, /geoJSON/i);
for (const forbidden of ['OWNADD1', 'OWNADD2', 'OWNCITY', 'OWNSTATE', 'OWNERZIP', 'OWNZIP2']) {
  assert.equal(QUERY_FIELDS.includes(forbidden), false, `${forbidden} must not be requested`);
}

// Do not scan the statewide layer for DISTINCT JURSCODE: the live service
// indexes OBJECTID and Shape, but not JURSCODE. The bounded samples below
// prove that every supported jurisdiction supplies a stable parcel record.
const coverage = [];
for (const [code, name] of Object.entries(MARYLAND_JURISDICTIONS)) {
  const sample = await query({
    f: 'json', where: `JURSCODE='${code}' AND POLYID IS NOT NULL`,
    outFields: 'JURSCODE,POLYID,POLYDATE', returnGeometry: false, resultRecordCount: 1
  });
  const record = sample.features?.[0]?.attributes;
  assert.equal(record?.JURSCODE, code, `${name} did not return a parcel sample`);
  assert.ok(record?.POLYID, `${name} sample lacks a stable polygon ID`);
  coverage.push({ code, name, status: 'SUPPORTED', sampleGeometryDate: record.POLYDATE || null });
}

// Exercise the production spatial query and normalization as well as metadata.
// County attribute samples alone cannot establish usable in-world geometry.
const spatialUrl = buildMarylandParcelQueryUrl({ lat: 39.29, lon: -76.61, radiusM: 120, limit: 5 });
const spatial = await query(Object.fromEntries(new URL(spatialUrl).searchParams));
assert.equal(spatial.type, 'FeatureCollection');
assert.ok(spatial.features?.length > 0, 'Baltimore spatial query returned no parcels');
assert.ok(spatial.features.length <= 5, 'Provider ignored the bounded record count');
const parcels = spatial.features.map(normalizeMarylandParcelFeature);
assert.ok(parcels.every(Boolean), 'Live parcel geometry or identity failed production normalization');
assert.ok(parcels.every((parcel) => parcel.jurisdictionCode === 'BACI'), 'Unexpected spatial jurisdiction');

console.log(JSON.stringify({
  ok: true,
  source: MARYLAND_PARCEL_SOURCE.id,
  itemId: MARYLAND_PARCEL_SOURCE.itemId,
  coverage,
  spatial: { location: { lat: 39.29, lon: -76.61 }, radiusM: 120, limit: 5, normalizedParcels: parcels.length },
  privacy: { requestedFields: QUERY_FIELDS, ownerFieldsRequested: false }
}, null, 2));
