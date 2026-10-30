import {startStaticServer} from './static-server.mjs';
import {spawn} from 'node:child_process';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';import {homedir} from 'node:os';import assert from 'node:assert/strict';
const out=process.env.WE3D_DAYTONA_PIT_CANOPIES_OUTPUT||'output/verification/daytona-pit-canopies',verifyExisting=process.argv.includes('--verify-existing');if(!verifyExisting){await mkdir(dirname(out),{recursive:true});await mkdir(out);}
const server=verifyExisting?null:await startStaticServer({rootDir:process.cwd(),ports:[4398]});try{
 if(!verifyExisting){
 const child=spawn(process.execPath,[`${homedir()}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'--url',`http://127.0.0.1:${server.port}/tests/fixtures/daytona-pit-canopies.html`,'--actions-json',JSON.stringify({steps:[{buttons:['right'],frames:1},{buttons:[],frames:2}]}),'--iterations','3','--pause-ms','100','--headless','false','--screenshot-dir',out],{stdio:'inherit'});
 assert.equal(await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);}),0);
 }
 const states=await Promise.all([0,1,2].map(i=>readFile(`${out}/state-${i}.json`,'utf8').then(JSON.parse)));assert.deepEqual(states.map(s=>s.view),[1,2,0]);
 // Seven near meshes per mapped structure, plus sixteen for the shared car
 // and controlled ground. This fixture is not the native moving-scene budget.
 for(const s of states){assert.equal(s.glError,0);assert.ok(s.drawCalls<=s.garages.length*7+16&&s.triangles<105000+s.garages.length*7000);assert.equal(s.garages.length,13);assert.equal(s.garages.filter(g=>g.kind==='garage').length,3);assert.equal(s.garages.filter(g=>g.openCanopy).length,4);assert.ok(s.garages.every(g=>g.lodLevels===3));}
 assert.equal((await readdir(out)).filter(f=>/^errors-\d+\.json$/.test(f)).length,0);
 await writeFile(out+'/report.json',JSON.stringify({passed:true,reusedCapture:verifyExisting,scope:'Four mapped open pit canopies among thirteen paddock exteriors, component detail and shared real-car scale; controlled ground, native venue acceptance remains separate',states},null,2));
}finally{await server?.close();}
