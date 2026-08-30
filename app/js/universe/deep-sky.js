import { getUniverseDestinations, icrsToCartesian } from './catalog.js?v=10';

const DEEP_SKY_RADIUS = 150000;

function createFeatheredAlphaMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 96, 42, 128, 96, 132);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.58, '#ffffff');
  gradient.addColorStop(0.82, '#9a9a9a');
  gradient.addColorStop(1, '#000000');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return new THREE.CanvasTexture(canvas);
}

function observerCartesian(entity) {
  if (!entity || entity.id === 'sol') return new THREE.Vector3();
  const position = entity.canonicalPosition || {};
  if (position.frame !== 'ICRS') return new THREE.Vector3();
  const xyz = icrsToCartesian(entity);
  return new THREE.Vector3(xyz.x, xyz.y, xyz.z);
}

function positionSprite(entry, observer, currentEntity) {
  const target = entry.entity;
  if (target.id === currentEntity?.id) {
    entry.sprite.visible = false;
    return;
  }
  const xyz = icrsToCartesian(target);
  const direction = new THREE.Vector3(xyz.x, xyz.y, xyz.z).sub(observer);
  if (direction.lengthSq() < 1e-8) {
    entry.sprite.visible = false;
    return;
  }
  direction.normalize().multiplyScalar(DEEP_SKY_RADIUS);
  entry.sprite.position.copy(direction);
  entry.sprite.visible = true;
}

function createNebulaSprite(entity, textureLoader) {
  const texture = textureLoader.load(entity.visualProfile.image);
  if (typeof THREE.SRGBColorSpace !== 'undefined') texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    alphaMap: createFeatheredAlphaMap(),
    color: entity.visualProfile.tint || 0xffffff,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false
  });
  const sprite = new THREE.Sprite(material);
  const radiusLy = Math.max(4, Number(entity.physical?.radiusLy || 10));
  const width = Math.max(3200, Math.min(8200, 3200 + Math.sqrt(radiusLy) * 410));
  sprite.scale.set(width, width * 0.72, 1);
  sprite.name = entity.name + ' observational sky image';
  sprite.userData = {
    universeEntityId: entity.id,
    accuracy: entity.accuracy,
    imageCredit: entity.visualProfile.imageCredit,
    source: entity.provenance?.[0]?.url
  };
  return sprite;
}

function createDeepSkyLayer(scene) {
  const group = new THREE.Group();
  group.name = 'Catalog-positioned deep-sky imagery';
  group.visible = false;
  const textureLoader = new THREE.TextureLoader();
  const sprites = getUniverseDestinations()
    .filter((entity) => entity.objectClass === 'nebula' && entity.visualProfile?.image)
    .map((entity) => {
      const sprite = createNebulaSprite(entity, textureLoader);
      group.add(sprite);
      return { entity, sprite };
    });
  scene.add(group);
  return { group, sprites, currentEntity: null };
}

function setDeepSkyFrame(state, entity, visible) {
  if (!state) return;
  state.currentEntity = entity || null;
  state.group.visible = Boolean(visible);
  if (!visible) return;
  const observer = observerCartesian(entity);
  state.sprites.forEach((entry) => positionSprite(entry, observer, entity));
}

function updateDeepSkyLayer(state, rocket, elapsedSeconds) {
  if (!state?.group?.visible || !rocket) return;
  state.group.position.copy(rocket.position);
  state.sprites.forEach((entry, index) => {
    if (!entry.sprite.visible) return;
    entry.sprite.material.opacity = 0.52 + Math.sin(elapsedSeconds * 0.18 + index) * 0.045;
  });
}

export { createDeepSkyLayer, setDeepSkyFrame, updateDeepSkyLayer };
