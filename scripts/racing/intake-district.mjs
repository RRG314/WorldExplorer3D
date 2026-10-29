#!/usr/bin/env node
// Operator intake is deliberately separate from player publication. It accepts
// a bounded export of already-published world facts, never arbitrary client
// geometry through a public endpoint. Dry-run is the default.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {canonicalRaceDistrict} from '../../app/js/racing/publication-rules.js';
import {raceDistrictFingerprint} from '../../app/js/racing/course-library.js';
import {raceLocationKey} from '../../app/js/racing/publication-rules.js';

export async function prepareRacingDistrictIntake(input){
 const facts=canonicalRaceDistrict(input?.facts);
 if(!Array.isArray(input.credits)||!input.credits.length||input.credits.length>12)throw Error('Document geographic source licences before intake.');
 const credits=input.credits.map(v=>{const url=new URL(v.url);if(!['roads','terrain'].includes(v.role)||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!v.label||!v.license)throw Error('Invalid geographic credit.');
  return {role:v.role,label:String(v.label).slice(0,120),license:String(v.license).slice(0,100),url:url.href};});
 if(!credits.some(v=>v.role==='roads'&&v.license==='ODbL-1.0'&&v.url==='https://www.openstreetmap.org/copyright'))throw Error('OpenStreetMap credit and ODbL licence required.');
 if(!credits.some(v=>v.role==='terrain'))throw Error('Document the actual terrain source licence and attribution before intake.');
 const p=input.provenance;
 if(!p||!/^\d{4}-\d\d-\d\dT/.test(p.capturedAt||'')||!Number.isFinite(Date.parse(p.capturedAt))||!String(p.sourceRelease||'').trim()||!String(p.buildId||'').trim()||!String(p.reviewNote||'').trim())throw Error('Capture date, source release, exact build and review note required.');
 const provenance={capturedAt:p.capturedAt,sourceRelease:String(p.sourceRelease).slice(0,160),buildId:String(p.buildId).slice(0,160),reviewNote:String(p.reviewNote).slice(0,400)};
 const id=(await raceDistrictFingerprint(facts)).slice('race-district:'.length),locationKey=await raceLocationKey(facts.locationId),record={status:'approved',facts,credits,provenance};
 if(Buffer.byteLength(JSON.stringify(record))>750*1024)throw Error('District exceeds the bounded racing snapshot size. Select a smaller, complete district.');
 return {id,locationKey,record};
}
async function main(){
 const args=process.argv.slice(2),inputPath=args[args.indexOf('--input')+1];
 if(!args.includes('--input')||!inputPath)throw Error('Usage: node scripts/racing/intake-district.mjs --input /private/reviewed-district.json [--approve --project we3d-staging-20260712]');
 const prepared=await prepareRacingDistrictIntake(JSON.parse(await fs.readFile(inputPath,'utf8')));
 if(!args.includes('--approve')){console.log(JSON.stringify({dryRun:true,districtId:prepared.id,location:prepared.record.facts.locationLabel,roads:prepared.record.facts.roads.length,bytes:Buffer.byteLength(JSON.stringify(prepared.record))}));return;}
 const project=args[args.indexOf('--project')+1];if(!args.includes('--project')||project!=='we3d-staging-20260712')throw Error('This intake command approves only the explicit staging project.');
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Use the independent demo verification entry point for emulators.');
 const cli=createRequire(path.join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'firebase-tools/package.json'));
 const {requireAuth}=cli('./lib/requireAuth'),auth=cli('./lib/auth'),{getAccessToken}=cli('./lib/apiv2');
 const account=auth.getGlobalDefaultAccount();if(!account)throw Error('Sign in with the Firebase CLI first.');
 await requireAuth({project,account:account.user.email});
 const admin=createRequire(new URL('../../functions/package.json',import.meta.url))('firebase-admin');
 const app=admin.initializeApp({projectId:project,credential:{getAccessToken:async()=>({access_token:await getAccessToken(),expires_in:300})}}),db=app.firestore();
 try{await db.runTransaction(async tx=>{
  const ref=db.collection('racingDistricts').doc(prepared.id),old=await tx.get(ref);
  if(old.exists&&JSON.stringify(old.data().facts)!==JSON.stringify(prepared.record.facts))throw Error('Immutable district identity conflict.');
  if(!old.exists)tx.create(ref,{...prepared.record,reviewedAt:admin.firestore.Timestamp.now()});
  tx.set(db.collection('racingLocations').doc(prepared.locationKey),{districtId:prepared.id,locationId:prepared.record.facts.locationId,updatedAt:admin.firestore.Timestamp.now()});
 });console.log(JSON.stringify({approved:true,project,districtId:prepared.id,roads:prepared.record.facts.roads.length}));}
 finally{await app.delete();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
