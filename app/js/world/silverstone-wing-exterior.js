import {createBuildingBodyGeometry} from './building-body-geometry.js';
import {batchOwnedStaticStructure} from './static-structure-batching.js';
import {finishVenueSurface} from './venue-surface-materials.js';

// Stable mapped identity, never a name match or permission to enter a building.
export const SILVERSTONE_WING_SOURCE_ID='overture:02a0db51-e850-4277-a81b-757736f7073a';
export function isSilverstoneWing(building={}){
 return [building.sourceBuildingId,building.buildingIdentity,building.id,building.tags?._sourceFeatureId]
  .includes(SILVERSTONE_WING_SOURCE_ID);
}
const interpolate=(stops,t)=>{
 for(let i=1;i<stops.length;i++)if(t<=stops[i][0]){const [a,h]=stops[i-1],[b,k]=stops[i];return h+(k-h)*(t-a)/(b-a);}
 return stops.at(-1)[1];
};
function clip(ring,axis,value,greater){
 const result=[];
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],insideA=greater?a[axis]>=value:a[axis]<=value,insideB=greater?b[axis]>=value:b[axis]<=value;
  if(insideA)result.push(a);
  if(insideA!==insideB){const t=(value-a[axis])/(b[axis]-a[axis]);result.push({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});}
 }
 return result;
}

// Original architectural interpretation of public designer/opening references.
// Footprint, placement and height ceiling remain the published mapped building;
// roof folds, bays and facade details are authored estimates, not survey claims.
export function createSilverstoneWingExterior(T,source){
 const footprint=source?.userData?.buildingFootprint,height=Number(source?.userData?.heightMeters);
 if(!isSilverstoneWing(source?.userData)||!Array.isArray(footprint)||footprint.length<4||!footprint.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z))||!(height>=15&&height<=40))return null;
 let longest=0,edge;
 for(let i=0;i<footprint.length;i++){const a=footprint[i],b=footprint[(i+1)%footprint.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length>longest){longest=length;edge={a,b};}}
 if(!(longest>180&&longest<500))return null;
 const ux=(edge.b.x-edge.a.x)/longest,uz=(edge.b.z-edge.a.z)/longest;
 const local=footprint.map(p=>({u:(p.x-edge.a.x)*ux+(p.z-edge.a.z)*uz,v:-(p.x-edge.a.x)*uz+(p.z-edge.a.z)*ux}));
 const minU=Math.min(...local.map(p=>p.u)),maxU=Math.max(...local.map(p=>p.u)),minV=Math.min(...local.map(p=>p.v)),maxV=Math.max(...local.map(p=>p.v)),length=maxU-minU,width=maxV-minV;
 if(!(length/width>7&&length/width<25))return null;
 const root=new T.Group();root.name='Silverstone Wing — mapped pit complex';root.position.y=source.position.y;
 root.userData={...source.userData,reviewedVenueExterior:true,exteriorOnly:true,
  sourceClaim:'Mapped footprint and provider height ceiling; original estimated folded roof, glazing and 41 garage bays from public architectural references'};
 const material=(color,roughness=.8,metalness=0)=>{const m=new T.MeshStandardMaterial({color,roughness,metalness,side:T.DoubleSide});m.color.convertSRGBToLinear();return m;};
 const concrete=material(0xb4b2a9,.92),silver=material(0xb1b9bd,.43,.5),glass=material(0x436676,.22,.38),dark=material(0x293237,.72,.15),white=material(0xe6e4db,.58,.2);
 const world=(p,y)=>new T.Vector3(edge.a.x+ux*p.u-uz*p.v,y,edge.a.z+uz*p.u+ux*p.v);
 const garageTop=height*.155,glassBase=height*.255;
 const folds=[[0,.58],[.09,.52],[.30,.85],[.315,.57],[.59,.94],[.605,.65],[.91,1],[1,.66]];
 const roofY=p=>{const t=Math.max(0,Math.min(1,(p.u-minU)/length)),across=Math.max(0,Math.min(1,(p.v-minV)/width));return height*(.40+(interpolate(folds,t)-.40)*(1-across*.56));};
 function mesh(g,mat){const m=new T.Mesh(g,mat);m.castShadow=m.receiveShadow=true;root.add(m);return m;}
 function triangles(points,mat){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));g.computeVertexNormals();return mesh(g,mat);}
 function beam(a,b,w,mat=silver,d=w){const delta=b.clone().sub(a),m=mesh(new T.BoxGeometry(w,delta.length(),d),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;}
 function wall(a,b,bottom,topA,topB,mat){triangles([world(a,bottom),world(b,bottom),world(b,topB),world(a,bottom),world(b,topB),world(a,topA)],mat);}
 // Keep the exact closed mapped shell as the collision envelope. Closed bay
 // shutters decorate its face; no invented open garage or interior admission.
 mesh(createBuildingBodyGeometry(T,footprint,glassBase),concrete);
 for(let i=1;i<folds.length;i++){
  const a=minU+folds[i-1][0]*length,b=minU+folds[i][0]*length,ring=clip(clip(local,'u',a,true),'u',b,false);
  if(ring.length<3)continue;
  const faces=T.ShapeUtils.triangulateShape(ring.map(p=>new T.Vector2(p.u,p.v)),[]),vertices=[];
  for(const face of faces)for(const index of face)vertices.push(world(ring[index],roofY(ring[index])));
  triangles(vertices,silver);
 }
 for(let i=0;i<local.length;i++){
  const a=local[i],b=local[(i+1)%local.length],run=Math.hypot(b.u-a.u,b.v-a.v),cuts=[0,1];
  for(const [fraction]of folds){const u=minU+fraction*length,t=(u-a.u)/(b.u-a.u);if(t>0&&t<1)cuts.push(t);}
  const bays=Math.max(1,Math.ceil(run/2.8));for(let j=1;j<bays;j++)cuts.push(j/bays);cuts.sort((a,b)=>a-b);
  for(let j=1;j<cuts.length;j++){
   const at=t=>({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t}),p=at(cuts[j-1]),q=at(cuts[j]);
   wall(p,q,glassBase,roofY(p)-.18,roofY(q)-.18,glass);beam(world(p,glassBase),world(p,roofY(p)),.09);
   beam(world(p,roofY(p)),world(q,roofY(q)),.24,silver,.35);
  }
  for(const y of [glassBase,height*.36,height*.45]){
   for(let j=1;j<cuts.length;j++){const at=t=>({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t}),p=at(cuts[j-1]),q=at(cuts[j]);if(y<Math.min(roofY(p),roofY(q))-.3)beam(world(p,y),world(q,y),.12,white,.15);}
  }
 }
 // The longest mapped facade is the pit-facing garage row. The 41 bays are
 // distributed over that retained edge, never a stretched 390 m substitute.
 const nU=(edge.b.x-edge.a.x)/longest,nZ=(edge.b.z-edge.a.z)/longest,normal={x:-nZ,z:nU};
 const center=footprint.reduce((p,q)=>({x:p.x+q.x/footprint.length,z:p.z+q.z/footprint.length}),{x:0,z:0});
 if((edge.a.x+edge.b.x-2*center.x)*normal.x+(edge.a.z+edge.b.z-2*center.z)*normal.z<0){normal.x*=-1;normal.z*=-1;}
 const outward=.035,garageBay=longest/41;
 for(let i=0;i<41;i++){
  const from=(i*garageBay+.3)/longest,to=((i+1)*garageBay-.3)/longest;
  const p=t=>new T.Vector3(edge.a.x+(edge.b.x-edge.a.x)*t+normal.x*outward,0,edge.a.z+(edge.b.z-edge.a.z)*t+normal.z*outward),a=p(from),b=p(to);
  triangles([a.clone().setY(.15),b.clone().setY(.15),b.clone().setY(garageTop),a.clone().setY(.15),b.clone().setY(garageTop),a.clone().setY(garageTop)],dark);
  for(let y=.45;y<garageTop;y+=.46)beam(a.clone().setY(y),b.clone().setY(y),.035,silver,.025);
  for(const point of [a,b])beam(point.clone().setY(.1),point.clone().setY(garageTop+.12),.18,white,.12);
  beam(a.clone().setY(garageTop+.12),b.clone().setY(garageTop+.12),.2,white,.14);
 }
 root.userData.architecture={garageBays:41,footprintRetained:true,heightCeiling:height,roofFolds:folds.length,interiorAdmission:false};
 batchOwnedStaticStructure(T,root);
 finishVenueSurface(T,root,concrete,'../../assets/textures/earth/concrete_diffuse.jpg',4);
 return root;
}
