// Never reorder footprint vertices: persisted patch.wall indexes refer to them.
export function wallDirections(points) {
  const area=points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a.x*b.z-b.x*a.z;},0);
  if(Math.abs(area)<1e-8)throw Error('Footprint has no usable orientation');
  return points.map((a,i)=>{
    const b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    const sign=area>0?1:-1,nx=sign*dz/length,nz=-sign*dx/length;
    const bearing=(Math.atan2(nx,-nz)*180/Math.PI+360)%360;
    const compass=['N','NE','E','SE','S','SW','W','NW'][Math.round(bearing/45)%8];
    return {wall:i,length,bearing,compass,normal:{x:nx,z:nz},midpoint:{x:(a.x+b.x)/2,z:(a.z+b.z)/2}};
  });
}
