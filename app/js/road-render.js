import {applyRoadCreaseNormals} from './terrain/road-crease-normals.js';
import { normalizePublishedRoadIndices } from './terrain/published-road-integrity.js';

export function createRoadMarkingMaterial({color=0xffffee,emissive=0x444444,emissiveIntensity=.3,roughness=.8,
  vertexColors=false,side,depthWrite=true}={},T=globalThis.THREE) {
  // Roads use -2. Paint must stay ahead of their depth bias at grazing angles.
  return new T.MeshStandardMaterial({color,emissive,emissiveIntensity,roughness,vertexColors,side:side??T.FrontSide,depthWrite,
    polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6});
}

function appendUpwardRibbonGeometry(leftEdge = [], rightEdge = [], vertices = [], indices = []) {
  const count = Math.min(leftEdge.length, rightEdge.length);
  if (count < 2) return false;

  const start = vertices.length / 3;
  for (let i = 0; i < count; i += 1) {
    const left = leftEdge[i];
    const right = rightEdge[i];
    vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
    if (i < count - 1) {
      const vi = start + i * 2;
      indices.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
    }
  }
  return true;
}

export function createRoadEdgeBandMaterial(T=globalThis.THREE){
  return new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.96,metalness:0,side:T.DoubleSide,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,depthWrite:true,depthTest:true});
}

function createRoadSurfaceMaterials({
  sidewalkTex = null,
  sidewalkNormal = null,
  sidewalkRoughness = null,
  includeMarkings = false,
  includeSidewalk = false,includeEdgeBands = false
} = {}) {
  const roadMainMaterial = new THREE.MeshStandardMaterial({
    color: 0x303236,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: true,
    depthTest: true
  });

  const roadSkirtMaterial = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  const materials = {
    roadMainMaterial,
    roadSkirtMaterial
  };

  if(includeEdgeBands)materials.roadEdgeBandMaterial=createRoadEdgeBandMaterial();

  if (includeMarkings) {
    materials.roadMarkMaterial = createRoadMarkingMaterial();
  }

  if (includeSidewalk) {
    materials.sidewalkMaterial = sidewalkTex ? new THREE.MeshStandardMaterial({
      color: 0xd9d3ca,
      map: sidewalkTex,
      normalMap: sidewalkNormal || undefined,
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughnessMap: sidewalkRoughness || undefined,
      roughness: 0.97,
      metalness: 0.0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      depthWrite: true,
      depthTest: true
    }) : new THREE.MeshStandardMaterial({
      color: 0x9f9b95,
      roughness: 0.97,
      metalness: 0.0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      depthWrite: true,
      depthTest: true
    });
  }

  return materials;
}

function disposeRoadSurfaceMaterials(materials = null) {
  if (!materials || typeof materials !== 'object') return;
  Object.values(materials).forEach((material) => {
    if (material && typeof material.dispose === 'function') material.dispose();
  });
}

function roadSurfaceMaterialCacheKey({
  sidewalkTex = null,
  sidewalkNormal = null,
  sidewalkRoughness = null,
  includeMarkings = false,
  includeSidewalk = false
} = {}) {
  return [
    'flat-asphalt',
    sidewalkTex ? 'sidewalktex' : 'sidewalkflat',
    sidewalkNormal ? 'sidewalknormal' : 'sidewalkplain',
    sidewalkRoughness ? 'sidewalkrough' : 'sidewalksmooth',
    includeMarkings ? 'marks' : 'nomarks',
    includeSidewalk ? 'sidewalk' : 'nosidewalk'
  ].join(':');
}

function buildIndexedBatchMesh({
  scene,
  targetList = null,
  verts = [],
  indices = [],
  colors = null,baseY = null,normalCreaseAngleRadians,
  material = null,
  renderOrder = 0,
  userData = null,
  receiveShadow = true,
  frustumCulled = false
} = {}) {
  if (!scene || !material || !(Array.isArray(verts)||ArrayBuffer.isView(verts)) || !(Array.isArray(indices)||ArrayBuffer.isView(indices)) || !verts.length || !indices.length) {
    return null;
  }
  if(colors!==null&&(!((Array.isArray(colors)||ArrayBuffer.isView(colors)))||colors.length!==verts.length||!colors.every(n=>Number.isInteger(n)&&n>=0&&n<=255)))throw Error('invalid_road_batch_colors');
  if(baseY!==null&&(!((Array.isArray(baseY)||ArrayBuffer.isView(baseY)))||baseY.length!==verts.length/3||!baseY.every(Number.isFinite)))throw Error('invalid_road_base_witness');
  if(normalCreaseAngleRadians!==undefined&&(!Number.isFinite(normalCreaseAngleRadians)||normalCreaseAngleRadians<=0||normalCreaseAngleRadians>Math.PI/2))throw Error('invalid_road_normal_crease');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  if(colors!==null)geometry.setAttribute('color',new THREE.BufferAttribute(new Uint8Array(colors),3,true));
  if(baseY!==null)geometry.setAttribute('roadBaseY',new THREE.Float32BufferAttribute(baseY,1));
  const uv = [];
  for (let i = 0; i < verts.length; i += 3) uv.push(verts[i] * 1.11 / 4, verts[i + 2] * 1.11 / 4);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const vertexCount = verts.length / 3;
  const indexArray = vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  let publishedIndices = indexArray;
  if (userData?.isRoadBatch && !userData.isRoadSkirt && !userData.isRoadMarking) {
    const normalized = normalizePublishedRoadIndices(geometry.attributes.position.array, indexArray, userData.surfaceRanges);
    publishedIndices = normalized.indices;
    userData = { ...userData, surfaceRanges: normalized.surfaceRanges,
      removedZeroFootprintTriangles: normalized.removedZeroFootprintTriangles,
      correctedDownwardTriangles: normalized.correctedDownwardTriangles };
  }
  geometry.setIndex(new THREE.BufferAttribute(publishedIndices, 1));
  if(normalCreaseAngleRadians!==undefined)applyRoadCreaseNormals(geometry,normalCreaseAngleRadians);else geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = renderOrder;
  mesh.receiveShadow = !!receiveShadow;
  mesh.frustumCulled = !!frustumCulled;
  if (userData && typeof userData === 'object') {
    Object.assign(mesh.userData, userData);
  }
  scene.add(mesh);
  if (Array.isArray(targetList)) targetList.push(mesh);
  return mesh;
}

export {
  appendUpwardRibbonGeometry,
  buildIndexedBatchMesh,
  createRoadSurfaceMaterials,
  disposeRoadSurfaceMaterials,
  roadSurfaceMaterialCacheKey
};
