import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildWorldOverpassPlan, fetchOverpassJSON } from '../app/js/world/osm-loader.js';
import {
  compileTransportFacilityGraph,
  facilityClassification
} from '../app/js/transport/facility-compiler.js';
import { shortbreadFeatureTags } from '../app/js/world/shortbread-source.js';
import {
  physicalPublicationAllowed,
  profileSurfaceYAt,
  runwaySurfaceProfile
} from '../app/js/transport/facility-visuals.js';

const fixture = Object.freeze({
  _overpassSource: 'fixture',
  _overpassEndpoint: 'fixture://transport-facilities',
  elements: Object.freeze([
    { type: 'node', id: 1, lat: 39, lon: -76, tags: {} },
    { type: 'node', id: 2, lat: 39, lon: -75.999, tags: {} },
    { type: 'way', id: 10, nodes: [1, 2], tags: { aeroway: 'runway', ref: '09/27' } },
    { type: 'node', id: 11, lat: 39.001, lon: -76, tags: { aeroway: 'helipad', name: 'Mapped pad' } },
    { type: 'node', id: 3, lat: 38.999, lon: -76.001, tags: {} },
    { type: 'node', id: 4, lat: 38.999, lon: -76, tags: {} },
    { type: 'node', id: 5, lat: 38.998, lon: -76, tags: {} },
    { type: 'node', id: 6, lat: 38.999, lon: -76.001, tags: {} },
    { type: 'way', id: 20, nodes: [3, 4, 5, 6], tags: { leisure: 'marina', name: 'Mapped marina' } },
    { type: 'way', id: 21, nodes: [3, 4], tags: { man_made: 'pier' } },
    { type: 'relation', id: 30, center: { lat: 38.997, lon: -76 }, tags: { route: 'ferry', name: 'Mapped ferry relation' } }
  ])
});

test('the single primary query requests exact airport, civic, commerce, road, and maritime geometry', () => {
  const plan = buildWorldOverpassPlan({
    location: { lat: 39, lon: -76 }, roadsRadius: .02,
    featureRadiusScale: 1, poiRadiusScale: 1, buildingVisibleRadiusWorld: 1200,
    overpassTimeoutMs: 15000, loadStartedAt: 0, maxTotalLoadMs: 30000
  });
  assert.equal(plan.transportFacilityCacheMeta.kind, 'transport-facilities-v1');
  assert.match(plan.transportFacilityQuery, /\["aeroway"~"\^\(aerodrome\|heliport\|runway/);
  assert.match(plan.transportFacilityQuery, /\["leisure"="marina"\]/);
  assert.match(plan.transportFacilityQuery, /\["landuse"~"\^\(port\|harbour\)\$"\]/);
  assert.match(plan.transportFacilityQuery, /\["route"="ferry"\]/);
  assert.match(plan.transportFacilityQuery, /\["seamark:type"~"\^\(harbour\|berth\)\$"\]/);
  assert.equal((plan.transportFacilityQuery.match(/\[out:json\]/g) || []).length, 1);
  assert.match(plan.primaryQuery, /nwr\["aeroway"~"\^\(aerodrome\|heliport\|runway/);
  assert.match(plan.primaryQuery, /nwr\["amenity"~"\^\(police\|hospital\)\$"\]/);
  assert.match(plan.primaryQuery, /nwr\["shop"="convenience"\]/);
  assert.equal((plan.primaryQuery.match(/\[out:json\]/g) || []).length, 1);
  assert.ok(plan.transportFacilityCacheMeta.featureRadius >= .036, 'airport coverage cannot be clipped to a city-block radius');
});

test('the facility compiler preserves mapped geometry, provenance, completeness, and domains', () => {
  const graph = compileTransportFacilityGraph(fixture, { location: { lat: 39, lon: -76 }, scale: 100000 });
  assert.equal(graph.authority, 'compiled-mapped-transport-facilities');
  assert.equal(graph.coverage.bounded, true);
  assert.equal(graph.records.length, 5);
  assert.equal(graph.byDomain.aviation.length, 2);
  assert.equal(graph.byDomain.maritime.length, 3);
  const runway = graph.records.find(({ type }) => type === 'runway');
  assert.equal(runway.geometry.kind, 'path');
  assert.equal(runway.geometry.complete, true);
  assert.equal(runway.generatedActivity, false);
  assert.equal(runway.geometryAuthority, 'exact-openstreetmap');
  assert.equal(runway.exactPhysicalGeometry, true);
  assert.equal(runway.provenance.license, 'ODbL-1.0');
  const ferry = graph.records.find(({ type }) => type === 'ferry_route');
  assert.equal(ferry.geometry.kind, 'point');
  assert.equal(ferry.completeness, 'mapped-center-only');
  assert.equal(ferry.access, 'unknown');
});

test('unsupported tags do not become invented transport facilities', () => {
  assert.equal(facilityClassification({ amenity: 'parking' }), null);
  assert.equal(facilityClassification({ natural: 'water' }), null);
  assert.deepEqual(facilityClassification({ aeroway: 'gate' }), { domain: 'aviation', type: 'gate' });
  assert.deepEqual(facilityClassification({ harbour: 'yes' }), { domain: 'maritime', type: 'harbour' });
});

test('the worldwide Shortbread fallback preserves aviation and maritime meaning', () => {
  assert.deepEqual(
    shortbreadFeatureTags('streets', { kind: 'runway', surface: 'asphalt', ref: '10/28' }),
    {
      aeroway: 'runway', bridge: '', tunnel: '', layer: '', surface: 'asphalt',
      width: '', access: '', ref: '10/28', name: '', _sourceCompleteness: 'generalized'
    }
  );
  assert.equal(shortbreadFeatureTags('streets', { kind: 'runway' }).highway, undefined);
  assert.equal(shortbreadFeatureTags('street_polygons', { kind: 'taxiway' }).aeroway, 'taxiway');
  assert.equal(shortbreadFeatureTags('public_transport', { kind: 'aerodrome', iata: 'BWI' }).aeroway, 'aerodrome');
  assert.equal(shortbreadFeatureTags('public_transport', { kind: 'helipad' }).aeroway, 'helipad');
  assert.equal(shortbreadFeatureTags('public_transport', { kind: 'ferry_terminal' }).amenity, 'ferry_terminal');
  assert.equal(shortbreadFeatureTags('ferries', { name: 'Mapped route' }).route, 'ferry');
  assert.equal(shortbreadFeatureTags('pier_lines', { kind: 'pier' }).man_made, 'pier');
  assert.equal(shortbreadFeatureTags('pier_polygons', {}).man_made, 'pier');
});

test('world lifecycle owns facility fetch, graph, visuals, and teardown', async () => {
  const loader = await readFile(new URL('../app/js/world/load-roads.js', import.meta.url), 'utf8');
  const reset = await readFile(new URL('../app/js/world/load-reset.js', import.meta.url), 'utf8');
  assert.equal((loader.match(/'transport-facilities'/g) || []).length, 0,
    'airport geometry must not launch a competing Overpass request');
  assert.match(loader, /selectExactFacilityElements\(exactSupplementData\)/);
  assert.match(loader, /appCtx\.transportFacilityGraph = transportFacilityGraph/);
  assert.match(loader, /createTransportFacilityVisuals/);
  assert.match(loader, /runtimeState\.transportFacilities = loadMetrics\.transportFacilities/);
  assert.match(reset, /transportFacilityVisual\?\.dispose\?\.\(\)/);
  assert.match(reset, /transportFacilityGraph = null/);
  assert.doesNotMatch(loader, /live (ship|aircraft) occupancy/i);
});

test('generalized airport geometry is never physically published', () => {
  assert.equal(physicalPublicationAllowed({
    domain: 'aviation', geometryAuthority: 'generalized-vector', provenance: { provider: 'OpenStreetMap' }
  }), false);
  assert.equal(physicalPublicationAllowed({
    domain: 'aviation', geometryAuthority: 'exact-openstreetmap', provenance: { provider: 'OpenStreetMap' }
  }), true);
});

test('runway body, markings, and aircraft share a terrain-clearing surface profile', () => {
  const runway = {
    type: 'runway',
    attributes: { width: 40 },
    geometry: { points: [{ x: 0, z: 0 }, { x: 0, z: 120 }] }
  };
  const terrain = (x, z) => 2 + z * .01 + (Math.abs(x) > 15 ? 3 : 0);
  const profile = runwaySurfaceProfile(runway, terrain, 10);
  assert.ok(profile.length >= 13);
  for (const point of profile) {
    assert.ok(point.y >= terrain(20, point.z) + .089,
      'profile must clear the highest sampled runway edge, not only its center');
  }
  const surfaceY = profileSurfaceYAt([{ profile, width: 40 }], 0, 60);
  assert.ok(Number.isFinite(surfaceY));
  assert.ok(surfaceY >= terrain(20, 60) + .089);
  assert.equal(profileSurfaceYAt([{ profile, width: 40 }], 80, 60), null);
});

test('Overpass endpoint fallbacks are serial and never hedge concurrent requests', async () => {
  let active = 0;
  let maximumActive = 0;
  const calls = [];
  const fetchImpl = async (endpoint) => {
    calls.push(endpoint);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 8));
    active -= 1;
    if (endpoint === 'https://one.invalid') return { ok: false, status: 503 };
    return { ok: true, text: async () => JSON.stringify({ elements: [] }) };
  };
  const result = await fetchOverpassJSON(
    `[out:json];node(${Date.now()},0,0,0);out;`,
    4000,
    Infinity,
    null,
    {
      endpoints: ['https://one.invalid', 'https://two.invalid'],
      fetchImpl,
      staggerMs: 0
    }
  );
  assert.deepEqual(result.elements, []);
  assert.deepEqual(calls, ['https://one.invalid', 'https://two.invalid']);
  assert.equal(maximumActive, 1);
});
