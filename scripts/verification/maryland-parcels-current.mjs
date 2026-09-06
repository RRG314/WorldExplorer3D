import assert from 'node:assert/strict';
import { MARYLAND_JURISDICTIONS, MARYLAND_PARCEL_SOURCE, QUERY_FIELDS } from '../../app/js/gis/maryland-parcel-core.js';

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

const distinct = await query({
  f: 'json', where: '1=1', outFields: 'JURSCODE', returnDistinctValues: true,
  returnGeometry: false, orderByFields: 'JURSCODE'
});
const liveCodes = new Set((distinct.features || []).map((feature) => feature.attributes?.JURSCODE).filter(Boolean));
assert.deepEqual([...liveCodes].sort(), Object.keys(MARYLAND_JURISDICTIONS).sort());

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

console.log(JSON.stringify({
  ok: true,
  source: MARYLAND_PARCEL_SOURCE.id,
  itemId: MARYLAND_PARCEL_SOURCE.itemId,
  coverage,
  privacy: { requestedFields: QUERY_FIELDS, ownerFieldsRequested: false }
}, null, 2));
