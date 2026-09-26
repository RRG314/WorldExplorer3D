// Area coverage for the distant terrain material. Two samples per pixel row
// retain antialiased boundaries; even/odd spans preserve courtyards and holes.
export function rasterizePavementMask(polygons,bounds,resolution=64){
  const coverage=new Float32Array(resolution*resolution),step=(bounds.maxX-bounds.minX)/resolution;
  for(const polygon of polygons)for(let row=0;row<resolution;row++)for(const offset of [.25,.75]){
    const z=bounds.minZ+(row+offset)*step,xs=[];
    for(const ring of polygon)for(let i=1;i<ring.length;i++){
      const a=ring[i-1],b=ring[i];
      if((a[1]>z)===(b[1]>z))continue;
      xs.push(a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]));
    }
    xs.sort((a,b)=>a-b);
    for(let i=1;i<xs.length;i+=2){
      const start=Math.max(0,(xs[i-1]-bounds.minX)/step),end=Math.min(resolution,(xs[i]-bounds.minX)/step);
      for(let col=Math.floor(start);col<Math.ceil(end);col++)if(col>=0&&col<resolution)
        coverage[row*resolution+col]+=Math.max(0,Math.min(col+1,end)-Math.max(col,start))*.5;
    }
  }
  return Uint8Array.from(coverage,n=>Math.round(Math.min(1,n)*255));
}

export function pavementMaskLayout(keys,maxSize=4096){
  const columns=Math.max(1,Math.ceil(Math.sqrt(keys.length))),rows=Math.max(1,Math.ceil(keys.length/columns));
  let resolution=64;
  while(columns*resolution>maxSize||rows*resolution>maxSize)resolution/=2;
  if(resolution<8)throw new Error('Loaded pavement inventory exceeds the terrain-mask capacity');
  let minX=0,minZ=0,maxX=0,maxZ=0;
  keys.forEach((key,i)=>{const [x,z]=key.split(':').map(Number);if(!i){minX=maxX=x;minZ=maxZ=z;}else{minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}});
  const lookupWidth=maxX-minX+1,lookupHeight=maxZ-minZ+1;
  if(lookupWidth>maxSize||lookupHeight>maxSize||keys.length>65534)throw new Error('Loaded pavement inventory exceeds the address-table capacity');
  return {columns,rows,resolution,width:columns*resolution,height:rows*resolution,minX,minZ,lookupWidth,lookupHeight};
}
