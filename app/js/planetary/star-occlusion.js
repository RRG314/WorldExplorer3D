const MATERIAL_STATE_KEY = 'planetarySurfaceSkyState';
const OBJECT_STATE_KEY = 'planetarySurfaceSkyObjectState';

function drawableSkyObject(object) {
  return object?.isPoints === true || object?.isLine === true || object?.isLineSegments === true;
}

function setPlanetaryStarOcclusion(starField, active) {
  if (!starField?.traverse) return 0;
  let changed = 0;
  starField.traverse((object) => {
    if (!drawableSkyObject(object) || object.userData?.skyHitbox || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      material.userData ||= {};
      if (active) {
        if (!material.userData[MATERIAL_STATE_KEY]) {
          material.userData[MATERIAL_STATE_KEY] = Object.freeze({
            depthTest: material.depthTest,
            depthWrite: material.depthWrite,
            transparent: material.transparent
          });
        }
        material.depthTest = true;
        material.depthWrite = false;
        material.transparent = true;
      } else {
        const state = material.userData[MATERIAL_STATE_KEY];
        if (!state) return;
        material.depthTest = state.depthTest;
        material.depthWrite = state.depthWrite;
        material.transparent = state.transparent;
        delete material.userData[MATERIAL_STATE_KEY];
      }
      material.needsUpdate = true;
      changed += 1;
    });
    object.userData ||= {};
    if (active) {
      if (!object.userData[OBJECT_STATE_KEY]) {
        object.userData[OBJECT_STATE_KEY] = Object.freeze({ renderOrder: object.renderOrder });
      }
      // Transparent stars must render after opaque planetary terrain so the
      // terrain depth buffer can hide the lower celestial hemisphere.
      object.renderOrder = 1000;
    } else if (object.userData[OBJECT_STATE_KEY]) {
      object.renderOrder = object.userData[OBJECT_STATE_KEY].renderOrder;
      delete object.userData[OBJECT_STATE_KEY];
    }
  });
  starField.userData ||= {};
  starField.userData.planetarySurfaceOcclusion = active === true;
  return changed;
}

export { setPlanetaryStarOcclusion };
