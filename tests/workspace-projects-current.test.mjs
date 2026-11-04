import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWorkspace,
  transitionWorkspace,
  workspaceGeometry,
} from '../app/js/campaign/personal-workspace.js';
import { workspaceDesign, workspaceProjectState } from '../app/js/campaign/workspace-projects.js';
const room = {
  homeId: 'home:way/1',
  sourceBuildingId: 'way/1',
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
function harness(value) {
  let state = normalizeWorkspace(value),
    time = 100;
  return {
    get state() {
      return state;
    },
    command(c) {
      state = transitionWorkspace(state, { ...c, revision: state.revision }, ++time);
      return state;
    },
    use(extra = {}) {
      const g = workspaceGeometry(room, state.pose);
      return this.command({
        type: 'use',
        projectUse: {
          room,
          position: { x: g.use.x, z: g.use.z },
          feetY: g.use.y,
          supported: true,
          travelMode: 'walk',
          liveGps: false,
          recordId: 'event:workspace-inspection',
          ...extra,
        },
      });
    },
    begin(id) {
      this.command({ type: 'begin-project', projectId: id });
      this.command({
        type: 'inspect-project',
        room,
        proposal: id === 'room-to-work' ? { x: 5.9, z: 5.9, turn: 0 } : { x: -4, z: -4, turn: 0 },
        decision:
          id === 'reusable-design'
            ? 'check-room-fit'
            : id === 'room-to-work'
              ? 'wall-clearance'
              : 'entrance-clearance',
      });
    },
  };
}
function first(h) {
  h.begin('campaign');
  h.command({ type: 'place', pose: { x: 0, z: 0, turn: 0 }, purpose: 'journal' });
  h.command({ type: 'place', pose: { x: 0, z: 0, turn: 1 }, purpose: 'journal' });
  h.command({ type: 'undo' });
  h.use();
  return h;
}
test('the retained workspace owner records three finite useful projects and keeps the first saved design immutable', () => {
  const h = first(harness()),
    base = structuredClone(h.state.projects.reports.campaign);
  h.begin('room-to-work');
  h.command({ type: 'place', pose: { x: 1, z: 0, turn: 0 }, purpose: 'journal' });
  h.use();
  h.begin('reusable-design');
  h.command({ type: 'export-project' });
  const exported = workspaceDesign(h.state);
  h.command({ type: 'place', pose: { x: 2, z: 0, turn: 0 }, purpose: 'journal' });
  h.command({
    type: 'place',
    pose: exported.pose,
    purpose: 'journal',
    projectAction: 'import',
    importedDesign: exported,
  });
  h.use();
  assert.equal(h.state.projects.active, null);
  assert.deepEqual(Object.keys(h.state.projects.reports), [
    'campaign',
    'room-to-work',
    'reusable-design',
  ]);
  assert.deepEqual(h.state.projects.reports.campaign, base);
  assert.deepEqual(h.state.projects.reports['reusable-design'].design, exported);
  const external = workspaceProjectState(h.state);
  external.reports.campaign.design.pose.x = 90;
  assert.deepEqual(h.state.projects.reports.campaign, base);
});
test('a posted clearance or use claim cannot replace an actual rejected proposal, clear room and supported desk position', () => {
  const h = harness();
  h.command({ type: 'begin-project', projectId: 'campaign' });
  const before = structuredClone(h.state);
  for (const c of [
    { room, proposal: { x: 0, z: 0, turn: 0 }, decision: 'entrance-clearance' },
    { room, proposal: { x: -4, z: -4, turn: 0 }, decision: 'wall-clearance' },
  ])
    assert.throws(() => h.command({ type: 'inspect-project', ...c }));
  assert.deepEqual(h.state, before);
  h.command({
    type: 'inspect-project',
    room,
    proposal: { x: -4, z: -4, turn: 0 },
    decision: 'entrance-clearance',
  });
  h.command({ type: 'place', pose: { x: 0, z: 0, turn: 0 }, purpose: 'journal' });
  h.command({ type: 'place', pose: { x: 0, z: 0, turn: 1 }, purpose: 'journal' });
  h.command({ type: 'undo' });
  for (const extra of [
    { supported: false },
    { position: { x: 5, z: 5 } },
    { liveGps: true },
    { room: { ...room, homeId: 'other-room' } },
  ])
    assert.throws(() => h.use(extra));
  assert.equal(h.state.projects.reports.campaign, undefined);
  h.use();
  assert.equal(h.state.projects.reports.campaign.routeChecked, true);
});
test('reusable design requires the original file, a distinct trial and a fresh room fit before use', () => {
  const h = first(harness());
  h.begin('reusable-design');
  h.command({ type: 'export-project' });
  const design = workspaceDesign(h.state);
  assert.throws(() =>
    h.command({
      type: 'place',
      pose: design.pose,
      purpose: 'journal',
      projectAction: 'import',
      importedDesign: design,
    })
  );
  h.command({ type: 'place', pose: { x: 1, z: 0, turn: 0 }, purpose: 'journal' });
  assert.throws(() =>
    h.command({
      type: 'place',
      pose: design.pose,
      purpose: 'journal',
      projectAction: 'import',
      importedDesign: { ...design, assets: ['unknown'] },
    })
  );
  assert.throws(() => h.use());
  h.command({
    type: 'place',
    pose: design.pose,
    purpose: 'journal',
    projectAction: 'import',
    importedDesign: {
      assets: design.assets,
      pose: design.pose,
      purpose: design.purpose,
      schemaVersion: 1,
      format: design.format,
    },
  });
  h.use();
  assert.ok(h.state.projects.reports['reusable-design'].importedAt > 0);
});
test('future or unreadable projects stay protected while an ordinary legacy workspace keeps its existing shape and use', () => {
  const h = harness();
  h.command({ type: 'place', pose: { x: 0, z: 0, turn: 0 }, purpose: 'journal' });
  h.command({ type: 'place', pose: { x: 0, z: 0, turn: 1 }, purpose: 'journal' });
  h.command({ type: 'undo' });
  h.command({ type: 'use' });
  assert.equal(h.state.projects, undefined);
  const future = { ...h.state, projects: { schemaVersion: 2, untouched: ['saved-design'] } };
  assert.deepEqual(workspaceProjectState(future), future.projects);
  assert.throws(() =>
    transitionWorkspace(future, {
      type: 'place',
      pose: { x: 1, z: 0, turn: 0 },
      purpose: 'journal',
      revision: future.revision,
    })
  );
  assert.throws(() =>
    workspaceProjectState({ ...h.state, projects: { schemaVersion: 1, reports: 42, active: null } })
  );
  assert.throws(() => h.command({ type: 'begin-project', projectId: '__proto__' }));
});
