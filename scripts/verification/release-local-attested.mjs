import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';

// One sequential release matrix, using a disposable staging debug identity.
// The caller builds and commits first; this wrapper never modifies artifacts.
const directory=await fs.mkdtemp(path.join(tmpdir(),'we3d-release-attestation-'));
let identity;
try{
 identity=await stagingCaptureAttestation();
 const credential=path.join(directory,'attestation.json');
 await fs.writeFile(credential,JSON.stringify({projectId:'we3d-staging-20260712',appId:'1:524178734996:web:f59acbc9014f0e26f51981',expiresAt:new Date(Date.now()+12*60*60*1000).toISOString(),token:identity.token}),{mode:0o600});
 const environment={...process.env,WE3D_VERIFY_ROOT:process.env.WE3D_VERIFY_ROOT||'dist',WE3D_STAGING_APP_CHECK_FILE:credential,WE3D_VERIFY_HOSTED_PLACE_LOOKUP:'1'};
 const java='/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
 if(!environment.JAVA_HOME&&await fs.stat(java).catch(()=>null)){environment.JAVA_HOME=java;environment.PATH=path.join(java,'bin')+path.delimiter+environment.PATH;}
 const child=spawn(process.execPath,['scripts/verification/system-release.mjs','--run',...process.argv.slice(2)],{stdio:'inherit',env:environment});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?1:0)));});process.exitCode=code;
}finally{try{await identity?.cleanup();}finally{await fs.rm(directory,{recursive:true,force:true});}}
