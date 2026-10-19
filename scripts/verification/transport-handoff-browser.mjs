import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {startStaticServer} from './static-server.mjs';

const output='output/research/transport-handoff-2026-10-19/browser';
await fs.mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4399]});
let owned=null;
const report={scope:'Actual road publication and worker on controlled terrain; not a full-city or release test',passed:false,errors:[]};
try{
  owned=await chromium.launchServer({channel:'chrome',headless:true});
  const browser=await chromium.connect(owned.wsEndpoint()),page=await browser.newPage({viewport:{width:1000,height:700}});
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  const url=`http://127.0.0.1:${server.port}/tests/fixtures/transport-handoff.html`;
  await page.goto(url);
  await page.waitForFunction(()=>window.fixtureReady||window.fixtureError,{},{timeout:35000});
  assert.equal(await page.evaluate(()=>window.fixtureError??null),null);
  report.state=await page.evaluate(()=>JSON.parse(render_game_to_text()));
  assert.equal(report.state.ok,true);assert.equal(report.state.cases.length,3);assert.deepEqual(report.errors,[]);
  await page.screenshot({path:`${output}/replacement-roads.png`});
  report.releasedMemory=await page.evaluate(()=>releaseFixture());
  assert.deepEqual(report.releasedMemory,report.state.baseline);
  await closeOwnedBrowser(owned);owned=null;

  const child=spawn(process.execPath,[`${process.env.HOME}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,
    '--url',url,'--actions-json','{"steps":[{"buttons":[],"frames":120},{"buttons":["right"],"frames":8},{"buttons":[],"frames":8}]}',
    '--iterations','1','--pause-ms','100','--screenshot-dir',`${output}/skill-client`],{stdio:'inherit'});
  const timeout=setTimeout(()=>child.kill('SIGTERM'),45000);
  try{assert.equal(await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);}),0);}
  finally{clearTimeout(timeout);}
  report.skillState=JSON.parse(await fs.readFile(`${output}/skill-client/state-0.json`,'utf8'));
  assert.equal(report.skillState.ok,true);assert.ok(report.skillState.pan>0,'Prescribed input should move the verification camera');
  assert.ok(!(await fs.readdir(`${output}/skill-client`)).some(file=>file.startsWith('errors-')));
  report.passed=true;
}catch(error){report.failure=error.stack;throw error;}
finally{
  if(owned)await closeOwnedBrowser(owned);
  await server.close();
  await fs.writeFile(`${output}/receipt.json`,JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
