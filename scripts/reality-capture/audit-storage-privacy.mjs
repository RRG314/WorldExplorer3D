// Staging-only, dry-run by default. Revokes bearer tokens, never media bytes.
import {createRequire} from 'node:module';
const project='we3d-staging-20260712',bucket=project+'.firebasestorage.app';
if(process.argv.slice(2).some(arg=>!['--apply'].includes(arg)))throw Error('Only --apply is supported; this tool is staging-only.');
const apply=process.argv.includes('--apply');
const cli=createRequire('/opt/homebrew/lib/node_modules/firebase-tools/package.json');
const a=cli('./lib/auth').getGlobalDefaultAccount();
await cli('./lib/requireAuth').requireAuth({project,user:a?.user,tokens:a?.tokens});
const g=new(cli('./lib/apiv2').Client)({urlPrefix:'https://storage.googleapis.com',auth:true});
const base='/storage/v1/b/'+bucket+'/o';let pageToken='',objects=[];
do{const result=(await g.get(base+'?prefix=reality-captures/&maxResults=1000'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''))).body;objects.push(...(result.items||[]));pageToken=result.nextPageToken||'';}while(pageToken);
const targets=objects.filter(o=>o.metadata?.firebaseStorageDownloadTokens);
if(targets.some(o=>!/^reality-captures\/[^/]+\/capture_[a-f0-9]{32}\/originals\/[a-f0-9]{32}\.(jpg|webp)$/.test(o.name)))throw Error('Unexpected token-bearing path; manual audit required.');
let probe=null;
if(targets.length){const o=targets[0];probe='https://firebasestorage.googleapis.com/v0/b/'+bucket+'/o/'+encodeURIComponent(o.name)+'?alt=media&token='+encodeURIComponent(o.metadata.firebaseStorageDownloadTokens.split(',')[0]);}
let changed=0;
for(const o of apply?targets:[]){
  if(!/^\d+$/.test(o.generation)||!/^\d+$/.test(o.metageneration))throw Error('Version metadata missing');
  const path=base+'/'+encodeURIComponent(o.name);
  await g.patch(path+'?ifGenerationMatch='+o.generation+'&ifMetagenerationMatch='+o.metageneration,{metadata:{firebaseStorageDownloadTokens:null},cacheControl:'private, no-store, max-age=0'});
  const after=(await g.get(path)).body;
  if(after.metadata?.firebaseStorageDownloadTokens||after.generation!==o.generation||after.md5Hash!==o.md5Hash)throw Error('Sealing postcondition failed');
  changed++;
}
let revokedProbeStatus=null;
if(apply&&probe){const r=await fetch(probe,{headers:{Range:'bytes=0-0'}});revokedProbeStatus=r.status;await r.body?.cancel();if(![401,403].includes(r.status))throw Error('Old token URL did not deny access');}
console.log(JSON.stringify({project,apply,objects:objects.length,tokenBearingOriginals:targets.length,revoked:changed,mediaBytesChanged:false,revokedProbeStatus}));
