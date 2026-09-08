import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureStarterCompanion } from '../app/js/discovery/companion-runtime.js';
import { createCompanionInstance } from '../app/js/discovery/companions.js';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js';

test('starter bootstrap is idempotent and activates exactly one dog for a new Explorer', async () => {
  const store = createMemoryDiscoveryProfileStore();
  const first = await ensureStarterCompanion(store, { now: 100 });
  const second = await ensureStarterCompanion(store, { now: 200 });
  const companions = await store.listCompanions();
  const profile = await store.getProfile();

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(companions.length, 1);
  assert.equal(companions[0].catalogId, 'trail-hound');
  assert.equal(companions[0].active, true);
  assert.deepEqual(companions[0].residence, { state: 'traveling', homeId: '', updatedAt: 100 });
  assert.equal(profile.activeCompanionId, companions[0].instanceId);
  assert.equal(profile.companionOnboarding.starterDogGranted, true);
  assert.equal(profile.companionOnboarding.starterDogInstanceId, companions[0].instanceId);
  assert.equal(profile.companionOnboarding.starterDogGrantedAt, 100);
});

test('starter bootstrap never steals active selection from an existing Explorer', async () => {
  const existing = createCompanionInstance('harbor-cat', {
    worldIdentity: 'fixture', discoveryId: 'existing-cat', name: 'Harbor', adoptedAt: 50
  });
  const store = createMemoryDiscoveryProfileStore({ companions: [existing] });
  await store.setActiveCompanion(existing.instanceId, { now: 60 });
  await ensureStarterCompanion(store, { now: 100 });
  const companions = await store.listCompanions();

  assert.equal(companions.length, 2);
  assert.equal(companions.find((entry) => entry.active)?.instanceId, existing.instanceId);
  assert.equal(companions.filter((entry) => entry.isStarterCompanion).length, 1);
});

test('activation sends the previous companion home without deleting either record', async () => {
  const first = createCompanionInstance('trail-hound', {
    worldIdentity: 'fixture', discoveryId: 'dog', name: 'Dog', adoptedAt: 10
  });
  const second = createCompanionInstance('harbor-cat', {
    worldIdentity: 'fixture', discoveryId: 'cat', name: 'Cat', adoptedAt: 20
  });
  const store = createMemoryDiscoveryProfileStore({ companions: [first, second] });
  await store.setActiveCompanion(first.instanceId, { homeId: 'home:one', now: 30 });
  await store.setActiveCompanion(second.instanceId, { homeId: 'home:one', now: 40 });
  const companions = await store.listCompanions();

  assert.equal(companions.length, 2);
  assert.deepEqual(companions.find((entry) => entry.instanceId === first.instanceId).residence, {
    state: 'at-home', homeId: 'home:one', updatedAt: 40
  });
  assert.deepEqual(companions.find((entry) => entry.instanceId === second.instanceId).residence, {
    state: 'traveling', homeId: 'home:one', updatedAt: 40
  });
});
