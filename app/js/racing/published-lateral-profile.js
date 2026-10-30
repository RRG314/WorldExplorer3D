const valueAt=(points,offset,field='y')=>{
 let i=1;while(i<points.length-1&&offset>points[i].offsetMeters)i++;
 const a=points[i-1],b=points[i],span=b.offsetMeters-a.offsetMeters;
 return span>1e-10?a[field]+(b[field]-a[field])*(offset-a.offsetMeters)/span:a[field];
};
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
 const profiles=()=>sections.map(s=>[...fixed.map(n=>s.boundsMeters?Math.max(s.boundsMeters.minimumMeters,Math.min(s.boundsMeters.maximumMeters,n)):n),...s.edgeKnots].sort((a,b)=>a-b).map(offsetMeters=>({offsetMeters,y:valueAt(s.points,offsetMeters),...(hasBase?{baseY:valueAt(s.points,offsetMeters,'baseY')}:{})})));
 for(;;){
  const rows=profiles();let worst=null;
  for(let i=0;i<sections.length;i++)for(const point of sections[i].points){const error=Math.max(Math.abs(valueAt(rows[i],point.offsetMeters)-point.y),hasBase?Math.abs(valueAt(rows[i],point.offsetMeters,'baseY')-point.baseY):0)*metersPerUnit;if(!worst||error>worst.error)worst={error,offset:point.offsetMeters};}
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
