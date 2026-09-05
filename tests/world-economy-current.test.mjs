import assert from 'node:assert/strict';
import test from 'node:test';

import { getShipProfile } from '../app/js/expedition/catalog.js';
import { createExpeditionPlan } from '../app/js/expedition/model.js';
import { getShipStationView } from '../app/js/expedition/ship-operations.js';
import { approvedSampleTradeValue, summarizeExpeditionTransfers } from '../app/js/resources/material-catalog.js';
import { createEquipmentInventory } from '../app/js/urban-sandbox/equipment-model.js';
import {
  COMMERCE_STORAGE_KEY,
  createLocalCommerceModel,
  mappedCommercePlaces,
  STARTING_EXPLORER_CREDITS,
  stockForStore
} from '../app/js/urban-sandbox/commerce-model.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

test('mapped place identity selects a game commerce role without claiming real stock or prices', () => {
  const places = mappedCommercePlaces([
    { type: 'shop=convenience', sourceFeatureId: 'node:1', name: 'Corner Market', x: 1, z: 2 },
    { type: 'amenity=fuel', sourceFeatureId: 'node:2', name: 'Fuel Stop', x: 2, z: 3 },
    { type: 'shop=hardware', sourceFeatureId: 'node:3', name: 'Hardware', x: 3, z: 4 },
    { type: 'shop=pawnbroker', sourceFeatureId: 'node:4', name: 'Pawn', x: 4, z: 5 },
    { type: 'shop=car_repair', sourceFeatureId: 'node:5', name: 'Mechanic', x: 5, z: 6 },
    { type: 'amenity=cafe', sourceFeatureId: 'node:6', name: 'Cafe', x: 6, z: 7 }
  ]);
  assert.deepEqual(places.map((place) => place.kind), ['convenience', 'fuel', 'hardware', 'pawn', 'mechanic']);
  assert.equal(places.every((place) => place.provenance === 'loaded-map-poi'), true);
  assert.equal(places.every((place) => place.mappedType.includes('=')), true);
});

test('business classes have stable, distinct game stock and no immediate buy-sell profit loop', () => {
  const base = { id: 'node:shop', name: 'Mapped place', x: 1, z: 1 };
  const hardware = stockForStore({ ...base, kind: 'hardware' }, '2026-08-31');
  const convenience = stockForStore({ ...base, kind: 'convenience' }, '2026-08-31');
  assert.notDeepEqual(hardware.standard.map((item) => item.id), convenience.standard.map((item) => item.id));
  assert.ok(hardware.standard.some((item) => item.category === 'material' || item.category === 'repair-supply'));
  assert.equal([...hardware.standard, ...convenience.standard].every((item) => item.buyPrice > item.sellPrice), true);
});

test('one persistent Explorer wallet migrates legacy balances and serves every mapped business class', () => {
  const storage = memoryStorage({
    [COMMERCE_STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, credits: 73, purchases: {}, claimedTrades: {}, transactions: [] })
  });
  const inventory = createEquipmentInventory();
  const economy = createLocalCommerceModel({ storage, inventory, now: () => Date.parse('2026-08-31T12:00:00Z') });
  const hardware = { id: 'node:hardware', name: 'Hardware', kind: 'hardware', provenance: 'loaded-map-poi' };
  const snapshot = economy.snapshot(hardware);
  assert.equal(economy.type, 'WorldExplorerEconomy');
  assert.equal(snapshot.credits, 146000);
  const material = snapshot.standard.find((item) => item.category === 'material' || item.category === 'repair-supply');
  assert.ok(material);
  assert.equal(economy.buy(hardware, material.id).ok, true);
  assert.equal(JSON.parse(storage.getItem(COMMERCE_STORAGE_KEY)).schemaVersion, 3);
});

test('Earth material bundles keep exact mass when prepared for Surveyor cargo', () => {
  const inventory = createEquipmentInventory();
  inventory.upsertItem({ instanceId: 'earth:metal', catalogId: 'reclaimed-aluminum-stock', quantity: 2, metadata: {} });
  inventory.upsertItem({ instanceId: 'earth:parts', catalogId: 'sealed-bearing-kit', quantity: 1, metadata: {} });
  const transfer = summarizeExpeditionTransfers(inventory.snapshot().items);
  assert.equal(transfer.totalMassKg, 6);
  assert.deepEqual(transfer.resources, { feedstockKg: 4, maintenanceKg: 2 });
  assert.equal(transfer.transfers.reduce((sum, entry) => sum + entry.massKg, 0), transfer.totalMassKg);
});

test('the existing Surveyor cargo station owns Earth-to-space material loading', () => {
  const expedition = createExpeditionPlan({
    destinationId: 'proxima-centauri',
    shipId: getShipProfile('long-range-research-vessel').id
  });
  const cargo = getShipStationView(expedition, 'cargo-status');
  assert.ok(cargo.actions.some((action) => action.id === 'load-backpack-materials' && action.enabled));
});

test('only processed and Analysis-approved science samples receive a game trade value', () => {
  const sample = { massKg: 4, processed: true, analysisApproved: true, recoveryRequirement: null };
  assert.equal(approvedSampleTradeValue(sample), 52);
  assert.equal(approvedSampleTradeValue({ ...sample, processed: false }), 0);
  assert.equal(approvedSampleTradeValue({ ...sample, analysisApproved: false }), 0);
  assert.equal(approvedSampleTradeValue({ ...sample, recoveryRequirement: { kind: 'repair-feedstock' } }), 0);
});

test('approved research lots are sellable only to their game-authorized business classes', () => {
  const inventory = createEquipmentInventory();
  inventory.registerDefinitions([{ id: 'approved:sample', label: 'Approved sample lot', category: 'research-sample', icon: 'SAMPLE', verbs: ['inspect'], stackLimit: 1 }]);
  inventory.upsertItem({
    instanceId: 'approved:sample:lot', catalogId: 'approved:sample', quantity: 1, tradeable: true,
    metadata: { label: 'Approved sample lot', category: 'research-sample', commerceSellValue: 52, allowedCommerceKinds: ['pawn', 'hardware'] }
  });
  const economy = createLocalCommerceModel({ storage: memoryStorage(), inventory, now: () => Date.parse('2026-08-31T12:00:00Z') });
  const convenience = economy.snapshot({ id: 'store:convenience', name: 'Corner shop', kind: 'convenience' });
  const pawn = economy.snapshot({ id: 'store:pawn', name: 'Research exchange', kind: 'pawn' });
  assert.equal(convenience.sellable.some((item) => item.instanceId === 'approved:sample:lot'), false);
  assert.equal(pawn.sellable.some((item) => item.instanceId === 'approved:sample:lot'), true);
  assert.equal(economy.sell({ id: 'store:convenience', name: 'Corner shop', kind: 'convenience' }, 'approved:sample:lot').reason, 'store_not_authorized_for_item');
  assert.equal(economy.sell({ id: 'store:pawn', name: 'Research exchange', kind: 'pawn' }, 'approved:sample:lot').credits, STARTING_EXPLORER_CREDITS + 52);
});
