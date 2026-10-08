import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {pathToFileURL} from 'node:url';

export async function verifyHudWeatherLayout(){
 const out='output/verification/hud-weather-layout';await mkdir(out,{recursive:true});
 const server=await startStaticServer({rootDir:process.cwd(),ports:[4496]});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={scope:'Actual app HUD markup/styles with controlled submarine depth and loading/unavailable/available weather; desktop layout and phone viewport, not a physical phone.',cases:[],errors:[]};
 try{
  const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  const html=(await readFile('app/index.html','utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  await page.setContent(html.replace('<head>',`<head><base href="http://127.0.0.1:${server.port}/app/">`),{waitUntil:'load'});
  await page.evaluate(async()=>{const hud=document.getElementById('hud');document.body.replaceChildren(hud);hud.style.display='block';document.getElementById('speedUnitLabel').textContent='KTS';document.getElementById('limitLabel').textContent='SIM DEPTH';document.getElementById('limit').textContent='1000M';document.getElementById('weatherPanel').style.display='block';await document.fonts.ready;});
  const states=[['loading','🌤 Loading live weather','Fetching local conditions'],['unavailable','Weather unavailable','No current model coverage'],['available','🌧 Heavy rain • 69°F','46% humidity • Wind 10 mph NW']];
  for(const width of[1440,1024,390]){
   await page.setViewportSize({width,height:844});
   for(const [state,line,meta] of states){
    const result=await page.evaluate(({line,meta})=>{
     document.getElementById('weatherLine').textContent=line;document.getElementById('weatherMetaLine').textContent=meta;
     const box=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
     const hud=box(document.getElementById('hudBox')),weather=document.getElementById('weatherLine');
     const visible=getComputedStyle(weather).display!=='none';
     const clipped=[];
     if(visible)for(const id of['weatherLine','weatherMetaLine','hudSpeedBlock']){
      const node=document.getElementById(id),bounds=box(node),walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text;
      while(text=walker.nextNode())if(text.textContent.trim()){
       const range=document.createRange();range.selectNodeContents(text);
       for(const r of range.getClientRects())if(r.left<bounds.x-1||r.right>bounds.right+1||r.top<bounds.y-1||r.bottom>bounds.bottom+1)clipped.push({id,text:text.textContent});
      }
     }
     return{hud,visible,clipped};
    },{line,meta});
    assert.equal(result.visible,width>390);assert.deepEqual(result.clipped,[],`${width}px ${state}: HUD text is clipped`);
    assert.ok(result.hud.right<=width&&result.hud.x>=0);report.cases.push({width,state,...result});
    await page.screenshot({path:`${out}/${width}-${state}.png`});
   }
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.failure=String(error);throw error;}
 finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
 console.log(JSON.stringify({passed:report.passed,hudWeatherCases:report.cases.length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await verifyHudWeatherLayout();
