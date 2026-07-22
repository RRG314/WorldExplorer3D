function buildElevatedTerrainReference(terrainHeights, distances, totalDistance) {
  const lastIndex = terrainHeights.length - 1;
  const startY = Number(terrainHeights[0]) || 0;
  const endY = Number(terrainHeights[lastIndex]) || startY;
  const total = Math.max(0, Number(totalDistance) || 0);
  const reference = new Float32Array(terrainHeights.length);

  for (let i = 0; i < terrainHeights.length; i++) {
    const progress = total > 1e-6 ? distances[i] / total : 0;
    const approachGradeY = startY + (endY - startY) * progress;
    // A bridge follows the grade between its mapped approaches. Sampling the
    // ground beneath every deck point makes long spans follow valleys or the
    // seabed. Higher intervening terrain still raises an incomplete span.
    reference[i] = Math.max(approachGradeY, Number(terrainHeights[i]) || 0);
  }
  return reference;
}

function buildSubgradeTerrainReference(terrainHeights, distances, totalDistance) {
  const lastIndex = terrainHeights.length - 1;
  const startY = Number(terrainHeights[0]) || 0;
  const endY = Number(terrainHeights[lastIndex]) || startY;
  const total = Math.max(0, Number(totalDistance) || 0);
  const reference = new Float32Array(terrainHeights.length);

  for (let i = 0; i < terrainHeights.length; i++) {
    const progress = total > 1e-6 ? distances[i] / total : 0;
    // A tunnel is graded between its portals. Following terrain samples along
    // the alignment makes an underwater tunnel inherit seabed discontinuities.
    reference[i] = startY + (endY - startY) * progress;
  }
  return reference;
}

export { buildElevatedTerrainReference, buildSubgradeTerrainReference };
