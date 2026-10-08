import {streetPolygonKernel as clip} from './compiler/street-polygon-kernel.js';
import {isMappedPedestrianArea} from './compiler/pavement-footway-policy.js';
import * as triangulator from '../../../functions/vendor/earcut/index.js';
const earcut=triangulator.default||globalThis.earcut;

// Subtract existing plaza surfaces from temporary path ribbons as well as the
// resident compiler. Preserve each source triangle's plane and polygon holes.
export function createMappedPavementClipper(landuses=[]) {
 const areas=landuses.filter(a=>a.presentationOwner==='mapped_geometry'&&isMappedPedestrianArea(a)).map(a=>{
  const rings=[a.pts,...(a.holeRings||a.holes||[])];
  const points=rings[0]||[];
  return {polygon:rings.map(r=>r.map(p=>[p.x,p.z])),minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};
 }).filter(a=>a.polygon[0].length>=3);
 if(!areas.length)return null;
 const cell=64,buckets=new Map(),broad=[];
 for(const area of areas) {
  const x0=Math.floor(area.minX/cell),x1=Math.floor(area.maxX/cell),z0=Math.floor(area.minZ/cell),z1=Math.floor(area.maxZ/cell);
  if((x1-x0+1)*(z1-z0+1)>1024){broad.push(area);continue;}
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
   const key=`${x}:${z}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(area);
  }
 }
 return (positions,indices)=>{
  const output=[],index=[];
  const append=p=>{index.push(output.length/3);output.push(...p);};
  for(let i=0;i<indices.length;i+=3){
   const points=[0,1,2].map(j=>Array.from(positions.slice(indices[i+j]*3,indices[i+j]*3+3)));
   const [a,b,c]=points,minX=Math.min(a[0],b[0],c[0]),maxX=Math.max(a[0],b[0],c[0]),minZ=Math.min(a[2],b[2],c[2]),maxZ=Math.max(a[2],b[2],c[2]);
   const candidates=new Set(broad);
   for(let x=Math.floor(minX/cell);x<=Math.floor(maxX/cell);x++)for(let z=Math.floor(minZ/cell);z<=Math.floor(maxZ/cell);z++)for(const area of buckets.get(`${x}:${z}`)||[])candidates.add(area);
   const nearby=[...candidates].filter(p=>p.minX<maxX&&p.maxX>minX&&p.minZ<maxZ&&p.maxZ>minZ);
   const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
   if(!nearby.length||Math.abs(den)<1e-10){points.forEach(append);continue;}
   const shape=[points.map(p=>[p[0],p[2]])];
   const result=clip.difference(shape,clip.union(nearby.map(p=>p.polygon)));
   for(const polygon of result){
    const flat=[],holes=[];
    for(let r=0;r<polygon.length;r++){if(r)holes.push(flat.length/2);flat.push(...polygon[r].slice(0,-1).flat());}
    const triangles=earcut(flat,holes,2);
    const point=id=>{
     const x=flat[id*2],z=flat[id*2+1];
     const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den;
     const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
     return [x,u*a[1]+v*b[1]+(1-u-v)*c[1],z];
    };
    for(let j=0;j<triangles.length;j+=3){
     const ps=triangles.slice(j,j+3).map(point);
     if((ps[1][0]-ps[0][0])*(ps[2][2]-ps[0][2])-(ps[1][2]-ps[0][2])*(ps[2][0]-ps[0][0])>0)[ps[1],ps[2]]=[ps[2],ps[1]];
     ps.forEach(append);
    }
   }
  }
  return {positions:output,indices:index};
 };
}
