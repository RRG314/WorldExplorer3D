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

export { createSurfaceLayerSuppression };
