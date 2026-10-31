#!/usr/bin/env node
// Reviewed platform content uses the same immutable district/course documents
// as creator publication. It creates no player, qualification result or award.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {prepareRacingDistrictIntake,publishPreparedRacingDistrict} from './intake-district.mjs';
import {RACING_VENUE_SOURCES,loadRacingVenueSource,prepareVenueSourceMerge,racingVenueGroundRequirements} from '../../app/js/racing/venue-source-packs.js';
import {buildVenueRaceCourses} from '../../app/js/racing/venue-courses.js';
import {raceCourseReference,raceCourseKey} from '../../app/js/racing/course-library.js';
import {racePhysicsVersion} from '../../app/js/racing/record-rules.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const root=fileURLToPath(new URL('../..',import.meta.url));
const entries=['silverstone','nordschleife','daytona'];

export async function prepareRacingVenueIntake(input){
 const descriptor=RACING_VENUE_SOURCES.find(d=>d.id===input?.venueId);
 if(!descriptor||!entries.includes(input.slug)||input.sourceSha256!==descriptor.sourceSha256)throw Error('Reviewed venue source does not match this release.');
 const source=await loadRacingVenueSource(descriptor,{fetchImpl:async url=>new Response(await fs.readFile(path.join(root,url)))});
 // The captured support is a reviewed operator input, like the published
 // triangles in district intake. Never infer support from a map name or DEM.
 const venue=prepareVenueSourceMerge({elements:[]},source,descriptor,input.ground).metadata;
 const required=racingVenueGroundRequirements(descriptor,{includeLandscape:true});
 if(required.some(r=>!input.ground?.artifactIds?.includes(r.artifactId)||!input.ground?.contentSha256s?.includes(r.contentSha256)))throw Error('Reviewed venue ground does not match this release.');
 if(!/^[a-f0-9]{40}$/.test(input.nativePracticeCommit||'')||input.nativePractice?.complete!==true||input.nativePractice?.barrierContacts!==0||input.nativePractice?.penaltiesMs!==0)throw Error('A reviewed complete native practice journey is required.');
 const pitPractice=input.nativePitPractice;
 if(venue.pitSourceFeatureIds&&input.nativePractice.pitComplete!==true&&
  (!/^[a-f0-9]{40}$/.test(pitPractice?.sourceRelease||'')||pitPractice.complete!==true||pitPractice.visits!==1||
   pitPractice.barrierContacts!==0||pitPractice.penaltiesMs!==0||pitPractice.missingWheelContacts!==0))throw Error('A reviewed complete native pit journey is required.');
 const prepared=await prepareRacingDistrictIntake(input),fingerprint=`race-district:${prepared.id}`;
 const courses=[];
 for(const course of buildVenueRaceCourses(prepared.facts,venue).events){
  const reference=raceCourseReference(course,fingerprint),revision=hash({districtId:prepared.id,reference}),physicsVersion=racePhysicsVersion(course);
  courses.push({id:await raceCourseKey(course),record:{ownerUid:null,status:'approved',districtId:prepared.id,reference,revision,physicsVersion,
   curation:{version:2,kind:'reviewed-venue',revision,physicsVersion,venueId:descriptor.id,sourceSha256:descriptor.sourceSha256,
    nativePracticeCommit:input.nativePracticeCommit,nativePractice:{...input.nativePractice},...(pitPractice?{nativePitPractice:{...pitPractice}}:{}),provenance:prepared.record.provenance}}});
 }
 return {prepared,courses};
}

async function main(){
 const args=process.argv.slice(2),flag=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined,approve=args.includes('--approve'),project=flag('--project'),origin=flag('--service-origin');
 if(approve&&(!['we3d-staging-20260712','worldexplorer3d-d9b83'].includes(project)||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST))throw Error('Explicit known cloud project required.');
 if(approve&&project==='worldexplorer3d-d9b83'&&!args.includes('--production-release'))throw Error('Production content publication requires --production-release during an approved release.');
 if(origin){
  if(!['we3d-staging-20260712','worldexplorer3d-d9b83'].includes(project))throw Error('The service origin needs an explicit known project.');
  const config=JSON.parse(await fs.readFile(path.join(root,'config',project==='worldexplorer3d-d9b83'?'firebase.production.json':'firebase.staging.json'),'utf8'));
  const expected=`https://we3d-racing${project==='we3d-staging-20260712'?'-staging':''}-${config.appId.split(':')[1]}.us-central1.run.app`;
  if(origin!==expected)throw Error('The service origin must match this project and its existing racing descriptor contract.');
 }
 const packs=[];for(const slug of entries)packs.push(await prepareRacingVenueIntake(JSON.parse(await fs.readFile(path.join(root,'config/racing-venues/catalog',slug+'.json'),'utf8'))));
 const summary=packs.map(({prepared,courses})=>({districtId:prepared.id,location:prepared.facts.locationLabel,roads:prepared.facts.roads.length,chunks:prepared.chunks.length,courses:courses.map(c=>({id:c.id,physicsVersion:c.record.physicsVersion}))}));
 if(!approve){console.log(JSON.stringify({dryRun:true,venues:summary,...(origin?{serviceOrigin:origin}:{})},null,2));return;}
 if(origin){const health=await fetch(origin+'/health',{redirect:'error',signal:AbortSignal.timeout(15000)});if(!health.ok||(await health.json()).ready!==true)throw Error('The racing service is not healthy; its descriptor remains unchanged.');}
 const cli=createRequire(path.join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'firebase-tools/package.json')),account=cli('./lib/auth').getGlobalDefaultAccount();
 if(!account)throw Error('Sign in with the Firebase CLI first.');
 await cli('./lib/requireAuth').requireAuth({project,user:account.user,tokens:account.tokens});
 const runtime=createRequire(new URL('../../services/racing/package.json',import.meta.url)),{Firestore,Timestamp}=runtime('@google-cloud/firestore'),{OAuth2Client}=runtime('google-auth-library');
 const oauth=new OAuth2Client({quotaProjectId:project});oauth.refreshHandler=async()=>({access_token:await cli('./lib/apiv2').getAccessToken(),expiry_date:Date.now()+3600000});
 const db=new Firestore({projectId:project,authClient:oauth});
 try{for(const pack of packs)await publishPreparedRacingDistrict(db,pack.prepared,Timestamp.now(),{courses:pack.courses});if(origin)await db.collection('serviceConfig').doc('racing').set({enabled:true,origin,updatedAt:Timestamp.now()},{merge:true});console.log(JSON.stringify({approved:true,project,venues:summary,...(origin?{serviceOrigin:origin}:{})},null,2));}
 finally{await db.terminate();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
