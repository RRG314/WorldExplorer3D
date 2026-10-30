import {startStaticServer} from './static-server.mjs';
import {spawn} from 'node:child_process';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';import {homedir} from 'node:os';import assert from 'node:assert/strict';
const out=process.env.WE3D_RACING_PAVEMENT_OUTPUT||'output/verification/racing-pavement-sections';await mkdir(dirname(out),{recursive:true});await mkdir(out);
const server=await startStaticServer({rootDir:process.cwd(),ports:[4398]});try{
 const child=spawn(process.execPath,[`${homedir()}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'--url',`http://127.0.0.1:${server.port}/tests/fixtures/racing-pavement-sections.html`,'--actions-json',JSON.stringify({steps:[{buttons:['up'],frames:60},{buttons:[],frames:2}]}),'--iterations','3','--pause-ms','100','--headless','false','--screenshot-dir',out],{stdio:'inherit'});
 assert.equal(await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);}),0);
 const states=await Promise.all([0,1,2].map(i=>readFile(`${out}/state-${i}.json`,'utf8').then(JSON.parse)));assert.ok(states[2].distance>states[0].distance&&states[2].distance>10);
 for(const s of states){assert.equal(s.assetId,'road-bmw-m3-e92-race');assert.equal(s.glError,0);assert.equal(s.barrierContacts,0);assert.ok(s.x>9&&Math.abs(s.roll)<.05&&s.gap<.025&&s.penetration<.001);}
 assert.equal((await readdir(out)).filter(f=>/^errors-\d+\.json$/.test(f)).length,0);
 await writeFile(out+'/report.json',JSON.stringify({passed:true,scope:'Controlled actual published bank/apron, licensed M3 mesh, event presentation and shared racing physics; native venue and real-time pacing remain separate',states},null,2));
}finally{await server.close();}
