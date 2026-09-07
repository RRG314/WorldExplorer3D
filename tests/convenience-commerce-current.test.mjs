import assert from 'node:assert/strict';
import test from 'node:test';

import { createEquipmentInventory } from '../app/js/urban-sandbox/equipment-model.js';
import {
  COMMERCE_ITEM_DEFINITIONS,
  COMMERCE_STORAGE_KEY,
  STARTING_EXPLORER_CREDITS,
  createLocalCommerceModel,
  mappedCommercePlaces,
  mappedConvenienceStores,
  stockForStore
} from '../app/js/urban-sandbox/commerce-model.js';
import { fetchShortbreadWorldData } from '../app/js/world/shortbread-source.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

const store = Object.freeze({
  id: 'node:123', name: 'Mapped Corner Market', x: 4, z: 8,
  provider: 'OpenStreetMap', license: 'ODbL-1.0',
  attribution: '© OpenStreetMap contributors', provenance: 'loaded-map-poi'
});

test('only explicit mapped convenience shops become commerce places', () => {
  const stores = mappedConvenienceStores([
    { type: 'shop=convenience', sourceFeatureId: 'node:123', name: 'Corner Market', x: 4, z: 8 },
    { type: 'amenity=fuel', sourceFeatureId: 'node:456', name: 'Fuel only', x: 6, z: 10 },
    { type: 'shop=supermarket', sourceFeatureId: 'node:789', name: 'Supermarket', x: 9, z: 12 }
  ]);
  assert.equal(stores.length, 1);
  assert.equal(stores[0].id, 'poi:v1:openstreetmap:node:123');
  assert.deepEqual(stores[0].semantic.capabilities, ['retail.general']);
  assert.equal(stores[0].provenance, 'loaded-map-poi');
});

test('Shortbread mapped POI points preserve exact convenience tags', async () => {
  const feature = {
    id: 42,
    toGeoJSON() {
      return {
        type: 'Feature',
        properties: { shop: 'convenience', name: 'Mapped Corner Market' },
        geometry: { type: 'Point', coordinates: [-76.6122, 39.2904] }
      };
    }
  };
  const layer = { length: 1, feature: () => feature };
  const data = await fetchShortbreadWorldData({
    lat: 39.2904,
    lon: -76.6122,
    radius: 0.00001,
    includeBuildings: false,
    layerNames: ['pois'],
    shortbreadFetchTile: async () => ({ tile: { layers: { pois: layer } }, z: 14, x: 4705, y: 6264 })
  });
  const store = data.elements.find((element) => element.tags?.shop === 'convenience');
  assert.equal(store?.tags?.name, 'Mapped Corner Market');
  assert.equal(store?.tags?._sourceFeatureId, 'shortbread:pois:14:4705:6264:42');
  assert.equal(store?.lat, 39.2904);
  assert.equal(store?.lon, -76.6122);
  assert.equal(data._shortbreadTiles.capabilities.pois, 'shortbread-schema');
});

test('today stock is stable for one store/day and changes by store or day', () => {
  const first = stockForStore(store, '2026-08-27');
  const repeat = stockForStore(store, '2026-08-27');
  const nextDay = stockForStore(store, '2026-08-28');
  const otherStore = stockForStore({ ...store, id: 'node:999' }, '2026-08-27');
  assert.deepEqual(first, repeat);
  assert.notDeepEqual(
    [first.standard.map((item) => item.id), first.rare.itemId],
    [nextDay.standard.map((item) => item.id), nextDay.rare.itemId]
  );
  assert.notDeepEqual(
    [first.standard.map((item) => item.id), first.rare.itemId],
    [otherStore.standard.map((item) => item.id), otherStore.rare.itemId]
  );
  assert.ok(first.standard.every((item) => item.buyPrice > item.sellPrice), 'store resale values must not create a buy/sell credit loop');
  assert.ok(first.standard.some((item) => item.id === 'route-snack'), 'ordinary stores must always carry food');
});

test('food and medicine are consumable Backpack items with bounded health restoration', () => {
  const byId = new Map(COMMERCE_ITEM_DEFINITIONS.map((item) => [item.id, item]));
  for (const id of ['trail-water', 'route-snack', 'first-aid-pouch', 'field-medicine']) {
    assert.ok(byId.get(id)?.verbs.includes('consume'));
    assert.ok(byId.get(id)?.conditionRestore > 0 && byId.get(id)?.conditionRestore <= 1);
  }
});

test('buy, sell, daily rare trade, and Explorer Credits persist locally', () => {
  const storage = memoryStorage();
  const inventory = createEquipmentInventory();
  const now = () => Date.parse('2026-08-27T15:00:00Z');
  const commerce = createLocalCommerceModel({ storage, inventory, now });
  const initial = commerce.snapshot(store);
  assert.equal(initial.credits, STARTING_EXPLORER_CREDITS);
  assert.equal(initial.inventoryAuthority, 'world-explorer-gameplay');
  assert.equal(initial.placeAuthority, 'loaded-map-poi');

  const purchased = commerce.buy(store, initial.standard[0].id);
  assert.equal(purchased.ok, true);
  assert.equal(inventory.snapshot().items.find((item) => item.catalogId === initial.standard[0].id)?.tradeable, true);
  assert.equal(commerce.snapshot(store).credits, STARTING_EXPLORER_CREDITS - initial.standard[0].buyPrice);

  const boughtItem = inventory.snapshot().items.find((item) => item.catalogId === initial.standard[0].id);
  const sold = commerce.sell(store, boughtItem.instanceId);
  assert.equal(sold.ok, true);
  assert.equal(commerce.snapshot(store).credits, STARTING_EXPLORER_CREDITS - initial.standard[0].buyPrice + initial.standard[0].sellPrice);

  const rare = commerce.snapshot(store).rare;
  for (let index = 0; index < rare.requirementQuantity; index += 1) {
    const requirementInStock = commerce.snapshot(store).standard.find((item) => item.id === rare.requirementId);
    if (requirementInStock) {
      assert.equal(commerce.buy(store, rare.requirementId).ok, true);
    } else {
      inventory.upsertItem({
        instanceId: `commerce:${rare.requirementId}`,
        catalogId: rare.requirementId,
        quantity: index + 1,
        authority: 'anonymous-local',
        provenance: 'local-store-purchase',
        tradeable: true,
        metadata: { commerceSellValue: rare.requirement.sellPrice }
      }, { definition: rare.requirement });
    }
  }
  const traded = commerce.trade(store);
  assert.equal(traded.ok, true);
  assert.equal(commerce.trade(store).reason, 'already_traded_today');
  assert.ok(inventory.snapshot().items.some((item) => item.catalogId === rare.itemId));

  const persisted = JSON.parse(storage.getItem(COMMERCE_STORAGE_KEY));
  const reloaded = createLocalCommerceModel({ storage, inventory, now });
  assert.equal(reloaded.snapshot(store).credits, persisted.credits);
  assert.equal(reloaded.snapshot(store).rare.claimed, true);
});

test('signed-in commerce reads and writes the shared Explorer Wallet authority', async () => {
  const storage = memoryStorage();
  const inventory = createEquipmentInventory();
  let credits = STARTING_EXPLORER_CREDITS;
  const authority = {
    snapshot: () => ({ authority: 'explorer-wallet-v2', credits, pending: false, revision: 1 }),
    async transact(action, selectedStore, catalogId, fields) {
      assert.equal(fields.dayKey, '2026-08-27');
      const item = stockForStore(selectedStore, '2026-08-27').standard.find((entry) => entry.id === catalogId);
      const amount = action === 'buy' ? item.buyPrice : item.sellPrice;
      credits += action === 'buy' ? -amount : amount;
      return { accepted: true, action, requestId: `${action}-receipt`, itemId: `wallet:${catalogId}`, credits, storePurchased: 1 };
    },
    async settle(receipt, outcome) {
      return { ...receipt, credits, settlementStatus: outcome === 'applied' ? 'complete' : 'compensated' };
    }
  };
  const commerce = createLocalCommerceModel({ storage, inventory, now: () => Date.parse('2026-08-27T15:00:00Z'), transactionAuthority: authority });
  const item = commerce.snapshot(store).standard[0];
  const purchased = await commerce.buy(store, item.id);
  assert.equal(purchased.ok, true);
  assert.equal(commerce.snapshot(store).standard.find((entry) => entry.id === item.id).remaining, 2);
  assert.equal(commerce.wallet().credits, STARTING_EXPLORER_CREDITS - item.buyPrice);
  const carried = inventory.snapshot().items.find((entry) => entry.catalogId === item.id);
  assert.equal(carried.metadata.explorerWalletItem, `wallet:${item.id}`);
  const sold = await commerce.sell(store, carried.instanceId);
  assert.equal(sold.ok, true);
  assert.equal(commerce.wallet().credits, STARTING_EXPLORER_CREDITS - item.buyPrice + item.sellPrice);
});

test('veterinary service uses the same connected wallet transaction path', async () => {
  const inventory = createEquipmentInventory();
  let credits = STARTING_EXPLORER_CREDITS;
  const [vet] = mappedCommercePlaces([{
    type: 'amenity=veterinary', sourceFeatureId: 'node:vet-1', sourceElementType: 'node',
    sourceElementId: 'vet-1', name: 'Mapped Veterinary Clinic', x: 2, z: 3,
    tags: { amenity: 'veterinary' }
  }]);
  const authority = {
    snapshot: () => ({ authority: 'explorer-wallet-v2', credits, pending: false, revision: 1 }),
    async transact(action, selectedStore, catalogId, fields) {
      assert.equal(action, 'service');
      assert.equal(selectedStore.id, vet.id);
      assert.equal(catalogId, 'companion-wellness');
      assert.equal(fields.dayKey, '2026-08-27');
      credits -= 180;
      return { accepted: true, action, requestId: 'service-receipt', credits, settlementStatus: 'effect_pending' };
    },
    async settle(receipt, outcome) {
      return { ...receipt, credits, settlementStatus: outcome === 'applied' ? 'complete' : 'compensated' };
    }
  };
  const commerce = createLocalCommerceModel({
    storage: memoryStorage(), inventory, now: () => Date.parse('2026-08-27T15:00:00Z'), transactionAuthority: authority
  });
  assert.deepEqual(commerce.snapshot(vet).services.map((service) => service.id), ['companion-wellness']);
  const quantityBefore = inventory.snapshot().items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const result = await commerce.service(vet, 'companion-wellness', async () => true);
  assert.equal(result.ok, true);
  assert.equal(result.credits, STARTING_EXPLORER_CREDITS - 180);
  assert.equal(inventory.snapshot().items.reduce((sum, item) => sum + Number(item.quantity || 0), 0), quantityBefore);
});

test('every mapped mechanic exposes sequential upgrades through the same Explorer Wallet commerce path', async () => {
  const inventory = createEquipmentInventory();
  const [mechanic] = mappedCommercePlaces([{
    type: 'shop=car_parts', sourceFeatureId: 'node:parts-1', sourceElementType: 'node',
    sourceElementId: 'parts-1', name: 'Mapped Vehicle Parts', x: 2, z: 3,
    tags: { shop: 'car_parts' }
  }]);
  const commerce = createLocalCommerceModel({ storage: memoryStorage(), inventory, now: () => Date.parse('2026-08-27T15:00:00Z') });
  const services = commerce.snapshot(mechanic).services;
  assert.equal(mechanic.semantic.capabilities.includes('service.vehicleUpgrade'), true);
  assert.equal(services.filter((service) => service.id.startsWith('vehicle-upgrade:')).length, 12);
  const before = commerce.wallet().credits;
  const result = await commerce.service(mechanic, 'vehicle-upgrade:engine-tune:1', async () => true);
  assert.equal(result.ok, true);
  assert.equal(result.credits, before - 4000);
});

test('a service effect failure leaves the local wallet unchanged', async () => {
  const inventory = createEquipmentInventory();
  const [mechanic] = mappedCommercePlaces([{
    type: 'shop=car_repair', sourceFeatureId: 'node:repair-2', sourceElementType: 'node',
    sourceElementId: 'repair-2', name: 'Mapped Repair Shop', x: 2, z: 3,
    tags: { shop: 'car_repair' }
  }]);
  const commerce = createLocalCommerceModel({ storage: memoryStorage(), inventory, now: () => Date.parse('2026-08-27T15:00:00Z') });
  const before = commerce.wallet().credits;
  const result = await commerce.service(mechanic, 'vehicle-full-repair', async () => false);
  assert.equal(result.reason, 'service_effect_failed_refunded');
  assert.equal(commerce.wallet().credits, before);
});
