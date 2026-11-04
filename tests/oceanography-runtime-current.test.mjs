import test from 'node:test';
import assert from 'node:assert/strict';
import { oceanographyHarness } from './helpers/oceanography-study.mjs';
import { transitionOceanographyCareer } from '../app/js/campaign/oceanography-career.js';
import { createOceanographyRuntime } from '../app/js/campaign/oceanography-runtime.js';

test('the real sonar action saves geometry and geographic evidence, retries failed writes, and resolves markers from the current render frame', async () => {
  const h = oceanographyHarness();
  h.accept();
  h.cast();
  h.cast();
  let state = h.state,
    fail = true,
    writes = 0;
  const source = h.evidence(null, true),
    target = {
      id: 'habitat',
      x: 8,
      y: -12,
      z: 12,
      radius: 2,
      returnShape: 'Broad irregular return',
    },
    ctx = {
      gameStarted: true,
      paused: false,
      worldLoading: false,
      SCALE: 111000,
      METERS_PER_WORLD_UNIT: 1,
      oceanVoyage: { current: source.voyage },
      boatMode: { active: false },
      oceanMode: {
        active: true,
        launchSite: source.voyage.site,
        submarine: {
          position: { x: 0, y: -8, z: 0 },
          yaw: Math.atan2(8, 12),
          speed: 0,
          verticalSpeed: 0,
        },
        habitat: {
          plan: { contacts: [target], rocks: [] },
          group: { userData: { habitat: { assetState: 'ready' } } },
          sampleSeabedHeight: () => -20,
        },
      },
    },
    store = {
      async getProfile() {
        return {
          researchCareers: { oceanography: state },
          activeExperience: { experienceId: 'career:oceanographer' },
        };
      },
      async updateResearchCareer(id, command, options) {
        assert.equal(id, 'oceanography');
        assert.ok(options.isCurrent());
        if (fail) {
          fail = false;
          throw Error('Controlled write failure');
        }
        const result = transitionOceanographyCareer(state, command, options.now);
        state = result.state;
        writes++;
        return result;
      },
    },
    api = createOceanographyRuntime(ctx, { store: () => store, now: () => 1100000 });
  await api.refresh();
  assert.equal(
    api.snapshot().visible,
    false,
    'A stored menu selection does not activate fieldwork'
  );
  await api.choose('campaign');
  assert.equal(api.snapshot().visible, true);
  assert.equal(api.snapshot().contactGate.allowed, true);
  assert.equal(await api.act('ping'), false);
  assert.match(api.snapshot().error, /Controlled write failure/);
  assert.equal(state.active.pings.length, 0);
  assert.equal(await api.act('ping'), true, api.snapshot().error);
  assert.equal(writes, 1);
  assert.equal(state.active.pings.length, 1);
  assert.ok(Number.isFinite(state.active.pings[0].position.lat));
  assert.ok(Number.isFinite(state.active.pings[0].sampledBottomY));
  assert.equal(state.active.pings[0].distanceMeters, Math.hypot(8, 4, 12));
  target.x += 200;
  assert.equal(
    api.snapshot().annotations[0].x,
    208,
    'Chart marker follows the current habitat render frame'
  );
  assert.equal(state.active.pings[0].target.x, 8, 'Saved evidence is retained');
  const originalVoyage = ctx.oceanVoyage.current;
  ctx.oceanVoyage.current = { ...originalVoyage, id: 'another-voyage' };
  assert.equal(
    api.snapshot().visible,
    false,
    'An unrelated vessel does not inherit the selected survey'
  );
  ctx.oceanVoyage.current = originalVoyage;
  assert.equal(api.snapshot().visible, true);
  api.pause();
  assert.equal(api.snapshot().visible, false);
  api.dispose();
});

test('a cancelled marine entry cannot activate after the profile read completes', async () => {
 let resolve,current=true;
 const profile=new Promise(r=>resolve=r),ctx={oceanVoyage:{current:{id:'pending'}},boatMode:{active:true}};
 const api=createOceanographyRuntime(ctx,{store:()=>({getProfile:()=>profile})});
 const pending=api.choose('campaign',{isCurrent:()=>current});current=false;resolve({researchCareers:{}});
 assert.equal(await pending,false);assert.equal(api.snapshot().visible,false);api.dispose();
});
