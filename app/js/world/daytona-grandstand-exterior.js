import {DAYTONA_STAND_FOOTPRINT,DAYTONA_STAND_SOURCE_ID,DAYTONA_STAND_HEIGHT_METERS} from './daytona-grandstand-survey.js';
import {finishVenueSurface} from './venue-surface-materials.js';

function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;
}return hit;}
export function isDaytonaStandRepresentation(data,footprint){
 if(data?.sourceBuildingId===DAYTONA_STAND_SOURCE_ID)return true;
 const ring=data?.buildingFootprint||data?.pts;if(!Array.isArray(ring)||ring.length<3)return false;
 const covered=(points,boundary)=>points.filter(p=>inside(p,boundary)||boundary.some((a,i)=>{
  const b=boundary[(i+1)%boundary.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)<.8;
 })).length/points.length;
 // A curved thin stand can have its centroid outside its own plan. Mutual
 // outline coverage establishes a unique representation without that shortcut.
 return covered(ring,footprint)>=.8&&covered(footprint,ring)>=.8;
}
// Half-plane clipping of already triangulated source geometry preserves the
// indented mapped outline, including disjoint concourse/access-bay slices.
function clip(ring,distance){
 const out=[];for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],da=distance(a),db=distance(b),ia=da>=-1e-9,ib=db>=-1e-9;
  if(ia)out.push(a);if(ia!==ib){const t=da/(da-db);out.push({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});}
 }return out;
}
const interpolate=(a,b,t)=>a+(b-a)*t;
// Exterior interpretation, not an official architectural or seating survey.
// All height reads finish during existing post-transport building publication.
export function createDaytonaGrandstandExterior(T,ctx){
 if(ctx.worldLoadRuntimeState?.venuePack?.id!=='daytona-tri-oval'||typeof ctx.geoToWorld!=='function'||typeof ctx.elevationWorldYAtWorldXZ!=='function'||
  ctx.buildingMeshes?.some(m=>m.userData?.sourceBuildingId===DAYTONA_STAND_SOURCE_ID&&m.userData?.architecture?.seatingTiers))return null;
 const unit=ctx.METERS_PER_WORLD_UNIT||1,footprint=DAYTONA_STAND_FOOTPRINT.map(p=>ctx.geoToWorld(p.lat,p.lon));
 if(!(unit>0&&unit<=10)||!footprint.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)))return null;
 const origin=footprint[236],end=footprint[171],length=Math.hypot(end.x-origin.x,end.z-origin.z),ux=(end.x-origin.x)/length,uz=(end.z-origin.z)/length;
 // This retained front-edge point selects the track-facing side of the frame.
 const rawV=p=>-(p.x-origin.x)*uz+(p.z-origin.z)*ux,sign=rawV(footprint[200])<rawV(footprint[80])?1:-1,
  local=footprint.map(p=>({u:(p.x-origin.x)*ux+(p.z-origin.z)*uz,v:rawV(p)*sign})),minU=Math.min(...local.map(p=>p.u)),maxU=Math.max(...local.map(p=>p.u));
 if((maxU-minU)*unit<900||(maxU-minU)*unit>1400)return null;
 const toWorld=(u,v)=>({x:origin.x+ux*u-uz*v*sign,z:origin.z+uz*u+ux*v*sign}),across=u=>{
  const hits=[];for(let i=0;i<local.length;i++){const a=local[i],b=local[(i+1)%local.length];
   if((a.u<=u&&b.u>u)||(b.u<=u&&a.u>u))hits.push(a.v+(b.v-a.v)*(u-a.u)/(b.u-a.u));
  }return hits.length>=2?[Math.min(...hits),Math.max(...hits)]:null;
 };
 const count=Math.ceil((maxU-minU)*unit/4),stations=[];
 for(let i=0;i<=count;i++){
  const u=interpolate(minU+1e-5,maxU-1e-5,i/count),range=across(u);if(!range)return null;
  let ground=-Infinity;for(let j=0;j<=8;j++){const p=toWorld(u,interpolate(...range,j/8)),y=ctx.elevationWorldYAtWorldXZ(p.x,p.z);if(!Number.isFinite(y))return null;ground=Math.max(ground,y);}
  stations.push({u,front:range[0],back:range[1],ground:ground+.12/unit});
 }
 const base=Math.min(...stations.map(s=>s.ground));if(Math.max(...stations.map(s=>s.ground))-base>15/unit)return null;
 const center=footprint.reduce((p,q)=>({x:p.x+q.x/footprint.length,z:p.z+q.z/footprint.length}),{x:0,z:0}),root=new T.Group();
 root.name='Daytona — mapped curved grandstand';root.position.set(center.x,base,center.z);
 root.userData={sourceBuildingId:DAYTONA_STAND_SOURCE_ID,buildingFootprint:footprint,reviewedVenueExterior:true,exteriorOnly:true,
  sourceClaim:'OSM exact plan and 42.6 m height; USDA NAIP observation; original estimated seating, concourses, suites and access bays; no interior admission'};
 const material=(color,roughness,metalness=0)=>{const m=new T.MeshStandardMaterial({color,roughness,metalness,side:T.DoubleSide});m.color.convertSRGBToLinear();return m;},
  concrete=material(0xcacbc7,.94),metal=material(0xc3c8c9,.52,.5),glass=material(0x405562,.24,.35),shadow=material(0x4d5253,.87),
  seats=[material(0x7e8c9c,.76,.1),material(0x939a9b,.78,.1),material(0x9a736f,.8,.05),material(0xa99d7c,.8,.05)],foundation=material(0xc6c6bf,.96),materials=[concrete,metal,glass,shadow,...seats,foundation];
 const sourceTriangles=T.ShapeUtils.triangulateShape(local.map(p=>new T.Vector2(p.u,p.v)),[]).map(face=>face.map(i=>local[i]));
 const lod=new T.LOD();root.add(lod);
 function buildLevel(stride,rowStride,detail){
  const group=new T.Group(),buffers=materials.map(()=>[]);
  function vertex(p,height,a,b){const t=Math.max(0,Math.min(1,(p.u-a.u)/(b.u-a.u))),q=toWorld(p.u,p.v);return [q.x-center.x,interpolate(a.ground,b.ground,t)-base+height/unit,q.z-center.z];}
  function polygon(ring,height,mat,a,b){if(ring.length<3)return;for(let i=1;i<ring.length-1;i++)buffers[mat].push(...vertex(ring[0],height,a,b),...vertex(ring[i],height,a,b),...vertex(ring[i+1],height,a,b));}
  function wall(p,q,bottom,top,mat,a,b){buffers[mat].push(...vertex(p,bottom,a,b),...vertex(q,bottom,a,b),...vertex(q,top,a,b),...vertex(p,bottom,a,b),...vertex(q,top,a,b),...vertex(p,top,a,b));}
  const tiers=[{lo:.025,hi:.29,rows:24,bottom:2.2,rise:.44},{lo:.36,hi:.62,rows:24,bottom:12.76,rise:.44},{lo:.69,hi:.91,rows:20,bottom:23.32,rise:.44}],bands=[{lo:0,hi:.025,y:2.2},{lo:.29,hi:.36,y:12.76},{lo:.62,hi:.69,y:23.32},{lo:.91,hi:1,y:32.12}];
  for(const tier of tiers)for(let row=0;row<tier.rows;row+=rowStride)bands.push({lo:interpolate(tier.lo,tier.hi,row/tier.rows),hi:interpolate(tier.lo,tier.hi,Math.min(tier.rows,row+rowStride)/tier.rows),y:tier.bottom+Math.min(tier.rows,row+rowStride)*tier.rise,seat:true});
  for(let i=0;i<stations.length-1;i+=stride){
   const a=stations[i],b=stations[Math.min(stations.length-1,i+stride)],fraction=p=>{const t=(p.u-a.u)/(b.u-a.u),front=interpolate(a.front,b.front,t),back=interpolate(a.back,b.back,t);return (p.v-front)/(back-front||1);},
    at=(u,f)=>{const t=(u-a.u)/(b.u-a.u),front=interpolate(a.front,b.front,t);return {u,v:interpolate(front,interpolate(a.back,b.back,t),f)};};
   const distance=(p,f)=>{const t=(p.u-a.u)/(b.u-a.u),front=interpolate(a.front,b.front,t);return p.v-interpolate(front,interpolate(a.back,b.back,t),f);};
   const pieces=sourceTriangles.filter(t=>Math.max(...t.map(p=>p.u))>=a.u&&Math.min(...t.map(p=>p.u))<=b.u).map(t=>clip(clip(t,p=>p.u-a.u),p=>b.u-p.u)).filter(t=>t.length>=3);
   for(const part of pieces)for(const band of bands){
    const ring=clip(clip(part,p=>distance(p,band.lo)),p=>-distance(p,band.hi));polygon(ring,band.y,0,a,b);
    for(let k=0;k<ring.length;k++){const p=ring[k],q=ring[(k+1)%ring.length];if(band.lo>0&&Math.abs(fraction(p)-band.lo)<1e-7&&Math.abs(fraction(q)-band.lo)<1e-7)wall(p,q,Math.max(0,band.y-(band.seat?rowStride*.44:2.2)),band.y,0,a,b);}
    if(detail&&band.seat&&Math.floor((a.u-minU)*unit/2)%13!==0){
     const lo=interpolate(band.lo,band.hi,.28),hi=interpolate(band.lo,band.hi,.72),seat=clip(clip(part,p=>distance(p,lo)),p=>-distance(p,hi)),mat=4+(Math.floor((a.u-minU)*unit/18)+Math.floor(band.y*2))%4;
     polygon(seat,band.y+.38,mat,a,b);for(let k=0;k<seat.length;k++){const p=seat[k],q=seat[(k+1)%seat.length];if(Math.abs(fraction(p)-lo)<1e-7&&Math.abs(fraction(q)-lo)<1e-7)wall(p,q,band.y+.28,band.y+.38,mat,a,b);}
    }
   }
   // A closed upper hospitality strip follows the actual source bays. There
   // are no invented doors, garage permissions or imported sponsor artwork.
   for(const part of pieces){const roof=clip(part,p=>distance(p,.935));polygon(roof,DAYTONA_STAND_HEIGHT_METERS,1,a,b);
    for(let k=0;k<roof.length;k++){const p=roof[k],q=roof[(k+1)%roof.length];if(Math.abs(fraction(p)-.935)<1e-7&&Math.abs(fraction(q)-.935)<1e-7){wall(p,q,33.0,40.9,2,a,b);wall(p,q,40.9,42.6,1,a,b);wall(p,q,32.12,33.0,1,a,b);}}
   }
   if(detail)for(const part of pieces){
    function section(f){
     const hits=[];for(let k=0;k<part.length;k++){const p=part[k],q=part[(k+1)%part.length],dp=distance(p,f),dq=distance(q,f);
      if(Math.abs(dp)<1e-8)hits.push(p);if(dp*dq<0){const t=dp/(dp-dq);hits.push({u:interpolate(p.u,q.u,t),v:interpolate(p.v,q.v,t)});}
     }hits.sort((p,q)=>p.u-q.u);return hits.length>=2&&hits.at(-1).u-hits[0].u>1e-8?[hits[0],hits.at(-1)]:null;
    }
    const rail=section(.325);if(rail)wall(...rail,12.76,13.76,1,a,b);
    const suite=section(.935);if(suite&&suite[0].u<=a.u+1e-7){const q=at(Math.min(suite[1].u,a.u+.10/unit),.935);wall(suite[0],q,33,40.9,1,a,b);}
    for(const [f,y]of [[.36,12.76],[.69,23.32]]){const opening=section(f);if(opening)wall(...opening,y-1.45,y-.25,3,a,b);}
   }
   for(let k=0;k<local.length;k++){
    const p=local[k],q=local[(k+1)%local.length],du=q.u-p.u;if(Math.abs(du)<1e-10)continue;
    const ts=[Math.max(0,Math.min(1,(a.u-p.u)/du)),Math.max(0,Math.min(1,(b.u-p.u)/du))].sort((x,y)=>x-y);if(ts[1]-ts[0]<1e-8)continue;
    const atT=t=>({u:interpolate(p.u,q.u,t),v:interpolate(p.v,q.v,t)}),r=atT(ts[0]),s=atT(ts[1]);if(r.u<a.u-1e-6||r.u>b.u+1e-6)continue;
    const f=(fraction(r)+fraction(s))*.5;
    if(k<171&&!detail){wall(r,s,0,42.6,0,a,b);}
    else if(k<171){
     // Three concourse levels, recessed bays and narrow structural columns.
     // Partition the actual outer face: no coplanar window decals or second box.
     const cuts=[0,1],columnEnd=(a.u+.14/unit-r.u)/(s.u-r.u);if(columnEnd>0&&columnEnd<1)cuts.push(columnEnd);cuts.sort((x,y)=>x-y);
     for(let j=1;j<cuts.length;j++){
      const point=t=>({u:interpolate(r.u,s.u,t),v:interpolate(r.v,s.v,t)}),p=point(cuts[j-1]),q=point(cuts[j]),column=(p.u+q.u)*.5<a.u+.14/unit;
      for(const [lo,hi,mat]of [[0,.9,8],[.9,11.8,3],[11.8,13.1,0],[13.1,22.4,2],[22.4,24,0],[24,31.5,3],[31.5,33,0],[33,40.9,2],[40.9,42.6,1]])wall(p,q,lo,hi,column?0:mat,a,b);
     }
    }else if(f<.05)wall(r,s,0,2.2,8,a,b);
   }
  }
  buffers.forEach((values,i)=>{if(!values.length)return;const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(values,3));g.computeVertexNormals();g.computeBoundingSphere();const mesh=new T.Mesh(g,materials[i]);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);});
  return group;
 }
 lod.addLevel(buildLevel(1,1,true),0);lod.addLevel(buildLevel(4,3,true),900/unit);lod.addLevel(buildLevel(8,24,false),1900/unit);
 root.userData.architecture={seatingTiers:3,rows:68,concourses:2,footprintRetained:true,heightCeilingMeters:42.6,estimatedArchitecture:true,foundationStations:stations.length,lodLevels:3,interiorAdmission:false};
 finishVenueSurface(T,root,foundation,'../../assets/textures/earth/concrete_diffuse.jpg',3/unit);
 return {root,footprint,bottom:base,top:Math.max(...stations.map(s=>s.ground))+42.6/unit};
}
