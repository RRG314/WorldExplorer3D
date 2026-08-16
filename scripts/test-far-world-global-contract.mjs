import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const host = '127.0.0.1';
const server = await startStaticRootServer({
  rootDir,
  host,
  candidatePorts: [4183, 4184, 4185, 4186]
});
const baseUrl = `http://${host}:${server.port}`;

const locations = [
  { id: 'london', lat: 51.5074, lon: -0.1278, waterExpected: true },
  { id: 'miami', lat: 25.7617, lon: -80.1918, waterExpected: true },
  { id: 'tokyo', lat: 35.6762, lon: 139.6503, waterExpected: true },
  { id: 'sydney', lat: -33.8688, lon: 151.2093, waterExpected: true },
  { id: 'dubai', lat: 25.2048, lon: 55.2708, waterExpected: true },
  { id: 'amazon', lat: -3.4653, lon: -62.2159, waterExpected: true },
  { id: 'lake-tahoe', lat: 39.0968, lon: -120.0324, waterExpected: true, inlandExpected: true },
  { id: 'panama-canal', lat: 9.1657587, lon: -79.9436744, waterExpected: true, inlandExpected: true },
  { id: 'atlantic-ocean', lat: 30, lon: -40, waterExpected: true, oceanExpected: true },
  { id: 'helsinki', lat: 60.1699, lon: 24.9384, waterExpected: true },
  { id: 'sahara', lat: 31.1342, lon: -4.012 },
  { id: 'swiss-alps', lat: 46.5367, lon: 7.9626 },
  { id: 'iowa-farmland', lat: 42.08, lon: -93.87 },
  { id: 'nairobi', lat: -1.2864, lon: 36.8172 }
];

function geographicBounds(lat, lon, halfExtentMeters = 22000) {
  const latDelta = halfExtentMeters / 110540;
  const lonDelta = halfExtentMeters / Math.max(1000, 111320 * Math.cos(lat * Math.PI / 180));
  return {
    latN: Math.min(85, lat + latDelta),
    latS: Math.max(-85, lat - latDelta),
    lonW: lon - lonDelta,
    lonE: lon + lonDelta
  };
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/app/js/world/shortbread-source.js`, { waitUntil: 'domcontentloaded' });
  const results = [];

  for (const location of locations) {
    const result = await page.evaluate(async ({ spec, bounds }) => {
      const { loadFarMappedWaterContext } = await import('/app/js/terrain/far-field-mapped-context.js?v=2');
      const startedAt = performance.now();
      const context = await loadFarMappedWaterContext(bounds);
      const kinds = {};
      let points = 0;
      let holes = 0;
      for (const area of context.waterAreas) {
        kinds[area.kind] = (kinds[area.kind] || 0) + 1;
        points += area.outer.length;
        for (const hole of area.holes) {
          holes += 1;
          points += hole.length;
        }
      }
      return {
        id: spec.id,
        durationMs: Math.round(performance.now() - startedAt),
        requestedTiles: context.waterTilesRequested,
        loadedTiles: context.waterTilesLoaded,
        polygons: context.waterAreas.length,
        points,
        holes,
        kinds,
        identities: context.waterAreas.map((area) => area.identity),
        invalidAreas: context.waterAreas.filter((area) => (
          !area.identity || area.outer.length < 4 ||
          (area.kind !== 'ocean' && area.spanMeters < 200)
        )).length
      };
    }, { spec: location, bounds: geographicBounds(location.lat, location.lon) });

    assert.ok(result.requestedTiles > 0 && result.requestedTiles <= 49, `${location.id}: unbounded far-water tile request`);
    assert.equal(result.loadedTiles, result.requestedTiles, `${location.id}: incomplete far-water tile coverage`);
    assert.equal(result.invalidAreas, 0, `${location.id}: invalid or sub-grid far-water polygon`);
    assert.equal(result.kinds.glacier || 0, 0, `${location.id}: glacier was incorrectly published as water`);
    assert.equal(new Set(result.identities).size, result.identities.length, `${location.id}: duplicate far-water publication identity`);
    assert.ok(result.polygons <= 2000, `${location.id}: excessive far-water polygon budget (${result.polygons})`);
    assert.ok(result.points <= 100000, `${location.id}: excessive far-water vertex budget (${result.points})`);
    if (location.waterExpected) assert.ok(result.polygons > 0, `${location.id}: mapped water was not retained`);
    if (location.oceanExpected) assert.ok((result.kinds.ocean || 0) > 0, `${location.id}: mapped ocean was not retained`);
    if (location.inlandExpected) {
      const inland = Object.entries(result.kinds).some(([kind, count]) => kind !== 'ocean' && count > 0);
      assert.equal(inland, true, `${location.id}: mapped inland water was not retained`);
    }
    delete result.identities;
    results.push(result);
  }

  console.log(JSON.stringify({
    ok: true,
    locations: results,
    policy: {
      fixedHalfExtentMeters: 22000,
      actorDrivenStreaming: false,
      elevationClassifiesWater: false,
      waterSource: 'openstreetmap-shortbread-polygons'
    }
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
