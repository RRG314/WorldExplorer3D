// Apply owned architectural maps after static batching. UVs express metres,
// avoiding one enormous stretched tile over a hangar or waterfront facade.
export function finishVenueSurface(T,root,material,url,tileMeters=3){
 if(typeof T.TextureLoader!=='function'||typeof globalThis.document?.createElementNS!=='function')return;
 let disposed=false;material.addEventListener('dispose',()=>{disposed=true;});
 const texture=new T.TextureLoader().load(new URL(url,import.meta.url).href,t=>{if(disposed)t.dispose();});
 texture.encoding=T.sRGBEncoding;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;material.map=texture;material.needsUpdate=true;
 root.traverse(mesh=>{
  if(mesh.material!==material||!mesh.geometry?.attributes.normal)return;
  const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){
   const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
   uv[i*2]=(nx>nz&&nx>ny?p.getZ(i):p.getX(i))/tileMeters;
   uv[i*2+1]=(ny>nx&&ny>nz?p.getZ(i):p.getY(i))/tileMeters;
  }
  mesh.geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
 });
}
