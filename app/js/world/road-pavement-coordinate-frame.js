// Geometry coordinates for the compiler's existing profiled pavement heights.
// Shared node transects avoid nearest-segment height jumps on graded bends.
const cross=(x,z,a,b)=>x*b-z*a;
function normal(a,b){const x=b.x-a.x,z=b.z-a.z,d=Math.hypot(x,z);if(!(d>1e-8))throw Error('reviewed_pavement_coordinates_invalid');return {x:-z/d,z:x/d};}
export function roadPavementNodeFrames(points,{start,end}={}){
 return Object.freeze(points.map((p,i)=>{
  const a=i?points[i-1]:start,b=i+1<points.length?points[i+1]:end,
   before=a?normal(a,p):null,after=b?normal(p,b):null;
  if(!before||!after)return Object.freeze(before||after);
  let x=before.x+after.x,z=before.z+after.z,d=Math.hypot(x,z);
  if(d<=1e-5)return Object.freeze(after);
  x/=d;z/=d;const denominator=x*after.x+z*after.z;
  if(Math.abs(denominator)<.25)return Object.freeze(after);
  const scale=Math.min(1/denominator,1.5);return Object.freeze({x:x*scale,z:z*scale});
 }));
}
export function roadPavementFrameAtSegment(profile,segment,t){
 const a=profile.nodeFrames[segment],b=profile.nodeFrames[segment+1];
 return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
}
export function roadPavementFrameAtDistance(profile,distance){
 const d=profile.nodeDistances;let lo=0,hi=d.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(d[mid]<distance)lo=mid;else hi=mid;}
 return roadPavementFrameAtSegment(profile,lo,Math.max(0,Math.min(1,(distance-d[lo])/(d[hi]-d[lo]))));
}

// Invert P(t,l)=a+(b-a)t+l(n0+(n1-n0)t). Search only the nearest
// source span and its neighbours; ordinary roads retain their projection.
export function projectRoadPavementPoint(feature,x,z,nearest){
 const profile=feature?.transportRecord?.crossSection?.pavementSections;
 if(!profile||!nearest)return nearest;
 if(nearest.pavementQueryX===x&&nearest.pavementQueryZ===z)return nearest;
 let best=null;
 const consider=(i,t,cap=false)=>{
  if(!Number.isFinite(t)||t< -1e-8||t>1+1e-8)return;
  t=Math.max(0,Math.min(1,t));
  const a=feature.pts[i],b=feature.pts[i+1],dx=b.x-a.x,dz=b.z-a.z,px=a.x+dx*t,pz=a.z+dz*t,
   n=roadPavementFrameAtSegment(profile,i,t),wx=x-px,wz=z-pz,lateral=(wx*n.x+wz*n.z)/(n.x*n.x+n.z*n.z),
   residualX=wx-n.x*lateral,residualZ=wz-n.z*lateral,along=(residualX*dx+residualZ*dz)/Math.hypot(dx,dz),
   residual=Math.hypot(residualX,residualZ),dist=Math.hypot(wx,wz);
  if(!cap&&residual>1e-6)return;
  if(best&&(best.residual<residual-1e-8||Math.abs(best.residual-residual)<=1e-8&&best.dist<=dist))return;
  best={x:px,z:pz,dist,segIndex:i,t,residual,pavementLateral:lateral,pavementFrameX:n.x,pavementFrameZ:n.z,pavementAlongResidual:along,pavementQueryX:x,pavementQueryZ:z};
 };
 for(let i=Math.max(0,nearest.segIndex-1);i<=Math.min(feature.pts.length-2,nearest.segIndex+1);i++){
  const a=feature.pts[i],b=feature.pts[i+1],vx=b.x-a.x,vz=b.z-a.z,wx=x-a.x,wz=z-a.z,
   n=profile.nodeFrames[i],m=profile.nodeFrames[i+1],nx=m.x-n.x,nz=m.z-n.z,
   A=-cross(vx,vz,nx,nz),B=cross(wx,wz,nx,nz)-cross(vx,vz,n.x,n.z),C=cross(wx,wz,n.x,n.z);
  if(Math.abs(A)<1e-12){if(Math.abs(B)>1e-12)consider(i,-C/B);}
  else{
   const disc=B*B-4*A*C;
   if(disc>=0){const q=-.5*(B+(B<0?-1:1)*Math.sqrt(disc));consider(i,q/A);if(q!==0)consider(i,C/q);}
  }
 }
 if(!best){
  // End support continues the same transect plane. Its residual is separate
  // from the lateral frame's tangent component at an adjoining curved way.
  if(nearest.segIndex===0)consider(0,0,true);
  if(nearest.segIndex===feature.pts.length-2)consider(feature.pts.length-2,1,true);
 }
 return best||nearest;
}
