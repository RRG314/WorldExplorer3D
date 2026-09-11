export function stitchTerrainMeshEdges(appCtx, mesh) {
  const info = mesh?.userData?.terrainTile;
  const position = mesh?.geometry?.attributes?.position;
  const normal = mesh?.geometry?.attributes?.normal;
  const group = appCtx.terrainGroup;
  const segments = Math.max(1, Number(appCtx.TERRAIN_SEGMENTS) || 1);
  const verticesPerSide = segments + 1;
  if (!info || !position || !normal || !group) return;

  const neighborByOffset = (dx, dy) => group.children.find((candidate) => {
    const tile = candidate?.userData?.terrainTile;
    return tile &&
      tile.z === info.z &&
      tile.tx === info.tx + dx &&
      tile.ty === info.ty + dy &&
      candidate.userData?.pendingTerrainTile !== true;
  });
  const averagePair = (other, indexA, indexB) => {
    const otherPosition = other?.geometry?.attributes?.position;
    const otherNormal = other?.geometry?.attributes?.normal;
    if (!otherPosition || !otherNormal) return;
    const worldY = (
      position.getY(indexA) + Number(mesh.position.y || 0) +
      otherPosition.getY(indexB) + Number(other.position.y || 0)
    ) * 0.5;
    position.setY(indexA, worldY - Number(mesh.position.y || 0));
    otherPosition.setY(indexB, worldY - Number(other.position.y || 0));
    const nx = normal.getX(indexA) + otherNormal.getX(indexB);
    const ny = normal.getY(indexA) + otherNormal.getY(indexB);
    const nz = normal.getZ(indexA) + otherNormal.getZ(indexB);
    const length = Math.hypot(nx, ny, nz) || 1;
    normal.setXYZ(indexA, nx / length, ny / length, nz / length);
    otherNormal.setXYZ(indexB, nx / length, ny / length, nz / length);
    otherPosition.needsUpdate = true;
    otherNormal.needsUpdate = true;
  };

  const west = neighborByOffset(-1, 0);
  const east = neighborByOffset(1, 0);
  const north = neighborByOffset(0, -1);
  const south = neighborByOffset(0, 1);
  for (let edgeIndex = 0; edgeIndex <= segments; edgeIndex += 1) {
    if (west) averagePair(west, edgeIndex * verticesPerSide, edgeIndex * verticesPerSide + segments);
    if (east) averagePair(east, edgeIndex * verticesPerSide + segments, edgeIndex * verticesPerSide);
    if (north) averagePair(north, edgeIndex, segments * verticesPerSide + edgeIndex);
    if (south) averagePair(south, segments * verticesPerSide + edgeIndex, edgeIndex);
  }
  position.needsUpdate = true;
  normal.needsUpdate = true;
}

export function stitchTerrainGroupEdges(appCtx) {
  const meshes = (appCtx?.terrainGroup?.children || []).filter((mesh) =>
    mesh?.userData?.isTerrainMesh &&
    mesh?.userData?.pendingTerrainTile !== true &&
    mesh?.geometry?.attributes?.position
  );
  const segments = Math.max(1, Number(appCtx?.TERRAIN_SEGMENTS) || 1);
  const verticesPerSide = segments + 1;
  const shared = new Map();
  for (const mesh of meshes) {
    const tile = mesh.userData?.terrainTile;
    const position = mesh.geometry.attributes.position;
    if (!tile || position.count < verticesPerSide * verticesPerSide) continue;
    const edgeIndices = new Set();
    for (let edgeIndex = 0; edgeIndex <= segments; edgeIndex += 1) {
      edgeIndices.add(edgeIndex);
      edgeIndices.add(segments * verticesPerSide + edgeIndex);
      edgeIndices.add(edgeIndex * verticesPerSide);
      edgeIndices.add(edgeIndex * verticesPerSide + segments);
    }
    for (const index of edgeIndices) {
      const worldX = position.getX(index) + Number(mesh.position?.x || 0);
      const worldZ = position.getZ(index) + Number(mesh.position?.z || 0);
      const key = `${tile.z}:${Math.round(worldX * 10000)}:${Math.round(worldZ * 10000)}`;
      const entries = shared.get(key) || [];
      entries.push({ mesh, position, index });
      shared.set(key, entries);
    }
  }

  let sharedVertices = 0;
  let maximumDeltaBefore = 0;
  const modifiedMeshes = new Set();
  for (const entries of shared.values()) {
    if (entries.length < 2) continue;
    const worldHeights = entries.map((entry) =>
      entry.position.getY(entry.index) + Number(entry.mesh.position?.y || 0)
    );
    const minimum = Math.min(...worldHeights);
    const maximum = Math.max(...worldHeights);
    maximumDeltaBefore = Math.max(maximumDeltaBefore, maximum - minimum);
    const sharedWorldY = worldHeights.reduce((sum, value) => sum + value, 0) / worldHeights.length;
    for (const entry of entries) {
      entry.position.setY(entry.index, sharedWorldY - Number(entry.mesh.position?.y || 0));
      entry.position.needsUpdate = true;
      modifiedMeshes.add(entry.mesh);
    }
    sharedVertices += 1;
  }
  for (const mesh of modifiedMeshes) mesh.geometry.computeVertexNormals?.();

  // Positions now have one exact owner value. Average the freshly computed
  // edge normals as presentation data without changing physical height.
  for (const entries of shared.values()) {
    if (entries.length < 2) continue;
    const normals = entries.map((entry) => entry.mesh.geometry.attributes.normal).filter(Boolean);
    if (normals.length !== entries.length) continue;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    entries.forEach((entry, index) => {
      nx += normals[index].getX(entry.index);
      ny += normals[index].getY(entry.index);
      nz += normals[index].getZ(entry.index);
    });
    const length = Math.hypot(nx, ny, nz) || 1;
    entries.forEach((entry, index) => {
      normals[index].setXYZ(entry.index, nx / length, ny / length, nz / length);
      normals[index].needsUpdate = true;
    });
  }
  return Object.freeze({
    authority: 'one-shared-world-height-per-terrain-edge-coordinate',
    meshCount: meshes.length,
    sharedVertices,
    maximumDeltaBefore
  });
}
