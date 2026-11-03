import test from 'node:test';
import assert from 'node:assert/strict';
import { oceanographyHarness } from './helpers/oceanography-study.mjs';
import {
  oceanographyResumeVoyage,
  createOceanographyTravel
} from '../app/js/campaign/oceanography-travel.js';
function setup() {
  const h = oceanographyHarness();
  h.accept();
  const original = h.state.active.voyage;
  return { h, original, profile: { researchCareers: { oceanography: h.state } } };
}
test('the current voyage save can advance a career resume only when voyage, vessel and submarine identities all match', () => {
  const { h, original } = setup(),
    latest = {
      ...structuredClone(original),
      savedAt: original.savedAt + 1000,
      stage: 'underwater',
      sub: { ...original.sub, x: 9 }
    };
  assert.equal(oceanographyResumeVoyage(h.state, 'campaign', latest).sub.x, 9);
  for (const change of [
    { id: 'another-voyage' },
    { ship: { ...latest.ship, transportEntityId: 'another-ship' } },
    { subId: 'another-sub' }
  ])
    assert.deepEqual(
      oceanographyResumeVoyage(h.state, 'campaign', { ...latest, ...change }),
      original
    );
});
test('an active matching vessel stays in place and never triggers a replacement world or ship', async () => {
  const { profile, original } = setup();
  let launches = 0,
    resumes = 0;
  const runtime = {
      boatMode: { active: true },
      oceanVoyage: {
        current: original,
        saved: original,
        resume() {
          resumes++;
        }
      }
    },
    travel = createOceanographyTravel({
      runtime,
      readProfile: async () => profile,
      travelToOcean() {
        launches++;
      }
    });
  assert.equal(await travel({ intent: { variantId: 'campaign' } }), true);
  assert.equal(launches, 0);
  assert.equal(resumes, 0);
});
test('a departed survey resumes its validated saved vessel through the existing owner; superseded travel stays unaccepted', async () => {
  const { profile, original } = setup();
  let launches = 0,
    current = true,
    guard;
  const runtime = {
      boatMode: { active: false },
      oceanVoyage: {
        current: null,
        saved: original,
        async resume(saved, { isCurrent }) {
          guard = isCurrent;
          current = false;
          return true;
        }
      }
    },
    travel = createOceanographyTravel({
      runtime,
      readProfile: async () => profile,
      travelToOcean() {
        launches++;
      }
    });
  assert.equal(
    await travel({ intent: { variantId: 'campaign' }, isCurrent: () => current }),
    false
  );
  assert.equal(guard(), false);
  assert.equal(launches, 0);
});
