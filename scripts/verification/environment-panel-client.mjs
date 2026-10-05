import {startStaticServer} from './static-server.mjs';
import {spawn} from 'node:child_process';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
export async function verifyEnvironmentPanelClient(){
 const out='output/verification/environment-panel-client';await mkdir(out,{recursive:true});
 const server=await startStaticServer({rootDir:process.cwd(),ports:[4398]});
 try{
  const child=spawn(process.execPath,[`${homedir()}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'--url',`http://127.0.0.1:${server.port}/tests/fixtures/environment-panel-client.html`,'--actions-json',JSON.stringify({steps:[{buttons:['right'],frames:1},{buttons:[],frames:2}]}),'--iterations','3','--pause-ms','100','--screenshot-dir',out],{stdio:'inherit'});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});assert.equal(code,0);
  const states=await Promise.all([0,1,2].map(i=>readFile(`${out}/state-${i}.json`,'utf8').then(JSON.parse)));
  assert.deepEqual(states.map(s=>s.phase),[1,2,0]);assert.equal(states[0].model.currentVelocityKph,null);assert.match(states[0].text,/temporarily unavailable/);assert.doesNotMatch(states[0].text,/current 0\.0 km/);
  assert.equal(states[1].model.hasGuidance,false);assert.match(states[1].text,/No marine guidance/);
  assert.match(states[2].text,/NOAA WAVEWATCH III via NSF Unidata/);assert.match(states[2].text,/HYCOM \/ FNMOC ESPC/);assert.match(states[2].text,/24\.2°C/);
  assert.equal((await readdir(out)).filter(f=>/^errors-\d+\.json$/.test(f)).length,0);
  await writeFile(`${out}/report.json`,JSON.stringify({passed:true,scope:'Prescribed browser client: actual marine renderer with controlled full, partial and absent source responses',phases:states.map(s=>s.phase)},null,2));
 }finally{await server.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await verifyEnvironmentPanelClient();
