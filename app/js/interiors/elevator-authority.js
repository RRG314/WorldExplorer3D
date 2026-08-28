function elevatorFloorChoices(floorPlan = {}, currentLevel = 0) {
  const count = Math.max(1, Math.round(Number(floorPlan.floorCount) || 1));
  const active = Math.max(0, Math.min(count - 1, Math.round(Number(currentLevel) || 0)));
  return Object.freeze(Array.from({ length: count }, (_, level) => Object.freeze({
    level,
    label: level === 0 ? 'Lobby' : `Floor ${level + 1}`,
    current: level === active,
    direction: level === active ? 'current' : level > active ? 'up' : 'down'
  })));
}

export { elevatorFloorChoices };
