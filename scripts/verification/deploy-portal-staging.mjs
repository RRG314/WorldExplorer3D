// Additive staging activation. The existing 84 Functions and their configured
// values are preserved; credentials and raw snapshots stay outside the repo.
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,open,chmod,writeFile,unlink} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const project='we3d-staging-20260712';
process.env.GOOGLE_CLOUD_QUOTA_PROJECT=project;
const names=['startPortalPairing','inspectPortalPairing','approvePortalPairing','claimPortalPairing','cancelPortalPairing','cancelPortalApproval',...(process.argv.includes('--pairing-only')?[]:['mutatePortalTrail','confirmPortalVisit','listPortalTrail'])];
if(process.argv.slice(2).some(value=>value!=='--pairing-only'))throw Error('Unsupported staging deployment argument.');
const cli=createRequire('/opt/homebrew/lib/node_modules/firebase-tools/package.json');
const auth=cli('./lib/auth'),{requireAuth}=cli('./lib/requireAuth'),{Client}=cli('./lib/apiv2');
const actor=auth.getGlobalDefaultAccount();await requireAuth({project,user:actor?.user,tokens:actor?.tokens});
const cloud=new Client({urlPrefix:'https://cloudfunctions.googleapis.com',auth:true});
const inventory=async()=>(await cloud.get('/v1/projects/'+project+'/locations/-/functions')).body.functions||[];
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const before=await inventory(),preserved=before.filter(row=>!names.includes(row.name.split('/').at(-1)));
const billing=(await new Client({urlPrefix:'https://cloudbilling.googleapis.com',auth:true}).get('/v1/projects/'+project+'/billingInfo')).body;
if(!billing.billingEnabled)throw Error('Existing staging billing is not enabled.');
const privateRoot=join(homedir(),'Library/Application Support/WorldExplorer3D/verification-private/portal-native-2026-10-25');
await mkdir(privateRoot,{recursive:true,mode:0o700});
const directory=await mkdtemp(join(privateRoot,'staging-deploy-'));await chmod(directory,0o700);
await writeFile(join(directory,'functions-before.private.json'),JSON.stringify(before),{mode:0o600});
const log=join(directory,'deploy.log'),file=await open(log,'w',0o600),envPath='functions/.env.'+project;
const params=['WE3D_STRIPE_SECRET','WE3D_STRIPE_WEBHOOK_SECRET','WE3D_STRIPE_PRICE_SUPPORTER','WE3D_STRIPE_PRICE_PRO','WE3D_ADMIN_ALLOWED_EMAILS','WE3D_ADMIN_ALLOWED_UIDS','WE3D_ALLOWED_ORIGINS','WE3D_RESEND_API_KEY','WE3D_EMAIL_FROM','WE3D_ADMIN_NOTIFICATION_EMAIL','WE3D_MODERATION_PANEL_URL'];
let owned=false,code=1;
try{
  // Explicit empty unrelated parameters satisfy the shared entrypoint's CLI
  // declarations without copying mail/commerce secrets into these new APIs.
  const env=await open(envPath,'wx',0o600);owned=true;await env.writeFile(params.map(name=>name+'=""').join('\n')+'\n');await env.close();
  const child=spawn('/opt/homebrew/bin/firebase',['deploy','--project',project,'--only',names.map(name=>'functions:'+name).join(','),'--non-interactive'],{stdio:['ignore',file.fd,file.fd],env:process.env});
  code=await new Promise(resolve=>child.on('exit',resolve));
}finally{await file.close();if(owned)await unlink(envPath);}
const after=await inventory(),changed=preserved.filter(row=>!after.some(next=>next.name===row.name&&digest(next)===digest(row))).map(row=>row.name.split('/').at(-1));
const active=after.filter(row=>names.includes(row.name.split('/').at(-1))).map(row=>({name:row.name.split('/').at(-1),versionId:row.versionId,status:row.status,serviceAccount:row.serviceAccountEmail}));
const result={project,exitCode:code,existingFunctionsPreserved:preserved.length,existingFunctionChanges:changed,active,privateEvidence:directory,temporaryParameterFileRemoved:owned,at:new Date().toISOString()};
await writeFile('output/research/vr-portal-product-2026-10-25/staging-portal-deployment-'+Date.now()+'.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));if(code||changed.length||active.length!==names.length)process.exitCode=1;
