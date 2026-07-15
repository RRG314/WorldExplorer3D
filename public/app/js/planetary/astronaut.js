import { ctx as appCtx } from '../shared-context.js?v=55';

let astronautGear = null;
const earthMaterials = new Map();
const planetaryMaterials = {};

function suitMaterial(color, metalness = 0.08, roughness = 0.72) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function createAstronautGear() {
  const gear = new THREE.Group();
  gear.name = 'Planetary Astronaut Gear';
  gear.userData.planetaryCharacterGear = true;

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.31, 20, 14),
    new THREE.MeshPhysicalMaterial({
      color: 0xeaf3f7,
      transparent: true,
      opacity: 0.38,
      roughness: 0.12,
      metalness: 0.04,
      transmission: 0.22,
      depthWrite: false
    })
  );
  helmet.position.set(0, 1.68, 0);
  helmet.scale.set(1, 1.08, 1);
  helmet.castShadow = true;
  gear.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 18, 12, 0, Math.PI),
    new THREE.MeshStandardMaterial({
      color: 0x8b6331,
      metalness: 0.72,
      roughness: 0.24,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide
    })
  );
  visor.position.set(0, 1.68, 0.04);
  visor.rotation.y = Math.PI;
  gear.add(visor);

  const backpack = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.7, 0.24),
    suitMaterial(0xd7d9d5, 0.18, 0.64)
  );
  backpack.position.set(0, 1.13, -0.24);
  backpack.castShadow = true;
  gear.add(backpack);

  const controlPack = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.22, 0.14),
    suitMaterial(0xbfc4c4, 0.24, 0.55)
  );
  controlPack.position.set(0, 1.04, 0.21);
  gear.add(controlPack);
  return gear;
}

function isGearMesh(object) {
  let current = object;
  while (current) {
    if (current.userData?.planetaryCharacterGear) return true;
    current = current.parent;
  }
  return false;
}

function materialsForBody(body) {
  if (!planetaryMaterials[body]) {
    const suitColor = body === 'mars' ? 0xe7ddd2 : 0xe6e8e5;
    planetaryMaterials[body] = {
      suit: suitMaterial(suitColor),
      accent: suitMaterial(0xb8b9b5, 0.12, 0.78)
    };
  }
  return planetaryMaterials[body];
}

function applySuitMaterials(character, body) {
  const materials = materialsForBody(body);
  character.traverse((object) => {
    if (!object.isMesh || isGearMesh(object) || object.material?.visible === false) return;
    if (!earthMaterials.has(object)) earthMaterials.set(object, object.material);
    const name = String(object.name || '').toLowerCase();
    const accent = name.includes('boot') || name.includes('shoe') || name.includes('glove');
    object.material = accent ? materials.accent : materials.suit;
  });
}

function restoreEarthMaterials() {
  earthMaterials.forEach((material, object) => {
    if (object) object.material = material;
  });
  earthMaterials.clear();
}

function setPlanetaryCharacter(body = 'earth') {
  const character = appCtx.Walk?.state?.characterMesh;
  if (!character) return null;
  const planetary = body === 'moon' || body === 'mars';
  if (!astronautGear) astronautGear = createAstronautGear();
  if (astronautGear.parent !== character) character.add(astronautGear);
  astronautGear.visible = planetary;

  if (planetary) {
    applySuitMaterials(character, body);
    astronautGear.userData.body = body;
  } else {
    restoreEarthMaterials();
  }
  return astronautGear;
}

Object.assign(appCtx, { setPlanetaryCharacter });

export { setPlanetaryCharacter };
