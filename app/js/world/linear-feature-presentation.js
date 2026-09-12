import { appendUpwardRibbonGeometry } from '../road-render.js?v=4';

const FEATURE_COLORS = Object.freeze({
  cycleway: 0x8ca99a,
  footway: 0xb8b4ae,
  railway: 0x787878
});

// Keep coarse mapped paths outside the resident pavement coverage. The detailed area owner
// replaces their interiors, including incorrectly duplicated path strips through roadways.
function outsidePaths(feature, bounds) {
  if (!bounds || feature.kind !== 'footway' || feature.subtype !== 'sidewalk' || feature.isStructureConnector || feature.structureSemantics?.gradeSeparated || !['at_grade', undefined].includes(feature.structureSemantics?.terrainMode)) return [feature.pts];
  const paths = [];
  for (let i=1;i<feature.pts.length;i++) {
    const a=feature.pts[i-1], b=feature.pts[i], dx=b.x-a.x, dz=b.z-a.z;
    let lo=0,hi=1, hit=true;
    for (const [p,q] of [[-dx,a.x-bounds.minX],[dx,bounds.maxX-a.x],[-dz,a.z-bounds.minZ],[dz,bounds.maxZ-a.z]]) {
      if (Math.abs(p)<1e-9) { if(q<0)hit=false; continue; }
      const t=q/p; if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    }
    const at=t=>({x:a.x+dx*t,z:a.z+dz*t});
    if(!hit || lo>=hi) paths.push([a,b]);
    else {if(lo>0)paths.push([a,at(lo)]);if(hi<1)paths.push([at(hi),b]);}
  }
  return paths;
}

function buildBatchGeometry(features, buildFeatureRibbonEdges, worldBaseTerrainY, pavementBounds) {
  const vertices = [];
  const indices = [];
  for (const feature of features) {
    // A crossing describes pedestrian connectivity over the carriageway. A
    // solid path ribbon here paints a second surface across the asphalt.
    if (feature.subtype === 'crossing' && !feature.structureSemantics?.gradeSeparated) continue;
    const halfWidth = Math.max(0.25, Number(feature.width || 1) * 0.5);
    for (const points of outsidePaths(feature, pavementBounds)) {
    const edges = buildFeatureRibbonEdges(
      feature,
      points,
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
    worldBaseTerrainY,
    pavementBounds = null
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
      worldBaseTerrainY,
      pavementBounds
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
    appCtx.addEarthWorldObject(mesh);
    appCtx.linearFeatureMeshes.push(mesh);
    published += 1;
  }
  return published;
}
