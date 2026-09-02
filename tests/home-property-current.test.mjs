import assert from 'node:assert/strict';
import test from 'node:test';

import { createHousingModel, hasStableMappedIdentity, makeHomeCandidates } from '../app/js/real-estate/housing-model.js';
import { createLocalCommerceModel, STARTING_EXPLORER_CREDITS } from '../app/js/urban-sandbox/commerce-model.js';
import { createEquipmentInventory } from '../app/js/urban-sandbox/equipment-model.js';
import { mappedBuildingAddress } from '../app/js/real-estate/public-address.js';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function mappedBuilding(overrides = {}) {
  return {
    sourceBuildingId: 'osm:way:42',
    buildingType: 'house',
    levels: 1,
    baseY: 4,
    pts: [{ x: 20, z: 20 }, { x: 28, z: 20 }, { x: 28, z: 28 }, { x: 20, z: 28 }],
    ...overrides
  };
}

test('public mapped addresses omit private resident fields and never invent missing values', () => {
  const address = mappedBuildingAddress({
    'addr:housenumber': '12', 'addr:street': 'Harbor Street', 'addr:city': 'Baltimore',
    'addr:state': 'Maryland', 'addr:postcode': '21201', 'contact:email': 'private@example.test', 'addr:unit': '4B'
  });
  assert.equal(address.formatted, '12 Harbor Street, Baltimore, Maryland, 21201');
  assert.equal('email' in address, false);
  assert.equal('unit' in address, false);
  assert.equal(mappedBuildingAddress({ building: 'house' }), null);
});

test('nearby homes come from stable loaded-world buildings and exclude transport structures', () => {
  const candidates = makeHomeCandidates([
    mappedBuilding(),
    mappedBuilding({ sourceBuildingId: 'road-guard', buildingType: 'bridge_guardrail' })
  ], {
    actor: { x: 0, z: 0 },
    locationId: 'baltimore:39.29:-76.61',
    locationLabel: 'Baltimore',
    worldToGeo: (x, z) => ({ lat: 39.29 - z / 100000, lon: -76.61 + x / 100000 })
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sourceBuildingId, 'osm:way:42');
  assert.equal(candidates[0].locationId, 'baltimore:39.29:-76.61');
  assert.equal(candidates[0].locationLabel, 'Baltimore');
  assert.equal(candidates[0].x, 24);
  assert.equal(candidates[0].z, 24);
  assert.match(candidates[0].id, /^home:baltimore:39\.29:-76\.61:osm:way:42$/);
  assert.equal(candidates[0].provenance, 'loaded-world-building');
});

test('generated scene pieces cannot enter connected property ownership', () => {
  assert.equal(hasStableMappedIdentity('osm:way:12345'), true);
  assert.equal(hasStableMappedIdentity('overture:01234567-89ab-cdef-0123-456789abcdef'), true);
  assert.equal(hasStableMappedIdentity('overture:building-123'), false);
  assert.equal(hasStableMappedIdentity('shortbread:buildings:12:34:56:78:0'), true);
  assert.equal(hasStableMappedIdentity('fallback-1-20-30'), false);
  assert.equal(hasStableMappedIdentity('dynamic:airport-ticket-hall'), false);
  assert.equal(hasStableMappedIdentity('inferred:abcd1234'), false);
  assert.equal(hasStableMappedIdentity('osm:way:42:guardrail:1:left'), false);
});

test('buying, home storage, withdrawal, selling, and reload conserve credits and items', () => {
  const storage = memoryStorage();
  const inventory = createEquipmentInventory();
  inventory.upsertItem({
    instanceId: 'mission:sample-1',
    catalogId: 'mission-sample',
    quantity: 2,
    tradeable: true,
    provenance: 'space-mission',
    metadata: { label: 'Mineral sample', category: 'material', icon: 'SAMPLE', verbs: ['inspect'] }
  }, { definition: { id: 'mission-sample', label: 'Mineral sample', category: 'material', icon: 'SAMPLE', verbs: ['inspect'] } });
  const economy = createLocalCommerceModel({ storage, inventory, now: () => 1000 });
  const candidates = makeHomeCandidates([mappedBuilding()], {
    actor: { x: 0, z: 0 }, locationId: 'test-place', locationLabel: 'Test Place'
  });
  const home = candidates[0];
  assert.ok(home.price <= STARTING_EXPLORER_CREDITS, 'the smallest mapped home should be reachable with starting credits');

  let actor = { x: home.x, z: home.z };
  const model = createHousingModel({ storage, economy, inventory, now: () => 2000, getActorPosition: () => actor, getActiveLocationId: () => 'test-place', storageAccessRadius: 45 });
  const bought = model.buy(home);
  assert.equal(bought.ok, true);
  assert.equal(economy.wallet().credits, STARTING_EXPLORER_CREDITS - home.price);
  assert.equal(model.snapshot(candidates).primaryHomeId, home.id);

  actor = { x: home.x + 100, z: home.z };
  assert.equal(model.storeItem(home.id, 'mission:sample-1', 1).reason, 'home_too_far');
  actor = { x: home.x, z: home.z };

  const stored = model.storeItem(home.id, 'mission:sample-1', 1);
  assert.equal(stored.ok, true);
  assert.equal(inventory.snapshot().items.find((item) => item.instanceId === 'mission:sample-1').quantity, 1);
  assert.equal(model.snapshot().homes[0].storage[0].quantity, 1);
  assert.equal(model.sell(home.id).reason, 'storage_not_empty');

  const reloaded = createHousingModel({ storage, economy, inventory, now: () => 3000, getActorPosition: () => actor, getActiveLocationId: () => 'test-place', storageAccessRadius: 45 });
  assert.equal(reloaded.snapshot().homes.length, 1);
  assert.equal(reloaded.snapshot().homes[0].storage[0].label, 'Mineral sample');

  const withdrawn = reloaded.withdrawItem(home.id, 'mission:sample-1', 1);
  assert.equal(withdrawn.ok, true);
  assert.equal(inventory.snapshot().items.find((item) => item.instanceId === 'mission:sample-1').quantity, 2);
  assert.equal(reloaded.snapshot().homes[0].storage.length, 0);

  const sold = reloaded.sell(home.id);
  assert.equal(sold.ok, true);
  assert.equal(reloaded.snapshot().homes.length, 0);
  assert.equal(economy.wallet().credits, STARTING_EXPLORER_CREDITS - home.price + Math.floor(home.price * .85));
});

test('failed purchases do not mint a home or change the wallet', () => {
  const storage = memoryStorage();
  const inventory = createEquipmentInventory();
  const economy = createLocalCommerceModel({ storage, inventory });
  const model = createHousingModel({ storage, economy, inventory });
  const expensive = { ...makeHomeCandidates([mappedBuilding()], { locationId: 'expensive' })[0], price: 9999 };

  const result = model.buy(expensive);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_enough_credits');
  assert.equal(model.snapshot().homes.length, 0);
  assert.equal(economy.wallet().credits, STARTING_EXPLORER_CREDITS);
});
