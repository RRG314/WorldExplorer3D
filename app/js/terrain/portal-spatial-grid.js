// Conservative broad phase only. The shader still evaluates the original
// oriented aperture and height equations for every candidate in the cell.
export function buildPortalSpatialGrid(masks, initialCellSize = 128) {
  const bounds = masks.map(mask => {
    const tx=Number(mask.tangentX),tz=Number(mask.tangentZ),lengthSquared=tx*tx+tz*tz;
    const dx=(Math.abs(tx)*mask.halfDepth+Math.abs(tz)*mask.halfWidth)/lengthSquared+.01;
    const dz=(Math.abs(tz)*mask.halfDepth+Math.abs(tx)*mask.halfWidth)/lengthSquared+.01;
    if (![mask.x,mask.z,dx,dz].every(Number.isFinite)) throw new TypeError('Invalid portal bounds');
    return {minX:mask.x-dx,maxX:mask.x+dx,minZ:mask.z-dz,maxZ:mask.z+dz};
  });
  let cellSize=initialCellSize;
  if (!(cellSize>0) || !Number.isFinite(cellSize)) throw new RangeError('Invalid portal cell size');
  for (;;) {
    const minX=bounds.length?Math.floor(Math.min(...bounds.map(b=>b.minX))/cellSize):0;
    const minZ=bounds.length?Math.floor(Math.min(...bounds.map(b=>b.minZ))/cellSize):0;
    const width=bounds.length?Math.floor(Math.max(...bounds.map(b=>b.maxX))/cellSize)-minX+1:1;
    const height=bounds.length?Math.floor(Math.max(...bounds.map(b=>b.maxZ))/cellSize)-minZ+1:1;
    if(width>512||height>512){cellSize*=2;continue;}
    const cells=new Map();
    bounds.forEach((b,id)=>{
      for(let z=Math.floor(b.minZ/cellSize);z<=Math.floor(b.maxZ/cellSize);z++)
        for(let x=Math.floor(b.minX/cellSize);x<=Math.floor(b.maxX/cellSize);x++){
          const key=(z-minZ)*width+x-minX;
          if(!cells.has(key))cells.set(key,[]);
          cells.get(key).push(id);
        }
    });
    let count=0,maxCount=0;
    for(const ids of cells.values()){count+=ids.length;maxCount=Math.max(maxCount,ids.length);}
    // Coarsen the index rather than dropping openings or allocating unbounded
    // cell references. All coincident apertures remain represented.
    if(count>262144&&count>masks.length){cellSize*=2;continue;}
    const referenceWidth=Math.min(512,Math.max(1,count));
    const referenceHeight=Math.max(1,Math.ceil(count/referenceWidth));
    const lookup=new Float32Array(width*height*4),references=new Float32Array(referenceWidth*referenceHeight*4);
    let offset=0;
    for(const [cell,ids] of cells){lookup[cell*4]=offset;lookup[cell*4+1]=ids.length;for(const id of ids)references[offset++*4]=id;}
    return {cellSize,minX,minZ,width,height,lookup,references,referenceWidth,referenceHeight,maxCount,count};
  }
}
