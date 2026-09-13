// Retain each exact Float32 vertex once. This changes storage, not polygon
// topology or elevation, and keeps adjacent cells independently disposable.
export function indexPavementPositions(input) {
  const source=input instanceof Float32Array?input:new Float32Array(input);
  const positions=[],indices=[],vertices=new Map();
  for(let i=0;i<source.length;i+=3){
    const x=source[i],y=source[i+1],z=source[i+2];
    if(![x,y,z].every(Number.isFinite))throw new Error('Invalid pavement vertex');
    const key=`${x}:${y}:${z}`;
    let index=vertices.get(key);
    if(index===undefined){index=positions.length/3;vertices.set(key,index);positions.push(x,y,z);}
    indices.push(index);
  }
  const Index=positions.length/3<=65536?Uint16Array:Uint32Array;
  return {positions:new Float32Array(positions),indices:new Index(indices)};
}
