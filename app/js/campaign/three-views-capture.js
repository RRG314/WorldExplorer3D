import { targetFromIntersection } from '../interaction/world-click-router.js?v=3';
import { capturePresentation } from '../runtime/renderer-owners.js';
import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
import { THREE_VIEWS, validateAlbumPhoto } from './three-views.js';

// Explicit shutter actions only. No scene traversal, raycasting, canvas reads or
// image encoding in the ordinary frame loop while the camera is not requested.
export function inspectPhotoSubject(ctx, identity, expectedId) {
  if(ctx.getEnv?.()!=='EARTH'||ctx.getCurrentTravelMode?.()!=='walk'||ctx.worldLoading||ctx.activeInterior||ctx.getLiveGpsSnapshot?.().active)
    throw Error('Explore outdoors on foot with Live GPS off to frame this place.');
  const T=globalThis.THREE,camera=ctx.camera,frame=earthCoordinateFrame(ctx.LOC,ctx.SCALE);
  camera.updateMatrixWorld();
  const visible=object=>{for(let p=object;p;p=p.parent)if(!p.visible)return false;return true;};
  // Include vegetation, terrain and other scene geometry: picking only the
  // building array would photograph through trees, vehicles and walls.
  const roots=ctx.scene.children.filter(visible);
  const ray=new T.Raycaster();ray.near=.5;ray.far=180;
  const samples=[[0,0],[-.55,0],[.55,0],[0,.45],[0,-.45]];
  const hits=samples.map(([x,y])=>{
    ray.setFromCamera(new T.Vector2(x,y),camera);
    return ray.intersectObjects(roots,true).find(hit=>visible(hit.object)&&!hit.object.isSprite&&hit.object.material?.depthTest!==false&&!(hit.object.material?.transparent&&hit.object.material.opacity<.2));
  });
  const hit=hits[0],target=targetFromIntersection(hit);
  if(target?.kind!=='building'||!target.id||expectedId&&target.id!==expectedId)throw Error('Aim the center of the screen at your building, with a clear view of its facade.');
  const metadata=ctx.buildings?.find(b=>String(b.sourceBuildingId||b.id)===target.id);
  const p=camera.getWorldPosition(new T.Vector3());
  const subject={id:target.id,name:String(metadata?.tags?.name||metadata?.name||target.label||'Mapped building').slice(0,180),
    regionId:identity.regionId,regionLabel:identity.regionLabel,position:{...frame.toGeographic(hit.point.x,hit.point.z),y:hit.point.y}};
  return {subject,view:{subjectId:target.id,regionId:identity.regionId,position:{...frame.toGeographic(p.x,p.z),y:p.y},
    bearing:Math.atan2(hit.point.x-p.x,hit.point.z-p.z),range:hit.distance,coverage:hits.filter(h=>targetFromIntersection(h)?.id===target.id).length/samples.length,
    environment:'EARTH',travelMode:'walk',liveGps:false,visible:true}};
}

export function createWorldPhotoCapture(ctx) {
  let pending=null,disposed=false;
  const cancel=()=>{if(pending){clearTimeout(pending.timer);pending.reject(Error('The scene changed before the photograph was ready. Try again.'));pending=null;}};
  const unregister=ctx.registerRuntimeSystem?.({id:'campaign.photo-shutter',owner:'campaign-photo',phase:'render',priority:1000,critical:false,
    enabled:frame=>!!pending&&frame.manualRender!==false&&!ctx.worldLoading&&!ctx.titleLaunchPending&&!ctx.hasPauseReason?.('manual_pause')&&!document.hidden,
    update(){
      if(!pending)return;
      const job=pending;
      if(!job.presentation.isCurrent()){cancel();return;}
      // Read only after the normal renderer/composer has produced a new frame.
      if(job.presentation.renderer.info.render.frame===job.frame)return;
      pending=null;clearTimeout(job.timer);
      try{
        const evidence=job.inspect(),source=job.presentation.renderer.domElement;
        if(source.width<64||source.height<64)throw Error('The world view is too small for a photograph.');
        const canvas=document.createElement('canvas'),scale=Math.min(1,960/source.width,720/source.height);
        canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);
        const context=canvas.getContext('2d',{willReadFrequently:true});
        context.drawImage(source,0,0,canvas.width,canvas.height);
        // An empty or lost WebGL buffer must not become a saved photograph.
        const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
        let min=Infinity,max=0;for(let i=0;i<pixels.length;i+=64){const value=pixels[i]+pixels[i+1]+pixels[i+2];min=Math.min(min,value);max=Math.max(max,value);}
        if(max-min<8)throw Error('The frame is blank. Wait for the world to appear, then try again.');
        let dataUrl;for(const quality of [.86,.74,.60]){dataUrl=canvas.toDataURL('image/jpeg',quality);if(dataUrl.length<=Math.ceil(THREE_VIEWS.maxPhotoBytes*4/3)+23)break;}
        const photo=validateAlbumPhoto({id:`three-views:${job.kind}`,kind:job.kind,width:canvas.width,height:canvas.height,dataUrl});
        const encoded=new TextEncoder().encode(dataUrl);
        canvas.width=canvas.height=1;
        crypto.subtle.digest('SHA-256',encoded).then(digest=>{
          if(disposed||!job.presentation.isCurrent())throw Error('The scene changed. Take the photograph again.');
          const fingerprint=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
          job.resolve({photo,view:{...evidence.view,kind:job.kind,fingerprint}});
        }).catch(job.reject);
      }catch(error){job.reject(error);}
    }});
  return {capture(kind,inspect){
    if(disposed||pending||!unregister)return Promise.reject(Error('The camera is not ready. Try again after the world loads.'));
    const presentation=capturePresentation(ctx);
    if(presentation.owner!=='main'||!presentation.renderer)return Promise.reject(Error('This album uses the outdoor Earth camera.'));
    return new Promise((resolve,reject)=>{pending={kind,inspect,presentation,frame:presentation.renderer.info.render.frame,resolve,reject,timer:setTimeout(cancel,5000)};});
  },dispose(){disposed=true;cancel();unregister?.();}};
}

export function photoAlbumHtml(state,album){
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  for(const photo of album.photos)validateAlbumPhoto(photo);
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(state.subject.name)} · World Explorer album</title><style>body{max-width:1000px;margin:40px auto;padding:0 20px;background:#101a22;color:#e9f1f6;font:16px system-ui}img{max-width:100%;height:auto}figure{margin:28px 0}figcaption{padding:8px 0}</style><h1>${escape(state.subject.name)}</h1><p>${escape(state.regionLabel)} · Three views from World Explorer. In-game photographs; not real-world camera images.</p>${album.photos.map(p=>`<figure><img src="${p.dataUrl}" alt="${escape(p.kind)} view"><figcaption>${escape(p.kind)}</figcaption></figure>`).join('')}`;
}
