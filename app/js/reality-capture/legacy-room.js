import {normalizeLayout,layoutRoomDescriptor,wallKey} from '../../../functions/interior-layout.mjs';
import {manualRoomFootprint} from '../../../functions/capture-room-geometry.mjs';
export function migrateLegacyRoom(capture,envelope){
  const previous=capture.hybridPreview;
  if(previous?.layout||!previous?.patches?.length)return null;
  const room=previous.room||capture.room,ring=manualRoomFootprint(room);
  if(room.cutouts?.length)throw Error('Keep this room in its existing editor to preserve its openings.');
  const bounds=points=>({x:(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,z:(Math.min(...points.map(p=>p.z))+Math.max(...points.map(p=>p.z)))/2});
  const a=bounds(ring),b=bounds(envelope.footprint),translated=ring.map(p=>({x:p.x+b.x-a.x,z:p.z+b.z-a.z}));
  const ids=ring.map((_,i)=>`legacy_v${i}`),floor={id:'legacy_floor',label:'Floor 1',elevation:0,height:room.heightMeters,slab:.15,vertices:Object.fromEntries(ids.map((id,i)=>[id,translated[i]])),rooms:[{id:'legacy_room',label:capture.room?.label||'Existing room',type:'room',vertices:ids}],doors:[]};
  const openings=room.openings||[{wall:0,offset:Math.hypot(ring[1].x-ring[0].x,ring[1].z-ring[0].z)/2,width:.9,height:Math.min(2.05,room.heightMeters)}];
  floor.doors=openings.map((o,i)=>({id:`legacy_door${i}`,wall:wallKey(ids[o.wall],ids[(o.wall+1)%ids.length]),offset:o.offset,width:o.width,height:o.height,entry:i===0}));
  const layout=normalizeLayout({schemaVersion:1,id:'legacy_home',floors:[floor],stairs:[]},envelope),surfaces=layoutRoomDescriptor(layout,'legacy_room').surfaceIds;
  return {layout,roomPhotos:[{roomId:'legacy_room',photoLabels:previous.photoLabels||{},patches:previous.patches.map(p=>({...p,surfaceId:surfaces[p.wall]}))}]};
}
