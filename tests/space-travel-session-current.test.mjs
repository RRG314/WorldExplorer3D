import assert from 'node:assert/strict';
import test from 'node:test';

import { SPACE_CRAFT_IDENTITY } from '../app/js/space/craft-identity.js';
import {
  installSpaceTravelSession,
  SPACE_GUIDANCE_MODE,
  SPACE_TRAVEL_LOCATION,
  SPACE_TRAVEL_PHASE
} from '../app/js/space/travel-session.js';

test('one session owns the active craft, destination, phase, and guidance', () => {
  const context = {};
  installSpaceTravelSession(context);
  const started = context.beginSpaceTravelSession({
    activeCraftId: SPACE_CRAFT_IDENTITY.pod.id,
    location: SPACE_TRAVEL_LOCATION.LOCAL_SPACE,
    phase: SPACE_TRAVEL_PHASE.RENDEZVOUS,
    sourceBodyId: 'earth',
    destination: {
      id: SPACE_CRAFT_IDENTITY.starship.id,
      kind: 'starship',
      name: SPACE_CRAFT_IDENTITY.starship.name
    },
    guidance: SPACE_GUIDANCE_MODE.MANUAL
  });
  assert.equal(started.activeCraftId, 'pathfinder-pod');
  assert.equal(started.destination.id, 'solis-reach');
  assert.equal(context.getActiveSpaceCraftId(), 'pathfinder-pod');

  const docked = context.updateSpaceTravelSession({
    activeCraftId: SPACE_CRAFT_IDENTITY.starship.id,
    location: SPACE_TRAVEL_LOCATION.STARSHIP,
    phase: SPACE_TRAVEL_PHASE.DOCKED,
    destination: null,
    guidance: SPACE_GUIDANCE_MODE.ASSISTED,
    reason: 'pathfinder-docked'
  });
  assert.equal(docked.activeCraftId, 'solis-reach');
  assert.equal(docked.destination, null);
  assert.equal(docked.phase, 'docked');
  assert.equal(docked.guidance, 'assisted');
});

test('Wayfinder can be guidance but can never become the active craft', () => {
  const context = {};
  installSpaceTravelSession(context);
  const started = context.beginSpaceTravelSession({
    activeCraftId: SPACE_CRAFT_IDENTITY.navigation.id,
    destination: { id: 'mars', kind: 'body', name: 'Mars' },
    guidance: SPACE_GUIDANCE_MODE.ASSISTED
  });
  assert.equal(started.activeCraftId, SPACE_CRAFT_IDENTITY.starship.id);
  assert.equal(started.guidance, SPACE_GUIDANCE_MODE.ASSISTED);
  const updated = context.updateSpaceTravelSession({ activeCraftId: SPACE_CRAFT_IDENTITY.navigation.id });
  assert.equal(updated.activeCraftId, SPACE_CRAFT_IDENTITY.starship.id);
});

test('ending a flight clears transient travel state without preserving a stale landing phase', () => {
  const context = {};
  installSpaceTravelSession(context);
  context.beginSpaceTravelSession({
    activeCraftId: SPACE_CRAFT_IDENTITY.pod.id,
    location: SPACE_TRAVEL_LOCATION.SURFACE,
    phase: SPACE_TRAVEL_PHASE.LANDED,
    sourceBodyId: 'europa',
    destination: { id: 'europa', kind: 'body', name: 'Europa' }
  });
  const ended = context.endSpaceTravelSession('returned-to-world');
  assert.equal(ended.active, false);
  assert.equal(ended.phase, SPACE_TRAVEL_PHASE.INACTIVE);
  assert.equal(ended.activeCraftId, null);
  assert.equal(ended.destination, null);
  assert.equal(context.getActiveSpaceCraftId(), null);
});
