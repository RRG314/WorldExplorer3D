const crypto=require('node:crypto');
const {Timestamp}=require('firebase-admin/firestore');
const {PORTAL_NATIVE_CLIENTS,portalPairingId}=require('./generated/portal.cjs');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const digest=value=>crypto.createHash('sha256').update(value).digest('base64url');
const equals=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const verifier=value=>typeof value==='string'&&/^[A-Za-z0-9._~-]{43,128}$/.test(value);

// Exchange a PKCE-bound one-use approval for the EXISTING Firebase identity.
// SDKs own the resulting auth session. No widget token, cookie copying, custom
// identity database or credentials in callback URLs. These are HTTP POST APIs.
function buildPortalPairingExports({functions,db,projectId,setCors,verifyAuth,verifyAppCheck,getUser,createCustomToken,
  now=Date.now,randomId=()=>crypto.randomBytes(32).toString('base64url')}){
  const clients=PORTAL_NATIVE_CLIENTS[projectId]||{};
  const region=functions.region('us-central1');
  const pairing=id=>{if(!portalPairingId(id))throw fail(400,'Invalid device connection.');return db.collection('portalPairings').doc(id);};
  function valid(row){if(!row||!Number.isSafeInteger(row.expiresAt)||row.expiresAt<=now()||row.status==='cancelled')throw fail(410,'This device connection expired. Start again in the app.');return row;}
  function accountActive(auth){
    if(auth?.firebase?.sign_in_provider==='anonymous')throw fail(403,'Sign in to your Explorer account to connect a device.');
    if(!Number.isFinite(auth?.auth_time)||auth.auth_time*1000<now()-15*60000||auth.auth_time*1000>now()+60000)throw fail(401,'Sign in again to confirm this device.');
  }
  function proof(row,body,appId){
    valid(row);if(row.appId!==appId||!verifier(body.verifier)||!equals(digest(body.verifier),row.challenge)||
      !portalPairingId(body.code)||!equals(digest(body.code),row.codeHash))throw fail(403,'This connection does not match the app that requested it.');
    if(row.status!=='approved')throw fail(409,'This connection was already used or has not been approved.');
  }
  const endpoint=(native,work)=>region.runWith({invoker:'public',timeoutSeconds:30,memory:'256MB',maxInstances:4,
    ...(Object.keys(clients).length?{serviceAccount:`portal-pairing@${projectId}.iam.gserviceaccount.com`}:{})}).https.onRequest(async(req,res)=>{
    if(setCors(req,res))return;res.set('Cache-Control','private, no-store');
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Buffer.byteLength(JSON.stringify(req.body))>2048)return res.status(400).json({error:'Invalid device connection request.'});
    const check=await verifyAppCheck(req,res);if(!check)return;
    if(native&&!Object.hasOwn(clients,check.appId))return res.status(403).json({error:'Use a registered World Explorer native app to connect this device.'});
    let auth=null;if(!native){auth=await verifyAuth(req,res);if(!auth)return;if(req.body.expectedOwnerUid!==auth.uid)return res.status(409).json({error:'Account changed. Reopen this connection with your intended Explorer account.'});}
    try{return res.json(await work({body:req.body,appId:check.appId,client:clients[check.appId],auth,ip:req.ip||req.socket?.remoteAddress||'unknown'}));}
    catch(error){if(!error.status)console.error('[portal-pairing]',error.code||'request failed');return res.status(error.status||503).json({error:error.status?error.message:'The device could not connect. Your local choices are kept. Try again from the app.'});}
  });
  const startPortalPairing=endpoint(true,async({body,appId,client,ip})=>{
    if(!portalPairingId(body.challenge))throw fail(400,'A device connection requires a PKCE challenge.');
    const id=randomId(),ref=pairing(id),at=now(),expiresAt=at+10*60000;
    const quota=db.collection('portalPairingLimits').doc(digest(`${appId}:${ip}`));
    const verificationCode=String(crypto.createHash('sha256').update(body.challenge).digest().readUInt32BE(0)%100000000).padStart(8,'0');
    await db.runTransaction(async tx=>{
      const previous=(await tx.get(quota)).data(),same=previous&&at>=previous.windowAt&&at-previous.windowAt<600000;
      const count=same?previous.count+1:1;if(count>60)throw fail(429,'Too many device connection attempts. Try again shortly.');
      tx.create(ref,{appId,challenge:body.challenge,status:'pending',createdAt:at,expiresAt,verificationCode,deleteAfter:Timestamp.fromMillis(expiresAt)});
      tx.set(quota,{windowAt:same?previous.windowAt:at,count,deleteAfter:Timestamp.fromMillis(at+86400000)});
    });
    return {requestId:id,verificationCode,expiresAt,platform:client.platform};
  });
  const inspectPortalPairing=endpoint(false,async({body,auth})=>{
    if(auth.firebase?.sign_in_provider==='anonymous')throw fail(403,'Sign in to connect your Explorer account.');
    const ref=pairing(body.requestId),stored=await ref.get(),row=valid(stored.data()),client=clients[row.appId];
    if(!client)throw fail(410,'This app connection is no longer available.');
    if(row.approvedUid&&row.approvedUid!==auth.uid)throw fail(409,'A different Explorer account approved this connection. Start again in the app.');
    if(row.status==='consumed')throw fail(409,'This device connection has already been used. Return to the app.');
    return {requestId:body.requestId,label:client.label,platform:client.platform,verificationCode:row.verificationCode,expiresAt:row.expiresAt,status:row.status};
  });
  const approvePortalPairing=endpoint(false,async({body,auth})=>{
    accountActive(auth);
    if(!portalPairingId(body.codeHash)||typeof body.approvalId!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(body.approvalId))throw fail(400,'Invalid device approval.');
    const ref=pairing(body.requestId),deletion=db.collection('captureAccountDeletions').doc(auth.uid);
    return db.runTransaction(async tx=>{
      const [stored,deleted]=await Promise.all([tx.get(ref),tx.get(deletion)]);if(deleted.exists)throw fail(409,'This account is being deleted.');
      const row=valid(stored.data()),client=clients[row.appId];if(!client)throw fail(410,'This app connection is no longer available.');
      if(row.status==='approved'&&row.approvedUid===auth.uid&&equals(row.codeHash,body.codeHash)&&row.approvalId===body.approvalId)return {callback:client.callback,requestId:body.requestId};
      if(row.status!=='pending')throw fail(409,'This connection was already approved or used. Start again in the app.');
      tx.set(ref,{...row,status:'approved',approvedUid:auth.uid,approvedAt:now(),approvedAuthTime:auth.auth_time*1000,approvalId:body.approvalId,codeHash:body.codeHash});
      return {callback:client.callback,requestId:body.requestId};
    });
  });
  const claimPortalPairing=endpoint(true,async({body,appId})=>{
    const ref=pairing(body.requestId),row=(await ref.get()).data();proof(row,body,appId);
    const user=await getUser(row.approvedUid);
    if(user.disabled||Date.parse(user.tokensValidAfterTime||'1970-01-01')>row.approvedAuthTime)throw fail(401,'The account session changed. Start a new connection.');
    // Mint before the atomic consume. A signing failure leaves approval retryable;
    // concurrent claims may sign, but only one may return its token to a client.
    const customToken=await createCustomToken(row.approvedUid);
    await db.runTransaction(async tx=>{
      const [stored,deleted]=await Promise.all([tx.get(ref),tx.get(db.collection('captureAccountDeletions').doc(row.approvedUid))]);
      if(deleted.exists)throw fail(409,'This account is being deleted.');
      const live=stored.data();proof(live,body,appId);if(live.approvedUid!==row.approvedUid||live.approvalId!==row.approvalId)throw fail(409,'This device approval changed.');
      tx.set(ref,{...live,status:'consumed',consumedAt:now()});
    });
    return {ownerUid:row.approvedUid,customToken};
  });
  const cancelPortalPairing=endpoint(true,async({body,appId})=>{
    const ref=pairing(body.requestId);
    return db.runTransaction(async tx=>{
      const stored=await tx.get(ref);if(!stored.exists)return {cancelled:true};const row=stored.data();
      if(row.appId!==appId||!verifier(body.verifier)||!equals(digest(body.verifier),row.challenge))throw fail(403,'This connection belongs to another app.');
      if(row.status==='consumed')return {cancelled:false};tx.set(ref,{...row,status:'cancelled'});return {cancelled:true};
    });
  });
  const cancelPortalApproval=endpoint(false,async({body,auth})=>{
    if(auth.firebase?.sign_in_provider==='anonymous')throw fail(403,'Sign in to cancel this account connection.');
    const ref=pairing(body.requestId);
    return db.runTransaction(async tx=>{
      const stored=await tx.get(ref);if(!stored.exists)return {cancelled:true};const row=stored.data();
      if(row.approvedUid&&row.approvedUid!==auth.uid)throw fail(409,'A different Explorer account owns this approval.');
      if(row.status==='consumed')return {cancelled:false};
      tx.set(ref,{...row,status:'cancelled'});return {cancelled:true};
    });
  });
  return {startPortalPairing,inspectPortalPairing,approvePortalPairing,claimPortalPairing,cancelPortalPairing,cancelPortalApproval};
}
module.exports={buildPortalPairingExports};
