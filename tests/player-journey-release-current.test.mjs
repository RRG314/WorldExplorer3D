import test from 'node:test';
import assert from 'node:assert/strict';
import { createTitleReturnLease } from '../app/js/world/title-return-lease.js';
import { createHomeReturn, homeWorldOrigin } from '../app/js/campaign/home-return.js';
import {
  projectCareerPortfolio,
  presentCareerSummary,
} from '../app/js/experiences/career-portfolio.js';
import {
  applyPlayerIntroduction,
  applyCareerFocus,
} from '../app/js/character/journey-preferences.js';
import { getLeaderboardDefinition } from '../app/js/leaderboards/catalog.js';
import { createHousingModel } from '../app/js/real-estate/housing-model.js';
import { createLocalCommerceModel } from '../app/js/urban-sandbox/commerce-model.js';

function leaseFixture() {
  const publication = {},
    state = {
      ready: true,
      publication,
      signature: 'same',
      publishedSignature: 'same',
      started: false,
      loading: false,
      liveGps: false,
    };
  let callback,
    releases = 0,
    cancelled = 0;
  const lease = createTitleReturnLease({
    read: () => state,
    release: () => releases++,
    schedule: (fn) => ((callback = fn), 1),
    cancel: () => cancelled++,
  });
  return {
    state,
    lease,
    expire: () => callback(),
    releases: () => releases,
    cancelled: () => cancelled,
  };
}
test('same-world return is bounded, rejects changed requests, and cannot retire a replacement world', () => {
  const f = leaseFixture();
  assert.equal(f.lease.retain(), true);
  assert.equal(f.lease.claim(), true);
  assert.equal(f.cancelled(), 1);
  f.expire();
  assert.equal(f.releases(), 0);
  f.lease.retain();
  f.state.signature = 'changed';
  assert.equal(f.lease.claim(), false);
  f.state.signature = 'same';
  f.lease.retain();
  f.state.publication = {};
  f.expire();
  assert.equal(f.releases(), 0);
  f.lease.retain();
  f.expire();
  assert.equal(f.releases(), 1);
});
test('failed worlds and Live GPS never reuse; a menu lease cannot expire over an active arrival', () => {
  const f = leaseFixture();
  f.state.ready = false;
  assert.equal(f.lease.retain(), false);
  assert.equal(f.lease.claim(), false);
  f.state.ready = true;
  f.state.liveGps = true;
  assert.equal(f.lease.retain(), false);
  assert.equal(f.lease.claim(), false);
  f.state.liveGps = false;
  f.lease.retain();
  f.state.loading = true;
  f.expire();
  assert.equal(f.releases(), 0);
});
function returnFixture() {
  const home = {
    id: 'home:custom:1:2:way:42',
    locationId: 'custom:1.0000:2.0000',
    locationLabel: 'Original town',
    worldOrigin: { lat: 1.00001, lon: 2.00002, name: 'Original town' },
  };
  const publication = { requestId: 'r', sequence: 1 },
    runtime = {
      gameStarted: true,
      getEnv: () => 'EARTH',
      initialEarthWorldReady: true,
      _worldLoadSequence: 1,
      worldPublication: publication,
      worldLoadRuntimeState: {
        status: 'ready',
        geometryReady: true,
        gameplayRuntimesReady: true,
        session: { state: 'published', requestId: 'r' },
        sequence: 1,
        publication,
      },
      getAccountUserId: () => 'one',
      enterInteriorForSupport: async () => true,
      restoreSurfaceTravelPose: (...args) => (commands.push(args), true),
    };
  const commands = [],
    view = { homes: [home] },
    travel = [];
  const service = createHomeReturn({
    runtime,
    getHousing: () => ({ snapshot: () => view }),
    resolveEntrance: () => ({ x: 4, z: 5, support: { enterable: true } }),
    travelToPlace: async (place) => (travel.push(place), true),
  });
  return { home, runtime, commands, view, travel, service };
}
test('return uses precise saved origin, checks the current publication and delegates safe placement without health grants', async () => {
  const f = returnFixture();
  assert.equal((await f.service.returnHome(f.home)).returned, true);
  assert.equal(f.travel[0].lat, 1.00001);
  assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0][0], 'walk');
  assert.equal(f.commands[0][2].source, 'personal-home-return');
  assert.deepEqual(
    homeWorldOrigin({ locationId: 'custom:3.1234:-4.1234', locationLabel: 'Legacy' }),
    { lat: 3.1234, lon: -4.1234, name: 'Legacy' }
  );
  f.runtime.worldLoadRuntimeState.status = 'failed';
  await assert.rejects(f.service.returnHome(f.home), /still preparing/);
  assert.equal(f.commands.length, 1);
});
test('a sold home, changed account or unready world cannot authorize a return', async () => {
  const f = returnFixture();
  f.view.homes = [];
  await assert.rejects(f.service.returnHome(f.home), /no longer owned/);
  assert.equal(f.travel.length, 0);
  f.view.homes = [f.home];
  let uid = 'one';
  f.runtime.getAccountUserId = () => uid;
  const service = createHomeReturn({
    runtime: f.runtime,
    getHousing: () => ({ snapshot: () => f.view }),
    resolveEntrance: () => ({ support: { enterable: true } }),
    travelToPlace: async () => {
      uid = 'two';
      return true;
    },
  });
  await assert.rejects(service.returnHome(f.home), /account changed/);
  assert.equal(f.commands.length, 0);
});
test('intro reselection and free exploration preserve earned records and independent assignments', () => {
  const original = {
    researchCareers: {
      geology: { schemaVersion: 1, completed: { campaign: 'event:research:real:11' } },
    },
    activeExperience: { experienceId: 'career:geologist', variantId: 'cooling-rates' },
    items: ['kept'],
    points: 250,
  };
  const selected = applyPlayerIntroduction(
    original,
    { name: 'River', gender: 'woman', careerId: 'career:racer', vehicleId: 'bmw_e34' },
    { now: 1234 }
  );
  const free = applyCareerFocus(selected, null, 1250);
  assert.deepEqual(free.researchCareers, original.researchCareers);
  assert.deepEqual(free.activeExperience, original.activeExperience);
  assert.deepEqual(free.items, original.items);
  assert.equal(free.points, 250);
  assert.equal(free.journeyPreferences.activeFocusId, null);
});
test('earlier course completion survives a follow-on study in both activity details and portfolio', () => {
  const entry = { adapterId: 'geology' },
    profile = {
      researchCareers: {
        geology: {
          schemaVersion: 1,
          completed: { campaign: 'event:research:original:11' },
          active: { variantId: 'cooling-rates', phase: 'observe-a' },
        },
      },
    };
  const raw = { resume: false, stages: [{ label: 'Observe A', complete: false }] };
  assert.equal(presentCareerSummary(entry, profile, raw).stages[0].complete, true);
  assert.equal(raw.stages[0].complete, false);
  assert.equal(
    presentCareerSummary(entry, profile, { ...raw, resume: true }).stages[0].complete,
    false
  );
  const portfolio = projectCareerPortfolio({
    profile,
    summaryFor: (row) => presentCareerSummary(row, profile, raw),
  });
  assert.equal(portfolio.careers.length, 19);
  assert.equal(portfolio.careers.find((c) => c.id === 'career:geologist').completedStudies, 1);
  assert.equal(
    portfolio.careers.some((c) => c.id === 'career:expedition-pilot'),
    false
  );
  assert.equal(
    portfolio.careers.find((c) => c.id === 'career:planetary-scientist').completedStudies,
    0
  );
  assert.match(getLeaderboardDefinition('careers').scope, /Personal/);
  assert.match(getLeaderboardDefinition('careers').resultDisclosure, /own boards/);
});
test('purchased home and precise return region persist atomically with the original wallet', () => {
  const map = new Map(),
    storage = {
      getItem: (key) => map.get(key) || null,
      setItem: (key, value) => map.set(key, value),
      removeItem: (key) => map.delete(key),
    };
  const economy = createLocalCommerceModel({ storage }),
    housing = createHousingModel({ storage, economy });
  const candidate = {
    id: 'home:one',
    price: 120000,
    worldOrigin: { lat: 39.2904123, lon: -76.6122456, name: 'Baltimore' },
  };
  const before = economy.wallet().credits;
  assert.equal(housing.buy(candidate).ok, true);
  assert.equal(economy.wallet().credits, before - 120000);
  const reloaded = createHousingModel({ storage, economy });
  assert.deepEqual(reloaded.snapshot().primaryHome.worldOrigin, candidate.worldOrigin);
  assert.equal(reloaded.buy(candidate).reason, 'already_owned');
  assert.equal(economy.wallet().credits, before - 120000);
});
