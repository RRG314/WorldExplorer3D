import {sampleRaceSegmentY} from './course-rules.js';
// Disposable spatial projection of the accepted course, shared by paint and
// temporary equipment. Internal overlapping corridor edges are not perimeters.
const indices=new WeakMap();
export function raceEdgeInsideAnotherSpan(course,point,own){
 if(course.venueSource)return false;
 let index=indices.get(course);const cell=24/course.metersPerUnit;
 if(!index){index=new Map();for(const s of course.segments){const pad=(s.widthMeters/2+1)/course.metersPerUnit;for(let x=Math.floor((Math.min(s.a.x,s.b.x)-pad)/cell);x<=Math.floor((Math.max(s.a.x,s.b.x)+pad)/cell);x++)for(let z=Math.floor((Math.min(s.a.z,s.b.z)-pad)/cell);z<=Math.floor((Math.max(s.a.z,s.b.z)+pad)/cell);z++){const key=x+':'+z;if(!index.has(key))index.set(key,[]);index.get(key).push(s);}}indices.set(course,index);}
 for(const s of index.get(Math.floor(point.x/cell)+':'+Math.floor(point.z/cell))||[]){if(s===own)continue;const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,n=dx*dx+dz*dz,t=((point.x-s.a.x)*dx+(point.z-s.a.z)*dz)/n;if(t<0||t>1)continue;
  const lateral=((point.x-s.a.x)*s.forward.z-(point.z-s.a.z)*s.forward.x)*course.metersPerUnit;
  if(Math.abs(lateral)<s.widthMeters/2-.3&&Math.abs(point.y-sampleRaceSegmentY(s,t,lateral))*course.metersPerUnit<.5)return true;
 }return false;
}
