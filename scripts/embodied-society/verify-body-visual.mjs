import {spawn} from 'node:child_process';
import {startStaticServer} from '../verification/static-server.mjs';
import os from 'node:os';import path from 'node:path';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4499]});
let child;
try {
  child=spawn(process.execPath,[path.join(os.homedir(),'.codex/skills/develop-web-game/scripts/web_game_playwright_client.js'),
    '--url',`http://127.0.0.1:${server.port}/tests/fixtures/embodied-society/body.html`,
    '--click-selector','#ready','--iterations','1','--pause-ms','100',
    '--screenshot-dir','output/verification/embodied-society-body',
    '--actions-json',JSON.stringify({steps:[{buttons:['up'],frames:60},{buttons:[],frames:2}]})],{stdio:'inherit'});
  const timer=setTimeout(()=>child.kill('SIGTERM'),45000);
  try {const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal?1:code));});if(code!==0)throw new Error(`Visual check failed (${code}).`);}
  finally {clearTimeout(timer);}
} finally {await server.close();}
