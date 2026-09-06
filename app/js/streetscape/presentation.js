import { buildStreetscapeModel, streetscapeContainsPoint } from './model.js?v=1';

function appendQuad(target, quad, upward = false) {
  if (!Array.isArray(quad) || quad.length !== 4) return;
  const base = target.positions.length / 3;
  for (const point of quad) {
    target.positions.push(Number(point.x), Number(point.y), Number(point.z));
    target.uvs.push(Number(point.x) / 2.8, Number(point.z) / 2.8);
  }
  const firstX = quad[1].x - quad[0].x;
  const firstZ = quad[1].z - quad[0].z;
  const secondX = quad[2].x - quad[0].x;
  const secondZ = quad[2].z - quad[0].z;
  const projectedNormalY = firstZ * secondX - firstX * secondZ;
  if (upward && projectedNormalY < 0) {
    target.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  } else {
    target.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function buildGeometry(batch) {
  if (batch.positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2));
  geometry.setIndex(batch.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function pavementTextures(appCtx) {
  if (appCtx?.surfaceTextureSets?.pavement?.map) return appCtx.surfaceTextureSets.pavement;
  if (appCtx?.pavementDiffuse) {
    return {
      map: appCtx.pavementDiffuse,
      normalMap: appCtx.pavementNormal || null,
      roughnessMap: appCtx.pavementRoughness || null
    };
  }
  return null;
}

function topMaterial(appCtx) {
  const textures = pavementTextures(appCtx);
  const material = new THREE.MeshStandardMaterial({
    color: textures?.map ? 0xd7d5ce : 0xc8c6bf,
    map: textures?.map || null,
    normalMap: textures?.normalMap || null,
    roughnessMap: textures?.roughnessMap || null,
    roughness: 0.94,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  if (textures?.normalMap) material.normalScale = new THREE.Vector2(0.25, 0.25);
  material.name = 'WE3D streetscape concrete';
  return material;
}

function curbMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xb7b5ae,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide
  });
  material.name = 'WE3D streetscape curb';
  return material;
}

function addBatchMesh(appCtx, geometry, material, role) {
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `WE3D streetscape ${role}`;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = role === 'curb-faces' ? 2 : 3;
  mesh.userData.isUrbanSurfaceBatch = true;
  mesh.userData.isStreetscapeBatch = true;
  mesh.userData.streetscapeRole = role;
  mesh.userData.worldLoadSequence = appCtx._worldLoadSequence || 0;
  appCtx.scene.add(mesh);
  appCtx.urbanSurfaceMeshes.push(mesh);
  return mesh;
}

/**
 * Builds an optional visual/walking streetscape from the already-published
 * transport and building facts. It never edits road points, widths, terrain,
 * vehicle collision, traffic routing, or pedestrian navigation graphs.
 */
export function publishStreetscapePresentation(appCtx, options = {}) {
  if (typeof THREE === 'undefined' || !appCtx?.scene || !Array.isArray(options.roads)) return null;
  const tier = String(options.tier || appCtx.getDynamicBudgetState?.().tier || 'balanced').toLowerCase();
  const model = buildStreetscapeModel({
    roads: options.roads,
    buildings: appCtx.buildings,
    landuses: appCtx.landuses,
    entrances: appCtx.buildingEntranceCatalog?.entrances,
    vegetation: appCtx.vegetationFeatures,
    intersections: options.intersections,
    sampleTerrainY: options.sampleTerrainY,
    sampleRoadY: options.sampleRoadY,
    tier
  });
  const tops = { positions: [], uvs: [], indices: [] };
  const faces = { positions: [], uvs: [], indices: [] };
  for (const surface of model.surfaces) {
    appendQuad(tops, surface.corners, true);
    if (surface.curbTop) appendQuad(tops, surface.curbTop, true);
    if (surface.curbFace) appendQuad(faces, surface.curbFace, false);
  }
  const topGeometry = buildGeometry(tops);
  const topMesh = topGeometry ? addBatchMesh(appCtx, topGeometry, topMaterial(appCtx), 'concrete-tops') : null;
  const faceGeometry = buildGeometry(faces);
  const faceMesh = faceGeometry ? addBatchMesh(appCtx, faceGeometry, curbMaterial(), 'curb-faces') : null;
  const meshes = [topMesh, faceMesh].filter(Boolean);
  const diagnostics = Object.freeze({
    ...model.diagnostics,
    batchCount: meshes.length,
    topVertices: tops.positions.length / 3,
    curbFaceVertices: faces.positions.length / 3,
    roadGeometryMutations: 0,
    terrainGeometryMutations: 0,
    vehicleCollisionMeshes: 0,
    navigationGraphsCreated: 0
  });
  const publication = Object.freeze({
    type: 'StreetscapePresentation',
    generatorVersion: model.generatorVersion,
    model,
    diagnostics,
    worldLoadSequence: appCtx._worldLoadSequence || 0
  });
  appCtx.streetscapePublication = publication;
  appCtx.streetscapeContainsPoint = (x, z) => streetscapeContainsPoint(model, x, z);
  appCtx.urbanSurfaceStats = {
    ...appCtx.urbanSurfaceStats,
    sidewalkBatchCount: meshes.length,
    sidewalkVertices: diagnostics.vertices,
    sidewalkTriangles: diagnostics.triangles,
    streetscape: diagnostics
  };
  return publication;
}

export function clearStreetscapePresentation(appCtx) {
  appCtx.streetscapePublication = null;
  appCtx.streetscapeContainsPoint = null;
}
