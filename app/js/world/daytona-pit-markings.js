import {roadPavementSectionForSegment} from './road-pavement-sections.js';
import {roadPavementFrameAtSegment} from './road-pavement-coordinate-frame.js';

// Original game stall layout and pace cues, not surveyed official assignments.
// Preparation only: the perimeter owner retains/disposes these projected faces.
export function appendDaytonaPitMarkings(roads,index,unit,chunkAt,startDistance){
 const spans=[];let lengthMeters=0,faces=0,boxes=0;
 for(const road of roads)for(let segment=0;segment<road.pts.length-1;segment++){
  const a=road.pts[segment],b=road.pts[segment+1],length=Math.hypot(b.x-a.x,b.z-a.z)*unit;
  if(!(length>0))throw Error('daytona_pit_paint_source_invalid');spans.push({road,segment,a,b,start:lengthMeters,length});lengthMeters+=length;
 }
 if(lengthMeters<200||lengthMeters>2000)throw Error('daytona_pit_paint_source_invalid');
 const station=distance=>{const s=spans.find(s=>distance<=s.start+s.length+1e-8)||spans.at(-1),t=Math.max(0,Math.min(1,(distance-s.start)/s.length)),section=roadPavementSectionForSegment(s.road,s.segment,t),n=roadPavementFrameAtSegment(s.road.transportRecord.crossSection.pavementSections,s.segment,t);
  return {section,point:offset=>({x:s.a.x+(s.b.x-s.a.x)*t+n.x*offset/unit,y:0,z:s.a.z+(s.b.z-s.a.z)*t+n.z*offset/unit})};};
 function stroke(a,b,width,distance,color=[.88,.88,.82],continuous=false){
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),tx=dx/length,tz=dz/length,nx=-tz,nz=tx,
   center={x:(a.x+b.x)/2,z:(a.z+b.z)/2},halfLength=length*unit/2,halfWidth=width/2,pad=.25,endPad=continuous?0:pad,
   point=(along,lateral)=>({x:center.x+(tx*along+nx*lateral)/unit,z:center.z+(tz*along+nz*lateral)/unit}),
   points=[point(-halfLength-endPad,-halfWidth-pad),point(halfLength+endPad,-halfWidth-pad),point(halfLength+endPad,halfWidth+pad),point(-halfLength-endPad,halfWidth+pad)],
   projected=index.projectPolygon(points,.008/unit,'at_grade');
  if(!projected.length)throw Error('daytona_pit_paint_unsupported');
  const c=chunkAt(startDistance+distance);c.center??={x:projected[0],y:projected[1],z:projected[2]};c.strokeCoverage??=[];
  c.paint.push(...projected);
  for(let i=0;i<projected.length;i+=3){const x=(projected[i]-center.x)*unit,z=(projected[i+2]-center.z)*unit;c.colors.push(...color);c.strokeCoverage.push(x*tx+z*tz,x*nx+z*nz,continuous?-1:halfLength,halfWidth);}
  faces+=projected.length/9;
 }
 function strip(start,end,offset,width=.12,continuous=false){const a=station(start),b=station(end),lo=typeof offset==='function'?offset(a.section):offset,hi=typeof offset==='function'?offset(b.section):offset;
  stroke(a.point(lo),b.point(hi),width,(start+end)/2,undefined,continuous);
 }
 // Keep the shared main/apron junction clear. Paint starts after the branches
 // separate and ends before the real pit merge; no second main-road stripe.
 for(let distance=75;distance<lengthMeters-20;distance+=3){const end=Math.min(distance+3,lengthMeters-20);
  strip(distance,end,s=>s.positive*unit-.35,.12,true);strip(distance,end,s=>-s.negative*unit+.35,.12,true);
 }
 for(let distance=155;distance+11<lengthMeters-60;distance+=15){
  const inner=s=>-s.negative*unit+.7,outer=s=>inner(s)+3;
  strip(distance,distance+11,outer);for(const at of [distance,distance+11]){const s=station(at),lo=inner(s.section),hi=outer(s.section);stroke(s.point(lo),s.point(hi),.12,at);}
  boxes++;
 }
 const glyphs={P:[[0,0,.12,2.3],[.12,2.18,.68,.12],[.12,1.05,.68,.12],[.68,1.05,.12,1.25]],I:[[0,2.18,.8,.12],[.34,0,.12,2.3],[0,0,.8,.12]],T:[[0,2.18,.8,.12],[.34,0,.12,2.3]],2:[[0,2.18,.8,.12],[.68,1.1,.12,1.2],[0,1.05,.8,.12],[0,0,.12,1.15],[0,0,.8,.12]]};
 function text(word,distance){const center=station(distance).section.bankOffset*unit,start=center-(word.length*.95-.15)/2;for(let i=0;i<word.length;i++)for(const [x,z,w,h]of glyphs[word[i]])strip(distance+z,distance+z+h,start+i*.95+x+w/2,w);}
 text('PIT',95);text('22',135);
 const s=station(115),center=s.section.bankOffset*unit;
 strip(115,118.8,center,.16);stroke(station(117).point(center-.7),station(119).point(center),.16,118);stroke(station(119).point(center),station(117).point(center+.7),.16,118);
 return {lengthMeters,boxes,paintFaces:faces,paceMph:22,sourceWays:roads.length,interpretation:'original game layout; actual uploaded pavement projection',filtering:'pixel coverage of unchanged physical stroke widths'};
}
