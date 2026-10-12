import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, statfs } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { closeOwnedBrowser } from './verification/owned-browser.mjs';
import { walkResearchStationWithInput } from './verification/normal-research-walk.mjs';
import { collectBrowserGraphicsErrors } from './verification/browser-graphics-errors.mjs';

const url = new URL(process.argv[2]);
assert.match(url.hostname, /^we3d-staging-20260712--[a-z0-9-]+\.web\.app$/);
assert.equal(url.protocol, 'https:');
const { version } = JSON.parse(await readFile('package.json'));
const assets = `assets/gallery/${version.split('.').slice(0, 2).join('.')}`;
const earthOnly = process.argv.includes('--earth');
const out = `output/production-readiness-20261012/${earthOnly ? 'earth' : 'marine'}-capture`;
await mkdir(out, { recursive: true });
await mkdir(assets, { recursive: true });
const disk = await statfs('.');
assert.ok(disk.bavail * disk.bsize > 2 * 1024 ** 3, '2 GiB free space required');
const report = { ok: false, capturedAt: new Date().toISOString(), sourceUrl: url.origin,
  scope: 'Ordinary hosted Chrome, live providers, visible UI and keyboard/mouse controls. No debug attestation, provider interception, synthetic camera, controller stepping or test-only scene.', images: [], errors: [] };
let owned, browser, page;
async function capture(id, title, alt) {
  const file = `${assets}/${id}.webp`;
  await sharp(await page.screenshot()).webp({ quality: 90 }).toFile(file);
  const bytes = await readFile(file), size = page.viewportSize();
  report.images.push({ id, title, alt, file, ...size,
    sha256: createHash('sha256').update(bytes).digest('hex'), sourceBuild: report.sourceBuild,
    capturedAt: new Date().toISOString(),
    provenance: 'Normal-input browser runtime capture; no synthetic camera or test-only scene.' });
}
try {
  owned = await chromium.launchServer({ channel: 'chrome', headless: false });
  browser = await chromium.connect(owned.wsEndpoint());
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', error => report.errors.push(error.message));
  collectBrowserGraphicsErrors(page, report.errors);
  await page.goto(`${url.origin}/app/?launch=earth&gm=free&loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&mode=walking`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__, null, { timeout: 120000 });
  const build = await page.evaluate(() => fetch('/build-manifest.json').then(r => r.json()));
  assert.equal(build.firebaseProjectId, 'we3d-staging-20260712');
  report.sourceBuild = build.buildId;
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.evaluate(async () => { globalThis.marineCtx = (await import('/app/js/shared-context.js?v=55')).ctx; });
  if (earthOnly) {
    await page.locator('#globeSelectorStartBtn').waitFor({state:'visible'});
    await page.waitForTimeout(3500);
    await capture('world-entry','Choose a place','World Explorer 3D location selector with Baltimore selected on the globe');
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
    await capture('world-entry-phone','Choose a destination','The globe and destination controls at phone width');
    await page.setViewportSize({width:1600,height:900});
    await page.locator('#globeSelectorStartBtn').click();
    await page.waitForFunction(()=>{
      const d=getWorldExplorerRuntimeDiagnostics();return d.gameStarted&&!d.worldLoading&&d.worldCounts?.buildings>0&&d.worldCounts?.roads>0&&!document.getElementById('loading')?.classList.contains('show');
    },null,{timeout:240000});
    const time=page.locator('#quickTimeOfDay');
    for(let i=0;i<5&&await time.getAttribute('data-mode')!=='day';i++)await time.click();
    assert.equal(await time.getAttribute('data-mode'),'day');
    const skip=page.getByRole('button',{name:'Skip guide',exact:true});if(await skip.isVisible())await skip.click();
    if(await page.locator('#hudToggleBtn').isVisible())await page.locator('#hudToggleBtn').click();
    await page.waitForTimeout(1500);
    await capture('walking','Explore on foot','Street exploration on foot with mapped buildings in Baltimore');
    async function travel(mode,selector){
      await page.locator('#travelBtn').click();await page.locator(selector).click();
      await page.waitForFunction(mode=>getWorldExplorerRuntimeDiagnostics().activeActor?.mode===mode,mode,{timeout:20000});await page.waitForTimeout(1000);
    }
    await travel('drive','#fDriving');
    await capture('driving','Drive the city','The lighter BMW E34 on a mapped Baltimore street');
    await travel('drone','#fDrone');
    await page.keyboard.down('Space');try{await page.waitForTimeout(2000);}finally{await page.keyboard.up('Space');}
    await page.waitForTimeout(500);
    await capture('drone','See the city from above','Drone view over mapped downtown Baltimore buildings and streets');
    await travel('plane','#fPlane');
    await page.keyboard.down('KeyW');try{await page.waitForTimeout(2000);}finally{await page.keyboard.up('KeyW');}
    await page.waitForTimeout(500);
    await capture('flight','Take flight','A player aircraft flying above Baltimore through the normal flight camera');
  } else {
  await page.locator('#coralResearchStart').click();
  await page.waitForFunction(() => marineCtx.boatDeck?.active && !marineCtx.titleLaunchPending, null, { timeout: 120000 });
  const time = page.locator('#quickTimeOfDay');
  for (let i = 0; i < 5 && await time.getAttribute('data-mode') !== 'day'; i++) await time.click();
  assert.equal(await time.getAttribute('data-mode'), 'day');
  await page.waitForTimeout(1200);
  await capture('research-deck', 'Your research vessel', 'Walking on the licensed research vessel beside its enclosed laboratories');
  report.walks = [];
  report.walks.push(await walkResearchStationWithInput(page, 'galley'));
  await page.locator('#researchDeckAction').click();
  await page.getByLabel('Carried galley provisions').waitFor();
  await capture('research-interior', 'Life aboard', 'Inside the research vessel galley with carried provisions available');
  // Selecting a destination closes the station panel through its normal UI.
  report.walks.push(await walkResearchStationWithInput(page, 'chart'));
  await page.locator('#researchShipMapButton').click();
  await page.waitForSelector('#researchShipMap[open]');
  await page.getByRole('button', { name: 'Main deck', exact: true }).click();
  await capture('research-map', 'Find your way aboard', 'Research vessel deck map with rooms and a route to the selected station');
  await page.locator('#researchShipMap [data-station="sub"]').click();
  report.walks.push(await walkResearchStationWithInput(page, 'sub'));
  await page.getByText('Vessel options', { exact: true }).click();
  // This is a route shortcut, not remote control of the ship. Walk to the
  // bridge and use its station action before asking for the sailing camera.
  await page.locator('#researchDeckHelm').click();
  report.walks.push(await walkResearchStationWithInput(page, 'helm'));
  await page.locator('#researchDeckAction').click();
  await page.waitForFunction(() => !marineCtx.boatDeck.active && marineCtx.boatMode.active);
  const departure=await page.evaluate(()=>({x:marineCtx.boat.x,z:marineCtx.boat.z,yaw:marineCtx.boat.angle,moored:marineCtx.boatMode.moored}));
  if(departure.moored)await page.locator('#researchDeckMoor').click();
  await page.waitForFunction(()=>marineCtx.boatMode.moored===false);
  await page.keyboard.down('KeyW');
  try {
    await page.waitForTimeout(4000);
    await page.keyboard.down('ArrowLeft');
    try {await page.waitForTimeout(1500);}finally{await page.keyboard.up('ArrowLeft');}
  }finally{await page.keyboard.up('KeyW');}
  const sailing=await page.evaluate(()=>({x:marineCtx.boat.x,z:marineCtx.boat.z,yaw:marineCtx.boat.angle,speed:marineCtx.boat.speed}));
  report.sailing={departure,sailing,distance:Math.hypot(sailing.x-departure.x,sailing.z-departure.z),turn:Math.atan2(Math.sin(sailing.yaw-departure.yaw),Math.cos(sailing.yaw-departure.yaw))};
  assert.ok(report.sailing.distance>3,'Normal throttle must move the research vessel through the ocean');
  assert.ok(Math.abs(report.sailing.turn)>.04,'Normal steering must turn the research vessel');
  await page.locator('#researchDeckMoor').click();
  await page.waitForFunction(()=>marineCtx.boatMode.moored&&Math.abs(marineCtx.boat.speed)<.1);
  await page.keyboard.press('KeyC'); await page.keyboard.press('KeyC');
  await page.waitForTimeout(1000);
  await capture('research-vessel', 'A research ship at sea', 'The licensed research vessel and its docked submarine through the overview camera');
  await page.keyboard.press('KeyC');
  await page.locator('#researchDeckEnter').click();
  report.walks.push(await walkResearchStationWithInput(page, 'sub'));
  await page.locator('#researchDeckAction').click();
  await page.waitForFunction(() => marineCtx.oceanMode?.active && !marineCtx.oceanMode.diver?.active, null, { timeout: 60000 });
  await page.evaluate(async () => { await marineCtx.oceanMode.fishVisualsReady; });
  await page.waitForTimeout(1200);
  await capture('submarine', 'Deploy and explore', 'The Atlantic Explorer submarine deployed from its research vessel');
  await page.locator('#oceanDiverToggle').click();
  await page.waitForFunction(() => marineCtx.oceanMode.diver?.active);
  await page.keyboard.down('KeyW');
  try { await page.waitForTimeout(1300); await capture('diving', 'Below the surface', 'Scuba swimming beside the research submarine at Coral Shelf'); }
  finally { await page.keyboard.up('KeyW'); }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await capture('diver-phone', 'Dive with touch controls', 'Scuba exploration and recovery controls at phone width');
  }
  assert.deepEqual(report.errors, []);
  report.ok = true;
} catch (error) {
  report.failure = String(error.stack || error).split('\nBrowser logs:')[0];
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  if (owned) await closeOwnedBrowser(owned);
}
console.log(JSON.stringify({ ok: report.ok, images: report.images.map(image => image.id), failure: report.failure }));
