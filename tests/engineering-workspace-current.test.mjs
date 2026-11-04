import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindEngineeringCareer,
  createEngineeringCareerRuntime,
} from '../app/js/campaign/engineering-career-adapter.js';
import {
  workspaceProjectEvent,
  validateWorkspaceJournal,
  engineeringRoom,
  engineeringSummary,
  workspaceReportMarkup,
} from '../app/js/campaign/engineering-workspace.js';
import { personalWorkspaceEligible } from '../app/js/campaign/personal-workspace-access.js';
import {
  transitionWorkspace,
  normalizeWorkspace,
  workspaceGeometry,
  validateWorkspacePlacement,
} from '../app/js/campaign/personal-workspace.js';
import { validateWorkspaceProjectReport } from '../app/js/campaign/workspace-projects.js';
const room = {
  homeId: 'home:one',
  sourceBuildingId: 'way:1',
  metersPerUnit: 1.11,
  center: { x: 0, z: 0 },
  floorBaseY: 0,
  activeLevel: 0,
  entryPoint: { x: -4, z: -4 },
  usableFootprint: [
    { x: -6, z: -6 },
    { x: 6, z: -6 },
    { x: 6, z: 6 },
    { x: -6, z: 6 },
  ],
  colliders: [],
};
function finished() {
  let w = normalizeWorkspace(),
    now = 100;
  const write = (c) => (w = transitionWorkspace(w, { ...c, revision: w.revision }, ++now));
  write({
    type: 'begin-project',
    projectId: 'campaign',
    worldOrigin: { lat: 39.123456, lon: -76.123456, name: 'Origin' },
  });
  write({
    type: 'inspect-project',
    room,
    proposal: { x: -4, z: -4, turn: 0 },
    decision: 'entrance-clearance',
  });
  write({ type: 'place', purpose: 'journal', pose: { x: 0, z: 0, turn: 0 } });
  write({ type: 'place', purpose: 'journal', pose: { x: 0, z: 0, turn: 1 } });
  write({ type: 'undo' });
  const use = workspaceGeometry(room, w.pose).use;
  write({
    type: 'use',
    projectUse: {
      room,
      position: { x: use.x, z: use.z },
      feetY: use.y,
      supported: true,
      travelMode: 'walk',
      liveGps: false,
      recordId: 'event:real-room-inspection',
    },
  });
  return w;
}
test('only an explicitly selected compatible Engineer intent admits a new workspace without unrelated study gates', () => {
  assert.equal(
    personalWorkspaceEligible({
      activeExperience: {
        schemaVersion: 1,
        definitionVersion: 1,
        experienceId: 'career:field-engineer',
      },
    }),
    true
  );
  for (const activeExperience of [
    { schemaVersion: 2, definitionVersion: 1, experienceId: 'career:field-engineer' },
    { schemaVersion: 1, definitionVersion: 2, experienceId: 'career:field-engineer' },
    { schemaVersion: 1, definitionVersion: 1, experienceId: 'career:explorer' },
    { experienceId: 'career:field-engineer' },
  ])
    assert.equal(personalWorkspaceEligible({ activeExperience }), false);
});
test('the Activities adapter returns the exact saved world origin and delegates only selected gameplay to the existing home owner', async () => {
  const workspace = finished();
  let adapter;
  const runtime = { startGameplayPlugin: (id, payload) => ({ id, ...payload }) };
  bindEngineeringCareer(
    runtime,
    {
      registerAdapter(id, a) {
        assert.equal(id, 'engineering');
        adapter = a;
      },
    },
    {
      loadHousing: async () => ({
        snapshot: () => ({
          starterHomeId: 'home:one',
          homes: [
            {
              id: 'home:one',
              workspace,
              locationId: 'custom:39.1235:-76.1235',
              lat: 39.124,
              lon: -76.124,
            },
          ],
        }),
      }),
    }
  );
  assert.deepEqual(await adapter.places({ context: { place: { lat: 0, lon: 0 } } }), [
    {
      id: 'engineering-home',
      environment: 'earth',
      name: 'Origin',
      lat: 39.123456,
      lon: -76.123456,
    },
  ]);
  assert.equal(adapter.summary({ variantId: 'campaign' }).choices.length, 3);
  assert.equal(adapter.start({ intent: { variantId: 'campaign' }, isCurrent: () => false }), false);
  assert.equal(adapter.start({ intent: { variantId: 'unknown' }, isCurrent: () => true }), false);
  assert.equal(
    adapter.start({ intent: { variantId: 'campaign' }, isCurrent: () => true }).id,
    'research-career'
  );
});
test('the career wrapper has no frame work, owns only its exact focus lease and releases failed admission', async () => {
  const starts = [],
    stops = [];
  let updates = 0;
  const owner = {
      startCareer: async (o) => {
        starts.push(o);
        return o.isActive();
      },
      stopCareer: (o) => stops.push(o),
      snapshot: () => ({ careerId: 'engineering', revision: 4 }),
      update() {
        updates++;
      },
    },
    runtime = { worldDiscoveryRuntime: { personalHome: owner } };
  const run = await createEngineeringCareerRuntime({
    runtime,
    intent: { variantId: 'campaign' },
    isActive: () => true,
  });
  run.update(100);
  assert.equal(updates, 0);
  assert.equal(run.snapshot().revision, 4);
  run.dispose();
  assert.equal(stops[0], starts[0]);
  await assert.rejects(
    createEngineeringCareerRuntime({
      runtime,
      intent: { variantId: 'campaign' },
      isActive: () => false,
    })
  );
  assert.equal(starts.length, 1);
  owner.startCareer = async (o) => {
    starts.push(o);
    throw Error('save failed');
  };
  await assert.rejects(
    createEngineeringCareerRuntime({
      runtime,
      intent: { variantId: 'campaign' },
      isActive: () => true,
    })
  );
  assert.equal(stops.at(-1), starts.at(-1));
});
test('the trusted room DTO keeps coordinates, source identity and original scale while excluding workspace proxies', () => {
  const translated = {
    ...room,
    center: { x: 100, z: -200 },
    floorBaseY: 3,
    ownedHome: { id: 'home:one' },
    entryPoint: { x: 96, z: -204 },
    usableFootprint: room.usableFootprint.map((p) => ({ x: p.x + 100, z: p.z - 200 })),
  };
  const ctx = {
    activeInterior: translated,
    METERS_PER_WORLD_UNIT: 1.11,
    dynamicBuildingColliders: [
      { minX: 100, maxX: 101, minZ: -200, maxZ: -199, minY: 3, maxY: 4 },
      {
        sourceBuildingId: 'personal-workspace',
        minX: 100,
        maxX: 101,
        minZ: -200,
        maxZ: -199,
        minY: 3,
        maxY: 4,
      },
    ],
  };
  const r = engineeringRoom(ctx, { id: room.homeId, sourceBuildingId: room.sourceBuildingId });
  assert.deepEqual(r.usableFootprint, room.usableFootprint);
  assert.deepEqual(r.entryPoint, room.entryPoint);
  assert.equal(r.colliders.length, 1);
  assert.deepEqual(r.colliders[0], { minX: 0, maxX: 1, minZ: 0, maxZ: 1, minY: 0, maxY: 1 });
  assert.throws(() => engineeringRoom(ctx, { id: 'other-home' }));
});
test('a design report replays its actual clearance and use, retains its referenced record and rejects corrupt backup claims', () => {
  const w = finished(),
    r = w.projects.reports.campaign;
  assert.deepEqual(validateWorkspaceProjectReport(r, validateWorkspacePlacement), r);
  const event = workspaceProjectEvent(
      { id: 'home:one', locationId: 'test', locationLabel: 'Test' },
      r
    ),
    events = [{ eventId: r.recordId }, event];
  assert.doesNotThrow(() => validateWorkspaceJournal(events));
  assert.match(workspaceReportMarkup(r), /Overhead room plan/);
  assert.equal(
    engineeringSummary(w, 'campaign').stages.every((s) => s.complete),
    true
  );
  for (const change of [
    (r) => (r.design.pose.x = 90),
    (r) => (r.inspection.diagnosis.constraint = 'wall-clearance'),
    (r) => (r.use.position.x = 90),
    (r) => (r.rotationTried = false),
    (r) => (r.completedAt = 1),
  ]) {
    const broken = structuredClone(r);
    change(broken);
    assert.throws(() => validateWorkspaceProjectReport(broken, validateWorkspacePlacement));
    assert.equal(workspaceReportMarkup(broken), '');
  }
  assert.throws(() => validateWorkspaceJournal([event]));
  const tampered = structuredClone(events);
  tampered[1].metadata.workspaceDesignReport.recordId = 'event:not-present';
  assert.throws(() => validateWorkspaceJournal(tampered));
  assert.ok(event.eventId.length < 180);
});

test('a retained Maker workspace exposes only its demonstrated old steps and never invents a historical inspection or report', () => {
  const legacy = {
    schemaVersion: 1,
    pose: { x: 0, z: 0, turn: 0 },
    rotated: true,
    undone: true,
    usedAt: 100,
  };
  const before = structuredClone(legacy),
    summary = engineeringSummary(legacy, 'campaign');
  assert.equal(summary.stages.length, 2);
  assert.equal(
    summary.stages.every((s) => s.complete),
    true
  );
  assert.equal(
    summary.stages.some((s) => /inspect/i.test(s.label)),
    false
  );
  assert.equal(summary.choices.length, 3);
  assert.deepEqual(legacy, before);
  const started = transitionWorkspace(
    legacy,
    { type: 'begin-project', projectId: 'room-to-work', revision: 0 },
    200
  );
  assert.equal(
    started.usedAt,
    legacy.usedAt,
    'Choosing a follow-up keeps the demonstrated old desk use until an actual layout edit'
  );
  assert.deepEqual(engineeringSummary({ ...legacy, schemaVersion: 2 }, 'campaign').choices, []);
});
