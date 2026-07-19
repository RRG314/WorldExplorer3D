const ROUTES = Object.freeze({
  'm87-star': Object.freeze({
    destinationId: 'sagittarius-a-star',
    label: 'Speculative wormhole gameplay route: M87* to Sagittarius A*'
  })
});

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();

function getWormholeRoute(sourceId) {
  return ROUTES[sourceId] || null;
}

function createRingField(color, count, phase) {
  const geometry = new THREE.TorusGeometry(26, 1.25, 8, 64);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const rings = new THREE.InstancedMesh(geometry, material, count);
  rings.frustumCulled = false;
  rings.renderOrder = 120;
  for (let index = 0; index < count; index++) {
    const progress = index / count;
    const radiusScale = 0.42 + progress * 5.8;
    _position.set(0, 0, -70 - index * 82);
    _scale.setScalar(radiusScale * (1 + Math.sin(index * 1.73 + phase) * 0.08));
    _matrix.compose(_position, _quaternion, _scale);
    rings.setMatrixAt(index, _matrix);
  }
  rings.instanceMatrix.needsUpdate = true;
  return rings;
}

function createWormholeVisual(scene) {
  const group = new THREE.Group();
  group.name = 'Speculative wormhole transit effect';
  group.visible = false;
  group.userData = {
    accuracy: 'generated gameplay effect',
    routeAccuracy: 'speculative; endpoints are catalog-derived'
  };
  group.add(createRingField(0x77d7ff, 30, 0));
  group.add(createRingField(0xd28cff, 30, Math.PI * 0.5));
  scene.add(group);
  return group;
}

function startWormholeVisual(group) {
  if (!group) return;
  group.visible = true;
  group.rotation.set(0, 0, 0);
}

function updateWormholeVisual(group, camera, progress, elapsedSeconds) {
  if (!group?.visible || !camera) return;
  group.position.copy(camera.position);
  group.quaternion.copy(camera.quaternion);
  group.rotateZ(elapsedSeconds * 0.34);
  const intensity = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
  group.children.forEach((rings, index) => {
    rings.material.opacity = intensity * (index ? 0.54 : 0.72);
    rings.rotation.z = elapsedSeconds * (index ? -0.28 : 0.4);
  });
}

function stopWormholeVisual(group) {
  if (!group) return;
  group.visible = false;
  group.children.forEach((rings) => { rings.material.opacity = 0; });
}

export {
  createWormholeVisual,
  getWormholeRoute,
  startWormholeVisual,
  stopWormholeVisual,
  updateWormholeVisual
};
