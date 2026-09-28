import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const root=new URL('../../',import.meta.url);
const routes=new Map([['/','scripts/architecture-evaluation/service-lifecycle.html'],['/app/js/platform/service-registry.js','app/js/platform/service-registry.js']]);
const server=http.createServer(async(req,res)=>{const file=routes.get(req.url);if(!file){res.writeHead(404);res.end();return;}try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html':'text/javascript');res.end(await readFile(new URL(file,root)));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let child;try{
 const args=[`${process.env.HOME}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'--url',`http://127.0.0.1:${server.address().port}/`,'--click-selector','#run','--actions-json',JSON.stringify({steps:[{buttons:[],frames:2}]}),'--iterations','1','--pause-ms','100','--screenshot-dir','docs/architecture-evaluation/evidence/service-browser'];
 child=spawn(process.execPath,args,{cwd:root,stdio:'inherit'});
 const timer=setTimeout(()=>child.kill('SIGTERM'),30000);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});clearTimeout(timer);
 if(code!==0)throw Error(`Browser client exited ${code}`);
 const state=JSON.parse(await readFile(new URL('docs/architecture-evaluation/evidence/service-browser/state-0.json',root),'utf8'));
 if(state.status!=='passed')throw Error('Browser lifecycle did not pass');
 console.log(JSON.stringify({ok:true,evidence:'browser-component',state}));
}finally{child?.kill();await new Promise(resolve=>server.close(resolve));}
