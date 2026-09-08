'use strict';
const {createHash}=require('node:crypto');
const {normalizeManualRoom,manualRoomFootprint}=require('./capture-room-geometry.mjs');
const {normalizeLayout,layoutRoomDescriptor}=require('./interior-layout.mjs');

function captureInteriorEnvelope(capture){
  const spatial=capture.building?.spatialContext||{};
  return {footprint:spatial.footprint,holes:spatial.holes||[],heightMeters:spatial.wallHeightMeters||spatial.height?.meters||3,revision:footprintSignature(capture.building,capture.room)};
}

// Firestore cannot store arrays of arrays. Keep the editor's coordinate pairs
// at the API boundary, but persist each corner as a named point.
function encodeHybridPreview(preview) {
  if(!preview)return null;
  return {...preview,...(preview.roomPhotos?{roomPhotos:preview.roomPhotos.map(encodeHybridPreview)}:{}),patches:(preview.patches||[]).map(p=>({...p,quad:p.quad.map(q=>Array.isArray(q)?{x:q[0],y:q[1]}:q)}))};
}
function decodeHybridPreview(preview) {
  if(!preview)return null;
  return {...preview,...(preview.roomPhotos?{roomPhotos:preview.roomPhotos.map(decodeHybridPreview)}:{}),patches:(preview.patches||[]).map(p=>({...p,quad:p.quad.map(q=>Array.isArray(q)?q:[q.x,q.y])}))};
}

function footprintSignature(building, room = null) {
  return createHash('sha256').update(JSON.stringify({authority:building?.sourceAuthority,id:building?.sourceBuildingId,footprint:building?.spatialContext?.footprint,...(room?{manualRoom:normalizeManualRoom(room)}:{})})).digest('hex');
}

function normalizeHybridPreview(capture, input) {
  const isRoom=capture.captureKind==='interior_room';
  if(capture.captureKind!=='exterior'&&!isRoom) throw Error('hybrid_exterior_required');
  if(isRoom&&capture.consent?.propertyPermissionConfirmed!==true)throw Error('interior_permission_confirmation_required');
  if(isRoom&&input?.layout){
    if(input.footprintSignature!==footprintSignature(capture.building,capture.room))throw Error('hybrid_footprint_changed');
    if(!Number.isInteger(input.baseRevision)||input.baseRevision!==(capture.hybridPreview?.revision||0))throw Error('hybrid_state_transition_conflict');
    const layout=normalizeLayout(input.layout,captureInteriorEnvelope(capture));
    const entries=input.roomPhotos??decodeHybridPreview(capture.hybridPreview)?.roomPhotos??[];
    if(!Array.isArray(entries)||entries.length>64||entries.reduce((n,e)=>n+(e.patches?.length||0),0)>128)throw Error('home_photo_budget_exceeded');
    const roomIds=new Set();
    const roomPhotos=entries.map(entry=>{
      if(roomIds.has(entry.roomId))throw Error('duplicate_room_photos');roomIds.add(entry.roomId);
      const room=layoutRoomDescriptor(layout,entry.roomId),pseudo={...capture,room,hybridPreview:null};
      const patches=(entry.patches||[]).map(p=>{const wall=room.surfaceIds.indexOf(p.surfaceId);if(wall<0)throw Error('A photographed wall changed. Remove its placement before changing that wall; original photos remain saved.');return {...p,wall};});
      const normalized=normalizeHybridPreview(pseudo,{room,baseRevision:0,footprintSignature:footprintSignature(capture.building,room),heightMeters:room.heightMeters,roofShape:'flat',roofRiseMeters:2,patches});
      return {roomId:entry.roomId,patches:normalized.patches.map(p=>({...p,surfaceId:room.surfaceIds[p.wall]}))};
    });
    return {schemaVersion:1,kind:'home-layout',revision:input.baseRevision+1,footprintSignature:input.footprintSignature,layout,patches:[],roomPhotos,visibility:'PRIVATE',coverageVerified:false,envelopeEvidence:'capture-snapshot-unverified'};
  }
  const room=isRoom?normalizeManualRoom(input.room||capture.room):null;
  const footprint=isRoom?manualRoomFootprint(room):capture.building?.spatialContext?.footprint;
  if(!Array.isArray(footprint)||footprint.length<3) throw Error('mapped_footprint_required');
  if(input?.footprintSignature!==footprintSignature(capture.building,isRoom?capture.room:null)) throw Error('hybrid_footprint_changed');
  if(!Number.isInteger(input.baseRevision)||input.baseRevision!==(capture.hybridPreview?.revision||0)) throw Error('hybrid_state_transition_conflict');
  if(typeof input.heightMeters!=='number'||!Number.isFinite(input.heightMeters)||input.heightMeters<1||input.heightMeters>1200) throw Error('invalid_hybrid_height');
  const roofShape=input.roofShape||'unknown',roofRiseMeters=input.roofRiseMeters??2;
  if(!['unknown','flat','gabled','hipped'].includes(roofShape)||typeof roofRiseMeters!=='number'||!Number.isFinite(roofRiseMeters)||roofRiseMeters<.3||roofRiseMeters>20)throw Error('invalid_hybrid_roof');
  if(!Array.isArray(input.patches)||input.patches.length>16) throw Error('invalid_hybrid_patches');
  const prefix=`reality-captures/${capture.ownerUid}/${capture.captureId}/originals/`;
  const photos=new Map((capture.inputManifest||[]).filter(p=>p.name?.startsWith(prefix)).map(p=>[p.name.slice(prefix.length).split('.')[0],p]));
  const closed=footprint[0].x===footprint.at(-1).x&&footprint[0].z===footprint.at(-1).z;
  const wallCount=isRoom?footprint.length+2:footprint.length-(closed?1:0), ids=new Set();
  const patches=input.patches.map(p=>{
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(p.id)||ids.has(p.id)) throw Error('invalid_hybrid_patch_id'); ids.add(p.id);
    const photo=photos.get(p.photoId);
    if(!photo||!photo.generation) throw Error('validated_hybrid_photo_required');
    if(!Number.isInteger(p.wall)||p.wall<0||p.wall>=wallCount) throw Error('invalid_hybrid_wall');
    if(!Array.isArray(p.region)||p.region.length!==4||p.region.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)||p.region[2]-p.region[0]<.01||p.region[3]-p.region[1]<.01) throw Error('invalid_hybrid_region');
    if(!Array.isArray(p.quad)||p.quad.length!==4||p.quad.some(q=>!Array.isArray(q)||q.length!==2||q.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))) throw Error('invalid_hybrid_quad');
    for(let i=0;i<4;i++){const a=p.quad[i],b=p.quad[(i+1)%4],c=p.quad[(i+2)%4];if((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])<.0001)throw Error('invalid_hybrid_quad');}
    return {id:p.id,photoId:p.photoId,photoGeneration:String(photo.generation),wall:p.wall,region:p.region.map(Number),quad:p.quad.map(q=>q.map(Number)),evidence:'photo-projected-user-alignment'};
  });
  return {schemaVersion:1,...(isRoom?{kind:'room-patches',room}:{}),revision:input.baseRevision+1,footprintSignature:input.footprintSignature,heightMeters:room?.heightMeters||input.heightMeters,heightEvidence:'user-preview-unverified',roofShape:isRoom?'flat':roofShape,roofRiseMeters,patches,visibility:'PRIVATE',coverageVerified:false};
}
module.exports={footprintSignature,normalizeHybridPreview,encodeHybridPreview,decodeHybridPreview,captureInteriorEnvelope};
