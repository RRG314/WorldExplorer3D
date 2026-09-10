// Presentation only: the backend remains the owner of permissions and lifecycle.
export function captureWorkflow(capture={}){
  if(capture.continuationReady===false)return {title:'Preparing editable version',home:capture.captureKind==='interior_room',note:'',privacy:'Private draft',next:'Your submitted version is safe. Return to that version and choose Continue improving to resume copying your photos.'};
  const home=capture.captureKind==='interior_room',submission=capture.hybridSubmission;
  const draftRevision=capture.hybridPreview?.revision||0,submittedRevision=submission?.revision||0;
  const changed=draftRevision>submittedRevision;
  const state=capture.status||'draft';
  const reviewed=submission?.status||state;
  const title=changed&&submittedRevision?'Draft changes':reviewed==='approved'?(home?'Approved interior':capture.publicContributionRequested?'Published exterior':'Approved exterior'):reviewed==='rejected'?'Changes requested':reviewed==='review_required'?'Awaiting review':state==='queued'||state==='processing'?'Reconstruction processing':state==='processing_failed'?'Needs attention':state==='uploaded'?'Ready to edit':'Draft';
  return {title,home,changed,revision:draftRevision,submittedRevision,
    note:capture.review?.note||'',
    privacy:home?(capture.accessMode==='PUBLIC'&&reviewed==='approved'?'Public interior':capture.publicContributionRequested?'Public access requested · approval required':'Private interior'):'Source photos stay private',
    next:reviewed==='rejected'?'Read the reviewer’s note, edit your contribution, then submit the corrected version.':changed&&submittedRevision?'Your previous submitted version is unchanged. Submit this draft when ready.':reviewed==='approved'?'View the result or continue improving this building.':reviewed==='review_required'?'Your submission was received. You can leave and return to this building later.':'Edit and save your contribution, then preview it before submitting.'};
}
export function groupCaptureBuildings(captures){
  const groups=new Map();
  for(const capture of captures){const b=capture.building||{},key=JSON.stringify([b.worldId,b.sourceBuildingId]);if(!groups.has(key))groups.set(key,{key,building:b,captures:[]});groups.get(key).captures.push(capture);}
  return [...groups.values()].map(group=>({...group,captures:group.captures.sort((a,b)=>(b.updatedAtMs||0)-(a.updatedAtMs||0))}));
}
export function captureLabel(capture){const s=captureWorkflow(capture),roomLabel=capture.hybridPreview?.layout?.unitLabel||capture.room?.label;return `${capture.building?.label||'Mapped building'} · ${s.home?`Interior${roomLabel?` · ${roomLabel}`:''}`:'Exterior'} · ${s.title}`;}
