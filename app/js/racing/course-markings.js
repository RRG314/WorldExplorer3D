import {raceEdgeInsideAnotherSpan} from './course-boundary.js';
import {racePavementCrossSection,racePavementLateralOffsets} from './pavement-cross-section.js';
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
export function buildRacePaint(course,{filtered=true,venueId=course.venueSource?.id,pitBranch=false}={}) {
 const positions=[],colors=[],rectangles=[],strokeCoverage=[];
 const sectionAt=d=>{const s=raceSegmentAtDistance(course,Math.max(0,Math.min(course.lengthMeters,d)));return racePavementCrossSection(s,(d-s.startMeters)/s.lengthMeters);},valueAt=(v,d)=>typeof v==='function'?v(d):v,bankRelative=offset=>course.pavementModel?(d=>(sectionAt(d)?.racingOffsetMeters||0)+offset):offset;
 function clip(points,distance){const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],da=distance(a),db=distance(b),ia=da>=-1e-9,ib=db>=-1e-9;if(ia)out.push(a);if(ia!==ib){const t=da/(da-db);out.push({d:a.d+(b.d-a.d)*t,l:a.l+(b.l-a.l)*t});}}return out;}
 function rectangle(start,end,left,right,color,filterStroke=filtered) {
  const a=Math.max(0,start),b=Math.min(course.lengthMeters,end);if(b<=a)return;
  const pad=filterStroke?.25:0,from=Math.max(0,a-pad),to=Math.min(course.lengthMeters,b+pad),center=(a+b)/2,halfLength=(b-a)/2;
  const boundary=(d,side)=>{const section=sectionAt(d),seg=raceSegmentAtDistance(course,d);return side<0?section?.minimumMeters??-seg.widthMeters/2:section?.maximumMeters??seg.widthMeters/2;};
  // Only grid and finish strokes need the filtered footprint. Existing event
  // edges retain their exact geometry and opaque coverage, including joins.
  const splits=[from,to,...course.segments.map(s=>s.startMeters).filter(d=>d>from&&d<to)];
  for(let d=from+1;d<to;d++)splits.push(d);splits.sort((x,y)=>x-y);
  function emit(points){
   for(let i=1;i<points.length-1;i++)for(const q of [points[0],points[i],points[i+1]]){
    const p=raceCourseSurfacePoint(course,q.d,q.l,.018),lo=valueAt(left,q.d),hi=valueAt(right,q.d);
    positions.push(p.x,p.y,p.z);colors.push(...(Array.isArray(color)?color:[color,color,color]));strokeCoverage.push(q.d-center,q.l-(lo+hi)/2,filterStroke?halfLength:-1,filterStroke?(hi-lo)/2:-1);
   }
  }
  for(let i=1;i<splits.length;i++){
   const lo=splits[i-1],hi=splits[i];if(hi<=lo)continue;
   const points=[[lo,left,-1],[hi,left,-1],[hi,right,1],[lo,right,1]].map(([d,l,side])=>({d,l:filterStroke?(side<0?Math.max(boundary(d,-1)+.01,valueAt(l,d)-pad):Math.min(boundary(d,1)-.01,valueAt(l,d)+pad)):valueAt(l,d)}));
   if(!filterStroke){emit([points[0],points[3],points[2],points[1]]);continue;}
   // Split padded paint at the same accepted lateral creases. Padding is
   // render coverage on qualified pavement, never extrapolated road support.
   const segment=raceSegmentAtDistance(course,(lo+hi)/2),t=d=>Math.max(0,Math.min(1,(d-segment.startMeters)/segment.lengthMeters)),lower=racePavementLateralOffsets(segment,t(lo)),upper=racePavementLateralOffsets(segment,t(hi));
   if(!lower){emit(points);continue;}
   for(let k=1;k<lower.length;k++){
    const edge=(d,j)=>lower[j]+(upper[j]-lower[j])*(d-lo)/(hi-lo),part=clip(clip(points,p=>p.l-edge(p.d,k-1)),p=>edge(p.d,k)-p.l);emit(part);
   }
  }
  rectangles.push({start:a,end:b,left:valueAt(left,(a+b)/2),right:valueAt(right,(a+b)/2),...(typeof left==='function'||typeof right==='function'?{variableLateral:true}:{})});
 }
 // White event boundaries remain inside the admitted pavement. They are
 // flat paint on its accepted surface, not invented raised kerb geometry.
 for(const segment of course.venueSource?.id==='daytona-tri-oval'?[]:course.segments)for(const side of [-1,1]) {
  const edge=side*(segment.widthMeters/2-.32);
  if(segment.pavementModel){const edgeAt=d=>{const s=sectionAt(d);return side<0?s.minimumMeters+.32:s.maximumMeters-.32;};rectangle(segment.startMeters,segment.startMeters+segment.lengthMeters,d=>edgeAt(d)-.06,d=>edgeAt(d)+.06,.88,false);}else for(let d=segment.startMeters;d<segment.startMeters+segment.lengthMeters;d+=2){const end=Math.min(segment.startMeters+segment.lengthMeters,d+2),p=raceCourseSurfacePoint(course,(d+end)/2,edge);if(!raceEdgeInsideAnotherSpan(course,p,segment))rectangle(d,end,edge-.09,edge+.09,course.surfaceKind==='ground'?[.9,.72,.24]:.88,false);}
 }
 if(!course.venueSource)for(let d=25;d<course.lengthMeters-15;d+=30){
  for(let i=0;i<6;i++){const at=d+i*.25,lateral=(5-i)*.15;rectangle(at,at+.3,-lateral-.1,-lateral+.1,[.75,.93,.55],false);rectangle(at,at+.3,lateral-.1,lateral+.1,[.75,.93,.55],false);}
 }
 // Flat original red/white bend-edge paint for the GP pack. It follows the
 // existing qualified pavement; it creates no raised support or physics class.
 if(venueId==='silverstone-grand-prix'){
  for(let i=1;i<course.segments.length-1;i++){
   const a=course.segments[i-1],b=course.segments[i],turn=Math.atan2(a.forward.x*b.forward.z-a.forward.z*b.forward.x,a.forward.x*b.forward.x+a.forward.z*b.forward.z);
   if(Math.abs(turn)<.07||Math.abs(turn)>1.8)continue;
   const side=Math.sign(turn),start=Math.max(0,b.startMeters-8),end=Math.min(course.lengthMeters,b.startMeters+14);
   for(let d=start;d<end;d+=1){const edge=at=>{const seg=raceSegmentAtDistance(course,at);return side*(seg.widthMeters/2-.75);};
    rectangle(d,Math.min(end,d+1),at=>edge(at)-.32,at=>edge(at)+.32,Math.floor(d)%2?[.78,.035,.025]:[.9,.9,.87],false);
   }
  }
 }
 if(course.discipline==='circuit'&&course.pitLane&&!pitBranch){
  const branch=buildRacePaint(course.pitLane.course,{filtered,venueId:'circuit-pit',pitBranch:true});
  for(const v of branch.positions)positions.push(v);for(const v of branch.colors)colors.push(v);for(const v of branch.strokeCoverage)strokeCoverage.push(v);
 }
 if(!pitBranch){
 const last=course.segments.at(-1),width=Math.min(16,(racePavementCrossSection(last,1)?.racingWidthMeters??last.widthMeters)-.4),columns=Math.max(2,Math.ceil(width/.6));
 for(let row=0;row<2;row++)for(let col=0;col<columns;col++){
  const left=-width/2+col*width/columns;
  rectangle(course.lengthMeters-(2-row)*.3,course.lengthMeters-(1-row)*.3,last.pavementModel?bankRelative(left):left,last.pavementModel?bankRelative(left+width/columns):left+width/columns,(row+col)%2?.88:.035);
 }
 // Full class envelope, including long classics; neither the starter BMW nor
 // a compact car silently defines the grid's usable length.
 const envelope=course.vehicleEnvelope,halfLength=envelope.lengthMeters/2,halfWidth=envelope.widthMeters/2;
 for(let slot=0;slot<course.participants;slot++){
  const center=halfLength+1+(Math.ceil(course.participants/2)-1-Math.floor(slot/2))*8;
  const lateral=course.participants===1?0:slot%2===0?-1.4:1.4;
  rectangle(center-halfLength,center+halfLength,bankRelative(lateral-halfWidth),bankRelative(lateral-halfWidth+.1),.88);
  rectangle(center-halfLength,center+halfLength,bankRelative(lateral+halfWidth-.1),bankRelative(lateral+halfWidth),.88);
  rectangle(center-halfLength,center-halfLength+.1,bankRelative(lateral-halfWidth),bankRelative(lateral+halfWidth),.88);
  rectangle(center+halfLength-.1,center+halfLength,bankRelative(lateral-halfWidth),bankRelative(lateral+halfWidth),.88);
 }
 }
 return {positions:new Float32Array(positions),colors:new Float32Array(colors),strokeCoverage:new Float32Array(strokeCoverage),rectangles};
}
