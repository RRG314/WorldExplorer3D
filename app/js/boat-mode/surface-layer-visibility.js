const OPEN_OCEAN_SHORE_VISIBILITY_METERS = 1600;

function shouldSuppressOpenOceanSurfaceLayers(input = {}) {
  if (input.forceInactive === true || input.active !== true) return false;
  if (String(input.waterKind || '').toLowerCase() !== 'open_ocean') return false;
  const shorelineDistance = Number(input.shorelineDistance);
  // Unknown distance must keep land visible. Hiding a real coast is a worse
  // failure than drawing distant terrain behind an open-water scene.
  return Number.isFinite(shorelineDistance) && shorelineDistance > OPEN_OCEAN_SHORE_VISIBILITY_METERS;
}

function createSurfaceLayerSuppression(resolveLayers = () => []) {
  const previousVisibility = new Map();

  function setActive(active) {
    if (active) {
      const layers = Array.from(new Set((resolveLayers() || []).filter(Boolean)));
      layers.forEach((layer) => {
        if (!previousVisibility.has(layer)) previousVisibility.set(layer, layer.visible !== false);
        layer.visible = false;
      });
    } else {
      previousVisibility.forEach((visible, layer) => { layer.visible = visible; });
      previousVisibility.clear();
    }
    return previousVisibility.size;
  }

  return Object.freeze({
    setActive,
    snapshot: () => Object.freeze({ active: previousVisibility.size > 0, hiddenLayerCount: previousVisibility.size })
  });
}

export {
  OPEN_OCEAN_SHORE_VISIBILITY_METERS,
  createSurfaceLayerSuppression,
  shouldSuppressOpenOceanSurfaceLayers
};
