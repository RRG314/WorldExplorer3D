// Only the personal-save API and its existing account-deletion cleanup owner.
// Credential-bearing service configuration is retained privately, never logged.
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,mkdir,open,writeFile,unlink,chmod} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const project='we3d-staging-20260712',names=['syncExplorerJourney','deleteAccount'];
const cli=createRequire(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()+'/firebase-tools/package.json');
const auth=cli('./lib/auth'),actor=auth.getGlobalDefaultAccount();await cli('./lib/requireAuth').requireAuth({project,user:actor?.user,tokens:actor?.tokens});
const {Client}=cli('./lib/apiv2'),cloud=new Client({urlPrefix:'https://cloudfunctions.googleapis.com',auth:true});
const endpoint=name=>`/v1/projects/${project}/locations/us-central1/functions/${name}`;
const before=(await cloud.get(endpoint('deleteAccount'))).body;
assert.equal(before.status,'ACTIVE');
const privateRoot=path.join(homedir(),'Library/Application Support/WorldExplorer3D/verification-private/player-journey-20261105');
await mkdir(privateRoot,{recursive:true,mode:0o700});const directory=await mkdtemp(path.join(privateRoot,'staging-deploy-'));await chmod(directory,0o700);
await writeFile(path.join(directory,'delete-account-before.private.json'),JSON.stringify(before),{mode:0o600});
const params=['WE3D_STRIPE_SECRET','WE3D_STRIPE_WEBHOOK_SECRET','WE3D_STRIPE_PRICE_SUPPORTER','WE3D_STRIPE_PRICE_PRO','WE3D_ADMIN_ALLOWED_EMAILS','WE3D_ADMIN_ALLOWED_UIDS','WE3D_ALLOWED_ORIGINS','WE3D_RESEND_API_KEY','WE3D_EMAIL_FROM','WE3D_ADMIN_NOTIFICATION_EMAIL','WE3D_MODERATION_PANEL_URL'];
const preserved=before.environmentVariables||{};
const values={...Object.fromEntries(params.map(key=>[key,preserved[key]??''])),...Object.fromEntries(Object.entries(preserved).filter(([key])=>key.startsWith('WE3D_')))};
const envPath='functions/.env.'+project;let owned=false,exitCode=1;
const log=await open(path.join(directory,'deploy.private.log'),'w',0o600);
try{
 const env=await open(envPath,'wx',0o600);owned=true;await env.writeFile(Object.entries(values).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n');await env.close();
 const child=spawn('/opt/homebrew/bin/firebase',['deploy','--project',project,'--only',names.map(name=>'functions:'+name).join(','),'--non-interactive'],{stdio:['ignore',log.fd,log.fd],env:process.env});
 exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
}finally{await log.close();if(owned)await unlink(envPath);}
const after=await Promise.all(names.map(async name=>{try{return (await cloud.get(endpoint(name))).body;}catch{return null;}}));
const updated=after.find(row=>row?.name.endsWith('/deleteAccount'));
const unchangedValues=Object.keys(preserved).filter(key=>key.startsWith('WE3D_')).every(key=>updated?.environmentVariables?.[key]===preserved[key]);
const receipt={project,exitCode,existingAccountEnvironmentPreserved:unchangedValues,active:after.filter(Boolean).map(row=>({name:row.name.split('/').at(-1),status:row.status,versionId:row.versionId})),temporaryParameterFileRemoved:owned,privateEvidence:directory};
await writeFile('output/verification/player-journey-20261105/staging-functions-deployment.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));if(exitCode||!unchangedValues||after.some(row=>row?.status!=='ACTIVE'))process.exitCode=1;
