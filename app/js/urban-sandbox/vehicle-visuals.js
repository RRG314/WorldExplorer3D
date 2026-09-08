import { roadVehicleVisualRecipe } from '../transport/road-vehicle-visual-recipe.js?v=1';
import { transportDamagePresentation } from '../transport/damage-model.js?v=1';

function vehicleMaterials(root) {
  const materials = new Set();
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.filter(Boolean).forEach((material) => materials.add(material));
  });
  return [...materials];
}

function createUrbanVehicleVisual(THREE, definition = {}) {
  const variant = definition.variant || {};
  const recipe = roadVehicleVisualRecipe(variant);
  const root = new THREE.Group();
  root.name = `${variant.label || 'Urban vehicle'} curated-only visual host`;
  root.userData.vehicleId = definition.id || '';
  root.userData.vehicleStyle = 'curated-road-fleet-v1';
  root.userData.vehiclePresentation = 'curated-only-local-model';
  root.userData.proceduralVehicleMeshCount = 0;
  root.userData.vehicleDimensionsMeters = Object.freeze({
    width: Number(recipe.width),
    height: Number(recipe.height),
    length: Number(recipe.length)
  });

  // These anchors preserve the interaction contract without instantiating any
  // retired vehicle geometry while the curated model is loading.
  const doors = {};
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? 'Left front door interaction anchor' : 'Right front door interaction anchor';
    pivot.position.set(side * recipe.width * .455, 0, recipe.cabinZ + recipe.cabinLength * .37);
    root.add(pivot);
    doors[side < 0 ? 'left' : 'right'] = pivot;
  }

  const serviceRed = definition.serviceType === 'responder'
    ? new THREE.PointLight(0xff2435, 0, 7, 2)
    : null;
  const serviceBlue = definition.serviceType === 'responder'
    ? new THREE.PointLight(0x247cff, 0, 7, 2)
    : null;
  if (serviceRed && serviceBlue) {
    serviceRed.name = 'Curated responder red light';
    serviceBlue.name = 'Curated responder blue light';
    serviceRed.position.set(-.32, recipe.height * .86, 0);
    serviceBlue.position.set(.32, recipe.height * .86, 0);
    root.add(serviceRed, serviceBlue);
  }

  let condition = Math.max(0, Math.min(1, Number(definition.condition ?? 1)));
  const setCondition = (nextCondition = 1) => {
    condition = Math.max(0, Math.min(1, Number(nextCondition) || 0));
    const damage = transportDamagePresentation(condition);
    root.userData.condition = condition;
    root.userData.damageState = damage;
    const attachmentRoot = root.userData.curatedTrafficVehicleAttachment?.visual;
    vehicleMaterials(attachmentRoot).forEach((material) => {
      if (!material.color) return;
      if (!material.userData.curatedFleetBaseColor) {
        material.userData.curatedFleetBaseColor = `#${material.color.getHexString()}`;
      }
      material.color.set(material.userData.curatedFleetBaseColor).multiplyScalar(1 - damage.dirt * .34);
      material.needsUpdate = true;
    });
    root.rotation.z = damage.band === 'disabled' ? .035 : 0;
    return damage;
  };

  const api = {
    root,
    wheels: Object.freeze([]),
    doors: Object.freeze(doors),
    serviceLights: Object.freeze([serviceRed, serviceBlue].filter(Boolean)),
    materials: Object.freeze([]),
    setCondition,
    updateDamageVisual() {},
    setServiceLights(elapsed = 0, active = true) {
      if (!serviceRed || !serviceBlue) return;
      const redActive = active && Math.sin(Number(elapsed || 0) * 11) >= 0;
      serviceRed.intensity = redActive ? 2.2 : 0;
      serviceBlue.intensity = active && !redActive ? 2.2 : 0;
      const attachmentRoot = root.userData.curatedTrafficVehicleAttachment?.visual;
      vehicleMaterials(attachmentRoot).forEach((material) => {
        const name = String(material.name || '');
        if (/red.*light|light.*red/i.test(name)) material.emissiveIntensity = redActive ? 2.2 : .08;
        if (/blue.*light|light.*blue/i.test(name)) material.emissiveIntensity = active && !redActive ? 2.2 : .08;
      });
    },
    dispose() {
      root.userData.disposeCuratedTrafficVehicle?.();
      root.removeFromParent?.();
      serviceRed?.dispose?.();
      serviceBlue?.dispose?.();
    }
  };
  root.userData.onCuratedTrafficAttached = () => setCondition(condition);
  setCondition(condition);
  return Object.freeze(api);
}

export { createUrbanVehicleVisual };
