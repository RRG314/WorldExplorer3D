// Navigation intent is independent of map selection, rendering and route search.
// Retain only portable destination facts, never a building or scene object.
export function createNavigationState() {
  let destination = null;
  return Object.freeze({
    select(target, {owner = 'manual', world = 0} = {}) {
      if (!Number.isFinite(target?.x) || !Number.isFinite(target?.z)) return false;
      destination = Object.freeze({
        x: target.x,
        z: target.z,
        label: String(target.label || target.name || 'Destination'),
        owner: String(owner),
        world
      });
      return true;
    },
    clear(owner = null) {
      if (owner !== null && destination?.owner !== owner) return false;
      destination = null;
      return true;
    },
    current: () => destination
  });
}
