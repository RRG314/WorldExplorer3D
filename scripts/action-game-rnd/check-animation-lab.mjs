import {startStaticServer} from '../verification/static-server.mjs';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4497,4498]});
try {
 const child=spawn(process.execPath,[`${process.env.HOME}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,
  '--url',`http://127.0.0.1:${server.port}/scripts/action-game-rnd/animation-lab.html`,
  '--click-selector',process.env.ANIMATION_ACTION || '#action','--actions-json','{"steps":[{"buttons":[],"frames":1}]}','--iterations','1','--pause-ms','150',
  '--screenshot-dir',`output/action-game-rnd/animation-lab${process.env.ANIMATION_ACTION ? '-'+process.env.ANIMATION_ACTION.slice(1) : ''}`],{stdio:'inherit'});
 assert.equal(await new Promise(resolve=>child.once('exit',resolve)),0);
 const state=JSON.parse(await readFile(`output/action-game-rnd/animation-lab${process.env.ANIMATION_ACTION ? '-'+process.env.ANIMATION_ACTION.slice(1) : ''}/state-0.json`,'utf8'));
 assert.equal(state.ready,true);assert.equal(state.animation.length,2);assert.ok(state.animation.every(x=>x.upperBoneCount>10));
 console.log(JSON.stringify(state));
}finally{await server.close();}
