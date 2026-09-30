import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {startStaticServer} from './static-server.mjs';
const output='output/architecture-evaluation/light-uniform-fixture';await mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4492]});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:640,height:400}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/light-uniform-parity.html`);
 await page.waitForFunction(()=>window.ready,{},{timeout:20000}).catch(e=>{throw Error(errors.join('\n')||String(e));});
 const result=await page.evaluate(()=>window.result);if(errors.length)throw Error(errors.join('\n'));
 await page.screenshot({path:output+'/scene.png'});await writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await server.close();}
