import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
import { loadModelAsset } from '../assets/model-asset-runtime.js?v=16';
import { buildDeliveryOffers } from './delivery-routes.js';
import { normalizeHarborRun, deliveryDistance } from './harbor-run.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createHarborRunRuntime(state) {
  const ctx=state.appCtx, store=state.profileStore, element=document.getElementById('discoveryHarborRun');
  const abort=new AbortController();
  let delivery=normalizeHarborRun(), offers=[],admission={},saveError=false,busy=false,disposed=false,message='',caseAsset=null,group=null,marker=null,caseCollider=null,colliderOwner=null;
  let timer=0,lastPose=null,stationarySeconds=0,started=false,renderKey='',hydration=0,resumeNeeded=true;
  const refreshFailure='This job could not refresh. Reopen the Journal to retry; saved progress is kept.';
  const here=()=>ctx.getLiveGpsSnapshot?.().active!==true && ctx.getEnv?.()==='EARTH' && delivery.route?.regionId===state.worldIdentityId && !ctx.worldLoading && !ctx.activeInterior;
  const frame=()=>earthCoordinateFrame(ctx.LOC,ctx.SCALE);
  const project=p=>({...frame().toWorld(p.lat,p.lon),y:p.y});
  const identity=()=>({regionId:state.worldIdentityId,regionLabel:state.regionLabel,locationKey:state.locationKey,
    locationSnapshot:{...state.publication.worldIdentity.location,name:state.regionLabel}});
  function snapshot(){return {phase:delivery.phase,cargo:delivery.cargo||null,nextPoint:delivery.nextPoint||0,total:delivery.route?.points.length||0,
    destination:delivery.route?.destinationLabel||'',revision:delivery.revision,resumeNeeded,admission,offers:offers.map(r=>({id:r.id,distance:r.distance,turns:r.turns})),busy,saveError,message,
    marker:marker?.visible?{x:marker.position.x,y:marker.position.y,z:marker.position.z}:null,caseVisible:caseAsset?.root?.visible===true};}
  function render(){
    if(disposed||!element)return;
    const key=JSON.stringify([delivery.phase,delivery.nextPoint,delivery.revision,offers.map(r=>[r.id,r.distance,r.turns]),saveError,busy,message,started,here(),ctx.getLiveGpsSnapshot?.().active]);
    if(key===renderKey)return;renderKey=key;
    const button=(action,label)=>`<button type="button" data-delivery-action="${action}"${busy?' disabled':''}>${escape(label)}</button>`;
    const phase=delivery.schemaVersion===1?delivery.phase:'unavailable';
    const gps=ctx.getLiveGpsSnapshot?.().active===true;
    const text=gps?'This is an in-game driving job. Turn off Live GPS to continue; your cargo is kept.':phase==='complete'?'Case delivered. Your Harbor Driver badge and delivery record are saved.'
      :phase==='pickup'?'Drive to the blue ring beside the field case. Stop, then load it. There is no time limit.'
      :phase==='driving'?`Case aboard · ${delivery.nextPoint} of ${delivery.route.points.length} road points reached. Follow the blue ring to ${delivery.route.destinationLabel}.`
      :phase==='unload'?'You reached the destination. Stop at the blue ring and unload the field case.'
      :phase==='unavailable'?'This saved job needs a newer version of World Explorer.'
      :!started?'Finish First Bearings to open this optional driving job.':'Carry a field case along a checked local road route. No timer, deposit or purchase.';
    let actions='';
    if(phase==='available'&&started&&!gps)actions=button('find','Find local deliveries')+offers.map((r,i)=>`<article class="discoveryDeliveryOffer"><strong>${escape(r.destinationLabel)}</strong><small>${r.distance} m · ${r.turns} turn${r.turns===1?'':'s'} · virtual field delivery</small>${button(`accept:${i}`,'Take this delivery')}</article>`).join('');
    else if(['pickup','unload'].includes(phase)&&here())actions=button(phase==='pickup'?'load':'unload',phase==='pickup'?'Load the case':'Unload the case');
    if(['pickup','driving','unload'].includes(phase))actions+=button('continue','Back to the route');
    if(saveError)actions+=button('retry','Retry Journal save');
    if(phase==='complete')actions=button('badge','View your badge');
    element.dataset.deliveryPhase=phase;element.setAttribute('aria-busy',String(busy));
    element.innerHTML=`<span class="discoveryChapterEyebrow">FROM THE HARBOR · PILOT</span><strong>Harbor Run${phase==='complete'?' · Complete':''}</strong><p>${escape(text)}</p>${!here()&&delivery.route&&phase!=='complete'?`<p>Continue in ${escape(delivery.route.regionLabel)}. Your cargo is kept.</p>`:''}${actions}<small>${store.type==='IndexedDbDiscoveryProfileStore'?'Saved on this device':'Session only · export your Journal before leaving'}${message?` · ${escape(message)}`:''}</small>`;
  }
  async function hydrate(providedProfile){
    const seq=++hydration;
    let profile=providedProfile||await store.getProfile();
    if(disposed||seq!==hydration)return;
    let restored=normalizeHarborRun(profile.harborRun);
    if(providedProfile&&restored.schemaVersion===1&&restored.revision<delivery.revision){
      // A late UI read is not authoritative, but an intentional backup restore
      // can legitimately rewind this job. Resolve against the current store.
      profile=await store.getProfile();
      if(disposed||seq!==hydration)return;
      restored=normalizeHarborRun(profile.harborRun);
    }
    delivery=restored;started=profile.openingChapter?.phase==='complete';render();
    if(delivery.route&&delivery.phase!=='complete')await ensurePresentation();
  }
  async function refresh(providedProfile){
    try{await hydrate(providedProfile);if(message===refreshFailure){message='';render();}}
    catch{if(!disposed){message=refreshFailure;render();}}
  }
  async function ensurePresentation(){
    if(disposed||caseAsset)return;
    const instance=await loadModelAsset(globalThis.THREE,'solis-cargo-case',{signal:abort.signal});
    if(disposed){instance.dispose();return;}
    if(caseAsset){instance.dispose();return;}
    caseAsset=instance;
    const T=globalThis.THREE;
    group=new T.Group();group.name='Harbor Run · local job presentation';
    const bounds=new T.Box3().setFromObject(instance.root),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
    const scale=1.05/Math.max(size.x,size.y,size.z,.01);
    instance.root.scale.multiplyScalar(scale);instance.root.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
    const caseGroup=new T.Group();caseGroup.name='Delivery field case';caseGroup.add(instance.root);group.add(caseGroup);group.userData.caseGroup=caseGroup;
    marker=new T.Mesh(new T.RingGeometry(2.7,3,40),new T.MeshBasicMaterial({color:0x60b9ff,transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}));
    marker.rotation.x=-Math.PI/2;group.add(marker);ctx.scene.add(group);present();
  }
  function clearCaseCollider(){
    if(caseCollider&&colliderOwner){const index=colliderOwner.indexOf(caseCollider);if(index>=0)colliderOwner.splice(index,1);}
    caseCollider=null;colliderOwner=null;
  }
  function present(){
    if(!group)return;
    group.visible=here()&&!!delivery.route;
    if(!group.visible){clearCaseCollider();return;}
    const target=delivery.phase==='pickup'?delivery.route.pickup:delivery.phase==='driving'?delivery.route.points[resumeNeeded?Math.max(0,delivery.nextPoint-1):delivery.nextPoint]:delivery.route.dropoff;
    marker.visible=delivery.phase!=='complete';
    if(target){const p=project(target);marker.position.set(p.x,p.y+.15,p.z);}
    const casePoint=delivery.phase==='complete'?delivery.route.dropoffCase:delivery.route.pickupCase;
    caseAsset.root.visible=['pickup','complete'].includes(delivery.phase);
    if(casePoint){
      const p=project(casePoint);group.userData.caseGroup.position.set(p.x,p.y+.025,p.z);group.userData.caseGroup.rotation.y=delivery.route.caseYaw||0;
      if(caseAsset.root.visible&&Array.isArray(ctx.dynamicBuildingColliders)){
        if(colliderOwner!==ctx.dynamicBuildingColliders)clearCaseCollider();
        if(!caseCollider){caseCollider={collisionKind:'solid',sourceBuildingId:'harbor-run-field-case'};colliderOwner=ctx.dynamicBuildingColliders;colliderOwner.push(caseCollider);}
        Object.assign(caseCollider,{minX:p.x-.6,maxX:p.x+.6,minZ:p.z-.6,maxZ:p.z+.6,minY:p.y,maxY:p.y+1.05,baseY:p.y,height:1.05});
      }else clearCaseCollider();
    }
  }
  function evidence(){
    const car=ctx.car||{},geo=frame().toGeographic(car.x,car.z);
    const hit=ctx.SurfaceQuery?.driveAt?.(car.x,car.z,{currentY:car.y,preferRoad:true});
    return {...geo,y:Number(car.y),speed:Number(car.speed),mode:ctx.getCurrentTravelMode?.(),environment:ctx.getEnv?.(),regionId:state.worldIdentityId,
      road:hit?.kind==='road'&&Number.isFinite(car.y)&&Math.abs(car.y-hit.position.y)<2.5};
  }
  async function save(command){
    busy=true;hydration++;render();
    try {const next=await store.updateHarborRun({...command,revision:delivery.revision});if(disposed)return;delivery=next;saveError=false;message='';present();}
    catch(error){if(disposed)return;saveError=true;resumeNeeded=true;message=error?.message||'Delivery save did not finish. Try again.';ctx.showToast?.('Delivery progress could not save. Open the Journal to retry; saved cargo is kept.');await refresh();}
    finally{busy=false;render();}
  }
  async function action(value){
    if(disposed||busy)return;
    message='';
    try {
      if(value==='retry'){await hydrate();saveError=false;message='Return to the blue marker to continue.';}
      else if(value==='find'){
        busy=true;render();await hydrate();if(disposed||!started)return;
        admission={};offers=buildDeliveryOffers(ctx,identity(),{diagnostic:admission});
        message=offers.length?'Choose a destination. Distances and turns describe the checked road route.':'No complete loading-and-delivery route is ready here. Try a nearby Baltimore street; existing progress is kept.';
      } else if(value.startsWith('accept:')){
        const route=offers[Number(value.split(':')[1])];if(!route)throw Error('Find the available deliveries again.');
        busy=true;render();await ensurePresentation();if(disposed)return;
        // Recheck the selected offer against the now-loaded world, not an old panel.
        const fresh=buildDeliveryOffers(ctx,identity()).find(r=>r.id===route.id);
        if(!fresh)throw Error('The available roads changed. Find local deliveries again.');
        await save({type:'accept',route:fresh});offers=[];
        if(delivery.phase==='pickup')state.ui?.setOpen(false);
      } else if(value==='badge'){
        ctx.openWorldDiscoverySection?.('profile');await state.ui?.refreshData();
        if(disposed)return;
        const badge=document.querySelector('[data-explorer-badge="harbor-driver"]'),section=badge?.closest('details');
        if(section)section.open=true;badge?.scrollIntoView({block:'nearest'});
      } else if(value==='continue'){state.ui?.setOpen(false);}
      else if(value==='load'||value==='unload'){
        if(!here()||stationarySeconds<1.2)throw Error('Bring your car to a complete stop beside the blue ring first.');
        if(value==='load'&&!caseAsset){busy=true;render();await ensurePresentation();if(disposed)return;}
        await save({type:value,evidence:evidence()});
        if(value==='load'&&delivery.phase==='driving'){lastPose=null;state.ui?.setOpen(false);ctx.showToast?.('Case loaded. Follow the blue road marker.');}
        if(delivery.phase==='complete'){ctx.showToast?.('Delivery saved · Harbor Driver badge earned');await state.ui?.refreshData();}
      }
    } catch(error){if(!disposed)message=error?.message||'This delivery is not available right now.';}
    finally{busy=false;present();render();}
  }
  function update(dt){
    if(disposed)return;
    present();timer+=dt;if(timer<.2)return;const elapsed=timer;timer=0;
    if(delivery.schemaVersion!==1||!here()||ctx.paused||document.hidden||!delivery.route||delivery.phase==='complete'){lastPose=null;stationarySeconds=0;return;}
    const p=evidence();stationarySeconds=p.mode==='drive'&&p.road&&Math.abs(p.speed)<.6?stationarySeconds+Math.min(elapsed,.3):0;
    const now=performance.now(),continuous=lastPose&&now-lastPose.time<1500&&deliveryDistance(p,lastPose)<=Math.max(5,(now-lastPose.time)/1000*65);
    if(lastPose&&!continuous)resumeNeeded=true;
    lastPose={...p,time:now};
    if(saveError){present();render();return;}
    if(delivery.phase==='driving'&&resumeNeeded){
      const anchor=delivery.route.points[Math.max(0,delivery.nextPoint-1)];
      if(p.mode==='drive'&&p.road&&deliveryDistance(p,anchor)<12&&Math.abs(p.y-anchor.y)<2.5){resumeNeeded=false;message='';}
      else message='Return to the blue marker to resume your saved road route.';
      present();render();return;
    }
    if(!busy&&!saveError&&delivery.phase==='driving'&&continuous&&p.mode==='drive'&&p.road&&deliveryDistance(p,delivery.route.points[delivery.nextPoint])<14
       &&Math.abs(p.y-delivery.route.points[delivery.nextPoint].y)<2.5)void save({type:'reach',pointIndex:delivery.nextPoint,evidence:{...p,continuous:true}});
    render();
  }
  const click=e=>{const button=e.target.closest('[data-delivery-action]');if(button)void action(button.dataset.deliveryAction);};
  element?.addEventListener('click',click,{signal:abort.signal});
  const unregister=ctx.registerContextInteraction?.({id:'harbor_run_cargo',priority:97,evaluate:()=>{
    if(disposed||busy||!here()||!['pickup','unload'].includes(delivery.phase)||stationarySeconds<1.2||state.ui?.open)return null;
    const p=evidence(),target=delivery.phase==='pickup'?delivery.route.pickup:delivery.route.dropoff;
    if(p.mode!=='drive'||!p.road||deliveryDistance(p,target)>8||Math.abs(p.y-target.y)>=2.5)return null;
    return {available:true,action:delivery.phase==='pickup'?'load':'unload',label:delivery.phase==='pickup'?'Load case':'Unload case',detail:'Harbor Run · field delivery',distance:deliveryDistance(p,target)};
  },perform:()=>action(delivery.phase==='pickup'?'load':'unload').then(()=>true)});
  void refresh();
  return {snapshot,refresh,update,dispose(){disposed=true;hydration++;abort.abort();unregister?.();clearCaseCollider();caseAsset?.dispose();marker?.geometry.dispose();marker?.material.dispose();group?.parent?.remove(group);element?.replaceChildren();}};
}
