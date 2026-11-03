import test from 'node:test';
import assert from 'node:assert/strict';
import { lunarSampleId, lunarSamplesAboard } from '../app/js/planetary/lunar-samples.js';
import { canAnalyzeDestination } from '../app/js/universe/mission-progression.js';
test('old lunar specimens cannot satisfy a repeat study and original sample identities stay unchanged', () => {
  const ids = ['mare-sample', 'fragment-sample'],
    carried = new Set(ids.map((id) => lunarSampleId(id))),
    ctx = { playerBackpackInventory: { has: (id) => carried.has(id) } };
  assert.equal(lunarSampleId('mare-sample'), 'lunar-field-book:mare-sample');
  assert.equal(lunarSamplesAboard(ctx), true);
  for (const mission of ['mission:moon:alternate-method', 'mission:moon:planned-return']) {
    assert.equal(lunarSamplesAboard(ctx, mission), false);
    ids.forEach((id) => carried.add(lunarSampleId(id, mission)));
    assert.equal(lunarSamplesAboard(ctx, mission), true);
  }
  assert.equal(carried.size, 6);
  assert.throws(() => lunarSampleId('mare-sample', 'unrecognized'), /supported/);
});
test('the existing ship-lab custody gate checks the selected repeat instance without a snapshot recursion', () => {
  const missionId = 'mission:moon:planned-return',
    carried = new Set(['mare-sample', 'fragment-sample'].map((id) => lunarSampleId(id))),
    ctx = {
      activeShipInterior: true,
      universeRuntime: { current: { id: 'sol' } },
      getShipInteriorSnapshot: () => ({ active: true, shipId: 'solis-reach', deckId: 'command' }),
      getInterstellarExpeditionSnapshot: () => ({
        id: 'expedition',
        state: 'planned',
        podJourney: {
          id: 'pod',
          phase: 'recovered',
          expeditionId: 'expedition',
          bodyId: 'moon',
          returnFrameId: 'sol',
        },
      }),
      Walk: { state: { walker: { x: 0, z: 0 } } },
      activeInterior: { interactions: [{ id: 'analysis-review', x: 0, z: 0 }] },
      playerBackpackInventory: { has: (id) => carried.has(id) },
      getDestinationMissionSnapshot() {
        throw Error('Do not recurse through snapshot');
      },
    },
    mission = {
      destinationId: 'moon',
      systemId: 'sol',
      operation: 'surface-survey',
      preparation: { strategy: 'samples' },
      surveyMissionId: missionId,
    };
  assert.equal(canAnalyzeDestination(ctx, mission), false);
  ['mare-sample', 'fragment-sample'].forEach((id) => carried.add(lunarSampleId(id, missionId)));
  assert.equal(canAnalyzeDestination(ctx, mission), true);
  assert.equal(
    canAnalyzeDestination(ctx, { ...mission, preparation: { strategy: 'observe' } }),
    true,
  );
});

test('explicit direct ship entry folds only the landed Earth shuttle return and preserves its identity', async () => {
  const { createPodJourney, completeDirectEarthShuttleReturn, POD_ROUTE_KIND } = await import(
    '../app/js/expedition/pod-journey-authority.js'
  );
  const j = createPodJourney({
    expeditionId: 'trip',
    contactId: 'earth:baltimore',
    bodyId: 'earth',
    returnFrameId: 'sol',
    routeKind: POD_ROUTE_KIND.EARTH_SHUTTLE,
    initialPhase: 'surface',
    atMs: 100,
  });
  const r = completeDirectEarthShuttleReturn(j, { shipEntered: true, frameId: 'sol', atMs: 200 });
  assert.equal(r.accepted, true);
  assert.equal(r.journey.id, j.id);
  assert.equal(r.journey.phase, 'recovered');
  assert.equal(j.phase, 'surface');
  assert.equal(r.journey.updatedAtMs, 200);
  assert.equal(completeDirectEarthShuttleReturn(j, { frameId: 'sol' }).accepted, false);
  assert.equal(
    completeDirectEarthShuttleReturn(j, { shipEntered: true, frameId: 'proxima-centauri' })
      .accepted,
    false,
  );
  assert.equal(
    completeDirectEarthShuttleReturn(
      { ...j, bodyId: 'moon', routeKind: 'ship-surface-round-trip' },
      { shipEntered: true, frameId: 'sol' },
    ).accepted,
    false,
  );
});
