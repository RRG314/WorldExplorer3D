import {createStreetPolygonKernel} from '../world/compiler/street-polygon-kernel.js';
import {sampleRaceSegmentY,projectRacePosition} from './course-rules.js';
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

const perimeters=new WeakMap();
export function raceCoursePerimeter(course){
 if(course.venueSource||course.segments.some(s=>s.structure!=='surface'||s.pavementModel))return null;
 if(perimeters.has(course))return perimeters.get(course);
 const unit=course.metersPerUnit,polygons=[],closed=Math.hypot(course.points[0].x-course.points.at(-1).x,course.points[0].z-course.points.at(-1).z)<.01;
 for(let i=0;i<course.segments.length;i++){
  const s=course.segments[i],r=s.widthMeters/2/unit,n={x:s.forward.z*r,z:-s.forward.x*r};
  polygons.push([[[s.a.x+n.x,s.a.z+n.z],[s.b.x+n.x,s.b.z+n.z],[s.b.x-n.x,s.b.z-n.z],[s.a.x-n.x,s.a.z-n.z],[s.a.x+n.x,s.a.z+n.z]]]);
  if(i||closed){const previous=course.segments[(i-1+course.segments.length)%course.segments.length],radius=Math.min(s.widthMeters,previous.widthMeters)/2/unit,ring=[];for(let j=0;j<=16;j++){const angle=j/16*Math.PI*2;ring.push([s.a.x+Math.cos(angle)*radius,s.a.z+Math.sin(angle)*radius]);}polygons.push([ring]);}
 }
 const shape=createStreetPolygonKernel().union(polygons),edges=[];
 for(const polygon of shape)for(const ring of polygon)for(let i=1;i<ring.length;i++){
  const a={x:ring[i-1][0],z:ring[i-1][1]},b={x:ring[i][0],z:ring[i][1]},length=Math.hypot(b.x-a.x,b.z-a.z)*unit;if(length<1e-8)continue;
  const middle={x:(a.x+b.x)/2,z:(a.z+b.z)/2},support=projectRacePosition(course,middle),forward={x:(b.x-a.x)*unit/length,z:(b.z-a.z)*unit/length};
  // Open start/finish planes remain driveable; only the longitudinal perimeter
  // is race equipment. No end cap can become an invisible finish-line wall.
  const source=course.segments[support.index];if(!closed&&(support.distanceMeters<.05||support.distanceMeters>course.lengthMeters-.05)&&Math.abs(forward.x*source.forward.x+forward.z*source.forward.z)<.2)continue;
  edges.push({a,b,forward,lengthMeters:length,distanceMeters:support.distanceMeters});
 }
 perimeters.set(course,edges);return edges;
}
export function racePerimeterPoint(course,edge,t,offsetMeters=0,liftMeters=0){
 const x=edge.a.x+(edge.b.x-edge.a.x)*t+edge.forward.z*offsetMeters/course.metersPerUnit,z=edge.a.z+(edge.b.z-edge.a.z)*t-edge.forward.x*offsetMeters/course.metersPerUnit;
 return {x,z,y:projectRacePosition(course,{x,z}).y+liftMeters/course.metersPerUnit};
}
