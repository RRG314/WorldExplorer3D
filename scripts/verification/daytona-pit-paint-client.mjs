import {startStaticServer} from './static-server.mjs';
import {spawn} from 'node:child_process';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';import {homedir} from 'node:os';import assert from 'node:assert/strict';
const out=process.env.WE3D_DAYTONA_PIT_PAINT_OUTPUT||'output/verification/daytona-pit-paint';await mkdir(dirname(out),{recursive:true});await mkdir(out);
const server=await startStaticServer({rootDir:process.cwd(),ports:[4398]});try{
 const child=spawn(process.execPath,[`${homedir()}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'--url',`http://127.0.0.1:${server.port}/tests/fixtures/daytona-pit-paint.html`,'--actions-json',JSON.stringify({steps:[{buttons:['right'],frames:1},{buttons:[],frames:2}]}),'--iterations','3','--pause-ms','100','--headless','false','--screenshot-dir',out],{stdio:'inherit'});
 assert.equal(await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);}),0);
 const states=await Promise.all([0,1,2].map(i=>readFile(`${out}/state-${i}.json`,'utf8').then(JSON.parse)));assert.deepEqual(states.map(s=>s.view),[1,2,0]);
 for(const s of states){assert.equal(s.glError,0);assert.ok(s.drawCalls<=180&&s.triangles<300000);assert.equal(s.pit.boxes,27);assert.equal(s.structures,26);assert.deepEqual(s.models,['road-bmw-m3-e92-race','road-porsche-911-carrera-4s']);}
 assert.equal((await readdir(out)).filter(f=>/^errors-\d+\.json$/.test(f)).length,0);
 await writeFile(out+'/report.json',JSON.stringify({passed:true,scope:'Controlled original pit paint, eight canopies and real BMW/Porsche scale; native gameplay evidence reused, final native visual remains separate',states},null,2));
}finally{await server.close();}
