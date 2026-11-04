import test from 'node:test';
import assert from 'node:assert/strict';
import { transitionHarborRun, harborRunCommandReceipts } from '../app/js/campaign/harbor-run.js';
import { pilotAssignment, pilotReturnReceipt } from '../app/js/campaign/pilot-assignments.js';
import {
  createDeliveryHandling,
  deliveryMetricPose,
  deliveryDistinction,
} from '../app/js/campaign/delivery-handling.js';
const p = (lat, y = 0) => ({ lat, lon: -76.61, y }),
  route = {
    id: 'harbor:original',
    regionId: 'region',
    regionLabel: 'Baltimore',
    environment: 'EARTH',
    destinationLabel: 'Field destination',
    pickup: p(39.29),
    dropoff: p(39.292),
    pickupCase: p(39.29),
    dropoffCase: p(39.292),
    points: [p(39.29), p(39.292)],
    distance: 222,
    turns: 0,
  },
  base = {
    schemaVersion: 1,
    phase: 'complete',
    revision: 6,
    route,
    cargo: 'delivered',
    acceptedAt: 10,
    loadedAt: 20,
    completedAt: 100,
    finishId: 'slate',
    nextPoint: 2,
  },
  returned = {
    ...route,
    distanceUnits: 'm',
    id: 'return:' + route.id,
    continuationOf: route.id,
    caseId: 'field-case:' + route.id,
    pickup: route.dropoff,
    dropoff: route.pickup,
    pickupCase: route.dropoffCase,
    dropoffCase: route.pickupCase,
    points: [route.dropoff, route.pickup],
  },
  evidence = (point) => ({
    ...point,
    regionId: 'region',
    environment: 'EARTH',
    mode: 'drive',
    speed: 0,
    road: true,
    continuous: true,
  });
test('the return uses one root revision and same-case custody while preserving the completed original delivery and finish', () => {
  let state = structuredClone(base),
    now = 200;
  const write = (c) => {
    state = transitionHarborRun(
      state,
      { assignmentId: 'return-case', revision: state.revision, ...c },
      ++now
    );
  };
  write({ type: 'accept', route: returned });
  const snapshot = structuredClone(state);
  assert.throws(() =>
    transitionHarborRun(
      state,
      {
        assignmentId: 'return-case',
        type: 'load',
        revision: 6,
        evidence: evidence(returned.pickup),
      },
      ++now
    )
  );
  assert.deepEqual(state, snapshot);
  write({ type: 'load', evidence: evidence(returned.pickup) });
  write({ type: 'reach', pointIndex: 0, evidence: evidence(returned.points[0]) });
  write({ type: 'reach', pointIndex: 1, evidence: evidence(returned.points[1]) });
  const before = structuredClone(state);
  write({ type: 'unload', evidence: evidence(returned.dropoff) });
  assert.equal(pilotAssignment(state, 'return-case').phase, 'complete');
  for (const k of Object.keys(base).filter((k) => k !== 'revision'))
    assert.deepEqual(state[k], base[k]);
  assert.equal(harborRunCommandReceipts(before, state, { assignmentId: 'return-case' }).length, 1);
  assert.deepEqual(harborRunCommandReceipts(state, state, { assignmentId: 'return-case' }), []);
  assert.equal(pilotReturnReceipt(state).metadata.pilotDeliveryReport.caseId, returned.caseId);
  assert.throws(() => write({ type: 'finish', finishId: 'white' }));
});
test('a new case, wrong stop/deck, incomplete base or future continuation cannot replace the original delivered case', () => {
  for (const patch of [
    { caseId: 'other' },
    { pickup: p(40) },
    { pickup: p(39.292, 5) },
    { continuationOf: 'other' },
  ])
    assert.throws(() =>
      transitionHarborRun(
        base,
        {
          type: 'accept',
          assignmentId: 'return-case',
          route: { ...returned, ...patch },
          revision: 6,
        },
        200
      )
    );
  assert.throws(() =>
    transitionHarborRun(
      { ...base, phase: 'driving' },
      { type: 'accept', assignmentId: 'return-case', route: returned, revision: 6 },
      200
    )
  );
  const future = { ...base, continuations: { schemaVersion: 2, untouched: ['new-route'] } };
  assert.throws(() =>
    transitionHarborRun(
      future,
      { type: 'accept', assignmentId: 'return-case', route: returned, revision: 6 },
      200
    )
  );
  assert.deepEqual(future.continuations, { schemaVersion: 2, untouched: ['new-route'] });
});
test('new review samples use physical speed: 30 mph is below 14 m/s, and legacy reviews remain raw and interrupted', () => {
  const h = createDeliveryHandling(null, { speedUnits: 'm/s' });
  for (let i = 0; i < 100; i++) {
    const pose = deliveryMetricPose({ speed: 60, mode: 'drive', road: true, yaw: 0 });
    h.sample(pose, 0.2, i ? pose.speed * 0.2 : 0);
  }
  assert.ok(Math.abs(h.snapshot().maxSpeed - 13.4112) < 1e-6);
  assert.equal(h.snapshot().speedUnits, 'm/s');
  assert.equal(deliveryDistinction(h.snapshot(), 260), 'steady-cargo');
  const old = {
      distance: 100,
      seconds: 20,
      maxSpeed: 12,
      hardBrakes: 1,
      roadDepartures: 0,
      sharpTurns: 2,
      complete: true,
    },
    resumed = createDeliveryHandling(old, { speedUnits: 'm/s' }).snapshot();
  assert.equal(resumed.complete, false);
  assert.deepEqual(resumed.legacyReview, old);
  assert.equal(deliveryDistinction(resumed, 100), null);
  assert.equal(old.complete, true);
});

test('the existing profile transaction stores the return and its report once, preserves the original receipt and rejects corrupt imports atomically', async () => {
  const { createMemoryDiscoveryProfileStore } = await import(
      '../app/js/discovery/profile-store.js?v=5'
    ),
    { canonicalFieldRecord } = await import('../app/js/campaign/field-study-contract.js'),
    store = createMemoryDiscoveryProfileStore();
  let now = 1000;
  const write = async (c, assignmentId) => {
    const p = await store.getProfile();
    return store.updateHarborRun(
      { ...c, ...(assignmentId ? { assignmentId } : {}), revision: p.harborRun.revision },
      ++now
    );
  };
  await write({ type: 'accept', route });
  await write({ type: 'load', evidence: evidence(route.pickup) });
  for (let i = 0; i < route.points.length; i++)
    await write({ type: 'reach', pointIndex: i, evidence: evidence(route.points[i]) });
  await write({ type: 'unload', evidence: evidence(route.dropoff) });
  await write({ type: 'finish', finishId: 'slate' });
  const original = await store.exportData(),
    baseEvent = original.events.find((e) => e.eventId === 'event:campaign-completed:harbor-run:v1');
  await write({ type: 'accept', route: returned }, 'return-case');
  await write({ type: 'load', evidence: evidence(returned.pickup) }, 'return-case');
  for (let i = 0; i < returned.points.length; i++)
    await write(
      { type: 'reach', pointIndex: i, evidence: evidence(returned.points[i]) },
      'return-case'
    );
  await write({ type: 'unload', evidence: evidence(returned.dropoff) }, 'return-case');
  let saved = await store.exportData();
  assert.deepEqual(
    saved.events.find((e) => e.eventId === baseEvent.eventId),
    baseEvent
  );
  assert.equal(saved.events.filter((e) => e.metadata?.pilotDeliveryReport).length, 1);
  await write({ type: 'unload', evidence: evidence(returned.dropoff) }, 'return-case');
  assert.equal(
    (await store.exportData()).events.filter((e) => e.metadata?.pilotDeliveryReport).length,
    1
  );
  await store.importData(saved);
  const normal = (b) => ({ ...b, exportedAt: 0, profile: { ...b.profile, updatedAt: 0 } }),
    before = await store.exportData(),
    bad = structuredClone(before);
  bad.profile.harborRun.continuations.jobs['return-case'].route.caseId = 'not-the-delivered-case';
  await assert.rejects(store.importData(bad));
  assert.equal(
    canonicalFieldRecord(normal(await store.exportData())),
    canonicalFieldRecord(normal(before))
  );
});

test('new route distances and sampling use the current metre scale, and the return asks the driving router for its own direction', async () => {
  const { validatePhysicalDeliveryRoute, buildReturnDeliveryOffer } = await import(
      '../app/js/campaign/delivery-routes.js'
    ),
    { earthCoordinateFrame } = await import('../app/js/earth-core/coordinate-frame.js?v=1');
  const origin = { lat: 39.29, lon: -76.61 },
    frame = earthCoordinateFrame(origin, 100000),
    geo = (x, z = 0) => ({ ...frame.toGeographic(x, z), y: 10 }),
    ctx = {
      LOC: origin,
      SCALE: 100000,
      METERS_PER_WORLD_UNIT: 1.11,
      initialEarthWorldReady: true,
      getEnv: () => 'EARTH',
      SurfaceQuery: {
        driveAt: () => ({ kind: 'road', position: { y: 10 } }),
        walkAt: () => ({ kind: 'path', position: { y: 10 } }),
      },
      checkBuildingCollision: () => ({ collision: false }),
    },
    original = {
      ...route,
      pickup: geo(0),
      dropoff: geo(200),
      pickupCase: geo(0, 4),
      dropoffCase: geo(200, 4),
      points: [geo(0), geo(200)],
    };
  const metric = validatePhysicalDeliveryRoute(ctx, [
    { x: 0, z: 0 },
    { x: 200, z: 0 },
  ]);
  assert.equal(metric.distance, 222);
  assert.equal(metric.distanceUnits, 'm');
  let args;
  const offer = buildReturnDeliveryOffer(
    ctx,
    { regionId: 'region', regionLabel: 'Baltimore' },
    original,
    {
      route: (...a) => {
        args = a;
        return {
          points: [
            { x: 200, z: 0 },
            { x: 200, z: 30 },
            { x: 0, z: 30 },
            { x: 0, z: 0 },
          ],
        };
      },
    }
  );
  assert.ok(offer);
  assert.ok(Math.abs(args[0] - 200) < 1e-7);
  assert.ok(Math.abs(args[2]) < 1e-7);
  assert.equal(args[4].mode, 'drive');
  assert.equal(offer.distance, 289);
  assert.ok(offer.points.some((p) => p.lat !== original.pickup.lat));
  assert.equal(offer.caseId, 'field-case:' + original.id);
  assert.equal(
    buildReturnDeliveryOffer(ctx, { regionId: 'region' }, original, { route: () => null }),
    null
  );
});

test('the delivery report keeps unknown and damaged review data out of the Journal', async () => {
  const { pilotReportMarkup } = await import('../app/js/campaign/pilot-report.js');
  for (const value of [
    null,
    {},
    { schemaVersion: 2 },
    {
      schemaVersion: 1,
      assignmentId: 'return-case',
      delivery: { phase: 'complete', route: { ...returned, distance: Infinity } },
    },
  ])
    assert.equal(pilotReportMarkup(value), '');
  const report = {
    schemaVersion: 1,
    assignmentId: 'return-case',
    delivery: {
      phase: 'complete',
      route: returned,
      handling: { speedUnits: 'm/s', maxSpeed: NaN },
    },
  };
  const html = pilotReportMarkup(report);
  assert.match(html, /No complete metric handling review/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test('a valid same-instant acceptance survives backup validation on a coarse system clock', async () => {
  const { validatePilotBackup } = await import('../app/js/campaign/harbor-run.js');
  const accepted = transitionHarborRun(
    base,
    { type: 'accept', assignmentId: 'return-case', revision: base.revision, route: returned },
    base.completedAt
  );
  assert.equal(accepted.continuations.jobs['return-case'].acceptedAt, base.completedAt);
  assert.doesNotThrow(() => validatePilotBackup(accepted, []));
  const bad = structuredClone(accepted);
  bad.continuations.jobs['return-case'].acceptedAt--;
  assert.throws(() => validatePilotBackup(bad, []));
});
