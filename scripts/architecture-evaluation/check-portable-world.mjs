import {startStaticServer} from '../verification/static-server.mjs';
import {spawn} from 'node:child_process';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4495,4496]});
try {
 const child=spawn(process.execPath,[`${process.env.HOME}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,
  '--url',`http://127.0.0.1:${server.port}/scripts/architecture-evaluation/portable-world-preview.html`,
  '--actions-json','{"steps":[{"buttons":[],"frames":1}]}','--iterations','1','--pause-ms','1000',
  '--screenshot-dir','output/architecture-evaluation/portable-world-preview'],{stdio:'inherit'});
 process.exitCode=await new Promise(resolve=>child.once('exit',resolve));
}finally{await server.close();}
