import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const output='output/verification/spotlight-pool';
await mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4439,4440]});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:720,height:400}}),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/spotlight-pool.html`);
 await page.waitForFunction(()=>window.ready===true,null,{timeout:30000});
 const results=await page.evaluate(()=>window.results);
 await page.screenshot({path:`${output}/lights.png`});
 await writeFile(`${output}/report.json`,JSON.stringify({results,errors},null,2));
 assert.deepEqual(errors,[]);assert.equal(results.length,4);
 assert.equal(new Set(results.map(r=>r.brightness)).size,4,'Every active-light count must change the rendered illumination');
 for(const result of results){assert.deepEqual(result.errors,[0,0]);assert.ok(result.maxDifference<=2,JSON.stringify(result));}
 console.log(JSON.stringify({ok:true,scope:'fixed and variable spotlight pool pixel parity',results}));
}finally{await browser.close();await server.close();}
