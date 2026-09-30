// Sample the accepted terrain along each mapped wall. A long chord between
// endpoint heights can pass above a valley or through a ridge.
export function sampleHistoricWallSegments(points, groundY, height, options = {}) {
  const lengths = points.slice(1).map((end, i) => Math.hypot(end.x-points[i].x,end.z-points[i].z));
  const total = lengths.reduce((sum,n)=>sum+(Number.isFinite(n)&&n<=1200?n:0),0);
  const spacing = Math.max(8, total / 512, Number(options.spacing) || 0);
  const segments=[];
  for(let i=0;i<lengths.length;i++) {
    const length=lengths[i];if(!Number.isFinite(length)||length<.35||length>1200)continue;
    const a=points[i],b=points[i+1],count=Math.ceil(length/spacing);
    let start={x:a.x,z:a.z,y:groundY(a.x,a.z)};
    for(let j=1;j<=count;j++) {
      const t=j/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      const end={x,z,y:groundY(x,z)};
      if(Number.isFinite(start.y)&&Number.isFinite(end.y)) {
        const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
        segments.push({x:(start.x+end.x)/2,y:(start.y+end.y+height)/2,z:(start.z+end.z)/2,dx,dy,dz,length:Math.hypot(dx,dz)});
      }
      start=end;
    }
  }
  return segments;
}

// Collision uses the same sampled spans as rendering, including downhill bases.
export function historicWallCollision(segment, width, height) {
  const sx = segment.dz / segment.length * width / 2;
  const sz = -segment.dx / segment.length * width / 2;
  const ax = segment.x - segment.dx / 2, az = segment.z - segment.dz / 2;
  const bx = segment.x + segment.dx / 2, bz = segment.z + segment.dz / 2;
  return {
    footprint: [{x:ax+sx,z:az+sz},{x:bx+sx,z:bz+sz},
      {x:bx-sx,z:bz-sz},{x:ax-sx,z:az-sz}],
    baseY: segment.y - height / 2 - Math.abs(segment.dy) / 2,
    height: height + Math.abs(segment.dy)
  };
}
