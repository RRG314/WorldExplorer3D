import {startStaticServer} from './static-server.mjs';import {spawn} from 'node:child_process';import {homedir} from 'node:os';import {dirname} from 'node:path';import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const circuit=process.env.WE3D_PIT_DISCIPLINE==='circuit';
const out=process.env.WE3D_OVAL_PIT_OUTPUT||'output/verification/oval-pit',verifyExisting=process.argv.includes('--verify-existing');if(!verifyExisting){await mkdir(dirname(out),{recursive:true});await mkdir(out);}const server=verifyExisting?null:await startStaticServer({rootDir:process.cwd(),ports:[4398]});
try{
 if(!verifyExisting){
 const child=spawn(process.execPath,[`${homedir()}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'--url',`http://127.0.0.1:${server.port}/tests/fixtures/oval-pit.html${circuit?'?discipline=circuit':''}`,'--actions-json',JSON.stringify({steps:[{buttons:['right'],frames:1},{buttons:[],frames:2}]}),'--iterations','3','--pause-ms','100','--headless','false','--screenshot-dir',out],{stdio:'inherit'});assert.equal(await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);}),0);
 }
 const states=await Promise.all([0,1,2].map(i=>readFile(`${out}/state-${i}.json`,'utf8').then(JSON.parse)));assert.deepEqual(states.map(s=>s.stage),[0,1,2]);assert.deepEqual(states.map(s=>s.pit.active),[true,true,false]);assert.ok(states[1].pit.nextGate>=9);assert.ok(states[2].gate>states[0].gate);
 // The already admitted M3 has 95,434 source triangles, up to four instances.
 // Allow its existing cabin/instruments (10k each) and this small road fixture.
 // This is a content ceiling, not native frame-pacing or release acceptance.
 for(const s of states){assert.equal(s.glError,0);assert.equal(s.contacts,0);assert.equal(s.penaltyMs,0);assert.equal(s.pit.visits,1);assert.equal(s.discipline,circuit?'circuit':'oval');assert.equal(s.draft,circuit?undefined:0);if(circuit)assert.equal(s.physicsVersion,'earth-circuit-pit-2026-10-30.1');assert.ok(s.drawCalls<=110&&s.triangles<=4*(95434+10000)+4000);}assert.equal((await readdir(out)).filter(f=>/^errors-\d+\.json$/.test(f)).length,0);
 await writeFile(out+'/report.json',JSON.stringify({passed:true,reusedCapture:verifyExisting,scope:'Controlled licensed-car pit entry, checkpoints and physical exit through the existing session; native venue acceptance remains separate',states},null,2));
}finally{await server?.close();}
