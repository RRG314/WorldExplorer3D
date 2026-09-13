import {spawnSync} from 'node:child_process';
const commands=[['--test','--test-concurrency=1','tests/street-coverage-current.test.mjs','tests/street-pavement-current.test.mjs','tests/street-publication-current.test.mjs','tests/road-interior-terrain-current.test.mjs','tests/mapped-ground-evidence-current.test.mjs'],['scripts/verification/street-quality.mjs'],['scripts/verification/source.mjs']];
for(const args of commands){const result=spawnSync(process.execPath,args,{stdio:'inherit',timeout:120000});if(result.error||result.status!==0){console.error(result.error||'Street check failed');process.exit(result.status||1);}}
console.log('CPU street checks passed. Complete the browser camera sweep and full-app city routes before release sign-off.');
