'use strict';
const {stableId}=require('./reality-capture-authority');

// Called before Auth deletion. The durable tombstone makes retries safe and
// blocks new contributions while cleanup is incomplete. Installed exteriors
// are withdrawn before their media is removed; procedural buildings remain.
async function cleanupCaptureAccount({db,bucket,uid,FieldValue}) {
  if(!uid||uid.includes('/'))throw Error('invalid_account_identity');
  const job=db.collection('captureAccountDeletions').doc(uid);
  await job.set({status:'deleting',updatedAt:FieldValue.serverTimestamp()},{merge:true});
  for(;;){
    const page=await db.collection('realityCaptures').where('ownerUid','==',uid).limit(100).get();
    if(page.empty)break;
    for(const row of page.docs){
      const ref=db.collection('realityCaptures').doc(row.id);
      await db.runTransaction(async tx=>{
        const current=await tx.get(ref);if(!current.exists)return;
        if(current.data().ownerUid!==uid)throw Error('capture_owner_changed');
        const publications=await tx.get(db.collection('buildingRepresentations').where('captureId','==',row.id));
        const building=current.data().building?.sourceBuildingId;
        const manifestRef=building?db.collection('buildingPatchManifests').doc(stableId('building-patches',building)):null;
        const manifest=manifestRef?await tx.get(manifestRef):null;
        tx.update(ref,{status:'deleting',updatedAt:FieldValue.serverTimestamp()});
        for(const publication of publications.docs)tx.delete(db.collection('buildingRepresentations').doc(publication.id));
        if(manifest?.exists)tx.update(manifestRef,{regions:(manifest.data().regions||[]).filter(r=>r.captureId!==row.id),updatedAt:FieldValue.serverTimestamp()});
      });
      const [files]=await bucket.getFiles({prefix:`reality-captures/${uid}/${row.id}/`,versions:true});
      for(const file of files)await file.delete({ignoreNotFound:true});
      await db.recursiveDelete(ref);
    }
  }
  for(;;){
    const spaces=await db.collection('privateSpaces').where('ownerUid','==',uid).limit(100).get();if(spaces.empty)break;
    for(const row of spaces.docs){
      const requests=await db.collection('privateSpaceAccessRequests').where('spaceId','==',row.id).get();
      for(const request of requests.docs)await db.collection('privateSpaceAccessRequests').doc(request.id).delete();
      await db.recursiveDelete(db.collection('privateSpaces').doc(row.id));
    }
  }
  for(const group of ['members','sessionGrants','oneTimeGrants']){
    const grants=await db.collectionGroup(group).where('uid','==',uid).get();
    for(const row of grants.docs)if(row.ref.path.startsWith('privateSpaces/'))await row.ref.delete();
  }
  for(const field of ['ownerUid','requesterUid']){
    const requests=await db.collection('privateSpaceAccessRequests').where(field,'==',uid).get();
    for(const row of requests.docs)await row.ref.delete();
  }
  // Include abandoned upload objects whose capture record was already removed.
  const [remaining]=await bucket.getFiles({prefix:`reality-captures/${uid}/`,versions:true});
  for(const file of remaining)await file.delete({ignoreNotFound:true});
  await db.collection('captureAdmission').doc(uid).delete();
  await job.set({status:'complete',updatedAt:FieldValue.serverTimestamp()},{merge:true});
}
module.exports={cleanupCaptureAccount};
