import {sampleRaceSegmentY,raceSegmentAtDistance} from './course-rules.js';

// Original race paint, derived from the qualified deck. It adds presentation
// only: no parallel road mesh, collider, height authority or per-frame work.
export function raceCourseSurfacePoint(course,distanceMeters,lateralMeters=0,liftMeters=0) {
 const distance=Math.max(0,Math.min(course.lengthMeters,distanceMeters));
 const segment=raceSegmentAtDistance(course,distance);
 const t=(distance-segment.startMeters)/segment.lengthMeters,forward=segment.forward,unit=course.metersPerUnit;
 return {x:segment.a.x+(segment.b.x-segment.a.x)*t+forward.z*lateralMeters/unit,
  y:sampleRaceSegmentY(segment,t,lateralMeters)+liftMeters/unit,
  z:segment.a.z+(segment.b.z-segment.a.z)*t-forward.x*lateralMeters/unit};
}
export function buildRacePaint(course) {
 const positions=[],colors=[],rectangles=[];
 function rectangle(start,end,left,right,color) {
  const a=Math.max(0,start),b=Math.min(course.lengthMeters,end);if(b<=a)return;
  // Split at source boundaries as well as metre intervals; a paint quad must
  // not bridge a crest or connect vertically separated source decks.
  const splits=[a,b,...course.segments.map(s=>s.startMeters).filter(d=>d>a&&d<b)];
  for(let d=a+1;d<b;d++)splits.push(d);splits.sort((x,y)=>x-y);
  for(let i=1;i<splits.length;i++){
   if(splits[i]<=splits[i-1])continue;
   const points=[[splits[i-1],left],[splits[i-1],right],[splits[i],right],[splits[i],left]].map(([d,l])=>raceCourseSurfacePoint(course,d,l,.018));
   for(const index of [0,1,2,0,2,3]){const p=points[index];positions.push(p.x,p.y,p.z);colors.push(color,color,color);}
  }
  rectangles.push({start:a,end:b,left,right});
 }
 // White event boundaries remain inside the admitted pavement. They are
 // flat paint on its accepted surface, not invented raised kerb geometry.
 for(const segment of course.segments)for(const side of [-1,1]) {
  const edge=side*(segment.widthMeters/2-.32);
  rectangle(segment.startMeters,segment.startMeters+segment.lengthMeters,edge-.06,edge+.06,.88);
 }
 const last=course.segments.at(-1),width=Math.min(16,last.widthMeters-.4),columns=Math.max(2,Math.ceil(width/.6));
 for(let row=0;row<2;row++)for(let col=0;col<columns;col++){
  const left=-width/2+col*width/columns;
  rectangle(course.lengthMeters-(2-row)*.3,course.lengthMeters-(1-row)*.3,left,left+width/columns,(row+col)%2?.88:.035);
 }
 // Full class envelope, including long classics; neither the starter BMW nor
 // a compact car silently defines the grid's usable length.
 const envelope=course.vehicleEnvelope,halfLength=envelope.lengthMeters/2,halfWidth=envelope.widthMeters/2;
 for(let slot=0;slot<course.participants;slot++){
  const center=halfLength+1+(Math.ceil(course.participants/2)-1-Math.floor(slot/2))*8;
  const lateral=course.participants===1?0:slot%2===0?-1.4:1.4;
  rectangle(center-halfLength,center+halfLength,lateral-halfWidth,lateral-halfWidth+.1,.88);
  rectangle(center-halfLength,center+halfLength,lateral+halfWidth-.1,lateral+halfWidth,.88);
  rectangle(center-halfLength,center-halfLength+.1,lateral-halfWidth,lateral+halfWidth,.88);
  rectangle(center+halfLength-.1,center+halfLength,lateral-halfWidth,lateral+halfWidth,.88);
 }
 return {positions:new Float32Array(positions),colors:new Float32Array(colors),rectangles};
}
