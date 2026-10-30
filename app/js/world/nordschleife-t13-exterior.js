import {NORD_T13_FOOTPRINT,NORD_T13_SOURCE_ID} from './nordschleife-t13-survey.js';
import {batchOwnedStaticStructure} from './static-structure-batching.js';
import {finishVenueSurface} from './venue-surface-materials.js';

function clip(ring,axis,value,greater){
 const out=[];
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],ia=greater?a[axis]>=value:a[axis]<=value,ib=greater?b[axis]>=value:b[axis]<=value;
  if(ia)out.push(a);
  if(ia!==ib){const t=(value-a[axis])/(b[axis]-a[axis]);out.push({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});}
 }
 return out;
}
function contains(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;
}return hit;}
function close(p,ring){return contains(p,ring)||ring.some((a,i)=>{const b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)<.8;});}
export function isT13StandRepresentation(data,footprint){
 if(data?.sourceBuildingId===NORD_T13_SOURCE_ID)return true;
 const ring=data?.buildingFootprint||data?.pts;if(!Array.isArray(ring)||ring.length<3)return false;
 const center=ring.reduce((p,q)=>({x:p.x+q.x/ring.length,z:p.z+q.z/ring.length}),{x:0,z:0});
 // A unique footprint overlap can transfer a provider's visual representation.
 // Nearby houses and the pit apron cannot match by a name or a radius alone.
 return contains(center,footprint)&&ring.filter(p=>close(p,footprint)).length/ring.length>=.8;
}

// Original architectural interpretation of mapped bleachers and government
// orthophotography. Exact plan; estimated terrace/bench heights, not a scan or
// an official structural survey. The building owner retains all publication,
// collision, world replacement and resource retirement responsibilities.
export function createNordschleifeT13Exterior(T,ctx){
 if(ctx.worldLoadRuntimeState?.venuePack?.id!=='nurburgring-nordschleife'||typeof ctx.geoToWorld!=='function'||typeof ctx.elevationWorldYAtWorldXZ!=='function')return null;
 if(ctx.buildingMeshes?.some(m=>m.userData?.sourceBuildingId===NORD_T13_SOURCE_ID&&m.userData?.architecture?.rows))return null;
 const footprint=NORD_T13_FOOTPRINT.map(p=>ctx.geoToWorld(p.lat,p.lon)),unit=ctx.METERS_PER_WORLD_UNIT||1;
 if(!footprint.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z))||!(unit>0&&unit<=10))return null;
 const heights=footprint.map(p=>ctx.elevationWorldYAtWorldXZ(p.x,p.z));if(!heights.every(Number.isFinite)||Math.max(...heights)-Math.min(...heights)>15/unit)return null;
 const origin=footprint[0],edge=footprint[1],n=Math.hypot(edge.x-origin.x,edge.z-origin.z),ux=(edge.x-origin.x)/n,uz=(edge.z-origin.z)/n;
 const local=footprint.map(p=>({u:(p.x-origin.x)*ux+(p.z-origin.z)*uz,v:-(p.x-origin.x)*uz+(p.z-origin.z)*ux})),
  minU=Math.min(...local.map(p=>p.u)),maxU=Math.max(...local.map(p=>p.u)),minV=Math.min(...local.map(p=>p.v)),maxV=Math.max(...local.map(p=>p.v));
 if(!((maxU-minU)*unit>90&&(maxU-minU)*unit<150&&(maxV-minV)*unit>10&&(maxV-minV)*unit<18))return null;
 const root=new T.Group();root.name='Nordschleife T13 — mapped grandstand';root.position.y=Math.min(...heights);
 root.userData={sourceBuildingId:NORD_T13_SOURCE_ID,reviewedVenueExterior:true,exteriorOnly:true,buildingFootprint:footprint,
  sourceClaim:'OSM bleacher outline; original estimated terraces, benches and railings from RLP DOP20; no interior admission'};
 const material=(color,roughness,metalness=0)=>{const m=new T.MeshStandardMaterial({color,roughness,metalness,side:T.DoubleSide});m.color.convertSRGBToLinear();return m;};
 const concrete=material(0xb6b5ad,.94),metal=material(0x9da5a7,.46,.65),bench=material(0x999e9a,.72,.25);
 const world=(p,y)=>new T.Vector3(origin.x+ux*p.u-uz*p.v,y,origin.z+uz*p.u+ux*p.v);
 const mesh=(g,mat)=>{const m=new T.Mesh(g,mat);m.castShadow=m.receiveShadow=true;root.add(m);return m;};
 const triangles=(points,mat)=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));g.computeVertexNormals();return mesh(g,mat);};
 function top(ring,height,mat){const faces=T.ShapeUtils.triangulateShape(ring.map(p=>new T.Vector2(p.u,p.v)),[]);triangles(faces.flatMap(face=>face.map(i=>world(ring[i],height))),mat);}
 function wall(a,b,bottom,top,mat){triangles([world(a,bottom),world(b,bottom),world(b,top),world(a,bottom),world(b,top),world(a,top)],mat);}
 function beam(a,b,width){const d=b.clone().sub(a),m=mesh(new T.BoxGeometry(width/unit,d.length(),width/unit),metal);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());}
 const rows=18,rise=.31/unit,tread=(maxV-minV)/rows,bays=5,aisles=[];
 const terraceAt=v=>Math.max(1,Math.min(rows,Math.ceil((v-minV)/tread)))*rise;
 function acrossAt(u){const hits=[];for(let i=0;i<local.length;i++){
  const a=local[i],b=local[(i+1)%local.length];if((a.u<=u&&b.u>u)||(b.u<=u&&a.u>u))hits.push(a.v+(b.v-a.v)*(u-a.u)/(b.u-a.u));
 }return hits.length>=2?[Math.min(...hits),Math.max(...hits)]:null;}
 for(let i=1;i<bays;i++)aisles.push(minU+(maxU-minU)*i/bays);
 for(let row=0;row<rows;row++){
  const lo=minV+row*tread,hi=lo+tread,y=(row+1)*rise,ring=clip(clip(local,'v',lo,true),'v',hi,false);if(ring.length<3)continue;
  top(ring,y,concrete);for(let i=0;i<ring.length;i++)wall(ring[i],ring[(i+1)%ring.length],0,y,concrete);
  // Separate benches leave four through aisles. Clip each strip to the mapped
  // outline rather than stretching a rectangular stand across its indents.
  for(let bay=0;bay<bays;bay++){
   const left=bay?aisles[bay-1]+.65/unit:minU+.2/unit,right=bay<bays-1?aisles[bay]-.65/unit:maxU-.2/unit,
    strip=clip(clip(clip(clip(local,'u',left,true),'u',right,false),'v',lo+tread*.32,true),'v',lo+tread*.78,false);
   if(strip.length<3)continue;top(strip,y+.38/unit,bench);for(let i=0;i<strip.length;i++)wall(strip[i],strip[(i+1)%strip.length],y+.29/unit,y+.38/unit,bench);
  }
 }
 for(const u of [minU+.12/unit,...aisles,maxU-.12/unit]){
  const range=acrossAt(u);if(!range)continue;
  const front={u,v:range[0]+.1/unit},back={u,v:range[1]-.1/unit};beam(world(front,terraceAt(front.v)+.95/unit),world(back,terraceAt(back.v)+.95/unit),.045);
  for(let row=0;row<rows;row+=3){const p={u,v:minV+(row+.5)*tread},y=(row+1)*rise;if(p.v<range[0]||p.v>range[1])continue;beam(world(p,y),world(p,y+.95/unit),.04);}
 }
 for(let i=0;i<local.length;i++){
  const a=local[i],b=local[(i+1)%local.length];if(Math.abs(b.u-a.u)<Math.abs(b.v-a.v)*3)continue;
  beam(world(a,terraceAt(a.v)+.95/unit),world(b,terraceAt(b.v)+.95/unit),.045);
  const length=Math.hypot(b.u-a.u,b.v-a.v),count=Math.ceil(length*unit/3);
  for(let j=0;j<=count;j++){const t=j/count,p={u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t},y=terraceAt(p.v);beam(world(p,y),world(p,y+.95/unit),.04);}
 }
 root.userData.architecture={rows,benchBays:bays,aisles:aisles.length,footprintRetained:true,heightMeters:rows*rise*unit+.95,estimatedHeights:true,interiorAdmission:false};
 batchOwnedStaticStructure(T,root);finishVenueSurface(T,root,concrete,'../../assets/textures/earth/concrete_diffuse.jpg',3/unit);
 return {root,footprint,bottom:root.position.y,top:root.position.y+rows*rise};
}
