// Read only this staging bucket's access policy. Do not print policy members.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const config=JSON.parse(await fs.readFile('config/firebase.staging.json','utf8'));
assert.equal(config.projectId,'we3d-staging-20260712');
const cli=createRequire(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()+'/firebase-tools/package.json');
const account=cli('./lib/auth').getGlobalDefaultAccount();await cli('./lib/requireAuth').requireAuth({project:config.projectId,user:account?.user,tokens:account?.tokens});
const {Client}=cli('./lib/apiv2'),client=new Client({urlPrefix:'https://storage.googleapis.com',auth:true});
const bucket=encodeURIComponent(config.storageBucket);
const {body:policy}=await client.get(`/storage/v1/b/${bucket}/iam`);
const {body:metadata}=await client.get(`/storage/v1/b/${bucket}?projection=full`);
const publicMember=value=>['allUsers','allAuthenticatedUsers'].includes(value);
assert.equal((policy.bindings||[]).some(row=>(row.members||[]).some(publicMember)),false,'The journey bucket must not grant public IAM access.');
assert.equal((metadata.defaultObjectAcl||[]).some(row=>publicMember(row.entity)),false,'New journey objects must not inherit public ACLs.');
const receipt={ok:true,projectId:config.projectId,bucket:config.storageBucket,publicIam:false,publicDefaultAcl:false,uniformAccess:metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled===true};
await fs.writeFile('output/verification/player-journey-20261105/staging-storage-policy.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
