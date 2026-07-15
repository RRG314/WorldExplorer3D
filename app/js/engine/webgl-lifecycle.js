function disposeMaterialTextures(material) {
  if (!material || typeof material !== 'object') return;
  const textureKeys = [
    'map',
    'alphaMap',
    'aoMap',
    'bumpMap',
    'displacementMap',
    'emissiveMap',
    'envMap',
    'lightMap',
    'metalnessMap',
    'normalMap',
    'roughnessMap',
    'specularMap'
  ];
  textureKeys.forEach((key) => {
    const texture = material[key];
    if (texture && typeof texture.dispose === 'function') {
      texture.dispose();
    }
  });
}

export function disposeThreeObjectTree(root) {
  if (!root || typeof root.traverse !== 'function') return;
  root.traverse((child) => {
    if (!child) return;
    if (child.geometry && typeof child.geometry.dispose === 'function') {
      child.geometry.dispose();
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material) return;
      disposeMaterialTextures(material);
      if (typeof material.dispose === 'function') material.dispose();
    });
  });
}

export function disposeThreeRenderer(renderer) {
  if (!renderer) return null;
  try {
    renderer.setAnimationLoop?.(null);
  } catch {
    // Ignore renderer loop teardown issues.
  }
  try {
    renderer.renderLists?.dispose?.();
  } catch {
    // Ignore render list disposal issues.
  }
  try {
    renderer.dispose?.();
  } catch {
    // Ignore renderer disposal issues.
  }
  return null;
}

export function createAuxiliaryRenderer({
  canvas = null,
  optionsList = [{}],
  pixelRatioCap = 1.5,
  size = null
} = {}) {
  const attempts = Array.isArray(optionsList) && optionsList.length > 0 ? optionsList : [{}];
  for (let index = 0; index < attempts.length; index += 1) {
    try {
      const renderer = new THREE.WebGLRenderer({
        ...(canvas ? { canvas } : {}),
        ...attempts[index]
      });
      if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
        renderer.setSize(size.width, size.height, false);
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
      return renderer;
    } catch (error) {
      console.warn(`[webgl] auxiliary renderer attempt ${index + 1} failed`, error);
    }
  }
  return null;
}

export function getPrimaryWorldCanvas(appCtx) {
  return appCtx?.renderer?.domElement || null;
}
