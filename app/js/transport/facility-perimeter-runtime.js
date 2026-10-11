import {loadModelAsset} from '../assets/model-asset-runtime.js?v=16';
import {compileFacilityPerimeterPlan,groundPerimeterBay} from './facility-perimeter-plan.js';

let nextOwner=0;
function createFacilityPerimeter(THREE,graph,options={}) {
  const appCtx=options.appCtx,plan=compileFacilityPerimeterPlan(graph),group=new THREE.Group();
  group.name='Mapped facility fences · Poly Haven';
  const owner=`facility-perimeter:${++nextOwner}`,limit=options.mobile?128:256;
  const controller=new AbortController(),parts=[];
  let asset=null,disposed=false,colliders=[],last=null,elapsed=0,status=plan.count?'loading':'no-mapped-boundary',published=[];
  let lastColliderCollection=null,awaitingGround=false;
  function retireColliders() {
    if (appCtx && colliders.length) {
      const own=new Set(colliders);
      appCtx.dynamicBuildingColliders=(appCtx.dynamicBuildingColliders || []).filter(c=>!own.has(c));
    }
    colliders=[];
    lastColliderCollection=null;
  }
  function refresh(force=false) {
    if (!asset || disposed || appCtx?.activeInterior) return;
    const focus=options.focus?.() || appCtx?.activeEarthActorPosition?.();
    if (!focus) {if(last){retireColliders();for(const part of parts)part.mesh.count=0;published=[];last=null;}return;}
    if (!force&&!awaitingGround&&last&&appCtx?.dynamicBuildingColliders===lastColliderCollection&&Math.hypot(focus.x-last.x,focus.z-last.z)<12) return;
    last={x:focus.x,z:focus.z};
    awaitingGround=false;
    const sampleGround=(x,z)=>{
      const y=options.sampleGround?.(x,z);
      if(typeof y!=='number'||!Number.isFinite(y))awaitingGround=true;
      return y;
    };
    published=plan.near(focus,options.mobile?100:160,limit).map(bay=>groundPerimeterBay(bay,sampleGround)).filter(Boolean);
    retireColliders();
    for (const part of parts) {
      let index=0;
      for (const bay of published) {
        const dx=bay.end.x-bay.start.x,dz=bay.end.z-bay.start.z,length=Math.hypot(dx,dz),height=bay.height/2.52213;
        const bases=part.post?[bay.start,bay.end]:[bay.start];
        for (let k=0;k<bases.length;k++) {
          const p=bases[k],y=k?bay.y1:bay.y0;
          const matrix=new THREE.Matrix4().set(
            part.post?dx/length:dx/2,0,-dz/length,p.x,
            part.post?0:(bay.y1-bay.y0)/2,height,0,y,
            part.post?dz/length:dz/2,0,dx/length,p.z,
            0,0,0,1
          );
          part.mesh.setMatrixAt(index++,matrix.multiply(part.local));
        }
      }
      part.mesh.count=index;part.mesh.instanceMatrix.needsUpdate=true;
    }
    colliders=published.map(bay=>{
      const dx=bay.end.x-bay.start.x,dz=bay.end.z-bay.start.z,l=Math.hypot(dx,dz),nx=-dz/l*.09,nz=dx/l*.09;
      const pts=[{x:bay.start.x+nx,z:bay.start.z+nz},{x:bay.end.x+nx,z:bay.end.z+nz},{x:bay.end.x-nx,z:bay.end.z-nz},{x:bay.start.x-nx,z:bay.start.z-nz}];
      const minY=Math.min(bay.y0,bay.y1),maxY=Math.max(bay.y0,bay.y1)+bay.height;
      return {pts,minX:Math.min(...pts.map(p=>p.x)),maxX:Math.max(...pts.map(p=>p.x)),minZ:Math.min(...pts.map(p=>p.z)),maxZ:Math.max(...pts.map(p=>p.z)),
        minY,maxY,baseY:minY,height:maxY-minY,collisionKind:'solid',sourceBuildingId:bay.id,facilityPerimeterOwner:owner};
    });
    if (appCtx) {if(!Array.isArray(appCtx.dynamicBuildingColliders))appCtx.dynamicBuildingColliders=[];appCtx.dynamicBuildingColliders.push(...colliders);}
    lastColliderCollection=appCtx?.dynamicBuildingColliders;
  }
  const ready=plan.count?(options.loadAsset || loadModelAsset)(THREE,'facility-chainlink-kit',{signal:controller.signal}).then(loaded=>{
    if(disposed){loaded.dispose();return false;}
    asset=loaded;asset.root.updateMatrixWorld(true);
    for(const root of asset.root.children) {
      const post=root.name.startsWith('Fence_post');
      root.traverse(source=>{
        if(!source.isMesh)return;
        // The prepared part's parent translation is a pivot normalization.
        const mesh=new THREE.InstancedMesh(source.geometry,source.material,limit*(post?2:1));
        mesh.name=root.name;mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=true;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        parts.push({mesh,post,local:source.matrixWorld.clone()});group.add(mesh);
      });
    }
    if(!parts.length)throw new Error('Fence asset has no renderable parts');
    status='ready';refresh(true);return true;
  }).catch(error=>{
    if(!disposed){
      status='asset-unavailable';group.userData.failure=String(error.message||error);
      retireColliders();for(const {mesh} of parts)mesh.dispose?.();parts.length=0;group.clear();published=[];
      asset?.dispose();asset=null;
    }
    return false;
  }):Promise.resolve(false);
  appCtx?.registerRuntimeSystem?.({id:owner,owner,phase:'simulation',priority:43,critical:false,enabled:()=>!disposed,
    update(frame){elapsed+=Math.max(0,Number(frame.dt)||0);if(elapsed<.25)return;elapsed=0;refresh();}});
  return Object.freeze({group,ready,refresh,
    snapshot:()=>({status,mappedBays:plan.count,visibleBays:published.length,colliderCount:colliders.length,drawCount:parts.length,...plan.diagnostics}),
    dispose(){if(disposed)return;disposed=true;status='disposed';controller.abort();appCtx?.unregisterRuntimeSystem?.(owner);retireColliders();
      for(const {mesh} of parts)mesh.dispose?.();group.clear();group.parent?.remove(group);asset?.dispose();asset=null;published=[];}
  });
}
export {createFacilityPerimeter};
