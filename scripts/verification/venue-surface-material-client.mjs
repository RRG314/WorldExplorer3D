import {startStaticServer} from './static-server.mjs';
import {spawn} from 'node:child_process';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';

const out=process.env.WE3D_VENUE_MATERIAL_OUTPUT||'output/verification/venue-surface-material';
await mkdir(out);
const server=await startStaticServer({rootDir:process.cwd(),ports:[4398]});
try{
 const child=spawn(process.execPath,[`${homedir()}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,
  '--url',`http://127.0.0.1:${server.port}/tests/fixtures/venue-surface-material-presentation.html`,
  '--actions-json',JSON.stringify({steps:[{buttons:['right'],frames:1},{buttons:[],frames:2}]}),
  '--iterations','2','--pause-ms','100','--headless','false','--screenshot-dir',out],{stdio:'inherit'});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0);
 const states=await Promise.all([0,1].map(i=>readFile(`${out}/state-${i}.json`,'utf8').then(JSON.parse)));
 assert.deepEqual(states.map(s=>s.enabled),[false,true]);
 for(const state of states){assert.equal(state.glError,0);assert.equal(state.programs,1);}
 assert.equal((await readdir(out)).filter(f=>/^errors-\d+\.json$/.test(f)).length,0);
 await writeFile(`${out}/report.json`,JSON.stringify({passed:true,
  scope:'GPU source-material render with controlled textures; venue visual acceptance is separate',states},null,2));
}finally{await server.close();}
