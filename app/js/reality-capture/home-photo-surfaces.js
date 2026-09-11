import {ROOM_PHOTO_SURFACE_INSET} from '../../../functions/capture-room-geometry.mjs';

// Also repairs approved derivatives generated before horizontal photo insets.
// Applying twice is safe; already inset surfaces retain their exact placement.
export function prepareHomePhotoSurfaces(root,layout){
  root.traverse(object=>{
    if(!object.isMesh||!object.geometry)return;
    object.geometry.computeBoundingBox();const box=object.geometry.boundingBox;
    if(!box||box.max.y-box.min.y>.0001)return;
    const y=box.min.y+object.position.y;
    for(const floor of layout?.floors||[]){
      for(const [kind,plane,sign] of [['floor',floor.elevation,1],['ceiling',floor.elevation+floor.height,-1]]){
        if(Math.abs(y-plane)<.001){object.position.y+=sign*ROOM_PHOTO_SURFACE_INSET;object.userData.kind=kind;object.userData.floorId=floor.id;return;}
        if(Math.abs(y-plane-sign*ROOM_PHOTO_SURFACE_INSET)<.001){object.userData.kind=kind;object.userData.floorId=floor.id;return;}
      }
    }
  });
  return root;
}
