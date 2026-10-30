import {createRoadContactIndex} from '../terrain/road-contact-index.js?v=1';
import {REVIEWED_DETAIL_MAXIMUM_SPACING_METERS} from '../terrain/reviewed-corridor-policy.js';

const boundsOf=p=>({minX:Math.min(...p.map(v=>v.x)),maxX:Math.max(...p.map(v=>v.x)),minZ:Math.min(...p.map(v=>v.z)),maxZ:Math.max(...p.map(v=>v.z))});
const overlaps=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
function subtract(poly,t){
 const p=t.positions,ids=[t.a,t.b,t.c],orientation=Math.sign((p[t.b]-p[t.a])*(p[t.c+2]-p[t.a+2])-(p[t.b+2]-p[t.a+2])*(p[t.c]-p[t.a]));
 let inside=poly;const outside=[];
 for(let edge=0;edge<3&&inside.length>=3;edge++){
  const a=ids[edge],b=ids[(edge+1)%3],dx=p[b]-p[a],dz=p[b+2]-p[a+2],next=[],retained=[];
  for(let i=0;i<inside.length;i++){
   const q=inside[i],r=inside[(i+1)%inside.length],dq=orientation*(dx*(q.z-p[a+2])-dz*(q.x-p[a])),dr=orientation*(dx*(r.z-p[a+2])-dz*(r.x-p[a]));
   if(dq>=0)next.push(q);if(dq<=0)retained.push(q);
   if(dq>0&&dr<0||dq<0&&dr>0){const f=dq/(dq-dr),v={x:q.x+(r.x-q.x)*f,y:q.y+(r.y-q.y)*f,z:q.z+(r.z-q.z)*f};next.push(v);retained.push(v);}
  }
  if(retained.length>=3)outside.push(retained);inside=next;
 }
 return {outside,inside};
}
function plane(t,x,z){const p=t.positions,u=((p[t.b+2]-p[t.c+2])*(x-p[t.c])+(p[t.c]-p[t.b])*(z-p[t.c+2]))/t.denominator,v=((p[t.c+2]-p[t.a+2])*(x-p[t.c])+(p[t.a]-p[t.c])*(z-p[t.c+2]))/t.denominator;return u*p[t.a+1]+v*p[t.b+1]+(1-u-v)*p[t.c+1];}

// Reconcile a shared endpoint during the existing pavement partition. Cut the
// ordinary triangle at actual ribbon edges; assign both sides the same edge
// height. The existing cell support distance spreads a width transition over
// the adjoining road, rather than concentrating it in a thin outside strip.
export function createPavementJoinPartition(joins=[]){
 if(joins.length>106)throw Error('pavement_join_capacity');
 let vertexCount=0;
 for(const join of joins){
  if(!(join.positions instanceof Float32Array)||!(join.indices instanceof Uint16Array||join.indices instanceof Uint32Array)||!join.positions.length||join.positions.length%3||join.indices.length%3||join.positions.length/3>16384||!join.positions.every(Number.isFinite)||!join.indices.every(i=>i<join.positions.length/3)||!Array.isArray(join.neighbors)||!join.neighbors.length||join.neighbors.length>16||!join.neighbors.every(id=>typeof id==='string'&&id.length>0&&id.length<=256)||join.metersPerWorldUnit!==undefined&&!(Number.isFinite(join.metersPerWorldUnit)&&join.metersPerWorldUnit>0))throw Error('invalid_pavement_join');
  vertexCount+=join.positions.length/3;if(vertexCount>65536)throw Error('pavement_join_capacity');
 }
 const prepared=joins.map(join=>{
  const points=[];for(let i=0;i<join.positions.length;i+=3)points.push({x:join.positions[i],z:join.positions[i+2]});
  const bounds=boundsOf(points),radius=REVIEWED_DETAIL_MAXIMUM_SPACING_METERS/(join.metersPerWorldUnit||1),influence={minX:bounds.minX-radius,maxX:bounds.maxX+radius,minZ:bounds.minZ-radius,maxZ:bounds.maxZ+radius};
  return {...join,bounds,influence,radius,index:createRoadContactIndex([{geometry:{attributes:{position:{array:join.positions}},getIndex:()=>({array:join.indices})}}])};
 });
 function select(tile){
  if(!tile||!prepared.length)return [];
  // Source admission happened once at the exact physical join. Every union
  // cell in its bounded influence must use the same geometry, including a
  // neighboring cell whose source attribution belongs to another street.
  return prepared.filter(join=>overlaps(join.influence,tile.bounds));
 }
 function append(vertices,start,output,sampleTop,selected){
  const original=[0,3,6].map(i=>({x:vertices[start+i],z:vertices[start+i+2],y:sampleTop(vertices[start+i],vertices[start+i+2])})),bounds=boundsOf(original),active=selected.filter(j=>overlaps(bounds,j.influence));
  if(!active.length){for(const p of original)output.push(p.x,p.y,p.z);return;}
  let remaining=[original];const fitted=[];
  for(const join of active)join.index.forEachTriangleInBounds(bounds,t=>{
   const next=[];
   for(const polygon of remaining){const cut=subtract(polygon,t);next.push(...cut.outside);if(cut.inside.length>=3)fitted.push(cut.inside.map(p=>({...p,y:plane(t,p.x,p.z)})));}
   remaining=next;if(remaining.length+fitted.length>2048)throw Error('pavement_join_partition_capacity');
  });
  for(const poly of remaining)for(const p of poly){
   let strongest=0,target=p.y;
   for(const join of active){
    const near=join.index.nearestSurfaceAt(p.x,p.z,join.radius);if(!near)continue;
    const t=Math.min(1,near.distance/join.radius),weight=1-t*t*(3-2*t);if(weight<=strongest)continue;
    const ground=sampleTop(p.x,p.z),boundaryGround=sampleTop(near.x,near.z);
    if(!Number.isFinite(ground)||!Number.isFinite(boundaryGround))throw Error('pavement_join_ground_unavailable');
    target=ground+(near.y-boundaryGround)*weight;strongest=weight;
   }
   p.y=target;
  }
  let areaSum=0;
  for(const poly of [...remaining,...fitted])for(let i=1;i<poly.length-1;i++){
   const a=poly[0],b=poly[i],c=poly[i+1],area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);if(Math.abs(area)<1e-12)continue;
   for(const p of area>0?[a,c,b]:[a,b,c])output.push(p.x,p.y,p.z);
   areaSum+=Math.abs(area);
  }
  const [a,b,c]=original,area=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
  if(Math.abs(areaSum-area)>Math.max(1e-9,area*1e-7))throw Error('pavement_join_coverage');
 }
 return {select,append,dispose(){for(const j of prepared)j.index.dispose();prepared.length=0;}};
}
