function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function rounded(value, decimals = 6) {
  const factor = 10 ** decimals;
  const result = Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function placementRecord(placement = {}) {
  return {
    x: finite(placement.x, 'Surface placement X'),
    y: finite(placement.y, 'Surface placement Y'),
    z: finite(placement.z, 'Surface placement Z')
  };
}

function planetaryBlockStorageCoordinates(renderGrid = {}, placement = {}) {
  const origin = placementRecord(placement);
  return Object.freeze({
    gx: rounded(finite(renderGrid.gx, 'Render grid X') - origin.x),
    gy: rounded(finite(renderGrid.gy, 'Render grid Y') - origin.y),
    gz: rounded(finite(renderGrid.gz, 'Render grid Z') - origin.z)
  });
}

function planetaryBlockRenderCoordinates(storedGrid = {}, placement = {}) {
  const origin = placementRecord(placement);
  return Object.freeze({
    gx: rounded(finite(storedGrid.gx, 'Stored grid X') + origin.x),
    gy: rounded(finite(storedGrid.gy, 'Stored grid Y') + origin.y),
    gz: rounded(finite(storedGrid.gz, 'Stored grid Z') + origin.z)
  });
}

export {
  planetaryBlockRenderCoordinates,
  planetaryBlockStorageCoordinates
};
