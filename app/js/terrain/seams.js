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
