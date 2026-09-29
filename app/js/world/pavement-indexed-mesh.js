import {drainCooperatively} from './cooperative-scheduling.js?v=1';
// Retain each exact Float32 vertex once. Remove only triangles that collapse
// completely at render precision; thin valid faces and vertical curbs remain.
function* indexPavementPositionSteps(input) {
  const source=input instanceof Float32Array?input:new Float32Array(input);
  if(source.length%9!==0)throw new Error('Invalid pavement triangle array');
  // Open addressing keeps the exact Float32 vertex key in numeric buffers.
  // Large string keys and growable JS arrays caused collection pauses when a
  // completed pavement tile replaced them with the final GPU buffers.
  const positions=new Float32Array(source.length),indices=new Uint32Array(source.length/3);
  const bits=new Uint32Array(source.buffer,source.byteOffset,source.length);
  let tableSize=1;
  while(tableSize<Math.max(1,source.length/3*2))tableSize*=2;
  const table=new Uint32Array(tableSize),mask=tableSize-1;
  let vertexCount=0,indexCount=0;
  let collapsedTriangles=0;
  for(let triangle=0;triangle<source.length;triangle+=9){
    if(triangle%1152===0)yield;
    for(let i=triangle;i<triangle+9;i++)if(!Number.isFinite(source[i]))throw new Error('Invalid pavement vertex');
    const ux=source[triangle+3]-source[triangle],uy=source[triangle+4]-source[triangle+1],uz=source[triangle+5]-source[triangle+2];
    const vx=source[triangle+6]-source[triangle],vy=source[triangle+7]-source[triangle+1],vz=source[triangle+8]-source[triangle+2];
    if(uy*vz-uz*vy===0 && uz*vx-ux*vz===0 && ux*vy-uy*vx===0){collapsedTriangles++;continue;}
    for(let i=triangle;i<triangle+9;i+=3){
      const x=source[i],y=source[i+1],z=source[i+2];
      let hash=Math.imul(x===0?0:bits[i],73856093)^Math.imul(y===0?0:bits[i+1],19349663)^Math.imul(z===0?0:bits[i+2],83492791);
      hash=Math.imul(hash^(hash>>>16),0x85ebca6b);
      let slot=(hash^(hash>>>13))&mask,index;
      for(;;){
        index=table[slot]-1;
        if(index<0){
          index=vertexCount++;table[slot]=index+1;
          positions[index*3]=x;positions[index*3+1]=y;positions[index*3+2]=z;
          break;
        }
        if(positions[index*3]===x&&positions[index*3+1]===y&&positions[index*3+2]===z)break;
        slot=(slot+1)&mask;
      }
      indices[indexCount++]=index;
    }
  }
  const Index=vertexCount<=65536?Uint16Array:Uint32Array;
  return {positions:positions.slice(0,vertexCount*3),indices:new Index(indices.subarray(0,indexCount)),collapsedTriangles};
}

export function indexPavementPositions(input){
 const steps=indexPavementPositionSteps(input);let result;
 do{result=steps.next();}while(!result.done);
 return result.value;
}
export function indexPavementPositionsCooperatively(input,options={}){
 return drainCooperatively(indexPavementPositionSteps(input),options);
}
