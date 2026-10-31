import {SILVERSTONE_GRANDSTANDS} from './silverstone-grandstand-survey.js';
import {createMappedGrandstandBody} from './mapped-grandstand-exterior.js';

const inside=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;}return hit;};
const covered=(p,ring)=>inside(p,ring)||ring.some((a,i)=>{const b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)<.8;});
export function silverstoneGrandstandPlans(ctx){
 if(ctx.worldLoadRuntimeState?.venuePack?.id!=='silverstone-grand-prix'||typeof ctx.geoToWorld!=='function')return [];
 return SILVERSTONE_GRANDSTANDS.map(plan=>({...plan,footprint:plan.points.map(([lat,lon])=>ctx.geoToWorld(lat,lon))}));
}
export function isSilverstoneStandRepresentation(data,plan){
 if(data?.sourceBuildingId===plan.sourceBuildingId)return true;
 const ring=data?.buildingFootprint||data?.surfaceFootprint||data?.pts;if(!Array.isArray(ring)||ring.length<3)return false;
 const center=ring.reduce((p,q)=>({x:p.x+q.x/ring.length,z:p.z+q.z/ring.length}),{x:0,z:0});
 return covered(center,plan.footprint)&&ring.filter(p=>covered(p,plan.footprint)).length/ring.length>=.8;
}
export function reserveSilverstoneStandRepresentations(ctx){
 const plans=silverstoneGrandstandPlans(ctx),sources=new Map();
 for(const mesh of ctx.buildingMeshes||[]){if(mesh.userData?.reviewedVenueExterior)continue;const plan=plans.find(p=>isSilverstoneStandRepresentation(mesh.userData,p));if(!plan)continue;
  mesh.userData.deferredReviewedExterior='silverstone-stand:'+plan.sourceBuildingId;if(mesh.userData.sourceBuildingId)sources.set(mesh.userData.sourceBuildingId,mesh.userData.deferredReviewedExterior);
 }
 for(const mesh of ctx.buildingMeshes||[])if(sources.has(mesh.userData?.sourceBuildingId))mesh.userData.deferredReviewedExterior=sources.get(mesh.userData.sourceBuildingId);
}
export function createSilverstoneGrandstandExteriors(T,ctx){
 const plans=silverstoneGrandstandPlans(ctx),unit=ctx.METERS_PER_WORLD_UNIT||1;
 if(!plans.length||typeof ctx.elevationWorldYAtWorldXZ!=='function'||!(unit>0&&unit<=10))return [];
 const roads=(ctx.roads||[]).filter(r=>ctx.worldLoadRuntimeState.venuePack.sourceFeatureIds?.includes(r.sourceFeatureId)&&r.pts?.length>1);
 if(!roads.length)return [];
 const distance=(p,road)=>Math.min(...road.pts.slice(1).map((b,i)=>{const a=road.pts[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}));
 const results=[];
 for(const plan of plans){
  if(ctx.buildingMeshes?.some(m=>m.userData?.sourceBuildingId===plan.sourceBuildingId&&m.userData?.architecture?.rows))continue;
  const {footprint}=plan,center=footprint.reduce((p,q)=>({x:p.x+q.x/footprint.length,z:p.z+q.z/footprint.length}),{x:0,z:0}),edges=footprint.map((a,i)=>({a,b:footprint[(i+1)%footprint.length]})),edge=edges.reduce((a,b)=>Math.hypot(a.b.x-a.a.x,a.b.z-a.a.z)>Math.hypot(b.b.x-b.a.x,b.b.z-b.a.z)?a:b),length=Math.hypot(edge.b.x-edge.a.x,edge.b.z-edge.a.z);
  if(length<2/unit)continue;const ux=(edge.b.x-edge.a.x)/length,uz=(edge.b.z-edge.a.z)/length,
   local=footprint.map(p=>({u:((p.x-center.x)*ux+(p.z-center.z)*uz)*unit,v:(-(p.x-center.x)*uz+(p.z-center.z)*ux)*unit})),world=(u,v)=>({x:center.x+(u*ux-v*uz)/unit,z:center.z+(u*uz+v*ux)/unit}),ground=[];
  for(const {a,b}of edges){const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*unit/4);for(let i=0;i<=n;i++)ground.push(ctx.elevationWorldYAtWorldXZ(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n));}
  const loU=Math.min(...local.map(p=>p.u)),hiU=Math.max(...local.map(p=>p.u)),loV=Math.min(...local.map(p=>p.v)),hiV=Math.max(...local.map(p=>p.v));
  for(let u=loU+2;u<hiU;u+=4)for(let v=loV+2;v<hiV;v+=4){const p=world(u,v);if(inside(p,footprint))ground.push(ctx.elevationWorldYAtWorldXZ(p.x,p.z));}
  if(!ground.length||!ground.every(Number.isFinite)||Math.max(...ground)-Math.min(...ground)>6/unit)continue;
  const rows=Math.max(12,Math.min(42,Math.round((hiV-loV)*.66/.72))),bottom=Math.min(...ground),floor=Math.max(...ground)+.12/unit,root=new T.Group();root.position.set(center.x,floor,center.z);root.name='Silverstone — '+plan.label;
  root.userData={sourceBuildingId:plan.sourceBuildingId,buildingFootprint:footprint,reviewedVenueExterior:true,exteriorOnly:true,buildingName:plan.label};
  const pitRoad=roads.reduce((a,b)=>distance(center,a)<distance(center,b)?a:b);
  const built=createMappedGrandstandBody(T,{...plan,rows,unit,pitRoad,kind:'covered-grandstand',ridgeMeters:rows*.3+4.6,seatColor:0x486b8b,sourceClaim:'Exact OSM grandstand plan and identity; original estimated seating, steel frame and roof; no interior admission'},{root,local,world,center,footprint,floor,bottom});
  built.root.userData.architecture.footprintRetained=true;built.root.userData.architecture.estimatedHeights=true;results.push(built);
 }
 return results;
}
