import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const root='output/architecture-evaluation/terrain-weight-component-parity';await mkdir(root,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4494]});let browser;const rows=[],errors=[];
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:640,height:480}});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/terrain-weight-parity.html`);await page.waitForFunction(()=>window.ready,{timeout:20000});
 for(const position of [[20,40,50],[30,80,130],[0,240,5]])for(const imagery of [0,1]){
  const row=await page.evaluate(options=>window.checkCase(options),{position,imagery,cold:imagery});rows.push(row);await page.screenshot({path:`${root}/${rows.length}.png`});
  assert.ok(row.colors>100);assert.equal(row.changed,0,'Filtered terrain pixels changed');assert.deepEqual(errors,[]);
 }
}finally{await writeFile(root+'/report.json',JSON.stringify({rows,errors},null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(rows));
