import {mkdir} from 'node:fs/promises';
import {prepareBackendEmulatorParameters} from './backend-emulator-parameters.mjs';
import {runLoggedStep} from './run-logged-step.mjs';
await mkdir('output/verification/environment-data',{recursive:true});
const cleanup=prepareBackendEmulatorParameters();
try{
 const result=await runLoggedStep(['firebase','emulators:exec','--non-interactive','--only','auth,firestore,functions','--project','we3d-staging-20260712','node scripts/verification/environment-data-current.mjs'],{cwd:process.cwd(),env:process.env,logPath:'output/verification/environment-data/emulators.log',timeoutMs:600000});
 console.log(JSON.stringify({ok:result.ok,exitCode:result.status}));if(!result.ok)process.exitCode=1;
}finally{cleanup();}
