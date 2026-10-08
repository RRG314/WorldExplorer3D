import {vectorRoadIsDirected,vectorRoadSemanticKey} from './vector-line-ownership.js';

// A coarse drawing of a road must not become a second physical height owner.
// Retire it only when EVERY point of every segment is covered by a higher
// resolution road of the same semantics. Partial coverage keeps the original;
// this pass never clips structures or guesses topology across a source gap.
const CELL=128, TOLERANCE=1.5, EPSILON=1e-8;
const cells=(a,b,padding,visit)=>{
 for(let x=Math.floor((Math.min(a.x,b.x)-padding)/CELL);x<=Math.floor((Math.max(a.x,b.x)+padding)/CELL);x++)
  for(let z=Math.floor((Math.min(a.z,b.z)-padding)/CELL);z<=Math.floor((Math.max(a.z,b.z)+padding)/CELL);z++)visit(`${x}:${z}`);
};
function linearRange(value,delta,lo,hi,range){
 if(Math.abs(delta)<1e-12)return value>=lo-EPSILON&&value<=hi+EPSILON;
 const a=(lo-value)/delta,b=(hi-value)/delta;
 range[0]=Math.max(range[0],Math.min(a,b));range[1]=Math.min(range[1],Math.max(a,b));
 return range[1]>=range[0]-EPSILON;
}
function capsuleIntervals(a,b,segment,tolerance){
 const dx=b.x-a.x,dz=b.z-a.z,ox=a.x-segment.a.x,oz=a.z-segment.a.z;
 const along=ox*segment.ux+oz*segment.uz,across=-ox*segment.uz+oz*segment.ux;
 const dAlong=dx*segment.ux+dz*segment.uz,dAcross=-dx*segment.uz+dz*segment.ux;
 const ranges=[],strip=[0,1];
 if(linearRange(along,dAlong,0,segment.length,strip)&&linearRange(across,dAcross,-tolerance,tolerance,strip))ranges.push(strip);
 const lengthSquared=dx*dx+dz*dz;
 for(const center of [segment.a,segment.b]){
  const x=a.x-center.x,z=a.z-center.z,linear=x*dx+z*dz;
  const discriminant=linear*linear-lengthSquared*(x*x+z*z-tolerance*tolerance);
  if(discriminant<0)continue;
  const radius=Math.sqrt(discriminant),lo=Math.max(0,(-linear-radius)/lengthSquared),hi=Math.min(1,(-linear+radius)/lengthSquared);
  if(hi>=lo)ranges.push([lo,hi]);
 }
 return ranges;
}
export function findCoveredCoarseRoadIds(primary,regional,{tolerance=TOLERANCE}={}){
 const grid=new Map();
 for(const road of primary){
  if(!Number.isFinite(road.level))continue;
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
   if(!(length>EPSILON))continue;
   const segment={a,b,length,ux:(b.x-a.x)/length,uz:(b.z-a.z)/length,road};
   cells(a,b,tolerance,key=>{if(!grid.has(key))grid.set(key,[]);grid.get(key).push(segment)});
  }
 }
 const covered=new Set();
 for(const road of regional){
  if(!Number.isFinite(road.level)||road.points.length<2)continue;
  let complete=true,nondegenerate=false;
  for(let i=1;i<road.points.length&&complete;i++){
   const a=road.points[i-1],b=road.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
   if(!(length>EPSILON))continue;
   nondegenerate=true;
   const candidates=new Set();cells(a,b,0,key=>{for(const segment of grid.get(key)||[])candidates.add(segment)});
   const intervals=[];
   for(const segment of candidates){
    if(segment.road.level<=road.level||segment.road.key!==road.key)continue;
    if(road.oneway&&road.oneway!==segment.road.oneway)continue;
    const dot=((b.x-a.x)*segment.ux+(b.z-a.z)*segment.uz)/length;
    if((road.directed?dot:Math.abs(dot))<.98)continue;
    intervals.push(...capsuleIntervals(a,b,segment,tolerance));
   }
   intervals.sort((a,b)=>a[0]-b[0]);
   let end=0;
   for(const interval of intervals){if(interval[0]>end+EPSILON)break;end=Math.max(end,interval[1]);if(end>=1-EPSILON)break;}
   if(end<1-EPSILON)complete=false;
  }
  if(complete&&nondegenerate)covered.add(road.id);
 }
 return covered;
}
export function retireCoveredRegionalRoads(primaryElements,regionalElements){
 const origin=[...primaryElements,...regionalElements].find(e=>e.type==='node'&&Number.isFinite(e.lat));
 if(!origin)return {elements:regionalElements,retiredRoadCount:0};
 const longitudeScale=111320*Math.cos(origin.lat*Math.PI/180);
 const records=elements=>{
  const nodes=new Map(elements.filter(e=>e.type==='node').map(n=>[n.id,n]));
  return elements.filter(e=>e.type==='way'&&e.tags?.highway&&e.vectorRoadTile&&e.tags?._sourceCompleteness==='generalized'&&e.tags._sourceTruncated!=='yes'&&e.nodes?.every(id=>nodes.has(id))).map(way=>({
   // Shortbread exposes one-way metadata at z14+, not z13. Missing is
   // unknown; explicit opposing direction remains incompatible. The finer
   // geometry retains its own traffic/access metadata without modification.
   id:way.id,level:way.vectorRoadTile.z,key:vectorRoadSemanticKey({...way.tags,oneway:''}),
   oneway:way.tags.oneway||'',directed:vectorRoadIsDirected(way.tags),
   points:way.nodes.map(id=>nodes.get(id)).filter(Boolean).map(p=>({x:(p.lon-origin.lon)*longitudeScale,z:(p.lat-origin.lat)*110540}))
  }));
 };
 const retired=findCoveredCoarseRoadIds(records(primaryElements),records(regionalElements));
 if(!retired.size)return {elements:regionalElements,retiredRoadCount:0};
 const ways=regionalElements.filter(e=>e.type!=='node'&&!(e.type==='way'&&retired.has(e.id)));
 const used=new Set(ways.flatMap(e=>e.nodes||[]));
 return {elements:[...regionalElements.filter(e=>e.type==='node'&&(e.tags||used.has(e.id))),...ways],retiredRoadCount:retired.size};
}
