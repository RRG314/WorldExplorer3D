const valueAt=(points,offset)=>{
 let i=1;while(i<points.length-1&&offset>points[i].offsetMeters)i++;
 const a=points[i-1],b=points[i],span=b.offsetMeters-a.offsetMeters;
 return span>1e-10?a.y+(b.y-a.y)*(offset-a.offsetMeters)/span:a.y;
};
// Temporary qualification data comes only from existing uploaded triangles.
// The finished course retains a common bounded set of lateral stations; arbitrary
// per-row simplification must not connect unrelated terrain creases diagonally.
export function readPublishedLateralSection({contacts,x,z,nx,nz,widthMeters,metersPerUnit,spanMeters,surface,t,edgeKnots=[]}){
 if(typeof contacts?.crossSectionOffsets!=='function')throw Error('race_missing_edge_profile_reader');
 const half=widthMeters/2,fixed=[-half,-spanMeters,0,spanMeters,half],mandatory=[...fixed,...edgeKnots],
  offsets=contacts.crossSectionOffsets(x,z,nx,nz,half/metersPerUnit,'at_grade').map(n=>n*metersPerUnit);
 const points=[...offsets.filter(n=>mandatory.every(m=>Math.abs(m-n)>.00001)),...mandatory].sort((a,b)=>a-b).map(offsetMeters=>{
  const point=surface(x+nx*offsetMeters/metersPerUnit,z+nz*offsetMeters/metersPerUnit,t);
  if(!point)throw Error('race_missing_edge_profile_contact');
  return {offsetMeters,y:point.y};
 });
 return {points,edgeKnots,fixed};
}
export function compilePublishedLateralProfiles(sections,metersPerUnit,{maximumPoints=32,maximumErrorMeters=.003}={}){
 if(!sections.length||maximumPoints>32||maximumPoints<3||maximumErrorMeters<=0||maximumErrorMeters>.003)throw Error('race_invalid_edge_profile_bound');
 const fixed=[...sections[0].fixed],knots=sections[0].edgeKnots.length;
 if(sections.some(s=>s.edgeKnots.length!==knots||s.fixed.some((n,i)=>n!==fixed[i])))throw Error('race_edge_profile_station_mismatch');
 const profiles=()=>sections.map(s=>[...fixed,...s.edgeKnots].sort((a,b)=>a-b).map(offsetMeters=>({offsetMeters,y:valueAt(s.points,offsetMeters)})));
 for(;;){
  const rows=profiles();let worst=null;
  for(let i=0;i<sections.length;i++)for(const point of sections[i].points){const error=Math.abs(valueAt(rows[i],point.offsetMeters)-point.y)*metersPerUnit;if(!worst||error>worst.error)worst={error,offset:point.offsetMeters};}
  if(worst.error<=maximumErrorMeters)return {profiles:rows,maximumErrorMeters:worst.error};
  if(fixed.length+knots>=maximumPoints||fixed.some(n=>Math.abs(n-worst.offset)<1e-7))throw Error('race_edge_profile_capacity');
  fixed.push(worst.offset);fixed.sort((a,b)=>a-b);
 }
}
