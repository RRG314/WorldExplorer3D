import { roleHasCapability, CAPABILITIES } from '@we3d/mmo-contracts';

const CREATOR_STARTING_INVENTORY = Object.freeze({
  'block.cube': 80,
  'block.ramp': 30,
  'block.slab': 40,
  'block.wedge': 20,
  'block.column': 20,
  'block.cylinder': 20,
  'block.pyramid': 10,
  'block.stairs': 30,
  'block.wall': 50,
  'block.beam': 30,
  'block.roof': 30,
  'block.panel': 30,
  'vehicle.compact': 2,
  'vehicle.boat': 1,
  'vehicle.rover': 1
});

function normalizeInventory(input = {}, catalog) {
  const source = input && typeof input === 'object' ? input : {};
  const inventory = {};
  for (const asset of catalog.list()) {
    inventory[asset.id] = Math.max(0, Math.floor(Number(source[asset.id]) || 0));
  }
  return inventory;
}

function createInventoryPolicy(catalog) {
  return Object.freeze({
    initialForRole(role) {
      if (!roleHasCapability(role, CAPABILITIES.BUILD)) return normalizeInventory({}, catalog);
      return normalizeInventory(CREATOR_STARTING_INVENTORY, catalog);
    },
    normalize(input) {
      return normalizeInventory(input, catalog);
    }
  });
}

export { CREATOR_STARTING_INVENTORY, createInventoryPolicy, normalizeInventory };
