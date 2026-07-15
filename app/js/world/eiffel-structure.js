function addBeam(instances, start, end, thickness = 1.15) {
  const delta = end.clone().sub(start);
  if (delta.lengthSq() < 0.001) return;
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.clone().normalize()
  );
  instances.push(new THREE.Matrix4().compose(
    midpoint,
    quaternion,
    new THREE.Vector3(thickness, delta.length(), thickness)
  ));
}

function radiusAtHeight(height) {
  const profile = [
    [0, 62.5],
    [28, 51],
    [57, 35],
    [115, 18.9],
    [190, 8.4],
    [276, 4.2],
    [312, 2]
  ];
  for (let index = 1; index < profile.length; index += 1) {
    const [upperHeight, upperRadius] = profile[index];
    const [lowerHeight, lowerRadius] = profile[index - 1];
    if (height > upperHeight) continue;
    const mix = (height - lowerHeight) / (upperHeight - lowerHeight);
    return THREE.MathUtils.lerp(lowerRadius, upperRadius, mix);
  }
  return profile.at(-1)[1];
}

function cornersAt(height) {
  const radius = radiusAtHeight(height);
  return [
    new THREE.Vector3(-radius, height, -radius),
    new THREE.Vector3(radius, height, -radius),
    new THREE.Vector3(radius, height, radius),
    new THREE.Vector3(-radius, height, radius)
  ];
}

function addTowerLattice(instances) {
  const levels = [0, 12, 24, 38, 57, 72, 88, 102, 115, 132, 150, 170, 190, 214, 238, 258, 276, 294, 312];
  const rings = levels.map(cornersAt);
  for (let level = 0; level < rings.length - 1; level += 1) {
    const lower = rings[level];
    const upper = rings[level + 1];
    for (let corner = 0; corner < 4; corner += 1) {
      const next = (corner + 1) % 4;
      addBeam(instances, lower[corner], upper[corner], level < 5 ? 2.4 : 1.45);
      addBeam(instances, lower[corner], lower[next], 0.72);
      addBeam(instances, lower[corner], upper[next], 0.68);
      addBeam(instances, lower[next], upper[corner], 0.68);
    }
  }
  const top = rings.at(-1);
  for (let corner = 0; corner < 4; corner += 1) {
    addBeam(instances, top[corner], top[(corner + 1) % 4], 0.7);
  }
}

function addLowerArches(instances) {
  const faces = [
    { axis: 'x', fixed: -62.5 },
    { axis: 'x', fixed: 62.5 },
    { axis: 'z', fixed: -62.5 },
    { axis: 'z', fixed: 62.5 }
  ];
  for (const face of faces) {
    let previous = null;
    for (let step = 0; step <= 16; step += 1) {
      const t = step / 16;
      const across = THREE.MathUtils.lerp(-48, 48, t);
      const height = 9 + 40 * (1 - Math.pow(2 * t - 1, 2));
      const point = face.axis === 'x'
        ? new THREE.Vector3(across, height, face.fixed)
        : new THREE.Vector3(face.fixed, height, across);
      if (previous) addBeam(instances, previous, point, 1.05);
      previous = point;
    }
  }
}

function addPlatform(root, height, width, depth, thickness) {
  const geometry = new THREE.BoxGeometry(width, thickness, depth);
  const material = new THREE.MeshStandardMaterial({ color: 0x8a5938, roughness: 0.68, metalness: 0.36 });
  const platform = new THREE.Mesh(geometry, material);
  platform.position.y = height;
  platform.castShadow = true;
  platform.receiveShadow = true;
  root.add(platform);
}

export function createMeasuredEiffelTower() {
  const root = new THREE.Group();
  const instances = [];
  addTowerLattice(instances);
  addLowerArches(instances);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x8a5938, roughness: 0.68, metalness: 0.36 });
  const lattice = new THREE.InstancedMesh(geometry, material, instances.length);
  instances.forEach((matrix, index) => lattice.setMatrixAt(index, matrix));
  lattice.instanceMatrix.needsUpdate = true;
  lattice.castShadow = true;
  lattice.receiveShadow = true;
  root.add(lattice);

  addPlatform(root, 57, 67, 67, 3.2);
  addPlatform(root, 115, 38, 38, 2.6);
  addPlatform(root, 276, 16, 16, 2.2);
  addPlatform(root, 303, 7.5, 7.5, 4.2);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 1.15, 27, 10),
    new THREE.MeshStandardMaterial({ color: 0x755039, roughness: 0.5, metalness: 0.48 })
  );
  antenna.position.y = 316.5;
  antenna.castShadow = true;
  root.add(antenna);
  return root;
}
