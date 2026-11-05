// Furnish the admitted room, never place another building shell inside it.
// Placement stays within its footprint and preserves an open entry-to-center
// path. The existing interior owner publishes and disposes meshes/colliders.
export function planHomeFixtures(state, { contains, metersPerUnit = 1 } = {}) {
  const ring = state.usableFootprint || [],
    u = 1 / metersPerUnit;
  if (ring.length < 3) return [];
  const xs = ring.map((p) => p.x),
    zs = ring.map((p) => p.z),
    bounds = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
  const entry = state.entryPoint,
    center = state.center,
    placed = [];
  const blocksEntryPath = (x, z, width, depth) => {
    let near = 0,
      far = 1;
    for (const [axis, low, high] of [
      ['x', x - width / 2 - 0.68 * u, x + width / 2 + 0.68 * u],
      ['z', z - depth / 2 - 0.68 * u, z + depth / 2 + 0.68 * u],
    ]) {
      const direction = center[axis] - entry[axis];
      if (Math.abs(direction) < 1e-9) {
        if (entry[axis] < low || entry[axis] > high) return false;
        continue;
      }
      const a = (low - entry[axis]) / direction,
        b = (high - entry[axis]) / direction;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) return false;
    }
    return true;
  };
  for (const [kind, w, d, h] of [
    ['bed', 1.05, 2, 0.52],
    ['cabinet', 0.7, 0.42, 1.45],
    ['desk', 1.05, 0.52, 0.74],
  ]) {
    let best = null;
    for (const turn of [0, 1]) {
      const width = (turn ? d : w) * u,
        depth = (turn ? w : d) * u;
      for (
        let x = bounds.minX + width / 2 + 0.14 * u;
        x <= bounds.maxX - width / 2 - 0.14 * u;
        x += Math.max(0.22 * u, (bounds.maxX - bounds.minX) / 16)
      )
        for (
          let z = bounds.minZ + depth / 2 + 0.14 * u;
          z <= bounds.maxZ - depth / 2 - 0.14 * u;
          z += Math.max(0.22 * u, (bounds.maxZ - bounds.minZ) / 16)
        ) {
          const samples = [
            [-1, -1],
            [-1, 0],
            [-1, 1],
            [0, -1],
            [0, 0],
            [0, 1],
            [1, -1],
            [1, 0],
            [1, 1],
          ].map(([a, b]) => ({
            x: x + a * (width / 2 + 0.1 * u),
            z: z + b * (depth / 2 + 0.1 * u),
          }));
          if (
            samples.some((p) => !contains(p.x, p.z, ring)) ||
            blocksEntryPath(x, z, width, depth) ||
            placed.some(
              (p) =>
                Math.abs(p.x - x) < (p.width + width) / 2 + 0.22 * u &&
                Math.abs(p.z - z) < (p.depth + depth) / 2 + 0.22 * u
            )
          )
            continue;
          const score = Math.hypot(x - entry.x, z - entry.z);
          if (!best || score > best.score)
            best = { kind, x, z, width, depth, height: h * u, turn, score };
        }
    }
    if (best) placed.push(best);
  }
  return placed;
}
export function addHomeFixtures(THREE, state, { contains, metersPerUnit = 1, createCollider }) {
  const fixtures = planHomeFixtures(state, { contains, metersPerUnit }),
    u = 1 / metersPerUnit;
  const wood = new THREE.MeshStandardMaterial({ color: 0x75553d, roughness: 0.78 }),
    linen = new THREE.MeshStandardMaterial({ color: 0xe3d8bf, roughness: 0.95 }),
    cover = new THREE.MeshStandardMaterial({ color: 0x54766c, roughness: 0.95 }),
    metal = new THREE.MeshStandardMaterial({ color: 0x302e2a, roughness: 0.5 });
  const floor = state.floorY + 0.04;
  function box(p, w, h, d, y, material, dx = 0, dz = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(p.x + dx, floor + y + h / 2, p.z + dz);
    mesh.receiveShadow = true;
    state.group.add(mesh);
    return mesh;
  }
  for (const p of fixtures) {
    if (p.kind === 'bed') {
      box(p, p.width, 0.23 * u, p.depth, 0, wood);
      box(p, p.width * 0.97, 0.18 * u, p.depth * 0.96, 0.23 * u, linen);
      box(p, p.width * 0.98, 0.06 * u, p.depth * 0.65, 0.41 * u, cover, 0, p.depth * 0.13);
      box(
        p,
        p.width * 0.7,
        0.12 * u,
        Math.min(0.4 * u, p.depth * 0.2),
        0.41 * u,
        linen,
        0,
        -p.depth * 0.34
      );
      box(p, p.width, 0.82 * u, 0.08 * u, 0, wood, 0, -p.depth / 2 + 0.04 * u);
    } else if (p.kind === 'cabinet') {
      box(p, p.width, p.height, p.depth, 0, wood);
      box(
        p,
        p.width * 0.42,
        p.height * 0.9,
        0.025 * u,
        0.05 * u,
        linen,
        -p.width * 0.24,
        p.depth / 2
      );
      box(
        p,
        p.width * 0.42,
        p.height * 0.9,
        0.025 * u,
        0.05 * u,
        linen,
        p.width * 0.24,
        p.depth / 2
      );
    } else {
      box(p, p.width, 0.07 * u, p.depth, p.height - 0.07 * u, wood);
      for (const a of [-1, 1])
        for (const b of [-1, 1])
          box(
            p,
            0.055 * u,
            p.height - 0.07 * u,
            0.055 * u,
            0,
            metal,
            a * (p.width / 2 - 0.055 * u),
            b * (p.depth / 2 - 0.055 * u)
          );
      box(p, 0.25 * u, 0.045 * u, 0.2 * u, p.height, linen);
    }
    const collider = createCollider(
      { x: p.x - p.width / 2, z: p.z },
      { x: p.x + p.width / 2, z: p.z },
      floor,
      p.height,
      p.depth
    );
    if (collider) state.dynamicColliders.push(collider);
  }
  if (!fixtures.length) for (const material of [wood, linen, cover, metal]) material.dispose();
  state.group.userData.fittedHomeFurniture = true;
  return fixtures;
}
