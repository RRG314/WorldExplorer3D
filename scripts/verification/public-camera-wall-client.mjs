import {startStaticServer} from './static-server.mjs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {homedir} from 'node:os';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4398]});
try{
 const child=spawn(process.execPath,[`${homedir()}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'--url',`http://127.0.0.1:${server.port}/tests/fixtures/public-camera-wall-client.html`,'--click-selector','#launch','--actions-json',JSON.stringify({steps:[{buttons:[],frames:18},{buttons:[],frames:4}]}),'--iterations','2','--pause-ms','250','--screenshot-dir',`output/verification/product-plan/public-camera-wall-client`],{stdio:'inherit'});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});assert.equal(code,0);
}finally{await server.close()}
