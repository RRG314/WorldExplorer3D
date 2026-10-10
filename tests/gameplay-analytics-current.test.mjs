import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameplayAnalyticsSession, analyticsTravelMode } from '../js/gameplay-analytics-session.js';
import { createLaunchMeasurement } from '../app/js/platform/launch-telemetry.js';
import { analyticsCampaignContext, resolveAnalyticsCampaignContext, analyticsEventContext } from '../js/analytics-service.js';

function fixture() {
  let time = 0;
  const events = [];
  const model = createGameplayAnalyticsSession({ now: () => time, emit: (name, params) => events.push({ name, params }) });
  const value = { started: true, ready: true, visible: true, paused: false, mode: 'walking', environment: 'earth', input: true, position: { x: 0, y: 0, z: 0 } };
  return { model, events, step(ms = 2000, patch = {}) { time += ms; Object.assign(value, patch); return model.sample(value); } };
}

test('loading and failed launches never become gameplay sessions', () => {
  const f = fixture();
  f.step(2000, { ready: false }); f.step(90000); f.step(2000, { started: false });
  assert.deepEqual(f.events, []);
});
test('hidden and paused play suspends time without multiplying sessions', () => {
  const f = fixture(); f.step(0); f.step();
  f.step(0, { visible: false }); f.step(120000); f.step(0, { visible: true });
  f.step(); f.step(0, { paused: true }); f.step(60000); f.step(0, { paused: false }); f.step();
  assert.equal(f.model.snapshot().count, 1);
  assert.equal(f.model.snapshot().activeSeconds, 6);
  assert.equal(f.events.filter(e => e.name === 'we3d_world_session_start').length, 1);
});
test('long suspension, idle time and background startup do not count as active play', () => {
  const f = fixture(); f.step(0, { visible: false }); f.step(120000);
  assert.equal(f.model.snapshot().count, 0);
  f.step(0, { visible: true }); f.step(120000);
  assert.equal(f.model.snapshot().activeSeconds, 0);
  f.step(0, { input: false });
  for (let i = 0; i < 100; i++) f.step();
  assert.ok(f.model.snapshot().activeSeconds <= 60);
});
test('first action requires controlled movement or a completed action, and is sent once', () => {
  const f = fixture(); f.step(0, { input: false }); f.step(2000, { position: { x: 20, z: 0 } });
  assert.equal(f.model.snapshot().firstAction, false);
  f.step(2000, { input: true, position: { x: 21, z: 0 } });
  assert.equal(f.model.snapshot().firstAction, true);
  f.model.action(); f.step(2000, { position: { x: 23, z: 0 } });
  const actions = f.events.filter(e => e.name === 'we3d_first_action');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].params.action_kind, 'movement');
  assert.equal(JSON.stringify(f.events).includes('position'), false);
});
test('teleports and mode transitions are not movement achievements', () => {
  const f = fixture(); f.step(0);
  f.step(2000, { position: { x: 10000, z: 0 } });
  f.step(2000, { mode: 'aircraft', position: { x: 10020, z: 0 } });
  assert.equal(f.model.snapshot().firstAction, false);
});
test('five active minutes is one milestone and requires an action', () => {
  const f = fixture(); f.step(0);
  for (let i = 0; i < 151; i++) f.step();
  assert.equal(f.model.snapshot().fiveMinutes, false);
  f.model.action('interaction'); f.step(); f.step();
  assert.equal(f.events.filter(e => e.name === 'we3d_active_play_5m').length, 1);
});
test('closing and returning to menu end only one session; next play gets a new index', () => {
  const f = fixture(); f.step(0); f.step(); f.model.end('page_closed'); f.model.end('page_closed');
  f.step(0, { started: false }); f.step(0, { started: true });
  assert.equal(f.events.filter(e => e.name === 'we3d_world_session_end').length, 1);
  assert.equal(f.model.snapshot().count, 2);
  assert.equal(f.model.snapshot().activeSeconds, 0);
});
test('measurement can stop and restart without carrying an old active interval', () => {
  const f = fixture(); f.step(0); f.step(); f.model.end('tracking_stopped'); f.step(500000);
  assert.equal(f.model.snapshot().activeSeconds, 0);
});
test('travel classifications distinguish aircraft, diver, surface swimmer and vessels', () => {
  assert.equal(analyticsTravelMode({ planeMode: { active: true } }), 'aircraft');
  assert.equal(analyticsTravelMode({ oceanMode: { active: true, diver: { active: true } } }), 'scuba');
  assert.equal(analyticsTravelMode({ oceanMode: { active: true } }), 'submarine');
  assert.equal(analyticsTravelMode({ boatMode: { active: true } }), 'boat');
  assert.equal(analyticsTravelMode({ Walk: { state: { mode: 'walk', walker: { swimming: { equipment: 'none' } } } } }), 'swimming');
  assert.equal(analyticsTravelMode({ Walk: { state: { mode: 'walk', walker: { swimming: { equipment: 'scuba' } } } } }), 'scuba');
});
test('each launch has one terminal result, bounded duration and no raw error data', () => {
  let time = 0; const events = [];
  const options = { now: () => time, emit: (name, params) => events.push({ name, params }) };
  const first = createLaunchMeasurement('earth', options); time = 12345;
  assert.equal(first.finish('ready'), true); assert.equal(first.finish('failed'), false);
  const second = createLaunchMeasurement('ocean', options);
  second.finish('failed', 'https://private.example?lat=42&token=secret');
  assert.deepEqual(events.map(e => e.name), ['we3d_launch_start', 'we3d_launch_ready', 'we3d_launch_start', 'we3d_launch_failed']);
  assert.equal(events[1].params.load_duration_ms, 12345);
  assert.equal(events[3].params.failure_reason, 'launch_failed');
  assert.ok(events[3].params.launch_index > events[1].params.launch_index);
  assert.equal(JSON.stringify(events).includes('secret'), false);
});
test('only three bounded marketing tags enter campaign attribution', () => {
  const campaign = analyticsCampaignContext({ href: 'https://worldexplorer3d.io/?utm_source=reddit&utm_medium=social&utm_campaign=city_exploration&lat=39&room=secret&utm_term=private@example.com' });
  assert.deepEqual(campaign, { campaign_source: 'reddit', campaign_medium: 'social', campaign_name: 'city_exploration' });
  for (const query of ['utm_source=reddit', 'utm_source=private%40example.com&utm_medium=social&utm_campaign=test', 'utm_source=reddit&utm_medium=social&utm_campaign=39.3098,-76.6147']) {
    assert.deepEqual(analyticsCampaignContext({ href: `https://worldexplorer3d.io/?${query}` }), {});
  }
});
test('test-traffic flag persists only in this tab and can be cleared without an account ID', () => {
  const store = new Map();
  const scope = { location: { href: 'https://worldexplorer3d.io/?analytics_test=1' }, sessionStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) }, __WORLD_EXPLORER_BUILD__: { buildId: '5.5.0+d8775a392c42.88e67f97c00bb4c2.production' } };
  assert.equal(analyticsEventContext(scope).debug_mode, true);
  scope.location.href = 'https://worldexplorer3d.io/app/';
  assert.equal(analyticsEventContext(scope).traffic_type, 'internal');
  assert.equal(analyticsEventContext(scope).app_version, '5.5.0');
  scope.location.href += '?analytics_test=0';
  assert.equal(analyticsEventContext(scope).debug_mode, undefined);
  scope.sessionStorage.getItem = () => { throw Error('blocked'); };
  assert.doesNotThrow(() => analyticsEventContext(scope));
});


test('campaign survives immediate same-tab entry, expires and never stores arbitrary URL fields', () => {
  const values = new Map();
  const scope = { location: { href: 'https://example.test/?utm_source=reddit&utm_medium=social&utm_campaign=city_exploration&lat=39&token=private' },
    sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  const incoming = resolveAnalyticsCampaignContext(scope, 1000);
  assert.equal(incoming.campaign_source, 'reddit');
  scope.location.href = 'https://example.test/app/';
  assert.deepEqual(resolveAnalyticsCampaignContext(scope, 1001), incoming);
  assert.doesNotMatch([...values.values()].join(''), /lat|token|private/);
  assert.deepEqual(resolveAnalyticsCampaignContext(scope, 1801001), {});
  assert.equal(values.size, 0);
  values.set('we3d.analyticsCampaign', JSON.stringify({ capturedAt: 2000, campaign_source: 'https://private', campaign_medium: 'social', campaign_name: 'city' }));
  assert.deepEqual(resolveAnalyticsCampaignContext(scope, 2001), {});
  scope.sessionStorage.getItem = () => { throw Error('blocked'); };
  assert.deepEqual(resolveAnalyticsCampaignContext(scope, 2001), {});
});

test('limited analytics clears stored attribution and does not persist a new campaign', () => {
  const values = new Map([['we3d.analyticsCampaign', 'previous']]);
  const scope = { location: { href: 'https://example.test/?utm_source=reddit&utm_medium=social&utm_campaign=city' }, sessionStorage: {
    removeItem: key => values.delete(key), getItem: () => { throw Error('must not read'); }, setItem: () => { throw Error('must not write'); }
  } };
  assert.equal(resolveAnalyticsCampaignContext(scope, 1000, false).campaign_source, 'reddit');
  assert.equal(values.size, 0);
  scope.location.href = 'https://example.test/app/';
  assert.deepEqual(resolveAnalyticsCampaignContext(scope, 1001, false), {});
});
