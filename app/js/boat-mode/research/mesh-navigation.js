// Ship-local triangle queries. Build once when the licensed asset is admitted;
// walking queries inspect nearby grid cells, never raycast the whole ship.
const CELL = 2;
const key = (x, z) => `${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
function heightAt(t, x, z) {
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
  const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(den) < 1e-8) return null;
  const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den;
  const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
  return u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001 ? u * ay + v * by + (1 - u - v) * cy : null;
}
function slice(t, y) {
  const points = [];
  for (let i = 0; i < 3; i++) {
    const a = i * 3, b = ((i + 1) % 3) * 3, delta = t[b + 1] - t[a + 1];
    if (Math.abs(delta) < 1e-7) continue;
    const f = (y - t[a + 1]) / delta;
    if (f >= 0 && f <= 1) points.push([t[a] + f * (t[b] - t[a]), t[a + 2] + f * (t[b + 2] - t[a + 2])]);
  }
  return points.length >= 2 ? points : null;
}

export function createShipMeshNavigation(THREE, root, { minimumDeckY = .8, maxTriangles = 210000 } = {}) {
  const cells = new Map(), floorCells = new Map(), triangles = [], bounds = [], floorIds = new Set();
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const transform = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  let disposed = false;
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry || mesh.userData.excludeShipNavigation) return;
    const positions = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
    if (!positions) return;
    transform.multiplyMatrices(inverse, mesh.matrixWorld);
    const count = index ? index.count : positions.count;
    for (let i = 0; i + 2 < count; i += 3) {
      a.fromBufferAttribute(positions, index ? index.getX(i) : i).applyMatrix4(transform);
      b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1).applyMatrix4(transform);
      c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2).applyMatrix4(transform);
      if (![...a.toArray(), ...b.toArray(), ...c.toArray()].every(Number.isFinite)) throw Error('Ship has invalid collision geometry.');
      if (Math.max(a.y, b.y, c.y) < minimumDeckY - .4) continue;
      const normal = ab.subVectors(b, a).cross(ac.subVectors(c, a)).normalize();
      const floor = normal.y > .58;
      // Ceilings need wall slices at their edges, but a horizontal underside is
      // not an additional floor. Low deck thickness never blocks a walking step.
      if (!floor && Math.abs(normal.y) > .98) continue;
      const t = new Float32Array([...a.toArray(), ...b.toArray(), ...c.toArray()]);
      const id = triangles.length;
      if (id >= maxTriangles) throw Error('Ship navigation exceeds its triangle budget.');
      triangles.push(t); if (floor) floorIds.add(id);
      bounds.push([Math.min(a.x,b.x,c.x),Math.max(a.x,b.x,c.x),Math.min(a.z,b.z,c.z),Math.max(a.z,b.z,c.z),Math.min(a.y,b.y,c.y),Math.max(a.y,b.y,c.y)]);
      const x0 = Math.floor(Math.min(a.x, b.x, c.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x, c.x) / CELL);
      const z0 = Math.floor(Math.min(a.z, b.z, c.z) / CELL), z1 = Math.floor(Math.max(a.z, b.z, c.z) / CELL);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 3000) throw Error('Ship geometry exceeds its spatial budget.');
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = `${x}:${z}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(id);
        if(floor){if(!floorCells.has(k))floorCells.set(k,[]);floorCells.get(k).push(id);}
      }
    }
  });
  function exactSupport(x, z, y, stepUp = .34, stepDown = .55) {
    if (disposed || ![x, z, y].every(Number.isFinite)) return null;
    let selected = null;
    for (const id of floorCells.get(key(x, z)) || []) {
      const box=bounds[id];
      if(x<box[0]-1e-5||x>box[1]+1e-5||z<box[2]-1e-5||z>box[3]+1e-5||box[4]>y+stepUp||box[5]<y-stepDown)continue;
      const height = heightAt(triangles[id], x, z);
      if (height == null || height < minimumDeckY || height > y + stepUp || height < y - stepDown) continue;
      if (selected == null || height > selected) selected = height;
    }
    return selected;
  }
  function support(x,z,y,stepUp=.34,stepDown=.55){
    const exact=exactSupport(x,z,y,stepUp,stepDown);
    if(exact!=null)return exact;
    // A foot spans the centimetre-scale construction joint between the last
    // tread and landing. Sample actual neighbouring triangles; never invent a
    // deck plane or bridge an opening wider than 9 cm.
    let nearby=null;
    for(const [dx,dz] of [[.045,0],[-.045,0],[0,.045],[0,-.045]]){
      const height=exactSupport(x+dx,z+dz,y,stepUp,stepDown);
      if(height!=null&&(nearby==null||height>nearby))nearby=height;
    }
    return nearby;
  }
  function blocked(x, z, radius = .3, baseY = 2, height = 1.7) {
    if (disposed || ![x, z, radius, baseY, height].every(Number.isFinite)) return true;
    const ids = new Set();
    for (let ix = Math.floor((x - radius) / CELL); ix <= Math.floor((x + radius) / CELL); ix++)
      for (let iz = Math.floor((z - radius) / CELL); iz <= Math.floor((z + radius) / CELL); iz++)
        for (const id of cells.get(`${ix}:${iz}`) || []) ids.add(id);
    for (const id of ids) {
      const box=bounds[id];
      if(x+radius<box[0]||x-radius>box[1]||z+radius<box[2]||z-radius>box[3]||box[4]>baseY+height||box[5]<baseY+.36)continue;
      const t = triangles[id];
      if (floorIds.has(id)) {
        const above = heightAt(t, x, z);
        if (above != null && above > baseY + .36 && above < baseY + height) return true;
        continue;
      }
      for (const offset of [.37, Math.min(.85, height * .5), height - .08]) {
        const points = slice(t, baseY + offset);
        if (points && segmentDistance(x, z, points[0], points[1]) < radius) return true;
      }
    }
    return false;
  }
  function move(position, dx, dz) {
    const result = { ...position };
    const distance = Math.hypot(dx, dz);
    if (disposed || !Number.isFinite(distance) || distance > 20) return result;
    const steps = Math.max(1, Math.ceil(distance / .12));
    function attempt(x, z) {
      const y = support(x, z, result.y);
      if (y == null || blocked(x, z, .3, y)) return false;
      // Keep the capsule's feet on the supported side of an open edge.
      for (const [ox, oz] of [[.2, 0], [-.2, 0], [0, .2], [0, -.2]]) if (support(x + ox, z + oz, y) == null) return false;
      Object.assign(result, { x, y, z }); return true;
    }
    for (let i = 0; i < steps; i++) {
      if (!attempt(result.x + dx / steps, result.z + dz / steps)) {
        attempt(result.x + dx / steps, result.z); attempt(result.x, result.z + dz / steps);
      }
    }
    return result;
  }
  return { support, blocked, move, stats: Object.freeze({ triangles: triangles.length, floors: floorIds.size, cells: cells.size }),
    dispose() { disposed = true; cells.clear();floorCells.clear(); floorIds.clear(); triangles.length = bounds.length = 0; } };
}
