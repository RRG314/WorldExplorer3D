// The authored vessel origin is its design waterline, not its keel. Sample the
// footprint of this vessel and fit a plane instead of lifting above every crest.
export function vesselWaterSamples({length,width}) {
  const result=[{forward:0,side:0,weight:2.2,zone:'center'}];
  for(const forward of [-.35,0,.35])for(const side of [-.35,.35])result.push({forward:forward*length,side:side*width,weight:1,zone:forward>0?'bow':forward<0?'stern':side>0?'port':'starboard'});
  return result;
}
export function fitVesselWaterPlane(samples) {
  const valid=samples.filter(p=>[p.forward,p.side,p.height,p.weight].every(Number.isFinite)&&p.weight>0);
  const weight=valid.reduce((sum,p)=>sum+p.weight,0);
  if(!weight)return null;
  const mean=key=>valid.reduce((sum,p)=>sum+p[key]*p.weight,0)/weight;
  const x=mean('side'),z=mean('forward'),y=mean('height');
  let xx=0,zz=0,xz=0,xy=0,zy=0;
  for(const p of valid){const dx=p.side-x,dz=p.forward-z,dy=p.height-y;xx+=dx*dx*p.weight;zz+=dz*dz*p.weight;xz+=dx*dz*p.weight;xy+=dx*dy*p.weight;zy+=dz*dy*p.weight;}
  const determinant=xx*zz-xz*xz;
  const sx=determinant>1e-9?(xy*zz-zy*xz)/determinant:0,sz=determinant>1e-9?(zy*xx-xy*xz)/determinant:0;
  return {height:y-sx*x-sz*z,pitch:-Math.atan(sz),roll:Math.atan(sx)};
}
