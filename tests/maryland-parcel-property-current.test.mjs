import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

import {
  MARYLAND_JURISDICTIONS,
  QUERY_FIELDS,
  buildMarylandParcelQueryUrl,
  buildMarylandParcelIdsQueryUrl,
  buildMarylandParcelFeaturesQueryUrl,
  normalizeMarylandParcelFeature,
  parcelGameValue,
  pointInGeometry
} from '../app/js/gis/maryland-parcel-core.js';
import { clearMarylandParcelCache, loadMarylandParcels, marylandParcelProviderSnapshot } from '../app/js/gis/maryland-parcel-provider.js';
import { makeParcelPropertyCandidates, parcelBuildPermissionAt } from '../app/js/real-estate/parcel-property-model.js';

const require = createRequire(import.meta.url);
const { normalizeProperty, propertyBaseValue } = require('../functions/property-authority.js');

function feature(overrides = {}) {
  return {
    type: 'Feature',
    properties: {
      OBJECTID: 1, JURSCODE: 'BACI', POLYID: '03-0000123456789',
      ADDRESS: '100 Test Street', CITY: 'Baltimore', ZIPCODE: '21201',
      LU: 'R', DESCLU: 'Residential', ACRES: 0.25, POLYACRES: 0.25,
      NFMTTLVL: 315000, POLYDATE: '2024DEC', SDATDATE: '2026Q1',
      OWNADD1: 'must never leave the provider response', OWNERNAME: 'must never load',
      ...overrides
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-76.6125, 39.2901], [-76.6119, 39.2901], [-76.6119, 39.2907],
        [-76.6125, 39.2907], [-76.6125, 39.2901]
      ]]
    }
  };
}

test('the statewide resolver lists all 23 counties and Baltimore City', () => {
  assert.equal(Object.keys(MARYLAND_JURISDICTIONS).length, 24);
  assert.equal(MARYLAND_JURISDICTIONS.BACI, 'Baltimore City');
  assert.equal(MARYLAND_JURISDICTIONS.MONT, 'Montgomery County');
  assert.equal(MARYLAND_JURISDICTIONS.WORC, 'Worcester County');
});

test('parcel requests are bounded and never request personal owner fields', () => {
  const url = new URL(buildMarylandParcelQueryUrl({ lat: 39.2904, lon: -76.6122, radiusM: 450 }));
  assert.equal(url.searchParams.get('resultRecordCount'), '250');
  assert.equal(url.searchParams.get('inSR'), '4326');
  assert.equal(url.searchParams.get('outSR'), '4326');
  assert.match(url.searchParams.get('where'), /ACCTID <> 'ROW'/);
  assert.deepEqual(url.searchParams.get('outFields').split(','), [...QUERY_FIELDS]);
  assert.equal(QUERY_FIELDS.some((field) => /^OWN/i.test(field)), false);
  assert.equal(url.searchParams.get('outFields').includes('ACCTID'), false);
});

test('normalization creates a stable privacy-safe parcel record with authoritative provenance', () => {
  const parcel = normalizeMarylandParcelFeature(feature());
  const repeat = normalizeMarylandParcelFeature(feature({ OBJECTID: 999 }));
  assert.equal(parcel.parcelId, repeat.parcelId);
  assert.match(parcel.parcelId, /^md:baci:/);
  assert.equal(parcel.worldPropertyId, `parcel:${parcel.parcelId}`);
  assert.equal(parcel.address.formatted, '100 Test Street, Baltimore, Maryland, 21201');
  assert.equal(parcel.parcelAreaSqM, 1012);
  assert.equal(parcel.provenance.sourceId, 'maryland-imap-parcels');
  assert.equal('OWNERNAME' in parcel, false);
  assert.equal('OWNADD1' in parcel, false);
  assert.equal(pointInGeometry(-76.6122, 39.2904, parcel.geometry), true);
  assert.equal(pointInGeometry(-76.62, 39.30, parcel.geometry), false);
});

test('every jurisdiction code normalizes through the same statewide provider contract', () => {
  for (const code of Object.keys(MARYLAND_JURISDICTIONS)) {
    const parcel = normalizeMarylandParcelFeature(feature({ JURSCODE: code, POLYID: `${code}-sample` }));
    assert.ok(parcel, `${code} should normalize`);
    assert.equal(parcel.jurisdictionName, MARYLAND_JURISDICTIONS[code]);
  }
});

test('parcel association groups multiple buildings and keeps vacant land as a property', () => {
  const occupied = normalizeMarylandParcelFeature(feature());
  const vacant = normalizeMarylandParcelFeature({
    ...feature({ POLYID: '03-vacant', ADDRESS: null, ACRES: 1.5, DESCLU: 'Agricultural' }),
    geometry: { type: 'Polygon', coordinates: [[
      [-76.6205, 39.2901], [-76.6199, 39.2901], [-76.6199, 39.2907],
      [-76.6205, 39.2907], [-76.6205, 39.2901]
    ]] }
  });
  const buildings = [
    { id: 'a', worldPropertyId: 'world:osm:way:1', sourceBuildingId: 'osm:way:1', sourceAuthority: 'openstreetmap', kind: 'House', buildingType: 'house', area: 80, levels: 2, storageCapacity: 16, x: 0, y: 0, z: 0, lat: 39.2903, lon: -76.6123, distance: 0 },
    { id: 'b', worldPropertyId: 'world:osm:way:2', sourceBuildingId: 'osm:way:2', sourceAuthority: 'openstreetmap', kind: 'Garage', buildingType: 'garage', area: 30, levels: 1, storageCapacity: 12, x: 4, y: 0, z: 4, lat: 39.2905, lon: -76.6121, distance: 5 }
  ];
  const result = makeParcelPropertyCandidates([occupied, vacant], buildings, {
    actor: { x: 0, z: 0 }, locationId: 'baltimore', locationLabel: 'Baltimore',
    geoToWorld: (lat, lon) => ({ x: (lon + 76.6122) * 100000, z: (39.2904 - lat) * 100000 }),
    heightAt: () => 3
  });
  const home = result.candidates.find((candidate) => candidate.parcelId === occupied.parcelId);
  const land = result.candidates.find((candidate) => candidate.parcelId === vacant.parcelId);
  assert.equal(home.buildingCount, 2);
  assert.equal(home.footprintArea, 110);
  assert.deepEqual(home.associatedBuildingIds, ['osm:way:1', 'osm:way:2']);
  assert.equal(land.hasStructures, false);
  assert.equal(result.vacantParcelCount, 1);
  assert.equal(result.fallbackBuildingCount, 0);
});

test('parcel valuation is deterministic and matches the transaction authority', () => {
  const parcel = normalizeMarylandParcelFeature(feature());
  const buildings = [{ area: 80, levels: 2 }];
  const clientValue = parcelGameValue(parcel, buildings);
  const serverValue = propertyBaseValue({
    propertyId: parcel.worldPropertyId, parcelId: parcel.parcelId,
    parcelAuthority: parcel.sourceAuthority, parcelAreaSqM: parcel.parcelAreaSqM,
    footprintArea: 80, levels: 2, sourceAssessment: parcel.sourceAssessment,
    landUseCode: parcel.landUseCode, landUseDescription: parcel.landUseDescription,
    buildingType: 'house'
  });
  assert.equal(clientValue, serverValue);
  assert.equal(parcelGameValue(parcel, buildings), clientValue);
});

test('the property normalizer accepts consistent provider identifiers and rejects mismatched identifiers', () => {
  const parcel = normalizeMarylandParcelFeature(feature());
  const input = {
    propertyId: parcel.worldPropertyId, parcelId: parcel.parcelId,
    sourceParcelId: parcel.sourceParcelId, parcelAuthority: parcel.sourceAuthority,
    jurisdictionCode: parcel.jurisdictionCode, jurisdictionName: parcel.jurisdictionName,
    locationId: 'baltimore:39.2904:-76.6122', label: '100 Test Street',
    buildingType: 'house', area: 80, footprintArea: 80, levels: 2,
    parcelAreaSqM: parcel.parcelAreaSqM, sourceAssessment: parcel.sourceAssessment,
    landUseCode: parcel.landUseCode, landUseDescription: parcel.landUseDescription,
    x: 0, z: 0
  };
  const normalized = normalizeProperty(input);
  assert.equal(normalized.parcelId, parcel.parcelId);
  assert.equal(normalized.baseValue, parcelGameValue(parcel, [{ area: 80, levels: 2 }]));
  assert.throws(() => normalizeProperty({ ...input, parcelId: 'md:baci:forged', propertyId: 'parcel:md:baci:forged' }), /invalid_property/);
  assert.throws(() => normalizeProperty({ ...input, parcelAuthority: 'unknown-provider' }), /invalid_property/);
});

test('Quick Build uses parcel ownership only when parcel evidence is ready', () => {
  const parcel = normalizeMarylandParcelFeature(feature());
  const property = { parcelId: parcel.parcelId, worldPropertyId: parcel.worldPropertyId, parcelGeometry: parcel.geometry };
  assert.equal(parcelBuildPermissionAt({ status: 'failed', candidates: [property], homes: [], lat: 39.2904, lon: -76.6122 }).allowed, true);
  assert.equal(parcelBuildPermissionAt({ status: 'ready', candidates: [property], homes: [], lat: 39.2904, lon: -76.6122 }).allowed, false);
  assert.equal(parcelBuildPermissionAt({ status: 'ready', candidates: [property], homes: [{ parcelId: parcel.parcelId }], lat: 39.2904, lon: -76.6122 }).allowed, true);
});

function withSpatialIndex(fetchFeatures) {
  return async (url, options) => new URL(url).searchParams.get('returnIdsOnly') === 'true'
    ? { ok: true, json: async () => ({ objectIds: [1] }) }
    : fetchFeatures(url, options);
}

test('provider failure returns no fabricated parcel and does not poison the bounded cache', async () => {
  clearMarylandParcelCache();
  await assert.rejects(() => loadMarylandParcels({ lat: 39.2904, lon: -76.6122 }, {
    fetchImpl: async () => { throw new Error('offline'); }, force: true
  }), /offline/);
  const response = await loadMarylandParcels({ lat: 39.2904, lon: -76.6122 }, {
    fetchImpl: withSpatialIndex(async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature()] }) })), force: true
  });
  assert.equal(response.status, 'ready');
  assert.equal(response.parcels.length, 1);
});


const providerResponse = () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature()] }) });

test('nearby but different parcel bounds never reuse another location response', async () => {
  clearMarylandParcelCache();
  const calls = [];
  const fetchImpl = async url => { calls.push(url); return withSpatialIndex(async () => providerResponse())(url); };
  const first = { lat: 39.2904, lon: -76.6122, radiusM: 450 };
  const second = { ...first, lat: 39.2914 };
  await loadMarylandParcels(first, { fetchImpl });
  const result = await loadMarylandParcels(second, { fetchImpl });
  assert.equal(calls.length, 4);
  assert.equal(result.query.lat, second.lat);
  assert.notEqual(new URL(calls[0]).searchParams.get('geometry'), new URL(calls[2]).searchParams.get('geometry'));
});

test('identical parcel requests share an active fetch and reuse its completed cache', async () => {
  clearMarylandParcelCache();
  let resolve, calls = 0;
  const fetchImpl = withSpatialIndex(() => { calls++; return new Promise(done => { resolve = done; }); });
  const request = { lat: 39.2904, lon: -76.6122 };
  const first = loadMarylandParcels(request, { fetchImpl });
  const second = loadMarylandParcels(request, { fetchImpl });
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  resolve(providerResponse());
  await Promise.all([first, second]);
  const cached = await loadMarylandParcels(request, { fetchImpl });
  assert.equal(cached.fromCache, true);
  assert.equal(calls, 1);
  assert.equal(marylandParcelProviderSnapshot().activeRequests, 0);
});

test('an older parcel request cannot erase the active forced refresh', async () => {
  clearMarylandParcelCache();
  const pending = [];
  const fetchImpl = withSpatialIndex(() => new Promise(resolve => pending.push(resolve)));
  const request = { lat: 39.2904, lon: -76.6122 };
  const old = loadMarylandParcels(request, { fetchImpl });
  const fresh = loadMarylandParcels(request, { fetchImpl, force: true });
  await new Promise(setImmediate);
  pending[0](providerResponse());
  await old;
  const activeDuringRefresh = marylandParcelProviderSnapshot().activeRequests;
  pending[1](providerResponse());
  await fresh;
  assert.equal(activeDuringRefresh, 1);
});

test('a late older parcel response cannot replace newer refreshed data', async () => {
  clearMarylandParcelCache();
  const pending = [];
  const fetchImpl = withSpatialIndex(() => new Promise(resolve => pending.push(resolve)));
  const request = { lat: 39.2904, lon: -76.6122 };
  const old = loadMarylandParcels(request, { fetchImpl });
  const fresh = loadMarylandParcels(request, { fetchImpl, force: true });
  await new Promise(setImmediate);
  pending[1]({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature({ POLYID: 'newer' })] }) });
  const latest = await fresh;
  pending[0](providerResponse());
  await old;
  const cached = await loadMarylandParcels(request, { fetchImpl });
  assert.equal(cached.parcels[0].parcelId, latest.parcels[0].parcelId);
});


test('spatial ID batches avoid sorted spatial pagination while retaining filters and privacy', async () => {
  clearMarylandParcelCache();
  const requests = [];
  const response = await loadMarylandParcels({ lat: 39.2904, lon: -76.6122 }, { fetchImpl: async url => {
    const params = new URL(url).searchParams;
    requests.push(params);
    assert.equal(params.has('orderByFields'), false);
    assert.equal(params.has('resultOffset'), false);
    assert.match(params.get('where'), /ACCTID <> 'ROW'/);
    if (params.get('returnIdsOnly') === 'true') {
      assert.ok(params.get('geometry'));
      assert.equal(params.has('outFields'), false);
      return { ok: true, json: async () => ({ objectIds: [...Array.from({ length: 501 }, (_, i) => 501 - i), 1, -1, null] }) };
    }
    assert.equal(params.has('geometry'), false);
    assert.deepEqual(params.get('outFields').split(','), [...QUERY_FIELDS]);
    const ids = params.get('objectIds').split(',').map(Number);
    assert.equal(ids.length, 250);
    return { ok: true, json: async () => ({ features: ids.map(id => feature({ OBJECTID: id, POLYID: String(id) })) }) };
  } });
  assert.equal(requests.length, 3);
  assert.equal(response.parcels.length, 500);
  assert.equal(response.warnings.length, 1);
  assert.equal(requests[1].get('objectIds').split(',')[0], '1');
  assert.equal(requests[2].get('objectIds').split(',').at(-1), '500');
});

test('empty spatial index skips geometry requests and invalid batches fail closed', async () => {
  let calls = 0;
  const result = await loadMarylandParcels({ lat: 39.291, lon: -76.612 }, { force: true,
    fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ objectIds: [] }) }; } });
  assert.equal(calls, 1);
  assert.equal(result.status, 'no-coverage-at-point');
  assert.throws(() => buildMarylandParcelFeaturesQueryUrl({ lat: 39.29, lon: -76.61 }, [NaN]), /valid parcel/);
  await assert.rejects(loadMarylandParcels({ lat: 39.291, lon: -76.612 }, { force: true,
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), /spatial object-ID index/);
});
