import {BANKED_ROAD_MAXIMUM_CROSSFALL} from '../physics/road-plane-dynamics.js';

const valueAt=(points,offset,field='y')=>{
 let i=1;while(i<points.length-1&&offset>points[i].offsetMeters)i++;
 const a=points[i-1],b=points[i],span=b.offsetMeters-a.offsetMeters;
 return span>1e-10?a[field]+(b[field]-a[field])*(offset-a.offsetMeters)/span:a[field];
};
// Fit only the new unraised physical pavement class, inside its existing
// measured error budget. Centre and wheel witnesses retain their canonical precision. Interval
// propagation rejects an unrepresentable surface rather than raising a slope
// limit or hiding a larger discontinuity behind another height source.
const canonicalOffset=(n,m)=>Math.round(n*m*1000)/(m*1000);
function constrainPavementProfile(points,section,metersPerUnit,maximumErrorMeters){
 const scale=metersPerUnit*10000,error=maximumErrorMeters*(1-1e-6)/metersPerUnit,
  anchors=section.fixed.map(n=>canonicalOffset(n,metersPerUnit)),targets=points.map(p=>Math.round(p.y*scale)),
  lower=points.map((p,i)=>anchors.includes(p.offsetMeters)?targets[i]:Math.ceil((p.y-error)*scale)),
  upper=points.map((p,i)=>anchors.includes(p.offsetMeters)?targets[i]:Math.floor((p.y+error)*scale)),
  steps=points.map((p,i)=>i?Math.floor((p.offsetMeters-points[i-1].offsetMeters)*BANKED_ROAD_MAXIMUM_CROSSFALL*10000+1e-9):0);
 const valid=i=>{if(lower[i]>upper[i])throw Error('race_edge_profile_fidelity');};
 for(let i=0;i<points.length;i++)valid(i);
 for(let i=1;i<points.length;i++){lower[i]=Math.max(lower[i],lower[i-1]-steps[i]);upper[i]=Math.min(upper[i],upper[i-1]+steps[i]);valid(i);}
 for(let i=points.length-2;i>=0;i--){lower[i]=Math.max(lower[i],lower[i+1]-steps[i+1]);upper[i]=Math.min(upper[i],upper[i+1]+steps[i+1]);valid(i);}
 let previous;
 for(let i=0;i<points.length;i++){
  const lo=i?Math.max(lower[i],previous-steps[i]):lower[i],hi=i?Math.min(upper[i],previous+steps[i]):upper[i];
  previous=Math.max(lo,Math.min(hi,targets[i]));points[i].y=previous/scale;
 }
 return points;
}
// A near-limit patch can need a different allocation of the same rounding
// budget. Search only the bounded canonical height grid at the current knots.
// Each transition checks every original triangle breakpoint in that interval.
function fitPavementRounding(points,section,metersPerUnit,maximumErrorMeters){
 const scale=metersPerUnit*10000,error=maximumErrorMeters*(1-1e-6)*10000,anchors=section.fixed.map(n=>canonicalOffset(n,metersPerUnit)),
  offsets=[...new Set(points.map(p=>p.offsetMeters))],targets=offsets.map(x=>valueAt(section.points,x)*scale),
  low=targets.map((y,i)=>anchors.includes(offsets[i])?Math.round(y):Math.ceil(y-error)),
  high=targets.map((y,i)=>anchors.includes(offsets[i])?Math.round(y):Math.floor(y+error)),intervals=offsets.map(()=>[]),layers=[];
 for(const p of section.points){let i=1;while(i<offsets.length-1&&p.offsetMeters>offsets[i])i++;intervals[i].push(p);}
 layers.push(Array.from({length:Math.max(0,high[0]-low[0]+1)},(_,i)=>({height:low[0]+i,parent:-1})).sort((a,b)=>Math.abs(a.height-targets[0])-Math.abs(b.height-targets[0])));
 for(let i=1;i<offsets.length;i++){
  const previous=layers[i-1],states=new Map(),width=offsets[i]-offsets[i-1],delta=Math.floor(width*BANKED_ROAD_MAXIMUM_CROSSFALL*10000+1e-9);
  for(let parent=0;parent<previous.length;parent++){
   const height=previous[parent].height;let lo=Math.max(low[i],height-delta),hi=Math.min(high[i],height+delta);
   for(const point of intervals[i]){
    const t=(point.offsetMeters-offsets[i-1])/width,target=point.y*scale;
    if(Math.abs(t)<1e-12){if(Math.abs(height-target)>error){lo=1;hi=0;break;}continue;}
    const a=(target-error-(1-t)*height)/t,b=(target+error-(1-t)*height)/t;
    lo=Math.max(lo,Math.ceil(Math.min(a,b)-1e-9));hi=Math.min(hi,Math.floor(Math.max(a,b)+1e-9));
    if(lo>hi)break;
   }
   for(let height=lo;height<=hi;height++)if(!states.has(height))states.set(height,{height,parent});
  }
  const next=[...states.values()].sort((a,b)=>Math.abs(a.height-targets[i])-Math.abs(b.height-targets[i]));if(!next.length)return null;layers.push(next);
 }
 const values=new Map();let index=0;for(let i=layers.length-1;i>=0;i--){const state=layers[i][index];values.set(offsets[i],state.height/scale);index=state.parent;}
 return points.map(p=>({...p,y:values.get(p.offsetMeters)}));
}
// Temporary qualification data comes only from existing uploaded triangles.
// The finished course retains a common bounded set of lateral stations; arbitrary
// per-row simplification must not connect unrelated terrain creases diagonally.
export function readPublishedLateralSection({contacts,x,z,nx,nz,widthMeters,metersPerUnit,spanMeters,surface,t,edgeKnots=[],boundsMeters}){
 if(typeof contacts?.crossSectionOffsets!=='function')throw Error('race_missing_edge_profile_reader');
 const half=widthMeters/2,minimum=boundsMeters?.minimumMeters??-half,maximum=boundsMeters?.maximumMeters??half;
 if(boundsMeters&&(![minimum,maximum].every(Number.isFinite)||minimum> -spanMeters||maximum<spanMeters||maximum-minimum<6||maximum-minimum>30||Math.max(Math.abs(minimum),Math.abs(maximum))>30))throw Error('race_invalid_pavement_bounds');
 const fixed=boundsMeters?[-spanMeters,0,spanMeters]:[-half,-spanMeters,0,spanMeters,half];
 if(boundsMeters)edgeKnots=[minimum,...edgeKnots,maximum];
 const mandatory=[...fixed,...edgeKnots],offsets=contacts.crossSectionOffsets(x,z,nx,nz,Math.max(Math.abs(minimum),Math.abs(maximum))/metersPerUnit,'at_grade').map(n=>n*metersPerUnit).filter(n=>n>=minimum&&n<=maximum);
 const points=[...offsets.filter(n=>mandatory.every(m=>Math.abs(m-n)>.00001)),...mandatory].sort((a,b)=>a-b).map(offsetMeters=>{
  const point=surface(x+nx*offsetMeters/metersPerUnit,z+nz*offsetMeters/metersPerUnit,t);
  if(!point)throw Error('race_missing_edge_profile_contact');
  return {offsetMeters,y:point.y,...(Number.isFinite(point.baseY)?{baseY:point.baseY}:{})};
 });
 return {points,edgeKnots,fixed,...(boundsMeters?{boundsMeters:{minimumMeters:minimum,maximumMeters:maximum}}:{})};
}
export function compilePublishedLateralProfiles(sections,metersPerUnit,{maximumPoints=32,maximumErrorMeters=.003}={}){
 if(!sections.length||maximumPoints>32||maximumPoints<3||maximumErrorMeters<=0||maximumErrorMeters>.003)throw Error('race_invalid_edge_profile_bound');
 const fixed=[...sections[0].fixed],knots=sections[0].edgeKnots.length,hasBase=sections.some(s=>s.points.some(p=>p.baseY!==undefined));
 if(hasBase&&sections.some(s=>s.points.some(p=>!Number.isFinite(p.baseY))))throw Error('race_missing_edge_base');
 if(sections.some(s=>s.edgeKnots.length!==knots||s.fixed.some((n,i)=>n!==fixed[i])))throw Error('race_edge_profile_station_mismatch');
 // Keep common topology while a physical apron narrows. A crease from a
 // wider row collapses at this row's real boundary, rather than publishing
 // extrapolated pavement outside the uploaded surface.
 const profiles=()=>sections.map(s=>{
  const offsets=[...fixed.map(n=>s.boundsMeters?Math.max(s.boundsMeters.minimumMeters,Math.min(s.boundsMeters.maximumMeters,n)):n),...s.edgeKnots],points=(s.boundsMeters&&!hasBase?offsets.map(n=>canonicalOffset(n,metersPerUnit)):offsets).sort((a,b)=>a-b).map(offsetMeters=>({offsetMeters,y:valueAt(s.points,offsetMeters),...(hasBase?{baseY:valueAt(s.points,offsetMeters,'baseY')}:{})}));
  return s.boundsMeters&&!hasBase?constrainPavementProfile(points,s,metersPerUnit,maximumErrorMeters):points;
 });
 for(;;){
  const rows=profiles(),retried=new Set();let worst;
  for(;;){
   worst=null;
   for(let i=0;i<sections.length;i++)for(const point of sections[i].points){const error=Math.max(Math.abs(valueAt(rows[i],point.offsetMeters)-point.y),hasBase?Math.abs(valueAt(rows[i],point.offsetMeters,'baseY')-point.baseY):0)*metersPerUnit;if(!worst||error>worst.error)worst={error,offset:point.offsetMeters,row:i};}
   if(worst.error<=maximumErrorMeters||!sections[worst.row].boundsMeters||hasBase||retried.has(worst.row)||
     fixed.length+knots<maximumPoints&&!fixed.some(n=>canonicalOffset(n,metersPerUnit)===canonicalOffset(worst.offset,metersPerUnit)))break;
   retried.add(worst.row);const adjusted=fitPavementRounding(rows[worst.row],sections[worst.row],metersPerUnit,maximumErrorMeters);if(!adjusted)break;rows[worst.row]=adjusted;
  }
  if(worst.error<=maximumErrorMeters)return {profiles:rows,maximumErrorMeters:worst.error};
  if(fixed.length+knots>=maximumPoints||fixed.some(n=>Math.abs(n-worst.offset)<1e-7))throw Error('race_edge_profile_capacity');
  fixed.push(worst.offset);fixed.sort((a,b)=>a-b);
 }
}

// A long source interval may need more common lateral creases than one
// bounded profile can hold. Partition only at an already sampled station;
// both facts retain the exact source line and the same shared boundary top.
// Work is bounded to two spans and sixteen candidate boundaries.
export function compilePublishedLateralSpans(sections,metersPerUnit){
 const compile=(first,last)=>({first,last,...compilePublishedLateralProfiles(sections.slice(first,last+1),metersPerUnit)});
 try{return [compile(0,sections.length-1)];}catch(error){if(error.message!=='race_edge_profile_capacity')throw error;}
 const candidates=Array.from({length:Math.max(0,sections.length-2)},(_,i)=>i+1).sort((a,b)=>Math.abs(a-(sections.length-1)/2)-Math.abs(b-(sections.length-1)/2)||a-b).slice(0,16);
 for(const boundary of candidates){
  let left,right;
  try{left=compile(0,boundary);right=compile(boundary,sections.length-1);}catch(error){if(error.message==='race_edge_profile_capacity')continue;throw error;}
  const a=left.profiles.at(-1),b=right.profiles[0],fields=a[0].baseY===undefined?['y']:['y','baseY'];
  let error=0;
  for(const p of [...a,...b])for(const field of fields)error=Math.max(error,Math.abs(valueAt(a,p.offsetMeters,field)-valueAt(b,p.offsetMeters,field))*metersPerUnit);
  if(error<=.0002)return [left,right];
 }
 throw Error('race_edge_profile_capacity');
}
