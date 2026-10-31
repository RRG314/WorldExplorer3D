import {startStaticServer} from './static-server.mjs';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.WE3D_RALLY_OUTPUT||'output/verification/rally-stage',verifyExisting=process.argv.includes('--verify-existing');
const admission=process.env.WE3D_RALLY_ADMISSION==='1';
if(!verifyExisting)await mkdir(out);const server=verifyExisting?null:await startStaticServer({rootDir:process.cwd(),ports:[4398]});
try{
 if(!verifyExisting){
 const child=spawn(process.execPath,[`${homedir()}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'--url',`http://127.0.0.1:${server.port}/tests/fixtures/rally-stage.html${admission?'?source-admission=1':''}`,
  '--actions-json',JSON.stringify({steps:[{buttons:['right'],frames:1},{buttons:[],frames:2}]}),'--iterations',admission?'2':'4','--pause-ms','100','--headless','false','--screenshot-dir',out],{stdio:'inherit'});
 assert.equal(await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);}),0);
 }
 const states=await Promise.all((admission?[0,1]:[0,1,2,3]).map(i=>readFile(`${out}/state-${i}.json`,'utf8').then(JSON.parse)));
 if(admission){
  assert.deepEqual(states.map(s=>s.stage),[0,1]);assert.equal(states[1].phase,'complete');assert.ok(states[1].players.every(p=>p.finished));
  for(const s of states){assert.equal(s.admission.qualified,5);assert.deepEqual(s.admission.rejected,{});assert.equal(s.admission.sourcePath.length,5);assert.ok(s.admission.sourcePath[2].endsWith(':reverse'));assert.equal(s.progress.penaltyMs,0);}
 }else{
 assert.deepEqual(states.map(s=>s.stage),[0,1,2,3]);assert.equal(states[0].vehicleState.isAirborne,true);assert.ok(states[0].vehicleState.vy>0);
 assert.equal(states[1].vehicleState.isAirborne,false);assert.equal(states[1].landingSeen,true);assert.ok(states[1].condition<1);
 assert.equal(states[2].rally.recoveries,1);assert.equal(states[2].progress.penaltyMs,15000);assert.equal(states[2].condition,states[1].condition);assert.equal(states[2].vehicleState.speed,0);
 assert.equal(states[3].phase,'complete');assert.ok(states[3].players.every(p=>p.finished));
 const starts=states[3].players.map(p=>p.startAt).sort((a,b)=>a-b);assert.equal(starts[1]-starts[0],30000);
 }
 for(const s of states){assert.equal(s.glError,0);assert.equal(s.contacts,0);assert.equal(s.physicsVersion,'earth-rally-2026-10-31.1');assert.ok(s.calls<110&&s.triangles<220000);}
 assert.equal((await readdir(out)).filter(f=>/^errors-\d+\.json$/.test(f)).length,0);
 await writeFile(out+'/report.json',JSON.stringify({passed:true,reusedCapture:verifyExisting,scope:states[0].scope,states},null,2));
}finally{await server?.close();}
