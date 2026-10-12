import {floorWalls,roomRing,pointInRoom,layoutEntrance} from '../../../functions/interior-layout.mjs';
import {finishGalleryArchitecture} from './gallery-finishes.js';

// Exhibition furniture shares the existing collision owner. Finish joinery
// follows compiled door openings and never substitutes display triangles for it.
export function addGalleryFixtures(T,sceneState,definition,createWallCollider){
  const content=definition.curatedContent;if(!content)return;
  const root=sceneState.group,base=sceneState.floorBaseY,center=sceneState.center,layout=definition.authoredLayout,floor=layout.floors[0];
  finishGalleryArchitecture(T,root,layout);
  const material=new T.MeshStandardMaterial({color:0x23342f,roughness:.75});
  const stone=new T.MeshStandardMaterial({color:0x8d897a,roughness:.8});
  const brass=new T.MeshStandardMaterial({color:0x9c7946,roughness:.45,metalness:.5});
  for(const mat of [material,stone,brass])mat.color.convertSRGBToLinear();
  const world=p=>({x:p.x+center.x,z:p.z+center.z});
  function block(placement,width,height,depth,y,mat){const mesh=new T.Mesh(new T.BoxGeometry(width,height,depth),mat);mesh.position.set(placement.x,y,placement.z);mesh.rotation.y=placement.yaw||0;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);return mesh;}
  function collision(p,width,depth,height){const dx=Math.cos(p.yaw||0)*width/2,dz=-Math.sin(p.yaw||0)*width/2,point=world(p);const collider=createWallCollider({x:point.x-dx,z:point.z-dz},{x:point.x+dx,z:point.z+dz},base,height,depth,.000001);if(collider)sceneState.dynamicColliders.push(collider);}
  function placard(title,subtitle,placement,width=1.35,y=1.22){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=320;
    const paint=canvas.getContext('2d');paint.fillStyle='#eee8da';paint.fillRect(0,0,1024,320);
    paint.fillStyle='#a18451';paint.fillRect(40,36,110,5);paint.fillStyle='#243e36';paint.font='500 42px Georgia,serif';paint.fillText(title,40,118,944);
    paint.font='25px sans-serif';paint.fillStyle='#34443f';paint.fillText(subtitle,40,183,944);
    paint.font='22px sans-serif';paint.fillStyle='#657069';paint.fillText('WORLD EXPLORER  /  COLLECTION STUDIES',40,264,944);
    const texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;texture.anisotropy=4;
    const mesh=new T.Mesh(new T.PlaneGeometry(width,width*320/1024),new T.MeshBasicMaterial({map:texture}));
    mesh.position.set(placement.x,y,placement.z);mesh.rotation.y=placement.yaw;mesh.userData.galleryLabelTexture=texture;root.add(mesh);
    // The print has a physical backing and frame, fixed against a wall or plinth.
    const back={...placement,x:placement.x-Math.sin(placement.yaw)*.026,z:placement.z-Math.cos(placement.yaw)*.026};
    block(back,width+.07,.035,.065,y-width*320/1024/2-.017,brass);block(back,width+.07,.035,.065,y+width*320/1024/2+.017,brass);
  }
  for(const placement of definition.exhibitPlacements){
    const exhibit=content.exhibits.find(e=>e.id===placement.id);
    if(exhibit.presentation==='sculpture'){
      // Reviewed normalized displays and proxy furniture use the same units.
      const width=Math.max(.85,exhibit.displayExtentMeters/(definition.galleryMetersPerUnit||1)),height=1.02;
      block(placement,width-.12,height-.06,width-.12,height/2,material);
      block(placement,width+.08,.065,width+.08,height,stone);
      block(placement,width+.02,.035,width+.02,.06,brass);
      collision(placement,width+.08,width+.08,height+.04);
      placard(exhibit.title,'Smithsonian Institution · digital specimen',{...placement,x:placement.x+Math.sin(placement.yaw)*(width/2+.055),z:placement.z+Math.cos(placement.yaw)*(width/2+.055)},Math.min(width*.92,1.5),.72);
    }else{
      placard('Vincent van Gogh · 1889','Wheat Field with Cypresses · The Metropolitan Museum of Art',placement,1.55,.78);
      const width=exhibit.displayExtentMeters/(definition.galleryMetersPerUnit||1),height=width*.784;
      // Thin walnut frame around the actual, licensed reproduction.
      const p={...placement,x:placement.x-Math.sin(placement.yaw)*.035,z:placement.z-Math.cos(placement.yaw)*.035};
      block(p,width+.12,height+.12,.05,1.2+height/2,brass);
    }
    sceneState.interactions.push({kind:'museum-exhibit',exhibitId:exhibit.id,level:0,...world(placement.approach),radius:1.6,label:`Inspect ${exhibit.title}`});
  }
  const entrance=layoutEntrance(layout),hall=entrance.room,ring=roomRing(floor,hall),entry=entrance.point;
  const wall=floorWalls(floor).filter(w=>w.rooms.includes(hall.id)&&!floor.doors.some(d=>d.wall===w.id)).sort((a,b)=>Math.hypot((b.a.x+b.b.x)/2-entry.x,(b.a.z+b.b.z)/2-entry.z)-Math.hypot((a.a.x+a.b.x)/2-entry.x,(a.a.z+a.b.z)/2-entry.z))[0];
  if(wall){
    const length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z),mx=(wall.a.x+wall.b.x)/2,mz=(wall.a.z+wall.b.z)/2,nx=-(wall.b.z-wall.a.z)/length,nz=(wall.b.x-wall.a.x)/length,sign=pointInRoom({x:mx+nx*.3,z:mz+nz*.3},ring)?1:-1,yaw=Math.atan2(nx*sign,nz*sign);
    const point=inset=>({x:mx+nx*sign*inset,z:mz+nz*sign*inset,yaw});
    placard('A closer look','Natural forms  ·  Landscape gallery  ·  Journal',point(.08),Math.min(2.15,length-.35),1.95);
    sceneState.interactions.push({kind:'museum-map',level:0,...world(point(1.55)),radius:1.5,label:`Gallery map · ${content.exhibits.length} exhibits`});
    const table=point(.5);collision(table,1.13,.71,.8);
    root.userData.galleryFurnishings=[{assetId:'workspace-table',...table}];
  }
  // A real licensed chair in each gallery; retain central sightlines and doors.
  for(const room of floor.rooms.filter(r=>r.type==='gallery')){
    const ring=roomRing(floor,room),roomWalls=floorWalls(floor).filter(w=>w.rooms.includes(room.id)&&w.rooms.length===1);
    const candidate=roomWalls.map(w=>{
      const x=(w.a.x+w.b.x)/2,z=(w.a.z+w.b.z)/2,length=Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z),nx=-(w.b.z-w.a.z)/length,nz=(w.b.x-w.a.x)/length,sign=pointInRoom({x:x+nx*.3,z:z+nz*.3},ring)?1:-1;
      return{x:x+nx*sign*.65,z:z+nz*sign*.65,yaw:Math.atan2(nx*sign,nz*sign)};
    }).find(p=>definition.exhibitPlacements.every(e=>Math.hypot(e.x-p.x,e.z-p.z)>2.5)&&floor.doors.every(d=>d.wall!==roomWalls.find(w=>Math.hypot((w.a.x+w.b.x)/2-p.x,(w.a.z+w.b.z)/2-p.z)<1)?.id));
    if(candidate){collision(candidate,.62,.62,1);(root.userData.galleryFurnishings||=[]).push({assetId:'workspace-chair',...candidate});}
  }
  sceneState.layoutKind='representative-gallery';root.name=`gallery:${content.id}`;
}
