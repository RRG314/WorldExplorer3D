import {createBoxInstanceBatch} from './box-instance-batch.js';
import {isGroundRoad} from './roadside-placement.js';
import {roadWidthAtSegment} from './road-cross-section-profile.js?v=1';

// Original game dressing at the Calvert Street reference block. Map geometry,
// pavement contact and existing entrances remain the placement authorities.
// This is not a survey of Baltimore's actual benches or planting.
export function referenceBlockPlan(ctx) {
  const loc=ctx.LOC,scale=Number(ctx.SCALE);
  if(!Number.isFinite(loc?.lat)||!Number.isFinite(loc?.lon)||!(scale>0))return [];
  const center={x:(-76.61225-loc.lon)*scale*Math.cos(loc.lat*Math.PI/180),z:(loc.lat-39.28945)*scale};
  if(Math.hypot(center.x,center.z)>1800 || !ctx.streetPavement?.sampleAt)return [];
  const result=[],entrances=[...(ctx.buildingEntranceByBuilding?.values?.()||[])];
  const roads=(ctx.roads||[]).filter(r=>isGroundRoad(r)&&/^(primary|secondary|tertiary|residential|unclassified)$/.test(r.type));
  const safe=(x,z,ux,uz)=>{
    if(Math.hypot(x-center.x,z-center.z)>105)return null;
    const y=ctx.streetPavement.sampleAt(x,z);
    if(!Number.isFinite(y)||ctx.isPointInsideWaterFootprint?.(x,z))return null;
    // Check the complete footprint and retain 1.8 m of contiguous walk space
    // on the road-facing side, rather than testing only the object's center.
    for(const along of [-1.05,0,1.05])for(const across of [-.65,0,.65]){
      const px=x+ux*along-uz*across,pz=z+uz*along+ux*across;
      const h=ctx.streetPavement.sampleAt(px,pz);
      if(!Number.isFinite(h)||Math.abs(h-y)>.16||Number.isFinite(ctx.roadContactIndex?.sampleAt(px,pz)))return null;
    }
    if(ctx.checkBuildingCollision?.(x,z,1.1,{actorBaseY:y,actorHeight:2})?.collision)return null;
    if(entrances.some(e=>Math.hypot(e.x-x,e.z-z)<4))return null;
    if((ctx.streetFurnitureMeshes||[]).some(o=>Math.hypot(o.position.x-x,o.position.z-z)<3))return null;
    if(result.some(p=>Math.hypot(p.x-x,p.z-z)<16))return null;
    return y;
  };
  for(const road of roads){
    for(let i=0;i<road.pts.length-1;i++){
      const a=road.pts[i],b=road.pts[i+1],length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length<12)continue;
      const ux=(b.x-a.x)/length,uz=(b.z-a.z)/length;
      const projection=Math.max(0,Math.min(length,(center.x-a.x)*ux+(center.z-a.z)*uz));
      if(Math.hypot(a.x+ux*projection-center.x,a.z+uz*projection-center.z)>100)continue;
      for(let d=8;d<length-6;d+=25)for(const side of [-1,1]){
        if(result.length>=10)return result;
        const half=roadWidthAtSegment(road,i,d/length)/2;
        const nx=-uz*side,nz=ux*side,offset=half+3.1;
        const x=a.x+ux*d+nx*offset,z=a.z+uz*d+nz*offset;
        const y=safe(x,z,ux,uz);
        if(y===null)continue;
        const lane=[.9,1.8].every(step=>Number.isFinite(ctx.streetPavement.sampleAt(x-nx*step,z-nz*step)));
        if(!lane)continue;
        result.push({x,y,z,yaw:Math.atan2(-uz,ux)+(side<0?Math.PI:0),kind:result.length%2?'bench':'planter',road:road.name||road.type});
      }
    }
  }
  return result;
}

export function publishReferenceBlockDressing(ctx,{THREE=globalThis.THREE,registerLamp}={}) {
  if(ctx.streetFurnitureMeshes?.some(o=>o.userData?.referenceBlock))return null;
  const plan=referenceBlockPlan(ctx);
  if(!plan.length)return null;
  const center=plan[0],root=new THREE.Group();root.position.set(center.x,center.y,center.z);
  root.name='Calvert Street reference block';
  root.userData={referenceBlock:true,furnitureKind:'district',sourceClaim:'authored-game-dressing',plan};
  const specs=[['stone',0xaaa69a,.94,0],['metal',0x293337,.58,.45],['wood',0x866344,.84,0],['soil',0x332a20,1,0]];
  const materials=new Map(specs.map(([id,color,roughness,metalness])=>{
    const material=new THREE.MeshStandardMaterial({color,roughness,metalness});material.color.convertSRGBToLinear();return [id,material];
  }));
  const batches=new Map(specs.map(([id])=>[id,createBoxInstanceBatch()]));
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),size=new THREE.Vector3(),rotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  const box=(p,key,w,h,d,x,y,z)=>{
    const cosine=Math.cos(p.yaw),sine=Math.sin(p.yaw);
    position.set(p.x-center.x+cosine*x+sine*z,p.y-center.y+y,p.z-center.z-sine*x+cosine*z);
    rotation.setFromAxisAngle(up,p.yaw);size.set(w,h,d);matrix.compose(position,rotation,size);batches.get(key).append(matrix);
  };
  const lamps=[];
  for(const p of plan){
    if(p.kind==='bench'){
      for(let i=0;i<5;i++)box(p,'wood',1.8,.055,.085,0,.48,-.23+i*.105);
      for(let i=0;i<3;i++)box(p,'wood',1.8,.105,.065,0,.70+i*.14,.29);
      for(const x of [-.68,.68]){
        box(p,'metal',.07,.48,.46,x,.24,0);box(p,'metal',.065,.55,.065,x,.70,.29);
        box(p,'metal',.055,.23,.055,x,.63,-.19);box(p,'metal',.06,.045,.53,x,.75,.02);
        box(p,'metal',.16,.035,.50,x,.02,0);
      }
      // Three seating lights reuse the existing fixed street-light pool.
      // The mast is inside the bench footprint; the clear walk lane stays open.
      if(registerLamp && ctx.streetLampHeadMaterial && lamps.length<3){
        box(p,'metal',.09,4.8,.09,-.68,2.4,.29);
        box(p,'metal',.09,.09,.74,-.68,4.78,-.03);
        const cosine=Math.cos(p.yaw),sine=Math.sin(p.yaw);
        lamps.push({p,x:p.x-.68*cosine+.29*sine,z:p.z+.68*sine+.29*cosine});
      }
    }else{
      box(p,'stone',1.7,.10,1.25,0,.06,0);
      for(const side of [-1,1]){
        box(p,'stone',1.65,.52,.11,0,.32,side*.55);
        box(p,'stone',.11,.52,1.0,side*.775,.32,0);
        box(p,'stone',1.78,.07,.16,0,.61,side*.55);
        box(p,'stone',.16,.07,1.1,side*.80,.61,0);
      }
      box(p,'soil',1.4,.06,.92,0,.54,0);
    }
  }
  const unit=new THREE.BoxGeometry(1,1,1);
  for(const [key,batch] of batches){
    if(!batch.count){materials.get(key).dispose();continue;}
    const mesh=batch.build(unit,materials.get(key));mesh.receiveShadow=true;mesh.castShadow=true;root.add(mesh);
  }
  ctx.addEarthWorldObject(root);ctx.streetFurnitureMeshes.push(root);
  // Existing movement/interior ownership already saves and restores this list.
  for(const p of plan)ctx.dynamicBuildingColliders.push({minX:p.x-1.05,maxX:p.x+1.05,minZ:p.z-1.05,maxZ:p.z+1.05,minY:p.y,maxY:p.y+1.15,height:1.15,baseY:p.y,collisionKind:'solid',sourceBuildingId:'authored-calvert-street-fixture'});
  for(const {p,x,z} of lamps){
    const lamp=new THREE.Group();lamp.position.set(x,p.y,z);lamp.rotation.y=p.yaw;
    lamp.userData={referenceBlockLamp:true,furnitureKind:'street_lamp',sourceClaim:'authored-game-dressing'};
    const head=new THREE.Mesh(unit,ctx.streetLampHeadMaterial);head.scale.set(.32,.12,.52);head.position.set(0,4.72,-.37);lamp.add(head);
    ctx.addEarthWorldObject(lamp);ctx.streetFurnitureMeshes.push(lamp);registerLamp(lamp,head,null,{intensityScale:.18});
    ctx.dynamicBuildingColliders.push({minX:x-.10,maxX:x+.10,minZ:z-.10,maxZ:z+.10,minY:p.y,maxY:p.y+4.8,height:4.8,baseY:p.y,collisionKind:'solid',sourceBuildingId:'authored-calvert-street-mast'});
  }
  root.userData.lamps=lamps.length;
  ctx.scheduleWorldCoverVegetationRefresh?.();
  return {fixtures:plan.length,lamps:lamps.length,drawCalls:root.children.length+lamps.length,sourceClaim:root.userData.sourceClaim};
}
