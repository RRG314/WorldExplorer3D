#!/usr/bin/env node
// Operator intake is deliberately separate from player publication. It accepts
// a bounded export of already-published world facts, never arbitrary client
// geometry through a public endpoint. Dry-run is the default.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {prepareRaceDistrictStorage,readRaceDistrictFacts,raceDistrictChunkPath} from '../../app/js/racing/district-storage.js';
import {canonicalRaceDistrict} from '../../app/js/racing/district-facts.js';
import {raceDistrictFingerprint} from '../../app/js/racing/course-library.js';
import {raceLocationKey} from '../../app/js/racing/publication-rules.js';

export async function prepareRacingDistrictIntake(input){
 const storage=await prepareRaceDistrictStorage(input?.facts),facts=storage.facts;
 if(!Array.isArray(input.credits)||!input.credits.length||input.credits.length>12)throw Error('Document geographic source licences before intake.');
 const credits=input.credits.map(v=>{const url=new URL(v.url);if(!['roads','terrain'].includes(v.role)||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!v.label||!v.license)throw Error('Invalid geographic credit.');
  return {role:v.role,label:String(v.label).slice(0,120),license:String(v.license).slice(0,100),url:url.href};});
 if(!credits.some(v=>v.role==='roads'&&v.license==='ODbL-1.0'&&v.url==='https://www.openstreetmap.org/copyright'))throw Error('OpenStreetMap credit and ODbL licence required.');
 if(!credits.some(v=>v.role==='terrain'))throw Error('Document the actual terrain source licence and attribution before intake.');
 const p=input.provenance;
 if(!p||!/^\d{4}-\d\d-\d\dT/.test(p.capturedAt||'')||!Number.isFinite(Date.parse(p.capturedAt))||!String(p.sourceRelease||'').trim()||!String(p.buildId||'').trim()||!String(p.reviewNote||'').trim())throw Error('Capture date, source release, exact build and review note required.');
 const provenance={capturedAt:p.capturedAt,sourceRelease:String(p.sourceRelease).slice(0,160),buildId:String(p.buildId).slice(0,160),reviewNote:String(p.reviewNote).slice(0,400)};
 const id=(await raceDistrictFingerprint(facts)).slice('race-district:'.length),locationKey=await raceLocationKey(facts.locationId),record={status:'approved',...storage.fields,credits,provenance};
 return {id,locationKey,record,chunks:storage.chunks,facts};
}
export async function publishPreparedRacingDistrict(db,prepared,reviewedAt){
 // Own a sealed-value snapshot across credential/database waits. A caller
 // cannot change the proposed geometry while the transaction is yielding.
 prepared=structuredClone(prepared);
 const count=prepared.record?.factsManifest?.chunks?.length||0;
 if(prepared.record?.status!=='approved'||!Array.isArray(prepared.chunks)||prepared.chunks.length!==count||prepared.chunks.some((chunk,index)=>chunk.index!==index))throw Error('Invalid prepared district publication.');
 const facts=await readRaceDistrictFacts(prepared.record,index=>Promise.resolve(prepared.chunks[index]?.record));
 if(!facts||await raceDistrictFingerprint(facts)!==`race-district:${prepared.id}`||await raceLocationKey(facts.locationId)!==prepared.locationKey||JSON.stringify(canonicalRaceDistrict(facts))!==JSON.stringify(prepared.facts))throw Error('Prepared district identity conflict.');
 const reference=path=>{const split=path.lastIndexOf('/');return db.collection(path.slice(0,split)).doc(path.slice(split+1));};
 return db.runTransaction(async tx=>{
  const ref=db.collection('racingDistricts').doc(prepared.id),old=await tx.get(ref);
  const readChunk=async index=>{const snapshot=await tx.get(reference(raceDistrictChunkPath(prepared.id,index)));return snapshot.exists?snapshot.data():null;};
  if(old.exists){
   const previous=await readRaceDistrictFacts(old.data(),readChunk);
   if(!previous||await raceDistrictFingerprint(previous)!==`race-district:${prepared.id}`||JSON.stringify(canonicalRaceDistrict(previous))!==JSON.stringify(prepared.facts))throw Error('Immutable district identity conflict.');
  }
  // Read every child before writing any document. Metadata, chunks and the
  // current-location pointer become visible in the same Firestore commit.
  const children=[];
  if(!old.exists)for(const chunk of prepared.chunks){
   const child=reference(raceDistrictChunkPath(prepared.id,chunk.index)),existing=await tx.get(child);
   if(existing.exists)throw Error('Unexpected orphaned district chunk. Inspect it before publication.');
   children.push({child,record:chunk.record});
  }
  for(const child of children)tx.create(child.child,child.record);
  if(!old.exists)tx.create(ref,{...prepared.record,reviewedAt});
  else if(old.data().status!=='approved')tx.update(ref,{status:'approved',credits:prepared.record.credits,reviewedAt});
  tx.set(db.collection('racingLocations').doc(prepared.locationKey),{districtId:prepared.id,locationId:prepared.facts.locationId,updatedAt:reviewedAt});
 });
}
async function main(){
 const args=process.argv.slice(2),inputPath=args[args.indexOf('--input')+1];
 if(!args.includes('--input')||!inputPath)throw Error('Usage: node scripts/racing/intake-district.mjs --input /private/reviewed-district.json [--approve --project we3d-staging-20260712]');
 const prepared=await prepareRacingDistrictIntake(JSON.parse(await fs.readFile(inputPath,'utf8')));
 if(!args.includes('--approve')){console.log(JSON.stringify({dryRun:true,districtId:prepared.id,location:prepared.facts.locationLabel,roads:prepared.facts.roads.length,chunks:prepared.chunks.length,bytes:Buffer.byteLength(JSON.stringify(prepared.record))}));return;}
 const project=args[args.indexOf('--project')+1];if(!args.includes('--project')||project!=='we3d-staging-20260712')throw Error('This intake command approves only the explicit staging project.');
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Use the independent demo verification entry point for emulators.');
 const cli=createRequire(path.join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'firebase-tools/package.json'));
 const {requireAuth}=cli('./lib/requireAuth'),auth=cli('./lib/auth'),{getAccessToken}=cli('./lib/apiv2');
 const account=auth.getGlobalDefaultAccount();if(!account)throw Error('Sign in with the Firebase CLI first.');
 await requireAuth({project,user:account.user,tokens:account.tokens});
 // Firestore's Admin wrapper requires certificate/default credentials. Use
 // the supported OAuth client instead of presenting CLI tokens as a custom
 // Admin credential. Refresh remains owned by the already signed-in CLI.
 const runtime=createRequire(new URL('../../services/racing/package.json',import.meta.url)),{Firestore,Timestamp}=runtime('@google-cloud/firestore'),{OAuth2Client}=runtime('google-auth-library');
 const oauth=new OAuth2Client({quotaProjectId:project});oauth.refreshHandler=async()=>({access_token:await getAccessToken(),expiry_date:Date.now()+3600000});
 const db=new Firestore({projectId:project,authClient:oauth});
 try{await publishPreparedRacingDistrict(db,prepared,Timestamp.now());console.log(JSON.stringify({approved:true,project,districtId:prepared.id,roads:prepared.facts.roads.length,chunks:prepared.chunks.length}));}
 finally{await db.terminate();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
