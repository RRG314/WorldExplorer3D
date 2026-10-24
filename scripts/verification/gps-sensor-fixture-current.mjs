import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import {closeOwnedBrowser} from './owned-browser.mjs';
import { startStaticServer } from './static-server.mjs';
import { installGpsSensorFixture } from './gps-sensor-fixture.mjs';

const server = await startStaticServer({ rootDir: process.cwd(), ports: [4494, 4495] });
const owned=await chromium.launchServer({channel:'chrome',headless:true});
const browser=await chromium.connect(owned.wsEndpoint());
const out=process.env.WE3D_QA_OUTPUT||'output/verification/gps-sensor-fixture';
try {
  const page = await browser.newPage();
  const fix = { latitude: 39.2904, longitude: -76.6122, accuracy: 6, speed: 0 };
  const sensor = await installGpsSensorFixture(page, fix);
  await page.goto(`http://127.0.0.1:${server.port}/404.html`);
  await page.evaluate(() => {
    globalThis.sensorEvents = [];
    globalThis.sensorWatch = navigator.geolocation.watchPosition(
      position => sensorEvents.push({ kind: 'fix', timestamp: position.timestamp, accuracy: position.coords.accuracy }),
      error => sensorEvents.push({ kind: 'error', code: error.code })
    );
  });
  for (let index = 0; index < 3; index++) {
    await page.waitForTimeout(30);
    await sensor.send('Emulation.setGeolocationOverride', fix);
  }
  const continuous = await page.evaluate(() => [...sensorEvents]);
  assert.equal(continuous.length, 4);
  assert.ok(continuous.every(event => event.kind === 'fix' && event.accuracy === 6));
  assert.ok(continuous.at(-1).timestamp > continuous[0].timestamp);
  await sensor.fail(2);
  await sensor.send('Emulation.setGeolocationOverride', { ...fix, accuracy: 60 });
  const interrupted = await page.evaluate(() => [...sensorEvents]);
  assert.deepEqual(interrupted.slice(-2).map(event => event.kind), ['error', 'fix']);
  assert.equal(interrupted.at(-1).accuracy, 60);
  await page.evaluate(() => navigator.geolocation.clearWatch(sensorWatch));
  await sensor.send('Emulation.setGeolocationOverride', fix);
  assert.equal(await page.evaluate(() => sensorEvents.length), interrupted.length);
  const report = { ok: true, scope: 'simulated browser sensor API only; not device GPS', checks: { continuousFixesWithoutArtificialErrors: true, realTimestampsAdvance: true, explicitFailureDelivered: true, poorAccuracyPreserved: true, clearWatchStopsDelivery: true } };
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(out+'/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { try{await closeOwnedBrowser(owned);}finally{await server.close();} }
