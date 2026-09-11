function terrainSample(sampler, x, z) {
  const value = Number(sampler?.(x, z));
  return Number.isFinite(value) ? value : 0;
}

function terrainNormal(sampler, x, z, step = 1.5) {
  const left = terrainSample(sampler, x - step, z);
  const right = terrainSample(sampler, x + step, z);
  const back = terrainSample(sampler, x, z - step);
  const front = terrainSample(sampler, x, z + step);
  let nx = left - right;
  let ny = step * 2;
  let nz = back - front;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length;
  ny /= length;
  nz /= length;
  return { x: nx, y: ny, z: nz };
}

function edgeLength(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function midpoint(a, b, sampler) {
  const x = (a.x + b.x) * 0.5;
  const z = (a.z + b.z) * 0.5;
  return { x, z, y: terrainSample(sampler, x, z) };
}

function shouldSplitTriangle(triangle, sampler, options) {
  const [a, b, c] = triangle;
  const lengths = [edgeLength(a, b), edgeLength(b, c), edgeLength(c, a)];
  const longest = Math.max(...lengths);
  if (longest <= options.maxEdgeLength) return false;

  const centerX = (a.x + b.x + c.x) / 3;
  const centerZ = (a.z + b.z + c.z) / 3;
  const centerY = terrainSample(sampler, centerX, centerZ);
  const planeCenterY = (a.y + b.y + c.y) / 3;
  const relief = Math.max(a.y, b.y, c.y, centerY) - Math.min(a.y, b.y, c.y, centerY);
  return relief >= options.minRelief || Math.abs(centerY - planeCenterY) >= options.maxCenterError;
}

function splitLongestEdge(triangle, sampler) {
  const [a, b, c] = triangle;
  const ab = edgeLength(a, b);
  const bc = edgeLength(b, c);
  const ca = edgeLength(c, a);
  if (ab >= bc && ab >= ca) {
    const m = midpoint(a, b, sampler);
    return [[a, m, c], [m, b, c]];
  }
  if (bc >= ca) {
    const m = midpoint(b, c, sampler);
    return [[a, b, m], [a, m, c]];
  }
  const m = midpoint(c, a, sampler);
  return [[a, b, m], [m, b, c]];
}

function upwardTriangle(triangle) {
  const [a, b, c] = triangle;
  const normalY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
  return normalY < 0 ? [a, c, b] : triangle;
}

function terrainTriangles(outer, holes, sampler, options = {}) {
  const contour = outer.map((point) => new THREE.Vector2(point.x, point.z));
  const holeVectors = holes.map((ring) => ring.map((point) => new THREE.Vector2(point.x, point.z)));
  const vertices = [...outer, ...holes.flat()].map((point) => ({
    x: point.x,
    z: point.z,
    y: terrainSample(sampler, point.x, point.z)
  }));
  const faces = THREE.ShapeUtils.triangulateShape(contour, holeVectors);
  const queue = faces.map((face) => face.map((index) => vertices[index]));
  const output = [];
  const settings = {
    maxCenterError: Math.max(0.04, Number(options.maxCenterError) || 0.12),
    maxDepth: Math.max(0, Math.min(8, Number(options.maxDepth) || 6)),
    maxEdgeLength: Math.max(18, Number(options.maxEdgeLength) || 42),
    maxTriangles: Math.max(faces.length, Number(options.maxTriangles) || Math.max(120, faces.length * 7)),
    minRelief: Math.max(0.08, Number(options.minRelief) || 0.22)
  };

  const pending = queue.map((triangle) => ({ depth: 0, triangle }));
  while (pending.length > 0) {
    const item = pending.pop();
    const canSplit =
      item.depth < settings.maxDepth &&
      output.length + pending.length + 2 <= settings.maxTriangles &&
      shouldSplitTriangle(item.triangle, sampler, settings);
    if (!canSplit) {
      output.push(item.triangle);
      continue;
    }
    const children = splitLongestEdge(item.triangle, sampler);
    pending.push({ depth: item.depth + 1, triangle: children[1] });
    pending.push({ depth: item.depth + 1, triangle: children[0] });
  }
  return output;
}

export function buildTerrainConformingPolygonGeometry(outer, holes, sampler, options = {}) {
  const triangles = terrainTriangles(outer, holes, sampler, options);
  const baseY = Number(options.baseY) || 0;
  const offset = Number(options.surfaceOffset) || 0;
  const positions = [];
  const normals = [];
  const uvs = [];
  triangles.forEach((triangle) => {
    upwardTriangle(triangle).forEach((point) => {
      positions.push(point.x, point.y - baseY + offset, point.z);
      const normal = terrainNormal(sampler, point.x, point.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(point.x * 0.02, point.z * 0.02);
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function appendTerrainConformingPolygonBatch(outer, sampler, batch, options = {}) {
  const triangles = terrainTriangles(outer, [], sampler, options);
  const offset = Number(options.surfaceOffset) || 0;
  triangles.forEach((triangle) => {
    const start = batch.positions.length / 3;
    upwardTriangle(triangle).forEach((point) => {
      batch.positions.push(point.x, point.y + offset, point.z);
      batch.normals.push(0, 1, 0);
      batch.uvs.push(point.x * 0.02, point.z * 0.02);
    });
    batch.indices.push(start, start + 1, start + 2);
  });
  return triangles.length;
}
