// Explicit, disposable staging automation identity. Never included in hosting.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

export async function stagingCaptureAttestation() {
  const cli=createRequire(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()+'/firebase-tools/package.json');
  const auth=cli('./lib/auth'),{requireAuth}=cli('./lib/requireAuth'),{Client}=cli('./lib/apiv2');
  const operator=auth.getGlobalDefaultAccount();
  await requireAuth({project:'we3d-staging-20260712',user:operator?.user,tokens:operator?.tokens});
  const client=new Client({urlPrefix:'https://firebaseappcheck.googleapis.com',auth:true});
  const parent='/v1/projects/524178734996/apps/1:524178734996:web:f59acbc9014f0e26f51981/debugTokens';
  const token=randomUUID();
  const {body}=await client.post(parent,{displayName:'Disposable manual capture verification',token});
  return {token,cleanup:()=>client.delete('/v1/'+body.name)};
}
