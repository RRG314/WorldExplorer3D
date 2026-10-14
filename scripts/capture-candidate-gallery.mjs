import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, statfs } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { closeOwnedBrowser } from './verification/owned-browser.mjs';
import { walkResearchStationWithInput } from './verification/normal-research-walk.mjs';
import { collectBrowserGraphicsErrors } from './verification/browser-graphics-errors.mjs';
import { walkVenueWithInput, faceVenueWithInput } from './verification/normal-venue-walk.mjs';
import { floorWalls, roomRing } from '../functions/interior-layout.mjs';
import { sampleFrameWindow } from './verification/frame-window.mjs';
import { frameHitches } from './verification/frame-hitches.mjs';

const url = new URL(process.argv[2]);
assert.match(url.hostname, /^we3d-staging-20260712--[a-z0-9-]+\.web\.app$/);
assert.equal(url.protocol, 'https:');
const { version } = JSON.parse(await readFile('package.json'));
const assets = `assets/gallery/${version.split('.').slice(0, 2).join('.')}`;
const earthOnly = process.argv.includes('--earth');
const mode = ['aquarium', 'museum', 'space'].find(name => process.argv.includes(`--${name}`)) || (earthOnly ? 'earth' : 'marine');
const captureDate = new Date().toISOString().slice(0, 10).replaceAll('-', '');
const out = `output/production-readiness-${captureDate}/${mode}-capture`;
await mkdir(out, { recursive: true });
await mkdir(assets, { recursive: true });
const disk = await statfs('.');
assert.ok(disk.bavail * disk.bsize > 2 * 1024 ** 3, '2 GiB free space required');
const report = { ok: false, capturedAt: new Date().toISOString(), sourceUrl: url.origin,
  scope: 'Ordinary hosted Chrome, live providers, visible UI and keyboard/mouse controls. No debug attestation, provider interception, synthetic camera, controller stepping or test-only scene.', images: [], errors: [] };
let owned, browser, page, reentryProfiler;
async function capture(id, title, alt) {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(150);
  const bytes = await sharp(await page.screenshot()).webp({ quality: 90 }).toBuffer();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  // Hosting caches images for a year. New pixels require a new URL, including
  // another capture within the same release; preserve old release image URLs.
  const file = `${assets}/${id}-${sha256.slice(0, 12)}.webp`;
  await writeFile(file, bytes);
  const size = page.viewportSize();
  report.images.push({ id, title, alt, file, ...size,
    sha256, sourceBuild: report.sourceBuild,
    capturedAt: new Date().toISOString(),
    provenance: 'Normal-input browser runtime capture; no synthetic camera or test-only scene.' });
  console.log(`[gallery] ${id}`);
}
async function daytime() {
  const button = page.locator('#quickTimeOfDay');
  for (let i = 0; i < 5 && await button.getAttribute('data-mode') !== 'day'; i++) await button.click();
  assert.equal(await button.getAttribute('data-mode'), 'day');
}
async function measureWalkingView(label) {
  const budgets = JSON.parse(await readFile('config/performance-budgets.json', 'utf8'));
  await page.evaluate(() => { globalThis.captureMeasuredWalker = marineCtx.Walk.state.walker; });
  let frames;
  await page.keyboard.down('ArrowLeft');
  try { frames = await page.evaluate(sampleFrameWindow, { durationMs: 10000, actorKey: 'captureMeasuredWalker', collectDiagnostics: false }); }
  finally { await page.keyboard.up('ArrowLeft'); }
  await page.evaluate(() => { delete globalThis.captureMeasuredWalker; });
  (report.frameWindows ||= []).push({ label, fps: frames.deltas.length / (frames.elapsedMs / 1000), hitches: frameHitches(frames.deltas, budgets.desktopTier.hitches) });
}
async function watchJourneyFrames() {
  await page.evaluate(() => {
    const sample = globalThis.captureJourneyFrames = { deltas: [], frame: 0, last: null };
    // RAF timestamps precede callbacks. Establish the baseline on the first
    // RAF instead of subtracting a later performance.now() from that frame.
    const record = now => { if (sample.last !== null) sample.deltas.push(now - sample.last); sample.last = now; sample.frame = requestAnimationFrame(record); };
    sample.frame = requestAnimationFrame(record);
  });
}
async function finishJourneyFrames() {
  const deltas = await page.evaluate(() => {
    const sample = globalThis.captureJourneyFrames;
    if (!sample) return null;
    cancelAnimationFrame(sample.frame); delete globalThis.captureJourneyFrames;
    return sample.deltas;
  });
  if (deltas) {
    const budgets = JSON.parse(await readFile('config/performance-budgets.json', 'utf8'));
    report.journeyFrameTiming = { scope: 'Whole route including entry, lifts, reentry and screenshot readback; diagnostic timing, not an uninterrupted gameplay window', rawFrameMs: deltas };
    report.journeyFrameTiming.hitches = frameHitches(deltas, budgets.desktopTier.hitches);
  }
}
async function enterEarth() {
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    return marineCtx.gameStarted && !marineCtx.worldLoading && marineCtx.buildings.length > 0 && !document.getElementById('loading')?.classList.contains('show');
  }, null, { timeout: 300000 });
  await daytime();
  const skip = page.getByRole('button', { name: 'Skip guide', exact: true });
  if (await skip.isVisible()) await skip.click();
  if (await page.locator('#hudToggleBtn').isVisible()) await page.locator('#hudToggleBtn').click();
}
async function pilotToReef() {
  const start = await page.evaluate(() => ({ ...marineCtx.oceanMode.submarine.position }));
  const target = await page.evaluate(() => marineCtx.oceanMode.habitat.plan.landmarks.find(p => p.id === 'table-garden'));
  assert.ok(target, 'The authored outing needs its reef study site');
  const keys = new Set(), deadline = Date.now() + 120000;
  try {
    while (Date.now() < deadline) {
      const sub = await page.evaluate(() => {
        const s = marineCtx.oceanMode.submarine;
        return { ...s.position, yaw: s.yaw, speed: s.speed };
      });
      const dx = target.x - sub.x, dz = target.z - sub.z, distance = Math.hypot(dx, dz);
      const dy = -12 - sub.y;
      const turn = Math.atan2(Math.sin(Math.atan2(dx, dz) - sub.yaw), Math.cos(Math.atan2(dx, dz) - sub.yaw));
      if (distance < 12 && Math.abs(dy) < 1 && Math.abs(sub.speed) < .5) {
        report.submarineTravel = { start, end: sub, target: target.id, distance: Math.hypot(sub.x - start.x, sub.z - start.z) };
        assert.ok(report.submarineTravel.distance > 20, 'Normal controls must move the sub to its study site');
        return;
      }
      const next = new Set();
      if (distance > 9 && Math.abs(turn) > .07) next.add(turn > 0 ? 'KeyA' : 'KeyD');
      if (distance > 10 && Math.abs(turn) < .2) next.add('KeyW');
      if (Math.abs(dy) > .7) next.add(dy > 0 ? 'Space' : 'ShiftLeft');
      for (const key of keys) if (!next.has(key)) { await page.keyboard.up(key); keys.delete(key); }
      for (const key of next) if (!keys.has(key)) { await page.keyboard.down(key); keys.add(key); }
      await page.waitForTimeout(120);
    }
    throw new Error('Normal submarine controls did not reach the reef study site');
  } finally { for (const key of keys) await page.keyboard.up(key); }
}
try {
  owned = await chromium.launchServer({ channel: 'chrome', headless: false });
  browser = await chromium.connect(owned.wsEndpoint());
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning' && message.text().startsWith('[weather] live weather fetch failed:')) {
      (report.weatherWarnings ||= []).push(message.text().slice(0, 220));
    }
  });
  page.on('requestfailed', request => {
    const target = new URL(request.url());
    if (target.pathname.startsWith('/api/geospatial/')) (report.failedServices ||= []).push({ path: target.pathname, error: request.failure()?.errorText });
  });
  page.on('response', async response => {
    const request = new URL(response.url());
    if (request.origin === url.origin && request.pathname.startsWith('/api/geospatial/') && response.status() >= 400) {
      const payload = await response.json().catch(() => ({}));
      (report.unavailableServices ||= []).push({ path: request.pathname, status: response.status(), error: typeof payload.error === 'string' ? payload.error.slice(0, 200) : '' });
    }
  });
  collectBrowserGraphicsErrors(page, report.errors);
  const location = mode === 'aquarium' ? 'lat=39.28551&lon=-76.60860&lname=National%20Aquarium'
    : mode === 'museum' ? 'lat=39.29184&lon=-76.61036&lname=The%20Peale'
    : 'lat=39.2904&lon=-76.6122&lname=Baltimore';
  await page.goto(`${url.origin}/app/?launch=${mode === 'space' ? 'space' : 'earth'}&gm=free&loc=custom&${location}&mode=walking`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__, null, { timeout: 120000 });
  const build = await page.evaluate(() => fetch('/build-manifest.json').then(r => r.json()));
  assert.equal(build.firebaseProjectId, 'we3d-staging-20260712');
  report.sourceBuild = build.buildId;
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.evaluate(async () => { globalThis.marineCtx = (await import('/app/js/shared-context.js?v=55')).ctx; });
  if (mode === 'aquarium') {
    await enterEarth();
    await watchJourneyFrames();
    const entrance = await page.evaluate(() => marineCtx.buildings
      .filter(b => b.sourceBuildingId === 'overture:7bacec0b-326a-401f-ad9f-f3ebed72c8cf')
      .map(b => marineCtx.resolveBuildingEntrySupport(b, { allowSynthetic: false }).exteriorEntrance).find(Boolean));
    assert.ok(entrance, 'The aquarium needs its real exterior entrance');
    await walkVenueWithInput(page, { x: entrance.approachX, z: entrance.approachZ }, { tolerance: 1 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => marineCtx.activeInterior?.aquarium, null, { timeout: 20000 });
    await page.evaluate(() => marineCtx.activeInterior.aquarium.ready);
    assert.equal(await page.evaluate(() => marineCtx.activeInterior.aquarium.animals.length), 4);
    await page.mouse.click(800, 420);
    assert.equal(await page.locator('#worldSelectionNotice').isVisible(), false, 'Interior clicks must not select the retained exterior roof');
    report.interiorClickIsolated = true;
    await measureWalkingView('aquarium-pavilion');
    const point = (u, v) => page.evaluate(({ u, v }) => {
      const a = marineCtx.activeInterior, p = a.definition.aquariumPlan.local(u, v);
      return { x: p.x + a.center.x, z: p.z + a.center.z };
    }, { u, v });
    async function lift(id, level) {
      const stop = await page.evaluate(id => {
        const a = marineCtx.activeInterior;
        return a.authoredLifts.find(l => l.id === id).stops.find(s => s.level === a.activeLevel);
      }, id);
      await walkVenueWithInput(page, stop);
      await page.keyboard.press('KeyE');
      await page.locator(`[data-elevator-level="${level}"]`).click();
      await page.waitForFunction(level => marineCtx.activeInterior.activeLevel === level, level);
    }
    await lift('pavilion-lift', 2);
    for (const [u, v] of [[0, 14], [-1, 15.5], [-1, 18.5], [-1, 22], [-17, 41], [-17, 50], [-18, 55]]) await walkVenueWithInput(page, await point(u, v), { tolerance: .3 });
    await faceVenueWithInput(page, await point(-36, 64));
    await page.waitForTimeout(700);
    await capture('aquarium-overlook', 'A different view of the reef', 'The aquarium reef seen from its upper visitor gallery');
    for (const [u, v] of [[-18.5, 58], [-19, 64], [-18.5, 70], [-18.5, 73], [-19, 75.4], [-24, 76.5], [-32, 76.5]]) await walkVenueWithInput(page, await point(u, v));
    await lift('reef-lift-a', 1);
    for (const [u, v] of [[-25, 76], [-19, 75.4], [-18.5, 73], [-18.5, 70], [-19.3, 63.5]]) await walkVenueWithInput(page, await point(u, v));
    await faceVenueWithInput(page, await point(-36, 64));
    await page.waitForTimeout(700);
    await capture('aquarium', 'Below the waterline', 'Looking through the aquarium viewing window at animated marine life and coral');
    await measureWalkingView('aquarium-lower-gallery');
    for (const [u, v] of [[-18.5, 64], [-18.5, 73], [-19, 75.4], [-25, 76], [-32, 76.5]]) await walkVenueWithInput(page, await point(u, v));
    await lift('reef-lift-a', 2);
    for (const [u, v] of [[-25, 76], [-19, 75.4], [-18.5, 73], [-18.5, 64], [-18, 55], [-17, 50], [-17, 41], [-1, 22], [-1, 18.5], [-1, 15.5], [0, 14]]) await walkVenueWithInput(page, await point(u, v), { tolerance: .3 });
    await lift('pavilion-lift', 0);
    const exit = await page.evaluate(() => marineCtx.activeInterior.interactions.find(i => i.kind === 'exit'));
    await walkVenueWithInput(page, exit);
    if (process.argv.includes('--profile-reentry')) {
      reentryProfiler = await page.context().newCDPSession(page);
      await reentryProfiler.send('Profiler.enable');
      await reentryProfiler.send('Profiler.start');
    }
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => !marineCtx.activeInterior);
    report.returnedOutside = true;
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => marineCtx.activeInterior?.aquarium);
    await page.evaluate(() => marineCtx.activeInterior.aquarium.ready);
    await measureWalkingView('aquarium-reentry');
    if (reentryProfiler) {
      const { profile } = await reentryProfiler.send('Profiler.stop');
      await writeFile(`${out}/reentry.cpuprofile`, JSON.stringify(profile));
      await reentryProfiler.detach(); reentryProfiler = null;
    }
    report.enteredFromOutside = true;
  } else if (mode === 'museum') {
    await enterEarth();
    const entrance = await page.evaluate(() => {
      const b = marineCtx.buildings.find(b => String(b.sourceBuildingId).includes('336352958') || String(b.buildingProvenance?.metadata?.sourceFeatureId).includes('336352958'));
      return b && marineCtx.resolveBuildingEntrySupport(b, { allowSynthetic: false }).exteriorEntrance;
    });
    assert.ok(entrance, 'The museum needs its real exterior entrance');
    await walkVenueWithInput(page, { x: entrance.approachX ?? entrance.x, z: entrance.approachZ ?? entrance.z }, { tolerance: 1.5 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => marineCtx.activeInterior?.gallery, null, { timeout: 20000 });
    await page.evaluate(() => marineCtx.activeInterior.gallery.ready);
    const a = await page.evaluate(() => ({ layout: marineCtx.activeInterior.definition.authoredLayout, center: marineCtx.activeInterior.center, interactions: marineCtx.activeInterior.interactions, placements: marineCtx.activeInterior.definition.exhibitPlacements }));
    const floor = a.layout.floors[0];
    const centers = floor.rooms.map(room => { const ring = roomRing(floor, room); return { x: ring.reduce((n, p) => n + p.x, 0) / ring.length + a.center.x, z: ring.reduce((n, p) => n + p.z, 0) / ring.length + a.center.z }; });
    const door = floor.doors.find(d => !d.entry && floorWalls(floor).find(w => w.id === d.wall).rooms.includes('gallery-room-0'));
    const wall = floorWalls(floor).find(w => w.id === door.wall), length = Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z);
    await walkVenueWithInput(page, centers[2]);
    await walkVenueWithInput(page, { x: wall.a.x + (wall.b.x - wall.a.x) * door.offset / length + a.center.x, z: wall.a.z + (wall.b.z - wall.a.z) * door.offset / length + a.center.z });
    await walkVenueWithInput(page, centers[0]);
    const exhibit = a.interactions.find(i => i.kind === 'museum-exhibit');
    const placement = a.placements.find(p => p.id === exhibit.exhibitId);
    await walkVenueWithInput(page, exhibit, { tolerance: .3 });
    await faceVenueWithInput(page, { x: placement.x + a.center.x, z: placement.z + a.center.z });
    await page.keyboard.down('ArrowDown');
    try { await page.waitForTimeout(650); } finally { await page.keyboard.up('ArrowDown'); }
    await page.waitForTimeout(700);
    await capture('museum', 'A collection to explore', 'Inside the interpretive museum gallery at The Peale in Baltimore');
    report.enteredFromOutside = true;
  } else if (mode === 'space') {
    await page.locator('#globeSelectorSpaceBtn').click();
    await page.waitForFunction(() => JSON.parse(render_game_to_text()).modes?.space === true, null, { timeout: 120000 });
    if (await page.locator('#spaceFlightHUD').evaluate(e => e.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
    await page.selectOption('#spaceDestinationSelect', 'saturn');
    await page.locator('#sfAssistBtn').click();
    console.log('[journey] Flying the selected course to Saturn');
    await page.waitForFunction(() => marineCtx.spaceJourney?.phase === 'approach', null, { timeout: 360000 });
    await page.waitForTimeout(700);
    await capture('space', 'Beyond Earth', 'Travel toward Saturn using optional flight assistance');
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionPlan').click();
    await page.waitForFunction(() => document.querySelector('.expeditionSummary .is-ready')?.textContent?.includes('READY'));
    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(render_game_to_text()).expeditionShipInterior?.active);
    const bridgeDoor = await page.evaluate(() => marineCtx.activeInterior.interactions.find(i => i.id === 'door:bridge'));
    await walkVenueWithInput(page, { x: bridgeDoor.x, z: bridgeDoor.z - 1 }, { tolerance: .2 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => !marineCtx.dynamicBuildingColliders.some(b => b.sourceBuildingId === 'door:bridge'));
    // The captain's console stands directly ahead of the doorway. Stop in
    // the clear threshold instead of asking the walker to cross its desk.
    await walkVenueWithInput(page, { x: bridgeDoor.x, z: bridgeDoor.z + .7 }, { tolerance: .12 });
    await faceVenueWithInput(page, { x: bridgeDoor.x + 3, z: bridgeDoor.z + 7 });
    await page.waitForTimeout(1500);
    report.bridgeWalk = await page.evaluate(() => marineCtx.getShipInteriorSnapshot());
    await capture('ship-interior', 'Aboard Solis Reach', 'Entering the command deck through the Solis Reach pressure door');
    await page.locator('#shipExitButton').click();
    await page.waitForFunction(() => !marineCtx.activeShipInterior && marineCtx.spaceFlight.active);
    await page.locator('#universeToggle').click();
    await page.locator('#universeReturnEarthBtn').click();
    await page.waitForFunction(() => marineCtx.spaceFlight.mode === 'landing', null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => marineCtx.spaceJourney), null, 'The old course must relinquish the ship to Earth return');
    await page.waitForFunction(() => {
      const d = getWorldExplorerRuntimeDiagnostics();
      return !marineCtx.spaceFlight.active && !marineCtx.onMoon && !marineCtx.onMars && !d.worldLoading && d.worldCounts?.buildings > 0;
    }, null, { timeout: 300000 });
    report.returnedToEarth = true;
  } else if (earthOnly) {
    await page.locator('#globeSelectorStartBtn').waitFor({state:'visible'});
    await page.locator('[data-globe-destination="settings"]').click();
    const streaming = page.locator('#oceanContinuousToggle');
    await streaming.uncheck();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__, null, { timeout: 120000 });
    await page.evaluate(async () => { globalThis.marineCtx = (await import('/app/js/shared-context.js?v=55')).ctx; });
    await page.locator('[data-globe-destination="settings"]').click();
    assert.equal(await streaming.isChecked(), false, 'The ocean streaming preference survives reload');
    await streaming.check();
    await page.locator('#globeHubOverlayCloseBtn').click();
    assert.equal(await streaming.isVisible(), false, 'The ocean preference belongs in Settings, not the destination bar');
    report.oceanStreamingPreference = 'off persisted across reload; restored on';
    await page.waitForTimeout(3500);
    await capture('world-entry','Choose a place','World Explorer 3D location selector with Baltimore selected on the globe');
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
    await capture('world-entry-phone','Choose a destination','The globe and destination controls at phone width');
    await page.setViewportSize({width:1600,height:900});
    await page.locator('#globeSelectorLiveEarthModeBtn').click();
    await page.locator('[data-live-earth-action="layer"][data-id="weather"]').first().click();
    await page.locator('#globeLiveEarthDetails').getByText(/MET Norway hourly forecast/).waitFor({ timeout: 90000 });
    report.liveWeather = await page.locator('#globeLiveEarthDetails').innerText();
    await page.locator('[data-live-earth-action="category"][data-id="planet"]').click();
    await page.locator('[data-live-earth-action="layer"][data-id="earthquakes"]').click();
    await page.locator('[data-live-earth-action="select-earthquake"]').first().waitFor({timeout:45000});
    await page.waitForTimeout(1000);
    await capture('live-earth', 'Live Earth', 'Live Earth globe and recent earthquake observations from USGS');
    await page.locator('#globeSelectorExploreModeBtn').click();
    await page.locator('#globeSelectorStartBtn').click();
    await page.waitForFunction(()=>{
      return marineCtx.gameStarted&&!marineCtx.worldLoading&&marineCtx.buildings.length>0&&marineCtx.roads.length>0&&!document.getElementById('loading')?.classList.contains('show');
    },null,{timeout:240000});
    const time=page.locator('#quickTimeOfDay');
    for(let i=0;i<5&&await time.getAttribute('data-mode')!=='day';i++)await time.click();
    assert.equal(await time.getAttribute('data-mode'),'day');
    const skip=page.getByRole('button',{name:'Skip guide',exact:true});if(await skip.isVisible())await skip.click();
    if(await page.locator('#hudToggleBtn').isVisible())await page.locator('#hudToggleBtn').click();
    const streetDirection = await page.evaluate(() => ({ x: marineCtx.Walk.state.walker.x + 20, z: marineCtx.Walk.state.walker.z }));
    await faceVenueWithInput(page, streetDirection);
    await page.keyboard.down('ArrowUp');try { await page.waitForTimeout(1600); } finally { await page.keyboard.up('ArrowUp'); }
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
    // Fly above the roofline using the ordinary throttle and pitch controls.
    // W pitches down in aircraft mode; a short W burst framed a street canyon.
    const climbKeys=new Set(),climbDeadline=Date.now()+45000;
    const launch=await page.evaluate(()=>marineCtx.getPlaneSnapshot());
    try{
      while(Date.now()<climbDeadline){
        const flight=await page.evaluate(()=>marineCtx.getPlaneSnapshot());
        const target=flight.y < launch.y + 180 ? .35 : .04;
        const next=new Set(flight.throttle<.95?['Space']:[]);
        if(flight.pitch<target-.03)next.add('ArrowDown');
        if(flight.pitch>target+.03)next.add('ArrowUp');
        for(const key of climbKeys)if(!next.has(key)){await page.keyboard.up(key);climbKeys.delete(key);}
        for(const key of next)if(!climbKeys.has(key)){await page.keyboard.down(key);climbKeys.add(key);}
        if(flight.y>launch.y+180&&Math.abs(flight.pitch)<.1){report.flight=flight;break;}
        await page.waitForTimeout(80);
      }
    }finally{for(const key of climbKeys)await page.keyboard.up(key);}
    assert.ok(report.flight?.airborne,'The gallery aircraft must climb clear of the buildings');
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
  await capture('research-interior', 'Life aboard', 'Inside the research vessel galley with Backpack provision controls');
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
  await pilotToReef();
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
  await finishJourneyFrames();
  assert.deepEqual(report.errors, []);
  report.ok = true;
} catch (error) {
  report.failure = String(error.stack || error).split('\nBrowser logs:')[0];
  report.failureState = await page?.evaluate(() => ({ text: JSON.parse(render_game_to_text()), paused: marineCtx.paused, walker: marineCtx.Walk?.state?.walker, activeElement: document.activeElement?.tagName })).catch(() => null);
  await finishJourneyFrames().catch(() => {});
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  if (owned) await closeOwnedBrowser(owned);
}
console.log(JSON.stringify({ ok: report.ok, images: report.images.map(image => image.id), failure: report.failure }));
