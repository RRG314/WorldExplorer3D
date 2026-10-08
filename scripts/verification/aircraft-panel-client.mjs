import {startStaticServer} from './static-server.mjs';
import {spawn} from 'node:child_process';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';
const out='output/verification/aircraft-panel-client';await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4398]});
try{
 const child=spawn(process.execPath,[`${homedir()}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'--url',`http://127.0.0.1:${server.port}/tests/fixtures/aircraft-panel-client.html`,'--actions-json',JSON.stringify({steps:[{buttons:['right'],frames:1},{buttons:[],frames:2}]}),'--iterations','3','--pause-ms','100','--screenshot-dir',out],{stdio:'inherit'});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});assert.equal(code,0);
 const states=await Promise.all([0,1,2].map(i=>readFile(`${out}/state-${i}.json`,'utf8').then(JSON.parse)));
 assert.deepEqual(states.map(s=>s.phase),[1,2,0]);
 for(const value of ['Speed unavailable','Heading unavailable','observation time unavailable'])assert.ok(states[0].text.includes(value));
 assert.doesNotMatch(states[0].text,/null kt|heading 0°|observed recently/);
 assert.match(states[1].text,/Showing labeled reference routes/);assert.match(states[1].text,/20% along route/);assert.match(states[1].text,/modeled reference position/);assert.doesNotMatch(states[1].text,/reported aircraft position/);
 assert.match(states[2].text,/ADSB.lol observation/);assert.match(states[2].text,/180 kt/);assert.match(states[2].text,/heading 45°/);
 assert.equal((await readdir(out)).filter(f=>/^errors-\d+\.json$/.test(f)).length,0);
 await writeFile(`${out}/report.json`,JSON.stringify({passed:true,scope:'Prescribed browser client: actual aircraft renderer with controlled complete, missing and reference data',phases:states.map(s=>s.phase)},null,2));
}finally{await server.close();}
