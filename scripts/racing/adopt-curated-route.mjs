#!/usr/bin/env node
// Review first; this command never enables the public racing service.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
for(const name of ['--project','--id','--owner','--revision','--note'])if(!args.includes(name)||!arg(name)||arg(name).startsWith('--'))throw Error('Required: --project --id --owner --revision --note. Dry-run unless --approve is supplied.');
const project=arg('--project');
if(!['we3d-staging-20260712','worldexplorer3d-d9b83'].includes(project)||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Explicit known cloud project required; use the isolated test entry point for emulators.');
if(project==='worldexplorer3d-d9b83'&&args.includes('--approve')&&!args.includes('--production-release'))throw Error('Production adoption requires the explicit --production-release flag during an approved release.');
const cli=createRequire(path.join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'firebase-tools/package.json')),
 account=cli('./lib/auth').getGlobalDefaultAccount();
if(!account)throw Error('Sign in with the Firebase CLI first.');
await cli('./lib/requireAuth').requireAuth({project,user:account.user,tokens:account.tokens});
const runtime=createRequire(new URL('../../services/racing/package.json',import.meta.url)),{Firestore,Timestamp}=runtime('@google-cloud/firestore'),{OAuth2Client}=runtime('google-auth-library');
const oauth=new OAuth2Client({quotaProjectId:project});oauth.refreshHandler=async()=>({access_token:await cli('./lib/apiv2').getAccessToken(),expiry_date:Date.now()+3600000});
const db=new Firestore({projectId:project,authClient:oauth}),{adoptCuratedRacingRoute}=createRequire(import.meta.url)('../../functions/racing-publication.js');
try{
 const result=await adoptCuratedRacingRoute({db,admin:{firestore:{Timestamp}},id:arg('--id'),ownerUid:arg('--owner'),revision:arg('--revision'),note:arg('--note'),approve:args.includes('--approve')});
 console.log(JSON.stringify({project,...result}));
}finally{await db.terminate();}
