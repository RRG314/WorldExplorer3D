// All detailed tiles publish horizontal coordinates in the same Float32 world
// frame as the regional terrain. Rounding a local half-width and then adding a
// different tile origin creates two values for a shared geographic boundary.
export function setTerrainWorldGrid(position, segments, northWest, northEast, southWest) {
  const x0=Math.fround(northWest.x),x1=Math.fround(northEast.x);
  const z0=Math.fround(northWest.z),z1=Math.fround(southWest.z);
  for(let row=0;row<=segments;row++)for(let col=0;col<=segments;col++) {
    const index=row*(segments+1)+col;
    position.setX(index,col===segments?x1:x0+(x1-x0)*col/segments);
    position.setZ(index,row===segments?z1:z0+(z1-z0)*row/segments);
  }
  position.needsUpdate=true;
}

// Float32 grid stations need not be equally spaced after publication. Locate
// the actual rendered interval rather than inferring one from the tile width.
export function terrainGridInterval(array, segments, step, component, value) {
  let low=0,high=segments;
  while(low<high){const middle=Math.ceil((low+high)/2);if(array[middle*step+component]<=value)low=middle;else high=middle-1;}
  return Math.min(segments-1,low);
}
