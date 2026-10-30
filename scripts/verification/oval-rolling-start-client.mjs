import {startStaticServer} from './static-server.mjs';import {spawn} from 'node:child_process';import {homedir} from 'node:os';import {dirname} from 'node:path';import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const out=process.env.WE3D_OVAL_FORMATION_OUTPUT||'output/verification/oval-formation';await mkdir(dirname(out),{recursive:true});await mkdir(out);const server=await startStaticServer({rootDir:process.cwd(),ports:[4398]});
try{
 const child=spawn(process.execPath,[`${homedir()}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'--url',`http://127.0.0.1:${server.port}/tests/fixtures/oval-rolling-start.html`,'--actions-json',JSON.stringify({steps:[{buttons:['up'],frames:60},{buttons:[],frames:2}]}),'--iterations','5','--pause-ms','100','--headless','false','--screenshot-dir',out],{stdio:'inherit'});
 assert.equal(await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);}),0);
 const states=await Promise.all([0,1,2,3,4].map(i=>readFile(`${out}/state-${i}.json`,'utf8').then(JSON.parse)));assert.deepEqual(states.map(s=>s.phase),['countdown','countdown','countdown','running','running']);
 for(const s of states){assert.equal(s.glError,0);assert.equal(s.players.length,4);assert.equal(s.raceControl.start,'rolling');assert.ok(s.players.every(p=>p.speed>25&&p.contacts===0));}
 assert.ok(Math.hypot(states[2].players[0].x-states[0].players[0].x,states[2].players[0].z-states[0].players[0].z)>17);
 assert.equal((await readdir(out)).filter(f=>/^errors-\d+\.json$/.test(f)).length,0);await writeFile(out+'/report.json',JSON.stringify({passed:true,scope:'Controlled moving four-car formation and transition to green through the existing session; native venue and full oval discipline remain separate',states},null,2));
}finally{await server.close();}
