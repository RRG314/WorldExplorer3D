const MATERIAL_STATE_KEY = 'planetarySurfaceSkyState';
const OBJECT_STATE_KEY = 'planetarySurfaceSkyObjectState';
let planetaryHorizonPlane = null;

function ensurePlanetaryHorizonPlane() {
  if (planetaryHorizonPlane) return planetaryHorizonPlane;
  if (globalThis.THREE?.Plane && globalThis.THREE?.Vector3) {
    planetaryHorizonPlane = new globalThis.THREE.Plane(new globalThis.THREE.Vector3(0, 1, 0), 0);
  } else {
    planetaryHorizonPlane = { isPlane: true, normal: { x: 0, y: 1, z: 0 }, constant: 0 };
  }
  return planetaryHorizonPlane;
}

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
            transparent: material.transparent,
            clippingPlanes: material.clippingPlanes,
            clipIntersection: material.clipIntersection,
            clipShadows: material.clipShadows
          });
        }
        material.depthTest = true;
        material.depthWrite = false;
        material.transparent = true;
        material.clippingPlanes = [ensurePlanetaryHorizonPlane()];
        material.clipIntersection = false;
        material.clipShadows = false;
      } else {
        const state = material.userData[MATERIAL_STATE_KEY];
        if (!state) return;
        material.depthTest = state.depthTest;
        material.depthWrite = state.depthWrite;
        material.transparent = state.transparent;
        material.clippingPlanes = state.clippingPlanes;
        material.clipIntersection = state.clipIntersection;
        material.clipShadows = state.clipShadows;
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

function updatePlanetaryStarHorizon(starField, cameraY) {
  if (starField?.userData?.planetarySurfaceOcclusion !== true || !Number.isFinite(Number(cameraY))) return false;
  ensurePlanetaryHorizonPlane().constant = -Number(cameraY) + 0.04;
  return true;
}

export { setPlanetaryStarOcclusion, updatePlanetaryStarHorizon };
