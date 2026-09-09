import {surveyOwner,surveyKey,localSurveyEnabled} from './survey-store.js';
import {loadLocalCaptureRecord} from './local-draft-store.js';
import {buildWallPatch,rectifyPhoto,wallFootprint} from './hybrid-geometry.js';
import {worldModificationIdentityForLocation} from '../editable-world/model.js?v=1';

// Produces the same facade-patch representation consumed by the existing runtime.
// It does not replace mapped geometry or collision, and cannot publish anything.
export async function localSurveyRepresentations(appCtx,existing){
  if(!localSurveyEnabled()||!localStorage.getItem('we3d-local-survey-present'))return [];
  const owner=surveyOwner(),key=surveyKey(owner),draft=await loadLocalCaptureRecord('drafts',key);
  if(!draft||draft.ownerUid!==owner)return [];
  const worldId=worldModificationIdentityForLocation(appCtx.LOC||{}),result=[];
  const actor=appCtx.activeTransportActor?.()?.position||appCtx.car||{x:0,z:0};
  const records=Object.values(draft.previews||{}).filter(r=>r.building.worldId===worldId).map(r=>({r,b:(appCtx.buildings||[]).find(b=>b.sourceBuildingId===r.building.sourceBuildingId)})).filter(({b})=>b).sort((a,b)=>Math.hypot((a.b.centerX||0)-actor.x,(a.b.centerZ||0)-actor.z)-Math.hypot((b.b.centerX||0)-actor.x,(b.b.centerZ||0)-actor.z)).slice(0,8);
  let budget=32;
  for(const {r,b} of records){
    if(!Array.isArray(r.preview?.patches)||r.preview.patches.length>16||r.preview.patches.length>budget)continue;
    budget-=r.preview.patches.length;
    const id=`local-survey:${owner}:${r.building.sourceBuildingId}:${r.preview.revision}`;
    const representation={representationId:id,sourceBuildingId:r.building.sourceBuildingId,representationKind:'facade-patches',footprint:wallFootprint(r.building),patchHeightMeters:r.preview.heightMeters};
    if(existing.has(id)){result.push(representation);continue;}
    const cx=b.centerX??(b.minX+b.maxX)/2,cz=b.centerZ??(b.minZ+b.maxZ)/2,current=(b.pts||[]).map(p=>({x:p.x-cx,z:p.z-cz}));
    if(current.length!==representation.footprint.length||current.some((p,i)=>Math.hypot(p.x-representation.footprint[i].x,p.z-representation.footprint[i].z)>.15))continue;
    const root=new THREE.Group();root.name='Private local photo survey preview';
    try{
      for(const patch of r.preview.patches){
        const photo=await loadLocalCaptureRecord('photos',patch.photoId);if(!photo||photo.draftId!==key)throw Error('Local preview photo unavailable');
        const bitmap=await createImageBitmap(photo.blob,{resizeWidth:1024});
        try{const a=representation.footprint[patch.wall],b=representation.footprint[(patch.wall+1)%representation.footprint.length];if(!a||!b)throw Error('Invalid wall');const region=patch.region,aspect=Math.hypot(b.x-a.x,b.z-a.z)*(region[2]-region[0])/(r.preview.heightMeters*(region[3]-region[1]));
          const canvas=rectifyPhoto(bitmap,patch.quad,aspect,512),texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;root.add(buildWallPatch(THREE,r.building,r.preview.heightMeters,patch,texture));
        }finally{bitmap.close();}
      }
      if(owner!==surveyOwner())throw Error('Account changed');representation.localRoot=root;result.push(representation);
    }catch(error){root.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});console.warn('[PhotoSurvey] Local preview kept mapped fallback:',error.message);}
  }
  return result;
}
