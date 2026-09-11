export function createMeasuredKhufuPyramid() {
  const root = new THREE.Group();
  const courseCount = 140;
  const height = 138.5;
  const baseWidth = 230.3;
  const courseHeight = height / courseCount;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
    emissive: 0x72552e,
    emissiveIntensity: 0.48,
    side: THREE.DoubleSide
  });
  const courses = new THREE.InstancedMesh(geometry, material, courseCount);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  for (let index = 0; index < courseCount; index += 1) {
    const progress = index / courseCount;
    const width = Math.max(1.35, baseWidth * (1 - progress));
    matrix.compose(
      new THREE.Vector3(0, (index + 0.5) * courseHeight, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(width, courseHeight * 0.93, width)
    );
    courses.setMatrixAt(index, matrix);
    const variation = ((index * 17) % 11 - 5) * 0.008;
    color.setHSL(0.105, 0.4, 0.58 + variation);
    courses.setColorAt(index, color);
  }
  courses.instanceMatrix.needsUpdate = true;
  if (courses.instanceColor) courses.instanceColor.needsUpdate = true;
  courses.castShadow = true;
  courses.receiveShadow = true;
  root.add(courses);

  const boundsProxy = new THREE.Mesh(
    new THREE.BoxGeometry(baseWidth, height, baseWidth),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  boundsProxy.position.y = height * 0.5;
  boundsProxy.visible = false;
  boundsProxy.userData.isLandmarkBoundsProxy = true;
  root.add(boundsProxy);
  return root;
}
