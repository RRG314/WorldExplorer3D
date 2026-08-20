import { compileEntranceCatalog } from '../living-world/entrance-catalog.js?v=6';

const STYLE_CODE = Object.freeze({
  paneled: 0,
  paneled_glass: 1,
  glass_double: 2,
  metal_glass: 3,
  civic_transom: 4,
  steel_service: 5
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function tierForContext(appCtx) {
  const tier = String(appCtx?.getDynamicBudgetState?.().tier || 'balanced').toLowerCase();
  return ['low', 'performance', 'balanced', 'quality'].includes(tier) ? tier : 'balanced';
}

function entranceTouchesFacadeMesh(mesh, entrance) {
  const points = Array.isArray(mesh?.userData?.buildingFootprint) ? mesh.userData.buildingFootprint : [];
  if (points.length < 3) return false;
  let bestDistance = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const dx = finite(end?.x) - finite(start?.x);
    const dz = finite(end?.z) - finite(start?.z);
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared <= 1e-8) continue;
    const t = Math.max(0, Math.min(1,
      ((finite(entrance?.x) - finite(start?.x)) * dx + (finite(entrance?.z) - finite(start?.z)) * dz) / lengthSquared
    ));
    const x = finite(start?.x) + dx * t;
    const z = finite(start?.z) + dz * t;
    bestDistance = Math.min(bestDistance, Math.hypot(finite(entrance?.x) - x, finite(entrance?.z) - z));
  }
  const verticalDelta = Math.abs(finite(entrance?.facadeBaseY, entrance?.y) - finite(mesh?.position?.y));
  return bestDistance <= 0.11 && verticalDelta <= 1.2;
}

function attachEntranceAttribute(mesh, entrance) {
  const geometry = mesh?.geometry;
  const positions = geometry?.attributes?.position;
  const normals = geometry?.attributes?.normal;
  if (!positions || !normals) return { attributedVertices: 0, bytes: 0 };

  const values = new Float32Array(positions.count * 4);
  const styleCode = STYLE_CODE[String(entrance?.doorStyle || 'paneled')] ?? 0;
  // Keep the mask selector in the stable [0, 1) interpolant range and pack the
  // 3x2 atlas cell into sixteenth steps. Large integer varyings were not
  // reliable after dense-city geometry merging on every WebGL path.
  const atlasCell = styleCode === 2 ? 3 : styleCode === 3 ? 2 : styleCode;
  const encodedStyle = atlasCell / 16;
  const bottomLocalY = finite(entrance?.y) - finite(mesh?.position?.y);
  const attributed = new Set();
  const indices = geometry.index;
  const triangleCount = indices ? Math.floor(indices.count / 3) : Math.floor(positions.count / 3);

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const vertexIndices = [0, 1, 2].map((corner) => indices
      ? indices.getX(triangleIndex * 3 + corner)
      : triangleIndex * 3 + corner
    );
    let centerX = 0;
    let centerZ = 0;
    let normalX = 0;
    let normalY = 0;
    let normalZ = 0;
    for (const vertexIndex of vertexIndices) {
      centerX += positions.getX(vertexIndex) + finite(mesh?.position?.x);
      centerZ += positions.getZ(vertexIndex) + finite(mesh?.position?.z);
      normalX += normals.getX(vertexIndex);
      normalY += normals.getY(vertexIndex);
      normalZ += normals.getZ(vertexIndex);
    }
    centerX /= 3;
    centerZ /= 3;
    normalX /= 3;
    normalY /= 3;
    normalZ /= 3;
    if (Math.abs(normalY) > 0.55) continue;
    if (normalX * finite(entrance?.normalX) + normalZ * finite(entrance?.normalZ) < 0.72) continue;
    const centerDx = centerX - finite(entrance?.x);
    const centerDz = centerZ - finite(entrance?.z);
    const wallDistance = Math.abs(centerDx * finite(entrance?.normalX) + centerDz * finite(entrance?.normalZ));
    if (wallDistance > 0.09) continue;

    for (const vertexIndex of vertexIndices) {
      const x = positions.getX(vertexIndex) + finite(mesh?.position?.x);
      const z = positions.getZ(vertexIndex) + finite(mesh?.position?.z);
      const tangentOffset = (x - finite(entrance?.x)) * finite(entrance?.tangentX) +
        (z - finite(entrance?.z)) * finite(entrance?.tangentZ);
      const offset = vertexIndex * 4;
      values[offset] = tangentOffset;
      values[offset + 1] = 1;
      values[offset + 2] = bottomLocalY;
      values[offset + 3] = encodedStyle;
      attributed.add(vertexIndex);
    }
  }

  geometry.setAttribute('facadeEntrance', new THREE.BufferAttribute(values, 4));
  return { attributedVertices: attributed.size, bytes: values.byteLength };
}

/**
 * Publishes one entrance identity per selected building before facade batching.
 * The identity drives both the shader-owned wall treatment and interaction;
 * no parallel door mesh or retained placement graph is created.
 */
export function publishBuildingFacadeEntrances(appCtx, options = {}) {
  const tier = String(options.tier || tierForContext(appCtx));
  const nearFacadeMeshes = (Array.isArray(appCtx?.buildingMeshes) ? appCtx.buildingMeshes : []).filter((mesh) =>
    mesh?.userData?.lodTier === 'near' &&
    !mesh?.userData?.isRoofDetail &&
    mesh?.material?.userData?.buildingExterior === true
  );
  const nearBuildingIds = new Set(
    nearFacadeMeshes.map((mesh) => String(mesh.userData?.sourceBuildingId || '')).filter(Boolean)
  );
  const compiledCatalog = compileEntranceCatalog({
    buildings: (Array.isArray(appCtx?.buildings) ? appCtx.buildings : []).filter((building) =>
      nearBuildingIds.has(String(building?.sourceBuildingId || building?.id || ''))
    ),
    mappedEntrances: appCtx?.mappedBuildingEntrances,
    nearestRoad: appCtx?.findNearestRoad,
    sampleGround: (x, z) => appCtx?.GroundHeight?.walkSurfaceY?.(x, z) ?? appCtx?.elevationWorldYAtWorldXZ?.(x, z),
    tier
  });
  const compiledByBuilding = new Map(
    compiledCatalog.entrances.map((entrance) => [String(entrance.buildingSourceId), entrance])
  );
  const integratedEntrances = [];
  let facadeMeshes = 0;
  let attributedVertices = 0;
  let attributeBytes = 0;
  let facadeVertexCapacity = 0;
  let coincidentWallBindings = 0;

  for (const mesh of nearFacadeMeshes) {
    const directEntrance = compiledByBuilding.get(String(mesh.userData?.sourceBuildingId || '')) || null;
    const entrance = directEntrance || compiledCatalog.entrances.find((candidate) =>
      entranceTouchesFacadeMesh(mesh, candidate)
    ) || null;
    facadeMeshes += 1;
    facadeVertexCapacity += Number(mesh.geometry?.attributes?.position?.count || 0);
    if (!entrance) continue;
    const result = attachEntranceAttribute(mesh, entrance);
    attributedVertices += result.attributedVertices;
    attributeBytes += result.bytes;
    if (result.attributedVertices >= 4 && directEntrance) integratedEntrances.push(entrance);
    else if (result.attributedVertices >= 4) coincidentWallBindings += 1;
  }

  const entrances = Object.freeze(integratedEntrances);
  const entranceByBuilding = new Map(
    entrances.map((entrance) => [String(entrance.buildingSourceId), entrance])
  );
  const catalog = Object.freeze({
    ...compiledCatalog,
    entrances,
    diagnostics: Object.freeze({
      ...compiledCatalog.diagnostics,
      published: entrances.length,
      mapped: entrances.filter((entrance) => entrance.provenance === 'mapped').length,
      inferred: entrances.filter((entrance) => entrance.provenance === 'inferred').length,
      rejectedWithoutWallFace: compiledCatalog.entrances.length - entrances.length
    })
  });

  const diagnostics = Object.freeze({
    ...catalog.diagnostics,
    facadeMeshes,
    attributedVertices,
    attributeBytes,
    estimatedBatchedAttributeBytes: facadeVertexCapacity * 16,
    coincidentWallBindings,
    addedDrawCalls: 0,
    retainedDecorativeMeshes: 0,
    facadeIntegration: 'shader-integrated-wall-face',
    renderOwner: 'engine/building-facade-materials',
    interactionOwner: 'building-entry'
  });
  const publication = Object.freeze({
    type: 'BuildingFacadeEntrancePublication',
    schemaVersion: 1,
    catalog,
    entranceByBuilding,
    renderedEntrances: entrances,
    diagnostics
  });
  appCtx.buildingEntranceCatalog = catalog;
  appCtx.buildingEntranceByBuilding = entranceByBuilding;
  appCtx.buildingFacadeEntrances = publication;
  return publication;
}

export function clearBuildingFacadeEntrances(appCtx) {
  appCtx.buildingEntranceCatalog = null;
  appCtx.buildingEntranceByBuilding = null;
  appCtx.buildingFacadeEntrances = null;
}

export { STYLE_CODE };
