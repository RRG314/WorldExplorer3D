import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { MARYLAND_JURISDICTIONS, MARYLAND_PARCEL_SOURCE, QUERY_FIELDS } from '../../app/js/gis/maryland-parcel-core.js';

import { loadMarylandParcels } from '../../app/js/gis/maryland-parcel-provider.js';

const reportPath = 'output/verification/maryland-parcels/report.json';
const coverage = [];
const report = { ok: false, state: 'running', startedAt: new Date().toISOString(), source: MARYLAND_PARCEL_SOURCE.id, coverage };
await mkdir('output/verification/maryland-parcels', { recursive: true });
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
await save();

const metadataResponse = await fetch(`${MARYLAND_PARCEL_SOURCE.layerUrl}?f=pjson`, { signal: AbortSignal.timeout(20000) });
assert.equal(metadataResponse.ok, true);
const metadata = await metadataResponse.json();
assert.equal(metadata.geometryType, 'esriGeometryPolygon');
assert.match(metadata.capabilities, /Query/);
assert.match(metadata.supportedQueryFormats, /geoJSON/i);
for (const forbidden of ['OWNADD1', 'OWNADD2', 'OWNCITY', 'OWNSTATE', 'OWNERZIP', 'OWNZIP2']) {
  assert.equal(QUERY_FIELDS.includes(forbidden), false, `${forbidden} must not be requested`);
}

// The service indexes Shape and OBJECTID, not JURSCODE. Exercise its spatial
// index through the real app query; neither DISTINCT nor a county-only WHERE
// is a bounded map lookup, even when resultRecordCount is one.
const fixture = JSON.parse(await readFile(new URL('../../tests/fixtures/maryland-parcel-spatial-samples.json', import.meta.url), 'utf8'));
assert.deepEqual(fixture.samples.map(sample => sample.code).sort(), Object.keys(MARYLAND_JURISDICTIONS).sort());
for (const sample of fixture.samples) {
  const name = MARYLAND_JURISDICTIONS[sample.code];
  const startedAt = Date.now();
  try {
    // Use the real provider, including its 250-record pages, two-page cap,
    // timeout, request headers and normalization. A smaller TOP-N query can
    // behave differently and does not establish the app's availability.
    const response = await loadMarylandParcels({ lat: sample.lat, lon: sample.lon, radiusM: 450 });
    assert.equal(response.status, 'ready', `${name}: the production provider returned no usable parcels`);
    const parcels = response.parcels;
    const parcel = parcels.find(parcel => parcel.jurisdictionCode === sample.code);
    assert.ok(parcel, `${name}: no usable geometry and stable identity in the expected jurisdiction`);
    coverage.push({ code: sample.code, name, status: 'SAMPLE_VERIFIED',
      sampleLocation: { lat: sample.lat, lon: sample.lon }, sampleGeometryDate: parcel.geometryDate || null,
      normalizedParcels: parcels.length, warnings: response.warnings, durationMs: Date.now() - startedAt });
  } catch (error) {
    coverage.push({ code: sample.code, name, status: 'FAILED', error: error.message, durationMs: Date.now() - startedAt });
  }
  await save();
  console.log(JSON.stringify(coverage.at(-1)));
}

Object.assign(report, {
  ok: coverage.length === 24 && coverage.every(sample => sample.status === 'SAMPLE_VERIFIED'),
  state: 'completed', completedAt: new Date().toISOString(),
  itemId: MARYLAND_PARCEL_SOURCE.itemId,
  sampleSource: fixture.source,
  evidenceScope: 'Bounded live geometry samples in all 24 jurisdictions; not exhaustive parcel completeness or physical loading performance',
  privacy: { requestedFields: QUERY_FIELDS, ownerFieldsRequested: false }
});
await save();
console.log(JSON.stringify(report, null, 2));
assert.equal(report.ok, true, 'Some jurisdiction geometry samples failed; see the retained per-jurisdiction report.');
