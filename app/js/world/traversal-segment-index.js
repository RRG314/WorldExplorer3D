// Broad-phase lookup only: callers retain their exact projection, weighting,
// access and distance decisions. Original segment order breaks equal-cost ties.
export function createTraversalSegmentIndex(segments, cellSize = 64) {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('Invalid traversal index cell size');
  const cells = new Map();
  const broad = [];
  for (let id = 0; id < segments.length; id++) {
    const { p1, p2 } = segments[id];
    const bounds = [Math.min(p1.x,p2.x),Math.max(p1.x,p2.x),Math.min(p1.z,p2.z),Math.max(p1.z,p2.z)];
    if (!bounds.every(Number.isFinite)) continue;
    const [minX,maxX,minZ,maxZ] = bounds.map(value=>Math.floor(value/cellSize));
    // Long bridges/railways remain queryable without expanding a huge grid.
    if (![minX,maxX,minZ,maxZ].every(Number.isSafeInteger) || (maxX-minX+1)*(maxZ-minZ+1)>256) {broad.push(id);continue;}
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
      const key=`${x}:${z}`;
      let bucket=cells.get(key);
      if(!bucket){bucket=[];cells.set(key,bucket);}
      bucket.push(id);
    }
  }
  return {
    query(x,z,radius) {
      if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||radius<0)return [];
      const padding=Number.EPSILON*Math.max(1,Math.abs(x),Math.abs(z),radius)*8;
      const minX=Math.floor((x-radius-padding)/cellSize),maxX=Math.floor((x+radius+padding)/cellSize);
      const minZ=Math.floor((z-radius-padding)/cellSize),maxZ=Math.floor((z+radius+padding)/cellSize);
      if(![minX,maxX,minZ,maxZ].every(Number.isSafeInteger) || (maxX-minX+1)*(maxZ-minZ+1)>4096)return segments.map((_,id)=>id);
      const ids=new Set(broad);
      for(let cx=minX;cx<=maxX;cx++)for(let cz=minZ;cz<=maxZ;cz++){
        for(const id of cells.get(`${cx}:${cz}`)||[])ids.add(id);
      }
      return [...ids].sort((a,b)=>a-b);
    }
  };
}
