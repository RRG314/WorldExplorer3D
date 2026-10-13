// Run one mutable-source browser check with a disposable staging identity.
// No production configuration, artifact or service is changed.
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
const entry=process.argv[2];
if(!/^scripts\/verification\/[a-z0-9-]+\.mjs$/.test(entry||''))throw Error('Choose one source verification entry point.');
const directory=await mkdtemp(path.join(tmpdir(),'we3d-source-attestation-'));let identity;
try{
 identity=await stagingCaptureAttestation();
 const credential=path.join(directory,'attestation.json');
 await writeFile(credential,JSON.stringify({projectId:'we3d-staging-20260712',appId:'1:524178734996:web:f59acbc9014f0e26f51981',expiresAt:new Date(Date.now()+3600000).toISOString(),token:identity.token}),{mode:0o600});
 const child=spawn(process.execPath,[entry,...process.argv.slice(3)],{stdio:'inherit',env:{...process.env,WE3D_VERIFY_ROOT:process.cwd(),WE3D_STAGING_APP_CHECK_FILE:credential,WE3D_VERIFY_HOSTED_PLACE_LOOKUP:'1'}});
 process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?1:0)));});
}finally{try{await identity?.cleanup();}finally{await rm(directory,{recursive:true,force:true});}}
