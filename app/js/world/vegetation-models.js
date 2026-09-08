import {loadModelAsset} from '../assets/model-asset-runtime.js?v=15';
import {vegetationIdentitySeed} from './vegetation-spatial.js';

const models = new Map();
const CELL_METERS = 192;

export function vegetationModelKind(placement, biome = '', latitude = 45) {
  if (placement.landuseType === 'forest_groundcover') return 'fern';
  if (placement.landuseType === 'wetland_groundcover') return 'grass';
  if (placement.landuseType === 'wetland') return 'shrub';
  if (biome==='tundra' && placement.source!=='node') return 'shrub';
  if (placement.landuseType === 'scrub' || Number(placement.scale) < 0.6) return 'shrub';
  if (placement.leafType === 'needleleaved' || /boreal|alpine/.test(biome)) return 'pine';
  if (placement.leafType === 'broadleaved' || biome.startsWith('tropical') || biome==='hot-desert' || Math.abs(latitude)<24) return 'broadleaf';
  return vegetationIdentitySeed(`${placement.x}:${placement.z}`) % 4 === 0 ? 'pine' : 'broadleaf';
}

function requestModel(ctx, kind) {
  if (models.has(kind)) {
    const previous=models.get(kind);
    if(!previous.error || previous.requestSequence===ctx._worldLoadSequence) {
      previous.requestSequence=ctx._worldLoadSequence;return previous;
    }
  }
  const state = {parts:null, error:null,requestSequence:ctx._worldLoadSequence}; models.set(kind,state);
  Promise.allSettled((['pine','broadleaf'].includes(kind) ? ['', '-lod'] : ['']).map(suffix=>loadModelAsset(THREE, `nature-${kind}${suffix}`)))
    .then(results=>{
      const failure=results.find(result=>result.status==='rejected');
      if(failure) {
        for(const result of results) if(result.status==='fulfilled') result.value.dispose();
        throw failure.reason;
      }
      const instances=results.map(result=>result.value);
      state.parts = instances.map(instance=>{
        instance.root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(instance.root);
        const height = bounds.max.y-bounds.min.y;
        const normalizedScale = (kind === 'grass' ? 1.2 : kind === 'fern' ? 0.7 : kind === 'shrub' ? 1.8 : 9) / Math.max(height,0.1);
        const parts=[];
        instance.root.traverse(mesh=>{
          if(!mesh.isMesh) return;
          const geometry=mesh.geometry.clone();geometry.applyMatrix4(mesh.matrixWorld);
          geometry.translate(0,-bounds.min.y,0);geometry.scale(normalizedScale,normalizedScale,normalizedScale);
          const material=mesh.material.clone();material.roughness=0.93;
          // Templates own textures across world reloads; batches own their geometry/materials.
          for(const value of Object.values(material)) if(value?.isTexture) {
            value.userData=value.userData || {};
            value.userData.sharedRuntimeTexture=true;
          }
          parts.push({geometry,material});
        });
        instance.dispose();
        return parts;
      });
      const trunk=state.parts[0].find(part=>/bark/i.test(part.material.name));
      let radius=0.12;
      const positions=trunk?.geometry?.attributes?.position;
      for(let i=0;i<(positions?.count||0);i++) if(positions.getY(i)<=1 && positions.getY(i)>=0) radius=Math.max(radius,Math.hypot(positions.getX(i),positions.getZ(i)));
      state.trunkRadius=Math.min(0.8,radius);
      if(state.requestSequence === ctx._worldLoadSequence) ctx.scheduleWorldCoverVegetationRefresh?.();
    }).catch(error=>{state.error=String(error?.message || error);});
  return state;
}

export function renderVegetationModels(ctx, placements) {
  const groups = new Map();
  const biome = ctx.worldSurfaceProfile?.biome?.id || '';
  const accepted=[];
  for(const placement of placements) {
    const kind=vegetationModelKind(placement,biome,Number(ctx.LOC?.lat ?? 45)), model=requestModel(ctx,kind);
    if(!model.parts) continue;
    const baseY=ctx.terrainMeshHeightAt?.(placement.x,placement.z) ?? ctx.elevationWorldYAtWorldXZ?.(placement.x,placement.z);
    if(!Number.isFinite(baseY)) continue;
    const cx=Math.floor(placement.x/CELL_METERS), cz=Math.floor(placement.z/CELL_METERS);
    const key=`${cx}:${cz}:${kind}`;
    if(!groups.has(key)) groups.set(key,{cx,cz,kind,model,placements:[]});
    placement.baseY=baseY;
    placement.modelKind=kind;
    placement.trunkRadius=['shrub','fern','grass'].includes(kind) ? 0 : model.trunkRadius*Math.max(.65,Number(placement.scale)||1);
    placement.trunkHeight=['shrub','fern','grass'].includes(kind) ? 0 : 3.5*Math.max(.65,Number(placement.scale)||1);
    groups.get(key).placements.push(placement);accepted.push(placement);
  }
  for(const group of groups.values()) {
    const lod=new THREE.LOD();
    const centerX=(group.cx+.5)*CELL_METERS, centerZ=(group.cz+.5)*CELL_METERS;
    const centerY=group.placements.reduce((sum,p)=>sum+p.baseY,0)/group.placements.length;
    lod.position.set(centerX,centerY,centerZ);
    for(let level=0;level<group.model.parts.length;level++) {
      const root=new THREE.Group();
      for(const part of group.model.parts[level]) {
        const geometry=part.geometry.clone(), material=part.material.clone();
        const mesh=new THREE.InstancedMesh(geometry,material,group.placements.length);
        const bound=new THREE.Box3(), localBox=new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
        const matrix=new THREE.Matrix4(), quaternion=new THREE.Quaternion(), scale=new THREE.Vector3();
        group.placements.forEach((p,index)=>{
          const size=Math.max(.65,Number(p.scale)||1);
          quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),Number(p.rotation)||0);
          scale.set(size,size,size);
          matrix.compose(new THREE.Vector3(p.x-centerX,p.baseY-centerY,p.z-centerZ),quaternion,scale);
          mesh.setMatrixAt(index,matrix);bound.union(localBox.clone().applyMatrix4(matrix));
        });
        // Three r128 culls instances using geometry bounds, not instance bounds.
        geometry.boundingSphere=bound.getBoundingSphere(new THREE.Sphere());
        geometry.boundingBox=bound;
        mesh.frustumCulled=true;mesh.castShadow=false;mesh.receiveShadow=true;
        mesh.instanceMatrix.needsUpdate=true;root.add(mesh);
      }
      lod.addLevel(root,level===0 ? 0 : 300);
    }
    lod.addLevel(new THREE.Group(),['fern','grass'].includes(group.kind) ? 240 : 1600);
    lod.userData.isVegetationBatch=true;
    lod.userData.vegetationAuthority='curated-model-cell-lod';
    ctx.addEarthWorldObject(lod);ctx.vegetationMeshes.push(lod);
  }
  ctx.replaceWorldCollection('vegetationFeatures',accepted);
  ctx.vegetationModelStatus=Object.fromEntries([...models].map(([kind,state])=>[kind,state.error || (state.parts ? 'ready' : 'loading')]));
  return accepted.length;
}

export function disposeVegetationBatch(root) {
  root?.parent?.remove(root);
  root?.traverse?.(object=>{
    object.geometry?.dispose?.();
    const materials=Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material=>material?.dispose?.());
  });
}
