const BRIDGE_WIDTH = 27;
const TRUSS_DEPTH = 8.2;
const TRUSS_BAY = 15.24;

function offsetPoint(pathPoint, side, y) {
  const tangentLength = Math.hypot(pathPoint.dx, pathPoint.dz) || 1;
  const sideX = -pathPoint.dz / tangentLength;
  const sideZ = pathPoint.dx / tangentLength;
  return new THREE.Vector3(
    pathPoint.x + sideX * BRIDGE_WIDTH * 0.5 * side,
    y,
    pathPoint.z + sideZ * BRIDGE_WIDTH * 0.5 * side
  );
}

function addBeam(beams, start, end, thickness, depth = thickness) {
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length < 0.1) return;
  beams.push({
    center: start.clone().add(end).multiplyScalar(0.5),
    direction: delta.multiplyScalar(1 / length),
    length,
    thickness,
    depth
  });
}

function addDeckTrusses(beams, path, metrics, pointAtDistance, sampleRoadDeckY) {
  const bayCount = Math.max(1, Math.ceil(metrics.total / TRUSS_BAY));
  for (let i = 0; i < bayCount; i++) {
    const startDistance = metrics.total * i / bayCount;
    const endDistance = metrics.total * (i + 1) / bayCount;
    const start = pointAtDistance(path, metrics.distances, startDistance);
    const end = pointAtDistance(path, metrics.distances, endDistance);
    const startDeckY = sampleRoadDeckY(start.x, start.z);
    const endDeckY = sampleRoadDeckY(end.x, end.z);
    for (const side of [-1, 1]) {
      const startTop = offsetPoint(start, side, startDeckY - 1.2);
      const endTop = offsetPoint(end, side, endDeckY - 1.2);
      const startBottom = offsetPoint(start, side, startDeckY - TRUSS_DEPTH);
      const endBottom = offsetPoint(end, side, endDeckY - TRUSS_DEPTH);
      addBeam(beams, startTop, endTop, 0.55, 0.7);
      addBeam(beams, startBottom, endBottom, 0.55, 0.7);
      addBeam(beams, i % 2 ? startTop : startBottom, i % 2 ? endBottom : endTop, 0.42, 0.55);
    }
  }
}

function addTowerCrossframes(beams, path, metrics, towers, pointAtDistance, sampleRoadDeckY) {
  for (const tower of towers) {
    const center = pointAtDistance(path, metrics.distances, tower.distance);
    const deckY = sampleRoadDeckY(center.x, center.z);
    const topY = Math.max(deckY + 152, tower.topY);
    const frameHeights = [0.22, 0.43, 0.65, 0.84, 0.97];
    for (const ratio of frameHeights) {
      const y = deckY + (topY - deckY) * ratio;
      const halfWidth = 11.8 - ratio * 1.4;
      addBeam(beams, offsetPoint(center, -1, y), offsetPoint(center, 1, y), ratio > 0.9 ? 3.8 : 3.1, 2.8);
      const inset = halfWidth / (BRIDGE_WIDTH * 0.5);
      const left = offsetPoint(center, -inset, y - 7);
      const right = offsetPoint(center, inset, y - 7);
      addBeam(beams, offsetPoint(center, -inset, y + 7), right, 1.15, 1.35);
      addBeam(beams, offsetPoint(center, inset, y + 7), left, 1.15, 1.35);
    }
  }
}

export function createBridgeStructuralDetails(options) {
  const beams = [];
  addDeckTrusses(beams, options.path, options.metrics, options.pointAtDistance, options.sampleRoadDeckY);
  addTowerCrossframes(
    beams,
    options.path,
    options.metrics,
    options.towers,
    options.pointAtDistance,
    options.sampleRoadDeckY
  );
  if (!beams.length) return null;

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: options.color, roughness: 0.62, metalness: 0.36 });
  const mesh = new THREE.InstancedMesh(geometry, material, beams.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < beams.length; i++) {
    const beam = beams[i];
    quaternion.setFromUnitVectors(xAxis, beam.direction);
    scale.set(beam.length, beam.thickness, beam.depth);
    matrix.compose(beam.center, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData = {
    isHistoricLandmark: true,
    landmarkKind: 'suspension_bridge_structure',
    landmarkName: 'Golden Gate Bridge',
    instanceCount: beams.length,
    source: 'official-dimensions-and-osm-alignment'
  };
  options.scene.add(mesh);
  options.historicMarkers.push(mesh);
  return mesh;
}
