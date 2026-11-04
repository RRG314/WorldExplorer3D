import test from 'node:test';
import assert from 'node:assert/strict';
import { meteorologyHarness } from './helpers/meteorology-study.mjs';
import {
  normalizeMeteorologyCareer,
  transitionMeteorologyCareer,
  validateMeteorologyCareerBackup,
  meteorologyCareerBadge,
  meteorologyDirectionDifference,
  meteorologyVerification,
} from '../app/js/campaign/meteorology-career.js';
import {
  meteorologySourceSnapshot,
  validateMeteorologySource,
} from '../app/js/campaign/meteorology-source.js';
test('existing forecast issue age stays separate from fetch time, manual modes and unavailable observations', () => {
  const now = 1000000,
    runtime = {
      weatherMode: 'live',
      liveWeatherState: {
        sourceId: 'met-norway',
        source: 'live',
        issuedAt: new Date(now - 120000).toISOString(),
        localTimeIso: new Date(now).toISOString(),
        fetchedAtMs: now - 1000,
        windKph: 14.4,
        windDirectionDeg: 270,
        cloudCover: 30,
        lat: 39,
        lon: -76,
      },
    },
    before = structuredClone(runtime),
    r = meteorologySourceSnapshot(runtime, now);
  assert.equal(r.classification, 'forecast-model');
  assert.equal(r.ageSeconds, 120);
  assert.equal(r.values.windMps, 4);
  assert.deepEqual(runtime, before);
  assert.deepEqual(validateMeteorologySource(r, now), r);
  const unavailable = meteorologySourceSnapshot({}, now);
  assert.equal(unavailable.classification, 'unavailable');
  assert.equal(unavailable.ageSeconds, null);
  assert.equal(unavailable.values, null);
  assert.equal(
    meteorologySourceSnapshot(
      {
        weatherMode: 'clear',
        weatherState: { source: 'manual', issuedAt: runtime.liveWeatherState.issuedAt },
      },
      now
    ).ageBand,
    'not-available'
  );
  assert.throws(
    () => validateMeteorologySource({ ...r, classification: 'unavailable' }, now),
    /source issue/
  );
});
test('three complete weather studies keep a miss and north-crossing error, immutable forecasts and once-only cards', () => {
  let state,
    events = [];
  for (const [i, id] of ['campaign', 'freshening', 'turning-north'].entries()) {
    const h = meteorologyHarness(state, id, 'weather-case-' + i + '-0001');
    h.accept();
    h.source();
    h.measure();
    h.measure();
    h.forecast();
    assert.throws(() => h.forecast({ speedLow: 6, speedHigh: 8 }), /current weather-study/);
    h.measure();
    h.measure();
    const v = meteorologyVerification(h.state.active);
    if (id === 'freshening') {
      assert.equal(v.speedInRange, false);
      assert.equal(h.state.active.forecast.speedLow, 3);
    }
    if (id === 'turning-north') assert.ok(Math.abs(v.directionError - 20) < 1e-8);
    h.report();
    events.push(...h.events);
    state = h.state;
  }
  assert.equal(Object.keys(state.completed).length, 3);
  assert.equal(events.filter((e) => e.metadata.meteorologyReport).length, 3);
  assert.equal(meteorologyCareerBadge(state).label, 'Weather Observer');
  assert.doesNotThrow(() => validateMeteorologyCareerBackup(state, events, []));
  const h = meteorologyHarness(state);
  h.accept();
  assert.deepEqual(h.state.active.readings, state.records.campaign.readings);
  assert.equal(h.events[0].projections.journal, false);
  assert.equal(h.events[0].metadata.meteorologyReport, undefined);
  assert.equal(meteorologyDirectionDifference(350, 10), -20);
});
test('weather methods reject a wrong reference, geometry, convention and premature verification', () => {
  const h = meteorologyHarness();
  h.accept();
  h.source();
  assert.throws(() => h.measure((r) => (r.referenceTime += 3600000)), /declared replay/);
  assert.throws(() => h.measure((r) => (r.heightMeters = 2.4)), /declared replay/);
  assert.throws(() => h.measure(null, { windMeaning: 'toward' }), /wind-from/);
  h.measure();
  h.measure();
  h.forecast();
  assert.throws(
    () => h.measure((r) => (r.startedAt = h.state.active.forecast.recordedAt - 1)),
    /before observing/
  );
  h.measure();
  h.measure();
  assert.throws(() => h.report({ limit: 'public-forecast-validated' }), /replay/);
});
test('weather backup replay retains raw evidence and future schemas fail closed', () => {
  const h = meteorologyHarness();
  h.accept();
  h.source();
  h.measure();
  h.measure();
  h.forecast();
  h.measure();
  h.measure();
  h.report();
  const altered = structuredClone(h.events);
  altered.find((e) => e.metadata.action.reading).metadata.action.reading.samples[1].rotorAngle +=
    0.1;
  assert.throws(() => validateMeteorologyCareerBackup(h.state, altered, []), /incomplete/);
  const future = { schemaVersion: 2, revision: 999, privateFutureData: { kept: true } };
  assert.deepEqual(normalizeMeteorologyCareer(future), future);
  assert.throws(
    () => transitionMeteorologyCareer(future, { type: 'accept', revision: 999 }, 1000000),
    /newer/
  );
});
