import {prepareBackendEmulatorParameters} from './backend-emulator-parameters.mjs';
import {runLoggedStep} from './run-logged-step.mjs';
const attached=!!process.env.FIRESTORE_EMULATOR_HOST&&!!process.env.FIREBASE_AUTH_EMULATOR_HOST;
const cleanup=attached?()=>{}:prepareBackendEmulatorParameters();
try{
 const result=await runLoggedStep(attached?[process.execPath,'scripts/verification/place-lookup-current.mjs']:['firebase','emulators:exec','--non-interactive','--only','auth,firestore,functions','--project','we3d-staging-20260712','node scripts/verification/place-lookup-current.mjs'],{cwd:process.cwd(),env:process.env,logPath:'output/verification/product-plan/place-lookup-emulators.log',timeoutMs:600000});
 console.log(JSON.stringify({ok:result.ok,exitCode:result.exitCode}));if(!result.ok)process.exitCode=1;
}finally{cleanup();}
