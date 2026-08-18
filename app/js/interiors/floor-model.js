const DEFAULT_STORY_HEIGHT = 3.4;
const MAX_PUBLISHED_FLOORS = 3;
const MAX_BUILDING_FLOORS = 8;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(finite(value, min))));
}

function deriveInteriorFloorPlan(definition = {}, footprintBounds = {}) {
  const building = definition.support?.building || definition.building || {};
  const mappedLevels = finite(building.levels, 0);
  const heightLevels = finite(building.height, 0) > 0
    ? Math.round(finite(building.height, 0) / DEFAULT_STORY_HEIGHT)
    : 0;
  const requestedFloors = Math.max(1, mappedLevels, heightLevels);
  const width = Math.max(0, finite(footprintBounds.width, 0));
  const depth = Math.max(0, finite(footprintBounds.depth, 0));
  const footprintArea = Math.max(0, width * depth);
  const connectorEligible = requestedFloors >= 2 && Math.min(width, depth) >= 8.5 && footprintArea >= 92;
  const floorCount = connectorEligible ? clampInteger(requestedFloors, 2, MAX_BUILDING_FLOORS) : 1;
  const storyHeight = DEFAULT_STORY_HEIGHT;
  const key = String(definition.key || building.sourceBuildingId || building.id || 'interior');
  const floors = Array.from({ length: floorCount }, (_, level) => Object.freeze({
    id: `${key}:floor:${level}`,
    level,
    label: level === 0 ? 'Lobby' : `Floor ${level + 1}`
  }));
  return Object.freeze({
    key,
    floorCount,
    storyHeight,
    connectorEligible,
    floors: Object.freeze(floors)
  });
}

function loadedInteriorLevels(floorPlan, activeLevel = 0) {
  const count = Math.max(1, Number(floorPlan?.floorCount) || 1);
  const active = clampInteger(activeLevel, 0, count - 1);
  const levels = [active];
  if (active > 0) levels.unshift(active - 1);
  if (active + 1 < count) levels.push(active + 1);
  return Object.freeze(levels.slice(0, MAX_PUBLISHED_FLOORS));
}

function interiorFloorIdentity(floorPlan, level = 0) {
  const count = Math.max(1, Number(floorPlan?.floorCount) || 1);
  const normalized = clampInteger(level, 0, count - 1);
  return floorPlan?.floors?.[normalized] || Object.freeze({
    id: `${String(floorPlan?.key || 'interior')}:floor:${normalized}`,
    level: normalized,
    label: normalized === 0 ? 'Lobby' : `Floor ${normalized + 1}`
  });
}

function nextElevatorLevel(floorPlan, activeLevel = 0) {
  const count = Math.max(1, Number(floorPlan?.floorCount) || 1);
  const active = clampInteger(activeLevel, 0, count - 1);
  return active + 1 < count ? active + 1 : 0;
}

export {
  DEFAULT_STORY_HEIGHT,
  MAX_BUILDING_FLOORS,
  MAX_PUBLISHED_FLOORS,
  deriveInteriorFloorPlan,
  interiorFloorIdentity,
  loadedInteriorLevels,
  nextElevatorLevel
};
