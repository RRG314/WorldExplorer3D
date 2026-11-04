import test from 'node:test';
import assert from 'node:assert/strict';
import { personalWorkspaceEligible } from '../app/js/campaign/personal-workspace-access.js';
import { homeAchievementEvent } from '../app/js/campaign/home-achievements.js';
import { lunarReportFixture } from './helpers/lunar-study-record.mjs';
test('completed supported research or Racer careers can reach the included workspace without First Bearings', () => {
  assert.equal(personalWorkspaceEligible({ openingChapter: { phase: 'complete' } }), true);
  assert.equal(
    personalWorkspaceEligible({
      researchCareers: {
        cartography: {
          schemaVersion: 1,
          completed: { campaign: 'event:research:cartography:run:7' },
        },
      },
    }),
    true,
  );
  assert.equal(
    personalWorkspaceEligible({ soloRacer: { schemaVersion: 1, phase: 'complete' } }),
    true,
  );
  assert.equal(personalWorkspaceEligible({}, [lunarReportFixture()]), true);
  for (const p of [
    {},
    {
      researchCareers: {
        unknown: { schemaVersion: 1, completed: { campaign: 'event:research:unknown:x' } },
      },
    },
    {
      researchCareers: {
        cartography: { schemaVersion: 2, completed: { campaign: 'event:research:cartography:x' } },
      },
    },
    { soloRacer: { schemaVersion: 2, phase: 'complete' } },
  ])
    assert.equal(personalWorkspaceEligible(p), false);
});
test('Maker completion still requires the owned arrangement, rotation, undo and desk use', () => {
  const home = {
      id: 'home',
      workspace: {
        schemaVersion: 1,
        pose: { x: 0, z: 0, turn: 1 },
        rotated: true,
        undone: true,
        usedAt: 1000,
      },
    },
    profile = { openingChapter: { phase: 'available' } };
  assert.equal(
    homeAchievementEvent('maker', home, profile).eventId,
    'event:campaign:useful-place:v1',
  );
  assert.throws(
    () =>
      homeAchievementEvent(
        'maker',
        { ...home, workspace: { ...home.workspace, undone: false } },
        profile,
      ),
    /steps/,
  );
  assert.throws(() => homeAchievementEvent('maker', {}, profile), /workspace/);
});
