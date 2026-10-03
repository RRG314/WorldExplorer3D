import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {startStaticServer} from './static-server.mjs';
import {runLoggedStep} from './run-logged-step.mjs';

// Source fixtures deliberately supplement (never replace) packaged journey gates.
const journeys={
 save:['discovery-save-consistency'],
 swimming:['swimming-current','swimming-shore'],
 'swimming-earth':['swimming-earth'],
 deck:['research-deck-current'],
 navigation:['space-navigation-presentation-current'],
 geology:['planetary-art-current'],
 district:['earth-district-current'],
 activities:['earth-district-current'],
 games:['earth-district-current'],
 streets:['earth-district-current']
};
const id=process.argv[2];assert.ok(Object.hasOwn(journeys,id),'Choose a registered product journey');
const out='output/verification/product-plan/release-foundations';await mkdir(out,{recursive:true});
const environment={...process.env};
for(const key of ['WE3D_VERIFY_ROOT','WE3D_VERIFY_BASE_URL','WE3D_STREET_REFERENCE','WE3D_ACTIVITY_ACCEPTANCE','WE3D_ACTIVITY_GAMES','WE3D_DISTRICT_INTERIOR_ONLY'])delete environment[key];
environment.WE3D_DISTRICT_OUT=`${out}/${id}`;
if(id==='streets')environment.WE3D_STREET_REFERENCE='1';
if(['activities','games'].includes(id))environment.WE3D_ACTIVITY_ACCEPTANCE='1';
if(id==='games')environment.WE3D_ACTIVITY_GAMES='1';
const server=['swimming','navigation','geology'].includes(id)?await startStaticServer({rootDir:process.cwd(),ports:[4398]}):null;
if(server)environment.WE3D_VERIFY_BASE_URL=`http://127.0.0.1:${server.port}`;
try{for(const script of journeys[id]){const result=await runLoggedStep([process.execPath,`scripts/verification/${script}.mjs`],{cwd:process.cwd(),env:environment,logPath:`${out}/${id}-${script}.log`,timeoutMs:480000});if(!result.ok){process.exitCode=1;break;}}}finally{await server?.close();}
