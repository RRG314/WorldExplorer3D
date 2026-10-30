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

export function sampleIndexedTerrainField(positions,indices,x,z,valueAt,field){
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,
   den=(positions[b+2]-positions[c+2])*(positions[a]-positions[c])+(positions[c]-positions[b])*(positions[a+2]-positions[c+2]);
  if(Math.abs(den)<1e-12)continue;
  const u=((positions[b+2]-positions[c+2])*(x-positions[c])+(positions[c]-positions[b])*(z-positions[c+2]))/den,
   v=((positions[c+2]-positions[a+2])*(x-positions[c])+(positions[a]-positions[c])*(z-positions[c+2]))/den;
  if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)return u*valueAt(field,indices[i])+v*valueAt(field,indices[i+1])+(1-u-v)*valueAt(field,indices[i+2]);
 }
 return null;
}
const terrainVertexY=(positions,index)=>positions[index*3+1];
export const sampleIndexedTerrainCell=(positions,indices,x,z)=>sampleIndexedTerrainField(positions,indices,x,z,terrainVertexY,positions);
