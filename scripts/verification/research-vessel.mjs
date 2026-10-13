import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const out=process.env.WE3D_VESSEL_OUTPUT||'output/verification/research-vessel';await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4485]});let browser,page;const report={ok:false,errors:[]};
try{
 browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${server.port}/scripts/verification/fixtures/research-vessel.html`);await page.waitForFunction(()=>globalThis.fixture);
 await page.screenshot({path:`${out}/overview.png`});
 report.navigation=await page.evaluate(()=>({ms:fixture.navigationMs,stats:fixture.nav.stats,render:fixture.renderer.info.render,pose:fixture.pose,samples:[[0,-34],[6,-24.5],[6,-28],[0,-30],[-3.1,-22],[-3.1,-19]].map(([x,z])=>({x,z,support:fixture.nav.support(x,z,2,5,1),blocked:fixture.nav.blocked(x,z,.3,fixture.nav.support(x,z,2,5,1)??2)}))}));
 await page.keyboard.press('v');await page.keyboard.down('w');await page.waitForTimeout(1300);await page.keyboard.up('w');await page.screenshot({path:`${out}/deck.png`});
 await page.evaluate(()=>{fixture.pose={x:6,y:fixture.nav.support(6,-24.5,2,1,1),z:-24.5,yaw:0};});await page.screenshot({path:`${out}/lab.png`});report.ok=report.errors.length===0;
}catch(error){report.error=String(error.stack||error);await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(report));
