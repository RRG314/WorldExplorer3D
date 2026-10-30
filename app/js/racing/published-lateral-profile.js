// Reduce only collinear published triangle intersections. Mandatory centre,
// wheel and boundary samples retain their exact values in the shared contract.
export function publishedLateralProfile({contacts,x,z,nx,nz,widthMeters,metersPerUnit,spanMeters,surface,t,edgeKnots=[]}){
 if(typeof contacts?.crossSectionOffsets!=='function')throw Error('race_missing_edge_profile_reader');
 const half=widthMeters/2,mandatory=[-half,-spanMeters,0,spanMeters,half,...edgeKnots],offsets=contacts.crossSectionOffsets(x,z,nx,nz,half/metersPerUnit,'at_grade').map(n=>n*metersPerUnit);
 const points=[...offsets.filter(n=>mandatory.every(m=>Math.abs(m-n)>.001)),...mandatory].sort((a,b)=>a-b).map(offsetMeters=>{
  const point=surface(x+nx*offsetMeters/metersPerUnit,z+nz*offsetMeters/metersPerUnit,t);
  if(!point)throw Error('race_missing_edge_profile_contact');
  return {offsetMeters,y:point.y};
 });
 const protectedPoint=p=>p.offsetMeters===0||Math.abs(p.offsetMeters)===half||edgeKnots.includes(p.offsetMeters);
 for(let i=1;i<points.length-1;){
  const a=points[i-1],b=points[i],c=points[i+1],prediction=a.y+(c.y-a.y)*(b.offsetMeters-a.offsetMeters)/(c.offsetMeters-a.offsetMeters);
  if(!protectedPoint(b)&&Math.abs(b.y-prediction)*metersPerUnit<.0005){points.splice(i,1);i=Math.max(1,i-1);}else i++;
 }
 if(points.length>8)throw Error('race_edge_profile_capacity');
 // A collapsed final strip is supported by the existing triangle loft. Padding
 // at one boundary keeps the representation bounded without inventing heights.
 while(points.length<8)points.push({...points.at(-1)});
 return points;
}
