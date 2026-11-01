const crypto=require('node:crypto');
const {FieldPath}=require('firebase-admin/firestore');
const {portalOwnerScope,normalizePortalAction,emptyPortalTrailState,validatePortalTrailState,applyPortalAction,
  normalizePortalGameVisit,applyPortalGameVisit,portalOffer,PORTAL_CATALOG}=require('./generated/portal.cjs');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

function buildPortalExports({functions,db,setCors,verifyAuth,verifyAppCheck,now=Date.now,catalog=PORTAL_CATALOG}){
  const region=functions.region('us-central1');
  const endpoint=work=>region.runWith({invoker:'public',timeoutSeconds:30,memory:'256MB'}).https.onRequest(async(req,res)=>{
    if(setCors(req,res))return;
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Buffer.byteLength(JSON.stringify(req.body))>4096)return res.status(400).json({error:'Invalid Portal request.'});
    const auth=await verifyAuth(req,res);if(!auth)return;
    if(req.body.expectedOwnerUid!==auth.uid)return res.status(409).json({error:'Account changed. Reopen your original Exploration Trail.'});
    if(!await verifyAppCheck(req,res))return;
    res.set('Cache-Control','private, no-store');
    try{return res.json(await work(auth.uid,req.body));}
    catch(error){if(!error.status&&!(error instanceof TypeError))console.error('[portal]',error.code||'request failed');
      return res.status(error.status||(error instanceof TypeError?400:503)).json({error:error.status||error instanceof TypeError?error.message:'Your Trail could not sync. Your saved choices are kept on this device.'});}
  });
  const mutate=(visit=false)=>endpoint(async(uid,body)=>{
    const action=visit?normalizePortalGameVisit(body.action):normalizePortalAction(body.action);
    const place=catalog.destinations.find(row=>row.id===action.destinationId);
    if(!place)throw fail(400,'This destination is not in the Portal catalog.');
    if(action.kind==='investigate'&&action.contentVersion!==place.learning.version)throw fail(409,'This investigation has been updated. Reopen it before marking it complete.');
    const fingerprint=hash(JSON.stringify(action));
    const profile=db.collection('explorerProfiles').doc(uid),trail=profile.collection('portalTrail').doc(action.destinationId);
    const receipt=profile.collection('portalOperations').doc(hash(action.operationId)),quota=profile.collection('portalLimits').doc('actions');
    const deletion=db.collection('captureAccountDeletions').doc(uid);
    return db.runTransaction(async tx=>{
      // Read all authority before writes. Receipt and state commit together.
      const [stored,previous,usage,deleted]=await Promise.all([tx.get(trail),tx.get(receipt),tx.get(quota),tx.get(deletion)]);
      if(deleted.exists)throw fail(409,'This account is being deleted.');
      const state=stored.exists?validatePortalTrailState(stored.data(),action.destinationId):emptyPortalTrailState(action.destinationId);
      if(previous.exists){if(previous.data().fingerprint!==fingerprint)throw fail(409,'This Portal action identifier was already used for a different choice.');
        return {ownerScope:portalOwnerScope(uid),operationId:action.operationId,state};}
      // The game reports an admitted presentation, not a trusted physical visit
      // or activity reward. A widget verb alone is never accepted as a visit.
      // Exact retries stay valid after qualification expires or the app updates.
      if(visit&&(action.createdAt>now()+300000||
        !portalOffer(place,catalog,{now:action.createdAt,deviceProfile:action.deviceProfile,evidenceId:action.qualificationId}).decision.eligible||
        action.destinationRevision!==place.destination.revision||action.contentVersion!==place.destination.contentVersion||
        action.arrivalMode!==place.destination.arrival.mode))throw fail(409,'This Portal world needs updated checks before a new visit can sync. Your local visit is kept.');
      const at=now(),prior=usage.data(),sameWindow=prior&&at>=prior.windowAt&&at-prior.windowAt<60000;
      const count=sameWindow?prior.count+1:1;if(count>120)throw fail(429,'Too many Portal changes. Your choices are saved locally; try sync again shortly.');
      const next=visit?applyPortalGameVisit(state,action,action.createdAt):applyPortalAction(state,action,at);next.revision=state.revision+1;
      tx.set(trail,next);tx.create(receipt,{fingerprint,destinationId:action.destinationId,acceptedAt:at,
        ...(visit?{evidenceClass:'client-admitted-virtual-presentation',qualificationId:action.qualificationId,worldRequestId:action.worldRequestId}:{})});
      tx.set(quota,{windowAt:sameWindow?prior.windowAt:at,count});
      return {ownerScope:portalOwnerScope(uid),operationId:action.operationId,state:next};
    });
  });
  const listPortalTrail=endpoint(async(uid,body)=>{
    const limit=body.limit===undefined?50:body.limit,after=body.after??null;
    if(!Number.isInteger(limit)||limit<1||limit>100||after!==null&&!/^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(after))throw fail(400,'Invalid Trail page.');
    const profile=db.collection('explorerProfiles').doc(uid);
    let query=profile.collection('portalTrail').orderBy(FieldPath.documentId());if(after)query=query.startAfter(after);
    const rows=await query.limit(limit+1).get();
    const items=rows.docs.slice(0,limit).map(doc=>validatePortalTrailState(doc.data(),doc.id));
    return {ownerScope:portalOwnerScope(uid),items,nextCursor:rows.docs.length>limit?items.at(-1).destinationId:null};
  });
  return {mutatePortalTrail:mutate(),confirmPortalVisit:mutate(true),listPortalTrail};
}
module.exports={buildPortalExports};
