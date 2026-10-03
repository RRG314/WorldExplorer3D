// Original game lobby dressing, not a representation of the real visitor centre.
export const HARBOR_WAYPOINT_BUILDING = 'overture:7c6e93c4-99cb-443f-a165-f9f79f5c1732';
export function isHarborWaypoint(definition){return String(definition?.building?.sourceBuildingId || definition?.key || '')===HARBOR_WAYPOINT_BUILDING;}
export function dressHarborWaypoint({THREE,group,footprint,center,floorY,wallHeight,entry,roomMaterial,corridorMaterial,wallMaterial,accentWallMaterial}) {
 wallMaterial.color.setHex(0xe1d7c2);accentWallMaterial.color.setHex(0x577477);roomMaterial.color.setHex(0xb5a78c);corridorMaterial.color.setHex(0x897b64);
 if(typeof document==='undefined')return;
 const tile=document.createElement('canvas');tile.width=tile.height=256;const t=tile.getContext('2d');t.fillStyle='#a99c83';t.fillRect(0,0,256,256);t.strokeStyle='#8c806c';t.lineWidth=2;for(let k=0;k<=256;k+=64){t.beginPath();t.moveTo(k,0);t.lineTo(k,256);t.moveTo(0,k);t.lineTo(256,k);t.stroke()}
 const floorMap=new THREE.CanvasTexture(tile);floorMap.wrapS=floorMap.wrapT=THREE.RepeatWrapping;floorMap.encoding=THREE.sRGBEncoding;roomMaterial.map=floorMap;roomMaterial.color.setHex(0xffffff);roomMaterial.needsUpdate=true;
 group.userData.ownedInteriorTextures=[floorMap];
 const panels=[['INNER HARBOR','EXPLORER WAYPOINT','Start the promenade walk in Activities.','Follow the waterfront past the museum ship.','Return here to plan your next outing.'],['EXPLORE WITH PURPOSE','YOUR NEXT JOURNEY','EARTH · Walk, drive and discover places.','OCEAN · Board, dive and survey marine life.','SPACE · Choose a course and explore a world.']];
 const edges=footprint.map((a,i)=>{const b=footprint[(i+1)%footprint.length],x=(a.x+b.x)/2,z=(a.z+b.z)/2;return {a,b,x,z,length:Math.hypot(b.x-a.x,b.z-a.z),distance:Math.hypot(x-entry.x,z-entry.z)}}).filter(e=>e.length>5).sort((a,b)=>a.distance-b.distance).slice(0,2);
 edges.forEach((edge,index)=>{
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=640;const c=canvas.getContext('2d');c.fillStyle='#143e49';c.fillRect(0,0,1024,640);c.fillStyle='#c2a775';c.fillRect(48,48,120,8);c.fillStyle='#e5dcc8';c.font='bold 26px sans-serif';c.fillText(panels[index][1],48,112);c.fillStyle='#ffffff';c.font='bold 62px sans-serif';c.fillText(panels[index][0],48,206);c.font='29px sans-serif';panels[index].slice(2).forEach((line,i)=>c.fillText(line,48,305+i*68));c.fillStyle='#b8cbd0';c.font='22px sans-serif';c.fillText('Original game interior · not a surveyed reconstruction',48,576);
  const texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;group.userData.ownedInteriorTextures.push(texture);
  let nx=-(edge.b.z-edge.a.z)/edge.length,nz=(edge.b.x-edge.a.x)/edge.length;if(nx*(center.x-edge.x)+nz*(center.z-edge.z)<0){nx=-nx;nz=-nz}
  const width=Math.min(5,edge.length-2),height=Math.min(width*.625,wallHeight-.5);const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture}));mesh.position.set(edge.x+nx*.17,floorY+wallHeight*.5,edge.z+nz*.17);mesh.rotation.y=Math.atan2(nx,nz);mesh.name='Harbor game orientation panel';group.add(mesh);
 });
}
