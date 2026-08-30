import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4250').replace(/\/$/, '');
const outputDir = 'output/verification/airports-worldwide-current';
const airports = Object.freeze([
  Object.freeze({ id: 'bwi', name: 'Baltimore-Washington International Airport', lat: 39.1747196, lon: -76.6707551, bounds: [39.1578912, 39.1949606, -76.7154717, -76.6449952], airportClass: 'international', iata: 'BWI', icao: 'KBWI', country: 'United States', countryCode: 'us' }),
  Object.freeze({ id: 'lax', name: 'Los Angeles International Airport', lat: 33.9416, lon: -118.4085, bounds: [33.9187, 33.956, -118.444, -118.38], airportClass: 'international', iata: 'LAX', icao: 'KLAX', country: 'United States', countryCode: 'us' }),
  Object.freeze({ id: 'heathrow', name: 'London Heathrow Airport', lat: 51.47, lon: -0.4543, bounds: [51.455, 51.488, -0.511, -0.418], airportClass: 'international', iata: 'LHR', icao: 'EGLL', country: 'United Kingdom', countryCode: 'gb' }),
  Object.freeze({ id: 'haneda', name: 'Tokyo Haneda Airport', lat: 35.5494, lon: 139.7798, bounds: [35.523, 35.57, 139.733, 139.827], airportClass: 'international', iata: 'HND', icao: 'RJTT', country: 'Japan', countryCode: 'jp' }),
  Object.freeze({ id: 'telluride', name: 'Telluride Regional Airport', lat: 37.9538, lon: -107.9085, bounds: [37.946, 37.961, -107.921, -107.898], airportClass: 'public', iata: 'TEX', icao: 'KTEX', country: 'United States', countryCode: 'us' })
]);
const requestedIds = new Set(String(process.env.WE3D_AIRPORTS || '').split(',').map((value) => value.trim()).filter(Boolean));
const selectedAirports = requestedIds.size ? airports.filter(({ id }) => requestedIds.has(id)) : airports;
assert.ok(selectedAirports.length, 'No matching airport journeys were selected.');

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const reports = [];

try {
  for (const airport of selectedAirports) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const pageErrors = [];
    const failedLocalResources = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
    page.on('response', (response) => {
      if (response.url().startsWith(baseUrl) && response.status() >= 400) {
        failedLocalResources.push({ status: response.status(), url: response.url() });
      }
    });

    await page.route('https://nominatim.openstreetmap.org/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          place_id: `${airport.id}-airport`,
          osm_type: 'way',
          osm_id: `${airport.id}-airport`,
          lat: String(airport.lat),
          lon: String(airport.lon),
          category: 'aeroway',
          type: 'aerodrome',
          name: airport.name,
          display_name: `${airport.name}, ${airport.country}`,
          boundingbox: airport.bounds.map(String),
          namedetails: { name: airport.name },
          address: {
            aerodrome: airport.name,
            country: airport.country,
            country_code: airport.countryCode
          },
          extratags: {
            aerodrome: airport.airportClass,
            iata: airport.iata,
            icao: airport.icao
          }
        }])
      });
    });

    try {
      const params = new URLSearchParams({ diagnostics: '1' });
      await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
      await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
      const searchInput = page.locator('#globeLocationSearch');
      await searchInput.waitFor({ state: 'visible', timeout: 30_000 });
      await searchInput.fill(airport.name);
      await page.locator('#globeLocationSearchBtn').click();
      const searchResult = page.locator('#globeLocationSearchResults [role="option"]').first();
      await searchResult.waitFor({ state: 'visible', timeout: 30_000 });
      await searchResult.click();
      await page.locator('#globeSelectorStartBtn').click();
      await page.waitForFunction(() => {
        const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
        return diagnostics?.gameStarted && !diagnostics.worldLoading &&
          diagnostics?.worldLoad?.status === 'ready';
      }, null, { timeout: 180_000 });
      const later = page.getByRole('button', { name: 'Later', exact: true }).first();
      if (await later.isVisible().catch(() => false)) await later.click();

      assert.equal(await page.evaluate(() => globalThis.__WE3D_AVIATION_SUPPORT__?.moveNear()), true);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${outputDir}/${airport.id}-aircraft.png`, fullPage: true });
      assert.equal(await page.evaluate(() => globalThis.__WE3D_AVIATION_SUPPORT__?.moveNearRunway()), true);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${outputDir}/${airport.id}-airfield.png`, fullPage: true });
      assert.equal(await page.evaluate(() => globalThis.__WE3D_AVIATION_SUPPORT__?.openHub('aircraft')), true);
      await page.waitForSelector('.airport-hub[open]', { timeout: 10_000 });
      const hubText = await page.locator('.airport-hub').innerText();
      await page.screenshot({ path: `${outputDir}/${airport.id}-hub.png`, fullPage: true });

      const diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
      const aviation = diagnostics?.aviation || {};
      const classes = new Set(aviation.catalogIds || []);
      const checks = Object.freeze({
        exactAirportGeometry: diagnostics?.worldLoad?.airportGeometry?.status === 'loaded',
        sharedAirportLayout: aviation.airportLayoutAuthority === 'compiled-airport-operational-layout',
        mappedRunwayAuthority: aviation.mappedRunway === true &&
          aviation.generatedRunwayFallback === false && aviation.mappedRunwayCount >= 1,
        boundedFleet: aviation.fleetCount <= 24 && aviation.publishedStandCount === aviation.fleetCount,
        scaleAppropriateDensity: aviation.airportScale === 'major'
          ? aviation.fleetCount >= 14
          : aviation.airportScale === 'regional'
            ? aviation.fleetCount >= 7
            : aviation.fleetCount >= 5,
        variedFleet: classes.size >= 4,
        everyAircraftPlayable: aviation.playableCount === aviation.fleetCount,
        solidAircraft: (aviation.vehicles || []).every((vehicle) => vehicle.collisionColliderCount >= 1),
        groundAndFlightActivity: aviation.parkedAircraftCount > 0 &&
          (aviation.vehicles || []).some((vehicle) => vehicle.flightTrafficState || vehicle.traffic),
        airportJourneyAvailable: /Where do you want to fly\?/i.test(hubText) && /Pilot/i.test(hubText) && /Passenger/i.test(hubText),
        scaleAppropriateFleet: airport.id === 'lax'
          ? aviation.airportScale === 'major' && (aviation.catalogIds || []).includes('long-range-airliner')
          : airport.id === 'telluride'
            ? aviation.airportScale !== 'major' && !(aviation.catalogIds || []).includes('long-range-airliner')
            : aviation.airportScale === 'major' && (aviation.catalogIds || []).includes('long-range-airliner'),
        noRuntimeErrors: (diagnostics?.runtimeErrors || []).length === 0,
        noPageErrors: pageErrors.length === 0,
        noFailedLocalResources: failedLocalResources.length === 0
      });
      const report = {
        airport,
        ok: Object.values(checks).every(Boolean),
        checks,
        aviation: {
          fleetCount: aviation.fleetCount,
          airportScale: aviation.airportScale,
          playableCount: aviation.playableCount,
          parkedAircraftCount: aviation.parkedAircraftCount,
          boardableAircraftCount: aviation.boardableAircraftCount,
          mappedAnchorCount: aviation.mappedAnchorCount,
          mappedRunwayCount: aviation.mappedRunwayCount,
          mappedStandCount: aviation.mappedStandCount,
          publishedStandCount: aviation.publishedStandCount,
          generatedStandCount: aviation.generatedStandCount,
          catalogIds: aviation.catalogIds
        },
        pageErrors,
        failedLocalResources
      };
      reports.push(report);
      console.log(JSON.stringify(report, null, 2));
      assert.equal(report.ok, true, `${airport.name} did not meet the shared airport experience.`);
    } catch (error) {
      const diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.()).catch(() => null);
      await page.screenshot({ path: `${outputDir}/${airport.id}-failure.png`, fullPage: true }).catch(() => {});
      await fs.writeFile(`${outputDir}/${airport.id}-failure.json`, JSON.stringify({
        airport,
        error: String(error?.stack || error),
        diagnostics,
        pageErrors,
        failedLocalResources
      }, null, 2));
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const result = { ok: reports.length === selectedAirports.length && reports.every((report) => report.ok), reports };
await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ok: result.ok, airports: reports.map(({ airport, ok, aviation }) => ({ airport: airport.name, ok, ...aviation })) }, null, 2));
assert.equal(result.ok, true, 'Worldwide airport verification failed.');
