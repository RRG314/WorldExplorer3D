// One disposable staging identity and attestation for an owned native CI run.
// No production user, long-lived credential or service-account key is used.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile,chmod} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';

const project='we3d-staging-20260712',number='524178734996';
const clients={android:'1:524178734996:android:eededce4f644ea41f51981',apple:'1:524178734996:ios:2d8e12cf5c57d2cef51981'};
const root=join(homedir(),'Library/Application Support/WorldExplorer3D/verification-private/portal-native-2026-10-25');
const cli=createRequire('/opt/homebrew/lib/node_modules/firebase-tools/package.json'),auth=cli('./lib/auth'),{requireAuth}=cli('./lib/requireAuth'),{Client}=cli('./lib/apiv2');
process.env.GOOGLE_CLOUD_QUOTA_PROJECT=project;
const actor=auth.getGlobalDefaultAccount();await requireAuth({project,user:actor?.user,tokens:actor?.tokens});
const api=host=>new Client({urlPrefix:host,auth:true});
const identities=api('https://identitytoolkit.googleapis.com'),checks=api('https://firebaseappcheck.googleapis.com'),store=api('https://firestore.googleapis.com');
const documents='/v1/projects/'+project+'/databases/(default)/documents';
const command=(args,input)=>new Promise((ok,fail)=>{const child=spawn('gh',args,{stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',part=>output+=part);child.stderr.resume();child.on('error',fail);child.on('exit',code=>code?fail(Error('GitHub credential operation failed.')):ok(output));child.stdin.end(input||'');});
const post=async(url,body)=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,'Disposable staging authentication failed.');return response.json();};
const secrets=async()=>JSON.parse(await command(['secret','list','--repo','RRG314/WorldExplorer3D','--json','name']));
const save=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{mode:0o600});
async function removeDocument(path){try{await store.delete(path);}catch(error){if(error.status!==404)throw error;}}
async function cleanup(record){
  assert.equal(record.project,project);assert.ok(Object.hasOwn(clients,record.platform));assert.equal(record.secret,'WE3D_PORTAL_'+record.platform.toUpperCase()+'_ACCEPTANCE');
  const errors=[];
  if(record.secretCreated)try{await command(['secret','delete',record.secret,'--repo','RRG314/WorldExplorer3D']);record.secretCreated=false;}catch{errors.push('temporary-ci-secret');}
  if(record.uid){
    try{
      const query=(await store.post(documents+':runQuery',{structuredQuery:{from:[{collectionId:'portalPairings'}],where:{fieldFilter:{field:{fieldPath:'approvedUid'},op:'EQUAL',value:{stringValue:record.uid}}},limit:100}})).body;
      for(const row of query||[])if(row.document){assert.equal(row.document.fields.approvedUid.stringValue,record.uid);await removeDocument('/v1/'+row.document.name);}
    }catch{errors.push('owned-pairings');}
    for(const collection of ['portalTrail','portalOperations','portalLimits'])try{
      const rows=(await store.get(documents+'/explorerProfiles/'+record.uid+'/'+collection,{queryParams:{pageSize:100}})).body.documents||[];
      for(const row of rows){assert.ok(row.name.startsWith(documents.slice(4)+'/explorerProfiles/'+record.uid+'/'+collection+'/'));await removeDocument('/v1/'+row.name);}
    }catch{errors.push(collection);}
    try{
      await removeDocument(documents+'/explorerProfiles/'+record.uid);
      if(!record.identityRemoved){const found=(await identities.post('/v1/projects/'+project+'/accounts:lookup',{localId:[record.uid]})).body.users||[];if(found.some(user=>user.localId===record.uid))await identities.post('/v1/projects/'+project+'/accounts:delete',{localId:record.uid});record.identityRemoved=true;}
    }catch{errors.push('disposable-identity');}
  }
  for(const name of record.debugRegistrations||[])try{await checks.delete('/v1/'+name);}catch(error){if(error.status!==404)errors.push('temporary-attestation');}
  return errors;
}
let record,path;
try{
  if(process.argv[2]==='--cleanup'){
    path=resolve(process.argv[3]||'');assert.ok(path.startsWith(root+'/ci-')&&path.endsWith('/ownership.private.json'),'Use the exact owned identity receipt.');
    record=JSON.parse(await readFile(path,'utf8'));assert.ok(!record.cleanedAt,'This identity was already cleaned.');const errors=await cleanup(record);assert.deepEqual(errors,[],'Temporary identity cleanup needs attention.');record.cleanedAt=new Date().toISOString();await save(path,record);
    await writeFile('output/research/vr-portal-product-2026-10-25/native-ci-cleanup-'+record.platform+'-'+Date.now()+'.json',JSON.stringify({project,platform:record.platform,temporaryIdentityRemoved:record.identityRemoved,temporarySecretRemoved:!record.secretCreated,debugRegistrationsRemoved:record.debugRegistrations.length,at:record.cleanedAt},null,2)+'\n',{flag:'wx'});
    console.log('Removed the owned staging identity, approval rows, attestation registrations and CI secret.');
  }else{
    const platform=process.argv[2];assert.ok(Object.hasOwn(clients,platform),'Choose android or apple.');const secret='WE3D_PORTAL_'+platform.toUpperCase()+'_ACCEPTANCE';assert.ok(!(await secrets()).some(row=>row.name===secret),'An earlier owned CI identity must be cleaned before creating another.');
    await mkdir(root,{recursive:true,mode:0o700});const directory=await mkdtemp(join(root,'ci-'+platform+'-'));await chmod(directory,0o700);path=join(directory,'ownership.private.json');
    record={project,platform,secret,secretCreated:false,uid:null,debugRegistrations:[],createdAt:new Date().toISOString()};await save(path,record);
    const config=await readFile('config/firebase.staging.json','utf8'),key=config.match(/AIza[A-Za-z0-9_-]{35}/)?.[0];assert.ok(key,'Public staging SDK configuration unavailable.');
    const token=async app=>{
      const parent='/v1/projects/'+number+'/apps/'+app,debug=randomUUID();const row=(await checks.post(parent+'/debugTokens',{displayName:'Disposable native SDK acceptance',token:debug})).body;
      record.debugRegistrations.push(row.name);await save(path,record);
      return (await post('https://firebaseappcheck.googleapis.com'+parent+':exchangeDebugToken?key='+encodeURIComponent(key),{debugToken:debug})).token;
    };
    const nativeCheck=await token(clients[platform]),webCheck=await token('1:524178734996:web:f59acbc9014f0e26f51981');
    const email='qa-native-'+randomUUID()+'@example.invalid',password=randomBytes(32).toString('base64url');
    record.uid=(await identities.post('/v1/projects/'+project+'/accounts',{email,password,emailVerified:true,displayName:'Disposable native SDK verification'})).body.localId;assert.ok(record.uid);await save(path,record);
    const identity=await post('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(key),{email,password,returnSecureToken:true});assert.equal(identity.localId,record.uid);
    const expiry=value=>JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString()).exp*1000;
    const payload={project,appId:clients[platform],uid:record.uid,expiresAt:Math.min(expiry(nativeCheck),expiry(webCheck),expiry(identity.idToken)),nativeCheck,webCheck,webIdentity:identity.idToken};assert.ok(payload.expiresAt>Date.now()+20*60000);
    await save(join(directory,'acceptance.private.json'),payload);
    // Claim ownership before the external command so an interrupted set can be
    // safely removed by this same receipt; the dedicated name was absent above.
    record.secretCreated=true;await save(path,record);await command(['secret','set',secret,'--repo','RRG314/WorldExplorer3D'],JSON.stringify(payload));
    console.log(JSON.stringify({project,platform,privateOwnershipReceipt:path,temporarySecretCreated:true,expiresAt:payload.expiresAt}));
  }
}catch(error){
  if(record&&path){const cleanupErrors=await cleanup(record);record.failureCleanupErrors=cleanupErrors;await save(path,record);console.error(JSON.stringify({error:'Native CI identity preparation/cleanup failed.',cleanupErrors,privateOwnershipReceipt:path}));}
  else console.error('Native CI identity operation refused: '+error.message);
  process.exitCode=1;
}
