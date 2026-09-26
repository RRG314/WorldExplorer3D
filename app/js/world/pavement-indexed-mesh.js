import {drainCooperatively} from './cooperative-scheduling.js?v=1';
// Retain each exact Float32 vertex once. Remove only triangles that collapse
// completely at render precision; thin valid faces and vertical curbs remain.
function* indexPavementPositionSteps(input) {
  const source=input instanceof Float32Array?input:new Float32Array(input);
  if(source.length%9!==0)throw new Error('Invalid pavement triangle array');
  const positions=[],indices=[],vertices=new Map();
  let collapsedTriangles=0;
  for(let triangle=0;triangle<source.length;triangle+=9){
    if(triangle%1152===0)yield;
    for(let i=triangle;i<triangle+9;i++)if(!Number.isFinite(source[i]))throw new Error('Invalid pavement vertex');
    const ux=source[triangle+3]-source[triangle],uy=source[triangle+4]-source[triangle+1],uz=source[triangle+5]-source[triangle+2];
    const vx=source[triangle+6]-source[triangle],vy=source[triangle+7]-source[triangle+1],vz=source[triangle+8]-source[triangle+2];
    if(uy*vz-uz*vy===0 && uz*vx-ux*vz===0 && ux*vy-uy*vx===0){collapsedTriangles++;continue;}
    for(let i=triangle;i<triangle+9;i+=3){
      const x=source[i],y=source[i+1],z=source[i+2],key=`${x}:${y}:${z}`;
      let index=vertices.get(key);
      if(index===undefined){index=positions.length/3;vertices.set(key,index);positions.push(x,y,z);}
      indices.push(index);
    }
  }
  const Index=positions.length/3<=65536?Uint16Array:Uint32Array;
  return {positions:new Float32Array(positions),indices:new Index(indices),collapsedTriangles};
}

export function indexPavementPositions(input){
 const steps=indexPavementPositionSteps(input);let result;
 do{result=steps.next();}while(!result.done);
 return result.value;
}
export function indexPavementPositionsCooperatively(input,options={}){
 return drainCooperatively(indexPavementPositionSteps(input),options);
}
