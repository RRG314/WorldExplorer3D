import {captureTransportTerrain} from './transport-terrain-snapshot.js';
import {createPavementTerrainMask} from '../world/pavement-terrain-mask.js';
import {TRANSPORT_REGION_SIZE,actorNeedsRoadDetail} from './transport-detail-plan.js';

export async function prepareTransportDetail(appCtx,roads,{isCurrent,focus={x:0,z:0},terrainReady=null}) {
  const url=globalThis.__WORLD_EXPLORER_PRODUCTION__?.transportDetailWorkerUrl||new URL('./transport-detail-worker.js',import.meta.url);
  const worker=new Worker(url,{type:'module'});
  let pending=null,disposed=false,active=null,publish=null,complete=null,mask=null,notice=null,noticeText=null,retryButton=null,lastSync=0;
  const remaining=new Map();
  const stats={status:'preparing',sourceRoads:roads.length,completedRegions:0,pendingRegions:0,blocked:false,blockedAtMs:null,blockedTotalMs:0,blockedCount:0,error:null};
  const request=data=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending=null;reject(new Error('Transport detail worker exceeded its deadline'));},60000);
    pending={resolve:value=>{clearTimeout(timeout);pending=null;resolve(value);},reject:error=>{clearTimeout(timeout);pending=null;reject(error);}};
    try{worker.postMessage(data);}catch(error){pending.reject(error);}
  });
  worker.onmessage=({data})=>data.type==='error'?pending?.reject(new Error(data.message)):pending?.resolve(data);
  worker.onerror=event=>pending?.reject(new Error(event.message));
  function dispose(){
    if(disposed)return;disposed=true;worker.terminate();
    if(appCtx._cancelTransportPreparation===dispose)appCtx._cancelTransportPreparation=null;pending?.reject(new DOMException('Transport detail cancelled','AbortError'));
    mask?.dispose();mask=null;notice?.remove();notice=null;remaining.clear();publish=null;
    stats.status='disposed';stats.pendingRegions=0;stats.blocked=false;
  }
  function updateNotice(blocked){
    if(blocked&&!stats.blocked){stats.blockedAtMs=performance.now();stats.blockedCount++;}
    if(!blocked&&stats.blocked){stats.blockedTotalMs+=Math.max(0,performance.now()-stats.blockedAtMs);stats.blockedAtMs=null;}
    stats.blocked=blocked;
    if(!blocked){notice?.remove();notice=noticeText=retryButton=null;return;}
    if(!notice&&typeof document!=='undefined'){
      notice=document.createElement('div');notice.setAttribute('role','status');notice.dataset.transportReadiness='true';
      notice.style.cssText='position:fixed;bottom:100px;left:50%;transform:translateX(-50%);z-index:2000;padding:8px 14px;background:#10202ee8;color:white;border-radius:8px;font:14px sans-serif';
      noticeText=document.createElement('span');notice.append(noticeText);
      if(typeof appCtx.reloadEarthWorldSession==='function'){
        retryButton=document.createElement('button');retryButton.textContent='Retry roads';retryButton.style.cssText='margin-left:10px;min-height:44px';
        retryButton.onclick=async()=>{if(disposed||!isCurrent())return;retryButton.disabled=true;appCtx.captureEarthWorldSession?.();try{await appCtx.reloadEarthWorldSession({transitionDurationMs:0});}catch{/* Keep the failed readiness notice available for another attempt. */}finally{if(retryButton&&!disposed)retryButton.disabled=false;}};
        notice.append(retryButton);
      }
      document.body.appendChild(notice);
    }
    const message=stats.error?'Nearby road detail could not load. Retry here or from Main Menu.':'Preparing nearby road detail…';
    if(noticeText&&noticeText.textContent!==message)noticeText.textContent=message;
    if(retryButton)retryButton.hidden=!stats.error;
  }
  appCtx._cancelTransportPreparation?.();
  appCtx._cancelTransportPreparation=dispose;
  try {
    const sourceRoads=roads.map((road,auditIndex)=>({auditIndex,
      pts:road.pts,width:road.width,metersPerWorldUnit:road.metersPerWorldUnit,resolvedCrossSection:road.resolvedCrossSection,
      structureSemantics:road.structureSemantics,transportRecord:{crossSection:road.transportRecord?.crossSection}
    }));
    const planInput={roads:sourceRoads,focus,maxTextureSize:Math.min(4096,appCtx.renderer.capabilities.maxTextureSize)};
    if(terrainReady){
      await Promise.all([request({type:'plan',input:planInput}),terrainReady]);
      if(disposed||!isCurrent())throw new DOMException('Transport detail superseded','AbortError');
    }
    const heightProbes=[];
    const stride=Math.max(1,Math.floor(roads.length/256));
    for(let i=0;i<roads.length;i+=stride){
      const point=roads[i].pts?.[0];if(!point)continue;
      const y=appCtx.terrainMeshHeightAt(point.x,point.z)+.18;
      heightProbes.push({x:point.x,z:point.z,y});
    }
    const initial=await request({type:'prepare',input:{...(terrainReady?{}:planInput),
      terrain:captureTransportTerrain(appCtx),heightProbes}});

    if(!isCurrent())throw new DOMException('Transport detail superseded','AbortError');
    mask=createPavementTerrainMask(appCtx,initial.keys,{kind:'road',cellSize:128,color:[.075,.078,.082],deferUpload:true});
    const size=initial.layout.resolution**2;
    initial.keys.forEach((key,i)=>mask.publish(key,initial.masks.subarray(i*size,(i+1)*size)));
    for(const region of initial.regions)for(const key of region.keys)mask.retire(key);
    for(const region of initial.pending)remaining.set(region.key,region.bounds);
    mask.syncMaterials();
    // Texture data are bulk-uploaded on the first render. Later regional
    // commits retire only four-byte lookup entries, not the whole atlas.
    stats.heightParity=initial.heightParity;stats.completedRegions=initial.regions.length;stats.pendingRegions=remaining.size;stats.status='near-ready';
    initial.masks=null;
    const controller={stats,initial,dispose,refreshMaterials:()=>mask?.syncMaterials(),
      attach(callback,onComplete=()=>{}){publish=callback;complete=onComplete;},
      readyForActor(point,terrainY){
        if(!actorNeedsRoadDetail(point,terrainY)){updateNotice(false);return true;}
        return controller.readyAt(point);
      },
      readyAt(point,margin=384){
        if(disposed)return true;
        const x=Number(point?.x)||0,z=Number(point?.z)||0;
        for(let ix=Math.floor((x-margin)/TRANSPORT_REGION_SIZE);ix<=Math.floor((x+margin)/TRANSPORT_REGION_SIZE);ix++)
          for(let iz=Math.floor((z-margin)/TRANSPORT_REGION_SIZE);iz<=Math.floor((z+margin)/TRANSPORT_REGION_SIZE);iz++)
            if(remaining.has(`${ix}:${iz}`)){updateNotice(true);return false;}
        updateNotice(false);return true;
      },
      step(point={x:0,z:0}){
        if(disposed||!publish||stats.status==='complete')return;
        if(!isCurrent()){dispose();return;}
        const now=performance.now();if(now-lastSync>500){mask?.syncMaterials();lastSync=now;}
        if(active||stats.error||stats.status==='complete')return;
        mask?.finishBulkUpload();
        stats.status='refining';
        active=(async()=>{
          const packet=await request({type:'next',focus:{x:Number(point.x)||0,z:Number(point.z)||0}});
          if(disposed||!isCurrent())return;
          if(packet.type==='complete'){
            stats.status='complete';stats.completedAt=performance.now();mask?.setEnabled(false);worker.terminate();updateNotice(false);complete?.();publish=null;complete=null;return;
          }
          await publish(packet);
          if(disposed||!isCurrent())return;
          for(const key of packet.keys)mask.retire(key);
          remaining.delete(packet.key);stats.completedRegions++;stats.pendingRegions=remaining.size;
        })().catch(error=>{
          if(disposed)return;
          stats.status='failed';stats.error=String(error.message);worker.terminate();console.error('[TransportDetail]',error);
        }).finally(()=>{active=null;});
      }
    };
    if(appCtx._cancelTransportPreparation===dispose)appCtx._cancelTransportPreparation=null;
    return controller;
  } catch(error){dispose();throw error;}
}
