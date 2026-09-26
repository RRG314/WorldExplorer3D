import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

// Source-component evidence: real weather modules and DOM, controlled HTTP reply
// order. This does not claim a full Earth journey or live provider availability.
const out = 'output/verification/weather-location-ui';
await fs.mkdir(out, { recursive: true });
const report = { ok: false, evidenceScope: 'weather source component with controlled provider replies', checks: [], errors: [] };
await fs.writeFile(`${out}/report.json`, JSON.stringify(report));
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4495, 4496] });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 350 } });
  page.on('pageerror', error => report.errors.push(String(error)));
  const requests = [];
  await page.route('https://api.open-meteo.com/**', route => { requests.push(route); });
  await page.route('https://nominatim.openstreetmap.org/**', route => {
    const polar = Number(new URL(route.request().url()).searchParams.get('lat')) < 0;
    return route.fulfill({ json: { address: { city: polar ? 'McMurdo Station' : 'Baltimore', country: polar ? 'Antarctica' : 'United States' } } });
  });
  await page.route('**/__weather-fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><title>Weather location component</title>
    <style>body{background:#101e29;color:#edf5fa;font:18px system-ui;padding:24px}button{font:inherit;margin:12px 12px 12px 0;padding:8px}#weatherPanel{border:1px solid #547080;padding:16px}#weatherMetaLine{font-size:14px}#hudClockDisplay{margin-top:12px}</style>
    <h2>Weather location component</h2><div id="weatherPanel"><div id="weatherLine"></div><div id="weatherTimeLine"></div><div id="weatherMetaLine"></div></div><div id="hudClockDisplay"></div>
    <button id="refresh">Refresh Baltimore</button><button id="switch">Switch to Antarctica</button>
    <script type="module">
    import * as THREE from '/node_modules/three/build/three.module.js';
    import {ctx} from '/app/js/shared-context.js?v=55';
    window.THREE=THREE;Object.assign(ctx,{ENV:{EARTH:'EARTH'},isEnv:()=>true,LOC:{lat:39,lon:-76},selLoc:'custom',customLoc:{name:'Baltimore'}});
    const weather=await import('/app/js/weather.js?v=12');window.fixture={ctx,weather,requests:[]};
    document.getElementById('refresh').onclick=()=>{window.fixture.requests.push(weather.refreshLiveWeather(true));};
    document.getElementById('switch').onclick=()=>{ctx.LOC={lat:-77,lon:166};ctx.customLoc={name:'McMurdo Station'};window.fixture.requests.push(weather.refreshLiveWeather(true));};
    window.fixtureReady=true;
    </script>` }));
  await page.goto(`http://127.0.0.1:${server.port}/__weather-fixture`);
  await page.waitForFunction(() => window.fixtureReady);
  const requestCount = async count => { const until = Date.now() + 5000; while (requests.length < count && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(requests.length, count); };
  const respond = (index, temperature) => requests[index].fulfill({ json: { current: { temperature_2m: temperature, weather_code: 0, is_day: 1 } } });
  await page.locator('#refresh').click(); await requestCount(1); await respond(0, 30);
  await page.waitForFunction(() => document.getElementById('weatherLine').textContent.includes('86°F'));
  report.checks.push('Baltimore weather reaches the actual weather DOM');
  await page.locator('#refresh').click(); await requestCount(2);
  await page.locator('#switch').click(); await requestCount(3);
  assert.match(await page.locator('#weatherLine').textContent(), /Loading live weather/);
  await page.screenshot({ path: `${out}/loading-new-location.png` });
  report.checks.push('The old temperature disappears while the new location is loading');
  await respond(2, -20);
  await page.waitForFunction(() => document.getElementById('weatherLine').textContent.includes('-4°F'));
  await respond(1, 30);
  await page.waitForFunction(() => window.fixture.ctx.liveWeatherState?.lat === -77);
  await page.evaluate(() => Promise.all(window.fixture.requests));
  assert.match(await page.locator('#weatherLine').textContent(), /-4°F/);
  const state = await page.evaluate(() => ({ weather: window.fixture.weather.getWeatherSnapshot(), place: window.fixture.ctx.livePlaceState }));
  assert.equal(state.weather.lat, -77); assert.equal(state.place.lat, -77);
  report.state = state;
  report.checks.push('The late Baltimore response cannot overwrite Antarctic weather or place');
  await page.screenshot({ path: `${out}/antarctica-after-stale-reply.png` });
  assert.deepEqual(report.errors, []); report.ok = true;
} catch (error) { report.error = String(error.stack || error); }
finally { await browser.close(); await server.close(); await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report));
if (!report.ok) process.exitCode = 1;
