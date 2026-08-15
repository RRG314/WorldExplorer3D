export function clearStructureVisualMeshesForContext(appCtx) {
  if (!Array.isArray(appCtx.structureVisualMeshes)) appCtx.replaceWorldCollection('structureVisualMeshes');
  appCtx.structureVisualMeshes.forEach((mesh) => {
    if (!mesh) return;
    mesh.parent?.remove?.(mesh);
    if (mesh.geometry && typeof mesh.geometry.dispose === "function") mesh.geometry.dispose();
    if (mesh.material && typeof mesh.material.dispose === "function") mesh.material.dispose();
  });
  appCtx.replaceWorldCollection('structureVisualMeshes');
}

// Only the compiled tunnel system may publish tunnel enclosure geometry. Its
// shell ranges are limited to portions with measured terrain cover and its
// portal approaches are tied to the accepted terrain at both road edges.
export const PUBLISH_TUNNEL_STRUCTURE_VISUALS = true;

export function buildStructureVisualMeshForContext(appCtx, instances, material, userData = {}) {
  if (!Array.isArray(instances) || instances.length === 0 || typeof THREE === "undefined") return null;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    position.set(instance.x, instance.y, instance.z);
    if (instance?.quaternion && Number.isFinite(instance.quaternion.x) && Number.isFinite(instance.quaternion.y) && Number.isFinite(instance.quaternion.z) && Number.isFinite(instance.quaternion.w)) {
      quaternion.set(instance.quaternion.x, instance.quaternion.y, instance.quaternion.z, instance.quaternion.w);
    } else {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Number(instance.rotationY) || 0);
    }
    scale.set(instance.scaleX, instance.scaleY, instance.scaleZ);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, userData, { isStructureVisual: true });
  appCtx.addEarthWorldObject(mesh);
  appCtx.structureVisualMeshes.push(mesh);
  return mesh;
}

function createStructureVisualMaterial(hex, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness,
    metalness
  });
}

function buildTunnelShellMeshForContext(appCtx, shellDescriptors = []) {
  if (!Array.isArray(shellDescriptors) || shellDescriptors.length === 0 || typeof THREE === "undefined") return null;
  const positions = [];
  const indices = [];
  // A continuous seven-point section gives vertical walls, shoulders, and an
  // arched crown without fragment seams or exposed box ends on curves.
  const lateralFactors = [-1, -1, -0.76, 0, 0.76, 1, 1];
  const heightFactors = [0.02, 0.56, 0.84, 1, 0.84, 0.56, 0.02];
  for (const shell of shellDescriptors) {
    const rings = Array.isArray(shell?.rings) ? shell.rings : [];
    if (rings.length < 2) continue;
    const baseVertex = positions.length / 3;
    for (const ring of rings) {
      const nx = -Number(ring.tangentZ || 0);
      const nz = Number(ring.tangentX || 0);
      for (let section = 0; section < lateralFactors.length; section += 1) {
        const lateral = lateralFactors[section] * shell.halfWidth;
        positions.push(
          ring.x + nx * lateral,
          ring.y + heightFactors[section] * shell.clearance,
          ring.z + nz * lateral
        );
      }
    }
    const sectionSize = lateralFactors.length;
    for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
      for (let section = 0; section < sectionSize - 1; section += 1) {
        const a = baseVertex + ringIndex * sectionSize + section;
        const b = a + 1;
        const c = a + sectionSize;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    for (const approach of shell.approaches || []) {
      const approachRings = Array.isArray(approach?.rings) ? approach.rings : [];
      if (approachRings.length < 2) continue;
      const approachBase = positions.length / 3;
      for (const ring of approachRings) {
        const nx = -Number(ring.tangentZ || 0);
        const nz = Number(ring.tangentX || 0);
        for (const side of [-1, 1]) {
          const lateral = side * shell.halfWidth;
          const terrainY = side < 0 ? ring.rightTerrainY : ring.leftTerrainY;
          positions.push(
            ring.x + nx * lateral,
            ring.y,
            ring.z + nz * lateral,
            ring.x + nx * lateral,
            terrainY,
            ring.z + nz * lateral
          );
        }
      }
      for (let ringIndex = 0; ringIndex < approachRings.length - 1; ringIndex += 1) {
        for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
          const a = approachBase + ringIndex * 4 + sideIndex * 2;
          const b = a + 1;
          const c = a + 4;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
  }
  if (positions.length === 0 || indices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = createStructureVisualMaterial(0x5d6974, 0.9, 0.04);
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, {
    isStructureVisual: true,
    structureVisualType: "tunnel_shells",
    tunnelShellOwner: "compiled-tunnel-system"
  });
  appCtx.addEarthWorldObject(mesh);
  appCtx.structureVisualMeshes.push(mesh);
  return mesh;
}

function buildElevatedRoadMeshForContext(appCtx, deckShells = [], barrierSegments = []) {
  if (typeof THREE === "undefined") return null;
  const positions = [];
  const indices = [];
  for (const shell of deckShells || []) {
    const rings = Array.isArray(shell?.rings) ? shell.rings : [];
    if (rings.length < 2) continue;
    const base = positions.length / 3;
    for (let index = 0; index < rings.length; index += 1) {
      const ring = rings[index];
      const previous = rings[Math.max(0, index - 1)];
      const next = rings[Math.min(rings.length - 1, index + 1)];
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      const length = Math.hypot(dx, dz) || 1;
      const nx = -dz / length;
      const nz = dx / length;
      const halfWidth = shell.width * 0.5 + 0.1;
      const thickness = Math.max(0.06, Number(ring.thickness) || Number(shell.thickness) || 0.18);
      positions.push(
        ring.x + nx * halfWidth, ring.y - 0.045, ring.z + nz * halfWidth,
        ring.x - nx * halfWidth, ring.y - 0.045, ring.z - nz * halfWidth,
        ring.x + nx * halfWidth, ring.y - thickness, ring.z + nz * halfWidth,
        ring.x - nx * halfWidth, ring.y - thickness, ring.z - nz * halfWidth
      );
    }
    for (let index = 0; index < rings.length - 1; index += 1) {
      const a = base + index * 4;
      const b = a + 4;
      indices.push(
        a + 2, b + 2, a + 3, a + 3, b + 2, b + 3,
        a, b, a + 2, a + 2, b, b + 2,
        a + 1, a + 3, b + 1, a + 3, b + 3, b + 1
      );
    }
    const start = base;
    const end = base + (rings.length - 1) * 4;
    indices.push(
      start, start + 2, start + 1, start + 1, start + 2, start + 3,
      end, end + 1, end + 2, end + 1, end + 3, end + 2
    );
  }
  for (const segment of barrierSegments || []) {
    const p1 = segment?.p1;
    const p2 = segment?.p2;
    if (!p1 || !p2) continue;
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const length = Math.hypot(dx, dz);
    if (!(length > 0.2)) continue;
    const nx = -dz / length;
    const nz = dx / length;
    const sides = Array.isArray(segment.sides) ? segment.sides : [-1, 1];
    for (const side of sides) {
      const base = positions.length / 3;
      const lateral = Number(segment.halfWidth) * side;
      const height = Number(segment.height) || 0.72;
      positions.push(
        p1.x + nx * lateral, p1.y + 0.04, p1.z + nz * lateral,
        p1.x + nx * lateral, p1.y + height, p1.z + nz * lateral,
        p2.x + nx * lateral, p2.y + 0.04, p2.z + nz * lateral,
        p2.x + nx * lateral, p2.y + height, p2.z + nz * lateral
      );
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  if (positions.length === 0 || indices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = createStructureVisualMaterial(0x5c6670, 0.9, 0.05);
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, {
    isStructureVisual: true,
    structureVisualType: "elevated_road_shells",
    elevatedRoadOwner: "compiled-transport-structure-assembly",
    closedStructureEnds: true,
    variableTransitionThickness: true
  });
  appCtx.addEarthWorldObject(mesh);
  appCtx.structureVisualMeshes.push(mesh);
  return mesh;
}

export function rebuildStructureVisualMeshesForContext(appCtx, collectStructureVisualInstances, deps = {}) {
  clearStructureVisualMeshesForContext(appCtx);
  if (appCtx.onMoon || !appCtx.scene) return;
  const {
    supportInstances,
    portalInstances,
    deckInstances,
    girderInstances,
    capInstances,
    wallInstances,
    roofInstances,
    tunnelLightInstances,
    tunnelShells,
    elevatedDeckShells,
    elevatedBarrierSegments,
    guardrailInstances
  } = collectStructureVisualInstances(deps);

  if (deckInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      deckInstances,
      createStructureVisualMaterial(0x56606b, 0.92, 0.03),
      { structureVisualType: "decks" }
    );
  }
  if (girderInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      girderInstances,
      createStructureVisualMaterial(0x404954, 0.88, 0.08),
      { structureVisualType: "girders" }
    );
  }
  if (capInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      capInstances,
      createStructureVisualMaterial(0x646c76, 0.92, 0.03),
      { structureVisualType: "caps" }
    );
  }
  if (supportInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      supportInstances,
      createStructureVisualMaterial(0x717983, 0.95, 0.02),
      { structureVisualType: "supports" }
    );
  }
  if (PUBLISH_TUNNEL_STRUCTURE_VISUALS && wallInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      wallInstances,
      createStructureVisualMaterial(0x66727d, 0.88, 0.08),
      { structureVisualType: "walls" }
    );
  }
  if (PUBLISH_TUNNEL_STRUCTURE_VISUALS && roofInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      roofInstances,
      createStructureVisualMaterial(0x4c5660, 0.84, 0.12),
      { structureVisualType: "roofs" }
    );
  }
  if (PUBLISH_TUNNEL_STRUCTURE_VISUALS && portalInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      portalInstances,
      createStructureVisualMaterial(0x585e64, 0.96, 0.02),
      { structureVisualType: "portals" }
    );
  }
  if (PUBLISH_TUNNEL_STRUCTURE_VISUALS && tunnelLightInstances.length > 0) {
    const material = createStructureVisualMaterial(0xfff2c7, 0.5, 0.02);
    material.emissive.setHex(0xffd98a);
    material.emissiveIntensity = 1.8;
    buildStructureVisualMeshForContext(appCtx, tunnelLightInstances, material, { structureVisualType: "tunnel_lights" });
  }
  if (PUBLISH_TUNNEL_STRUCTURE_VISUALS) {
    buildTunnelShellMeshForContext(appCtx, tunnelShells);
  }
  buildElevatedRoadMeshForContext(appCtx, elevatedDeckShells, elevatedBarrierSegments);
  if (guardrailInstances.length > 0) {
    buildStructureVisualMeshForContext(
      appCtx,
      guardrailInstances,
      createStructureVisualMaterial(0xb6bdc3, 0.62, 0.42),
      { structureVisualType: "guardrails" }
    );
  }
}
