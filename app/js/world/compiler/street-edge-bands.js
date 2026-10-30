import {createStreetPolygonKernel} from './street-polygon-kernel.js';
import {BANKED_ROAD_MAXIMUM_CROSSFALL} from '../../physics/road-plane-dynamics.js';
// Match the existing accepted-surface output precision. Reusing the 1 mm
// design grid for each face folds sloping shared seams into asphalt slivers.
export const streetEdgePolygonKernel=createStreetPolygonKernel({grid:.000001});
const clip=streetEdgePolygonKernel;

const overlaps=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
function boundsOf(polygons){
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const polygon of polygons)for(const ring of polygon)for(const[x,z]of ring){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
 return {minX,maxX,minZ,maxZ};
}
function positiveHalfPlane({a,b,c},bounds){
 let ring=[[bounds.minX-1,bounds.minZ-1],[bounds.maxX+1,bounds.minZ-1],[bounds.maxX+1,bounds.maxZ+1],[bounds.minX-1,bounds.maxZ+1]],output=[];
 for(let i=0;i<ring.length;i++){
  const p=ring[i],q=ring[(i+1)%ring.length],pv=a*p[0]+b*p[1]+c,qv=a*q[0]+b*q[1]+c;
  if(pv>=0)output.push(p);
  if((pv>=0)!==(qv>=0)){const t=pv/(pv-qv);output.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
 }
 return output.length<3?[]:[[output.concat([output[0]])]];
}

// Temporary planar integration inside the carriageway compiler. The existing
// terrain partition still supplies base height; these bounded authored faces
// supply additive lift only. Resolve overlaps before any render/contact batch
// is published, so a raised band never hides a second flat driving surface.
export function resolveStreetEdgeBands(faces,roadPolygons,bounds,{maximumLift=.15}={}){
 if(!Array.isArray(faces)||faces.length>4096||!Number.isFinite(maximumLift)||maximumLift<=0||maximumLift>.5)throw Error('invalid_street_edge_band');
 const surfaces=[],cells=new Map();let references=0;
 const visit=(box,callback)=>{for(let x=Math.floor(box.minX/8);x<=Math.floor(box.maxX/8);x++)for(let z=Math.floor(box.minZ/8);z<=Math.floor(box.maxZ/8);z++)callback(x,z);};
 for(const face of faces){
  const points=face?.points,color=face?.color;
  if(!Array.isArray(points)||points.length!==3||points.some(p=>!p||![p.x,p.z,p.lift].every(Number.isFinite)||Math.abs(p.x)>1e7||Math.abs(p.z)>1e7||p.lift<0||p.lift>maximumLift)||
   !Array.isArray(color)||color.length!==3||color.some(n=>!Number.isInteger(n)||n<0||n>255))throw Error('invalid_street_edge_band');
  const [p,q,r]=points,dx=q.x-p.x,dz=q.z-p.z,ex=r.x-p.x,ez=r.z-p.z,determinant=dx*ez-ex*dz;
  if(Math.abs(determinant)<1e-10)continue;
  const a=((q.lift-p.lift)*ez-(r.lift-p.lift)*dz)/determinant,b=(dx*(r.lift-p.lift)-ex*(q.lift-p.lift))/determinant,c=p.lift-a*p.x-b*p.z;
  if(![a,b,c].every(Number.isFinite)||Math.hypot(a,b)>BANKED_ROAD_MAXIMUM_CROSSFALL+1e-8)throw Error('invalid_street_edge_band_slope');
  const shape=[points.map(p=>[p.x,p.z]).concat([[p.x,p.z]])];
  let remaining=clip.intersection(shape,roadPolygons);if(!remaining.length)continue;
  const box=boundsOf(remaining),candidates=new Set();
  visit(box,(x,z)=>{for(const index of cells.get(x)?.get(z)||[])candidates.add(index);});
  for(const index of candidates){
   const old=surfaces[index];if(!old.polygons.length||!overlaps(box,old.bounds))continue;
   const intersection=clip.intersection(remaining,old.polygons);if(!intersection.length)continue;
   // Inside corners use the lower roof, continuous at both asphalt edges.
   const delta={a:old.a-a,b:old.b-b,c:old.c-c};
   const winner=Math.abs(delta.a)+Math.abs(delta.b)<1e-12?(delta.c>1e-10?intersection:[]):clip.intersection(intersection,positiveHalfPlane(delta,bounds));
   const retained=winner.length?clip.difference(intersection,winner):intersection;
   if(winner.length)old.polygons=clip.difference(old.polygons,winner);
   if(retained.length)remaining=clip.difference(remaining,retained);
   if(!remaining.length)break;
  }
  if(!remaining.length)continue;
  const index=surfaces.length;surfaces.push({a,b,c,color:[...color],polygons:remaining,bounds:box});
  visit(box,(x,z)=>{
   let column=cells.get(x);if(!column)cells.set(x,column=new Map());let values=column.get(z);if(!values)column.set(z,values=[]);
   if(++references>65536)throw Error('street_edge_band_capacity');values.push(index);
  });
 }
 const active=surfaces.filter(s=>s.polygons.length),polygons=active.flatMap(s=>s.polygons);
 return {surfaces:active,footprint:polygons.length?clip.union(polygons):[]};
}
