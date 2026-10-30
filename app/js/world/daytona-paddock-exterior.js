import {DAYTONA_PADDOCK_BUILDINGS} from './daytona-paddock-survey.js';
import {batchOwnedStaticStructure} from './static-structure-batching.js';
import {finishVenueSurface} from './venue-surface-materials.js';

const inside=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;
}return hit;};
function covered(points,ring){return points.filter(p=>inside(p,ring)||ring.some((a,i)=>{
 const b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)<.6;
})).length/points.length;}
export function isDaytonaPaddockRepresentation(data,plan){
 if(data?.sourceBuildingId===plan.sourceBuildingId)return true;
 const ring=data?.buildingFootprint||data?.pts;
 return Array.isArray(ring)&&ring.length>=3&&covered(ring,plan.footprint)>=.8&&covered(plan.footprint,ring)>=.8;
}
export function daytonaPaddockPlans(ctx){
 if(ctx.worldLoadRuntimeState?.venuePack?.id!=='daytona-tri-oval'||typeof ctx.geoToWorld!=='function')return [];
 const unit=ctx.METERS_PER_WORLD_UNIT||1;if(!(unit>0&&unit<=10))return [];
 return DAYTONA_PADDOCK_BUILDINGS.map(source=>({...source,unit,footprint:source.points.map(p=>ctx.geoToWorld(p.lat,p.lon))})).filter(p=>p.footprint.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.z)));
}
export function reserveDaytonaPaddockRepresentations(ctx){
 const plans=daytonaPaddockPlans(ctx),sources=new Map();
 for(const mesh of ctx.buildingMeshes||[])if(!mesh.userData?.reviewedVenueExterior){const plan=plans.find(p=>isDaytonaPaddockRepresentation(mesh.userData,p));if(!plan)continue;
  mesh.userData.deferredReviewedExterior='daytona-paddock:'+plan.sourceBuildingId;if(mesh.userData.sourceBuildingId)sources.set(mesh.userData.sourceBuildingId,plan.sourceBuildingId);
 }
 for(const mesh of ctx.buildingMeshes||[])if(!mesh.userData?.reviewedVenueExterior&&sources.has(mesh.userData?.sourceBuildingId))mesh.userData.deferredReviewedExterior='daytona-paddock:'+sources.get(mesh.userData.sourceBuildingId);
}
function clip(ring,distance){
 const out=[];for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],da=distance(a),db=distance(b),ia=da>=-1e-9,ib=db>=-1e-9;
  if(ia)out.push(a);if(ia!==ib){const t=da/(da-db);out.push({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});}
 }return out;
}
// Existing post-transport publication supplies all terrain observations. No
// runtime sampler, interior admission, scheduler or second building owner.
export function createDaytonaPaddockExteriors(T,ctx){
 if(typeof ctx.elevationWorldYAtWorldXZ!=='function')return [];
 const results=[];
 for(const plan of daytonaPaddockPlans(ctx)){
  if(ctx.buildingMeshes?.some(m=>m.userData?.paddockStructure&&m.userData.sourceBuildingId===plan.sourceBuildingId))continue;
  const {footprint,unit}=plan,edges=footprint.map((a,i)=>({a,b:footprint[(i+1)%footprint.length]})),longest=edges.reduce((a,b)=>Math.hypot(a.b.x-a.a.x,a.b.z-a.a.z)>Math.hypot(b.b.x-b.a.x,b.b.z-b.a.z)?a:b),
   length=Math.hypot(longest.b.x-longest.a.x,longest.b.z-longest.a.z),ux=(longest.b.x-longest.a.x)/length,uz=(longest.b.z-longest.a.z)/length,
   center=footprint.reduce((a,p)=>({x:a.x+p.x/footprint.length,z:a.z+p.z/footprint.length}),{x:0,z:0}),
   local=footprint.map(p=>({u:((p.x-center.x)*ux+(p.z-center.z)*uz)*unit,v:(-(p.x-center.x)*uz+(p.z-center.z)*ux)*unit})),
   world=(u,v)=>({x:center.x+(u*ux-v*uz)/unit,z:center.z+(u*uz+v*ux)/unit});
  const ground=[];
  for(const {a,b}of edges){const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*unit/4);for(let i=0;i<=n;i++)ground.push(ctx.elevationWorldYAtWorldXZ(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n));}
  const lowU=Math.min(...local.map(p=>p.u)),highU=Math.max(...local.map(p=>p.u)),lowV=Math.min(...local.map(p=>p.v)),highV=Math.max(...local.map(p=>p.v));
  for(let u=lowU+4;u<highU;u+=8)for(let v=lowV+4;v<highV;v+=8){const p=world(u,v);if(inside(p,footprint))ground.push(ctx.elevationWorldYAtWorldXZ(p.x,p.z));}
  if(!ground.length||!ground.every(Number.isFinite)||Math.max(...ground)-Math.min(...ground)>4/unit)continue;
  const bottom=Math.min(...ground),floor=Math.max(...ground)+.08/unit,root=new T.Group();root.position.set(center.x,floor,center.z);root.name='Daytona — '+plan.label;
  root.userData={sourceBuildingId:plan.sourceBuildingId,buildingFootprint:footprint,reviewedVenueExterior:true,paddockStructure:true,paddockGarage:plan.kind==='garage',exteriorOnly:true,
   sourceClaim:'Exact OSM plan; NAIP roof observation; original estimated heights, closed service bays, roof ribs and vents; no interior admission'};
  const material=(color,roughness=.85,metalness=0)=>{const m=new T.MeshStandardMaterial({color,roughness,metalness,side:T.DoubleSide});m.color.convertSRGBToLinear();return m;},
   wall=material(0xd5cfb7,.95),roof=material(plan.kind==='club'?0x75655b:0xc6ccca,.55,.45),dark=material(0x364147,.9),trim=material(0x818f92,.5,.45),glass=material(0x2e515b,.3,.35),yellow=material(0xc1a14f,.75),foundation=material(0xb4b3a7,.97),
   materials=[wall,roof,dark,trim,glass,yellow,foundation],lod=new T.LOD();root.add(lod);
  const minV=Math.min(...local.map(p=>p.v)),maxV=Math.max(...local.map(p=>p.v)),bays=Math.max(1,Math.round((maxV-minV)/12)),bay=(maxV-minV)/bays;
  const triangles=T.ShapeUtils.triangulateShape(local.map(p=>new T.Vector2(p.u,p.v)),[]).map(t=>t.map(i=>local[i]));
  let bayCount=0;
  function level(detail){
   const group=new T.Group(),buffers=materials.map(()=>[]),vertex=(p,y)=>{const w=world(p.u,p.v);return [w.x-center.x,y/unit,w.z-center.z];},
    poly=(points,height,mat)=>{for(let i=1;i<points.length-1;i++)buffers[mat].push(...vertex(points[0],height(points[0])),...vertex(points[i],height(points[i])),...vertex(points[i+1],height(points[i+1])));},
    panel=(a,b,lo,hi,mat)=>{buffers[mat].push(...vertex(a,lo),...vertex(b,lo),...vertex(b,hi),...vertex(a,lo),...vertex(b,hi),...vertex(a,hi));};
   for(let i=0;i<local.length;i++){
    const a=local[i],b=local[(i+1)%local.length],length=Math.hypot(b.u-a.u,b.v-a.v),du=(b.u-a.u)/length,dv=(b.v-a.v)/length;
    if(length<.01)continue;
    const p=world(a.u,a.v),q=world(b.u,b.v),lo=(Math.min(ctx.elevationWorldYAtWorldXZ(p.x,p.z),ctx.elevationWorldYAtWorldXZ(q.x,q.z))-floor)*unit;
    panel(a,b,lo,0,6);panel(a,b,0,plan.eavesMeters,0);
    if(!detail||length<6)continue;
    if(plan.kind!=='garage'&&plan.kind!=='inspection'){
     const count=Math.max(1,Math.floor((length-1)/3.1)),pitch=length/count,middle={u:(a.u+b.u)/2,v:(a.v+b.v)/2},test=world(middle.u-dv*.3,middle.v+du*.3),out=inside(test,footprint)?-1:1,
      at=(s,offset=.05)=>({u:a.u+du*s-dv*offset*out,v:a.v+dv*s+du*offset*out}),floors=plan.kind==='club'?2:plan.kind==='media'?2:1,step=plan.kind==='club'?4.4:plan.kind==='media'?2.65:3.1;
     for(let n=0;n<count;n++)for(let floor=0;floor<floors;floor++){
      const l=(n+.12)*pitch,r=(n+.88)*pitch,bottom=floor*step+.65,top=Math.min(plan.eavesMeters-.45,(floor+1)*step-.35);
      panel(at(l),at(r),bottom,top,4);panel(at(l-.055,.07),at(l+.055,.07),bottom-.1,top+.1,3);panel(at(r-.055,.07),at(r+.055,.07),bottom-.1,top+.1,3);panel(at(l-.1,.07),at(r+.1,.07),bottom-.08,bottom+.04,3);
     }
     // Recessed staff entrance and lintel. The solid mapped building remains
     // closed; this exterior does not register a new service or interior.
     if(length>10){const c=length*.5;panel(at(c-.65,.08),at(c+.65,.08),.08,2.45,2);panel(at(c-.8,.12),at(c+.8,.12),2.45,2.6,3);}
     panel(at(.1,.09),at(length-.1,.09),plan.eavesMeters-.3,plan.eavesMeters-.15,3);continue;
    }
    if(length<14)continue;
    // Closed, recessed roller doors with original evenly spaced service bays.
    const count=Math.max(1,Math.floor((length-1)/4.8)),pitch=length/count,
     middle={u:(a.u+b.u)/2,v:(a.v+b.v)/2},test=world(middle.u-dv*.3,middle.v+du*.3),out=inside(test,footprint)?-1:1,
     at=(s,offset=.045)=>({u:a.u+du*s-dv*offset*out,v:a.v+dv*s+du*offset*out});
    for(let n=0;n<count;n++){
     const c=(n+.5)*pitch,w=Math.min(3.4,pitch-.7),left=c-w/2,right=c+w/2;
     panel(at(left),at(right),.15,3.65,2);panel(at(left-.09,.07),at(left+.09,.07),.1,3.85,3);panel(at(right-.09,.07),at(right+.09,.07),.1,3.85,3);panel(at(left-.1,.07),at(right+.1,.07),3.65,3.85,3);
     for(let y=.4;y<3.6;y+=.22)panel(at(left,.06),at(right,.06),y,y+.025,3);
     panel(at(left,.06),at(right,.06),4.15,4.65,4);
     for(const s of [left-.22,right+.22])panel(at(s-.065,.08),at(s+.065,.08),0,.85,5);
     bayCount++;
    }
    panel(at(.1,.1),at(length-.1,.1),4.95,5.08,3);
   }
   for(let i=0;i<bays;i++)for(const side of [0,1]){
    const lo=minV+bay*(i+side*.5),hi=lo+bay*.5,ridge=minV+bay*(i+.5),height=p=>plan.eavesMeters+(plan.ridgeMeters-plan.eavesMeters)*(1-Math.abs(p.v-ridge)/(bay*.5));
    for(const t of triangles){const part=clip(clip(t,p=>p.v-lo),p=>hi-p.v);if(part.length>=3)poly(part,height,1);}
    if(detail)for(let v=lo+.7;v<hi;v+=.7)for(const t of triangles){const part=clip(clip(t,p=>p.v-v),p=>v+.035-p.v);if(part.length>=3)poly(part,p=>height(p)+.025,3);}
   }
   if(detail)for(let i=0;i<bays;i++){
    const v=minV+bay*(i+.5),minU=Math.min(...local.map(p=>p.u)),maxU=Math.max(...local.map(p=>p.u));
    for(let u=minU+5;u<maxU-4;u+=9){
     if(![-1.4,1.4].every(du=>[-.55,.55].every(dv=>inside(world(u+du,v+dv),footprint))))continue;
     const p=world(u,v),vent=new T.Mesh(new T.BoxGeometry(2.8/unit,.35/unit,1.1/unit),trim);vent.position.set(p.x-center.x,(plan.ridgeMeters+.175)/unit,p.z-center.z);vent.rotation.y=-Math.atan2(uz,ux);vent.castShadow=vent.receiveShadow=true;group.add(vent);
    }
   }
   // Close gable ends along each actual source edge; the roof never spans a
   // bounding rectangle over an indented footprint or neighbouring access way.
   for(let i=0;i<local.length;i++){
    const a=local[i],b=local[(i+1)%local.length],cuts=[0,1];for(let v=minV;v<=maxV+1e-6;v+=bay*.5){const t=(v-a.v)/(b.v-a.v);if(t>0&&t<1)cuts.push(t);}cuts.sort((a,b)=>a-b);
    const roofY=p=>{const f=((p.v-minV)/bay)%1;return plan.eavesMeters+(plan.ridgeMeters-plan.eavesMeters)*(1-Math.abs(f-.5)*2);};
    for(let j=1;j<cuts.length;j++){const at=t=>({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t}),p=at(cuts[j-1]),q=at(cuts[j]);buffers[0].push(...vertex(p,plan.eavesMeters),...vertex(q,plan.eavesMeters),...vertex(q,roofY(q)),...vertex(p,plan.eavesMeters),...vertex(q,roofY(q)),...vertex(p,roofY(p)));}
   }
   for(const [i,positions]of buffers.entries())if(positions.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();const m=new T.Mesh(g,materials[i]);m.castShadow=m.receiveShadow=true;group.add(m);}
   batchOwnedStaticStructure(T,group);return group;
  }
  lod.addLevel(level(true),0);lod.addLevel(level(false),330/unit);lod.addLevel(new T.Group(),1100/unit);
  root.userData.architecture={kind:plan.kind,garages:plan.kind==='garage'?1:0,closedServiceBays:bayCount,roofBays:bays,lodLevels:3,eavesMeters:plan.eavesMeters,ridgeMeters:plan.ridgeMeters};
  const used=new Set();root.traverse(m=>{if(m.material)used.add(m.material);});for(const m of materials)if(!used.has(m))m.dispose();
  finishVenueSurface(T,root,foundation,'../../assets/textures/earth/concrete_diffuse.jpg',4);
  results.push({root,footprint,bottom,top:floor+(plan.ridgeMeters+.35)/unit,sourceBuildingId:plan.sourceBuildingId});
 }return results;
}
