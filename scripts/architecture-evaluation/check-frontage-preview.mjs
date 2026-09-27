import {startStaticServer} from '../verification/static-server.mjs';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4497,4498]});
try {
 const child=spawn(process.execPath,[`${process.env.HOME}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,
  '--url',`http://127.0.0.1:${server.port}/scripts/architecture-evaluation/frontage-preview.html`,
  '--click-selector','#target','--actions-json','{"steps":[{"buttons":[],"frames":1}]}','--iterations','1','--pause-ms','100',
  '--screenshot-dir','output/architecture-evaluation/frontage-preview'],{stdio:'inherit'});
 assert.equal(await new Promise(resolve=>child.once('exit',resolve)),0);
 const state=JSON.parse(await readFile('output/architecture-evaluation/frontage-preview/state-0.json','utf8'));
 assert.equal(state.checks,1);assert.equal(state.orderedResultsMatch,true);assert.ok(state.hitCount>0);
 console.log(JSON.stringify(state));
}finally{await server.close();}
