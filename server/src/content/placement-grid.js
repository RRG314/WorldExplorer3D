function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapBuildPosition(position = {}) {
  return Object.freeze({
    x: Math.round(finite(position.x)),
    y: Math.round(finite(position.y) * 2) / 2,
    z: Math.round(finite(position.z))
  });
}

function buildOccupancyKey(cellKey, position = {}) {
  const snapped = snapBuildPosition(position);
  return `${String(cellKey || '')}:${snapped.x}:${snapped.y}:${snapped.z}`;
}

export { buildOccupancyKey, snapBuildPosition };
