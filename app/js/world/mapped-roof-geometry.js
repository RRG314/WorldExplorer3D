const NON_FLAT_ROOF_SHAPES = new Set([
  'dome',
  'gabled',
  'gambrel',
  'half-hipped',
  'hipped',
  'mansard',
  'onion',
  'pyramid',
  'pyramidal',
  'round',
  'skillion'
]);

function numericValue(value, fallback = NaN) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function footprintMetrics(pts) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let averageX = 0;
  let averageZ = 0;
  let signedAreaTwice = 0;
  let centroidXTimesArea = 0;
  let centroidZTimesArea = 0;
  for (const point of pts) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
    averageX += point.x;
    averageZ += point.z;
  }
  for (let index = 0; index < pts.length; index += 1) {
    const current = pts[index];
    const next = pts[(index + 1) % pts.length];
    const cross = current.x * next.z - next.x * current.z;
    signedAreaTwice += cross;
    centroidXTimesArea += (current.x + next.x) * cross;
    centroidZTimesArea += (current.z + next.z) * cross;
  }
  const hasStableArea = Math.abs(signedAreaTwice) > 1e-5;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(0.1, maxX - minX),
    depth: Math.max(0.1, maxZ - minZ),
    area: Math.abs(signedAreaTwice) * 0.5,
    centerX: hasStableArea ? centroidXTimesArea / (3 * signedAreaTwice) : averageX / pts.length,
    centerZ: hasStableArea ? centroidZTimesArea / (3 * signedAreaTwice) : averageZ / pts.length
  };
}

function isConvexFootprint(pts) {
  let winding = 0;
  for (let index = 0; index < pts.length; index += 1) {
    const a = pts[index];
    const b = pts[(index + 1) % pts.length];
    const c = pts[(index + 2) % pts.length];
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) < 1e-5) continue;
    const sign = Math.sign(cross);
    if (winding !== 0 && sign !== winding) return false;
    winding = sign;
  }
  return winding !== 0;
}

function stableRoofFootprint(shape, pts) {
  if (!Array.isArray(pts) || pts.length < 3 || pts.length > 32) return false;
  if (pts.some((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.z))) return false;
  const metrics = footprintMetrics(pts);
  const boundingArea = metrics.width * metrics.depth;
  const longestSpan = Math.max(metrics.width, metrics.depth);
  const shortestSpan = Math.min(metrics.width, metrics.depth);
  if (shortestSpan < 1.2 || longestSpan > 180 || longestSpan / shortestSpan > 10) return false;
  if (!(metrics.area > 1.5) || metrics.area / boundingArea < 0.28) return false;
  // Apex and ridge fans are only valid on convex footprints. Concave and
  // multipart outlines receive a clean flat cap instead of diagonal sails.
  if (shape !== 'skillion' && !isConvexFootprint(pts)) return false;
  return true;
}

function longestEdgeAxis(pts) {
  let best = { x: 1, z: 0, length: 0 };
  for (let index = 0; index < pts.length; index++) {
    const current = pts[index];
    const next = pts[(index + 1) % pts.length];
    const dx = next.x - current.x;
    const dz = next.z - current.z;
    const length = Math.hypot(dx, dz);
    if (length > best.length) best = { x: dx / length, z: dz / length, length };
  }
  return best;
}

function roofAxis(pts, directionDegrees) {
  if (Number.isFinite(directionDegrees)) {
    const radians = directionDegrees * Math.PI / 180;
    return { x: Math.sin(radians), z: -Math.cos(radians) };
  }
  return longestEdgeAxis(pts);
}

function pushTriangle(positions, a, b, c) {
  positions.push(
    a.x, a.y, a.z,
    b.x, b.y, b.z,
    c.x, c.y, c.z
  );
}

function geometryFromTriangles(positions) {
  if (positions.length < 9) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function apexRoofGeometry(pts, roofHeight) {
  const metrics = footprintMetrics(pts);
  const apex = { x: metrics.centerX, y: roofHeight, z: metrics.centerZ };
  const positions = [];
  for (let index = 0; index < pts.length; index++) {
    const current = pts[index];
    const next = pts[(index + 1) % pts.length];
    pushTriangle(
      positions,
      { x: current.x, y: 0, z: current.z },
      { x: next.x, y: 0, z: next.z },
      apex
    );
  }
  return geometryFromTriangles(positions);
}

function ridgeRoofGeometry(pts, roofHeight, directionDegrees) {
  const metrics = footprintMetrics(pts);
  const axis = roofAxis(pts, directionDegrees);
  const center = { x: metrics.centerX, z: metrics.centerZ };
  const projected = pts.map((point) =>
    (point.x - center.x) * axis.x + (point.z - center.z) * axis.z
  );
  const minAlong = Math.min(...projected);
  const maxAlong = Math.max(...projected);
  const ridgePoint = (along) => ({
    x: center.x + axis.x * along,
    y: roofHeight,
    z: center.z + axis.z * along
  });
  const positions = [];
  for (let index = 0; index < pts.length; index++) {
    const nextIndex = (index + 1) % pts.length;
    const current = pts[index];
    const next = pts[nextIndex];
    const edgeLength = Math.hypot(next.x - current.x, next.z - current.z) || 1;
    const edgeAxis = { x: (next.x - current.x) / edgeLength, z: (next.z - current.z) / edgeLength };
    const parallel = Math.abs(edgeAxis.x * axis.x + edgeAxis.z * axis.z) >= 0.7;
    const p0 = { x: current.x, y: 0, z: current.z };
    const p1 = { x: next.x, y: 0, z: next.z };
    if (parallel) {
      const r0 = ridgePoint(Math.max(minAlong, Math.min(maxAlong, projected[index])));
      const r1 = ridgePoint(Math.max(minAlong, Math.min(maxAlong, projected[nextIndex])));
      pushTriangle(positions, p0, p1, r1);
      pushTriangle(positions, p0, r1, r0);
    } else {
      const ridge = ridgePoint((projected[index] + projected[nextIndex]) * 0.5);
      pushTriangle(positions, p0, p1, ridge);
    }
  }
  return geometryFromTriangles(positions);
}

function skillionRoofGeometry(pts, roofHeight, directionDegrees) {
  const metrics = footprintMetrics(pts);
  const axis = roofAxis(pts, directionDegrees);
  const across = { x: -axis.z, z: axis.x };
  const projections = pts.map((point) =>
    (point.x - metrics.centerX) * across.x + (point.z - metrics.centerZ) * across.z
  );
  const minAcross = Math.min(...projections);
  const maxAcross = Math.max(...projections);
  const span = Math.max(0.1, maxAcross - minAcross);
  const contour = pts.map((point) => new THREE.Vector2(point.x, -point.z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const positions = [];
  const vertex = (index) => ({
    x: pts[index].x,
    y: (projections[index] - minAcross) / span * roofHeight,
    z: pts[index].z
  });
  for (const face of faces) pushTriangle(positions, vertex(face[0]), vertex(face[1]), vertex(face[2]));
  return geometryFromTriangles(positions);
}

function domeRoofGeometry(pts, roofHeight) {
  const metrics = footprintMetrics(pts);
  const geometry = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  geometry.scale(metrics.width * 0.5, roofHeight, metrics.depth * 0.5);
  geometry.translate(metrics.centerX, 0, metrics.centerZ);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function inferredRoofHeight(shape, heightMeters, pts, fullPartRoof) {
  const metrics = footprintMetrics(pts);
  const span = Math.min(metrics.width, metrics.depth);
  const curved = shape === 'dome' || shape === 'onion' || shape === 'round';
  const share = curved ? 0.34 : fullPartRoof ? 0.3 : 0.24;
  const maximum = curved ? 12 : 8;
  return Math.max(0.8, Math.min(heightMeters * 0.38, span * share, maximum));
}

export function resolveMappedRoof(tags = {}, heightMeters = 0, buildingSemantics = null, pts = []) {
  const shape = String(tags['roof:shape'] || '').trim().toLowerCase();
  if (!NON_FLAT_ROOF_SHAPES.has(shape) || !stableRoofFootprint(shape, pts)) return null;
  const mappedRoofHeight = numericValue(tags['roof:height']);
  const fullPartRoof = !!tags['building:part'] && Number(buildingSemantics?.baseOffsetMeters || 0) > 0.4;
  const roofHeight = Math.min(
    Math.max(0.3, Number(heightMeters) || 0.3),
    Number.isFinite(mappedRoofHeight) && mappedRoofHeight > 0 ?
      mappedRoofHeight :
      inferredRoofHeight(shape, heightMeters, pts, fullPartRoof)
  );
  return {
    shape,
    roofHeight,
    roofHeightSource: Number.isFinite(mappedRoofHeight) && mappedRoofHeight > 0 ? 'mapped' : 'shape_inferred',
    wallHeight: Math.max(0, heightMeters - roofHeight),
    fullPartRoof
  };
}

export function createMappedRoofMesh(pts, baseElevation, wallHeight, roofSpec, tags = {}) {
  if (!roofSpec) return null;
  const direction = numericValue(tags['roof:direction']);
  let geometry = null;
  if (roofSpec.shape === 'skillion') {
    geometry = skillionRoofGeometry(pts, roofSpec.roofHeight, direction);
  } else if (['dome', 'onion', 'round'].includes(roofSpec.shape)) {
    geometry = domeRoofGeometry(pts, roofSpec.roofHeight);
  } else if (['gabled', 'gambrel', 'half-hipped', 'mansard'].includes(roofSpec.shape)) {
    geometry = ridgeRoofGeometry(pts, roofSpec.roofHeight, direction);
  } else {
    geometry = apexRoofGeometry(pts, roofSpec.roofHeight);
  }
  if (!geometry) return null;
  const mappedColor = String(tags['roof:colour'] || tags['roof:color'] || '').trim();
  const color = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(mappedColor) ? mappedColor : '#686d72';
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: /metal/.test(String(tags['roof:material'] || '').toLowerCase()) ? 0.62 : 0.9,
    metalness: /metal/.test(String(tags['roof:material'] || '').toLowerCase()) ? 0.22 : 0.03,
    side: THREE.DoubleSide
  });
  material.userData = {
    ...(material.userData || {}),
    buildingBatchKey: `mapped-roof:${roofSpec.shape}:${new THREE.Color(color).getHexString()}:${/metal/.test(String(tags['roof:material'] || '').toLowerCase()) ? 'metal' : 'solid'}`
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = baseElevation + Math.max(0, wallHeight);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isRoofDetail = true;
  mesh.userData.isMappedRoof = true;
  mesh.userData.roofShape = roofSpec.shape;
  mesh.userData.roofHeight = roofSpec.roofHeight;
  mesh.userData.roofHeightSource = roofSpec.roofHeightSource;
  return mesh;
}
