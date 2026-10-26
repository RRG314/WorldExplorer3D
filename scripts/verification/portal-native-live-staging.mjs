// Real staging Auth/App Check/Firestore/signing journey. No production writes,
// mail, Hosting bypass or user account changes. Temporary identities are owned.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const project='we3d-staging-20260712',number='524178734996';
process.env.GOOGLE_CLOUD_QUOTA_PROJECT=project;
const cli=createRequire('/opt/homebrew/lib/node_modules/firebase-tools/package.json');
const auth=cli('./lib/auth'),{requireAuth}=cli('./lib/requireAuth'),{Client}=cli('./lib/apiv2');
const actor=auth.getGlobalDefaultAccount();await requireAuth({project,user:actor?.user,tokens:actor?.tokens});
const cloud=prefix=>new Client({urlPrefix:prefix,auth:true});
const apps=cloud('https://firebase.googleapis.com'),checks=cloud('https://firebaseappcheck.googleapis.com');
const identities=cloud('https://identitytoolkit.googleapis.com'),firestore=cloud('https://firestore.googleapis.com');
const webApp='1:524178734996:web:f59acbc9014f0e26f51981',nativeApp='1:524178734996:android:b6c8ac1247bbf6f3f51981';
const folder='output/research/vr-portal-product-2026-10-25/',root='/v1/projects/'+project+'/databases/(default)/documents';
const temporaryChecks=[],pairings=[],receipts=[];let uid=null,failure=null;
const digest=value=>createHash('sha256').update(value).digest('base64url');
const opaque=()=>randomBytes(32).toString('base64url');
async function json(url,body,headers={}){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
  const text=await response.text();if(text.length>262144)throw Error('Oversized service response.');return {status:response.status,body:JSON.parse(text)};
}
async function attestation(app,key){
  const token=randomUUID(),parent='/v1/projects/'+number+'/apps/'+app;
  const {body}=await checks.post(parent+'/debugTokens',{displayName:'Disposable Portal native live verification',token});temporaryChecks.push(body.name);
  const result=await json('https://firebaseappcheck.googleapis.com'+parent+':exchangeDebugToken?key='+encodeURIComponent(key),{debugToken:token});assert.equal(result.status,200,'Staging debug attestation exchange failed.');return result.body.token;
}
async function invoke(name,body,check,bearer){
  return json('https://us-central1-'+project+'.cloudfunctions.net/'+name,body,{
    Origin:'https://'+project+'.web.app',...(check?{'X-Firebase-AppCheck':check}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})});
}
async function removeDocument(path){try{await firestore.delete(root+'/'+path);}catch(error){if(error.status!==404)throw error;}}
try{
  const config=JSON.parse(await readFile('config/firebase.staging.json','utf8'));
  const webKey=JSON.stringify(config).match(/AIza[A-Za-z0-9_-]{35}/)?.[0];assert.ok(webKey,'Staging public client configuration unavailable.');
  const {body:nativeConfig}=await apps.get('/v1beta1/projects/-/androidApps/'+nativeApp+'/config');
  const native=JSON.parse(Buffer.from(nativeConfig.configFileContents,'base64').toString()).client.find(row=>row.client_info.mobilesdk_app_id===nativeApp);
  const [webProof,nativeProof]=[await attestation(webApp,webKey),await attestation(nativeApp,native.api_key[0].current_key)];
  const email='qa-portal-'+randomUUID()+'@example.invalid',password=opaque();
  uid=(await identities.post('/v1/projects/'+project+'/accounts',{email,password,emailVerified:true,displayName:'Disposable Portal verification'})).body.localId;
  assert.ok(uid,'Temporary identity was not created.');
  const login=await json('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(webKey),{email,password,returnSecureToken:true});
  assert.equal(login.status,200,'Existing email/password provider failed.');assert.equal(login.body.localId,uid);const browserToken=login.body.idToken;
  const verifier=opaque(),challenge=digest(verifier);
  assert.equal((await invoke('startPortalPairing',{challenge},null)).status,401,'Native pairing accepted missing attestation.');
  assert.equal((await invoke('startPortalPairing',{challenge},webProof)).status,403,'Web app impersonated a native client.');
  const start=await invoke('startPortalPairing',{challenge},nativeProof);assert.equal(start.status,200,'Registered native proof was rejected.');
  const requestId=start.body.requestId;pairings.push(requestId);assert.match(start.body.verificationCode,/^[0-9]{8}$/);
  const inspect=await invoke('inspectPortalPairing',{requestId,expectedOwnerUid:uid},webProof,browserToken);assert.equal(inspect.status,200);assert.equal(inspect.body.verificationCode,start.body.verificationCode);
  const code=opaque(),approvalId=randomUUID();const approval=await invoke('approvePortalPairing',{requestId,expectedOwnerUid:uid,approvalId,codeHash:digest(code)},webProof,browserToken);
  assert.equal(approval.status,200,'Recent browser identity could not approve.');assert.equal(approval.body.callback,'io.worldexplorer3d.app.staging://portal-connect');
  assert.equal((await invoke('claimPortalPairing',{requestId,verifier:opaque(),code},nativeProof)).status,403);
  const claim=await invoke('claimPortalPairing',{requestId,verifier,code},nativeProof);assert.equal(claim.status,200,'Live dedicated signing/consume failed.');assert.equal(claim.body.ownerUid,uid);
  assert.equal((await invoke('claimPortalPairing',{requestId,verifier,code},nativeProof)).status,409,'Consumed approval replay succeeded.');
  const nativeLogin=await json('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key='+encodeURIComponent(native.api_key[0].current_key),{token:claim.body.customToken,returnSecureToken:true});
  assert.equal(nativeLogin.status,200,'The signed custom token could not authenticate.');const nativeToken=nativeLogin.body.idToken;
  // Custom-token REST responses do not include localId. Verify identity through
  // the Auth service; the following protected Trail mutation verifies it again.
  const identity=await json('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(native.api_key[0].current_key),{idToken:nativeToken});
  assert.equal(identity.status,200);assert.equal(identity.body.users[0].localId,uid);
  receipts.push('Real existing email identity → native attestation → browser approval → one-use dedicated signer → same Firebase UID');
  const action={operationId:randomUUID(),destinationId:'baltimore-harbor',kind:'save',createdAt:Date.now()};
  const saved=await invoke('mutatePortalTrail',{expectedOwnerUid:uid,action},nativeProof,nativeToken);assert.equal(saved.status,200);assert.equal(saved.body.ownerScope,'account:'+uid);assert.equal(saved.body.state.saved,true);assert.equal(saved.body.state.visitedAt,0);
  const replay=await invoke('mutatePortalTrail',{expectedOwnerUid:uid,action},nativeProof,nativeToken);assert.equal(replay.status,200);assert.equal(replay.body.state.revision,saved.body.state.revision);
  const listed=await invoke('listPortalTrail',{expectedOwnerUid:uid,after:null,limit:100},webProof,browserToken);assert.equal(listed.status,200);assert.equal(listed.body.items[0].saved,true);assert.equal(listed.body.items[0].visitedAt,0);
  assert.equal((await invoke('mutatePortalTrail',{expectedOwnerUid:'wrong-owner',action},nativeProof,nativeToken)).status,409);
  receipts.push('Native-authenticated save → atomic idempotent Firestore receipt → browser-authenticated Trail read, without a visit');
  const secondVerifier=opaque(),second=await invoke('startPortalPairing',{challenge:digest(secondVerifier)},nativeProof);assert.equal(second.status,200);pairings.push(second.body.requestId);
  const secondCode=opaque();assert.equal((await invoke('approvePortalPairing',{requestId:second.body.requestId,expectedOwnerUid:uid,approvalId:randomUUID(),codeHash:digest(secondCode)},webProof,browserToken)).status,200);
  const cancelled=await invoke('cancelPortalApproval',{requestId:second.body.requestId,expectedOwnerUid:uid},webProof,browserToken);assert.equal(cancelled.status,200);assert.equal(cancelled.body.cancelled,true);
  assert.equal((await invoke('claimPortalPairing',{requestId:second.body.requestId,verifier:secondVerifier,code:secondCode},nativeProof)).status,410);receipts.push('Browser approval cancellation API prevents native claim');
  const thirdVerifier=opaque(),third=await invoke('startPortalPairing',{challenge:digest(thirdVerifier)},nativeProof);assert.equal(third.status,200);pairings.push(third.body.requestId);
  const thirdCode=opaque();assert.equal((await invoke('approvePortalPairing',{requestId:third.body.requestId,expectedOwnerUid:uid,approvalId:randomUUID(),codeHash:digest(thirdCode)},webProof,browserToken)).status,200);
  await firestore.patch(root+'/captureAccountDeletions/'+uid,{fields:{status:{stringValue:'owned-test-deletion'}}});
  assert.equal((await invoke('claimPortalPairing',{requestId:third.body.requestId,verifier:thirdVerifier,code:thirdCode},nativeProof)).status,409);receipts.push('Real deletion tombstone prevents approved claim');
}catch(error){failure=error;}
finally{
  const cleanupErrors=[];
  for(const id of pairings)try{await removeDocument('portalPairings/'+id);}catch{cleanupErrors.push('pairing');}
  if(uid){
    for(const collection of ['portalTrail','portalOperations','portalLimits'])try{
      const {body}=await firestore.get(root+'/explorerProfiles/'+uid+'/'+collection,{queryParams:{pageSize:100}});
      for(const document of body.documents||[]){assert.ok(document.name.startsWith('projects/'+project+'/databases/(default)/documents/explorerProfiles/'+uid+'/'+collection+'/'));await firestore.delete('/v1/'+document.name);}
    }catch{cleanupErrors.push(collection);}
    for(const path of ['explorerProfiles/'+uid,'captureAccountDeletions/'+uid])try{await removeDocument(path);}catch{cleanupErrors.push('profile');}
    try{await identities.post('/v1/projects/'+project+'/accounts:delete',{localId:uid});}catch{cleanupErrors.push('temporary-identity');}
  }
  for(const name of temporaryChecks)try{await checks.delete('/v1/'+name);}catch{cleanupErrors.push('temporary-attestation');}
  const result={passed:!failure&&cleanupErrors.length===0,project,receipts,cleanupErrors,
    scope:'Live HTTP/Firebase Auth/App Check/Firestore/dedicated signing with owned temporary identities and staging debug attestations. Auth REST client represents the SDK exchange. Not native SDK UI, Google OAuth, Play Integrity, physical device or production acceptance.',
    ...(failure?{failure:failure.message}:{}),at:new Date().toISOString()};
  const label=process.env.WE3D_PORTAL_LIVE_RUN||String(Date.now());if(!/^[a-zA-Z0-9-]+$/.test(label))throw Error('Invalid verification run label.');
  await writeFile(folder+'portal-native-live-staging-'+label+'.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
  if(!result.passed)process.exitCode=1;
}
