import { appendUpwardRibbonGeometry } from '../road-render.js?v=2';

const FEATURE_COLORS = Object.freeze({
  cycleway: 0x8ca99a,
  footway: 0xb8b4ae,
  railway: 0x787878
});

function buildBatchGeometry(features, buildFeatureRibbonEdges, worldBaseTerrainY) {
  const vertices = [];
  const indices = [];
  for (const feature of features) {
    const halfWidth = Math.max(0.25, Number(feature.width || 1) * 0.5);
    const edges = buildFeatureRibbonEdges(
      feature,
      feature.pts,
      halfWidth,
      worldBaseTerrainY,
      { surfaceBias: feature.surfaceBias }
    );
    appendUpwardRibbonGeometry(
      edges.leftEdge,
      edges.rightEdge,
      vertices,
      indices
    );
  }
  if (vertices.length < 12 || indices.length < 6) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function publishLinearFeaturePresentation(options = {}) {
  const {
    appCtx,
    buildFeatureRibbonEdges,
    features = [],
    worldBaseTerrainY
  } = options;
  if (
    !appCtx?.scene ||
    typeof buildFeatureRibbonEdges !== 'function' ||
    !Array.isArray(features)
  ) {
    return 0;
  }

  const groups = new Map();
  for (const feature of features) {
    if (
      feature?.isStructureConnector ||
      !Array.isArray(feature?.pts) ||
      feature.pts.length < 2
    ) {
      continue;
    }
    const kind = String(feature.kind || 'footway');
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(feature);
  }

  let published = 0;
  for (const [kind, groupedFeatures] of groups) {
    const geometry = buildBatchGeometry(
      groupedFeatures,
      buildFeatureRibbonEdges,
      worldBaseTerrainY
    );
    if (!geometry) continue;
    const material = new THREE.MeshStandardMaterial({
      color: FEATURE_COLORS[kind] || FEATURE_COLORS.footway,
      roughness: 0.88,
      metalness: 0,
      transparent: false,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 2;
    mesh.receiveShadow = false;
    mesh.userData.isLinearFeatureLine = true;
    mesh.userData.isLinearFeatureBatch = true;
    mesh.userData.linearFeatureKind = kind;
    mesh.userData.batchCount = groupedFeatures.length;
    mesh.userData.compiledSurfacePresentation = true;
    appCtx.scene.add(mesh);
    appCtx.linearFeatureMeshes.push(mesh);
    published += 1;
  }
  return published;
}
