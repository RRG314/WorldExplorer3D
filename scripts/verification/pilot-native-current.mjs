import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/pilot-career-20261103/native-' + Date.now(),
  qa = await createFieldworkQaSession({ output, careerId: 'pilot', maximumDurationMs: 180000 }),
  { page, report } = qa;
async function action(id) {
  await page.locator(`[data-delivery-action="${id}"]`).click();
  await page.waitForFunction(() => !fixture.runtime.snapshot().busy);
}
try {
  report.scope =
    'Controlled component: actual retained Harbor runtime, GLTF case, normal frame updates, real IndexedDB/profile transaction and native controls for the new continuation. Seeded original completion and controlled gate setup; no city-driving or smoothness claim. Accepted old H02 matrix is reused.';
  await page.route('**/pilot-native-fixture', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/styles/discovery.css"><style>body{background:#172d31;color:#e4efec;font:14px system-ui}main{max-width:620px;margin:12px;padding:12px;max-height:calc(100dvh - 48px);overflow:auto}button{min-height:44px}</style><main><section id="discoveryHarborRun" class="discoveryOpeningChapter"></section><section id="journal"></section></main><script src="/app/vendor/three/build/three.min.js"></script><script src="/app/vendor/three/examples/js/loaders/GLTFLoader.js"></script>',
    })
  );
  await page.goto('http://127.0.0.1:4192/pilot-native-fixture');
  const initialize = async () => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      ),
      { createHarborRunRuntime } = await import('/app/js/campaign/harbor-run-runtime.js'),
      { earthCoordinateFrame } = await import('/app/js/earth-core/coordinate-frame.js?v=1'),
      { buildReturnDeliveryOffer } = await import('/app/js/campaign/delivery-routes.js'),
      { pilotReportMarkup } = await import('/app/js/campaign/pilot-report.js');
    const store = createIndexedDbDiscoveryProfileStore(),
      origin = { lat: 39.29, lon: -76.61 },
      frame = earthCoordinateFrame(origin, 111000),
      geo = (x, z = 0) => ({ ...frame.toGeographic(x, z), y: 10 }),
      r = {
        id: 'native-pilot-original',
        regionId: 'test',
        regionLabel: 'Controlled road',
        environment: 'EARTH',
        distance: 140,
        distanceUnits: 'm',
        turns: 0,
        pickup: geo(0),
        dropoff: geo(140),
        pickupCase: geo(0, 4),
        dropoffCase: geo(140, 4),
        points: [geo(0), geo(70), geo(140)],
        destinationLabel: 'Controlled stop',
        locationSnapshot: { ...origin, name: 'Controlled road' },
      },
      e = (p) => ({
        ...p,
        environment: 'EARTH',
        regionId: 'test',
        mode: 'drive',
        speed: 0,
        road: true,
        continuous: true,
      });
    if ((await store.getProfile()).harborRun.phase !== 'complete') {
      let now = 1000;
      const write = async (c) =>
        store.updateHarborRun(
          { ...c, revision: (await store.getProfile()).harborRun.revision },
          ++now
        );
      await write({ type: 'accept', route: r });
      await write({ type: 'load', evidence: e(r.pickup) });
      for (let i = 0; i < r.points.length; i++)
        await write({ type: 'reach', pointIndex: i, evidence: e(r.points[i]) });
      await write({ type: 'unload', evidence: e(r.dropoff) });
      await write({ type: 'finish', finishId: 'slate' });
    }
    const ctx = {
        scene: new THREE.Scene(),
        LOC: origin,
        SCALE: 111000,
        METERS_PER_WORLD_UNIT: 1,
        car: { x: 140, z: 0, y: 11.1, speed: 0, angle: 0 },
        getEnv: () => 'EARTH',
        getCurrentTravelMode: () => 'drive',
        initialEarthWorldReady: true,
        SurfaceQuery: {
          driveAt: () => ({ kind: 'road', position: { y: 10 } }),
          walkAt: () => ({ kind: 'path', position: { y: 10 } }),
        },
        dynamicBuildingColliders: [],
        showToast() {},
        openWorldDiscoverySection: async (tab) => {
          if (tab === 'journal') {
            const data = await store.exportData(),
              event = data.events.find((e) => e.metadata?.pilotDeliveryReport);
            document.querySelector('#journal').innerHTML = pilotReportMarkup(
              event.metadata.pilotDeliveryReport
            );
            document.querySelector('#journal details').open = true;
          }
        },
      },
      state = {
        appCtx: ctx,
        profileStore: store,
        worldIdentityId: 'test',
        regionLabel: 'Controlled road',
        publication: { worldIdentity: { location: origin } },
        ui: { setOpen() {}, setCareerFocus() {}, refreshData: async () => {} },
      };
    const runtime = createHarborRunRuntime(state, {
      buildReturnOffer: (ctx, identity, original) =>
        buildReturnDeliveryOffer(ctx, identity, original, {
          route: () => ({
            points: [
              { x: 140, z: 0 },
              { x: 70, z: 0 },
              { x: 0, z: 0 },
            ],
          }),
        }),
    });
    await runtime.startCareer({ variantId: 'return-case', isActive: () => true, onNext() {} });
    window.fixture = { store, ctx, state, runtime, e };
    let last = performance.now();
    const loop = (now) => {
      runtime.update(Math.min(0.1, (now - last) / 1000));
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  const reloadOnly = process.env.WE3D_PILOT_NATIVE_MODE === 'reload';
  if (reloadOnly) {
    const saved = JSON.parse(
      await fs.readFile(
        'output/verification/pilot-career-20261103/native-1793739266517/qa-pilot-backup.json'
      )
    );
    await page.evaluate(async (b) => {
      const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      );
      await createIndexedDbDiscoveryProfileStore().importData(b);
    }, saved);
    report.reusedPrefix =
      'native-1793739266517 · passed two atomic rollback/retry paths and report sizes; only missing fixture initializer on page.reload failed';
  }
  await page.evaluate(initialize);
  if (!reloadOnly) {
    await action('find');
    await page.locator('[data-delivery-action="accept:0"]').click();
    await page.waitForFunction(
      () => fixture.runtime.snapshot().phase === 'pickup' && !fixture.runtime.snapshot().busy
    );
    await page.waitForFunction(
      () => !document.querySelector('[data-delivery-action="load"]').disabled
    );
    const accepted = await page.evaluate(() => fixture.store.exportData());
    await page.evaluate(() => {
      window.__put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (row, ...args) {
        if (
          this.name === 'profiles' &&
          row.harborRun?.continuations?.jobs?.['return-case']?.phase === 'driving'
        )
          throw new DOMException('Controlled custody quota', 'QuotaExceededError');
        return __put.call(this, row, ...args);
      };
    });
    await action('load');
    assert.equal(await page.evaluate(() => fixture.runtime.snapshot().phase), 'pickup');
    assert.equal(await page.evaluate(() => fixture.runtime.snapshot().saveError), true);
    assert.deepEqual(
      (await page.evaluate(() => fixture.store.exportData())).profile.harborRun,
      accepted.profile.harborRun
    );
    report.checks.push(
      'failed continuation load rolls back the entire existing profile transaction'
    );
    await page.evaluate(() => (IDBObjectStore.prototype.put = __put));
    await action('retry');
    await action('load');
    assert.equal(await page.evaluate(() => fixture.runtime.snapshot().phase), 'driving');
    await page.evaluate(async () => {
      let p = await fixture.store.getProfile(),
        job = p.harborRun.continuations.jobs['return-case'];
      for (let i = job.nextPoint; i < job.route.points.length; i++) {
        await fixture.store.updateHarborRun({
          assignmentId: 'return-case',
          type: 'reach',
          pointIndex: i,
          revision: (await fixture.store.getProfile()).harborRun.revision,
          evidence: fixture.e(job.route.points[i]),
        });
      }
      fixture.ctx.car.x = 0;
      await fixture.runtime.refresh();
    });
    await page.waitForFunction(
      () => !document.querySelector('[data-delivery-action="unload"]').disabled
    );
    const before = await page.evaluate(() => fixture.store.exportData());
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = function (row, ...args) {
        if (this.name === 'events' && row.metadata?.pilotDeliveryReport)
          throw new DOMException('Controlled receipt quota', 'QuotaExceededError');
        return __put.call(this, row, ...args);
      };
    });
    await action('unload');
    assert.equal(await page.evaluate(() => fixture.runtime.snapshot().phase), 'unload');
    assert.deepEqual(
      (await page.evaluate(() => fixture.store.exportData())).profile.harborRun,
      before.profile.harborRun
    );
    report.checks.push(
      'failed new receipt rolls back unload and leaves original delivery/finish intact'
    );
    await page.evaluate(() => (IDBObjectStore.prototype.put = __put));
    await action('retry');
    await page.waitForFunction(
      () => !document.querySelector('[data-delivery-action="unload"]').disabled
    );
    await action('unload');
    await page.waitForFunction(() => fixture.runtime.snapshot().phase === 'complete');
    const finished = await page.evaluate(() => fixture.store.exportData());
    assert.equal(finished.events.filter((e) => e.metadata?.pilotDeliveryReport).length, 1);
    assert.equal(finished.profile.harborRun.finishId, 'slate');
    assert.equal(await page.evaluate(() => fixture.ctx.playerCarFinish), 'slate');
    assert.equal(await page.evaluate(() => fixture.runtime.snapshot().caseVisible), true);
    await action('journal');
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      const plate = page.locator('.pilot-delivery-report');
      await plate.locator('svg').scrollIntoViewIfNeeded();
      assert.equal(await plate.evaluate((e) => e.scrollWidth > e.clientWidth + 1), false);
      await page.screenshot({ path: output + '/report-' + width + '.png' });
    }
    await fs.writeFile(output + '/qa-pilot-backup.json', JSON.stringify(finished) + '\n', {
      mode: 0o600,
    });
    await page.reload();
    await page.evaluate(initialize);
    await page.waitForFunction(
      () => !!globalThis.fixture && fixture.runtime.snapshot().caseVisible
    );
    assert.equal(await page.evaluate(() => fixture.runtime.snapshot().phase), 'complete');
    assert.equal(
      (await page.evaluate(() => fixture.store.exportData())).events.filter(
        (e) => e.metadata?.pilotDeliveryReport
      ).length,
      1
    );
    report.checks.push(
      'actual retry/reload keeps one new receipt, the original finish and one delivered case'
    );
  } else {
    await page.waitForFunction(() => fixture.runtime.snapshot().caseVisible);
    assert.equal(await page.evaluate(() => fixture.runtime.snapshot().phase), 'complete');
    assert.equal(
      (await page.evaluate(() => fixture.store.exportData())).events.filter(
        (e) => e.metadata?.pilotDeliveryReport
      ).length,
      1
    );
    await page.reload();
    await page.evaluate(initialize);
    await page.waitForFunction(() => fixture.runtime.snapshot().caseVisible);
    assert.equal(await page.evaluate(() => fixture.ctx.playerCarFinish), 'slate');
    report.checks.push(
      'genuine finished native checkpoint survives current reader and controller reload without duplicate receipt'
    );
    await fs.writeFile(
      output + '/qa-pilot-backup.json',
      JSON.stringify(await page.evaluate(() => fixture.store.exportData())) + '\n',
      { mode: 0o600 }
    );
  }
  report.disposal = await page.evaluate(async () => {
    const { modelAssetCacheSnapshot } = await import('/app/js/assets/model-asset-runtime.js?v=16');
    fixture.runtime.dispose();
    return {
      colliders: fixture.ctx.dynamicBuildingColliders.length,
      groups: fixture.ctx.scene.children.length,
      leases: modelAssetCacheSnapshot().entries.find((e) => e.id === 'solis-cargo-case')?.leases,
    };
  });
  assert.deepEqual(report.disposal, { colliders: 0, groups: 0, leases: 0 });
  await qa.succeed();
} catch (error) {
  try {
    report.component = await page.evaluate(() => globalThis.fixture?.runtime.snapshot());
    await fs.writeFile(
      output + '/qa-pilot-failed-backup.json',
      JSON.stringify(await page.evaluate(() => fixture.store.exportData())) + '\n',
      { mode: 0o600 }
    );
  } catch {}
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
