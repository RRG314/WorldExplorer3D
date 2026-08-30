import assert from 'node:assert/strict';
import test from 'node:test';

import { createEquipmentInventory } from '../app/js/urban-sandbox/equipment-model.js';
import {
  COMMERCE_STORAGE_KEY,
  createLocalCommerceModel,
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
  assert.equal(stores[0].id, 'node:123');
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
});

test('buy, sell, daily rare trade, and Explorer Credits persist locally', () => {
  const storage = memoryStorage();
  const inventory = createEquipmentInventory();
  const now = () => Date.parse('2026-08-27T15:00:00Z');
  const commerce = createLocalCommerceModel({ storage, inventory, now });
  const initial = commerce.snapshot(store);
  assert.equal(initial.credits, 120);
  assert.equal(initial.inventoryAuthority, 'world-explorer-gameplay');
  assert.equal(initial.placeAuthority, 'loaded-map-poi');

  const purchased = commerce.buy(store, initial.standard[0].id);
  assert.equal(purchased.ok, true);
  assert.equal(inventory.snapshot().items.find((item) => item.catalogId === initial.standard[0].id)?.tradeable, true);
  assert.equal(commerce.snapshot(store).credits, 120 - initial.standard[0].buyPrice);

  const boughtItem = inventory.snapshot().items.find((item) => item.catalogId === initial.standard[0].id);
  const sold = commerce.sell(store, boughtItem.instanceId);
  assert.equal(sold.ok, true);
  assert.equal(commerce.snapshot(store).credits, 120 - initial.standard[0].buyPrice + initial.standard[0].sellPrice);

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
