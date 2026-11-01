// Render-only vertex splitting inside the existing road geometry owner.
// Triangle order, Float32 coordinates, colour and contact witnesses stay exact.
export const PAVEMENT_NORMAL_CREASE_RADIANS=Math.PI/9;
export function applyRoadCreaseNormals(geometry,angle=PAVEMENT_NORMAL_CREASE_RADIANS,T=globalThis.THREE){
 const p=geometry.attributes.position?.array,indices=geometry.getIndex()?.array;
 if(!p||!indices||!Number.isFinite(angle)||angle<=0||angle>Math.PI/2)throw Error('invalid_road_normal_crease');
 const heads=new Int32Array(p.length/3).fill(-1),next=[],sources=[],anchors=[],sums=[],rewritten=new Uint32Array(indices.length),cos=Math.cos(angle);
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2],
   nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,length=Math.hypot(nx,ny,nz),x=length?nx/length:0,y=length?ny/length:1,z=length?nz/length:0;
  for(let k=0;k<3;k++){
   const source=indices[i+k];let id=heads[source];
   while(id>=0&&anchors[id*3]*x+anchors[id*3+1]*y+anchors[id*3+2]*z<cos)id=next[id];
   if(id<0){id=sources.length;sources.push(source);next.push(heads[source]);heads[source]=id;anchors.push(x,y,z);sums.push(0,0,0);}
   rewritten[i+k]=id;sums[id*3]+=nx;sums[id*3+1]+=ny;sums[id*3+2]+=nz;
  }
 }
 for(const[name,attribute]of Object.entries(geometry.attributes)){
  if(name==='normal')continue;
  if(attribute.isInterleavedBufferAttribute||attribute.count!==p.length/3)throw Error('invalid_road_normal_attribute');
  const array=new attribute.array.constructor(sources.length*attribute.itemSize);
  for(let i=0;i<sources.length;i++)for(let k=0;k<attribute.itemSize;k++)array[i*attribute.itemSize+k]=attribute.array[sources[i]*attribute.itemSize+k];
  geometry.setAttribute(name,new T.BufferAttribute(array,attribute.itemSize,attribute.normalized));
 }
 const normals=new Float32Array(sources.length*3);
 for(let i=0;i<sources.length;i++){const j=i*3,n=Math.hypot(sums[j],sums[j+1],sums[j+2]);if(n){normals[j]=sums[j]/n;normals[j+1]=sums[j+1]/n;normals[j+2]=sums[j+2]/n;}else normals[j+1]=1;}
 geometry.setAttribute('normal',new T.BufferAttribute(normals,3));geometry.setIndex(new T.BufferAttribute(sources.length>65535?rewritten:Uint16Array.from(rewritten),1));
 return {sourceVertices:p.length/3,vertices:sources.length,triangles:indices.length/3};
}
