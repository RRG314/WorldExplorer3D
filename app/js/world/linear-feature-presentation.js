import {drainCooperatively} from './cooperative-scheduling.js?v=1';
import { appendUpwardRibbonGeometry } from '../road-render.js?v=4';
import { linearRibbonStations } from './linear-ribbon-stations.js';
import {createPortalSurfaceClipper} from '../terrain/portal-surface-clip.js';
import {isPavementFootway} from './compiler/pavement-footway-policy.js';
import {createConcretePavementTexture} from './pavement-texture.js';

const FEATURE_COLORS = Object.freeze({
  cycleway: 0x8ca99a,
  footway: 0xb8b4ae,
  railway: 0x787878
});

// Keep coarse mapped paths outside the resident pavement coverage. The detailed area owner
// replaces their interiors, including incorrectly duplicated path strips through roadways.
function outsidePaths(feature, bounds) {
  if (!bounds || !isPavementFootway(feature)) return [feature.pts];
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

function* buildBatchGeometry(features, buildFeatureRibbonEdges, worldBaseTerrainY, pavementBounds, clipSurface, metersPerWorldUnit) {
  const vertices = [];
  const indices = [];
  for (const feature of features) {
    yield;
    // A crossing describes pedestrian connectivity over the carriageway. A
    // solid path ribbon here paints a second surface across the asphalt.
    if (feature.subtype === 'crossing' && !feature.structureSemantics?.gradeSeparated) continue;
    const halfWidth = Math.max(0.25, Number(feature.width || 1) * 0.5);
    for (const points of outsidePaths(feature, pavementBounds)) {
    const edges = buildFeatureRibbonEdges(
      feature,
      linearRibbonStations(feature, points),
      halfWidth,
      worldBaseTerrainY,
      { surfaceBias: feature.surfaceBias }
    );
    if(clipSurface && feature.structureSemantics?.terrainMode==='at_grade' && !feature.transportSurfaceModel?.engineeredApproach) {
      const positions=[],triangles=[];
      appendUpwardRibbonGeometry(edges.leftEdge,edges.rightEdge,positions,triangles);
      const cut=clipSurface(positions,triangles),base=vertices.length/3;
      for(const value of cut.positions)vertices.push(value);
      for(const value of cut.indices)indices.push(base+value);
    } else appendUpwardRibbonGeometry(
      edges.leftEdge,
      edges.rightEdge,
      vertices,
      indices
    );
    }
  }
  if (vertices.length < 12 || indices.length < 6) return null;
  let uv=null;
  if(metersPerWorldUnit){
    uv=new Float32Array(vertices.length/3*2);
    for(let i=0,j=0;i<vertices.length;i+=3,j+=2){
      uv[j]=vertices[i]*metersPerWorldUnit/1.6;uv[j+1]=vertices[i+2]*metersPerWorldUnit/1.6;
      if(i%9216===0)yield;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  if(uv)geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function* linearFeaturePresentationSteps(options = {}) {
  const {
    appCtx,
    buildFeatureRibbonEdges,
    features = [],
    worldBaseTerrainY,
    metersPerWorldUnit = appCtx?.METERS_PER_WORLD_UNIT || 1.11,
    pavementBounds = null,
    portalMasks = appCtx?.structureTerrainPortalDescriptors || []
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
    yield;
    if (
      feature?.isStructureConnector ||
      !Array.isArray(feature?.pts) ||
      feature.pts.length < 2
    ) {
      continue;
    }
    const group = isPavementFootway(feature) ? 'pavement' : String(feature.kind || 'footway');
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(feature);
  }

  let published = 0;
  const clipSurface=portalMasks.length?createPortalSurfaceClipper(portalMasks):null;
  for (const [group, groupedFeatures] of groups) {
    const paved=group==='pavement',kind=paved?'footway':group;
    const geometry = yield* buildBatchGeometry(
      groupedFeatures,
      buildFeatureRibbonEdges,
      worldBaseTerrainY,
      pavementBounds,
      clipSurface,
      paved ? metersPerWorldUnit : null
    );
    if (!geometry) continue;
    const texture=paved ? createConcretePavementTexture(THREE) : null;
    const material = new THREE.MeshStandardMaterial({
      color: paved ? 0xffffff : FEATURE_COLORS[kind] || FEATURE_COLORS.footway,
      map: texture,
      roughness: paved ? .96 : .88,
      metalness: 0,
      transparent: false,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide
    });
    // This small texture belongs to this batch, unlike the shared engine PBR
    // maps. Replacement and world teardown both retire it with the material.
    if(texture)material.addEventListener('dispose',()=>texture.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 2;
    mesh.receiveShadow = paved;
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


export function publishLinearFeaturePresentation(options={}){
 const steps=linearFeaturePresentationSteps(options);let result;
 do{result=steps.next();}while(!result.done);
 return result.value;
}
export function publishLinearFeaturePresentationCooperatively(options={},schedule={}){
 return drainCooperatively(linearFeaturePresentationSteps(options),schedule);
}
