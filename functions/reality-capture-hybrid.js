'use strict';
const {createHash}=require('node:crypto');

function footprintSignature(building) {
  return createHash('sha256').update(JSON.stringify({authority:building?.sourceAuthority,id:building?.sourceBuildingId,footprint:building?.spatialContext?.footprint})).digest('hex');
}

function normalizeHybridPreview(capture, input) {
  if(capture.captureKind!=='exterior') throw Error('hybrid_exterior_required');
  const footprint=capture.building?.spatialContext?.footprint;
  if(!Array.isArray(footprint)||footprint.length<3) throw Error('mapped_footprint_required');
  if(input?.footprintSignature!==footprintSignature(capture.building)) throw Error('hybrid_footprint_changed');
  if(!Number.isInteger(input.baseRevision)||input.baseRevision!==(capture.hybridPreview?.revision||0)) throw Error('hybrid_state_transition_conflict');
  if(typeof input.heightMeters!=='number'||!Number.isFinite(input.heightMeters)||input.heightMeters<1||input.heightMeters>1200) throw Error('invalid_hybrid_height');
  const roofShape=input.roofShape||'unknown',roofRiseMeters=input.roofRiseMeters??2;
  if(!['unknown','flat','gabled','hipped'].includes(roofShape)||typeof roofRiseMeters!=='number'||!Number.isFinite(roofRiseMeters)||roofRiseMeters<.3||roofRiseMeters>20)throw Error('invalid_hybrid_roof');
  if(!Array.isArray(input.patches)||input.patches.length>16) throw Error('invalid_hybrid_patches');
  const prefix=`reality-captures/${capture.ownerUid}/${capture.captureId}/originals/`;
  const photos=new Map((capture.inputManifest||[]).filter(p=>p.name?.startsWith(prefix)).map(p=>[p.name.slice(prefix.length).split('.')[0],p]));
  const closed=footprint[0].x===footprint.at(-1).x&&footprint[0].z===footprint.at(-1).z;
  const wallCount=footprint.length-(closed?1:0), ids=new Set();
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
  return {schemaVersion:1,revision:input.baseRevision+1,footprintSignature:input.footprintSignature,heightMeters:input.heightMeters,heightEvidence:'user-preview-unverified',roofShape,roofRiseMeters,patches,visibility:'PRIVATE',coverageVerified:false};
}
module.exports={footprintSignature,normalizeHybridPreview};
