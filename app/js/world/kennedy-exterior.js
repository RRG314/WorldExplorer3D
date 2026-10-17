import {isVehicleAssemblyBuilding,vabFrame} from './kennedy-facility.js';
import {loadOwnedLandmarkModel,disposeLandmarkModel} from './landmark-lifetime.js';
import {detachSceneObject} from '../engine/scene-object-lifecycle.js';
import {replaceVenueCollision,venueComponentCollider} from './venue-collision.js';
import {addReviewedVenueDoor} from './reviewed-venue-exteriors.js';
import {batchOwnedStaticStructure} from './static-structure-batching.js';
import {VAB_SURVEY} from './kennedy-site-survey.js';

export async function publishKennedyExterior(ctx,T){
 const sources=ctx.buildingMeshes.filter(m=>isVehicleAssemblyBuilding(m.userData)&&m.userData.buildingFootprint);
 if(!sources.length)return null;
 const sequence=ctx._worldLoadSequence,controller=new AbortController(),root=new T.Group();
 root.name='NASA Vehicle Assembly Building';root.userData={sourceBuildingId:sources[0].userData.sourceBuildingId,reviewedVenueExterior:true};
 root.addEventListener('removed',()=>controller.abort());ctx.addEarthWorldObject(root);ctx.buildingMeshes.push(root);
 try{
  const model=await loadOwnedLandmarkModel(T,new URL('../../assets/models/nasa/vehicle-assembly-building.glb',import.meta.url).href,controller.signal);
  if(sequence!==ctx._worldLoadSequence||!root.parent){disposeLandmarkModel(model);return null;}
  const f=vabFrame(ctx),base=Math.min(...sources.map(m=>m.position.y));
  // NASA model's main cladding primitive anchors the high bay. The adjoining
  // low bay and water tower must not be included in the scale calculation.
  const frame=new T.Group();frame.position.set(f.center.x,base+2.857023*160.02/12.915563*f.k,f.center.z);
  frame.rotation.y=Math.atan2(-f.sz,f.sx);frame.scale.set(134.72/9.223713*f.k,160.02/12.915563*f.k,157.89/12.063355*f.k);
  frame.add(model);root.add(frame);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const removed=new Set(sources);
  for(const mesh of sources){detachSceneObject(mesh);mesh.geometry?.dispose();if(!mesh.material?.userData?.sharedRuntimeMaterial)mesh.material?.dispose();}
  ctx.replaceWorldCollection('buildingMeshes',ctx.buildingMeshes.filter(m=>!removed.has(m)));
  replaceVenueCollision(ctx,(ctx.buildings||[]).filter(isVehicleAssemblyBuilding),[VAB_SURVEY[0],VAB_SURVEY[1]].map((part,i)=>venueComponentCollider(`vab-part:${part.id}`,part.points.slice(0,-1).map(p=>ctx.geoToWorld(p.lat,p.lon)),base,base+(i?160.02:64)*f.k)));
  const door=ctx.buildingEntranceCatalog?.entrances?.find(e=>isVehicleAssemblyBuilding({sourceBuildingId:e.buildingSourceId}));
  if(door){const entry=new T.Group();entry.name='VAB visit entrance';addReviewedVenueDoor(T,entry,door,'VEHICLE ASSEMBLY BUILDING');batchOwnedStaticStructure(T,entry);root.add(entry);}
  root.userData.modelReady=true;return root;
 }catch(error){if(!controller.signal.aborted){root.userData.loadError=String(error.message);console.warn('[Kennedy] Exterior model unavailable:',error.message);}return null;}
}
