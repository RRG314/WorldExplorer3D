// Road contact indexes consume world-space vertices. Mapped plazas can still
// carry a mesh translation before batching, so copy their accepted transform
// once per pavement publication without creating another rendered surface.
export async function mappedPavementContactSources(meshes,{current=()=>true,yieldWork}={}) {
 const sources=[];
 for(const mesh of meshes||[]) {
  if(!mesh.userData?.mappedPedestrianArea||mesh.visible===false)continue;
  mesh.updateWorldMatrix(true,false);
  const attribute=mesh.geometry?.getAttribute('position');if(!attribute)continue;
  const e=mesh.matrixWorld.elements,positions=new Float32Array(attribute.count*3);
  for(let i=0;i<attribute.count;i++){
   const x=attribute.getX(i),y=attribute.getY(i),z=attribute.getZ(i),w=1/(e[3]*x+e[7]*y+e[11]*z+e[15]);
   positions[i*3]=(e[0]*x+e[4]*y+e[8]*z+e[12])*w;
   positions[i*3+1]=(e[1]*x+e[5]*y+e[9]*z+e[13])*w;
   positions[i*3+2]=(e[2]*x+e[6]*y+e[10]*z+e[14])*w;
   if(i%4096===0){if(!current())throw Error('Mapped pavement contact superseded');await yieldWork?.();}
  }
  const index=mesh.geometry.getIndex();
  sources.push({userData:{terrainMode:'at_grade'},geometry:{getAttribute:name=>name==='position'?{array:positions}:null,getIndex:()=>index}});
 }
 return sources;
}
