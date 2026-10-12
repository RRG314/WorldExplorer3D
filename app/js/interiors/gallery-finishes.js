import {floorWalls,roomRing,pointInRoom} from '../../../functions/interior-layout.mjs';

// Finishes follow the accepted wall solids, including their door cuts. They do
// not introduce another floor, navigation mesh, renderer or lighting authority.
export function finishGalleryArchitecture(T,root,layout){
  const textures=new Set(),batches=new Map();let disposed=false;
  root.userData.releaseGalleryTextures=()=>{disposed=true;for(const t of textures)t.dispose();textures.clear();};
  const timber=new T.TextureLoader().load('/app/assets/textures/facades/japanese_cedar_planks-diffuse-1k.webp',t=>{if(disposed)t.dispose();});
  timber.encoding=T.sRGBEncoding;timber.wrapS=timber.wrapT=T.RepeatWrapping;timber.repeat.set(1/1.6,1/1.6);timber.anisotropy=4;textures.add(timber);
  const floorMaterial=new T.MeshStandardMaterial({map:timber,color:0x796d61,roughness:.68,side:T.DoubleSide});
  const plaster=new T.MeshStandardMaterial({color:0x858c82,roughness:.96,side:T.DoubleSide});
  const ceiling=new T.MeshStandardMaterial({color:0xa6a398,roughness:.95,side:T.DoubleSide});
  const moulding=new T.MeshStandardMaterial({color:0xb4ab98,roughness:.78});
  const dado=new T.MeshStandardMaterial({color:0x394743,roughness:.8});
  const bronze=new T.MeshStandardMaterial({color:0x78684b,metalness:.55,roughness:.42});
  const black=new T.MeshStandardMaterial({color:0x161b1c,roughness:.56,metalness:.25});
  const diffuser=new T.MeshBasicMaterial({color:0xffe5b0,toneMapped:false});
  // r128 material colors are linear; these authored paint swatches are sRGB.
  for(const mat of [plaster,ceiling,moulding,dado,bronze,black])mat.color.convertSRGBToLinear();
  root.children.filter(o=>o.isHemisphereLight).forEach(light=>{light.color.setHex(0xfff3de);light.groundColor.setHex(0x726959);light.intensity=.72;});
  const oldMaterials=new Set();
  root.traverse(o=>{if(!o.isMesh)return;const kind=o.userData.kind;if(!['floor','wall','ceiling','door-frame'].includes(kind))return;
    oldMaterials.add(o.material);o.material=kind==='door-frame'?moulding:kind==='floor'?floorMaterial:kind==='wall'?plaster:ceiling;o.receiveShadow=true;o.castShadow=kind==='wall';
  });oldMaterials.forEach(m=>m.dispose());
  // Batch repeated joinery and light housings into one draw per material.
  const box=(material,x,y,z,w,h,d,yaw=0)=>{if(!batches.has(material))batches.set(material,[]);batches.get(material).push({x,y,z,w,h,d,yaw});};
  const walls=root.children.filter(o=>o.userData.kind==='wall');
  for(const wall of walls){
    const {width,height,depth}=wall.geometry.parameters,bottom=wall.position.y-height/2,top=wall.position.y+height/2;
    if(bottom<.01){
      box(dado,wall.position.x,.47,wall.position.z,width,.94,depth+.045,wall.rotation.y);
      box(moulding,wall.position.x,.12,wall.position.z,width,.24,depth+.10,wall.rotation.y);
      box(moulding,wall.position.x,.98,wall.position.z,width,.065,depth+.10,wall.rotation.y);
      const count=Math.floor(width/1.2);
      for(let i=0;i<count;i++){
        const x=(i+.5)*width/count-width/2;
        box(moulding,wall.position.x+Math.cos(wall.rotation.y)*x,.55,wall.position.z-Math.sin(wall.rotation.y)*x,.026,.58,depth+.055,wall.rotation.y);
      }
    }
    box(moulding,wall.position.x,top-.08,wall.position.z,width,.16,depth+.24,wall.rotation.y);
    box(moulding,wall.position.x,top-.2,wall.position.z,width,.06,depth+.14,wall.rotation.y);
  }
  const floor=layout.floors[0];
  for(const door of floor.doors){
    const wall=floorWalls(floor).find(w=>w.id===door.wall),length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z),dx=(wall.b.x-wall.a.x)/length,dz=(wall.b.z-wall.a.z)/length,yaw=-Math.atan2(dz,dx);
    const x=wall.a.x+dx*door.offset,z=wall.a.z+dz*door.offset;
    box(bronze,x,.007,z,door.width,.012,.16,yaw);
  }
  for(const room of floor.rooms){
    const ring=roomRing(floor,room),x=ring.reduce((n,p)=>n+p.x,0)/ring.length,z=ring.reduce((n,p)=>n+p.z,0)/ring.length;
    const wall=floorWalls(floor).filter(w=>w.rooms.includes(room.id)).sort((a,b)=>Math.hypot(b.b.x-b.a.x,b.b.z-b.a.z)-Math.hypot(a.b.x-a.a.x,a.b.z-a.a.z))[0];
    const yaw=-Math.atan2(wall.b.z-wall.a.z,wall.b.x-wall.a.x),len=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z)*.68;
    box(black,x,floor.height-.18,z,len,.05,.065,yaw);
    const count=room.type==='hall'?3:4;
    for(let i=0;i<count;i++){
      const t=(i/(count-1)-.5)*len,px=x+Math.cos(yaw)*t,pz=z-Math.sin(yaw)*t;
      box(bronze,px,floor.height-.27,pz,.18,.16,.18,yaw);
      box(diffuser,px,floor.height-.36,pz,.15,.025,.15,yaw);
    }
    // A bounded diffuse fill per room keeps circulation readable. Exhibit
    // projectors are aimed separately at the actual reviewed placements.
    const fill=new T.PointLight(0xfff0dc,80,22,2);
    fill.position.set(x,floor.height-.4,z);root.add(fill);
    // Plaster ceiling perimeter bands preserve readable room proportions.
    for(const w of floorWalls(floor).filter(w=>w.rooms.includes(room.id))){
      const l=Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z),nx=-(w.b.z-w.a.z)/l,nz=(w.b.x-w.a.x)/l,mx=(w.a.x+w.b.x)/2,mz=(w.a.z+w.b.z)/2;
      const sign=pointInRoom({x:mx+nx*.3,z:mz+nz*.3},ring)?1:-1;
      box(moulding,mx+nx*sign*.35,floor.height-.028,mz+nz*sign*.35,Math.max(.1,l-.65),.04,.075,-Math.atan2(w.b.z-w.a.z,w.b.x-w.a.x));
    }
  }
  const geometry=new T.BoxGeometry(1,1,1),matrix=new T.Matrix4(),q=new T.Quaternion();
  for(const [material,items]of batches){const mesh=new T.InstancedMesh(geometry,material,items.length);mesh.name='museum-architectural-finish';items.forEach((b,i)=>{q.setFromAxisAngle(new T.Vector3(0,1,0),b.yaw);matrix.compose(new T.Vector3(b.x,b.y,b.z),q,new T.Vector3(b.w,b.h,b.d));mesh.setMatrixAt(i,matrix);});mesh.instanceMatrix.needsUpdate=true;root.add(mesh);}
  return {timber,textures,materials:{floor:floorMaterial,plaster,ceiling,moulding,dado,bronze,black},box};
}

export function releaseGalleryTextures(root){
  root?.userData?.releaseGalleryTextures?.();
  delete root?.userData?.releaseGalleryTextures;
  root?.traverse(o=>{if(o.isLight&&o.shadow){o.shadow.map?.dispose();o.shadow.mapPass?.dispose();}if(o.userData?.galleryLabelTexture){o.userData.galleryLabelTexture.dispose();delete o.userData.galleryLabelTexture;}});
}
