import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import crypto from 'node:crypto';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'we3d-secret-policy-'));const config=path.resolve('.gitleaks.toml');const cases=[];
try{
 await fs.mkdir('output/verification/security',{recursive:true});
 const scan=async(name,file,contents,expected)=>{
  const root=path.join(temp,name);await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),contents);
  const result=spawnSync('gitleaks',['dir',root,'--config',config,'--redact=100','--no-banner','--exit-code','1'],{encoding:'utf8',timeout:20000});
  assert.equal(result.status,expected,`${name}: unexpected scanner outcome (redacted)`);cases.push({name,passed:true});
 };
 const firebase=JSON.parse(await fs.readFile('config/firebase.production.json','utf8'));
 await scan('public-client-config','config/firebase.production.json',JSON.stringify(firebase,null,2)+'\n',0);
 await scan('local-preference','app/js/ui/tester-invitation.js',"const DISMISSAL_KEY = 'we3d.tester-invitation.v1';\n",0);
 // Synthetic, deliberately invalid credentials never sent to any service.
 const fake='sk_live_'+crypto.randomBytes(24).toString('hex');
 await scan('private-secret-in-public-config','config/firebase.production.json',JSON.stringify({...firebase,stripe_secret:fake},null,2)+'\n',1);
 await scan('public-key-outside-approved-config','unexpected-secret.js',`const apiKey = '${firebase.apiKey}';\nconst secret = '${fake}';\n`,1);
 await scan('private-secret-next-to-site-key','config/firebase.staging.json',`appCheckSiteKey: '${firebase.appCheckSiteKey}', secret: '${fake}'\n`,1);
 await scan('generic-secret-in-public-config','config/firebase.production.json',JSON.stringify({...firebase,internal_secret:crypto.randomBytes(32).toString('hex')},null,2)+'\n',1);
 await scan('unreviewed-key-in-public-config','config/firebase.production.json',JSON.stringify({...firebase,another_api_key:'6L'+crypto.randomBytes(19).toString('hex')},null,2)+'\n',1);
 await fs.writeFile('output/verification/security/secret-policy.json',JSON.stringify({passed:true,cases},null,2));console.log(JSON.stringify(cases));
}finally{await fs.rm(temp,{recursive:true,force:true});}
